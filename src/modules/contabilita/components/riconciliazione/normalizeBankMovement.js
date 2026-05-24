import { buildBankDedupKey } from './buildBankDedupKey.js'
import { normalizeMockText } from './riconciliazioneMockSelectors.js'

function parseItalianAmountLike(value) {
  if (value == null) return null
  if (typeof value === 'object') {
    if ('amount' in value) return parseItalianAmountLike(value.amount)
    if ('value' in value) return parseItalianAmountLike(value.value)
    if ('raw' in value) return parseItalianAmountLike(value.raw)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const raw = String(value).trim()
  if (!raw) return null
  const cleaned = raw
    .replace(/\u20AC/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.+-]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeBankMovement(raw = {}, context = {}) {
  const amount = parseItalianAmountLike(raw.amount ?? raw.importo ?? raw.value ?? 0)
  const direction = raw.direction === 'in' || raw.direction === 'out' ? raw.direction : ''
  const normalizedAmount = Math.abs(Number(amount ?? 0))
  const descriptionRaw = String(raw.descriptionRaw || raw.description || raw.descrizione || '').trim()
  const hasMinimumData = Boolean(raw.operationDate && normalizedAmount > 0 && direction && descriptionRaw)
  const duplicateStatus = raw.duplicateStatus || 'unique'
  const status = raw.status || (duplicateStatus !== 'unique' ? 'duplicate' : hasMinimumData ? 'imported' : 'blocked')

  const movement = {
    movementId: raw.movementId || `${context.statementId || 'st'}-${Number.isFinite(Number(raw.rowIndex)) ? Number(raw.rowIndex) : context.rowIndex ?? 0}`,
    statementId: context.statementId || raw.statementId || '',
    rowIndex: Number.isFinite(Number(raw.rowIndex)) ? Number(raw.rowIndex) : context.rowIndex ?? 0,
    bankAccountId: raw.bankAccountId || context.bankAccountId || '',
    operationDate: raw.operationDate || raw.data_operazione || '',
    valueDate: raw.valueDate || raw.data_valuta || raw.operationDate || '',
    descriptionRaw: raw.descriptionRaw || raw.description || raw.descrizione || '',
    descriptionNormalized: normalizeMockText(raw.descriptionNormalized || raw.description || raw.descrizione || ''),
    amount: normalizedAmount,
    direction,
    currency: raw.currency || raw.valuta || context.currency || 'EUR',
    bankCausal: raw.bankCausal || raw.causale_bancaria || '',
    reference: raw.reference || raw.riferimento || '',
    cro: raw.cro || '',
    transactionId: raw.transactionId || raw.transaction_id || '',
    counterpartyName: raw.counterpartyName || raw.controparte || '',
    counterpartyIban: raw.counterpartyIban || '',
    dedupKey: raw.dedupKey || buildBankDedupKey({
      bankAccountId: raw.bankAccountId || context.bankAccountId || '',
      operationDate: raw.operationDate || raw.data_operazione || '',
      valueDate: raw.valueDate || raw.data_valuta || raw.operationDate || '',
      amount: normalizedAmount,
      direction,
      descriptionNormalized: normalizeMockText(raw.descriptionNormalized || descriptionRaw),
      reference: raw.reference || raw.riferimento || raw.cro || raw.transactionId || '',
      cro: raw.cro || '',
      transactionId: raw.transactionId || raw.transaction_id || '',
    }),
    duplicateStatus,
    parseConfidence: Number(raw.parseConfidence ?? (hasMinimumData ? 78 : 32)),
    status,
    sourceMeta: {
      sourceFile: context.sourceFileName || '',
      sourceFileType: context.sourceFileType || '',
      parseMode: context.parseMode || 'manual',
      ...(raw.sourceMeta || {}),
    },
  }

  return movement
}
