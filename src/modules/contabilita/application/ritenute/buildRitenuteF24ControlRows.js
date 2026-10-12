import {
  normalizeF24ControlPeriod,
  summarizeRitenutaF24Control,
} from '../../domain/ritenute/resolveRitenutaF24ControlStatus.js'

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

function normalizeTributeCode(value) {
  return text(value) || '1040'
}

function f24Period(line = {}) {
  return normalizeF24ControlPeriod({
    periodoRiferimento: line.periodo_riferimento ?? line.periodoRiferimento,
    annoRiferimento: line.anno_riferimento ?? line.annoRiferimento,
    paymentDate: line.data_pagamento ?? line.dataPagamento,
    dueDate: line.data_scadenza ?? line.dataScadenza,
  })
}

function f24Amount(line = {}) {
  return amount(line.importo ?? line.amount ?? line.importo_versato)
}

function f24PayDate(line = {}) {
  return toDateKey(line.data_pagamento ?? line.dataPagamento ?? line.data_versamento)
}

/**
 * Match scadenzario ritenute (da_versare) with imported F24 lines on codice 1040 + periodo.
 * Allocates F24 payments FIFO by payment date within each period bucket.
 */
export function buildRitenuteF24ControlRows({
  scadenzarioRows = [],
  f24Lines = [],
  tributeCode = '1040',
} = {}) {
  const targetCode = normalizeTributeCode(tributeCode)
  const poolByPeriod = new Map()

  for (const line of Array.isArray(f24Lines) ? f24Lines : []) {
    const code = normalizeTributeCode(line.codice_tributo ?? line.codiceTributo)
    if (code !== targetCode) continue
    const period = f24Period(line)
    if (!period) continue
    const bucket = poolByPeriod.get(period) || []
    bucket.push({
      id: text(line.id),
      importo: f24Amount(line),
      dataPagamento: f24PayDate(line),
      remaining: f24Amount(line),
      source: line,
    })
    poolByPeriod.set(period, bucket)
  }

  for (const bucket of poolByPeriod.values()) {
    bucket.sort((a, b) => String(a.dataPagamento || '9999').localeCompare(String(b.dataPagamento || '9999')))
  }

  return (Array.isArray(scadenzarioRows) ? scadenzarioRows : []).map((row) => {
    const period = normalizeF24ControlPeriod({
      periodoRiferimento: row.periodoRiferimento ?? row.periodo_riferimento,
      annoRiferimento: row.annoRiferimento ?? row.anno_riferimento,
      paymentDate: row.paymentDate ?? row.data_pagamento,
      dueDate: row.dueDate ?? row.data_scadenza,
    })
    const matured = amount(row.withholdingAmount ?? row.importo_ritenuta ?? row.ritenuta)
    const bucket = poolByPeriod.get(period) || []
    let paid = 0
    let latestPay = ''
    const matchedIds = []

    for (const entry of bucket) {
      if (paid >= matured - 0.009) break
      if (!(entry.remaining > 0)) continue
      const take = Math.min(entry.remaining, Math.round((matured - paid) * 100) / 100)
      entry.remaining = Math.round((entry.remaining - take) * 100) / 100
      paid = Math.round((paid + take) * 100) / 100
      matchedIds.push(entry.id)
      if (entry.dataPagamento && (!latestPay || entry.dataPagamento > latestPay)) {
        latestPay = entry.dataPagamento
      }
    }

    const control = summarizeRitenutaF24Control({
      maturedAmount: matured,
      paidAmount: paid,
      dueDate: row.dueDate ?? row.data_scadenza,
      f24PaymentDate: latestPay,
      codiceTributo: normalizeTributeCode(row.codiceTributo ?? row.codice_tributo) || targetCode,
      periodo: period,
    })

    return {
      ...row,
      f24Control: {
        ...control,
        matchedF24Ids: matchedIds.filter(Boolean),
        matchedF24Count: matchedIds.filter(Boolean).length,
      },
    }
  })
}

export function summarizeF24ControlStatuses(rows = []) {
  const counts = { verde: 0, giallo: 0, rosso: 0 }
  for (const row of rows) {
    const status = text(row?.f24Control?.status).toLowerCase()
    if (status in counts) counts[status] += 1
  }
  return counts
}
