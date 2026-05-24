import { round2 } from '../canonical_mapper/utils.js'
import { parseRegistrazioneAmount } from './parseRegistrazioneAmount.js'

export function calculateRegistrazioneTotals(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  const totaleDare = round2(list.reduce((sum, row) => sum + parseRegistrazioneAmount(row?.dare ?? row?.importo_dare ?? 0), 0))
  const totaleAvere = round2(list.reduce((sum, row) => sum + parseRegistrazioneAmount(row?.avere ?? row?.importo_avere ?? 0), 0))
  const differenza = round2(totaleDare - totaleAvere)
  return {
    totaleDare,
    totaleAvere,
    differenza,
    isBalanced: Math.abs(differenza) < 0.005,
  }
}
