function toMoneyNumber(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function hasAmount(row) {
  return toMoneyNumber(row?.dare) > 0 || toMoneyNumber(row?.avere) > 0
}

function rowHasBothSides(row) {
  return toMoneyNumber(row?.dare) > 0 && toMoneyNumber(row?.avere) > 0
}

function collectRowsWithAmount(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => hasAmount(row))
}

function deriveDescriptionCandidate({ header = {}, rows = [], sourceDoc = null, sourceDatiEstratti = {} } = {}) {
  const candidates = [
    header?.descrizione,
    sourceDoc?.descrizione_registrazione,
    sourceDoc?.descrizione,
    sourceDoc?.numero_documento,
    sourceDoc?.filename,
    sourceDatiEstratti?.descrizione_registrazione,
    sourceDatiEstratti?.numero_documento,
    sourceDatiEstratti?.filename,
    sourceDatiEstratti?.cedente_denom,
    sourceDoc?.soggetto_denominazione,
    rows.find((row) => normalizeText(row?.descrizione))?.descrizione,
  ]

  for (const candidate of candidates) {
    const text = normalizeText(candidate)
    if (text) return text
  }

  return ''
}

function detectComplexVatSignals({ sourceDoc = null, sourceDatiEstratti = {}, ivaUi = {}, ivaRows = [] } = {}) {
  const textBlob = JSON.stringify({
    sourceDoc,
    sourceDatiEstratti,
    ivaUi,
    ivaRows,
  }).toLowerCase()

  const signals = []
  if (textBlob.includes('reversecharge') || textBlob.includes('reverse_charge') || textBlob.includes('reverse charge')) {
    signals.push('reverse_charge')
  }
  if (textBlob.includes('splitpayment') || textBlob.includes('split_payment') || textBlob.includes('split payment')) {
    signals.push('split_payment')
  }
  if (textBlob.includes('ivapercassa') || textBlob.includes('iva_per_cassa') || textBlob.includes('iva per cassa')) {
    signals.push('iva_per_cassa')
  }
  if (textBlob.includes('ritenut') || textBlob.includes('withholding')) {
    signals.push('ritenute')
  }
  if (textBlob.includes('autofattura')) {
    signals.push('autofattura')
  }
  if (textBlob.includes('integrazioneestero') || textBlob.includes('integrazione_estero') || textBlob.includes('integrazione estero')) {
    signals.push('integrazione_estero')
  }
  return [...new Set(signals)]
}

function isIvaIncomplete(ivaRows = [], ivaUi = {}) {
  const rows = Array.isArray(ivaRows) ? ivaRows : []
  const hasAnyIvaUiValue = [
    ivaUi?.causale_iva_id,
    ivaUi?.aliquota,
    ivaUi?.imponibile,
    ivaUi?.iva,
  ].some((value) => {
    if (value == null) return false
    if (typeof value === 'number') return Number.isFinite(value)
    return normalizeText(value) !== ''
  })

  if (!rows.length) {
    if (!hasAnyIvaUiValue) return false
    const required = {
      causale_iva_id: normalizeText(ivaUi?.causale_iva_id),
      aliquota: Number(ivaUi?.aliquota),
      imponibile: Number(ivaUi?.imponibile),
      iva: Number(ivaUi?.iva),
    }
    return !required.causale_iva_id || !Number.isFinite(required.aliquota) || !Number.isFinite(required.imponibile) || !Number.isFinite(required.iva)
  }

  return rows.some((row) => {
    const hasCausale = normalizeText(row?.causale_iva_id)
    const hasAliquota = Number.isFinite(Number(row?.aliquota))
    const hasImponibile = Number.isFinite(Number(row?.imponibile))
    const hasIva = Number.isFinite(Number(row?.iva))
    return !hasCausale || !hasAliquota || !hasImponibile || !hasIva
  })
}

export function validateManualRegistrationUiState({
  header = {},
  rows = [],
  ivaRows = [],
  ivaUi = {},
  totals = {},
  sourceDoc = null,
  sourceDatiEstratti = {},
} = {}) {
  const blocking = []
  const warnings = []

  const dataRegistrazione = normalizeText(header?.data_registrazione)
  if (!dataRegistrazione) {
    blocking.push('data registrazione obbligatoria')
  }

  const causaleId = normalizeText(header?.causale_id)
  if (!causaleId) {
    blocking.push('causale contabile obbligatoria')
  }

  const rowsWithAmount = collectRowsWithAmount(rows)
  if (rowsWithAmount.length < 2) {
    blocking.push('servono almeno 2 righe con importo')
  }

  rowsWithAmount.forEach((row, index) => {
    if (!normalizeText(row?.conto_id)) {
      blocking.push(`riga ${index + 1}: conto obbligatorio`)
    }
    if (rowHasBothSides(row)) {
      blocking.push(`riga ${index + 1}: Dare e Avere non possono essere entrambi valorizzati`)
    }
  })

  if (!totals?.bilanciata) {
    blocking.push('quadratura obbligatoria')
  }

  const descriptionCandidate = deriveDescriptionCandidate({ header, rows, sourceDoc, sourceDatiEstratti })
  if (!descriptionCandidate) {
    blocking.push('descrizione registrazione obbligatoria o derivata in modo esplicito')
  }

  if (isIvaIncomplete(ivaRows, ivaUi)) {
    blocking.push('IVA presente ma incompleta')
  }

  const complexVatSignals = detectComplexVatSignals({ sourceDoc, sourceDatiEstratti, ivaUi, ivaRows })
  if (complexVatSignals.includes('reverse_charge')) {
    blocking.push('reverse charge rilevato: scenario bloccato')
  }
  if (complexVatSignals.includes('split_payment')) {
    blocking.push('split payment rilevato: scenario bloccato')
  }
  if (complexVatSignals.includes('iva_per_cassa')) {
    blocking.push('IVA per cassa rilevata: scenario bloccato')
  }
  if (complexVatSignals.includes('ritenute')) {
    blocking.push('ritenute rilevate: scenario bloccato')
  }

  if (complexVatSignals.length > 0) {
    warnings.push(`segnali IVA complessi rilevati: ${complexVatSignals.join(', ')}`)
  }

  const normalizedBlocking = [...new Set(blocking)]
  const normalizedWarnings = [...new Set(warnings)]

  return {
    ok: normalizedBlocking.length === 0,
    blocking: normalizedBlocking,
    warnings: normalizedWarnings,
    rowsWithAmountCount: rowsWithAmount.length,
    descriptionCandidate,
    totals: {
      dare: Number(totals?.totDare ?? 0),
      avere: Number(totals?.totAvere ?? 0),
      diff: Number(totals?.diff ?? 0),
      bilanciata: Boolean(totals?.bilanciata),
    },
    iva: {
      rowsCount: Array.isArray(ivaRows) ? ivaRows.length : 0,
      incomplete: isIvaIncomplete(ivaRows, ivaUi),
      complexVatSignals,
    },
  }
}
