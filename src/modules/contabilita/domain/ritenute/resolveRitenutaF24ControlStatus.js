/**
 * Controllo ritenuta maturata vs F24 importato (cod. 1040).
 * Verde: versato >= dovuto e data versamento <= scadenza.
 * Giallo: versato >= dovuto ma versamento in ritardo.
 * Rosso: versato insufficiente o assente.
 */

function text(value) {
  return String(value ?? '').trim()
}

function amount(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function toDateKey(value) {
  const normalized = text(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

export function normalizeF24ControlPeriod({
  periodoRiferimento,
  annoRiferimento,
  paymentDate,
  dueDate,
} = {}) {
  const periodo = text(periodoRiferimento)
  if (/^\d{2}\/\d{4}$/.test(periodo)) return periodo
  if (/^\d{4}-\d{2}$/.test(periodo)) {
    return `${periodo.slice(5, 7)}/${periodo.slice(0, 4)}`
  }
  const pay = toDateKey(paymentDate)
  if (pay) return `${pay.slice(5, 7)}/${pay.slice(0, 4)}`
  const due = toDateKey(dueDate)
  if (due) {
    // scadenza 16/M+1 → periodo tipico mese precedente
    const y = Number(due.slice(0, 4))
    const m = Number(due.slice(5, 7))
    const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
    return `${String(prev.m).padStart(2, '0')}/${prev.y}`
  }
  const year = Number(annoRiferimento)
  if (Number.isFinite(year) && year > 0) return `00/${year}`
  return ''
}

/**
 * @returns {'verde'|'giallo'|'rosso'}
 */
export function resolveRitenutaF24ControlStatus({
  maturedAmount,
  paidAmount,
  dueDate,
  f24PaymentDate,
  tolerance = 0.01,
} = {}) {
  const due = amount(maturedAmount)
  const paid = amount(paidAmount)
  const dueKey = toDateKey(dueDate)
  const payKey = toDateKey(f24PaymentDate)
  const residual = Math.round((due - paid) * 100) / 100

  if (!(due > 0)) return 'rosso'
  if (paid + tolerance < due) return 'rosso'
  if (dueKey && payKey && payKey > dueKey) return 'giallo'
  return 'verde'
}

export function summarizeRitenutaF24Control({
  maturedAmount,
  paidAmount,
  dueDate,
  f24PaymentDate,
  codiceTributo = '1040',
  periodo = '',
} = {}) {
  const due = amount(maturedAmount)
  const paid = amount(paidAmount)
  const status = resolveRitenutaF24ControlStatus({
    maturedAmount: due,
    paidAmount: paid,
    dueDate,
    f24PaymentDate,
  })
  return {
    status,
    codiceTributo: text(codiceTributo) || '1040',
    periodo: text(periodo),
    maturedAmount: due,
    paidAmount: paid,
    residualAmount: Math.round(Math.max(0, due - paid) * 100) / 100,
    dueDate: toDateKey(dueDate),
    f24PaymentDate: toDateKey(f24PaymentDate),
    onTime: status === 'verde',
    late: status === 'giallo',
    shortfall: status === 'rosso',
  }
}
