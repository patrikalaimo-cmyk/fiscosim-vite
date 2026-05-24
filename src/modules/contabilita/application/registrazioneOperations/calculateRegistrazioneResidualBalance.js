import { calculateRegistrazioneTotals } from './calculateRegistrazioneTotals.js'
import { parseRegistrazioneAmount } from './parseRegistrazioneAmount.js'

function hasAmount(row) {
  const dare = parseRegistrazioneAmount(row?.dare || 0)
  const avere = parseRegistrazioneAmount(row?.avere || 0)
  return Math.abs(dare) > 0.005 || Math.abs(avere) > 0.005
}

export function calculateRegistrazioneResidualBalance(rows = [], { excludeRowId = '', activeRowId = '' } = {}) {
  const list = Array.isArray(rows) ? rows : []
  const targetRowId = String(activeRowId || excludeRowId || '').trim()
  const effectiveRows = targetRowId ? list.filter((row) => String(row?.id || '') !== targetRowId) : list
  const totals = calculateRegistrazioneTotals(effectiveRows)
  const diff = Number((totals.totaleDare - totals.totaleAvere).toFixed(2))

  if (Math.abs(diff) < 0.005) {
    return {
      totaleDare: totals.totaleDare,
      totaleAvere: totals.totaleAvere,
      side: null,
      amount: 0,
      isBalanced: true,
      diff: 0,
    }
  }

  return {
    totaleDare: totals.totaleDare,
    totaleAvere: totals.totaleAvere,
    side: diff > 0 ? 'avere' : 'dare',
    amount: Number(Math.abs(diff).toFixed(2)),
    isBalanced: false,
    diff,
  }
}

export function canApplyRegistrazioneResidualToRow(row = {}) {
  if (!row || typeof row !== 'object') return false
  if (row.manualAmountOverride) return false
  if (hasAmount(row) && !row.autoResidualApplied) return false
  return true
}
