const BLOCKER_CODES = {
  PAYLOAD_MISSING: 'P7_PAYLOAD_MISSING',
  PAYLOAD_BLOCKED: 'P7_PAYLOAD_BLOCKED',
  MISSING_SOCIETA: 'P7_MISSING_SOCIETA',
  MISSING_DOCUMENT: 'P7_MISSING_DOCUMENT',
  MISSING_REGISTRATION_DATE: 'P7_MISSING_REGISTRATION_DATE',
  MISSING_DOCUMENT_DATE: 'P7_MISSING_DOCUMENT_DATE',
  MISSING_DOCUMENT_NUMBER: 'P7_MISSING_DOCUMENT_NUMBER',
  MISSING_COUNTERPARTY: 'P7_MISSING_COUNTERPARTY',
  MISSING_CAUSALE: 'P7_MISSING_CAUSALE',
  MISSING_ACCOUNTING_ROWS: 'P7_MISSING_ACCOUNTING_ROWS',
  UNBALANCED_ACCOUNTING: 'P7_UNBALANCED_ACCOUNTING',
  MISSING_VAT_CAUSALE: 'P7_MISSING_VAT_CAUSALE',
  WITHHOLDING_NOT_SUPPORTED: 'P7_WITHHOLDING_NOT_SUPPORTED',
  REVERSE_NOT_SUPPORTED: 'P7_REVERSE_NOT_SUPPORTED',
  FOREIGN_NOT_SUPPORTED: 'P7_FOREIGN_NOT_SUPPORTED',
  CASH_VAT_NOT_SUPPORTED: 'P7_CASH_VAT_NOT_SUPPORTED',
  BATCH_NOT_SUPPORTED: 'P7_BATCH_NOT_SUPPORTED',
  FORBIDDEN_LEGACY_REFERENCE: 'P7_FORBIDDEN_LEGACY_REFERENCE',
}

function hasValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function includesForbiddenLegacyReference(node) {
  const blockedTokens = ['documenti_import', 'accounting_entries', 'partitari']
  const queue = [node]
  while (queue.length > 0) {
    const current = queue.shift()
    if (typeof current === 'string') {
      const normalized = current.toLowerCase()
      if (blockedTokens.some((token) => normalized.includes(token))) return true
      continue
    }
    if (!current || typeof current !== 'object') continue
    for (const value of Object.values(current)) queue.push(value)
  }
  return false
}

function buildNormalizedPayload(payload) {
  const accountingRows = Array.isArray(payload?.accounting?.rows) ? payload.accounting.rows : []
  const vatRows = Array.isArray(payload?.vat?.rows) ? payload.vat.rows : []
  return {
    raw: payload,
    company: payload?.company || {},
    document: payload?.document || {},
    accounting: payload?.accounting || {},
    vat: { ...(payload?.vat || {}), rows: vatRows },
    validation: payload?.validation || {},
    withholding: payload?.withholding || {},
    flags: {
      reverse: Boolean(payload?.reverse),
      estero: Boolean(payload?.estero),
      ivaPerCassa: Boolean(payload?.ivaPerCassa || payload?.cashVat || payload?.vat?.ivaPerCassa),
      batch: Boolean(payload?.batch || payload?.multiDocument || (Array.isArray(payload?.documents) && payload.documents.length > 1)),
    },
    accountingRows,
  }
}

function pushBlocker(blockers, code, message) {
  blockers.push({ code, message })
}

export function validateCommitInput(payload, ctx = {}) {
  const blockers = []
  const warnings = []

  if (!payload || typeof payload !== 'object') {
    pushBlocker(blockers, BLOCKER_CODES.PAYLOAD_MISSING, 'Payload mancante o non valido.')
    return { ok: false, status: 'blocked', blockers, warnings, normalized: null }
  }

  const normalized = buildNormalizedPayload(payload)

  if (String(normalized.validation?.status || '').toLowerCase() === 'blocked') {
    pushBlocker(blockers, BLOCKER_CODES.PAYLOAD_BLOCKED, 'Payload già marcato blocked.')
  }
  if (!hasValue(normalized.company?.societaId)) {
    pushBlocker(blockers, BLOCKER_CODES.MISSING_SOCIETA, 'company.societaId mancante.')
  }
  if (!normalized.document || typeof normalized.document !== 'object') {
    pushBlocker(blockers, BLOCKER_CODES.MISSING_DOCUMENT, 'document mancante.')
  }
  if (!hasValue(normalized.document?.registrationDate)) {
    pushBlocker(blockers, BLOCKER_CODES.MISSING_REGISTRATION_DATE, 'document.registrationDate mancante.')
  }
  if (!hasValue(normalized.document?.documentDate)) {
    pushBlocker(blockers, BLOCKER_CODES.MISSING_DOCUMENT_DATE, 'document.documentDate mancante.')
  }
  if (!hasValue(normalized.document?.number)) {
    pushBlocker(blockers, BLOCKER_CODES.MISSING_DOCUMENT_NUMBER, 'document.number mancante.')
  }
  if (!hasValue(normalized.document?.counterparty?.accountId)) {
    pushBlocker(blockers, BLOCKER_CODES.MISSING_COUNTERPARTY, 'document.counterparty.accountId mancante.')
  }
  if (!normalized.accounting?.causaleContabile) {
    pushBlocker(blockers, BLOCKER_CODES.MISSING_CAUSALE, 'accounting.causaleContabile mancante.')
  }
  if (normalized.accountingRows.length === 0) {
    pushBlocker(blockers, BLOCKER_CODES.MISSING_ACCOUNTING_ROWS, 'accounting.rows assenti.')
  }
  if (normalized.accounting?.isBalanced !== true) {
    pushBlocker(blockers, BLOCKER_CODES.UNBALANCED_ACCOUNTING, 'accounting.isBalanced deve essere true.')
  }

  const missingVatCausale = normalized.vat.rows.some((row) => {
    const taxable = Number(row?.taxable || row?.imponibile || 0)
    const vatAmount = Number(row?.vat || row?.iva || 0)
    return (taxable > 0 || vatAmount > 0) && !hasValue(row?.causaleIvaId)
  })
  if (missingVatCausale) {
    pushBlocker(blockers, BLOCKER_CODES.MISSING_VAT_CAUSALE, 'Righe IVA senza causaleIvaId.')
  }

  if (normalized.withholding?.enabled === true) {
    pushBlocker(blockers, BLOCKER_CODES.WITHHOLDING_NOT_SUPPORTED, 'Ritenuta non supportata in P7C3.')
  }
  if (normalized.flags.reverse) {
    pushBlocker(blockers, BLOCKER_CODES.REVERSE_NOT_SUPPORTED, 'Reverse non supportato in P7C3.')
  }
  if (normalized.flags.estero) {
    pushBlocker(blockers, BLOCKER_CODES.FOREIGN_NOT_SUPPORTED, 'Estero non supportato in P7C3.')
  }
  if (normalized.flags.ivaPerCassa) {
    pushBlocker(blockers, BLOCKER_CODES.CASH_VAT_NOT_SUPPORTED, 'IVA per cassa non supportata in P7C3.')
  }
  if (normalized.flags.batch) {
    pushBlocker(blockers, BLOCKER_CODES.BATCH_NOT_SUPPORTED, 'Batch/multi-documento non supportato in P7C3.')
  }

  if (includesForbiddenLegacyReference(payload)) {
    pushBlocker(blockers, BLOCKER_CODES.FORBIDDEN_LEGACY_REFERENCE, 'Riferimento legacy non consentito nel payload.')
  }

  if (String(normalized.validation?.status || '').toLowerCase() === 'warning') {
    warnings.push({ code: 'P7_PAYLOAD_WARNING', message: 'Payload con warning, commit consentito in dry-run.' })
  }

  return {
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers,
    warnings,
    normalized,
    ctx,
  }
}
