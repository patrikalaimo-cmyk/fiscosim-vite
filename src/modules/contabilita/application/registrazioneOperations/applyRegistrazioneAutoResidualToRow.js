import { calculateRegistrazioneResidualBalance, canApplyRegistrazioneResidualToRow } from './calculateRegistrazioneResidualBalance.js'
import { normalizeRegistrazioneAmountInput } from './normalizeRegistrazioneAmountInput.js'

export function applyRegistrazioneAutoResidualToRow(rows = [], rowId = '', options = {}) {
  const list = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : []
  const targetIndex = list.findIndex((row) => String(row?.id || '') === String(rowId || ''))
  if (targetIndex < 0) {
    return {
      rows: list,
      applied: false,
      side: null,
      amount: 0,
      reason: 'row_not_found',
    }
  }

  const target = { ...list[targetIndex] }
  const canRecalculateAuto = Boolean(target.autoResidualApplied && !target.manualAmountOverride)
  if (!canApplyRegistrazioneResidualToRow(target) && !canRecalculateAuto) {
    return {
      rows: list,
      applied: false,
      side: null,
      amount: 0,
      reason: target.manualAmountOverride ? 'manual_override' : 'row_has_amount',
    }
  }

  const residual = calculateRegistrazioneResidualBalance(list, {
    excludeRowId: rowId,
    activeRowId: options?.activeRowId || rowId,
  })

  if (!residual.side || residual.amount <= 0) {
    if (canRecalculateAuto) {
      target.dare = ''
      target.avere = ''
      target.autoResidualApplied = false
      target.manualAmountOverride = false
      list[targetIndex] = target
      return {
        rows: list,
        applied: true,
        side: null,
        amount: 0,
        reason: 'cleared',
      }
    }
    return {
      rows: list,
      applied: false,
      side: residual.side,
      amount: residual.amount,
      reason: 'no_residual',
    }
  }

  const amount = normalizeRegistrazioneAmountInput(residual.amount)
  if (!amount) {
    return {
      rows: list,
      applied: false,
      side: residual.side,
      amount: residual.amount,
      reason: 'invalid_amount',
    }
  }

  target.dare = residual.side === 'dare' ? amount : ''
  target.avere = residual.side === 'avere' ? amount : ''
  target.autoResidualApplied = true
  target.manualAmountOverride = false
  list[targetIndex] = target

  return {
    rows: list,
    applied: true,
    side: residual.side,
    amount: residual.amount,
    reason: null,
  }
}
