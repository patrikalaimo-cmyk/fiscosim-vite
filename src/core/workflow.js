/**
 * core/workflow.js — ORCHESTRATOR FiscoSim v6
 *
 * REGOLA ARCHITETTURALE:
 * I moduli NON comunicano direttamente tra loro.
 * Qualsiasi interazione cross-modulo passa da qui.
 *
 * Il Document Hub gestisce solo file fisici.
 * La logica business (es. IVA→F24, DocHub→Contabilità) è qui.
 *
 * Pattern duale AI ON/OFF:
 * - AI ON  → Claude Haiku analizza, l'operatore conferma
 * - AI OFF → parsing deterministico / form manuale
 * Il toggle viene da impostazioni_studio.ai_enabled (Supabase)
 *
 * TEST MODE:
 * - Nessuna chiamata API reale (mock responses)
 * - Nessuna email inviata
 * - Nessuna scrittura su Supabase per operazioni "pericolose"
 * - Badge 🧪 visibile nell'interfaccia
 */

import { sb } from '../lib/supabase'

// ─── AI SETTINGS ─────────────────────────────────────────────────

let _aiEnabled = null
let _testMode  = null

export async function getAIEnabled() {
  if (_aiEnabled !== null) return _aiEnabled
  try {
    const { data } = await sb
      .from('impostazioni_studio')
      .select('valore')
      .eq('chiave', 'ai_enabled')
    // Default true se la riga non esiste
    _aiEnabled = !Array.isArray(data) || data.length === 0 || data[0]?.valore !== 'false'
  } catch {
    _aiEnabled = true
  }
  return _aiEnabled
}

export async function getTestMode() {
  if (_testMode !== null) return _testMode
  try {
    // Tabella key-value: cerca la riga con chiave='test_mode'
    const { data } = await sb
      .from('impostazioni_studio')
      .select('valore')
      .eq('chiave', 'test_mode')
    _testMode = Array.isArray(data) && data[0]?.valore === 'true'
  } catch {
    _testMode = false
  }
  return _testMode
}

export function invalidateAICache() {
  _aiEnabled = null
  _testMode  = null
}

export async function shouldUseAI() { return getAIEnabled() }
export async function isTestMode()  { return getTestMode()  }

// ─── CALL BACKEND ────────────────────────────────────────────────
/**
 * Unico punto di uscita verso le API backend.
 * In TEST MODE intercetta e restituisce mock responses.
 */
export async function callBackend(endpoint, payload) {
  const testMode = await getTestMode()

  if (testMode) {
    console.info(`[TEST MODE] Mock call → ${endpoint}`, payload)
    return _mockResponse(endpoint, payload)
  }

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`)
  return data
}

// ─── MOCK RESPONSES ──────────────────────────────────────────────
function _mockResponse(endpoint, payload) {
  switch (endpoint) {

    case '/api/email':
      if (payload?.action === 'send') {
        return { ok: true, message: '[TEST] Email simulata — non inviata realmente', test: true }
      }
      return {
        ok: true, test: true,
        emails: [
          { id: 'test-1', subject: '[TEST] Email di prova', from: 'test@example.com', date: new Date().toISOString(), hasAttachments: false, body: 'Email simulata in test mode.' }
        ]
      }

    case '/api/document': {
      const action =
        (typeof payload?.action === 'string' ? payload.action : '')
          .trim()
          .toLowerCase()
        || (payload?.documentId ? 'process' : '')
        || (typeof payload?.tipo === 'string' ? 'parse_contabilita_pdf' : '')
        || (payload?.pdfBase64 ? 'split_cu' : '')
        || (payload?.fileBase64 ? 'analyze' : '')
        || 'analyze'

      if (action === 'parse_contabilita_pdf') {
        return {
          ok: true, test: true,
          records: [
            { codice: 'TEST01', descrizione: '[TEST] Conto di prova 1', tipo: 'economico', attivo: true },
            { codice: 'TEST02', descrizione: '[TEST] Conto di prova 2', tipo: 'patrimoniale', attivo: true },
          ]
        }
      }

      if (action === 'process') {
        return { status: 'ok', documentId: payload?.documentId || 'test-doc', pipeline_run_id: 'test-run', pipeline_trace: null }
      }

      if (action === 'split_cu') {
        return { ok: true, totale: 1, anno: String(payload?.anno || new Date().getFullYear()), cu: [] }
      }

      return {
        ok: true, test: true,
        tipo_documento: 'fattura_acquisto',
        cliente_cf: 'TEST00000000000',
        modulo_dest: 'contabilita',
        confidence: 0.95,
        note: '[TEST MODE] Classificazione simulata'
      }
    }

    case '/api/accounting/ai':
      return {
        ok: true, test: true,
        proposta: {
          conto_dare: '4.01.10.0001',
          conto_avere: '2.03.08.0001',
          causale: 'ACQ',
          causale_iva: 'A1',
          descrizione: '[TEST] Proposta contabile simulata',
          imponibile: payload?.imponibile || 100,
          iva: payload?.iva || 22,
        }
      }

    case '/api/ai':
      // Compat: se i moduli chiamano /api/ai con action=claude, simuliamo una risposta Anthropic.
      if (payload?.action === 'claude') {
        return {
          content: [{ type: 'text', text: '[TEST MODE] Risposta AI simulata. Nessuna chiamata reale effettuata.' }]
        }
      }
      if (payload?.action === 'ollama_analyze') {
        return { response: '[TEST MODE] Risposta Ollama simulata.' }
      }
      return { reply: '[TEST MODE] Risposta chat simulata.' }



    case '/api/banking':
      return { ok: true, test: true, data: [], message: '[TEST] Banking API simulata' }

    case '/api/stampe':
      return { ok: true, test: true, pdf: null, message: '[TEST] Stampa simulata — nessun PDF generato' }

    default:
      return { ok: true, test: true, message: `[TEST MODE] Endpoint ${endpoint} simulato` }
  }
}

// ─── DOCUMENT ROUTING ────────────────────────────────────────────

export async function routeDocument(doc, useAI) {
  const { modulo_dest, id } = doc
  await sb.from('documenti_hub').update({ stato: 'assigned', modulo_dest }).eq('id', id)
  switch (modulo_dest) {
    case 'iva':         return _routeToIVA(doc, useAI)
    case 'f24':         return _routeToF24(doc, useAI)
    case 'contabilita': return _routeToContabilita(doc, useAI)
    case 'fatture':     return _routeToFatture(doc, useAI)
    default:            return { ok: true, action: 'assigned_generic' }
  }
}

async function _routeToIVA(doc, useAI)         { return { ok: true, action: 'queued_iva',          docId: doc.id } }
async function _routeToF24(doc, useAI)         { return { ok: true, action: 'queued_f24',          docId: doc.id } }
async function _routeToFatture(doc, useAI)     { return { ok: true, action: 'queued_fatture',      docId: doc.id } }
async function _routeToContabilita(doc, useAI) {
  if (!useAI) {
    await sb.from('documenti_hub').update({ stato: 'manual_pending' }).eq('id', doc.id)
    return { ok: true, action: 'manual_pending', docId: doc.id }
  }
  return { ok: true, action: 'queued_for_ai_proposal', docId: doc.id }
}

// ─── PUB/SUB EVENTI ──────────────────────────────────────────────

const _listeners = {}

export function onEvent(event, callback) {
  if (!_listeners[event]) _listeners[event] = []
  _listeners[event].push(callback)
  return () => { _listeners[event] = _listeners[event].filter(cb => cb !== callback) }
}

export function emitEvent(event, payload) {
  ;(_listeners[event] || []).forEach(cb => cb(payload))
}

// ─── CALL CLAUDE (wrapper) ───────────────────────────────────────

export async function callClaude(systemPrompt, userContent, maxTokens = 1000) {
  return callBackend('/api/ai', {
    action: 'claude',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
}
