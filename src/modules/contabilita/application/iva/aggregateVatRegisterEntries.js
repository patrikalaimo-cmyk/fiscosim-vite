function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function toNumber(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) return round2(value)
  const parsed = Number.parseFloat(String(value).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function isOutsidePeriod(row, periodoInizio, periodoFine) {
  const data = String(row?.data || '').slice(0, 10)
  if (!data) return false
  if (periodoInizio && data < periodoInizio) return true
  if (periodoFine && data > periodoFine) return true
  return false
}

export function aggregateVatRegisterEntries(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : []
  const societaId = String(options.societaId || '').trim()
  const periodoInizio = String(options.periodoInizio || '').slice(0, 10)
  const periodoFine = String(options.periodoFine || '').slice(0, 10)
  const righeIncluse = []
  const righeEscluse = []

  let ivaDebitoLordo = 0
  let ivaSplitPayment = 0
  let ivaCredito = 0

  for (const row of list) {
    if (societaId && String(row?.societa_id || '').trim() !== societaId) {
      righeEscluse.push({ row, motivo: 'societa' })
      continue
    }
    if (isOutsidePeriod(row, periodoInizio, periodoFine)) {
      righeEscluse.push({ row, motivo: 'periodo' })
      continue
    }

    const esigibilita = normalizeText(row?.esigibilita)
    if (esigibilita === 'differita') {
      righeEscluse.push({ row, motivo: 'esigibilita_differita' })
      continue
    }

    const tipo = normalizeText(row?.tipo)
    if (tipo === 'vendita') {
      const iva = toNumber(row?.iva)
      ivaDebitoLordo += iva
      if (row?.split_payment === true || row?.splitPayment === true) {
        ivaSplitPayment += iva
      }
      righeIncluse.push(row)
      continue
    }
    if (tipo === 'acquisto') {
      ivaCredito += toNumber(row?.iva_detraibile)
      righeIncluse.push(row)
      continue
    }

    righeEscluse.push({ row, motivo: 'tipo_non_iva' })
  }

  ivaDebitoLordo = round2(ivaDebitoLordo)
  ivaSplitPayment = round2(ivaSplitPayment)
  ivaCredito = round2(ivaCredito)
  const ivaDebitoEffettiva = round2(ivaDebitoLordo - ivaSplitPayment)
  const saldoIva = round2(ivaDebitoEffettiva - ivaCredito)

  return {
    ivaDebitoLordo,
    ivaSplitPayment,
    ivaDebitoEffettiva,
    ivaCredito,
    saldoIva,
    righeIncluse,
    righeEscluse,
    righeIncluseCount: righeIncluse.length,
    righeEscluseCount: righeEscluse.length,
    iva_debito_registrata: ivaDebitoLordo,
    iva_split_payment: ivaSplitPayment,
    iva_debito_effettiva: ivaDebitoEffettiva,
    iva_debito: ivaDebitoEffettiva,
    iva_credito: ivaCredito,
    iva_dovuta: saldoIva,
    saldo: saldoIva,
    righe_considerate: righeIncluse.length,
    righe_escluse: righeEscluse.length,
  }
}
