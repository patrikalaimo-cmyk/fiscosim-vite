import { normalizeMockText } from './riconciliazioneMockSelectors.js'

function parseAmountLike(value) {
  if (value == null) return null
  if (typeof value === 'object') {
    if ('amount' in value) return parseAmountLike(value.amount)
    if ('value' in value) return parseAmountLike(value.value)
    if ('raw' in value) return parseAmountLike(value.raw)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const raw = String(value).trim()
  if (!raw) return null
  const cleaned = raw
    .replace(/â‚¬/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.+-]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCents(value) {
  const numeric = parseAmountLike(value) ?? 0
  if (!Number.isFinite(numeric)) return '0.00'
  return (Math.round(numeric * 100) / 100).toFixed(2)
}

export function buildBankDedupKey(movement) {
  const parts = [
    movement.bankAccountId || '',
    movement.operationDate || '',
    movement.valueDate || '',
    movement.amount != null ? formatCents(movement.amount) : '',
    movement.direction || '',
    normalizeMockText(movement.descriptionNormalized || movement.descriptionRaw || ''),
    normalizeMockText(movement.reference || movement.cro || movement.transactionId || ''),
  ]
  return parts.join('|')
}
