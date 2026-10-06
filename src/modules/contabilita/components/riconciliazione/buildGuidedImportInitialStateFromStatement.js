/**
 * buildGuidedImportInitialStateFromStatement
 *
 * Costruisce lo stato iniziale del flusso Guida FiscoSim REALE
 * a partire dal bankStatement corrente (staging reale).
 *
 * NON usa fallback demo.
 * NON usa selectedBankAccount come banca documento.
 * Legge solo campi documentAccount / documentMeta / audit / pdfSummary.
 */

import {
  GUIDED_IMPORT_AUDIT_COLUMN_PRESETS,
  GUIDED_IMPORT_AUDIT_FIELD_IDS,
} from './guidedImportAuditEventTypes.js'

function asText(value) {
  if (value == null) return ''
  return String(value).trim()
}

function asNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function pickFirst(...values) {
  for (const value of values) {
    if (value == null) continue
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const text = asText(value)
    if (text) return text
  }
  return null
}

function mapReliabilityToConfidence(parseReliabilityLevel) {
  const level = asText(parseReliabilityLevel).toLowerCase()
  if (level === 'certified_balanced') return 0.99
  if (level === 'high_confidence') return 0.84
  if (level === 'needs_review') return 0.41
  return 0.25
}

function buildField({ key, label, fieldId, proposedValue, source, confidence, allowManualEdit = false, actionType = null }) {
  const safe = proposedValue == null ? '' : asText(proposedValue) === '' && typeof proposedValue === 'number' ? String(proposedValue) : asText(proposedValue)
  const numericProposed = typeof proposedValue === 'number' ? proposedValue : null
  const finalValue = safe || (numericProposed != null ? String(numericProposed) : '')
  return {
    key,
    label,
    fieldId: fieldId || null,
    proposedValue: finalValue,
    finalValue,
    source: asText(source) || 'statement',
    confidence: typeof confidence === 'number' ? confidence : 0.7,
    status: finalValue ? 'proposed' : 'missing',
    allowManualEdit,
    actionType: actionType || (fieldId ? 'document' : null),
  }
}

function buildExtractedRows(bankStatement) {
  // Prova a recuperare righe estratte da diverse proprietà del bankStatement
  const candidates = [
    bankStatement?.extractedRows,
    bankStatement?.rawRows,
    bankStatement?.reviewRows,
    bankStatement?.audit?.extractedRows,
    bankStatement?.deltaDiagnostics?.extractedRows,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate.map((row, index) => ({
        rowId: row.rowId || row.id || `row-${index + 1}`,
        pageNumber: Number(row.pageNumber || row.page || 1) || 1,
        lineNumber: Number(row.lineNumber || row.line || index + 1) || index + 1,
        text: asText(row.text || row.rawText || row.content || row.description || ''),
        candidateTypes: Array.isArray(row.candidateTypes) ? row.candidateTypes : [],
        candidateDates: Array.isArray(row.candidateDates) ? row.candidateDates : [],
        candidateAmounts: Array.isArray(row.candidateAmounts) ? row.candidateAmounts : [],
        confidence: asNumber(row.confidence) ?? 0.5,
      })).filter((row) => row.text)
    }
  }

  // Nessuna riga disponibile
  return []
}

function buildSuggestedIgnoreSections(bankStatement) {
  // Recupera sezioni ignorate già note dall'audit
  const ignoredSummary = bankStatement?.ignoredReasonSummary || {}
  const sections = []
  if (ignoredSummary.bank_header > 0 || ignoredSummary.bank_header != null) sections.push('Intestazione banca')
  if (ignoredSummary.statement_summary > 0 || ignoredSummary.statement_summary != null) sections.push('Riepilogo estratto')
  if (ignoredSummary.opening_balance > 0 || ignoredSummary.opening_balance != null) sections.push('Saldo iniziale')
  // Da audit: unknownRows, unparsed
  const deltaDiagnostics = bankStatement?.deltaDiagnostics || bankStatement?.audit?.deltaDiagnostics || {}
  if (deltaDiagnostics?.reviewRowsInfo > 0) sections.push('Righe informative multilinea')
  return sections
}

function detectColumnPreset(bankStatement) {
  const profile = asText(bankStatement?.profile || bankStatement?.profileLabel || '').toLowerCase()
  // Banco di Sardegna usa data/valuta/uscite/entrate/descrizione
  if (profile.includes('banco') || profile.includes('sardegna')) {
    return GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_VALUE_OUT_IN_DESCRIPTION
  }
  // Sella usa data/dare/avere/descrizione (simile a DATE_VALUE_OUT_IN_DESCRIPTION)
  if (profile.includes('sella')) {
    return GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_VALUE_OUT_IN_DESCRIPTION
  }
  return GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED
}

export function buildGuidedImportInitialStateFromStatement(bankStatement) {
  if (!bankStatement) {
    return {
      flowId: `flow-empty-${Date.now()}`,
      mode: 'real',
      fieldsByKey: {},
      events: [],
      summary: null,
      dryRunResult: null,
      pickerOpen: false,
      pickerTargetKey: '',
      pickerTargetType: '',
      notes: 'Nessun import disponibile.',
      ignoredSections: [],
      multiline: { attached: false, markedAsNonMovement: false },
      extractedRows: [],
      columnPreset: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED,
    }
  }

  const documentAccount = bankStatement.documentAccount || {}
  const documentMeta = bankStatement.documentMeta || {}
  const pdfSummary = bankStatement.pdfSummary || {}
  const audit = bankStatement.audit || {}
  const confidence = mapReliabilityToConfidence(bankStatement.parseReliabilityLevel)

  const fields = [
    buildField({
      key: 'bank_name',
      label: 'Banca',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.BANK_NAME,
      proposedValue: pickFirst(documentAccount.bankName, documentMeta.bankName, bankStatement.bankName),
      source: 'documentAccount.bankName',
      confidence,
      allowManualEdit: true,
    }),
    buildField({
      key: 'iban',
      label: 'IBAN',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.IBAN,
      proposedValue: pickFirst(documentAccount.iban, documentMeta.iban, bankStatement.iban),
      source: 'documentAccount.iban',
      confidence,
      allowManualEdit: true,
    }),
    buildField({
      key: 'bic',
      label: 'BIC',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.BIC,
      proposedValue: pickFirst(documentAccount.bic, documentMeta.bic),
      source: 'documentAccount.bic',
      confidence: confidence * 0.9,
      allowManualEdit: true,
    }),
    buildField({
      key: 'account_number',
      label: 'Numero conto',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.ACCOUNT_NUMBER,
      proposedValue: pickFirst(documentAccount.accountNumber, documentMeta.accountCode, bankStatement.accountCode),
      source: 'documentAccount.accountNumber',
      confidence: confidence * 0.85,
      allowManualEdit: true,
    }),
    buildField({
      key: 'holder',
      label: 'Intestatario',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.HOLDER,
      proposedValue: pickFirst(documentAccount.holder, documentMeta.holder),
      source: 'documentAccount.holder',
      confidence: confidence * 0.9,
      allowManualEdit: true,
    }),
    buildField({
      key: 'period_start',
      label: 'Periodo da',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.PERIOD_START,
      proposedValue: pickFirst(bankStatement.periodStart, pdfSummary.periodStart),
      source: 'periodStart',
      confidence: confidence * 0.95,
      allowManualEdit: true,
    }),
    buildField({
      key: 'period_end',
      label: 'Periodo a',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.PERIOD_END,
      proposedValue: pickFirst(bankStatement.periodEnd, pdfSummary.periodEnd),
      source: 'periodEnd',
      confidence: confidence * 0.95,
      allowManualEdit: true,
    }),
    buildField({
      key: 'opening_balance',
      label: 'Saldo iniziale',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.OPENING_BALANCE,
      proposedValue: pickFirst(pdfSummary.openingBalance, bankStatement.openingBalance, audit.openingBalance),
      source: 'pdfSummary.openingBalance',
      confidence: confidence * 0.9,
      allowManualEdit: true,
    }),
    buildField({
      key: 'total_in',
      label: 'Totale entrate',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_IN,
      proposedValue: pickFirst(audit.totalIn, audit.totalEntrate, bankStatement.totalIn, bankStatement.totalEntrate),
      source: 'audit.totalIn',
      confidence,
      allowManualEdit: true,
    }),
    buildField({
      key: 'total_out',
      label: 'Totale uscite',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_OUT,
      proposedValue: pickFirst(audit.totalOut, audit.totalUscite, bankStatement.totalOut, bankStatement.totalUscite),
      source: 'audit.totalOut',
      confidence,
      allowManualEdit: true,
    }),
    buildField({
      key: 'closing_balance',
      label: 'Saldo finale',
      fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.CLOSING_BALANCE,
      proposedValue: pickFirst(pdfSummary.closingBalance, bankStatement.closingBalanceOfficial, bankStatement.closingBalance, audit.closingBalanceOfficial),
      source: 'pdfSummary.closingBalance',
      confidence,
      allowManualEdit: true,
    }),
    buildField({
      key: 'movement_header',
      label: 'Header movimenti',
      fieldId: null,
      proposedValue: pickFirst(bankStatement.movementHeaderRow, bankStatement.parsedHeader, audit.headerRowText),
      source: 'parsedHeader',
      confidence: confidence * 0.8,
      allowManualEdit: false,
      actionType: 'movement_header',
    }),
    buildField({
      key: 'column_preset',
      label: 'Preset colonne',
      fieldId: null,
      proposedValue: detectColumnPreset(bankStatement),
      source: 'profile_detection',
      confidence: confidence * 0.75,
      allowManualEdit: false,
      actionType: 'column_preset',
    }),
    buildField({
      key: 'ignore_sections',
      label: 'Sezioni da ignorare',
      fieldId: null,
      proposedValue: '',
      source: 'ignoredReasonSummary',
      confidence: 0.8,
      allowManualEdit: false,
      actionType: 'ignore_sections',
    }),
    buildField({
      key: 'multiline_rows',
      label: 'Righe multilinea',
      fieldId: null,
      proposedValue: '',
      source: 'deltaDiagnostics',
      confidence: 0.6,
      allowManualEdit: false,
      actionType: 'multiline',
    }),
  ]

  const fieldsByKey = {}
  fields.forEach((field) => {
    fieldsByKey[field.key] = field
  })

  const existingEvents = bankStatement?.guidedImportAudit?.events || bankStatement?.guidedImportAuditEvents || []
  const existingSummary = bankStatement?.guidedImportAudit?.summary || bankStatement?.guidedImportAuditSummary || null

  return {
    flowId: `flow-${bankStatement.sourceFileHash || bankStatement.sourceFileName || Date.now()}`,
    mode: 'real',
    fieldsByKey,
    events: Array.isArray(existingEvents) ? [...existingEvents] : [],
    summary: existingSummary,
    dryRunResult: null,
    pickerOpen: false,
    pickerTargetKey: '',
    pickerTargetType: '',
    notes: `Guida reale: ${bankStatement.sourceFileName || 'import corrente'}`,
    ignoredSections: buildSuggestedIgnoreSections(bankStatement),
    multiline: { attached: false, markedAsNonMovement: false },
    extractedRows: buildExtractedRows(bankStatement),
    columnPreset: detectColumnPreset(bankStatement),
  }
}

export default buildGuidedImportInitialStateFromStatement
