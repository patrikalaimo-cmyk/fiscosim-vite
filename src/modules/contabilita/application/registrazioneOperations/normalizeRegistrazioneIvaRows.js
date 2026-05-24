import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function normalizeNumber(value) {
  const text = normalizeText(value).replace(',', '.')
  if (!text) return ''
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? round2(parsed) : ''
}

function normalizeDate(value) {
  const text = normalizeText(value)
  return text ? text.slice(0, 10) : ''
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 'SI' || value === 'S' || value === 'X') return true
  if (value === false || value === 'false' || value === 0 || value === '0' || value === 'NO' || value === 'N') return false
  return fallback
}

function normalizeRow(row = {}, index = 0, fallback = {}) {
  const source = row && typeof row === 'object' ? row : {}
  const fallbackSource = fallback && typeof fallback === 'object' ? fallback : {}

  return {
    id: normalizeText(source.id) || `iva-row-${index + 1}`,
    riga: Number.isFinite(Number(source.riga ?? source.riga_numero)) ? Number(source.riga ?? source.riga_numero) : index + 1,
    causaleIvaId: normalizeText(source.causaleIvaId || source.causale_iva_id || fallbackSource.causaleIvaId || fallbackSource.causale_iva_id),
    causaleIvaCodice: normalizeText(source.causaleIvaCodice || source.causale_iva_codice || fallbackSource.causaleIvaCodice || fallbackSource.causale_iva_codice),
    causaleIvaDescrizione: normalizeText(source.causaleIvaDescrizione || source.causale_iva_descrizione || fallbackSource.causaleIvaDescrizione || fallbackSource.causale_iva_descrizione),
    causaleIvaLabel: normalizeText(source.causaleIvaLabel || source.causaleIva || source.causale_iva || fallbackSource.causaleIvaLabel || fallbackSource.causaleIva || fallbackSource.causale_iva),
    causaleIvaQuery: normalizeText(source.causaleIvaQuery || source.causale_iva_query),
    imponibile: normalizeNumber(source.imponibile ?? source.totaleImponibile ?? source.totale_imponibile ?? fallbackSource.imponibile ?? fallbackSource.totaleImponibile ?? fallbackSource.totale_imponibile),
    ivaDetratta: normalizeNumber(source.ivaDetratta ?? source.iva_detraibile ?? fallbackSource.ivaDetratta ?? fallbackSource.iva_detraibile),
    ivaIndetraibile: normalizeNumber(source.ivaIndetraibile ?? source.iva_indetraibile ?? fallbackSource.ivaIndetraibile ?? fallbackSource.iva_indetraibile),
    totale: normalizeNumber(source.totale ?? source.totaleDocumento ?? source.totale_documento ?? fallbackSource.totale ?? fallbackSource.totaleDocumento ?? fallbackSource.totale_documento),
    aliquota: normalizeNumber(source.aliquota ?? source.aliquotaIva ?? source.aliquota_iva ?? fallbackSource.aliquota ?? fallbackSource.aliquotaIva ?? fallbackSource.aliquota_iva),
    natura: normalizeText(source.natura ?? source.naturaIva ?? source.natura_iva ?? fallbackSource.natura ?? fallbackSource.naturaIva ?? fallbackSource.natura_iva),
    percentualeDetraibilita: normalizeNumber(source.percentualeDetraibilita ?? source.percentuale_detraibilita ?? fallbackSource.percentualeDetraibilita ?? fallbackSource.percentuale_detraibilita),
    percentualeIndetraibilita: normalizeNumber(source.percentualeIndetraibilita ?? source.percentuale_indetraibilita ?? fallbackSource.percentualeIndetraibilita ?? fallbackSource.percentuale_indetraibilita),
    competenzaIva: normalizeDate(source.competenzaIva ?? source.dataCompetenza ?? source.data_competenza ?? fallbackSource.competenzaIva ?? fallbackSource.dataCompetenza ?? fallbackSource.data_competenza),
    dataOperazione: normalizeDate(source.dataOperazione ?? source.data_operazione ?? fallbackSource.dataOperazione ?? fallbackSource.data_operazione),
    registroIva: normalizeText(source.registroIva || source.registro_iva || fallbackSource.registroIva || fallbackSource.registro_iva),
    segnoRegistro: normalizeText(source.segnoRegistro || source.segno_registro || source.segnoRegistroIva || source.segno_registro_iva || fallbackSource.segnoRegistro || fallbackSource.segno_registro),
    protocolloProvvisorio: normalizeText(source.protocolloProvvisorio || source.protocollo_provvisorio || fallbackSource.protocolloProvvisorio || fallbackSource.protocollo_provvisorio),
    protocolloDefinitivo: normalizeText(source.protocolloDefinitivo || source.protocollo_definitivo || fallbackSource.protocolloDefinitivo || fallbackSource.protocollo_definitivo),
    manualTotalOverride: normalizeBoolean(source.manualTotalOverride || source.manual_total_override, false),
    manualTotalCleared: normalizeBoolean(source.manualTotalCleared || source.manual_total_cleared, false),
    manualImponibileOverride: normalizeBoolean(source.manualImponibileOverride || source.manual_imponibile_override, false),
    manualIvaDetrattaOverride: normalizeBoolean(source.manualIvaDetrattaOverride || source.manual_iva_detratta_override, false),
    manualIvaIndetraibileOverride: normalizeBoolean(source.manualIvaIndetraibileOverride || source.manual_iva_indetraibile_override, false),
    autoResidualApplied: normalizeBoolean(source.autoResidualApplied || source.auto_residual_applied, false),
    manualEdited: normalizeBoolean(source.manualEdited || source.manual_edited, false),
    lastEditedField: normalizeText(source.lastEditedField || source.last_edited_field),
    stato: normalizeText(source.stato) || 'predisposto',
    attiva: source.attiva !== false && source.attiva !== 'false' && source.attiva !== 0 && source.attiva !== '0',
    hierarchyType: normalizeText(source.hierarchyType || source.hierarchy_type),
    isTemplateScope: normalizeBoolean(source.isTemplateScope || source.is_template_scope, false),
    source: normalizeText(source.source),
    warnings: Array.isArray(source.warnings) ? source.warnings.filter(Boolean).map((item) => normalizeText(item)) : [],
    reasons: Array.isArray(source.reasons) ? source.reasons.filter(Boolean).map((item) => normalizeText(item)) : [],
  }
}

export function normalizeRegistrazioneIvaRows(rows = [], fallback = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  const fallbackSource = fallback && typeof fallback === 'object' ? fallback : {}
  if (!list.length) {
    const hasFallbackContent = Boolean(
      fallbackSource.causaleIvaId ||
        fallbackSource.causale_iva_id ||
        fallbackSource.causaleIvaCodice ||
        fallbackSource.causale_iva_codice ||
        fallbackSource.causaleIvaDescrizione ||
        fallbackSource.causale_iva_descrizione ||
        fallbackSource.imponibile ||
        fallbackSource.totaleImponibile ||
        fallbackSource.ivaDetratta ||
        fallbackSource.iva_indetraibile ||
        fallbackSource.totale ||
        fallbackSource.totaleDocumento ||
        fallbackSource.totale_documento
    )
    if (!hasFallbackContent) return []
    return [normalizeRow({}, 0, fallbackSource)]
  }

  return list.map((row, index) => normalizeRow(row, index, fallbackSource))
}
