import { resolveRitenutaScadenza } from '../../domain/ritenute/resolveRitenutaScadenza.js'

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

function resolveDueDate(row) {
  return toDateKey(row?.data_scadenza)
    || resolveRitenutaScadenza(toDateKey(row?.data_pagamento)).dataScadenza
}

export function buildRitenuteScadenzarioRows({
  ritenute = [],
  year,
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const selectedYear = Number(year) || null
  const todayKey = toDateKey(today)

  return (Array.isArray(ritenute) ? ritenute : [])
    .filter((row) => text(row?.stato).toLowerCase() === 'da_versare')
    .filter((row) => !selectedYear || toDateKey(row?.data_pagamento).startsWith(String(selectedYear)))
    .map((row) => {
      const paymentDate = toDateKey(row.data_pagamento)
      const dueDate = resolveDueDate(row)
      const withholdingAmount = amount(row.importo_ritenuta ?? row.ritenuta)
      const compensationAmount = amount(row.imponibile_ritenuta ?? row.compenso_lordo)

      return {
        key: `ritenuta-scadenza-${text(row.id)}`,
        id: text(row.id),
        stato: 'da_versare',
        operationalStatus: dueDate && todayKey && dueDate < todayKey ? 'scaduta' : 'da_versare',
        percipienteId: text(row.percipiente_id),
        percipiente: text(row.percipiente_denominazione) || 'Percipiente non identificato',
        codiceFiscale: text(row.percipiente_cf),
        sourceParcella: text(row.numero_documento) || 'Parcella senza numero',
        paymentDate,
        dueDate,
        withholdingAmount,
        compensationAmount,
        codiceTributo: text(row.codice_tributo) || '1040',
        periodoRiferimento: text(row.periodo_riferimento),
        annoRiferimento: Number(row.anno_riferimento) || (paymentDate ? Number(paymentDate.slice(0, 4)) : null),
        primaNotaParcellaId: text(row.prima_nota_id),
        primaNotaPagamentoId: text(row.prima_nota_pagamento_id),
        partitarioId: text(row.partitario_id),
        cu770: {
          ready: Boolean(
            text(row.percipiente_id)
            && paymentDate
            && compensationAmount > 0
            && withholdingAmount > 0
          ),
          percipienteId: text(row.percipiente_id),
          imponibileRitenuta: compensationAmount,
          importoRitenuta: withholdingAmount,
          dataPagamento: paymentDate,
          codiceTributo: text(row.codice_tributo) || '1040',
          annoFiscale: Number(row.anno_riferimento) || (paymentDate ? Number(paymentDate.slice(0, 4)) : null),
        },
        futureF24: {
          selectable: true,
          automated: false,
          codiceTributo: text(row.codice_tributo) || '1040',
          importo: withholdingAmount,
          scadenza: dueDate,
        },
        sourceRitenuta: row,
      }
    })
    .sort((left, right) =>
      String(left.dueDate || '9999-12-31').localeCompare(String(right.dueDate || '9999-12-31'))
      || left.percipiente.localeCompare(right.percipiente)
    )
}
