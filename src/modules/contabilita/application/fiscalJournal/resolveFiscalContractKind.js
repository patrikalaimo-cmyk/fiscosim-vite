/**
 * Infer Stage3W contract_kind from causale policy + persistence plan.
 * Returns null when the draft cannot be mapped to a supported fiscal contract
 * (e.g. pure general journal — keep using createPrimaNotaCompleta / Stage3U).
 */

function vatIsVendita(vatEntries = []) {
  return vatEntries.some((r) => String(r?.tipo || '').toLowerCase() === 'vendita')
}

function vatIsAcquisto(vatEntries = []) {
  return vatEntries.some((r) => String(r?.tipo || '').toLowerCase() === 'acquisto')
}

function hasSplit(vatEntries = []) {
  return vatEntries.some((r) => r?.split_payment === true)
}

function hasOpenings(partEntries = []) {
  return partEntries.some((r) => !r?.documento_id && r?.tipo_movimento !== 'chiusura')
}

function hasClosures(partEntries = []) {
  return partEntries.some((r) => r?.documento_id || r?.tipo_movimento === 'chiusura')
}

export function resolveFiscalContractKind({
  policy = {},
  vatEntries = [],
  partEntries = [],
  ritenutaEntries = [],
  ritenutaUpdates = [],
} = {}) {
  const whDoc = Array.isArray(ritenutaEntries) && ritenutaEntries.length > 0
  const whPay = Array.isArray(ritenutaUpdates) && ritenutaUpdates.length > 0
  const close = hasClosures(partEntries) || policy.gestionePartitario === 'chiusura'
  const open = hasOpenings(partEntries) || policy.gestionePartitario === 'apertura'
  const split = hasSplit(vatEntries)
  const nc = Boolean(policy.notaCredito || policy.isNotaCreditoAttiva || policy.isNotaCreditoPassiva)
  const vendita = vatIsVendita(vatEntries) || policy.isFatturaAttiva || policy.isNotaCreditoAttiva
  const acquisto = vatIsAcquisto(vatEntries) || policy.isFatturaPassiva || policy.isNotaCreditoPassiva

  if (whDoc) return 'parcella_documento'
  if (close && !open) return 'pagamento'
  if (close && open) return 'pagamento' // mixed ledger treated as payment contract
  if (split && vendita) return 'split_attiva'
  if (nc && vendita) return 'nota_credito_attiva'
  if (nc && acquisto) return 'nota_credito_passiva'
  if (vendita && open) return 'fattura_attiva'
  if (acquisto && open) return 'fattura_passiva'
  return null
}
