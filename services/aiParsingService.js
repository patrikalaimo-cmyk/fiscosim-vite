/**
 * AI Parsing Service — backend pipeline (Node.js / Vercel).
 *
 * Primary entrypoint required by spec:
 * - runParsing(documentId)
 *
 * Flow:
 * - Load document record from DB (fallback between tables)
 * - Download file from Supabase Storage (or mock if not available)
 * - Call AI (placeholder Claude Messages API)
 * - Parse JSON response robustly
 * - Persist into ai_parsing_results (document_id, json_output, confidence, preprocessed_text)
 * - Template fornitore (supplier_templates): match pattern → bypass AI; dopo >3 parse AI validi → auto-template
 * - Update documents.status = "PARSED" (fallback between tables)
 * - Retry AI once on failure
 */

import { parseItalianAmount } from '../domain/parseItalianAmount.js'
import { preprocessInvoiceTextForAi } from '../domain/preprocessInvoiceTextForAi.js'
import { getSupabaseAdmin } from '../lib/db.js'
import { callLocalAI } from '../lib/ollama.js'
import { callClaudeTextForParsing, callClaudeVisionForParsing } from '../lib/anthropicParse.js'
import {
  getFiscalKnowledge,
  formatFiscalKnowledgeForPrompt,
  promptBodyFromFiscalRows,
  appendFiscalKnowledgeToPromptBase,
  FISCAL_CATEGORIES_PARSING,
} from '../lib/fiscalKnowledge.js'
import { aiSupervisorService, logAiMonitorMetrics } from './aiSupervisorService.js'
import { createLayoutHash, LAYOUT_HASH_LINE_COUNT } from '../lib/layoutHash.js'
import {
  fetchAiMemoryContextForParsing,
  AI_MEMORY_PROMPT_MAX_CHARS,
  AI_MEMORY_IMPORTANT_BLOCK,
} from './aiMemoryRetrievalService.js'
import { parseStringPromise, processors as xmlProcessors } from 'xml2js'
import forge from 'node-forge'
import AdmZip from 'adm-zip'

const SYSTEM_PROMPT = `Sei un esperto contabile e fiscale italiano.

Analizza il documento fornito e restituisci SOLO un JSON valido con questa struttura:

{
  "meta": {
    "confidence": 0-1,
    "tipo_documento": "",
    "anomalie": []
  },
  "documento": {
    "data": "",
    "fornitore": {
      "nome": "",
      "piva": ""
    }
  },
  "contabile": {
    "imponibile": 0,
    "iva": 0,
    "aliquota": 0,
    "natura": null
  },
  "azioni_suggerite": []
}

Regole:
* NON scrivere testo fuori dal JSON
* Se un dato manca, metti null
* Se non sei sicuro, abbassa confidence
`

/** Limite caratteri testo documento verso AI (preprocess / sezioni). */
const MAX_AI_DOCUMENT_CHARS = 52000

/** Max caratteri salvati in ai_parsing_results.preprocessed_text (evita righe enormi). */
const MAX_PREPROCESSED_TEXT_DB = 500000

/** Template fornitore: lunghezza minima pattern su testo collassato. */
const SUPPLIER_PATTERN_MIN_LEN = 80
/** Caratteri iniziali (dopo collapse) salvati come pattern automatico. */
const SUPPLIER_PATTERN_FINGERPRINT_CHARS = 480
/** Dopo quante occorrenze fornitore (AI) creare template: >3 ⇒ al 4° documento. */
const SUPPLIER_LEARN_THRESHOLD = 3

function collapseWsForSupplier(s) {
  return String(s || '')
    .replace(/\r\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSupplierKey(nome) {
  return collapseWsForSupplier(nome).toUpperCase()
}

function buildSupplierPatternFingerprint(fullText) {
  const c = collapseWsForSupplier(fullText)
  return c.slice(0, SUPPLIER_PATTERN_FINGERPRINT_CHARS)
}

function isEligibleForSupplierLearning(jsonOutput) {
  const nome = jsonOutput?.documento?.fornitore?.nome
  if (!nome || String(nome).trim().length < 3) return false
  if (/fornitore\s*test/i.test(String(nome))) return false
  const an = jsonOutput?.meta?.anomalie
  if (Array.isArray(an) && an.includes('FALLBACK_MODE')) return false
  if (Array.isArray(an) && an.includes('AI_PLACEHOLDER')) return false
  return true
}

async function findSupplierTemplateMatch(db, fullText, log, documentId) {
  try {
    const { data, error } = await db.from('supplier_templates').select('*').limit(400)
    if (error || !data?.length) return null
    const collapsed = collapseWsForSupplier(fullText)
    if (collapsed.length < SUPPLIER_PATTERN_MIN_LEN) return null
    for (const row of data) {
      const p = row?.pattern_testo
      if (!p || String(p).length < SUPPLIER_PATTERN_MIN_LEN) continue
      if (collapsed.includes(p) || fullText.includes(p)) return row
    }
  } catch (e) {
    log('SUPPLIER_TEMPLATE_MATCH_ERROR', { documentId, error: e?.message || String(e) })
  }
  return null
}

/**
 * Incrementa conteggio e crea template se superata soglia (best-effort, non blocca).
 */
async function maybeLearnSupplierTemplate(db, documentId, jsonOutput, rawText, log) {
  if (!rawText || !isEligibleForSupplierLearning(jsonOutput)) return
  const key = normalizeSupplierKey(jsonOutput?.documento?.fornitore?.nome)
  if (!key) return

  try {
    const { data: row, error: selErr } = await db
      .from('supplier_parse_counts')
      .select('parse_count')
      .eq('fornitore_nome', key)
      .maybeSingle()
    if (selErr) {
      log('SUPPLIER_TEMPLATE_COUNT_READ_SKIPPED', { documentId, error: selErr.message })
      return
    }

    const next = (row?.parse_count ?? 0) + 1
    const { error: upErr } = await db.from('supplier_parse_counts').upsert(
      {
        fornitore_nome: key,
        parse_count: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fornitore_nome' }
    )
    if (upErr) {
      log('SUPPLIER_TEMPLATE_COUNT_UPSERT_SKIPPED', { documentId, error: upErr.message })
      return
    }

    if (next <= SUPPLIER_LEARN_THRESHOLD) return

    const { data: existing } = await db.from('supplier_templates').select('id').eq('fornitore_nome', key).limit(1)
    if (existing?.length) return

    const pattern = buildSupplierPatternFingerprint(rawText)
    if (pattern.length < SUPPLIER_PATTERN_MIN_LEN) return

    const { error: insErr } = await db.from('supplier_templates').insert({
      fornitore_nome: key,
      pattern_testo: pattern,
      mapping: JSON.parse(JSON.stringify(jsonOutput)),
    })
    if (insErr) {
      log('SUPPLIER_TEMPLATE_CREATE_SKIPPED', { documentId, fornitore_nome: key, error: insErr.message })
      return
    }

    log('SUPPLIER_TEMPLATE_CREATED', {
      documentId,
      fornitore_nome: key,
      parse_count: next,
      pattern_len: pattern.length,
    })
  } catch (e) {
    log('SUPPLIER_TEMPLATE_LEARN_ERROR', { documentId, error: e?.message || String(e) })
  }
}

/**
 * Funzione principale richiesta.
 *
 * @param {string} documentId
 * @param {{
 *   deps?: {
 *     db?: any,
 *     aiCall?: (p: { fileBase64: string, mimeType?: string, filename?: string, prompt: string }) => Promise<string>,
 *     callLocalAI?: (prompt: string) => Promise<string>,
 *     getFileFromStorage?: (p: { db: any, doc: any }) => Promise<{ fileBase64: string, mimeType?: string, filename?: string }>,
 *     log?: (event: string, payload?: any) => void,
 *   },
 *   pipelineContext?: Record<string, unknown>,
 *   aiMode?: 'local' | 'online',
 *   aiPreprocessMode?: 'on' | 'off',
 * }} [options]
 * @returns {Promise<{ ok: true, result: any } | { ok: false, error: string, step?: string, details?: any }>}
 */
export async function runParsing(documentId, options = {}) {
  const { deps = {}, pipelineContext } = options
  const aiMode = options.aiMode === 'online' ? 'online' : 'local'
  const aiPreprocessMode = options.aiPreprocessMode === 'off' ? 'off' : 'on'
  const log = deps.log || defaultLog

  if (!documentId) return { ok: false, step: 'input', error: 'documentId mancante' }

  const db = deps.db || (await getSupabaseAdmin())

  let fiscalPromptBody = ''
  let fkRows = []
  let fkOk = false
  let fkErr = null
  try {
    const fk = await getFiscalKnowledge(db, FISCAL_CATEGORIES_PARSING)
    fkOk = Boolean(fk.ok)
    fkErr = fk.error || null
    fkRows = fk.ok && Array.isArray(fk.rows) ? fk.rows : []
    void formatFiscalKnowledgeForPrompt(fkRows)
    fiscalPromptBody = promptBodyFromFiscalRows(fkRows)
  } catch (e) {
    fkOk = false
    fkErr = e?.message || String(e)
    void formatFiscalKnowledgeForPrompt([])
    fiscalPromptBody = promptBodyFromFiscalRows([])
  }
  log('FISCAL_KNOWLEDGE_ATTACHED', {
    documentId,
    phase: 'aiParsing',
    rows: fkRows.length,
    chars: fiscalPromptBody.length,
    dbOk: fkOk,
    error: fkErr,
  })
  if (pipelineContext && typeof pipelineContext === 'object') {
    pipelineContext.fiscalKnowledgePromptAppendix = fiscalPromptBody
  }
  const systemPromptForAi = appendFiscalKnowledgeToPromptBase(SYSTEM_PROMPT, fiscalPromptBody)

  // 1) Load document record (we support multiple table names)
  const docRes = await loadDocumentRecord({ db, documentId })
  if (!docRes.ok) return { ok: false, step: 'load_document', error: docRes.error, details: docRes.details }
  const doc = docRes.doc

  // 2) Download file from storage (or mock if not available)
  const getFileFromStorage = deps.getFileFromStorage || defaultGetFileFromStorage
  let fileRes = await getFileFromStorage({ db, doc })
  fileRes = enrichFileResWithImportXmlContent(fileRes, doc, log, documentId)
  if (!fileRes?.fileBase64) {
    // Spec says "mock se necessario" — do not hard fail here.
    log('AI_PARSING_STORAGE_MOCK_USED', { documentId, reason: 'no fileBase64 from storage' })
  }

  const fileBuf = base64ToBuffer(fileRes?.fileBase64 || '')
  const containerKind = detectContainerKind({ fileRes, doc, buf: fileBuf })

  // 2b) PKCS#7 / CADES (.p7m): estrai XML firmato → stesso parser FatturaPA.
  if (containerKind === 'p7m' && fileBuf.length) {
    try {
      const xmlText = extractXmlFromP7mBuffer(fileBuf)
      if (xmlText) {
        const xmlParsed = await parseFatturaPaXml(xmlText)
        const jsonOutput = buildParsingJsonFromXml(xmlParsed, { log, documentId })
        log('PARSING_P7M_SUCCESS', { documentId })
        return await persistAndFinalize({
          db,
          documentId,
          doc,
          docRes,
          jsonOutput,
          log,
          pipelineContext,
          preprocessedText: null,
          supplierLearningEnabled: false,
          supplierLearningRawText: null,
        })
      }
      log('PARSING_NO_XML_FOUND', { documentId, container: 'p7m' })
    } catch (e) {
      log('PARSING_XML_ERROR', { documentId, error: e?.message || String(e), container: 'p7m' })
      log('PARSING_NO_XML_FOUND', { documentId, container: 'p7m' })
    }
  }

  // 2c) ZIP: primo file XML valido (o .p7m con XML interno).
  if (containerKind === 'zip' && fileBuf.length) {
    try {
      const xmlText = await extractFirstValidXmlFromZip(fileBuf)
      if (xmlText) {
        const xmlParsed = await parseFatturaPaXml(xmlText)
        const jsonOutput = buildParsingJsonFromXml(xmlParsed, { log, documentId })
        log('PARSING_ZIP_SUCCESS', { documentId })
        return await persistAndFinalize({
          db,
          documentId,
          doc,
          docRes,
          jsonOutput,
          log,
          pipelineContext,
          preprocessedText: null,
          supplierLearningEnabled: false,
          supplierLearningRawText: null,
        })
      }
      log('PARSING_NO_XML_FOUND', { documentId, container: 'zip' })
    } catch (e) {
      log('PARSING_XML_ERROR', { documentId, error: e?.message || String(e), container: 'zip' })
      log('PARSING_NO_XML_FOUND', { documentId, container: 'zip' })
    }
  }

  // 2d) XML nativo (FatturaPA): parse diretto.
  try {
    if (isXmlFileLike({ fileRes, doc })) {
      const xmlText = base64ToUtf8(fileRes?.fileBase64 || '')
      const xmlParsed = await parseFatturaPaXml(xmlText)
      const jsonOutput = buildParsingJsonFromXml(xmlParsed, { log, documentId })
      log('PARSING_XML_SUCCESS', {
        documentId,
        data: jsonOutput?.documento?.data,
        piva_fornitore: jsonOutput?.documento?.fornitore?.piva,
        piva_cliente: jsonOutput?.documento?.cliente?.piva,
      })
      return await persistAndFinalize({
        db,
        documentId,
        doc,
        docRes,
        jsonOutput,
        log,
        pipelineContext,
        preprocessedText: null,
        supplierLearningEnabled: false,
        supplierLearningRawText: null,
      })
    }
  } catch (e) {
    log('PARSING_XML_ERROR', { documentId, error: e?.message || String(e) })
    // continue with AI / fallback logic
  }

  // 3) PDF / testo: local → Ollama; online → Claude Messages. Nessun fallback incrociato.
  const ossKind = classifyPdfOrTextForOss({ fileRes, doc })
  const ossCall = deps.callLocalAI || callLocalAI

  /** Testo documento (post preprocess o sezioni) effettivamente incluso nel prompt verso l'AI. */
  let aiInputDocumentText = null

  /** Metriche tempo LLM per AI_MONITOR (solo se è stata effettuata la chiamata). */
  let ossLlmMonitor = null
  let visionLlmMonitor = null

  let raw = null
  let usedSupplierTemplate = false
  /** JSON da supplier_templates (se match). */
  let supplierTemplateMapping = null
  /** Testo grezzo estratto (PDF/txt) per match template e apprendimento pattern. */
  let supplierLearningRawText = null
  let usedAiForSupplierLearn = false

  if (ossKind && fileRes?.fileBase64) {
    log('PARSING_AI_OSS_USED', { documentId, kind: ossKind, aiMode })

    let docText = ''
    try {
      if (ossKind === 'pdf') {
        docText = await extractPdfTextFromBuffer(fileBuf)
      } else {
        docText = base64ToUtf8(fileRes.fileBase64)
      }
    } catch (e) {
      log('AI_PARSING_OSS_TEXT_EXTRACT_FAILED', { documentId, kind: ossKind, error: e?.message || String(e) })
    }

    const fullText = String(docText || '')
    supplierLearningRawText = fullText

    const tmpl = await findSupplierTemplateMatch(db, fullText, log, documentId)
    if (tmpl?.mapping && typeof tmpl.mapping === 'object') {
      usedSupplierTemplate = true
      supplierTemplateMapping = tmpl.mapping
      log('SUPPLIER_TEMPLATE_USED', {
        documentId,
        fornitore_nome: tmpl.fornitore_nome,
        template_id: tmpl.id,
      })
      aiInputDocumentText = fullText.slice(0, Math.min(12000, fullText.length))
    } else {
      usedAiForSupplierLearn = true
      let docTextForAi = fullText
      let textReduceStats = { reduced: false }
      if (aiPreprocessMode === 'off') {
        log('AI_INPUT_MODE: RAW', { documentId })
        try {
          const er = extractRelevantSections(fullText)
          docTextForAi = er.text
          textReduceStats = er.stats
          if (textReduceStats.reduced) {
            log('AI_TEXT_REDUCED', { documentId, ...textReduceStats })
          }
        } catch (e) {
          docTextForAi = fullText
          log('AI_TEXT_EXTRACT_SECTIONS_FAILED', { documentId, error: e?.message || String(e) })
        }
      } else {
        log('AI_INPUT_MODE: PREPROCESSED', { documentId })
        try {
          const pre = preprocessInvoiceTextForAi(fullText, { maxChars: MAX_AI_DOCUMENT_CHARS })
          const usePre =
            pre.compactText.length >= 120 &&
            (pre.stats.itemRows > 0 || pre.stats.pivaHits > 0 || pre.stats.lineCount > 5)
          if (usePre) {
            docTextForAi = pre.compactText
            log('AI_INVOICE_PREPROCESSED', { documentId, ...pre.stats })
          } else {
            const er = extractRelevantSections(fullText)
            docTextForAi = er.text
            textReduceStats = er.stats
            if (textReduceStats.reduced) {
              log('AI_TEXT_REDUCED', { documentId, ...textReduceStats })
            }
          }
        } catch (e) {
          const er = extractRelevantSections(fullText)
          docTextForAi = er.text
          textReduceStats = er.stats
          log('AI_PREPROCESS_FALLBACK', { documentId, error: e?.message || String(e) })
          if (textReduceStats.reduced) {
            log('AI_TEXT_REDUCED', { documentId, ...textReduceStats })
          }
        }
      }
      docText = docTextForAi
      aiInputDocumentText = docTextForAi

      let similarDocsBlock = ''
      try {
        const memCtx = await fetchAiMemoryContextForParsing({
          db,
          documentId,
          docTextForAi,
          fullText,
          fornitoreNomeHint: null,
          log,
          maxChars: AI_MEMORY_PROMPT_MAX_CHARS,
        })
        similarDocsBlock = memCtx.block || ''
      } catch (e) {
        log('AI_MEMORY_FETCH_ERROR', { documentId, error: e?.message || String(e) })
      }

      const ossPrompt = buildOllamaAccountingPrompt(docText, fiscalPromptBody, similarDocsBlock)
      const ossInputLen = ossPrompt.length
      const ossMemoryUsed = Boolean(similarDocsBlock && String(similarDocsBlock).trim())
      const tOssLlm0 = Date.now()

      if (aiMode === 'local') {
        log('AI_MODE_LOCAL', { documentId, step: 'runParsing' })
        try {
          raw = await ossCall(ossPrompt)
        } catch (e1) {
          log('AI_PARSING_AI_CALL_FAILED', { documentId, attempt: 1, source: 'ollama', error: e1?.message || String(e1) })
          raw = null
        }
        if (raw == null) {
          try {
            raw = await ossCall(ossPrompt)
          } catch (e2) {
            log('AI_PARSING_AI_CALL_FAILED', { documentId, attempt: 2, source: 'ollama', error: e2?.message || String(e2) })
            raw = null
          }
        }
      } else {
        log('AI_MODE_ONLINE', { documentId, step: 'runParsing' })
        try {
          raw = await callClaudeTextForParsing({ userPrompt: ossPrompt, log, documentId })
        } catch (e) {
          log('AI_PARSING_ONLINE_FAILED', { documentId, error: e?.message || String(e) })
          raw = null
        }
      }
      ossLlmMonitor = {
        ms: Date.now() - tOssLlm0,
        inputLen: ossInputLen,
        memoryUsed: ossMemoryUsed,
      }
    }
  }

  const mimeLower = String(fileRes?.mimeType || doc?.mime_type || doc?.mimeType || '').toLowerCase()
  if (raw == null && aiMode === 'online' && fileRes?.fileBase64 && mimeLower.startsWith('image/')) {
    log('AI_MODE_ONLINE', { documentId, step: 'runParsing_vision' })
    const visionUserText =
      "Analizza l'immagine del documento fiscale italiano e restituisci SOLO JSON valido come richiesto nelle istruzioni di sistema."
    const visionSys = systemPromptForAi.slice(0, 12000)
    const visionInputLen = visionSys.length + visionUserText.length
    const tVisionLlm0 = Date.now()
    try {
      raw = await callClaudeVisionForParsing({
        systemPrompt: visionSys,
        userText: visionUserText,
        base64Data: fileRes.fileBase64,
        mediaType: mimeLower,
        log,
        documentId,
      })
    } catch (e) {
      log('AI_PARSING_ONLINE_FAILED', { documentId, phase: 'vision', error: e?.message || String(e) })
      raw = null
    }
    visionLlmMonitor = {
      ms: Date.now() - tVisionLlm0,
      inputLen: visionInputLen,
      memoryUsed: false,
    }
  }

  // 4) Parse JSON strictly (robust extraction if model wraps it) oppure mapping template
  let jsonOutput = null
  /** Per AI_MONITOR: parse+normalize riuscito prima del fallback qualità. */
  let parseMonitorSuccess = false
  if (usedSupplierTemplate && supplierTemplateMapping != null) {
    const normalized = normalizeModelJsonToFiscoSim(supplierTemplateMapping)
    jsonOutput = normalized || supplierTemplateMapping
    if (!jsonOutput) {
      jsonOutput = createFallbackParsingJson()
      log('SUPPLIER_TEMPLATE_MAPPING_INVALID', { documentId })
    }
  } else {
    const parsedRes = safeParseModelJson(raw)
    if (!parsedRes.ok) {
      log('AI_PARSING_INVALID_JSON', { documentId, raw_preview: String(raw || '').slice(0, 800), error: parsedRes.error })
      jsonOutput = createFallbackParsingJson()
      log('PARSING_FALLBACK_ACTIVATED', { documentId, reason: 'invalid_json_or_empty_ai' })
      parseMonitorSuccess = false
    } else {
      jsonOutput = normalizeModelJsonToFiscoSim(parsedRes.json)
      parseMonitorSuccess = !!jsonOutput
      if (!jsonOutput) {
        jsonOutput = createFallbackParsingJson()
        log('PARSING_FALLBACK_ACTIVATED', { documentId, reason: 'normalize_fiscosim_failed' })
        parseMonitorSuccess = false
      }
    }
  }

  // Intelligent fallback when parsing is low-quality/empty (non applicato al template fornitore).
  let qualityFallbackActivated = false
  const confidenceBeforeFallback = clamp01(jsonOutput?.meta?.confidence)
  if (!usedSupplierTemplate && shouldActivateFallback(jsonOutput)) {
    qualityFallbackActivated = true
    const reason = {
      confidence: confidenceBeforeFallback,
      imponibile: toNum(jsonOutput?.contabile?.imponibile),
      azioni_suggerite_len: Array.isArray(jsonOutput?.azioni_suggerite) ? jsonOutput.azioni_suggerite.length : null,
    }
    jsonOutput = createFallbackParsingJson()
    log('PARSING_FALLBACK_ACTIVATED', { documentId, reason })
  }

  const aiMonitorFinalSuccess = parseMonitorSuccess && !qualityFallbackActivated
  const docIdMonitor = documentId && String(documentId).trim() ? String(documentId).trim() : 'ai-parsing-unknown'
  const monitorDeps = { db, log }
  if (ossLlmMonitor) {
    await logAiMonitorMetrics({
      documentId: docIdMonitor,
      phase: 'runParsing_oss',
      responseTimeMs: ossLlmMonitor.ms,
      inputLength: ossLlmMonitor.inputLen,
      memoryUsed: ossLlmMonitor.memoryUsed,
      success: aiMonitorFinalSuccess,
      deps: monitorDeps,
    })
  }
  if (visionLlmMonitor) {
    await logAiMonitorMetrics({
      documentId: docIdMonitor,
      phase: 'runParsing_vision',
      responseTimeMs: visionLlmMonitor.ms,
      inputLength: visionLlmMonitor.inputLen,
      memoryUsed: visionLlmMonitor.memoryUsed,
      success: aiMonitorFinalSuccess,
      deps: monitorDeps,
    })
  }

  const confidence = clamp01(jsonOutput?.meta?.confidence)

  // 5) Persist result in ai_parsing_results
  return await persistAndFinalize({
    db,
    documentId,
    doc,
    docRes,
    jsonOutput,
    log,
    pipelineContext,
    preprocessedText: aiInputDocumentText,
    supplierLearningEnabled: Boolean(usedAiForSupplierLearn && supplierLearningRawText),
    supplierLearningRawText,
  })
}

/**
 * Backward compatible helper for orchestrator skeleton.
 * (Keeps the previously-exported function name available if you were using it.)
 */
export async function aiParsingService({ input, deps = {}, pipelineContext } = {}) {
  const documentId = input?.documentoId || input?.documentId
  if (!documentId) return { ok: false, error: 'documentoId mancante' }
  const res = await runParsing(documentId, { deps, pipelineContext })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, parsed: res.result?.json_output || {} }
}

async function loadDocumentRecord({ db, documentId }) {
  // documents, contabilità, staging import (stesso document_id per pipeline + accounting_entries)
  const tables = ['documents', 'documenti_contabilita', 'documenti_import']
  const tried = []

  for (const table of tables) {
    tried.push(table)
    const q = await db
      .from(table)
      .select('*')
      .eq('id', documentId)
      .maybeSingle()

    if (q.error) {
      // If table doesn't exist or column mismatch, try next
      continue
    }
    if (q.data) return { ok: true, table, doc: q.data }
  }

  return {
    ok: false,
    error: 'Documento non trovato (o tabella non disponibile)',
    details: { triedTables: tried },
  }
}

async function updateDocumentStatusParsed({ db, documentId, table }) {
  const tried = []

  // Try the table we loaded from first, then fall back.
  const order = table
    ? [table, 'documents', 'documenti_contabilita', 'documenti_import']
    : ['documents', 'documenti_contabilita', 'documenti_import']
  const uniq = [...new Set(order)]

  for (const t of uniq) {
    tried.push(t)
    // Try common column names used across installs:
    // - documents.status (spec)
    // - documenti_contabilita.workflow_status (schema_contabilita_completo.sql)
    // - legacy/staging: stato
    const attempts = [
      { patch: { status: 'PARSED' } },
      { patch: { workflow_status: 'parsed' } },
      { patch: { stato: 'parsed' } },
    ]

    for (const a of attempts) {
      const upd = await db.from(t).update(a.patch).eq('id', documentId).select().maybeSingle()
      if (!upd.error) return { ok: true, triedTables: tried, row: upd.data, table: t, patch: a.patch }
    }
  }

  return { ok: false, error: 'Impossibile aggiornare status documento a PARSED', triedTables: tried }
}

/**
 * Se il download da storage è vuoto (policy, path, ecc.) ma il record import ha già l'XML in
 * `ai_raw_response.xml_content`, usa quello così FatturaPA non riceve stringa vuota.
 */
function enrichFileResWithImportXmlContent(fileRes, doc, log, documentId) {
  const fr = fileRes && typeof fileRes === 'object' ? { ...fileRes } : {}
  if (typeof fr.fileBase64 === 'string' && fr.fileBase64.length > 0) return fr

  let raw = doc?.ai_raw_response
  if (raw == null) return fr
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return fr
    }
  }
  if (!raw || typeof raw !== 'object') return fr
  const xml = typeof raw.xml_content === 'string' ? raw.xml_content.trim() : ''
  if (!xml || !xml.includes('<')) return fr

  try {
    const fileBase64 = Buffer.from(xml, 'utf8').toString('base64')
    log('AI_PARSING_XML_FROM_AI_RAW_RESPONSE', { documentId, chars: xml.length })
    return {
      ...fr,
      fileBase64,
      mimeType: fr.mimeType || doc?.mime_type || doc?.mimeType || 'application/xml',
      filename: fr.filename || doc?.filename || null,
    }
  } catch (e) {
    log('AI_PARSING_XML_FROM_AI_RAW_RESPONSE_FAILED', {
      documentId,
      error: e?.message || String(e),
    })
    return fr
  }
}

async function defaultGetFileFromStorage({ db, doc }) {
  // Best-effort: infer bucket/path from record fields.
  // If nothing is available, return an empty fileBase64 so pipeline can still run with placeholders.
  const bucket =
    doc?.storage_bucket ||
    doc?.bucket ||
    doc?.bucket_name ||
    (doc?.file_url ? null : 'documenti') ||
    'documenti'

  const path =
    doc?.storage_path ||
    doc?.file_path ||
    doc?.path ||
    null

  const mimeType = doc?.mime_type || doc?.mimeType || null
  const filename = doc?.filename || null

  // If the DB stores an external URL, we could fetch it, but we keep it simple here.
  if (!path) {
    return {
      fileBase64: '',
      mimeType,
      filename,
    }
  }

  try {
    const dl = await db.storage.from(bucket).download(path)
    if (dl.error) {
      return { fileBase64: '', mimeType, filename }
    }
    const buf = await dl.data.arrayBuffer()
    const fileBase64 = Buffer.from(buf).toString('base64')
    return { fileBase64, mimeType, filename }
  } catch {
    return { fileBase64: '', mimeType, filename }
  }
}

function isXmlFileLike({ fileRes, doc }) {
  const mime = String(fileRes?.mimeType || doc?.mime_type || doc?.mimeType || '').toLowerCase()
  const fn = String(fileRes?.filename || doc?.filename || '').toLowerCase()
  // Contenitori firmati / archivi: gestiti a parte (p7m / zip).
  if (fn.endsWith('.p7m') || fn.endsWith('.zip') || mime.includes('pkcs7') || mime.includes('p7m') || mime === 'application/zip')
    return false
  if (mime.includes('xml')) return true
  if (fn.endsWith('.xml')) return true
  // Last resort: sniff content (common when mimeType is missing).
  const preview = base64ToUtf8((fileRes?.fileBase64 || '').slice(0, 256))
  if (preview.trimStart().startsWith('<')) return true
  return false
}

function base64ToUtf8(b64) {
  if (!b64) return ''
  try {
    return Buffer.from(b64, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function base64ToBuffer(b64) {
  if (!b64) return Buffer.alloc(0)
  try {
    return Buffer.from(b64, 'base64')
  } catch {
    return Buffer.alloc(0)
  }
}

/** Riconosce .p7m, .zip, XML nativo da nome/mime/magic. */
function detectContainerKind({ fileRes, doc, buf }) {
  const fn = String(fileRes?.filename || doc?.filename || '').toLowerCase()
  const mime = String(fileRes?.mimeType || doc?.mime_type || doc?.mimeType || '').toLowerCase()

  if (fn.endsWith('.p7m') || mime.includes('pkcs7') || mime.includes('x-pkcs7') || mime.includes('p7m')) {
    return 'p7m'
  }
  if (
    fn.endsWith('.zip') ||
    mime === 'application/zip' ||
    mime.includes('application/x-zip') ||
    isZipMagic(buf)
  ) {
    return 'zip'
  }
  if (fn.endsWith('.xml') || mime.includes('xml')) {
    return 'xml'
  }
  return 'unknown'
}

function isZipMagic(buf) {
  return buf && buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)
}

function normalizeXmlString(s) {
  if (s == null) return ''
  return String(s).replace(/^\uFEFF/, '').trimStart()
}

function looksLikeFatturaOrXml(s) {
  const t = normalizeXmlString(s)
  if (!t.startsWith('<')) return false
  if (t.startsWith('<?xml')) return true
  return /FatturaElettronica/i.test(t)
}

/** Legge i byte del contenuto PKCS#7 senza consumare il buffer due volte. */
function readPkcs7ContentBinaryString(content) {
  if (!content) return null
  try {
    // `bytes()` non avanza il read pointer; `getBytes()` svuota/consuma.
    if (typeof content.bytes === 'function') return content.bytes()
    if (typeof content.getBytes === 'function') return content.getBytes()
  } catch {
    return null
  }
  return null
}

/** Da buffer PKCS#7 (CADES) estrae stringa XML fattura se presente. */
function extractXmlFromP7mBuffer(buf) {
  if (!buf || buf.length < 8) return null

  try {
    const binary = buf.toString('binary')
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(binary))
    const msg = forge.pkcs7.messageFromAsn1(asn1)
    if (msg?.content) {
      const innerBin = readPkcs7ContentBinaryString(msg.content)
      if (innerBin) {
        const utf8 = Buffer.from(innerBin, 'binary').toString('utf8')
        if (looksLikeFatturaOrXml(utf8)) return normalizeXmlString(utf8)
        const nested = tryExtractXmlFromNestedPkcs7(innerBin)
        if (nested) return nested
      }
    }
  } catch {
    // fall through: scan buffer
  }

  return findXmlPayloadInBinary(buf)
}

function tryExtractXmlFromNestedPkcs7(binStr) {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(binStr))
    const msg = forge.pkcs7.messageFromAsn1(asn1)
    if (msg?.content) {
      const bin = readPkcs7ContentBinaryString(msg.content)
      if (bin) {
        const utf8 = Buffer.from(bin, 'binary').toString('utf8')
        if (utf8 && looksLikeFatturaOrXml(utf8)) return normalizeXmlString(utf8)
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Ultimo tentativo: cerca <?xml o tag FatturaElettronica nel binario. */
function findXmlPayloadInBinary(buf) {
  for (const enc of ['utf8', 'latin1']) {
    const s = buf.toString(enc)
    const markers = ['<?xml', '<p:FatturaElettronica', '<ns2:FatturaElettronica', '<FatturaElettronica']
    for (const m of markers) {
      const idx = m === '<FatturaElettronica' ? s.search(/<[^:>]*:?FatturaElettronica/i) : s.indexOf(m)
      if (idx >= 0) {
        const slice = normalizeXmlString(s.slice(idx))
        if (looksLikeFatturaOrXml(slice)) return slice
      }
    }
  }
  return null
}

/**
 * Estrae dal ZIP tutte le entry; prova in ordine lessicografico il primo XML parsabile come FatturaPA.
 * Supporta anche file .p7m dentro lo zip (estrazione PKCS#7).
 */
async function extractFirstValidXmlFromZip(buf) {
  const zip = new AdmZip(buf)
  const entries = zip.getEntries().filter((e) => !e.isDirectory)
  const sorted = [...entries].sort((a, b) => String(a.entryName).localeCompare(String(b.entryName)))

  const tryAccept = async (text) => {
    const t = normalizeXmlString(text)
    if (!looksLikeFatturaOrXml(t)) return null
    await parseFatturaPaXml(t)
    return t
  }

  for (const e of sorted) {
    const name = String(e.entryName || '').toLowerCase()
    let data
    try {
      data = e.getData()
    } catch {
      continue
    }
    if (!data || !data.length) continue

    if (name.endsWith('.p7m')) {
      const inner = extractXmlFromP7mBuffer(data)
      if (inner) {
        try {
          const ok = await tryAccept(inner)
          if (ok) return ok
        } catch {
          /* prossima entry */
        }
      }
      continue
    }

    if (name.endsWith('.xml')) {
      try {
        let ok = await tryAccept(data.toString('utf8')).catch(() => null)
        if (ok) return ok
        ok = await tryAccept(data.toString('latin1')).catch(() => null)
        if (ok) return ok
      } catch {
        /* continue */
      }
    }
  }

  for (const e of sorted) {
    const name = String(e.entryName || '').toLowerCase()
    if (name.endsWith('.p7m') || name.endsWith('.xml')) continue
    let data
    try {
      data = e.getData()
    } catch {
      continue
    }
    if (!data?.length) continue
    try {
      let ok = await tryAccept(data.toString('utf8')).catch(() => null)
      if (ok) return ok
      ok = await tryAccept(data.toString('latin1')).catch(() => null)
      if (ok) return ok
    } catch {
      /* continue */
    }
  }

  return null
}

/** Primo elemento se xml2js ha messo array. */
function xmlFirst(node) {
  if (node == null) return null
  return Array.isArray(node) ? node[0] : node
}

/**
 * Estrae nome, P.IVA (normalizzata IT…) e codice fiscale da DatiAnagrafici FatturaPA.
 * Se manca P.IVA valida, `piva` nel JSON di output usa il codice fiscale (per match anagrafica).
 */
function extractSoggettoFromFatturaPaBlock(soggettoWrapper) {
  const w = xmlFirst(soggettoWrapper)
  if (!w) return { nome: null, piva: null, codice_fiscale: null }

  const dati = xmlFirst(w.DatiAnagrafici) || w
  const anag = xmlFirst(dati?.Anagrafica) || dati?.Anagrafica || null

  const nome =
    anag?.Denominazione ||
    [anag?.Nome, anag?.Cognome].filter(Boolean).join(' ').trim() ||
    null

  const idF = xmlFirst(dati?.IdFiscaleIVA) || dati?.IdFiscaleIVA || null
  const idCodice = idF?.IdCodice != null ? String(idF.IdCodice).trim().replace(/\s/g, '') : ''
  const idPaese = (idF?.IdPaese != null ? String(idF.IdPaese) : 'IT').trim().toUpperCase() || 'IT'

  let pivaIva = null
  if (idCodice) {
    const digits = idCodice.replace(/[^0-9]/g, '')
    if (digits.length >= 9 && digits.length <= 14) {
      pivaIva = idPaese === 'IT' ? `IT${digits}`.replace(/^ITIT/i, 'IT') : `${idPaese}${digits}`
    } else if (digits.length > 0) {
      pivaIva = idPaese === 'IT' ? `IT${digits}`.replace(/^ITIT/i, 'IT') : `${idPaese}${idCodice}`
    }
  }

  const cfRaw = dati?.CodiceFiscale != null ? String(dati.CodiceFiscale).trim().replace(/\s/g, '') : ''
  const codice_fiscale = cfRaw ? cfRaw.toUpperCase() : null

  let piva = pivaIva
  if (!piva && codice_fiscale) {
    piva = codice_fiscale
  }

  return { nome, piva, codice_fiscale }
}

async function parseFatturaPaXml(xmlText) {
  if (!xmlText || !xmlText.includes('<')) throw new Error('XML vuoto o non valido')

  const stripPrefix = xmlProcessors?.stripPrefix ? [xmlProcessors.stripPrefix] : []
  const out = await parseStringPromise(xmlText, {
    explicitArray: false,
    ignoreAttrs: true,
    tagNameProcessors: stripPrefix,
  })

  const fattura =
    out?.FatturaElettronica ||
    out?.FatturaElettronicaSemplificata ||
    out?.pFatturaElettronica ||
    out

  const header = fattura?.FatturaElettronicaHeader || fattura?.Header || null
  const bodyRaw = fattura?.FatturaElettronicaBody || fattura?.Body || null
  const body = Array.isArray(bodyRaw) ? bodyRaw[0] : bodyRaw

  const cedenteWrapper = header?.CedentePrestatore || header?.Cedente || null
  const cessionarioWrapper =
    header?.CessionarioCommittatore || header?.CessionarioCommittario || header?.Cessionario || null

  const fornitore = extractSoggettoFromFatturaPaBlock(cedenteWrapper)
  const cliente = extractSoggettoFromFatturaPaBlock(cessionarioWrapper)

  const dgd = body?.DatiGenerali?.DatiGeneraliDocumento || body?.DatiGeneraliDocumento || null
  const data = dgd?.Data || dgd?.DataDocumento || null

  const riepiloghiRaw =
    body?.DatiBeniServizi?.DatiRiepilogo ||
    body?.DatiRiepilogo ||
    []

  const riepiloghi = Array.isArray(riepiloghiRaw) ? riepiloghiRaw : [riepiloghiRaw].filter(Boolean)

  const sums = riepiloghi.reduce(
    (acc, r) => {
      const imponibile = toNum(r?.ImponibileImporto)
      const imposta = toNum(r?.Imposta)
      const aliq = toNum(r?.AliquotaIVA)
      if (imponibile) acc.imponibile += imponibile
      if (imposta) acc.iva += imposta
      if (Number.isFinite(aliq) && aliq > 0) acc.aliquote.add(Math.round(aliq))
      return acc
    },
    { imponibile: 0, iva: 0, aliquote: new Set() }
  )

  const aliquota = sums.aliquote.size === 1 ? [...sums.aliquote][0] : sums.aliquote.size > 1 ? Math.max(...sums.aliquote) : 0

  return {
    data,
    fornitore,
    cliente,
    contabile: {
      imponibile: sums.imponibile,
      iva: sums.iva,
      aliquota,
    },
  }
}

function buildParsingJsonFromXml(p, ctx = {}) {
  const { log = defaultLog, documentId = null } = ctx

  const fornitore = {
    nome: p?.fornitore?.nome ?? null,
    piva: p?.fornitore?.piva ?? null,
    codice_fiscale: p?.fornitore?.codice_fiscale ?? null,
  }
  const cliente = {
    nome: p?.cliente?.nome ?? null,
    piva: p?.cliente?.piva ?? null,
    codice_fiscale: p?.cliente?.codice_fiscale ?? null,
  }

  const fornitoreMissingIds = !fornitore.piva && !fornitore.codice_fiscale
  const clienteMissingIds = !cliente.piva && !cliente.codice_fiscale

  if (fornitoreMissingIds) {
    log('MISSING_PARTIES_DATA', { documentId, party: 'cedente_prestatore_fornitore', note: 'piva_e_cf_assenti' })
  }
  if (clienteMissingIds) {
    log('MISSING_PARTIES_DATA', { documentId, party: 'cessionario_committente_cliente', note: 'piva_e_cf_assenti' })
  }

  return {
    meta: {
      confidence: 0.95,
      tipo_documento: 'fattura_passiva',
      anomalie: [],
    },
    documento: {
      data: p?.data || null,
      fornitore,
      cliente,
      cedente: { ...fornitore },
      cessionario: { ...cliente },
    },
    contabile: {
      imponibile: toNum(p?.contabile?.imponibile),
      iva: toNum(p?.contabile?.iva),
      aliquota: toNum(p?.contabile?.aliquota),
      natura: null,
    },
    azioni_suggerite: ['registrazione_acquisto'],
  }
}

async function persistAndFinalize({
  db,
  documentId,
  doc,
  docRes,
  jsonOutput,
  log,
  pipelineContext,
  preprocessedText = null,
  supplierLearningEnabled = false,
  supplierLearningRawText = null,
}) {
  const confidence = clamp01(jsonOutput?.meta?.confidence)

  const ins = await db
    .from('ai_parsing_results')
    .upsert([{ document_id: documentId, json_output: jsonOutput, confidence }], { onConflict: 'document_id' })
    .select()

  if (ins.error) {
    log('AI_PARSING_DB_WRITE_FAILED', { documentId, error: ins.error?.message || ins.error })
    return { ok: false, step: 'db_insert_ai_parsing_results', error: ins.error?.message || String(ins.error) }
  }

  if (supplierLearningEnabled && supplierLearningRawText) {
    try {
      await maybeLearnSupplierTemplate(db, documentId, jsonOutput, supplierLearningRawText, log)
    } catch (e) {
      log('SUPPLIER_TEMPLATE_LEARN_WRAPPER_ERROR', { documentId, error: e?.message || String(e) })
    }
  }

  const rawLen =
    preprocessedText != null && typeof preprocessedText === 'string' ? preprocessedText.length : 0
  let layoutHash = null
  if (rawLen > 0) {
    try {
      const truncated =
        rawLen > MAX_PREPROCESSED_TEXT_DB
          ? `${preprocessedText.slice(0, MAX_PREPROCESSED_TEXT_DB)}\n[...TRONCATO_PER_LIMITE_DB...]`
          : preprocessedText
      layoutHash = createLayoutHash(preprocessedText)
      const lineCount = String(preprocessedText).split(/\r?\n/).length
      log('LAYOUT_HASH_CREATED', {
        documentId,
        layout_hash: layoutHash,
        lines_in_text: lineCount,
        lines_used_for_hash: Math.min(LAYOUT_HASH_LINE_COUNT, lineCount),
      })

      const updPre = await db
        .from('ai_parsing_results')
        .update({
          preprocessed_text: truncated,
          preprocessed_text_length: rawLen,
          layout_hash: layoutHash,
          updated_at: new Date().toISOString(),
        })
        .eq('document_id', documentId)

      if (updPre.error) {
        log('PREPROCESSING_SAVE_SKIPPED', {
          documentId,
          error: updPre.error?.message || String(updPre.error),
        })
      } else {
        log('PREPROCESSING_SAVED', {
          documentId,
          preprocessed_text_length: rawLen,
          stored_chars: truncated.length,
          truncated: rawLen > MAX_PREPROCESSED_TEXT_DB,
          layout_hash: layoutHash,
        })
      }
    } catch (e) {
      log('PREPROCESSING_SAVE_ERROR', { documentId, error: e?.message || String(e) })
    }
  }

  const upd = await updateDocumentStatusParsed({ db, documentId, table: docRes.table })
  if (!upd.ok) {
    log('AI_PARSING_DOC_STATUS_UPDATE_FAILED', { documentId, error: upd.error, triedTables: upd.triedTables })
  }

  try {
    const sup = await aiSupervisorService({
      ivaRows: [],
      righe: [],
      documentoTotale: toNum(doc?.totale ?? jsonOutput?.contabile?.imponibile + jsonOutput?.contabile?.iva ?? null),
      pipelineContext,
    })
    if (!sup.ok) log('AI_PARSING_SUPERVISOR_REJECT', { documentId, error: sup.error, details: sup.details })
    else log('AI_PARSING_SUPERVISOR_OK', { documentId })
  } catch (e) {
    log('AI_PARSING_SUPERVISOR_ERROR', { documentId, error: e?.message || String(e) })
  }

  return {
    ok: true,
    result: {
      documentId,
      confidence,
      json_output: jsonOutput,
      db_result: ins.data?.[0] ?? null,
      status_updated: Boolean(upd.ok),
      layout_hash: layoutHash,
    },
  }
}

function shouldActivateFallback(jsonOutput) {
  const conf = clamp01(jsonOutput?.meta?.confidence)
  const imponibile = toNum(jsonOutput?.contabile?.imponibile)
  const azioni = Array.isArray(jsonOutput?.azioni_suggerite) ? jsonOutput.azioni_suggerite : []
  const nome = jsonOutput?.documento?.fornitore?.nome
  const hasFornitore = typeof nome === 'string' && nome.trim().length >= 2

  // Non scartare risultati plausibili solo perché imponibile è 0 (es. note di credito / parsing importi IT)
  if (conf < 0.5) return true
  if (azioni.length === 0) return true
  if (imponibile === 0 && !hasFornitore) return true
  return false
}

function createFallbackParsingJson() {
  return {
    meta: {
      confidence: 0.8,
      tipo_documento: 'fattura_passiva',
      anomalie: ['FALLBACK_MODE'],
    },
    documento: {
      data: new Date().toISOString(),
      fornitore: {
        nome: 'Fornitore Test',
        piva: 'IT00000000000',
      },
    },
    contabile: {
      imponibile: 100,
      iva: 22,
      aliquota: 22,
      natura: null,
    },
    azioni_suggerite: ['registrazione_acquisto'],
  }
}

/** PDF o testo: candidato a Ollama. Mai per XML (gestito da parser dedicato). */
function classifyPdfOrTextForOss({ fileRes, doc }) {
  if (isXmlFileLike({ fileRes, doc })) return null

  const mime = String(fileRes?.mimeType || doc?.mime_type || doc?.mimeType || '').toLowerCase()
  const fn = String(fileRes?.filename || doc?.filename || '').toLowerCase()

  if (mime === 'application/pdf' || fn.endsWith('.pdf')) return 'pdf'
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    fn.endsWith('.txt') ||
    fn.endsWith('.csv') ||
    fn.endsWith('.md') ||
    fn.endsWith('.json')
  ) {
    return 'text'
  }
  return null
}

/** Estrae testo da PDF (pdfjs-dist) per passarlo al modello locale. */
async function extractPdfTextFromBuffer(buf) {
  if (!buf || !buf.length) return ''
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    const loadingTask = getDocument({ data, disableRange: true, disableStream: true })
    const pdf = await loadingTask.promise
    const maxPages = Math.min(pdf.numPages, 50)
    const parts = []
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i)
      const tc = await page.getTextContent()
      const line = tc.items.map((it) => (it && typeof it.str === 'string' ? it.str : '')).join(' ')
      parts.push(line)
    }
    return parts.join('\n').trim()
  } catch {
    return ''
  }
}

/** Righe iniziali considerate intestazione (mittente, cliente, numeri documento). */
const SECTION_HEADER_MAX_LINES = 100

/** Ultime righe: di solito contengono totali, IVA, riepiloghi. */
const SECTION_TAIL_LINES = 50

/** Massimo righe “dettaglio” con importi incluse nel corpo centrale (oltre si campiona). */
const SECTION_DETAIL_MAX_LINES = 450

/** Sotto queste soglie il testo viene inviato intero al modello (nessuna ricomposizione). */
const PASSTHROUGH_MAX_CHARS = 12000
const PASSTHROUGH_MAX_LINES = 200

/**
 * Estrae intestazione, righe con importi e zona totali da testo lungo (PDF/txt),
 * evitando un semplice slice iniziale che taglierebbe i totali in fondo.
 *
 * @param {string} text
 * @returns {{ text: string, stats: Record<string, unknown> }}
 */
export function extractRelevantSections(text) {
  const raw = text == null ? '' : String(text)
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const originalChars = normalized.length

  const lines = normalized.split('\n')
  const n = lines.length

  if (originalChars === 0) {
    return {
      text: '',
      stats: {
        reduced: false,
        originalChars: 0,
        outputChars: 0,
        strategy: 'empty',
        headerLines: 0,
        detailLines: 0,
        totalsLines: 0,
        omittedDetailLines: 0,
        cappedByMaxChars: false,
      },
    }
  }

  if (originalChars <= PASSTHROUGH_MAX_CHARS && n <= PASSTHROUGH_MAX_LINES) {
    return {
      text: normalized,
      stats: {
        reduced: false,
        originalChars,
        outputChars: originalChars,
        originalLines: n,
        strategy: 'passthrough',
        headerLines: n,
        detailLines: 0,
        totalsLines: 0,
        omittedDetailLines: 0,
        cappedByMaxChars: false,
        maxChars: MAX_AI_DOCUMENT_CHARS,
      },
    }
  }

  // Poche righe ma molto testo: evita slice(0, N) che taglia i totali; tieni inizio e fine.
  if (n < 12 && originalChars > MAX_AI_DOCUMENT_CHARS) {
    const half = Math.floor(MAX_AI_DOCUMENT_CHARS / 2) - 80
    const assembled = `${normalized.slice(0, half)}\n[... omettito centro documento ...]\n${normalized.slice(-half)}`
    let text = assembled
    if (text.length > MAX_AI_DOCUMENT_CHARS) {
      text = text.slice(0, MAX_AI_DOCUMENT_CHARS - 60) + '\n[... FINE ESTRATTO ...]'
    }
    return {
      text,
      stats: {
        reduced: true,
        originalChars,
        outputChars: text.length,
        originalLines: n,
        strategy: 'char_bisect_few_lines',
        headerLines: 0,
        detailLines: 0,
        totalsLines: 0,
        omittedDetailLines: 0,
        cappedByMaxChars: true,
        maxChars: MAX_AI_DOCUMENT_CHARS,
      },
    }
  }

  let headerEnd = Math.min(SECTION_HEADER_MAX_LINES, n)
  let tailStart = Math.max(0, n - SECTION_TAIL_LINES)
  if (headerEnd > tailStart) {
    const third = Math.max(1, Math.floor(n / 3))
    headerEnd = Math.min(third, n)
    tailStart = Math.max(headerEnd, n - third)
  }

  const headerLines = lines.slice(0, headerEnd)
  const tailLines = lines.slice(tailStart)

  const middleLines = lines.slice(headerEnd, tailStart)
  const detailCandidates = []
  for (let i = 0; i < middleLines.length; i++) {
    const line = middleLines[i]
    if (lineLooksLikeAmountRow(line) || lineLooksLikeTotalsLine(line)) detailCandidates.push(line)
  }

  let detailLines = detailCandidates
  let omittedDetailLines = 0
  if (detailLines.length > SECTION_DETAIL_MAX_LINES) {
    const keep = Math.floor(SECTION_DETAIL_MAX_LINES / 2)
    const head = detailLines.slice(0, keep)
    const tailD = detailLines.slice(-keep)
    omittedDetailLines = detailLines.length - head.length - tailD.length
    detailLines = [
      ...head,
      `[... ${omittedDetailLines} righe dettaglio omesse (campione centrale); importi e totali sotto ...]`,
      ...tailD,
    ]
  }

  const headerBlock = headerLines.join('\n').trimEnd()
  const detailBlock = detailLines.join('\n').trimEnd()
  const totalsBlock = tailLines.join('\n').trimEnd()

  let assembled =
    `=== INTESTAZIONE ===\n${headerBlock}\n\n=== DETTAGLIO RIGHE (importi) ===\n${detailBlock || '(nessuna riga con importi rilevata)'}\n\n=== TOTALI E CHIUSURA ===\n${totalsBlock}`

  let cappedByMaxChars = false
  if (assembled.length > MAX_AI_DOCUMENT_CHARS) {
    cappedByMaxChars = true
    const reserveTotals = Math.min(totalsBlock.length + 500, Math.floor(MAX_AI_DOCUMENT_CHARS * 0.22))
    const reserveHeader = Math.min(headerBlock.length + 400, Math.floor(MAX_AI_DOCUMENT_CHARS * 0.25))
    let budgetMiddle = MAX_AI_DOCUMENT_CHARS - reserveTotals - reserveHeader - 120
    if (budgetMiddle < 2000) budgetMiddle = 2000

    const headPart = headerBlock.slice(0, reserveHeader)
    const tailPart = totalsBlock.slice(-(reserveTotals))
    let mid = detailBlock
    if (mid.length > budgetMiddle) {
      const half = Math.floor(budgetMiddle / 2) - 40
      mid = `${mid.slice(0, half)}\n[... dettaglio troncato per limite caratteri ...]\n${mid.slice(-half)}`
    }
    assembled = `=== INTESTAZIONE ===\n${headPart}\n\n=== DETTAGLIO RIGHE (importi) ===\n${mid}\n\n=== TOTALI E CHIUSURA ===\n${tailPart}`
    if (assembled.length > MAX_AI_DOCUMENT_CHARS) {
      assembled = assembled.slice(0, MAX_AI_DOCUMENT_CHARS - 80) + '\n[... FINE ESTRATTO ...]'
    }
  }

  const outputChars = assembled.length
  const savedChars = originalChars - outputChars
  const reduced =
    omittedDetailLines > 0 || cappedByMaxChars || (savedChars >= 400 && outputChars < originalChars)

  return {
    text: assembled,
    stats: {
      reduced,
      originalChars,
      outputChars,
      savedChars,
      originalLines: n,
      strategy: 'sections_header_detail_totals',
      headerLines: headerLines.length,
      detailLines: detailCandidates.length,
      totalsLines: tailLines.length,
      omittedDetailLines,
      cappedByMaxChars,
      maxChars: MAX_AI_DOCUMENT_CHARS,
    },
  }
}

/** Contiene importi tipici fattura italiana (1.234,56 / 123,45). */
function lineLooksLikeAmountRow(line) {
  const s = String(line || '')
  if (!s.trim()) return false
  // Esclude righe che sono solo titoli tabella senza numeri
  if (/\b(qty|quant|descriz|cod\.?|art\.?)\b/i.test(s) && !/\d[.,]\d{2}/.test(s)) return false
  return (
    /\d{1,3}(?:\.\d{3})+[,\.]\d{2}/.test(s) ||
    /\d+[,\.]\d{2}/.test(s) ||
    /(?:€|EUR)\s*\d/.test(s) ||
    /\d\s*(?:€|EUR)\b/i.test(s)
  )
}

/** Righe di riepilogo / totali (chiavi italiane comuni). */
function lineLooksLikeTotalsLine(line) {
  const s = String(line || '')
  if (!s.trim()) return false
  if (
    /\b(totale|imponibil|imposta|aliquot|iva\b|netto|lordo|saldo|documento|pagar|importo|bollo|ritenut|scont|arrotond|versare)\b/i.test(
      s
    )
  )
    return true
  return false
}

function buildOllamaAccountingPrompt(docText, fiscalAppendix = '', similarDocsBlock = '') {
  const t = String(docText || '').trim() || '(vuoto)'
  const fk = String(fiscalAppendix || '').trim()
  const fkBlock = fk
    ? `\n--- Conoscenza fiscale e contabile (database FiscoSim) ---\n${fk}\n`
    : ''
  const mem = String(similarDocsBlock || '').trim()
  const memBlock = mem
    ? `\n--- MEMORIA (prima del documento — riferimento principale se coerente) ---\n${mem}\n`
    : ''
  const memHint = mem
    ? ''
    : `\n${AI_MEMORY_IMPORTANT_BLOCK}\n(Non sono disponibili esempi da memoria per questo documento.)\n`
  return `Sei un esperto contabile italiano.
Estrai i dati da questo documento e restituisci JSON con:

* data
* imponibile
* iva
* aliquota
* fornitore
* partita iva
* tipo documento

Ordine nel prompt (rispettalo):
1) MEMORIA documenti simili — se presente, include IMPORTANTE: segui gli esempi come riferimento principale quando coerenti con il testo sotto.
2) Conoscenza fiscale (database), se presente.
3) Testo documento — fonte da verificare sempre; se memoria e testo sono in conflitto su dati oggettivi, privilegia il testo documento.

Se il testo inizia con "RIEPILOGO_STRUTTURATO", è una sintesi deterministica dal PDF (importi in formato 12.34, P.IVA, righe dettaglio): usala come fonte primaria.

Restituisci SOLO un JSON valido con la struttura standard FiscoSim (nessun testo prima o dopo):

{
  "meta": { "confidence": 0-1, "tipo_documento": "", "anomalie": [] },
  "documento": { "data": "", "fornitore": { "nome": "", "piva": "" } },
  "contabile": { "imponibile": 0, "iva": 0, "aliquota": 0, "natura": null },
  "azioni_suggerite": ["registrazione_acquisto"]
}

Regole:
- "fornitore" -> documento.fornitore.nome; "partita iva" -> documento.fornitore.piva
- "tipo documento" -> meta.tipo_documento
- data preferibilmente YYYY-MM-DD
- valori mancanti: null; se incerto abbassa meta.confidence
- mantieni azioni_suggerite con registrazione_acquisto per acquisti passivi
${memHint}${memBlock}${fkBlock}
--- Documento (testo da analizzare) ---
${t}
`
}

/** Normalizza risposta modello (FiscoSim pieno o oggetto "piatto") al formato salvato in ai_parsing_results. */
function normalizeModelJsonToFiscoSim(j) {
  if (!j || typeof j !== 'object') return null

  if (j.meta && j.documento && j.contabile) {
    const azioni = Array.isArray(j.azioni_suggerite) ? j.azioni_suggerite : []
    return {
      meta: {
        confidence: clamp01(j.meta.confidence),
        tipo_documento: j.meta.tipo_documento ?? null,
        anomalie: Array.isArray(j.meta.anomalie) ? j.meta.anomalie : [],
      },
      documento: {
        data: j.documento?.data ?? null,
        fornitore: {
          nome: j.documento?.fornitore?.nome ?? null,
          piva: j.documento?.fornitore?.piva ?? null,
        },
      },
      contabile: {
        imponibile: toNum(j.contabile?.imponibile),
        iva: toNum(j.contabile?.iva),
        aliquota: toNum(j.contabile?.aliquota),
        natura: j.contabile?.natura ?? null,
      },
      azioni_suggerite: azioni.length ? azioni : ['registrazione_acquisto'],
    }
  }

  const tipoDoc = j.tipo_documento ?? j['tipo documento'] ?? null
  const pivaRaw = j.partita_iva ?? j.partitaIva ?? j['partita iva'] ?? j.piva ?? null
  let nomeFornitore = null
  if (typeof j.fornitore === 'string') nomeFornitore = j.fornitore
  else if (j.fornitore && typeof j.fornitore === 'object')
    nomeFornitore = j.fornitore.nome ?? j.fornitore.denominazione ?? null
  else nomeFornitore = j.fornitore_nome ?? j.fornitoreNome ?? null

  const pivaStr = pivaRaw != null && String(pivaRaw).trim() ? String(pivaRaw).trim() : null

  return {
    meta: {
      confidence: clamp01(j.confidence != null ? j.confidence : 0.75),
      tipo_documento: tipoDoc,
      anomalie: [],
    },
    documento: {
      data: j.data ?? null,
      fornitore: {
        nome: nomeFornitore,
        piva: pivaStr,
      },
    },
    contabile: {
      imponibile: toNum(j.imponibile),
      iva: toNum(j.iva),
      aliquota: toNum(j.aliquota),
      natura: null,
    },
    azioni_suggerite: ['registrazione_acquisto'],
  }
}

function safeParseModelJson(raw) {
  const s = String(raw || '').trim()
  if (!s) return { ok: false, error: 'Risposta AI vuota' }

  // Common wrappers: ```json ... ```
  const noFences = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const direct = tryJson(noFences)
  if (direct.ok) return direct

  // Try to extract the first JSON object block.
  const extracted = extractFirstJsonObject(noFences)
  if (extracted) {
    const parsed = tryJson(extracted)
    if (parsed.ok) return parsed
  }

  return { ok: false, error: 'JSON parse failed' }
}

function tryJson(txt) {
  try {
    return { ok: true, json: JSON.parse(txt) }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

function extractFirstJsonObject(txt) {
  const start = txt.indexOf('{')
  if (start < 0) return null
  // Simple brace matching.
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

function clamp01(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0
  const it = parseItalianAmount(v)
  if (it != null) return Math.round(it * 100) / 100
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function defaultLog(event, payload) {
  // Simple production-friendly logging; can be replaced with traceStep if you want.
  if (payload === undefined) console.log(`[aiParsingService] ${event}`)
  else console.log(`[aiParsingService] ${event}`, payload)
}
 
