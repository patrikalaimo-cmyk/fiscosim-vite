import { calculateRegistrazioneTotals } from './calculateRegistrazioneTotals.js'

function toNumber(value) {
  const n = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function applyRegistrazioneSbilancio(rows = [], { activeRowId = '' } = {}) {
  const cloned = (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }))
  const totals = calculateRegistrazioneTotals(cloned)
  const diff = Number((totals.totaleDare - totals.totaleAvere).toFixed(2))

  if (Math.abs(diff) < 0.005) {
    return { rows: cloned, totals, changed: false, targetRowId: activeRowId || null, targetField: null }
  }

  const targetIndex = cloned.findIndex((row) => String(row?.id || '') === String(activeRowId || ''))
  const fallbackIndex = cloned.findIndex((row) => toNumber(row?.dare) === 0 || toNumber(row?.avere) === 0)
  const index = targetIndex >= 0 ? targetIndex : fallbackIndex >= 0 ? fallbackIndex : cloned.length - 1

  if (index < 0) {
    return { rows: cloned, totals, changed: false, targetRowId: null, targetField: null }
  }

  const target = { ...cloned[index] }
  let targetField = null
  if (diff > 0) {
    if (toNumber(target.avere) === 0) {
      target.avere = diff
      targetField = 'avere'
    } else if (toNumber(target.dare) === 0) {
      target.dare = diff
      targetField = 'dare'
    } else {
      return { rows: cloned, totals, changed: false, targetRowId: target.id || null, targetField: null }
    }
  } else if (diff < 0) {
    const value = Math.abs(diff)
    if (toNumber(target.dare) === 0) {
      target.dare = value
      targetField = 'dare'
    } else if (toNumber(target.avere) === 0) {
      target.avere = value
      targetField = 'avere'
    } else {
      return { rows: cloned, totals, changed: false, targetRowId: target.id || null, targetField: null }
    }
  }

  cloned[index] = target
  const nextTotals = calculateRegistrazioneTotals(cloned)
  return {
    rows: cloned,
    totals: nextTotals,
    changed: true,
    targetRowId: target.id || null,
    targetField,
  }
}

