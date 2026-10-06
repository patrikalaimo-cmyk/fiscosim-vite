import { spawn } from 'node:child_process'
import { callLocalAI } from '../lib/ollama.js'

const ONLINE_MODEL = 'claude-haiku-4-5-20251001'

function nowIso() {
  return new Date().toISOString()
}

function toMs(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
}

function normalizeMessage(value) {
  return String(value || '').trim() || 'Nessun dettaglio disponibile'
}

function baseResult(kind) {
  return {
    kind,
    configured: false,
    state: 'not_configured',
    label: kind === 'local' ? 'IA locale non configurata' : 'IA online non configurata',
    message: '',
    reason: '',
    nextAction: '',
    responseTimeMs: null,
    lastCheckedAt: nowIso(),
    canStart: kind === 'local',
  }
}

function buildLocalConfiguredState() {
  return {
    baseUrl: String(process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''),
    model: String(process.env.OLLAMA_MODEL || process.env.VITE_OLLAMA_MODEL || 'mistral').trim() || 'mistral',
  }
}

function buildOnlineConfiguredState() {
  const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim()
  return {
    apiKeyPresent: Boolean(apiKey),
    apiKeyPrefix: apiKey ? `${apiKey.slice(0, 6)}...` : '',
  }
}

function outcome(kind, state, message, reason, nextAction, extra = {}) {
  const configured = state !== 'not_configured'
  const labels = {
    local: {
      not_configured: 'IA locale non configurata',
      configured_stopped: 'IA locale configurata ma non avviata',
      starting: 'IA locale in avvio',
      active_responding: 'IA locale attiva e funzionante',
      active_not_responding: 'IA locale attiva ma non risponde',
      timeout_error: 'IA locale in timeout o errore',
      degraded_slow: 'IA locale attiva ma lenta',
    },
    online: {
      not_configured: 'IA online non configurata',
      configured_stopped: 'IA online configurata ma non risponde',
      starting: 'IA online in avvio',
      active_responding: 'IA online attiva e funzionante',
      active_not_responding: 'IA online attiva ma non risponde',
      timeout_error: 'IA online in timeout o errore',
      degraded_slow: 'IA online attiva ma lenta',
    },
  }

  return {
    kind,
    configured,
    state,
    label: labels[kind]?.[state] || labels[kind]?.not_configured || 'IA non disponibile',
    message: normalizeMessage(message),
    reason: normalizeMessage(reason),
    nextAction: normalizeMessage(nextAction),
    responseTimeMs: extra.responseTimeMs ?? null,
    lastCheckedAt: nowIso(),
    canStart: kind === 'local',
    ...extra,
  }
}

function classifyLocalError(error, config) {
  const msg = normalizeMessage(error?.message || error)
  if (/aborted|timeout/i.test(msg)) {
    return outcome(
      'local',
      'timeout_error',
      'La IA locale non ha risposto in tempo.',
      'Timeout durante la chiamata locale.',
      'Riprova oppure avvia Ollama e controlla il carico del sistema.',
      { ...config }
    )
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(msg)) {
    return outcome(
      'local',
      'configured_stopped',
      'IA locale configurata ma non avviata.',
      'Il servizio locale non raggiunge la porta configurata.',
      'Avvia Ollama oppure verifica il runtime locale e la porta di ascolto.',
      { ...config }
    )
  }
  if (/model|not found|404/i.test(msg)) {
    return outcome(
      'local',
      'configured_stopped',
      'IA locale raggiungibile ma modello non disponibile.',
      'Modello non scaricato o non coerente con la configurazione.',
      `Scarica il modello locale impostato (${config.model || 'mistral'}) e ritenta.`,
      { ...config }
    )
  }
  return outcome(
    'local',
    'timeout_error',
    'IA locale non valida o non rispondente.',
    msg,
    'Riprova il test o verifica i log del runtime locale.',
    { ...config }
  )
}

function classifyOnlineError(error, config) {
  const msg = normalizeMessage(error?.message || error)
  if (/aborted|timeout/i.test(msg)) {
    return outcome(
      'online',
      'timeout_error',
      'IA online non ha risposto in tempo.',
      'Timeout durante la chiamata al provider online.',
      'Riprova oppure verifica la connettivita e il provider.',
      { ...config }
    )
  }
  if (/401|403|unauthorized|forbidden|api key/i.test(msg)) {
    return outcome(
      'online',
      'not_configured',
      'IA online configurata in modo non valido.',
      'Chiave API mancante o non valida.',
      'Controlla ANTHROPIC_API_KEY e la configurazione del provider.',
      { ...config }
    )
  }
  if (/ENOTFOUND|fetch failed|network|ECONNREFUSED/i.test(msg)) {
    return outcome(
      'online',
      'configured_stopped',
      'IA online configurata ma non raggiungibile.',
      'Problema di rete o endpoint non accessibile.',
      'Verifica rete, proxy e accesso al provider online.',
      { ...config }
    )
  }
  return outcome(
    'online',
    'timeout_error',
    'IA online non risponde correttamente.',
    msg,
    'Riprova o controlla la configurazione del provider online.',
    { ...config }
  )
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`TIMEOUT_${timeoutMs}`)), timeoutMs)
  const startedAt = Date.now()
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    const text = await res.text().catch(() => '')
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }
    return { res, data, text, durationMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timeout)
  }
}

export async function probeLocalAi({ timeoutMs = 7000 } = {}) {
  const cfg = buildLocalConfiguredState()
  if (!cfg.baseUrl) {
    return outcome(
      'local',
      'not_configured',
      'IA locale non configurata.',
      'Manca la base URL locale.',
      'Imposta OLLAMA_BASE_URL oppure abilita il runtime locale.',
      { ...cfg }
    )
  }

  const startedAt = Date.now()
  try {
    const text = await callLocalAI('Rispondi solo: OK', {
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      timeoutMs,
    })
    const durationMs = Date.now() - startedAt
    const hasText = Boolean(String(text || '').trim())
    const state = !hasText
      ? 'active_not_responding'
      : durationMs > 6000
        ? 'degraded_slow'
        : 'active_responding'
    return outcome(
      'local',
      state,
      state === 'degraded_slow'
        ? `IA locale attiva ma lenta (${durationMs} ms).`
        : state === 'active_not_responding'
          ? 'IA locale ha risposto senza testo utile.'
          : `IA locale attiva e funzionante (${durationMs} ms).`,
      `Test reale eseguito con modello ${cfg.model} su ${cfg.baseUrl}.`,
      state === 'degraded_slow'
        ? 'Il motore risponde, ma conviene verificare il carico o la latenza.'
        : state === 'active_not_responding'
          ? 'Ritesta o verifica il comportamento del modello locale.'
          : 'Nessuna azione richiesta.',
      { ...cfg, responseTimeMs: durationMs, rawResponse: text }
    )
  } catch (error) {
    return classifyLocalError(error, cfg)
  }
}

export async function startLocalAi({ timeoutMs = 7000, allowSpawn = false } = {}) {
  const cfg = buildLocalConfiguredState()
  if (process.env.OLLAMA_ENABLED === 'false') {
    return outcome(
      'local',
      'not_configured',
      'Avvio locale disabilitato da configurazione.',
      'OLLAMA_ENABLED=false.',
      'Rimuovi il blocco di configurazione oppure abilita il runtime locale.',
      { ...cfg }
    )
  }

  if (!allowSpawn) {
    return outcome(
      'local',
      'configured_stopped',
      'Avvio automatico non disponibile in questo ambiente.',
      'Spawn di processi disabilitato sul backend corrente.',
      'Avvia Ollama manualmente sul computer locale e ritenta il test.',
      { ...cfg }
    )
  }

  try {
    const command = String(process.env.OLLAMA_COMMAND || 'ollama').trim() || 'ollama'
    const child = spawn(command, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    child.unref?.()
  } catch (error) {
    return outcome(
      'local',
      'configured_stopped',
      'Avvio automatico non riuscito.',
      normalizeMessage(error?.message || error),
      'Avvia Ollama manualmente e ritenta il test.',
      { ...cfg }
    )
  }

  await new Promise((resolve) => setTimeout(resolve, 1500))
  const probe = await probeLocalAi({ timeoutMs })
  if (probe.state === 'active_responding' || probe.state === 'degraded_slow') {
    return {
      ...probe,
      state: probe.state,
      label: probe.label,
      message: probe.message,
    }
  }

  return outcome(
    'local',
    'starting',
    'Avvio locale richiesto, attendi qualche secondo.',
    'Processo di avvio inviato.',
    'Riprova il test fra 3-5 secondi.',
    { ...cfg }
  )
}

export async function probeOnlineAi({ timeoutMs = 9000 } = {}) {
  const cfg = buildOnlineConfiguredState()
  if (!cfg.apiKeyPresent) {
    return outcome(
      'online',
      'not_configured',
      'IA online non configurata.',
      'Manca ANTHROPIC_API_KEY.',
      'Imposta la chiave API del provider online.',
      { ...cfg }
    )
  }

  const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim()
  const startedAt = Date.now()
  try {
    const payload = {
      model: ONLINE_MODEL,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Rispondi solo: OK' }],
    }
    const { res, data, durationMs } = await fetchJsonWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      },
      timeoutMs
    )

    if (!res.ok) {
      const msg = data?.error?.message || data?.error || `HTTP ${res.status}`
      throw new Error(msg)
    }

    const text = String(data?.content?.[0]?.text || '').trim()
    const totalMs = durationMs || Date.now() - startedAt
    const hasText = Boolean(text)
    const state = !hasText
      ? 'active_not_responding'
      : totalMs > 7000
        ? 'degraded_slow'
        : 'active_responding'
    return outcome(
      'online',
      state,
      state === 'degraded_slow'
        ? `IA online attiva ma lenta (${totalMs} ms).`
        : state === 'active_not_responding'
          ? 'IA online ha risposto senza testo utile.'
          : `IA online attiva e funzionante (${totalMs} ms).`,
      text ? 'Test reale eseguito con provider online.' : 'Risposta ricevuta ma senza testo utile.',
      state === 'degraded_slow'
        ? 'Ritesta piu tardi o controlla la latenza di rete.'
        : state === 'active_not_responding'
          ? 'Controlla il formato della risposta o ritenta il test.'
          : 'Nessuna azione richiesta.',
      { ...cfg, responseTimeMs: totalMs, rawResponse: text }
    )
  } catch (error) {
    return classifyOnlineError(error, cfg)
  }
}

export async function runAiDiagnostics({ scope = 'all' } = {}) {
  const requested = String(scope || 'all').trim().toLowerCase()
  const out = {
    ok: true,
    serverTime: nowIso(),
    local: null,
    online: null,
  }

  if (requested === 'local' || requested === 'all') {
    out.local = await probeLocalAi()
  }
  if (requested === 'online' || requested === 'all') {
    out.online = await probeOnlineAi()
  }

  return out
}
