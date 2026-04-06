/**
 * AI Supervisor Service
 *
 * Responsibility:
 * - Central place for AI pipeline logging (ai_logs).
 * - Lightweight anomaly checks on parsing JSON.
 * - (Legacy) Deterministic validations for accounting artifacts.
 * - Analisi qualitativa pipeline + log tramite LLM locale (Mistral / Ollama).
 */
 
import { getSupabaseAdmin } from '../lib/db.js'
import { callLocalAI } from '../lib/ollama.js'
import {
  getFiscalKnowledge,
  formatFiscalKnowledgeForPrompt,
  promptBodyFromFiscalRows,
  FISCAL_CATEGORIES_ACCOUNTING,
} from '../lib/fiscalKnowledge.js'

function toNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
 
function defaultLog(event, payload) {
  if (payload === undefined) console.log(`[aiSupervisorService] ${event}`)
  else console.log(`[aiSupervisorService] ${event}`, payload)
}

function normalizeLevel(level) {
  const s = String(level || '').trim().toLowerCase()
  if (s === 'warning') return 'warning'
  if (s === 'error') return 'error'
  return 'info'
}

/**
 * Funzione principale richiesta: salva un log in tabella ai_logs.
 *
 * @param {string} documentId
 * @param {string} step
 * @param {string} message
 * @param {'info'|'warning'|'error'} [level]
 * @param {{ deps?: { db?: any, log?: (event: string, payload?: any) => void } }} [options]
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function logStep(documentId, step, message, level = 'info', options = {}) {
  const { deps = {} } = options
  const db = deps.db || (await getSupabaseAdmin())
  const log = deps.log || defaultLog

  if (!documentId) return { ok: false, error: 'documentId mancante' }
  if (!step) return { ok: false, error: 'step mancante' }

  const payload = {
    document_id: documentId,
    step: String(step),
    message: message == null ? '' : String(message),
    level: normalizeLevel(level),
  }

  const ins = await db.from('ai_logs').insert([payload])
  if (ins.error) {
    log('AI_LOGS_INSERT_FAILED', { documentId, step, error: ins.error?.message || ins.error })
    return { ok: false, error: ins.error?.message || String(ins.error) }
  }
  return { ok: true }
}

/**
 * Metriche unificate per monitoraggio performance/qualità AI (salvate in ai_logs, step AI_MONITOR).
 *
 * @param {{
 *   documentId?: string | null,
 *   phase?: string,
 *   responseTimeMs: number,
 *   inputLength: number,
 *   memoryUsed: boolean,
 *   success: boolean,
 *   deps?: { db?: any, log?: (event: string, payload?: any) => void },
 * }} opts
 */
export async function logAiMonitorMetrics(opts) {
  const {
    documentId,
    phase = 'ai',
    responseTimeMs = 0,
    inputLength = 0,
    memoryUsed = false,
    success = false,
    deps = {},
  } = opts || {}

  const docId =
    documentId && String(documentId).trim() ? String(documentId).trim() : 'ai-monitor-unknown'

  const payload = {
    kind: 'AI_MONITOR',
    phase: String(phase),
    AI_RESPONSE_TIME: Math.max(0, Math.round(Number(responseTimeMs) || 0)),
    AI_INPUT_LENGTH: Math.max(0, Math.round(Number(inputLength) || 0)),
    AI_MEMORY_USED: Boolean(memoryUsed),
    AI_SUCCESS: Boolean(success),
  }
  const msg = JSON.stringify(payload)
  const log = deps.log || defaultLog
  log('AI_MONITOR', payload)
  return logStep(docId, 'AI_MONITOR', msg, success ? 'info' : 'warning', { deps })
}

/**
 * Controlli richiesti sul parsing JSON.
 *
 * - iva incoerente con imponibile (se aliquota presente)
 * - confidence < 0.7
 *
 * Se problema:
 * - logga warning
 * - ritorna { anomaly: true }
 *
 * @param {Record<string, any>} parsingJson
 * @param {{ documentId?: string, deps?: { db?: any, log?: (event: string, payload?: any) => void } }} [options]
 * @returns {Promise<{ anomaly: boolean, reasons: string[] }>}
 */
export async function checkAnomalies(parsingJson, options = {}) {
  const { documentId = null, deps = {} } = options
  const log = deps.log || defaultLog

  const pj = parsingJson && typeof parsingJson === 'object' ? parsingJson : {}
  const meta = pj.meta || {}
  const cont = pj.contabile || {}

  const confidence = typeof meta.confidence === 'number' ? meta.confidence : parseFloat(String(meta.confidence ?? '').replace(',', '.'))
  const confNum = Number.isFinite(confidence) ? confidence : null

  const imponibile = toNum(cont.imponibile)
  const iva = toNum(cont.iva)
  const aliquota = toNum(cont.aliquota)

  const reasons = []

  if (confNum != null && confNum < 0.7) {
    reasons.push(`confidence_bassa:${confNum}`)
  }

  // Coerenza IVA: se imponibile > 0 e aliquota > 0, IVA attesa = imponibile * aliquota/100.
  if (imponibile > 0 && aliquota > 0) {
    const expected = Math.round((imponibile * aliquota / 100) * 100) / 100
    const delta = Math.round((iva - expected) * 100) / 100
    if (Math.abs(delta) > 0.05) {
      reasons.push(`iva_incoerente:expected=${expected},got=${iva},delta=${delta}`)
    }
  }

  const anomaly = reasons.length > 0

  if (anomaly) {
    const docId = documentId || pj?.document_id || pj?.documento_id || pj?.documentId || null
    if (docId) {
      await logStep(docId, 'CHECK_ANOMALIES', reasons.join(' | '), 'warning', { deps })
    } else {
      log('CHECK_ANOMALIES_NO_DOCUMENT_ID', { reasons })
    }
  }

  return { anomaly, reasons }
}

/**
 * @param {{
 *   ivaRows?: Array<{ aliquota: number, imponibile: number, iva: number, causale_iva_id?: string | null }>,
 *   righe?: Array<{ dare?: any, avere?: any }>,
 *   documentoTotale?: number | null,
 *   pipelineContext?: Record<string, unknown>,
 * }} p
 * @returns {Promise<{ ok: true } | { ok: false, error: string, details?: any }>}
 */
export async function aiSupervisorService({ ivaRows = [], righe = [], documentoTotale = null, pipelineContext } = {}) {
  void pipelineContext
 
  if (Array.isArray(ivaRows) && ivaRows.length > 0) {
    const missing = ivaRows.filter(r => !String(r?.causale_iva_id || '').trim())
    if (missing.length) {
      return { ok: false, error: 'Una o più righe IVA non hanno causale assegnata', details: { missing_count: missing.length } }
    }
  }
 
  const totDare = (righe || []).reduce((s, r) => s + toNum(r?.dare), 0)
  const totAvere = (righe || []).reduce((s, r) => s + toNum(r?.avere), 0)
  const diff = Math.round((totDare - totAvere) * 100) / 100
  if (diff !== 0) {
    return { ok: false, error: 'Scrittura non bilanciata', details: { totDare, totAvere, diff } }
  }
 
  if (documentoTotale != null) {
    const t = toNum(documentoTotale)
    if (t > 0) {
      const base = Math.max(totDare, totAvere)
      const d = Math.round((base - t) * 100) / 100
      if (Math.abs(d) > 0.02) {
        return {
          ok: false,
          error: 'Totale scrittura non coerente col documento',
          details: { documentoTotale: t, scritturaTotale: base, delta: d }
        }
      }
    }
  }
 
  return { ok: true }
}

const MAX_PROMPT_LOGS = 80
const MAX_CHARS_PARSING = 8000
const MAX_CHARS_ACCOUNTING = 6000

function trimForPrompt(value, maxChars) {
  if (value == null) return null
  let s
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    s = String(value)
  }
  if (s.length <= maxChars) {
    if (typeof value === 'string') return value
    try {
      return JSON.parse(s)
    } catch {
      return s
    }
  }
  return s.slice(0, maxChars) + '\n…[troncato]'
}

function extractFirstJsonObject(txt) {
  const start = String(txt || '').indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < txt.length; i++) {
    const ch = txt[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return txt.slice(start, i + 1)
    }
  }
  return null
}

function parseSupervisorOutput(raw) {
  const s = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const block = extractFirstJsonObject(s) || s
  try {
    const j = JSON.parse(block)
    return {
      issues: Array.isArray(j.issues) ? j.issues : [],
      warnings: Array.isArray(j.warnings) ? j.warnings : [],
      suggestions: Array.isArray(j.suggestions) ? j.suggestions : [],
    }
  } catch {
    return { issues: [], warnings: [], suggestions: [] }
  }
}

/**
 * Revisore contabile AI: legge log pipeline, parsing e risultato contabile; usa Ollama (Mistral di default).
 *
 * @param {{
 *   documentId?: string | null,
 *   aiLogs?: Array<Record<string, unknown>> | null,
 *   parsingJson?: Record<string, unknown> | null,
 *   accountingResult?: unknown,
 *   pipelineContext?: Record<string, unknown> | null,
 *   deps?: {
 *     db?: any,
 *     log?: (event: string, payload?: any) => void,
 *     callLocalAI?: (prompt: string, options?: { baseUrl?: string, model?: string }) => Promise<string>,
 *   },
 * }} [params]
 * @returns {Promise<{
 *   ok: boolean,
 *   issues: string[],
 *   warnings: string[],
 *   suggestions: string[],
 *   error?: string,
 *   rawPreview?: string,
 * }>}
 */
export async function runAiPipelineSupervisorAnalysis({
  documentId = null,
  aiLogs = null,
  parsingJson = null,
  accountingResult = null,
  pipelineContext = null,
  deps = {},
} = {}) {
  const db = deps.db || (await getSupabaseAdmin())
  const log = deps.log || defaultLog
  const aiCall = deps.callLocalAI || callLocalAI

  let logs = aiLogs
  if ((!logs || !Array.isArray(logs)) && documentId) {
    const q = await db
      .from('ai_logs')
      .select('step,level,message,created_at')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true })
      .limit(250)
    if (q.error) {
      log('SUPERVISOR_AI_ANALYSIS', { documentId, ok: false, phase: 'load_logs', error: q.error?.message || String(q.error) })
      return {
        ok: false,
        error: q.error?.message || String(q.error),
        issues: [],
        warnings: [],
        suggestions: [],
      }
    }
    logs = q.data || []
  }

  const logRows = Array.isArray(logs) ? logs : []
  const ai_logs_compact = logRows.slice(-MAX_PROMPT_LOGS).map((l) => ({
    step: l?.step ?? null,
    level: l?.level ?? null,
    message: String(l?.message ?? '').slice(0, 500),
    created_at: l?.created_at ?? null,
  }))

  const bundle = {
    ai_logs: ai_logs_compact,
    parsingJson: trimForPrompt(parsingJson, MAX_CHARS_PARSING),
    accountingResult: trimForPrompt(accountingResult, MAX_CHARS_ACCOUNTING),
  }

  let fiscalBlock = ''
  let fkRowsCount = 0
  let fkOk = false
  let fkErr = null
  try {
    const fk = await getFiscalKnowledge(db, FISCAL_CATEGORIES_ACCOUNTING)
    fkOk = Boolean(fk.ok)
    fkErr = fk.error || null
    const fkRows = fk.ok && Array.isArray(fk.rows) ? fk.rows : []
    fkRowsCount = fkRows.length
    void formatFiscalKnowledgeForPrompt(fkRows)
    fiscalBlock = promptBodyFromFiscalRows(fkRows, { maxChars: 10000 })
  } catch (e) {
    fkErr = e?.message || String(e)
    void formatFiscalKnowledgeForPrompt([])
    fiscalBlock = promptBodyFromFiscalRows([])
  }
  log('FISCAL_KNOWLEDGE_ATTACHED', {
    documentId,
    phase: 'runAiPipelineSupervisorAnalysis',
    rows: fkRowsCount,
    chars: fiscalBlock.length,
    dbOk: fkOk,
    error: fkErr,
    source: 'db_refresh',
  })
  if (pipelineContext && typeof pipelineContext === 'object') {
    pipelineContext.fiscalKnowledgePromptAppendix = fiscalBlock
  }

  const fiscalSection = `\nRiferimenti operativi (database FiscoSim fiscal_knowledge):\n${fiscalBlock}\n`

  const prompt = `Sei un revisore contabile esperto.
Analizza i dati e segnala:

* errori
* incoerenze
* rischi fiscali
* suggerimenti
${fiscalSection}
Dati (JSON):
${JSON.stringify(bundle, null, 2)}

Rispondi SOLO con un JSON valido di questo schema, senza testo prima o dopo:
{
  "issues": [],
  "warnings": [],
  "suggestions": []
}
Ogni array contiene stringhe in italiano. Un array può essere vuoto se non applicabile.`

  let raw = ''
  try {
    raw = await aiCall(prompt)
  } catch (e) {
    const err = e?.message || String(e)
    log('SUPERVISOR_AI_ANALYSIS', { documentId, ok: false, phase: 'ollama', error: err })
    return { ok: false, error: err, issues: [], warnings: [], suggestions: [] }
  }

  const parsed = parseSupervisorOutput(raw)
  const issues = parsed.issues.map((x) => String(x).trim()).filter(Boolean)
  const warnings = parsed.warnings.map((x) => String(x).trim()).filter(Boolean)
  const suggestions = parsed.suggestions.map((x) => String(x).trim()).filter(Boolean)

  log('SUPERVISOR_AI_ANALYSIS', {
    documentId,
    ok: true,
    issuesCount: issues.length,
    warningsCount: warnings.length,
    suggestionsCount: suggestions.length,
    parseEmpty: issues.length + warnings.length + suggestions.length === 0,
  })

  return {
    ok: true,
    issues,
    warnings,
    suggestions,
    rawPreview: raw.length > 1200 ? raw.slice(0, 1200) + '…' : raw,
  }
}

