import { buildCausaleContabilePolicy } from '../../domain/causali/buildCausaleContabilePolicy.js'

function hasFlag(source = {}) {
  return Boolean(
    source?.split_payment ||
    source?.splitPayment ||
    source?.cliente_split_payment ||
    source?.clienteSplitPayment
  )
}

function normalizeId(value) {
  return String(value || '').trim()
}

export function resolveRegistrazioneSplitPayment({
  header = {},
  documentData = {},
  ivaData = {},
  causaleContabile = null,
  pianoConti = [],
} = {}) {
  const policy = buildCausaleContabilePolicy(causaleContabile || header?.causaleContabile || {})
  const isActiveVatDocument = Boolean(policy.isFatturaAttiva || policy.isNotaCreditoAttiva)
  const selectedContoId = normalizeId(header?.clienteFornitoreId || header?.cliente_fornitore_id || header?.clienteFornitore?.id || header?.cliente_fornitore?.id)
  const selectedConto = selectedContoId
    ? (Array.isArray(pianoConti) ? pianoConti : []).find((item) => normalizeId(item?.id) === selectedContoId)
    : null
  const counterpartyEnabled = hasFlag(header) || hasFlag(selectedConto)
  const documentEnabled = hasFlag(documentData) || hasFlag(ivaData)
  const active = Boolean(isActiveVatDocument && (counterpartyEnabled || documentEnabled))

  return {
    active,
    isActiveVatDocument,
    counterpartyEnabled,
    documentEnabled,
    source: counterpartyEnabled ? 'controparte' : documentEnabled ? 'documento' : 'none',
  }
}
