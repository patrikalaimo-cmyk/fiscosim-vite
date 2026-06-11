import { aggregateVatRegisterEntries } from './aggregateVatRegisterEntries.js'

const PERIODICITA_AMMESSE = new Set(['mensile', 'trimestrale'])

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeDate(value) {
  return normalizeText(value).slice(0, 10)
}

function normalizePeriodicita(value) {
  return normalizeText(value).toLowerCase()
}

function rowAmount(row, field) {
  const value = row?.[field]
  if (value == null || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) return round2(value)
  const parsed = Number.parseFloat(String(value).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

function buildBreakdown(rows = []) {
  const breakdown = {
    vendite: {
      righe: 0,
      imponibile: 0,
      ivaLorda: 0,
      ivaSplitPayment: 0,
      ivaDebitoEffettivo: 0,
    },
    acquisti: {
      righe: 0,
      imponibile: 0,
      ivaRegistrata: 0,
      ivaDetraibile: 0,
      ivaIndetraibile: 0,
    },
  }

  for (const row of rows) {
    const tipo = normalizeText(row?.tipo).toLowerCase()
    if (tipo === 'vendita') {
      const iva = rowAmount(row, 'iva')
      breakdown.vendite.righe += 1
      breakdown.vendite.imponibile += rowAmount(row, 'imponibile')
      breakdown.vendite.ivaLorda += iva
      if (row?.split_payment === true || row?.splitPayment === true) {
        breakdown.vendite.ivaSplitPayment += iva
      }
    } else if (tipo === 'acquisto') {
      breakdown.acquisti.righe += 1
      breakdown.acquisti.imponibile += rowAmount(row, 'imponibile')
      breakdown.acquisti.ivaRegistrata += rowAmount(row, 'iva')
      breakdown.acquisti.ivaDetraibile += rowAmount(row, 'iva_detraibile')
      breakdown.acquisti.ivaIndetraibile += rowAmount(row, 'iva_indetraibile')
    }
  }

  breakdown.vendite.imponibile = round2(breakdown.vendite.imponibile)
  breakdown.vendite.ivaLorda = round2(breakdown.vendite.ivaLorda)
  breakdown.vendite.ivaSplitPayment = round2(breakdown.vendite.ivaSplitPayment)
  breakdown.vendite.ivaDebitoEffettivo = round2(
    breakdown.vendite.ivaLorda - breakdown.vendite.ivaSplitPayment
  )
  breakdown.acquisti.imponibile = round2(breakdown.acquisti.imponibile)
  breakdown.acquisti.ivaRegistrata = round2(breakdown.acquisti.ivaRegistrata)
  breakdown.acquisti.ivaDetraibile = round2(breakdown.acquisti.ivaDetraibile)
  breakdown.acquisti.ivaIndetraibile = round2(breakdown.acquisti.ivaIndetraibile)

  return breakdown
}

function buildWarnings({ societaId, periodoInizio, periodoFine, periodicita, aggregate }) {
  const warnings = []
  if (!societaId) warnings.push('societa_id non valorizzata: il prospetto non applica isolamento societario')
  if (!periodoInizio || !periodoFine) {
    warnings.push('Periodo incompleto: il prospetto non applica entrambi i limiti temporali')
  } else if (periodoInizio > periodoFine) {
    warnings.push('Periodo non valido: la data iniziale e successiva alla data finale')
  }
  if (!PERIODICITA_AMMESSE.has(periodicita)) {
    warnings.push('Periodicita non valida: usare mensile o trimestrale')
  }
  if (aggregate.righeIncluseCount === 0) {
    warnings.push('Nessuna riga IVA inclusa nel prospetto provvisorio')
  }

  const excludedByReason = new Map()
  for (const entry of aggregate.righeEscluse) {
    const reason = normalizeText(entry?.motivo) || 'non_specificato'
    excludedByReason.set(reason, (excludedByReason.get(reason) || 0) + 1)
  }
  for (const [reason, count] of excludedByReason) {
    warnings.push(`Righe escluse per ${reason}: ${count}`)
  }

  return warnings
}

export function buildLiquidazioneIvaProvvisoria(rows = [], options = {}) {
  const societaId = normalizeText(options?.societaId)
  const periodoInizio = normalizeDate(options?.periodoInizio)
  const periodoFine = normalizeDate(options?.periodoFine)
  const periodicita = normalizePeriodicita(options?.periodicita)
  const aggregate = aggregateVatRegisterEntries(rows, {
    societaId,
    periodoInizio,
    periodoFine,
  })
  const saldoPeriodo = round2(aggregate.saldoIva)

  return {
    stato: 'provvisorio',
    societaId,
    periodoInizio,
    periodoFine,
    periodicita,
    ivaVenditeLordo: round2(aggregate.ivaDebitoLordo),
    ivaSplitPayment: round2(aggregate.ivaSplitPayment),
    ivaDebitoEffettivo: round2(aggregate.ivaDebitoEffettiva),
    ivaAcquistiCredito: round2(aggregate.ivaCredito),
    saldoPeriodo,
    saldoADebito: saldoPeriodo > 0 ? saldoPeriodo : 0,
    saldoACredito: saldoPeriodo < 0 ? round2(Math.abs(saldoPeriodo)) : 0,
    righeIncluse: aggregate.righeIncluse,
    righeEscluse: aggregate.righeEscluse,
    righeIncluseCount: aggregate.righeIncluseCount,
    righeEscluseCount: aggregate.righeEscluseCount,
    warnings: buildWarnings({
      societaId,
      periodoInizio,
      periodoFine,
      periodicita,
      aggregate,
    }),
    breakdownRegistri: buildBreakdown(aggregate.righeIncluse),
  }
}

