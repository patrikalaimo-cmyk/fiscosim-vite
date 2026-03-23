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

    case '/api/send-email':
      return { ok: true, message: '[TEST] Email simulata — non inviata realmente', test: true }

    case '/api/analyze-document':
      return {
        ok: true, test: true,
        tipo_documento: 'fattura_acquisto',
        cliente_cf: 'TEST00000000000',
        modulo_dest: 'contabilita',
        confidence: 0.95,
        note: '[TEST MODE] Classificazione simulata'
      }

    case '/api/proposta-contabile':
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

    case '/api/claude':
      return {
        content: [{ type: 'text', text: '[TEST MODE] Risposta AI simulata. Nessuna chiamata reale effettuata.' }]
      }

    case '/api/parse-contabilita-pdf':
      return {
        ok: true, test: true,
        records: [
          { codice: 'TEST01', descrizione: '[TEST] Conto di prova 1', tipo: 'economico', attivo: true },
          { codice: 'TEST02', descrizione: '[TEST] Conto di prova 2', tipo: 'patrimoniale', attivo: true },
        ]
      }

    case '/api/read-email':
      return {
        ok: true, test: true,
        emails: [
          { id: 'test-1', subject: '[TEST] Email di prova', from: 'test@example.com', date: new Date().toISOString(), hasAttachments: false, body: 'Email simulata in test mode.' }
        ]
      }

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
  return callBackend('/api/analyze-document', { system: systemPrompt, content: userContent, maxTokens })
}
