import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function toAmount(value) {
  const text = normalizeText(value).replace(',', '.')
  if (!text) return 0
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

function clampPercent(value, fallback = 100) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Math.max(0, Math.min(100, fallback))
  return Math.max(0, Math.min(100, parsed))
}

function pickNumberValue(...values) {
  for (const rawValue of values) {
    if (rawValue === '' || rawValue == null) continue
    const text = normalizeText(rawValue).replace(',', '.')
    if (!text) continue
    const parsed = Number.parseFloat(text)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function hasMeaningfulValue(value) {
  const text = normalizeText(value)
  return Boolean(text) && text !== '0' && text !== '0,00'
}

function sumPreviousTotals(previousRows = []) {
  return (Array.isArray(previousRows) ? previousRows : []).reduce((sum, row) => {
    const total = toAmount(row?.totale ?? row?.totaleDocumento ?? row?.grossTotal ?? 0)
    return round2(sum + total)
  }, 0)
}

export function calculateRegistrazioneIvaRow({
  row = {},
  causaleIvaBehavior = {},
  changedField = '',
  documentTotal = 0,
  previousRows = [],
  manualOverrides = {},
} = {}) {
  const source = row && typeof row === 'object' ? row : {}
  const field = normalizeText(changedField)
  const autoResidualApplied = Boolean(source.autoResidualApplied || source.auto_residual_applied)
  const previousTotal = sumPreviousTotals(previousRows)
  const documentTotalAmount = toAmount(documentTotal)
  const residualAmount = round2(Math.max(0, documentTotalAmount - previousTotal))

  const totalOverride = Boolean(source.manualTotalOverride || field === 'totale' || manualOverrides.manualTotalOverride)
  const imponibileOverride = Boolean(source.manualImponibileOverride || field === 'imponibile' || manualOverrides.manualImponibileOverride)
  const ivaDetrattaOverride = Boolean(
    (source.manualIvaDetrattaOverride || manualOverrides.manualIvaDetrattaOverride) && field === 'ivaDetratta'
  )
  const ivaIndetraibileOverride = Boolean(
    (source.manualIvaIndetraibileOverride || manualOverrides.manualIvaIndetraibileOverride) && field === 'ivaIndetraibile'
  )
  const totalCleared = Boolean((source.manualTotalCleared || manualOverrides.manualTotalCleared) && field === 'totale' && !hasMeaningfulValue(source.totale))

  const totalInput = toAmount(source.totale ?? source.totaleDocumento ?? source.totale_documento)
  const imponibileInput = toAmount(source.imponibile ?? source.totaleImponibile ?? source.totale_imponibile)
  const ivaDetrattaInput = toAmount(source.ivaDetratta ?? source.ivaDetraibile ?? source.iva_detraibile)
  const ivaIndetraibileInput = toAmount(source.ivaIndetraibile ?? source.iva_indetraibile)
  const sourceAliquota = pickNumberValue(source.aliquota, source.aliquotaIva, source.aliquota_iva)
  const behaviorAliquota = pickNumberValue(causaleIvaBehavior.aliquota, causaleIvaBehavior.aliquotaIva, causaleIvaBehavior.aliquota_iva)
  const sourcePercentualeDetraibilita = pickNumberValue(source.percentualeDetraibilita, source.percentuale_detraibilita)
  const sourcePercentualeIndetraibilita = pickNumberValue(source.percentualeIndetraibilita, source.percentuale_indetraibilita)
  const behaviorPercentualeDetraibilita = pickNumberValue(
    causaleIvaBehavior.percentualeDetraibilita,
    causaleIvaBehavior.percentuale_detraibilita
  )
  const behaviorPercentualeIndetraibilita = pickNumberValue(
    causaleIvaBehavior.percentualeIndetraibilita,
    causaleIvaBehavior.percentuale_indetraibilita
  )
  const aliasPercent =
    sourcePercentualeIndetraibilita != null
      ? Math.max(0, 100 - sourcePercentualeIndetraibilita)
      : behaviorPercentualeIndetraibilita != null
        ? Math.max(0, 100 - behaviorPercentualeIndetraibilita)
        : sourcePercentualeDetraibilita ?? behaviorPercentualeDetraibilita ?? (causaleIvaBehavior.detraibile === false ? 0 : 100)
  const percentualeDetraibilita = clampPercent(aliasPercent, causaleIvaBehavior.detraibile === false ? 0 : 100)
  const aliquota = clampPercent(sourceAliquota ?? behaviorAliquota ?? 0, 0)
  const natura = normalizeText(source.natura || source.naturaIva || causaleIvaBehavior.natura)
  const noIva = !aliquota || natura.includes('fuori campo') || natura.includes('fuoricampo') || natura === 'n0'
  const hasExplicitAmountInput = totalInput > 0 || imponibileInput > 0 || ivaDetrattaInput > 0 || ivaIndetraibileInput > 0
  const shouldUseResidual = !totalOverride && !imponibileOverride && !ivaDetrattaOverride && !ivaIndetraibileOverride && !hasExplicitAmountInput
  const preferImponibile = field === 'imponibile' || (imponibileOverride && !totalOverride)
  const treatImponibileAsGross = preferImponibile && !totalOverride && documentTotalAmount > 0 && Math.abs(imponibileInput - documentTotalAmount) < 0.01
  const grossCandidate = totalOverride || field === 'totale' || (totalInput > 0 && !autoResidualApplied) || shouldUseResidual
    ? (totalInput > 0 && !autoResidualApplied ? totalInput : residualAmount)
    : residualAmount
  const preferGross = field === 'totale' || totalOverride || !preferImponibile

  let sourceTotal = preferGross ? grossCandidate : shouldUseResidual ? residualAmount : 0
  let imponibile = 0
  let ivaTotale = 0
  let ivaDetratta = 0
  let ivaIndetraibile = 0
  let warnings = []

  if (totalCleared) {
    return {
      imponibile: 0,
      ivaTotale: 0,
      ivaDetratta: 0,
      ivaDetraibile: 0,
      ivaIndetraibile: 0,
      totale: 0,
      aliquota: round2(aliquota),
      percentualeDetraibilita,
      warnings: Array.from(new Set([
        ...(normalizeText(natura) ? [] : ['causale IVA senza aliquota: nessuna scorporo IVA applicato']),
      ])),
      documentResidual: round2(Math.max(0, documentTotalAmount - round2(previousTotal))),
      source: 'cleared',
    }
  }

  if (noIva) {
    sourceTotal = preferImponibile ? imponibileInput : sourceTotal || grossCandidate
    if (!sourceTotal && residualAmount > 0) sourceTotal = residualAmount
    imponibile = preferImponibile && imponibileInput > 0 ? imponibileInput : sourceTotal
    ivaTotale = 0
    ivaDetratta = 0
    ivaIndetraibile = 0
    warnings = Array.from(new Set([
      ...(normalizeText(natura) ? [] : ['causale IVA senza aliquota: nessuna scorporo IVA applicato']),
    ]))
  } else if (preferImponibile && imponibileInput > 0 && !treatImponibileAsGross) {
    imponibile = imponibileInput
    ivaTotale = round2((imponibile * aliquota) / 100)
    sourceTotal = round2(imponibile + ivaTotale)
  } else {
    sourceTotal = sourceTotal || grossCandidate
    if (!sourceTotal && residualAmount > 0) sourceTotal = residualAmount
    if (sourceTotal < 0) sourceTotal = 0
    imponibile = round2(sourceTotal / (1 + aliquota / 100))
    ivaTotale = round2(sourceTotal - imponibile)
  }

  if (ivaDetrattaOverride && ivaIndetraibileOverride) {
    ivaDetratta = ivaDetrattaInput
    ivaIndetraibile = ivaIndetraibileInput
    ivaTotale = round2(ivaDetratta + ivaIndetraibile)
  } else if (ivaDetrattaOverride) {
    ivaDetratta = ivaDetrattaInput
    ivaIndetraibile = round2(Math.max(0, ivaTotale - ivaDetratta))
  } else if (ivaIndetraibileOverride) {
    ivaIndetraibile = ivaIndetraibileInput
    ivaDetratta = round2(Math.max(0, ivaTotale - ivaIndetraibile))
  } else {
    ivaDetratta = round2((ivaTotale * percentualeDetraibilita) / 100)
    ivaIndetraibile = round2(Math.max(0, ivaTotale - ivaDetratta))
  }

  if (Math.abs((ivaDetratta + ivaIndetraibile) - ivaTotale) > 0.01) {
    warnings.push('quota IVA detratta/indetraibile incoerente con l imposta totale')
  }

  if (sourceTotal < 0 || imponibile < 0 || ivaTotale < 0 || ivaDetratta < 0 || ivaIndetraibile < 0) {
    warnings.push('importi IVA negativi non ammessi')
  }

  return {
    imponibile: round2(imponibile),
    ivaTotale: round2(ivaTotale),
    ivaDetratta: round2(ivaDetratta),
    ivaDetraibile: round2(ivaDetratta),
    ivaIndetraibile: round2(ivaIndetraibile),
    totale: round2(sourceTotal || 0),
    aliquota: round2(aliquota),
    percentualeDetraibilita,
    warnings: Array.from(new Set(warnings.filter(Boolean))),
    documentResidual: round2(Math.max(0, documentTotalAmount - round2(previousTotal + (sourceTotal || 0)))),
    source: preferImponibile ? 'imponibile' : preferGross ? (totalOverride ? 'total' : 'residual') : 'residual',
  }
}
