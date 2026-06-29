import { parseFatturaFile } from './importContabilitaParser.js'
import { buildBatchReport, buildStagingRow } from './importContabilitaBuilders.js'
import { normalizeImportContabilitaInputFiles } from './importContabilitaInputNormalizer.js'
import { createEmptyParsedDocument } from '../domain/parserContract.js'
import { loadImportContabilitaDedupCandidatesBySocieta } from '../data/importContabilitaRepo.js'
import { REPORT_OUTCOMES } from '../domain/reportContract.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function makeBatchId(options = {}) {
  const explicit = normalizeText(options.batchId)
  if (explicit) return explicit
  return `ic-${Date.now()}`
}

function createParseErrorParsedDoc(fileLike, error, options = {}) {
  const parsed = createEmptyParsedDocument()
  parsed.filename = normalizeText(fileLike?.name || options.filename || '')
  parsed.sourceHash = normalizeText(options.sourceHash || '')
  parsed.errors = [
    {
      code: 'parse_failed',
      message: error?.message || 'Errore sconosciuto durante il parsing.',
    },
  ]
  return parsed
}

function normalizeKeyText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeDateKey(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return normalized.slice(0, 10)
}

function normalizeMoneyKey(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '')
  const normalized = compact.includes(',') && compact.includes('.')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.includes(',')
      ? compact.replace(',', '.')
      : compact
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return ''
  return parsed.toFixed(2)
}

function normalizePartyToken(value) {
  return normalizeKeyText(value)
}

function collectPartyTokens(source) {
  const tokens = new Set()
  const push = (value) => {
    const token = normalizePartyToken(value)
    if (token) tokens.add(token)
  }

  if (!source || typeof source !== 'object') return tokens
  push(source.piva)
  push(source.partitaIva)
  push(source.cf)
  push(source.codiceFiscale)
  push(source.denominazione)
  push(source.descrizione)
  push(source.ragioneSociale)
  push(source.nome)
  push(source.cognome)
  return tokens
}

function extractAiRawObject(raw) {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function collectParsedDocTokens(parsedDoc) {
  const tokens = new Set()
  for (const value of collectPartyTokens(parsedDoc?.fornitore)) tokens.add(value)
  for (const value of collectPartyTokens(parsedDoc?.cliente)) tokens.add(value)
  return tokens
}

function collectStagingRowTokens(row) {
  const raw = extractAiRawObject(row?.ai_raw_response || row?.aiRawResponse || null)
  const tokens = new Set()
  const add = (value) => {
    const token = normalizePartyToken(value)
    if (token) tokens.add(token)
  }

  add(raw?.cedente_piva)
  add(raw?.cedente_cf)
  add(raw?.cedente_denom)
  add(raw?.cedente_denominazione)
  add(raw?.cessionario_piva)
  add(raw?.cessionario_cf)
  add(raw?.cessionario_denom)
  add(raw?.cessionario_denominazione)
  add(row?.cedente_piva)
  add(row?.cedente_cf)
  add(row?.cedente_denom)
  add(row?.cedente_denominazione)
  add(row?.cessionario_piva)
  add(row?.cessionario_cf)
  add(row?.cessionario_denom)
  add(row?.cessionario_denominazione)
  add(row?.soggetto_piva)
  add(row?.soggetto_cf)
  add(row?.soggetto_denominazione)
  return tokens
}

function collectAccountingRowTokens(row) {
  const tokens = new Set()
  const add = (value) => {
    const token = normalizePartyToken(value)
    if (token) tokens.add(token)
  }

  add(row?.soggetto_piva)
  add(row?.soggetto_cf)
  add(row?.soggetto_denominazione)
  add(row?.cliente_fornitore_nome)
  return tokens
}

function buildDedupKeyVariants({
  tipoDocumento,
  numeroDocumento,
  dataDocumento,
  totale,
  tokens = [],
}) {
  const tipo = normalizeKeyText(tipoDocumento)
  const numero = normalizeKeyText(numeroDocumento)
  const data = normalizeDateKey(dataDocumento)
  const total = normalizeMoneyKey(totale)
  const tokenList = Array.from(new Set(Array.isArray(tokens) ? tokens : []))
  if (!tipo || !numero || !data || !total || !tokenList.length) return new Set()

  const base = `${tipo}|${numero}|${data}|${total}|`
  return new Set(tokenList.map((token) => `${base}${token}`))
}

function getParsedDocKey(parsedDoc) {
  return normalizeText(parsedDoc?.id || parsedDoc?.sourceHash || parsedDoc?.filename)
}

function normalizeDedupSourceRow(row) {
  return row && typeof row === 'object' ? row : null
}

function isActiveStagingRow(row) {
  const stato = normalizeKeyText(row?.stato)
  return ['pending', 'classified', 'manual_pending'].includes(stato)
}

function isDeletedStagingRow(row) {
  const stato = normalizeKeyText(row?.stato)
  return ['deleted', 'cancelled', 'canceled', 'annullato', 'annullata', 'archived'].includes(stato)
}

function isActiveAccountingRow(row) {
  const workflowStatus = normalizeKeyText(row?.workflow_status)
  const validationStatus = normalizeKeyText(row?.validation_status)
  return (
    ['confirmed', 'registered', 'registrata'].includes(workflowStatus) ||
    ['confirmed', 'registered', 'registrata'].includes(validationStatus) ||
    Boolean(normalizeText(row?.registered_at)) ||
    Boolean(normalizeText(row?.prima_nota_id))
  )
}

function isDeletedAccountingRow(row) {
  const workflowStatus = normalizeKeyText(row?.workflow_status)
  const validationStatus = normalizeKeyText(row?.validation_status)
  return ['deleted', 'cancelled', 'canceled', 'annullato', 'annullata', 'archived'].includes(workflowStatus) ||
    ['deleted', 'cancelled', 'canceled', 'annullato', 'annullata', 'archived'].includes(validationStatus)
}

function buildDedupSummaryFromParsedDoc(parsedDoc, classification, existingRow = null) {
  const row = parsedDoc || {}
  const fornitore = row?.fornitore || {}
  const cliente = row?.cliente || {}
  const summary = {
    id: getParsedDocKey(row),
    filename: normalizeText(row?.filename),
    sourceHash: normalizeText(row?.sourceHash),
    tipoDocumento: normalizeText(row?.tipoDocumento),
    numeroDocumento: normalizeText(row?.numeroDocumento),
    dataDocumento: normalizeText(row?.dataDocumento),
    totale: Number(row?.totale || 0) || 0,
    fornitore: {
      denominazione: normalizeText(fornitore?.denominazione),
      partitaIva: normalizeText(fornitore?.partitaIva),
      codiceFiscale: normalizeText(fornitore?.codiceFiscale),
    },
    cliente: {
      denominazione: normalizeText(cliente?.denominazione),
      partitaIva: normalizeText(cliente?.partitaIva),
      codiceFiscale: normalizeText(cliente?.codiceFiscale),
    },
    classification,
    reasonCode: classification,
    existingRowId: normalizeText(existingRow?.id),
  }

  if (classification === 'deletedInStaging' || classification === 'deletedInAccounting') {
    summary.parsedDoc = buildReimportParsedDocSnapshot(parsedDoc)
  }

  return summary
}

function buildReimportParsedDocSnapshot(parsedDoc) {
  const row = parsedDoc && typeof parsedDoc === 'object' ? parsedDoc : {}
  const fornitore = row?.fornitore && typeof row.fornitore === 'object' ? row.fornitore : {}
  const cliente = row?.cliente && typeof row.cliente === 'object' ? row.cliente : {}

  return {
    filename: normalizeText(row?.filename),
    sourceHash: normalizeText(row?.sourceHash),
    tipoDocumento: normalizeText(row?.tipoDocumento),
    dataDocumento: normalizeText(row?.dataDocumento),
    numeroDocumento: normalizeText(row?.numeroDocumento),
    fornitore: {
      denominazione: normalizeText(fornitore?.denominazione),
      partitaIva: normalizeText(fornitore?.partitaIva),
      codiceFiscale: normalizeText(fornitore?.codiceFiscale),
    },
    cliente: {
      denominazione: normalizeText(cliente?.denominazione),
      partitaIva: normalizeText(cliente?.partitaIva),
      codiceFiscale: normalizeText(cliente?.codiceFiscale),
    },
    imponibile: Number(row?.imponibile || 0) || 0,
    iva: Number(row?.iva || 0) || 0,
    totale: Number(row?.totale || 0) || 0,
    ivaRows: Array.isArray(row?.ivaRows) ? row.ivaRows.map((item) => ({ ...item })) : [],
    flags: row?.flags && typeof row.flags === 'object'
      ? { ...row.flags }
      : { reverseCharge: false, splitPayment: false, hasRitenuta: false, isProfessional: false },
    warnings: Array.isArray(row?.warnings) ? row.warnings.slice() : [],
    errors: Array.isArray(row?.errors) ? row.errors.slice() : [],
    rawXml: normalizeText(row?.rawXml),
    lineeDocumento: Array.isArray(row?.lineeDocumento) ? row.lineeDocumento.map((item) => ({ ...item })) : [],
  }
}

function buildClassifiedParsedDoc(parsedDoc, lookup, batchSeenKeys) {
  const keyVariants = buildDedupKeyVariants({
    tipoDocumento: parsedDoc?.tipoDocumento,
    numeroDocumento: parsedDoc?.numeroDocumento,
    dataDocumento: parsedDoc?.dataDocumento,
    totale: parsedDoc?.totale,
    tokens: Array.from(collectParsedDocTokens(parsedDoc)),
  })

  let classification = 'importable'
  let reportOutcome = REPORT_OUTCOMES.imported
  let severity = 'info'
  let reasonCode = 'imported'
  let matchedRow = null

  const resolveMatch = (map) => {
    for (const key of keyVariants) {
      if (map.has(key)) return map.get(key)
    }
    return null
  }

  if (keyVariants.size) {
    matchedRow = resolveMatch(lookup.activeStagingByKey)
    if (matchedRow) {
      classification = 'duplicateInStaging'
      reportOutcome = REPORT_OUTCOMES.blocked_duplicate
      severity = 'warning'
      reasonCode = 'duplicate_in_staging'
    } else {
      matchedRow = resolveMatch(lookup.activeAccountingByKey)
      if (matchedRow) {
        classification = 'duplicateInAccounting'
        reportOutcome = REPORT_OUTCOMES.blocked_accounted
        severity = 'error'
        reasonCode = 'duplicate_in_accounting'
      } else {
        matchedRow = resolveMatch(lookup.deletedStagingByKey)
        if (matchedRow) {
          classification = 'deletedInStaging'
          reportOutcome = REPORT_OUTCOMES.warning_reimport
          severity = 'warning'
          reasonCode = 'deleted_in_staging'
        } else {
          matchedRow = resolveMatch(lookup.deletedAccountingByKey)
          if (matchedRow) {
            classification = 'deletedInAccounting'
            reportOutcome = REPORT_OUTCOMES.warning_reimport
            severity = 'warning'
            reasonCode = 'deleted_in_accounting'
          } else {
            const batchDuplicate = Array.from(keyVariants).some((key) => batchSeenKeys.has(key))
            if (batchDuplicate) {
              classification = 'duplicateInStaging'
              reportOutcome = REPORT_OUTCOMES.blocked_duplicate
              severity = 'warning'
              reasonCode = 'batch_duplicate'
            }
          }
        }
      }
    }
    for (const key of keyVariants) batchSeenKeys.add(key)
  }

  return {
    parsedDoc,
    keyVariants,
    classification,
    reportOutcome,
    severity,
    reasonCode,
    matchedRow,
    summary: buildDedupSummaryFromParsedDoc(parsedDoc, classification, matchedRow),
  }
}

function computeReportTotals(items) {
  return items.reduce(
    (acc, item) => {
      acc.files += 1
      if (item.outcome === REPORT_OUTCOMES.imported) acc.imported += 1
      if (item.outcome === REPORT_OUTCOMES.blocked_duplicate || item.outcome === REPORT_OUTCOMES.blocked_accounted) acc.blocked += 1
      if (item.outcome === REPORT_OUTCOMES.warning_reimport) acc.warnings += 1
      if (item.outcome === REPORT_OUTCOMES.parse_error) acc.errors += 1
      return acc
    },
    { files: 0, imported: 0, blocked: 0, warnings: 0, errors: 0 },
  )
}

// Yield control to the event loop to avoid blocking the main thread during large batch processing.
// This is critical to prevent Supabase connection timeouts when parsing hundreds of XML files.
function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function runImportWorkflow(files = [], options = {}) {
  const list = Array.isArray(files) ? files : []
  if (!list.length) {
    return {
      ok: false,
      reason: 'no_files',
      batchId: makeBatchId(options),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      parsedDocs: [],
      stagingRows: [],
      report: null,
    }
  }

  const batchId = makeBatchId(options)
  const startedAt = new Date().toISOString()
  const _t0 = Date.now()
  console.log(`[DIAG_IMPORT] === runImportWorkflow START === batch=${batchId} files=${list.length} societaId=${options.societaId || 'none'}`)

  // ── FASE 1: zip_open_start / file_filter_start / zip_open_end ──────────────
  const _tZipStart = Date.now()
  console.log(`[DIAG_IMPORT] FASE zip_open_start: t=0ms inputFiles=${list.length}`)
  const inputPreparation = await normalizeImportContabilitaInputFiles(list, options)
  const _tZipEnd = Date.now()
  const preparedFiles = Array.isArray(inputPreparation.preparedFiles) ? inputPreparation.preparedFiles : []
  console.log(`[DIAG_IMPORT] FASE zip_open_end: durata=${_tZipEnd - _tZipStart}ms preparedXml=${preparedFiles.length} scartati=${inputPreparation.discardedFilesCount} ragioniScarto=${JSON.stringify(inputPreparation.discardedReasons?.map(r => `${r.code}:${r.count}`) || [])}`)

  // ── FASE 2: xml_parse_start ─────────────────────────────────────────────────
  const _tParseStart = Date.now()
  console.log(`[DIAG_IMPORT] FASE xml_parse_start: filesDaParsare=${preparedFiles.length}`)
  const parsedDocs = []

  // Parse in chunks of PARSE_CHUNK_SIZE to yield between batches and avoid blocking
  // the main thread for hundreds of ms, which causes Supabase to timeout.
  const PARSE_CHUNK_SIZE = 50
  let parseErrors = 0
  for (let i = 0; i < preparedFiles.length; i += PARSE_CHUNK_SIZE) {
    const chunk = preparedFiles.slice(i, i + PARSE_CHUNK_SIZE)
    for (const fileLike of chunk) {
      try {
        const parsed = await parseFatturaFile(fileLike)
        parsedDocs.push({
          ...parsed,
          filename: normalizeText(fileLike?.name || parsed?.filename || ''),
          sourceHash: normalizeText(parsed?.sourceHash || options.sourceHash || ''),
        })
      } catch (error) {
        parseErrors += 1
        parsedDocs.push(createParseErrorParsedDoc(fileLike, error, options))
      }
    }
    // Yield every PARSE_CHUNK_SIZE files so the event loop can process other tasks
    // (e.g. keep Supabase connection alive, respond to browser events)
    if (i + PARSE_CHUNK_SIZE < preparedFiles.length) {
      await yieldToEventLoop()
    }
  }

  const _tParseEnd = Date.now()
  console.log(`[DIAG_IMPORT] FASE xml_parse_end: durata=${_tParseEnd - _tParseStart}ms parsedDocs=${parsedDocs.length} erroriParsing=${parseErrors}`)

  // ── FASE 3: dedup_candidates_start ─────────────────────────────────────────
  const _tDedupStart = Date.now()
  console.log(`[DIAG_IMPORT] FASE dedup_candidates_start: societaId=${options.societaId || 'none'} tabelle=[documenti_import,documenti_contabilita] limit=500`)
  let dedupCandidates
  try {
    dedupCandidates = options.dedupCandidates
      || (options.societaId
        ? await loadImportContabilitaDedupCandidatesBySocieta(options.societaId)
        : { stagingRows: [], accountingRows: [] })
  } catch (dedupError) {
    const _tDedupErr = Date.now()
    console.error(`[DIAG_IMPORT] FASE dedup_candidates_ERROR: durata=${_tDedupErr - _tDedupStart}ms errore="${dedupError?.message}" code=${dedupError?.code} details=${dedupError?.details} hint=${dedupError?.hint}`)
    throw dedupError
  }
  const _tDedupEnd = Date.now()
  console.log(`[DIAG_IMPORT] FASE dedup_candidates_end: durata=${_tDedupEnd - _tDedupStart}ms stagingCandidates=${dedupCandidates?.stagingRows?.length || 0} accountingCandidates=${dedupCandidates?.accountingRows?.length || 0}`)

  // ── FASE 4: staging_build_start ─────────────────────────────────────────────
  const _tBuildStart = Date.now()
  console.log(`[DIAG_IMPORT] FASE staging_build_start: parsedDocs=${parsedDocs.length}`)
  const activeStagingByKey = new Map()
  const deletedStagingByKey = new Map()
  for (const row of Array.isArray(dedupCandidates?.stagingRows) ? dedupCandidates.stagingRows : []) {
    if (!row) continue
    if (!isActiveStagingRow(row) && !isDeletedStagingRow(row)) continue
    const tokens = Array.from(collectStagingRowTokens(row))
    const keyVariants = buildDedupKeyVariants({
      tipoDocumento: row?.tipo_documento || row?.ai_raw_response?.tipo_documento || row?.tipoDocumento,
      numeroDocumento: row?.numero_documento || row?.ai_raw_response?.numero || row?.ai_raw_response?.numero_documento,
      dataDocumento: row?.data_documento || row?.ai_raw_response?.data || row?.ai_raw_response?.data_documento,
      totale: row?.totale || row?.ai_raw_response?.totale,
      tokens,
    })
    if (!keyVariants.size) continue
    const target = isDeletedStagingRow(row) ? deletedStagingByKey : activeStagingByKey
    for (const key of keyVariants) {
      if (!target.has(key)) target.set(key, row)
    }
  }

  const activeAccountingByKey = new Map()
  const deletedAccountingByKey = new Map()
  for (const row of Array.isArray(dedupCandidates?.accountingRows) ? dedupCandidates.accountingRows : []) {
    if (!row) continue
    if (!isActiveAccountingRow(row) && !isDeletedAccountingRow(row)) continue
    const tokens = Array.from(collectAccountingRowTokens(row))
    const keyVariants = buildDedupKeyVariants({
      tipoDocumento: row?.tipo_documento,
      numeroDocumento: row?.numero_documento,
      dataDocumento: row?.data_documento,
      totale: row?.totale,
      tokens,
    })
    if (!keyVariants.size) continue
    const target = isDeletedAccountingRow(row) ? deletedAccountingByKey : activeAccountingByKey
    for (const key of keyVariants) {
      if (!target.has(key)) target.set(key, row)
    }
  }

  const lookup = {
    activeStagingByKey,
    deletedStagingByKey,
    activeAccountingByKey,
    deletedAccountingByKey,
  }

  const batchSeenKeys = new Set()
  const classifiedDocs = parsedDocs.map((parsedDoc) => buildClassifiedParsedDoc(parsedDoc, lookup, batchSeenKeys))
  const importableClassifiedDocs = classifiedDocs.filter((item) => item.classification === 'importable')

  const stagingRows = importableClassifiedDocs.map((item, index) =>
    buildStagingRow(item.parsedDoc, {
      batchId,
      id: normalizeText(item.parsedDoc?.id || `${batchId}-${index + 1}`),
      filename: item.parsedDoc?.filename,
    }),
  )

  const baseReport = buildBatchReport(parsedDocs, {
    batchId,
    startedAt,
    finishedAt: new Date().toISOString(),
  })
  const _tBuildEnd = Date.now()
  console.log(`[DIAG_IMPORT] FASE staging_build_end: durata=${_tBuildEnd - _tBuildStart}ms stagingRows=${stagingRows.length} duplicatiStaging=${classifiedDocs.filter(d => d.classification === 'duplicateInStaging').length} duplicatiContabilita=${classifiedDocs.filter(d => d.classification === 'duplicateInAccounting').length}`)

  const reportItemsByKey = new Map()
  for (const item of Array.isArray(baseReport.items) ? baseReport.items : []) {
    const key = normalizeText(item?.id || item?.filename)
    if (key && !reportItemsByKey.has(key)) reportItemsByKey.set(key, item)
  }

  const reportItems = classifiedDocs.map((item) => {
    const key = getParsedDocKey(item.parsedDoc)
    const baseItem = reportItemsByKey.get(key) || {
      id: key,
      filename: item.parsedDoc?.filename || '',
      sourceHash: item.parsedDoc?.sourceHash || '',
      outcome: REPORT_OUTCOMES.imported,
      severity: 'info',
      reasonCode: 'imported',
      warningsCount: Array.isArray(item.parsedDoc?.warnings) ? item.parsedDoc.warnings.length : 0,
      errorsCount: Array.isArray(item.parsedDoc?.errors) ? item.parsedDoc.errors.length : 0,
    }

    if (item.classification === 'importable') {
      return baseItem
    }

    return {
      ...baseItem,
      outcome: item.reportOutcome,
      severity: item.severity,
      reasonCode: item.reasonCode,
    }
  })

  const duplicateInStagingRows = classifiedDocs
    .filter((item) => item.classification === 'duplicateInStaging')
    .map((item) => item.summary)
  const duplicateInAccountingRows = classifiedDocs
    .filter((item) => item.classification === 'duplicateInAccounting')
    .map((item) => item.summary)
  const deletedInStagingRows = classifiedDocs
    .filter((item) => item.classification === 'deletedInStaging')
    .map((item) => item.summary)
  const deletedInAccountingRows = classifiedDocs
    .filter((item) => item.classification === 'deletedInAccounting')
    .map((item) => item.summary)

  const reportTotals = computeReportTotals(reportItems)

  const finishedAt = new Date().toISOString()
  const _tTotal = Date.now() - _t0
  console.log(`[DIAG_IMPORT] === runImportWorkflow END === durataTotak=${_tTotal}ms importabili=${reportTotals.imported} bloccati=${reportTotals.blocked} avvertimenti=${reportTotals.warnings} errori=${reportTotals.errors}`)

  return {
    ok: true,
    batchId,
    startedAt,
    finishedAt,
    parsedDocs,
    stagingRows,
    report: {
      ...baseReport,
      items: reportItems,
      totals: reportTotals,
      batchId,
      startedAt,
      finishedAt,
      uploadedFilesCount: inputPreparation.uploadedFilesCount,
      extractedXmlCount: inputPreparation.extractedXmlCount,
      discardedFilesCount: inputPreparation.discardedFilesCount,
      discardedReasons: inputPreparation.discardedReasons,
      duplicateInStagingCount: duplicateInStagingRows.length,
      duplicateInAccountingCount: duplicateInAccountingRows.length,
      deletedInStagingCount: deletedInStagingRows.length,
      deletedInAccountingCount: deletedInAccountingRows.length,
      duplicateInStagingRows,
      duplicateInAccountingRows,
      deletedInStagingRows,
      deletedInAccountingRows,
      deletedDetectionNote: baseReport.deletedDetectionNote,
    },
  }
}

import { resolveSplitPaymentAccountDb as resolveSplitPaymentAccount } from '../../contabilita/domain/registrazione/resolveSplitPaymentAccount.js'
import { isCespiteAccount } from '../../contabilita/domain/registrazione/resolveCespiteAccount.js'
import { mapImportContabilitaCommitPayloadToCanonical } from '../../contabilita/canonical/mappers/mapImportContabilitaCommitPayloadToCanonical.js'
import { validateCanonicalAccountingPayload } from '../../contabilita/canonical/validateCanonicalAccountingPayload.js'
import { getStampeDefinitiveValide } from '../../contabilita/data/contabilitaRepo.js'
import { persistPrimaNotaDraft } from '../../contabilita/application/persistPrimaNotaDraft.js'
import { sb } from '../../../lib/supabase.js'
import { buildCausaleContabilePolicy } from '../../contabilita/domain/causali/buildCausaleContabilePolicy.js'

function evaluatePeriodoStampaDefinita(dataRegistrazione, stampeDefinitive) {
  if (!dataRegistrazione || !stampeDefinitive || !stampeDefinitive.length) return false
  const currentRegDate = new Date(dataRegistrazione)
  if (isNaN(currentRegDate.getTime())) return false

  return stampeDefinitive.some((stampa) => {
    if (stampa.stato !== 'valida') return false
    if (!['libro_giornale', 'registro_iva_acquisti', 'registro_iva_vendite', 'liquidazione_iva_periodica'].includes(stampa.tipo_stampa)) {
      return false
    }
    const start = new Date(stampa.periodo_inizio)
    const end = new Date(stampa.periodo_fine)
    return currentRegDate >= start && currentRegDate <= end
  })
}

export async function runCommitWorkflow(commitPayload, options = {}) {
  const db = options.db || sb
  
  // 1. Input validation
  if (!commitPayload) {
    return { success: false, blockingReasons: ['Payload di commit mancante.'] }
  }
  const societaId = commitPayload.societaId || commitPayload.company?.societaId || (commitPayload.payload && (commitPayload.payload.societaId || commitPayload.payload.company?.societaId))
  if (!societaId) {
    return { success: false, blockingReasons: ['societaId mancante'] }
  }
  const dataRegistrazione = commitPayload.registrationDate || commitPayload.document?.registrationDate || (commitPayload.payload && (commitPayload.payload.registrationDate || commitPayload.payload.document?.registrationDate))
  if (!dataRegistrazione) {
    return { success: false, blockingReasons: ['data registrazione mancante'] }
  }

  // Check double commit
  const documentId = commitPayload.sourceRow?.id || commitPayload.sourceRowId || (commitPayload.payload && (commitPayload.payload.sourceRow?.id || commitPayload.payload.sourceRowId))
  if (documentId) {
    const { data: existingDoc, error: checkError } = await db
      .from('documenti_import')
      .select('stato')
      .eq('id', documentId)
      .maybeSingle()
    if (!checkError && existingDoc && ['processed', 'committed'].includes(existingDoc.stato)) {
      return { success: false, blockingReasons: ['Documento già contabilizzato.'] }
    }
  }

  // 2. Mapping to Canonical
  const mapped = mapImportContabilitaCommitPayloadToCanonical(commitPayload, { mode: 'commit', validate: true })
  const canonicalPayload = mapped.payload
  const validationResult = mapped.validationResult || validateCanonicalAccountingPayload(canonicalPayload, { mode: 'commit' })

  // 3. Validation canonical in commit mode
  if (!validationResult.isValid && validationResult.blocking?.length) {
    return {
      success: false,
      blockingReasons: validationResult.blocking,
      warnings: validationResult.warnings || []
    }
  }

  // 4. Controllo periodo stampato definitivo
  const { data: stampeDefinitive, error: stampeError } = await getStampeDefinitiveValide(societaId, db)
  if (stampeError) {
    return { success: false, blockingReasons: [`Errore nel recupero delle stampe definitive: ${stampeError.message}`] }
  }
  if (evaluatePeriodoStampaDefinita(dataRegistrazione, stampeDefinitive)) {
    return {
      success: false,
      blockingReasons: [
        'Periodo stampato definitivo. Non è possibile contabilizzare documenti importati in un periodo già consolidato. Eventuali rettifiche richiedono workflow amministrativo.'
      ]
    }
  }

  // 5. Persistence via persistPrimaNotaDraft
  // We need to map the canonical payload back to the structure expected by persistPrimaNotaDraft
  // Let's create the adapter/bundle structure:
  // 5. Persistence via persistPrimaNotaDraft
  // We need to map the canonical payload back to the structure expected by persistPrimaNotaDraft
  // Let's create the adapter/bundle structure:
  const primarySubject = canonicalPayload.subjects?.find(s => s.role === 'primary') || {}

  const headerCausale = canonicalPayload.header?.causaleContabile || {}
  const policy = buildCausaleContabilePolicy({
    ...headerCausale,
    codice: headerCausale.codice || headerCausale.code || '',
    tipo_causale: headerCausale.tipoCausale || headerCausale.tipo_causale || '',
  })

  const isAcquisti = canonicalPayload.fiscalContext?.tipoOperazione === 'acquisto' || canonicalPayload.fiscalContext?.tipoOperazione === 'passiva'
  const isSplit = Boolean(canonicalPayload.fiscalContext?.splitPayment || policy.splitPayment)
  const isReverse = Boolean(canonicalPayload.fiscalContext?.reverseCharge || policy.reverseCharge || policy.isCee || policy.isAutofattura)
  const isCassa = Boolean(canonicalPayload.fiscalContext?.ivaPerCassa || policy.ivaPerCassa)

  let finalRows = (canonicalPayload.accounting?.rows || []).map((r, index) => ({
    conto_id: r.accountId,
    conto_codice: r.accountCode,
    conto_descrizione: r.accountDescription,
    descrizione_riga: r.description,
    dare: r.debit,
    avere: r.credit,
    riga_numero: r.rowNumber || index + 1,
  }))

  const imponibileTotal = canonicalPayload.document?.totals?.taxable || 0
  const ivaTotal = canonicalPayload.document?.totals?.vat || 0

  // Identificazione riga IVA senza codici hardcoded:
  // Nel commit workflow canonico di Import, il pianoConti non è disponibile
  // (a differenza di Registrazione Manuale che lo riceve come opzione).
  // La heuristic corretta: una riga contabile è IVA se il suo importo
  // (dare o avere) corrisponde all'importo IVA totale del documento E
  // non è la riga del soggetto primario (importo lordo = imponibile + iva).
  // Gap documentato: in presenza di multi-aliquota con righe IVA di importi
  // diversi, questa heuristic può non identificare correttamente la riga IVA
  // aggregata. La soluzione robusta richiede un campo `isVatRow` nel payload
  // canonico (Fase futura: estensione del contratto canonico).
  function isIvaAccountingRow(row) {
    const dare = row.dare || 0
    const avere = row.avere || 0
    const eps = 0.02 // tolleranza centesimi per arrotondamenti
    const isSubject = (row.conto_id && row.conto_id === primarySubject.anagraficaId)
    if (isSubject) return false
    const amount = dare || avere
    return Math.abs(amount - ivaTotal) <= eps && ivaTotal > 0
  }

  let splitBlocker = null
  if (isSplit && !isAcquisti) {
    const causaleObj = canonicalPayload.header?.causaleContabile || {}
    const splitAccount = await resolveSplitPaymentAccount(db, causaleObj, societaId)
    if (!splitAccount) {
      splitBlocker = 'Conto IVA split payment non configurato per questa causale/template. Configurare il conto tecnico IVA split payment.'
    } else {
      // 1. Omit ordinary VAT row from accounting lines (split payment: IVA versata direttamente a Erario dalla PA).
      // Usa isIvaAccountingRow invece di codici hardcoded (vedi commento sopra).
      finalRows = finalRows.filter(r => !isIvaAccountingRow(r))
      // 2. Set client row amount to taxable (il cliente/PA deve solo l'imponibile)
      finalRows.forEach(r => {
        if (r.conto_id === primarySubject.anagraficaId) {
          if (r.dare > 0) r.dare = imponibileTotal
          if (r.avere > 0) r.avere = imponibileTotal
        }
      })
      // 3. Add the two split payment technical rows (Dare and Avere)
      const splitDareRow = {
        conto_id: splitAccount.id,
        conto_codice: splitAccount.codice || '',
        conto_descrizione: splitAccount.descrizione || 'IVA split payment',
        descrizione_riga: 'IVA split payment - evidenza Dare',
        dare: ivaTotal,
        avere: 0,
        riga_numero: finalRows.length + 1,
      }
      const splitAvereRow = {
        conto_id: splitAccount.id,
        conto_codice: splitAccount.codice || '',
        conto_descrizione: splitAccount.descrizione || 'IVA split payment',
        descrizione_riga: 'IVA split payment - evidenza Avere',
        dare: 0,
        avere: ivaTotal,
        riga_numero: finalRows.length + 2,
      }
      finalRows.push(splitDareRow, splitAvereRow)
    }
  } else if (isReverse && isAcquisti) {
    // For reverse charge / CEE / autofattura passiva:
    // Le righe IVA da sostituire sono identificate con isIvaAccountingRow
    // (heuristic importo) invece di codici hardcoded.
    // Il conto IVA da usare per la doppia annotazione viene estratto dalla
    // riga IVA originale nelle accounting.rows (identificata da isIvaAccountingRow):
    // questa riga ha già il conto assegnato dall'utente nella working table.
    const ivaRow = finalRows.find(r => r.conto_id !== primarySubject.anagraficaId && isIvaAccountingRow(r))
    const costRow = finalRows.find(r => r.conto_id !== primarySubject.anagraficaId && !isIvaAccountingRow(r))
    finalRows = [
      {
        conto_id: costRow?.conto_id || '',
        conto_codice: costRow?.conto_codice || '',
        conto_descrizione: costRow?.conto_descrizione || '',
        descrizione_riga: costRow?.descrizione_riga || '',
        dare: imponibileTotal,
        avere: 0,
        riga_numero: 1,
      },
      {
        conto_id: primarySubject.anagraficaId || '',
        conto_codice: primarySubject.pianoContiIdPatrimoniale || '',
        conto_descrizione: primarySubject.denominazione || '',
        descrizione_riga: `Debito v/fornitore estero`,
        dare: 0,
        avere: imponibileTotal,
        riga_numero: 2,
      },
      {
        // Conto IVA a credito: usa il conto della riga IVA originale assegnata
        // dall'utente nella working table (identificata da isIvaAccountingRow).
        // Gap documentato: se l'utente non ha assegnato il conto IVA (accountId vuoto),
        // persistPrimaNotaDraft segnala "conto mancante" come blocker.
        conto_id: ivaRow?.conto_id || '',
        conto_codice: ivaRow?.conto_codice || '',
        conto_descrizione: 'IVA a credito',
        descrizione_riga: 'IVA ns.credito (reverse charge)',
        dare: ivaTotal,
        avere: 0,
        riga_numero: 3,
      },
      {
        conto_id: ivaRow?.conto_id || '',
        conto_codice: ivaRow?.conto_codice || '',
        conto_descrizione: 'IVA a debito',
        descrizione_riga: 'IVA ns.debito (reverse charge)',
        dare: 0,
        avere: ivaTotal,
        riga_numero: 4,
      }
    ]
  }

  if (splitBlocker) {
    return {
      success: false,
      blockingReasons: [splitBlocker]
    }
  }

  const stampDuty = canonicalPayload.document?.totals?.stampDuty || 0
  if (stampDuty > 0) {
    const costRow = finalRows.find(r => r.conto_id !== primarySubject.anagraficaId && !isIvaAccountingRow(r))
    if (costRow) {
      if (costRow.dare > 0) costRow.dare = Number((costRow.dare + stampDuty).toFixed(2))
      if (costRow.avere > 0) costRow.avere = Number((costRow.avere + stampDuty).toFixed(2))
    }
  }

  const totalDare = finalRows.reduce((sum, r) => sum + r.dare, 0)
  const totalAvere = finalRows.reduce((sum, r) => sum + r.avere, 0)

  const withholdingRecipient = canonicalPayload.subjects?.find(s => s.role === 'withholdingRecipient')
  const percipienteRecord = withholdingRecipient
    ? {
        id: withholdingRecipient.anagraficaId || '',
        denominazione: withholdingRecipient.denominazione || '',
        codiceFiscale: withholdingRecipient.codiceFiscale || '',
        partitaIva: withholdingRecipient.partitaIva || '',
        paese: withholdingRecipient.paese || 'IT',
      }
    : null

  const withholdingRows = (canonicalPayload.withholding?.rows || []).map((r, index) => ({
    percipienteId: withholdingRecipient?.anagraficaId || primarySubject.anagraficaId || '',
    percipienteNome: withholdingRecipient?.denominazione || primarySubject.denominazione || '',
    codiceFiscale: withholdingRecipient?.codiceFiscale || primarySubject.codiceFiscale || '',
    importoCompenso: r.baseAmount,
    baseRitenuta: r.baseAmount,
    aliquotaRitenuta: r.rate,
    ritenuta: r.amount,
    netto: r.netPaid,
    causaleCu: r.causaleCu,
    codiceTributo: r.tributeCode || '1040',
    dataDocumento: canonicalPayload.document?.dataDocumento || dataRegistrazione,
    numeroDocumento: canonicalPayload.document?.numeroDocumento || '',
    mode: 'documento',
    active: true,
  }))

  const draftBundle = {
    pnPayload: {
      societa_id: societaId,
      esercizio: parseInt(canonicalPayload.company?.esercizioId || dataRegistrazione.slice(0, 4), 10),
      data_registrazione: dataRegistrazione,
      data_documento: canonicalPayload.document?.dataDocumento || dataRegistrazione,
      numero_documento: canonicalPayload.document?.numeroDocumento || '',
      causale_id: canonicalPayload.header?.causaleContabile?.id || '',
      causale_codice: canonicalPayload.header?.causaleContabile?.codice || canonicalPayload.header?.causaleContabile?.code || '',
      descrizione: canonicalPayload.header?.descrizione || '',
      cliente_fornitore_id: primarySubject.anagraficaId || '',
      cliente_fornitore_nome: primarySubject.denominazione || '',
      totale_dare: totalDare,
      totale_avere: totalAvere,
      stato: 'confermata',
      documento_import_id: documentId || null,
    },
    righePayload: finalRows,
    header: {
      societaId: societaId,
      esercizioContabile: canonicalPayload.company?.esercizioId || dataRegistrazione.slice(0, 4),
      dataRegistrazione: dataRegistrazione,
      dataDocumento: canonicalPayload.document?.dataDocumento || dataRegistrazione,
      causaleContabile: {
        ...(canonicalPayload.header?.causaleContabile || {}),
        id: canonicalPayload.header?.causaleContabile?.id || '',
        codice: canonicalPayload.header?.causaleContabile?.codice || canonicalPayload.header?.causaleContabile?.code || '',
        description: canonicalPayload.header?.causaleContabile?.description || canonicalPayload.header?.descrizione || '',
      },
      descrizioneGenerale: canonicalPayload.header?.descrizione || '',
      clienteFornitoreId: primarySubject.anagraficaId || '',
      clienteFornitoreNome: primarySubject.denominazione || '',
      clienteFornitoreCodice: primarySubject.codiceFiscale || '',
      clienteFornitorePartitaIva: primarySubject.partitaIva || '',
    },
    totals: {
      totaleDare: totalDare,
      totaleAvere: totalAvere,
      differenza: 0,
      isBalanced: true,
    },
    meta: {
      operatorId: canonicalPayload.audit?.createdBy || 'sistema',
      createdAt: canonicalPayload.audit?.createdAt || new Date().toISOString(),
      behavior: {
        code: canonicalPayload.header?.causaleContabile?.code || '',
        showDocumentPanel: true,
        showIvaPanel: canonicalPayload.vat?.enabled || false,
        showPartitario: canonicalPayload.ledger?.enabled || false,
        showRitenute: canonicalPayload.withholding?.enabled || false,
      }
    },
    ivaDraft: {
      active: canonicalPayload.vat?.enabled || false,
      registroIva: canonicalPayload.vat?.registerType || '',
      esigibilita: isCassa ? 'differita' : 'immediata',
      rows: (canonicalPayload.vat?.rows || []).map((r, index) => ({
        riga: r.rowNumber || index + 1,
        imponibile: r.imponibile,
        iva: r.imposta,
        aliquota: r.aliquota,
        causaleIvaId: r.causaleIvaId || '',
        causaleIvaLabel: r.causaleIva || '',
        esigibilita: isCassa ? 'differita' : (r.esigibilita || 'Immediata'),
        splitPayment: r.splitPayment || false,
      }))
    },
    partitarioDraft: {
      active: canonicalPayload.ledger?.enabled || false,
      mode: canonicalPayload.ledger?.mode === 'open' ? 'apertura' : (canonicalPayload.ledger?.mode === 'close' ? 'chiusura' : 'nessuno'),
      accountId: canonicalPayload.ledger?.accountId || '',
      soggettoId: canonicalPayload.ledger?.subjectId || '',
      rows: (canonicalPayload.ledger?.rows || []).map((r, index) => {
        const finalAmount = (isSplit && !isAcquisti) || (isReverse && isAcquisti)
          ? imponibileTotal
          : r.amount
        return {
          riga: r.rowNumber || index + 1,
          importoOriginario: finalAmount,
          importoAperto: finalAmount,
          dataScadenza: r.dueDate,
          numeroDocumento: r.documentRef,
        }
      })
    },
    ritenutaDraft: {
      active: canonicalPayload.withholding?.enabled || false,
      mode: 'documento',
      percipienteRecord,
      percipienteId: percipienteRecord?.id || '',
      percipienteNome: percipienteRecord?.denominazione || '',
      codiceFiscale: percipienteRecord?.codiceFiscale || '',
      rows: withholdingRows,
    }
  }

  const persistResult = await persistPrimaNotaDraft({
    db,
    draft: draftBundle
  })

  if (persistResult.error) {
    return {
      success: false,
      blockingReasons: [persistResult.error.message]
    }
  }

  const primaNotaId = persistResult.data?.prima_nota_id || (persistResult.pn && persistResult.pn.id) || null

  // FASE 16: Se la prima nota ha successo, verifichiamo se ci sono righe cespite per generare la scheda
  if (primaNotaId) {
    for (const r of finalRows) {
      if (isCespiteAccount(r)) {
        const costo = r.dare || r.avere || 0
        if (costo > 0) {
          try {
            // Controlla se esiste già per evitare duplicazioni
            const { data: existingBene } = await db
              .from('beni_ammortizzabili')
              .select('id')
              .ilike('note', `%ID prima nota: ${primaNotaId}%`)
              .maybeSingle()
            
            if (!existingBene) {
              // Risolvi il cliente della societa
              let resolvedClienteId = societaId
              let resolvedClienteNome = ''
              const { data: socData } = await db
                .from('societa')
                .select('id, denominazione, ragione_sociale, partita_iva, codice_fiscale')
                .eq('id', societaId)
                .maybeSingle()
              
              if (socData) {
                resolvedClienteNome = socData.denominazione || socData.ragione_sociale || ''
                const { data: matchedCliente } = await db
                  .from('clienti')
                  .select('id, ragione_sociale, nome, cognome')
                  .eq('partita_iva', socData.partita_iva || '')
                  .maybeSingle()
                if (matchedCliente) {
                  resolvedClienteId = matchedCliente.id
                  resolvedClienteNome = matchedCliente.ragione_sociale || `${matchedCliente.nome} ${matchedCliente.cognome}`.trim()
                }
              }

              const aliquota = 20
              const anni = Math.ceil(100 / aliquota)
              const newCespite = {
                cliente_id: resolvedClienteId,
                cliente_nome: resolvedClienteNome,
                descrizione: r.descrizione_riga || r.conto_descrizione || 'Cespite da Import',
                categoria: 'Attrezzatura',
                data_acquisto: dataRegistrazione,
                costo_storico: costo,
                aliquota_ammortamento: aliquota,
                fondo_ammortamento: 0,
                valore_residuo: costo,
                anni_vita_utile: anni,
                note: `Cespite inserito automaticamente da Import Contabilità. ID prima nota: ${primaNotaId}`,
                attivo: true
              }

              await db.from('beni_ammortizzabili').insert([newCespite])
            }
          } catch (e) {
            console.warn('[Cespite creation error in import commit workflow]', e)
          }
        }
      }
    }
  }

  // 6. Aggiornamento stato documento
  if (documentId) {
    const { error: updateError } = await db
      .from('documenti_import')
      .update({ stato: 'processed', prima_nota_id: primaNotaId, processed_at: new Date().toISOString() })
      .eq('id', documentId)
    if (updateError) {
      // rollback or warning? The requirements say: "aggiornare lo stato del documento importato/staging solo dopo salvataggio contabile riuscito; gestire errori e rollback logico applicativo in modo chiaro"
      // Se fallisce l'aggiornamento dello stato, dovremmo idealmente cancellare la prima nota creata per rollback logico
      if (primaNotaId) {
        await db.from('ritenute_dacconto').delete().eq('prima_nota_id', primaNotaId)
        await db.from('partitario').delete().eq('prima_nota_id', primaNotaId)
        await db.from('registri_iva').delete().eq('prima_nota_id', primaNotaId)
        await db.from('prima_nota_righe').delete().eq('prima_nota_id', primaNotaId)
        await db.from('prima_nota').delete().eq('id', primaNotaId)
      }
      return { success: false, blockingReasons: [`Salvataggio contabile riuscito ma aggiornamento stato documento import fallito: ${updateError.message}. Eseguito rollback.`] }
    }
  }

  // 7. Risultato
  return {
    success: true,
    primaNotaId,
    documentoId: documentId,
    status: 'processed',
    warnings: validationResult.warnings || [],
    blockingReasons: [],
    numeroRighe: persistResult.data?.numero_righe || 0,
    numeroRigheIva: persistResult.data?.numero_righe_iva || 0,
    partitaFornitoreCount: (persistResult.partIns && persistResult.partIns.data && persistResult.partIns.data.length) || (persistResult.partIns?.count) || (draftBundle.partitarioDraft?.active ? draftBundle.partitarioDraft.rows.length : 0),
    totaleDare: persistResult.data?.totale_dare || 0,
    totaleAvere: persistResult.data?.totale_avere || 0,
    isBalanced: persistResult.data?.isBalanced || false,
  }
}

