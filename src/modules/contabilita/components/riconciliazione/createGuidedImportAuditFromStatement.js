import { buildGuidedImportAuditEvent } from './buildGuidedImportAuditEvent.js'
import { reduceGuidedImportAuditSummary } from './reduceGuidedImportAuditSummary.js'
import { validateGuidedImportAuditEvent } from './validateGuidedImportAuditEvent.js'
import { deriveTemplateDecisionFromImportAudit } from './deriveTemplateDecisionFromImportAudit.js'
import {
  GUIDED_IMPORT_AUDIT_EVENT_SOURCES,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES,
  GUIDED_IMPORT_AUDIT_FIELD_IDS,
} from './guidedImportAuditEventTypes.js'

function asNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asText(value) {
  return String(value || '').trim()
}

function pickFirst(...values) {
  for (const value of values) {
    if (value == null) continue
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const text = asText(value)
    if (text) return value
  }
  return null
}

function normalizeConfidence(parseReliabilityLevel) {
  const level = asText(parseReliabilityLevel).toLowerCase()
  if (level === 'certified_balanced') return 'high'
  if (level === 'high_confidence') return 'medium'
  if (level === 'needs_review') return 'low'
  if (level === 'needs_ocr' || level === 'blocked') return 'none'
  return 'medium'
}

function buildAuditId(importId) {
  const safeImport = asText(importId) || `import-${Date.now()}`
  return `guided-audit-${safeImport}-${Date.now()}`
}

function buildDocumentFieldEntries(statement) {
  const documentAccount = statement?.documentAccount || {}
  const documentMeta = statement?.documentMeta || {}
  const pdfSummary = statement?.pdfSummary || {}
  const audit = statement?.audit || {}

  const entries = [
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.BANK_NAME,
      value: pickFirst(documentAccount.bankName, documentMeta.bankName, statement?.bankName),
      source: 'documentAccount.bankName|documentMeta.bankName|bankName',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.IBAN,
      value: pickFirst(documentAccount.iban, documentMeta.iban, statement?.iban),
      source: 'documentAccount.iban|documentMeta.iban|iban',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.BIC,
      value: pickFirst(documentAccount.bic, documentMeta.bic),
      source: 'documentAccount.bic|documentMeta.bic',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.ACCOUNT_NUMBER,
      value: pickFirst(documentAccount.accountNumber, documentMeta.accountCode, statement?.accountCode),
      source: 'documentAccount.accountNumber|documentMeta.accountCode|accountCode',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.HOLDER,
      value: pickFirst(documentAccount.holder, documentMeta.holder),
      source: 'documentAccount.holder|documentMeta.holder',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.PERIOD_START,
      value: pickFirst(statement?.periodStart, pdfSummary.periodStart),
      source: 'periodStart|pdfSummary.periodStart',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.PERIOD_END,
      value: pickFirst(statement?.periodEnd, pdfSummary.periodEnd),
      source: 'periodEnd|pdfSummary.periodEnd',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.OPENING_BALANCE,
      value: pickFirst(pdfSummary.openingBalance, statement?.openingBalance, audit?.openingBalance),
      source: 'pdfSummary.openingBalance|openingBalance|audit.openingBalance',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_IN,
      value: pickFirst(audit?.totalIn, audit?.totalEntrate, statement?.totalIn, statement?.totalEntrate),
      source: 'audit.totalIn|audit.totalEntrate|totalIn|totalEntrate',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_OUT,
      value: pickFirst(audit?.totalOut, audit?.totalUscite, statement?.totalOut, statement?.totalUscite),
      source: 'audit.totalOut|audit.totalUscite|totalOut|totalUscite',
    },
    {
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.CLOSING_BALANCE,
      value: pickFirst(pdfSummary.closingBalance, statement?.closingBalanceOfficial, statement?.closingBalance, audit?.closingBalanceOfficial),
      source: 'pdfSummary.closingBalance|closingBalanceOfficial|closingBalance|audit.closingBalanceOfficial',
    },
  ]

  return entries
}

function deriveParsePayload(statement) {
  const audit = statement?.audit || {}
  const deltaDiagnostics = statement?.deltaDiagnostics || audit?.deltaDiagnostics || {}
  const movementsExtracted = Number(statement?.parsedMovements ?? statement?.movements?.length ?? 0) || 0
  const totalIn = pickFirst(audit?.totalIn, audit?.totalEntrate, statement?.totalIn, statement?.totalEntrate)
  const totalOut = pickFirst(audit?.totalOut, audit?.totalUscite, statement?.totalOut, statement?.totalUscite)
  const openingBalance = pickFirst(statement?.pdfSummary?.openingBalance, statement?.openingBalance, audit?.openingBalance)
  const closingBalanceOfficial = pickFirst(statement?.pdfSummary?.closingBalance, statement?.closingBalanceOfficial, statement?.closingBalance, audit?.closingBalanceOfficial)
  const calculatedClosingBalance = pickFirst(audit?.calculatedClosingBalance, statement?.calculatedClosingBalance, statement?.saldoCalcolato)
  const difference = pickFirst(
    audit?.differences?.balance,
    statement?.balanceDifference,
    statement?.saldoDifference,
    audit?.difference
  )
  const parseStatus = asText(statement?.parseStatus || 'parsed')
  const parseReliabilityLevel = asText(statement?.parseReliabilityLevel || 'high_confidence')
  const reviewRows = Number(statement?.auditReviewRows ?? statement?.needsReviewRows ?? deltaDiagnostics?.reviewRowsBlocking ?? 0) || 0
  const rejectedRows = Number(statement?.rejectedRows ?? 0) || 0
  const ignoredRows = Number(statement?.ignoredRows ?? 0) || 0
  const multilineAttachedRows = Number(deltaDiagnostics?.reviewRowsInfo ?? 0) || 0

  const blockers = []
  const warnings = []

  if (['failed', 'needs_ocr', 'blocked'].includes(parseStatus.toLowerCase())) {
    blockers.push({ code: 'parse_status_blocking', reason: parseStatus })
  }
  if (movementsExtracted <= 0) {
    blockers.push({ code: 'no_movements_extracted', reason: 'movementsExtracted=0' })
  }
  if (reviewRows > 0) {
    warnings.push({ code: 'review_rows_present', reason: `reviewRows=${reviewRows}` })
  }
  if (difference != null && Math.abs(Number(difference)) > 0.01) {
    warnings.push({ code: 'balance_difference_non_zero', reason: `difference=${difference}` })
  }

  return {
    movementsExtracted,
    totalIn,
    totalOut,
    openingBalance,
    closingBalanceOfficial,
    calculatedClosingBalance,
    difference,
    rejectedRows,
    reviewRows,
    ignoredRows,
    multilineAttachedRows,
    confidenceOverall: normalizeConfidence(parseReliabilityLevel),
    parseReliabilityLevel,
    parseStatus,
    blockers,
    warnings,
  }
}

function deriveImportDecision({ movementsExtracted, parseStatus, templateDecision, reviewRows, warnings = [] }) {
  const normalizedParse = asText(parseStatus).toLowerCase()
  if (movementsExtracted <= 0 || ['failed', 'needs_ocr', 'blocked'].includes(normalizedParse)) {
    return 'unusable_import'
  }
  if (templateDecision === 'template_savable') {
    return 'certified_import'
  }
  if (reviewRows > 0 || (Array.isArray(warnings) && warnings.length > 0)) {
    return 'low_confidence_review'
  }
  return 'high_confidence_review'
}

export function createGuidedImportAuditFromStatement({
  statement,
  importId,
  sourceFileName,
  profileCandidate,
  operatorId,
} = {}) {
  const nowIso = new Date().toISOString()
  const auditId = buildAuditId(importId)
  const safeSourceFileName = asText(sourceFileName || statement?.sourceFileName)
  const safeProfileCandidate = asText(profileCandidate || statement?.profile)
  const safeImportId = asText(importId || statement?.sourceFileHash || statement?.sourceFileName || `${Date.now()}`)
  const events = []

  const pushEvent = (eventInput) => {
    const built = buildGuidedImportAuditEvent({
      ...eventInput,
      auditId,
      importId: safeImportId,
      sourceFileName: safeSourceFileName,
      profileCandidate: safeProfileCandidate,
      operatorId: asText(operatorId || statement?.importedBy || 'operator_demo'),
    })
    const validation = validateGuidedImportAuditEvent(built)
    if (!validation.valid) {
      built.blockers = [...(Array.isArray(built.blockers) ? built.blockers : []), ...validation.blockers]
    }
    if (validation.warnings.length) {
      built.warnings = [...(Array.isArray(built.warnings) ? built.warnings : []), ...validation.warnings]
    }
    events.push(built)
  }

  const parsePayload = deriveParsePayload(statement)

  pushEvent({
    eventType: GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_IMPORT_STARTED,
    source: GUIDED_IMPORT_AUDIT_EVENT_SOURCES.SYSTEM,
    timestamp: nowIso,
    payload: {
      trigger: 'bank_statement_import',
      initialProfileCandidate: safeProfileCandidate,
      initialConfidence: normalizeConfidence(statement?.parseReliabilityLevel),
    },
  })

  const fieldEntries = buildDocumentFieldEntries(statement)
  fieldEntries.forEach((entry) => {
    const value = entry.value
    if (value == null || asText(value) === '') {
      if ([GUIDED_IMPORT_AUDIT_FIELD_IDS.OPENING_BALANCE, GUIDED_IMPORT_AUDIT_FIELD_IDS.CLOSING_BALANCE].includes(entry.fieldId)) {
        pushEvent({
          eventType: GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MARKED_MISSING,
          source: GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER,
          payload: {
            fieldId: entry.fieldId,
            reason: 'missing_from_statement',
            source: entry.source,
          },
        })
      }
      return
    }

    pushEvent({
      eventType: GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED,
      source: GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER,
      payload: {
        fieldId: entry.fieldId,
        proposedValue: value,
        finalValue: value,
        source: entry.source,
        confidenceAfter: normalizeConfidence(statement?.parseReliabilityLevel),
      },
    })
  })

  pushEvent({
    eventType: parsePayload.parseStatus.toLowerCase() === 'failed'
      ? GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_FAILED
      : GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_COMPLETED,
    source: GUIDED_IMPORT_AUDIT_EVENT_SOURCES.DRY_RUN,
    payload: parsePayload,
    warnings: parsePayload.warnings,
    blockers: parsePayload.blockers,
  })

  const previewSummary = reduceGuidedImportAuditSummary(events)
  const templateDecision = deriveTemplateDecisionFromImportAudit({
    movementsExtracted: previewSummary?.dryRunStatus?.movementsExtracted,
    difference: previewSummary?.dryRunStatus?.difference,
    closingBalanceOfficial: previewSummary?.dryRunStatus?.totals?.closingBalanceOfficial,
    parseStatus: previewSummary?.dryRunStatus?.parseStatus,
    blockers: previewSummary?.blockers,
  })

  const templateEventType = {
    template_savable: GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_SAVABLE,
    template_savable_non_certifying: GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_SAVABLE_NON_CERTIFYING,
    template_not_savable: GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_NOT_SAVABLE,
  }[templateDecision] || GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_SAVABLE_NON_CERTIFYING

  pushEvent({
    eventType: templateEventType,
    source: GUIDED_IMPORT_AUDIT_EVENT_SOURCES.SYSTEM,
    payload: {
      templateDecision,
      reason: 'derived_from_import_audit',
      dryRunAuditRef: `${auditId}:dry-run`,
    },
  })

  const summaryBeforeImportDecision = reduceGuidedImportAuditSummary(events)
  const importDecision = deriveImportDecision({
    movementsExtracted: Number(summaryBeforeImportDecision?.dryRunStatus?.movementsExtracted || 0),
    parseStatus: summaryBeforeImportDecision?.dryRunStatus?.parseStatus,
    templateDecision,
    reviewRows: Number(summaryBeforeImportDecision?.dryRunStatus?.reviewRows || 0),
    warnings: summaryBeforeImportDecision?.warnings,
  })

  pushEvent({
    eventType: GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_DECISION_SET,
    source: GUIDED_IMPORT_AUDIT_EVENT_SOURCES.SYSTEM,
    payload: {
      finalDecision: importDecision,
      reason: 'derived_from_import_audit',
    },
  })

  const summary = reduceGuidedImportAuditSummary(events)
  const updatedAt = summary?.lastUpdatedAt || nowIso

  return {
    auditId,
    importId: safeImportId,
    sourceFileName: safeSourceFileName,
    profileCandidate: safeProfileCandidate,
    events,
    summary,
    createdAt: nowIso,
    updatedAt,
  }
}

export default createGuidedImportAuditFromStatement
