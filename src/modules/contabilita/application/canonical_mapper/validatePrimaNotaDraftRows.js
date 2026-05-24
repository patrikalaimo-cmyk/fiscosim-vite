import { round2, normalizeText } from './utils.js'

export function validatePrimaNotaDraftRows(rows = [], totals = { dare: 0, avere: 0 }) {
  const list = Array.isArray(rows) ? rows : []
  const blockers = []
  const warnings = []

  if (!list.length) blockers.push('righe prima nota assenti')

  list.forEach((row, index) => {
    const accountId = normalizeText(row?.conto_id || row?.accountId || '')
    const description = normalizeText(row?.descrizione || row?.description || row?.descrizione_riga || '')
    const dare = round2(row?.dare ?? row?.importo_dare ?? 0)
    const avere = round2(row?.avere ?? row?.importo_avere ?? 0)

    if (!accountId) blockers.push(`riga ${index + 1}: conto mancante`)
    if (!description) warnings.push(`riga ${index + 1}: descrizione vuota`)
    if (dare < 0 || avere < 0) blockers.push(`riga ${index + 1}: importo negativo`)
    if (dare === 0 && avere === 0) blockers.push(`riga ${index + 1}: importo assente`)
  })

  if (Math.abs(round2(totals.dare) - round2(totals.avere)) > 0.01) blockers.push('Dare/Avere non quadrati')

  return {
    status: blockers.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    blockers,
    warnings,
  }
}
