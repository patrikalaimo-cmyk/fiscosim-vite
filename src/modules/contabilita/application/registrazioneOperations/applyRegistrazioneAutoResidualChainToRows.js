import { normalizeRegistrazioneAmountInput } from './normalizeRegistrazioneAmountInput.js'
import { parseRegistrazioneAmount } from './parseRegistrazioneAmount.js'

function cloneRows(rows = []) {
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : []
}

function normalizeSideAndAmount(totaleDare, totaleAvere) {
  const diff = Number((totaleDare - totaleAvere).toFixed(2))
  if (Math.abs(diff) < 0.005) {
    return { side: null, amount: 0, diff: 0 }
  }
  return {
    side: diff > 0 ? 'avere' : 'dare',
    amount: Number(Math.abs(diff).toFixed(2)),
    diff,
  }
}

function hasExplicitManualAmount(row = {}) {
  const dare = parseRegistrazioneAmount(row?.dare || 0)
  const avere = parseRegistrazioneAmount(row?.avere || 0)
  return Boolean(row?.manualAmountOverride) || ((!row?.autoResidualApplied) && (Math.abs(dare) > 0.005 || Math.abs(avere) > 0.005))
}

export function applyRegistrazioneAutoResidualChainToRows(rows = [], startRowIdOrIndex = 0) {
  const list = cloneRows(rows)
  if (!list.length) {
    return {
      rows: list,
      applied: false,
      side: null,
      amount: 0,
      reason: 'empty',
    }
  }

  let totaleDare = 0
  let totaleAvere = 0
  let applied = false
  let lastResidual = { side: null, amount: 0, diff: 0 }

  for (let index = 0; index < list.length; index += 1) {
    const row = { ...list[index] }
    const explicitManual = hasExplicitManualAmount(row)

    if (explicitManual) {
      totaleDare += parseRegistrazioneAmount(row.dare || 0)
      totaleAvere += parseRegistrazioneAmount(row.avere || 0)
      lastResidual = normalizeSideAndAmount(totaleDare, totaleAvere)
      list[index] = row
      continue
    }

    const residual = normalizeSideAndAmount(totaleDare, totaleAvere)
    lastResidual = residual

    if (!residual.side || residual.amount <= 0) {
      if (row.autoResidualApplied || String(row.dare || '').trim() || String(row.avere || '').trim()) {
        row.dare = ''
        row.avere = ''
        row.autoResidualApplied = false
        row.manualAmountOverride = false
        applied = true
      }
      list[index] = row
      continue
    }

    const amount = normalizeRegistrazioneAmountInput(residual.amount)
    const nextDare = residual.side === 'dare' ? amount : ''
    const nextAvere = residual.side === 'avere' ? amount : ''
    if (row.dare !== nextDare || row.avere !== nextAvere || !row.autoResidualApplied) {
      row.dare = nextDare
      row.avere = nextAvere
      row.autoResidualApplied = true
      row.manualAmountOverride = false
      applied = true
    }

    totaleDare += parseRegistrazioneAmount(row.dare || 0)
    totaleAvere += parseRegistrazioneAmount(row.avere || 0)
    list[index] = row
  }

  return {
    rows: list,
    applied,
    side: lastResidual.side,
    amount: lastResidual.amount,
    reason: applied ? null : 'no_change',
  }
}
