/**
 * Scrittura contabile proposta da AI (partita doppia) dopo il parsing.
 */

import { callLocalAI } from '../lib/ollama.js'
import { callClaudeTextForAccounting } from '../lib/anthropicParse.js'
import {
  fetchAiMemoryContextForAccounting,
  AI_MEMORY_PROMPT_MAX_CHARS,
  AI_MEMORY_GUIDANCE_LINE,
} from './aiMemoryRetrievalService.js'
import { createLayoutHash } from '../lib/layoutHash.js'
import { logAiMonitorMetrics } from './aiSupervisorService.js'
import { syncPartitarioFromAccountingEntry } from './partitarioSyncService.js'
import { logBilancioUpdated } from './bilancioMastriniService.js'
import { syncRegistriIvaFromAccountingEntry } from './ivaRegistriSyncService.js'
import { maybeAutoValidateAfterPersist } from './autoValidateAccountingEngine.js'
import { buildLearningPromptAppendixForDocument } from './aiLearningEngine.js'

const AI_MODE_LOCAL = 'local'
const AI_MODE_ONLINE = 'online'

function mkLog(log, awayLog, documentId) {
  return (event, payload = {}) => {
    const p = { documentId, ...payload }
    log?.(event, p)
    awayLog?.(event, p)
  }
}

function stripJsonFences(s) {
  let t = String(s || '').trim()
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (m) t = m[1].trim()
  return t
}

function parseJsonLoose(raw) {
  const t = stripJsonFences(raw)
  try {
    return JSON.parse(t)
  } catch {
    const i = t.indexOf('{')
    const j = t.lastIndexOf('}')
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(t.slice(i, j + 1))
      } catch {
        /* ignore */
      }
    }
    throw new Error('JSON accounting non parsabile')
  }
}

function toNum(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v).replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

const DEFAULT_ACCOUNTING_CONFIDENCE = 0.5

/**
 * @param {unknown} v
 * @returns {number} tra 0 e 1, default 0.5 se assente/non valido
 */
export function parseAccountingConfidence(v) {
  if (v == null || v === '') return DEFAULT_ACCOUNTING_CONFIDENCE
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return DEFAULT_ACCOUNTING_CONFIDENCE
  return Math.max(0, Math.min(1, n))
}

/**
 * Rialza la confidence quando c’è memoria pertinente (automazione più sicura).
 *
 * - Esempi con correzioni operatore nel prompt → minimo 0.9
 * - Altrimenti memoria match: +0.1 (1 esempio) o +0.2 (2+ esempi)
 * - `mode: 'memory_skip'` → skip AI da memoria verificata (min 0.9)
 *
 * @param {number} baseConfidence
 * @param {{ matchCount?: number, hasOperatorCorrections?: boolean, mode?: 'memory_skip' }} meta
 * @param {(e: string, p?: Record<string, unknown>) => void} [log]
 * @param {string} [documentId]
 * @returns {number}
 */
export function applyMemoryConfidenceBoost(baseConfidence, meta, log, documentId) {
  const matchCount = meta?.matchCount ?? 0
  const hasOperatorCorrections = Boolean(meta?.hasOperatorCorrections)
  const mode = meta?.mode

  let c = Math.max(0, Math.min(1, Number(baseConfidence)))
  if (!Number.isFinite(c)) c = DEFAULT_ACCOUNTING_CONFIDENCE
  const before = c

  if (mode === 'memory_skip') {
    c = Math.min(1, Math.max(c, 0.9))
    log?.('AI_CONFIDENCE_MEMORY_BOOST', {
      documentId,
      before,
      after: c,
      reason: 'memory_skip_operator_match',
      matchCount: 1,
      hasOperatorCorrections: true,
    })
    return c
  }

  if (hasOperatorCorrections) {
    c = Math.min(1, Math.max(c, 0.9))
    log?.('AI_CONFIDENCE_MEMORY_BOOST', {
      documentId,
      before,
      after: c,
      reason: 'operator_corrections_in_memory',
      matchCount,
    })
    return c
  }

  if (matchCount > 0) {
    const boost = matchCount >= 2 ? 0.2 : 0.1
    c = Math.min(1, c + boost)
    log?.('AI_CONFIDENCE_MEMORY_BOOST', {
      documentId,
      before,
      after: c,
      reason: 'memory_match',
      boost,
      matchCount,
    })
    return c
  }

  return c
}

function validateDoubleEntry(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: 'rows vuoto o non array' }
  }
  let dare = 0
  let avere = 0
  for (const r of rows) {
    dare += round2(toNum(r?.dare))
    avere += round2(toNum(r?.avere))
  }
  dare = round2(dare)
  avere = round2(avere)
  if (dare !== avere) {
    return { ok: false, reason: `squadratura: dare ${dare} !== avere ${avere}`, dare, avere }
  }
  return { ok: true, dare, avere }
}

/**
 * Cerca righe partita doppia in accounting_result o nelle correzioni operatore (before/after).
 *
 * @returns {{ rows: any[], totale: number | null, confidence: number | null, origin: string } | null}
 */
function extractSkippableAccountingPayload(accounting_result, operatore_corrections) {
  const tryObj = (obj, origin) => {
    if (!obj || typeof obj !== 'object') return null
    const rows = obj.rows
    if (!Array.isArray(rows) || rows.length === 0) return null
    const check = validateDoubleEntry(rows)
    if (!check.ok) return null
    return {
      rows,
      totale: obj.totale != null ? round2(toNum(obj.totale)) : check.dare,
      confidence: obj.confidence,
      origin,
    }
  }

  let ar = accounting_result
  if (typeof ar === 'string') {
    try {
      ar = JSON.parse(ar)
    } catch {
      ar = null
    }
  }
  let got = tryObj(ar, 'accounting_result')
  if (got) return got

  const oc =
    operatore_corrections && typeof operatore_corrections === 'object'
      ? operatore_corrections
      : null
  got = tryObj(oc?.accounting?.after, 'operatore_corrections.accounting.after')
  if (got) return got
  got = tryObj(oc?.accounting?.before, 'operatore_corrections.accounting.before')
  if (got) return got
  return null
}

/**
 * Se esiste memoria con stesso layout_hash e correzioni operatore, e righe contabili valide:
 * salta AI accounting e persiste accounting_entries da memoria.
 *
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   documentId: string,
 *   log?: (event: string, payload?: Record<string, unknown>) => void,
 *   persist?: boolean,
 * }} opts
 * @returns {Promise<{ skipped: true, memory_id?: string, layout_hash?: string, entry?: unknown } | { skipped: false }>}
 */
export async function trySkipAiAccountingFromMemory(opts) {
  const { db, documentId, log, persist = true, deferLedgerSync = false } = opts || {}
  if (!db || !documentId || typeof db.from !== 'function') return { skipped: false }

  let layoutHash = null
  let preprocessed = null
  try {
    const { data: pr } = await db
      .from('ai_parsing_results')
      .select('layout_hash, preprocessed_text')
      .eq('document_id', documentId)
      .maybeSingle()
    layoutHash = pr?.layout_hash || null
    preprocessed = pr?.preprocessed_text
  } catch {
    return { skipped: false }
  }
  if (!layoutHash && typeof preprocessed === 'string' && preprocessed.length > 0) {
    layoutHash = createLayoutHash(preprocessed)
  }
  if (!layoutHash) return { skipped: false }

  const { data: mem, error } = await db
    .from('ai_document_memory')
    .select('id, accounting_result, operatore_corrections, layout_hash')
    .eq('layout_hash', layoutHash)
    .not('operatore_corrections', 'is', null)
    .maybeSingle()

  if (error || !mem?.id) return { skipped: false }

  const extracted = extractSkippableAccountingPayload(mem.accounting_result, mem.operatore_corrections)
  if (!extracted) return { skipped: false }

  const check = validateDoubleEntry(extracted.rows)
  if (!check.ok) return { skipped: false }

  let confidence = parseAccountingConfidence(
    extracted.confidence != null ? extracted.confidence : 0.95
  )
  confidence = applyMemoryConfidenceBoost(
    confidence,
    { mode: 'memory_skip', matchCount: 1, hasOperatorCorrections: true },
    log,
    documentId
  )
  const payload = {
    source: 'memory_operator_match',
    skipped_ai: true,
    memory_id: mem.id,
    layout_hash: layoutHash,
    rows_origin: extracted.origin,
    rows: extracted.rows,
    totale: extracted.totale != null ? extracted.totale : check.dare,
    dare: check.dare,
    avere: check.avere,
    confidence,
  }

  let entry = null
  if (persist) {
    const ins = await db
      .from('accounting_entries')
      .insert([
        {
          document_id: documentId,
          data: payload,
          status: 'AI_PROPOSED',
        },
      ])
      .select('*')

    if (ins.error) {
      log?.('AI_SKIP_MEMORY_PERSIST_ERROR', {
        documentId,
        message: ins.error.message || String(ins.error),
      })
      return { skipped: false }
    }
    const rowsIns = ins.data
    entry = Array.isArray(rowsIns) ? rowsIns[0] : rowsIns
    if (entry?.id && !deferLedgerSync) {
      try {
        await syncPartitarioFromAccountingEntry({ db, entry, log })
      } catch (e) {
        log?.('PARTITARIO_SYNC_EXCEPTION', { documentId, message: e?.message || String(e) })
      }
      try {
        await logBilancioUpdated({ documentId, log, deps: { db } })
      } catch {
        /* ignore */
      }
      try {
        await syncRegistriIvaFromAccountingEntry({ db, entry, log })
      } catch (e) {
        log?.('IVA_REGISTER_SYNC_EXCEPTION', { documentId, message: e?.message || String(e) })
      }
      entry = await maybeAutoValidateAfterPersist(db, entry, log)
    }
  }

  log?.('AI_SKIPPED_MEMORY_MATCH', {
    documentId,
    memory_id: mem.id,
    layout_hash: layoutHash,
    rows_origin: extracted.origin,
    row_count: extracted.rows.length,
  })

  return { skipped: true, memory_id: mem.id, layout_hash: layoutHash, entry, payload }
}

function buildUserPrompt({ parsingJson, fiscalKnowledge, memory, learningAppendix = '' }) {
  const pj =
    typeof parsingJson === 'string'
      ? parsingJson
      : JSON.stringify(parsingJson ?? {}, null, 2)
  const fk = String(fiscalKnowledge || '').trim()
  const learnBlock = String(learningAppendix || '').trim()
  let mem = memory != null && String(memory).trim() !== '' ? String(memory).trim() : null
  if (mem && mem.length > AI_MEMORY_PROMPT_MAX_CHARS) {
    mem = `${mem.slice(0, AI_MEMORY_PROMPT_MAX_CHARS - 3)}...`
  }

  const docBlock = `--- Documento (parsing JSON) ---\n${pj.slice(0, 120000)}`

  let prompt = `Sei un commercialista esperto.
Genera scrittura contabile in partita doppia in base al JSON nella sezione DOCUMENTO in fondo.

Ordine nel prompt: (0) apprendimento anagrafica (conferme/correzioni reali), se presente; (1) conoscenza fiscale/contabile, se presente; (2) memoria documenti simili, se presente; (3) documento. Se (0) è presente e coerente col documento, usalo per il conto costo/ricavo principale prima di affidarvi solo alla conoscenza fiscale generica. La memoria è ausiliaria: ${AI_MEMORY_GUIDANCE_LINE} Se non è coerente col documento corrente, ignora la memoria.

Formato output JSON (solo questo, nessun altro testo):
{
  "rows": [
    { "conto": "codice o nome conto", "descrizione": "testo", "dare": 0, "avere": 0 },
    ...
  ],
  "totale": <numero, es. imponibile+IVA o totale documento coerente con le righe>,
  "confidence": <numero da 0 a 1: quanto ritieni affidabile questa scrittura rispetto al documento>
}

Regole:
- Ogni riga ha dare O avere (l'altro 0 salvo casi eccezionali giustificati); somma dare deve essere uguale a somma avere.
- Usa conti plausibili per un'impresa italiana (PDC semplificato se non specificato).
- confidence: 0 = molto incerto, 1 = molto sicuro; se non sai, usa un valore intermedio (es. 0.5).
`

  if (learnBlock) {
    prompt += `\n${learnBlock}`
  }
  if (mem) {
    prompt += `\n--- MEMORIA (prima del documento — riferimento principale se coerente) ---\n${mem}\n`
  }
  if (fk) {
    prompt += `\n--- Conoscenza fiscale e contabile (riferimento) ---\n${fk.slice(0, 60000)}\n`
  }
  prompt += `\n${docBlock}\n`

  return prompt
}

/**
 * Esegue proposta scrittura contabile via AI (locale o Claude).
 *
 * @param {{
 *   documentId: string,
 *   parsingJson: object | string,
 *   fiscalKnowledge?: string,
 *   memory?: string,
 *   aiMode?: string,
 *   persist?: boolean,
 *   soggettoId?: string | null,
 *   deps: {
 *     db?: import('@supabase/supabase-js').SupabaseClient,
 *     log?: (event: string, payload?: object) => void,
 *     awayLog?: (event: string, payload?: object) => void,
 *     callLocalAI?: (prompt: string, options?: { baseUrl?: string, model?: string }) => Promise<string>,
 *     callClaudeTextForAccounting?: typeof callClaudeTextForAccounting,
 *   },
 * }} opts
 * @returns {Promise<{ ok: boolean, rows?: any[], totale?: number, confidence?: number, rawText?: string, error?: string, entry?: any }>}
 */
export async function runAiAccounting(opts) {
  const {
    documentId,
    parsingJson,
    fiscalKnowledge = '',
    memory,
    aiMode = AI_MODE_LOCAL,
    persist = true,
    soggettoId = null,
    deferLedgerSync = false,
    deps = {},
  } = opts || {}

  const L = mkLog(deps.log, deps.awayLog, documentId)
  const mode = String(aiMode || AI_MODE_LOCAL).toLowerCase() === AI_MODE_ONLINE ? AI_MODE_ONLINE : AI_MODE_LOCAL
  const callLocal = deps.callLocalAI || callLocalAI
  const callClaude = deps.callClaudeTextForAccounting || callClaudeTextForAccounting

  L('AI_ACCOUNTING_STARTED', { aiMode: mode })

  let memoryMeta = { matchCount: 0, hasOperatorCorrections: false }
  let memoryMerged = memory
  if (deps.db && documentId) {
    try {
      const pj =
        parsingJson && typeof parsingJson === 'object'
          ? parsingJson
          : typeof parsingJson === 'string'
            ? (() => {
                try {
                  return JSON.parse(parsingJson)
                } catch {
                  return null
                }
              })()
            : null
      const memCtx = await fetchAiMemoryContextForAccounting({
        db: deps.db,
        documentId,
        parsingJson: pj,
        log: deps.log,
        maxChars: AI_MEMORY_PROMPT_MAX_CHARS,
      })
      memoryMeta = {
        matchCount: memCtx.matchCount ?? 0,
        hasOperatorCorrections: Boolean(memCtx.hasOperatorCorrections),
      }
      if (memCtx.block) {
        const parts = [memory, memCtx.block].filter(Boolean)
        memoryMerged = parts.length ? parts.join('\n\n') : undefined
      }
    } catch (e) {
      deps.log?.('AI_MEMORY_FETCH_ERROR', {
        documentId,
        phase: 'accounting',
        error: e?.message || String(e),
      })
    }
  }

  let learningAppendix = ''
  if (deps.db && documentId) {
    try {
      const lr = await buildLearningPromptAppendixForDocument(deps.db, documentId)
      learningAppendix = lr.appendix || ''
      if (lr.used) {
        L('AI_LEARNING_PROMPT_ATTACHED', { frequenza: lr.frequenza, conto_id: lr.conto_id })
      }
    } catch (e) {
      deps.log?.('AI_LEARNING_PROMPT_ERROR', {
        documentId,
        error: e?.message || String(e),
      })
    }
  }

  const userPrompt = buildUserPrompt({
    parsingJson,
    fiscalKnowledge,
    memory: memoryMerged,
    learningAppendix,
  })
  const inputLen = userPrompt.length
  const memoryUsedFlag = Boolean(memoryMerged && String(memoryMerged).trim())
  const docIdMonitor = documentId || 'ai-accounting-standalone'

  let rawText
  const tLlm0 = Date.now()
  try {
    if (mode === AI_MODE_ONLINE) {
      rawText = await callClaude({ userPrompt, log: deps.log, documentId })
    } else {
      rawText = await callLocal(userPrompt, {
        model: process.env.OLLAMA_MODEL || 'mistral',
      })
    }
  } catch (e) {
    const msg = e?.message || String(e)
    L('AI_ACCOUNTING_ERROR', { message: msg })
    const llmMs = Date.now() - tLlm0
    await logAiMonitorMetrics({
      documentId: docIdMonitor,
      phase: 'runAiAccounting',
      responseTimeMs: llmMs,
      inputLength: inputLen,
      memoryUsed: memoryUsedFlag,
      success: false,
      deps,
    })
    return { ok: false, error: msg }
  }
  const llmMs = Date.now() - tLlm0

  let parsed
  try {
    parsed = parseJsonLoose(rawText)
  } catch (e) {
    const msg = e?.message || String(e)
    L('AI_ACCOUNTING_ERROR', { phase: 'parse', message: msg })
    await logAiMonitorMetrics({
      documentId: docIdMonitor,
      phase: 'runAiAccounting',
      responseTimeMs: llmMs,
      inputLength: inputLen,
      memoryUsed: memoryUsedFlag,
      success: false,
      deps,
    })
    return { ok: false, error: msg, rawText }
  }

  const rows = parsed?.rows
  const totale = parsed?.totale != null ? round2(toNum(parsed.totale)) : null
  let confidence = parseAccountingConfidence(parsed?.confidence)
  confidence = applyMemoryConfidenceBoost(confidence, memoryMeta, deps.log, documentId)
  L('AI_ACCOUNTING_CONFIDENCE', {
    confidence,
    default_used: parsed?.confidence == null,
    memory_match_count: memoryMeta.matchCount,
    memory_operator_samples: memoryMeta.hasOperatorCorrections,
  })

  const check = validateDoubleEntry(rows)
  if (!check.ok) {
    L('AI_ACCOUNTING_ERROR', { phase: 'validate', ...check })
    await logAiMonitorMetrics({
      documentId: docIdMonitor,
      phase: 'runAiAccounting',
      responseTimeMs: llmMs,
      inputLength: inputLen,
      memoryUsed: memoryUsedFlag,
      success: false,
      deps,
    })
    return { ok: false, error: check.reason || 'validazione fallita', rows, totale, confidence, rawText }
  }

  L('AI_ACCOUNTING_COMPLETED', {
    rowCount: rows.length,
    dare: check.dare,
    avere: check.avere,
    totale,
    confidence,
  })

  let pjDate = null
  if (parsingJson && typeof parsingJson === 'object') {
    pjDate = parsingJson.documento?.data || parsingJson.documento?.data_documento || null
  }

  const payload = {
    source: 'ai_accounting',
    rows,
    totale: totale != null ? totale : check.dare,
    dare: check.dare,
    avere: check.avere,
    confidence,
    ...(pjDate ? { data: pjDate } : {}),
    ...(soggettoId ? { soggetto_id: String(soggettoId) } : {}),
  }

  let entry = null
  if (persist && documentId && deps.db && typeof deps.db.from === 'function') {
    const ins = await deps.db
      .from('accounting_entries')
      .insert([
        {
          document_id: documentId,
          data: payload,
          status: 'AI_PROPOSED',
        },
      ])
      .select('*')

    if (ins.error) {
      L('AI_ACCOUNTING_PERSIST_ERROR', { message: ins.error.message || String(ins.error) })
    } else {
      const rowsIns = ins.data
      entry = Array.isArray(rowsIns) ? rowsIns[0] : rowsIns
      if (entry?.id && !deferLedgerSync) {
        try {
          await syncPartitarioFromAccountingEntry({ db: deps.db, entry, log: L })
        } catch (e) {
          L('PARTITARIO_SYNC_EXCEPTION', { message: e?.message || String(e) })
        }
        try {
          await logBilancioUpdated({ documentId, log: L, deps: { db: deps.db } })
        } catch {
          /* ignore */
        }
        try {
          await syncRegistriIvaFromAccountingEntry({ db: deps.db, entry, log: L })
        } catch (e) {
          L('IVA_REGISTER_SYNC_EXCEPTION', { message: e?.message || String(e) })
        }
        entry = await maybeAutoValidateAfterPersist(deps.db, entry, L)
      }
    }
  }

  await logAiMonitorMetrics({
    documentId: docIdMonitor,
    phase: 'runAiAccounting',
    responseTimeMs: llmMs,
    inputLength: inputLen,
    memoryUsed: memoryUsedFlag,
    success: true,
    deps,
  })

  return {
    ok: true,
    rows,
    totale: totale != null ? totale : check.dare,
    confidence,
    rawText,
    entry,
  }
}
