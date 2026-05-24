import { round2 } from './utils.js'

export function calculatePrimaNotaDraftTotals(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  const totalDare = round2(list.reduce((sum, row) => sum + round2(row?.dare ?? row?.importo_dare ?? 0), 0))
  const totalAvere = round2(list.reduce((sum, row) => sum + round2(row?.avere ?? row?.importo_avere ?? 0), 0))
  return {
    dare: totalDare,
    avere: totalAvere,
    isBalanced: Math.abs(totalDare - totalAvere) <= 0.01,
  }
}
