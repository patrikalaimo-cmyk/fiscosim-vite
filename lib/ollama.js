/**
 * Client minimale per Ollama (AI locale).
 * Endpoint: POST /api/generate — vedi https://github.com/ollama/ollama/blob/main/docs/api.md
 *
 * Variabili ambiente (opzionali):
 * - OLLAMA_BASE_URL (default http://localhost:11434)
 * - OLLAMA_MODEL (default mistral)
 */

const DEFAULT_BASE = 'http://localhost:11434'
const DEFAULT_MODEL = 'mistral'

/**
 * Chiama Ollama in locale e restituisce il testo generato (campo `response` del JSON).
 *
 * @param {string} prompt
 * @param {{ baseUrl?: string, model?: string }} [options]
 * @returns {Promise<string>}
 */
export async function callLocalAI(prompt, options = {}) {
  const baseUrl = (options.baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
  const model = options.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL
  const url = `${baseUrl}/api/generate`
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, Math.round(options.timeoutMs)) : 0
  const externalSignal = options.signal || null
  const controller = timeoutMs > 0 ? new AbortController() : null
  const signal = externalSignal || controller?.signal
  let timeoutHandle = null

  const p = prompt == null ? '' : String(prompt)

  console.log('OLLAMA_CALL_START', { model, url, promptLength: p.length })

  let res
  try {
    if (controller && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => controller.abort(new Error(`OLLAMA_TIMEOUT_${timeoutMs}`)), timeoutMs)
    }
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: p,
        stream: false,
      }),
      signal,
    })
  } catch (e) {
    console.log('OLLAMA_CALL_ERROR', { model, phase: 'network', message: e?.message || String(e) })
    throw e
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }

  const rawText = await res.text().catch(() => '')

  if (!res.ok) {
    let detail = rawText.slice(0, 500)
    try {
      const errJson = JSON.parse(rawText)
      if (typeof errJson?.error === 'string') detail = errJson.error
    } catch {
      /* body non JSON */
    }
    console.log('OLLAMA_CALL_ERROR', {
      model,
      phase: 'http',
      status: res.status,
      bodyPreview: detail,
    })
    const hint =
      res.status === 404 || /not found/i.test(detail)
        ? ` Modello assente: ollama pull ${model}`
        : res.status === 500 && /context|memory|VRAM|cuda/i.test(detail)
          ? ' Possibile prompt troppo lungo o memoria GPU insufficiente.'
          : ''
    throw new Error(`Ollama HTTP ${res.status}: ${detail}${hint}`)
  }

  let data
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch (e) {
    console.log('OLLAMA_CALL_ERROR', { model, phase: 'json', message: e?.message || String(e) })
    throw e
  }

  const text = typeof data?.response === 'string' ? data.response : ''
  console.log('OLLAMA_CALL_SUCCESS', { model, responseLength: text.length, done: data?.done === true })

  return text
}
