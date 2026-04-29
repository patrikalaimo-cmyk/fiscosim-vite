import { createEmptyStagingRow, STAGING_STATES } from '../domain/stagingContract.js'
import { createEmptyReport, REPORT_OUTCOMES } from '../domain/reportContract.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function getWarnings(parsedDoc) {
  return Array.isArray(parsedDoc?.warnings) ? parsedDoc.warnings : []
}

function getErrors(parsedDoc) {
  return Array.isArray(parsedDoc?.errors) ? parsedDoc.errors : []
}

function getParsedDocId(parsedDoc, options = {}) {
  return normalizeText(options.id || parsedDoc?.id || parsedDoc?.sourceHash || parsedDoc?.filename)
}

export function buildStagingRow(parsedDoc, options = {}) {
  const base = createEmptyStagingRow()
  const warnings = getWarnings(parsedDoc)
  const errors = getErrors(parsedDoc)
  const id = getParsedDocId(parsedDoc, options)
  const filename = normalizeText(options.filename || parsedDoc?.filename)
  const sourceHash = normalizeText(parsedDoc?.sourceHash)

  let state = STAGING_STATES.imported
  if (errors.length > 0) {
    state = STAGING_STATES.error
  } else if (warnings.length > 0) {
    state = STAGING_STATES.review_pending
  }

  return {
    ...base,
    id,
    batchId: normalizeText(options.batchId || parsedDoc?.batchId),
    sourceHash,
    filename,
    parsedDocument: parsedDoc || null,
    state,
    blockingErrors: errors.slice(),
    warnings: warnings.slice(),
    userNotes: '',
    createdAt: normalizeText(options.createdAt),
    updatedAt: normalizeText(options.updatedAt),
  }
}

export function buildReportItem(parsedDoc, options = {}) {
  const warnings = getWarnings(parsedDoc)
  const errors = getErrors(parsedDoc)
  const id = getParsedDocId(parsedDoc, options)
  const filename = normalizeText(options.filename || parsedDoc?.filename)
  const sourceHash = normalizeText(parsedDoc?.sourceHash)

  let outcome = REPORT_OUTCOMES.imported
  let severity = 'info'
  let reasonCode = 'imported'

  if (errors.length > 0) {
    outcome = REPORT_OUTCOMES.parse_error
    severity = 'error'
    reasonCode = errors[0]?.code || 'parse_error'
  } else if (warnings.length > 0) {
    outcome = REPORT_OUTCOMES.warning_reimport
    severity = 'warning'
    reasonCode = warnings[0]?.code || 'warning_reimport'
  }

  return {
    id,
    filename,
    sourceHash,
    outcome,
    severity,
    reasonCode,
    warningsCount: warnings.length,
    errorsCount: errors.length,
  }
}

export function buildBatchReport(parsedDocs = [], options = {}) {
  const report = createEmptyReport()
  const list = Array.isArray(parsedDocs) ? parsedDocs : []
  const startedAt = normalizeText(options.startedAt || new Date().toISOString())
  const finishedAt = normalizeText(options.finishedAt || new Date().toISOString())

  const items = list.map((parsedDoc, index) =>
    buildReportItem(parsedDoc, {
      ...options,
      id: getParsedDocId(parsedDoc, { id: options.idPrefix ? `${options.idPrefix}-${index + 1}` : '' }),
      filename: options.filename || parsedDoc?.filename,
    }),
  )

  const totals = items.reduce(
    (acc, item) => {
      acc.files += 1
      if (item.outcome === REPORT_OUTCOMES.imported) acc.imported += 1
      if (item.outcome === REPORT_OUTCOMES.warning_reimport) acc.warnings += 1
      if (item.outcome === REPORT_OUTCOMES.parse_error) acc.errors += 1
      return acc
    },
    { files: 0, imported: 0, blocked: 0, warnings: 0, errors: 0 },
  )

  return {
    ...report,
    batchId: normalizeText(options.batchId || ''),
    startedAt,
    finishedAt,
    items,
    totals,
  }
}
