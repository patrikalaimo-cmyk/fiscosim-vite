import { normalizeText, round2 } from '../canonical_mapper/utils.js'
import { validateRegistrazioneIvaDraft } from './validateRegistrazioneIvaDraft.js'
import { resolveRegistrazioneCausaleIvaBehavior } from '../../domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js'
import { buildRegistrazioneIvaRows } from './buildRegistrazioneIvaRows.js'
import { normalizeRegistrazioneIvaRows } from './normalizeRegistrazioneIvaRows.js'

function resolveMeaningfulText(value, fallback = '') {
  const normalized = normalizeText(value)
  if (!normalized || normalized === 'da assegnare') {
    return normalizeText(fallback)
  }
  return normalized
}

function normalizeCausaleIvaCandidate(item = {}) {
  const source = item && typeof item === 'object' ? item : {}
  return {
    id: normalizeText(source.id || source.causaleIvaId || source.causale_iva_id || source.codice || source.code || source.sigla || source.codiceInterno || source.codice_interno),
    codice: normalizeText(source.codice || source.code || source.sigla || source.codiceInterno || source.codice_interno),
    descrizione: normalizeText(source.descrizione || source.description || source.denominazione || source.nome),
    aliquota: source.aliquota ?? source.percentuale_imposta ?? source.aliquota_iva ?? '',
    natura: normalizeText(source.natura || source.codice_natura || source.natura_iva),
    registroIva: normalizeText(source.registroIva || source.registro_iva || source.codice_registro_iva),
    segnoRegistro: normalizeText(source.segnoRegistro || source.segno_registro || source.segno_registro_iva || source.segno),
    percentualeDetraibilita: source.percentualeDetraibilita ?? source.percentuale_detraibilita ?? '',
    percentualeIndetraibilita: source.percentualeIndetraibilita ?? source.percentuale_indetraibilita ?? '',
    detraibile: source.detraibile,
    contoIva: normalizeText(source.contoIva || source.conto_iva || source.conto_iva_id),
  }
}

function buildLabel(item = {}) {
  const code = normalizeText(item?.codice || item?.code || item?.sigla || '')
  const descr = normalizeText(item?.descrizione || item?.description || item?.denominazione || item?.nome || '')
  return [code, descr].filter(Boolean).join(' - ') || ''
}

function resolveCatalogCandidate(query = '', items = []) {
  const normalizedQuery = normalizeText(query).toLowerCase().trim()
  if (!normalizedQuery) return null
  const catalog = Array.isArray(items) ? items : []
  const exactMatches = catalog
    .map(normalizeCausaleIvaCandidate)
    .filter((item) => {
      const label = buildLabel(item).toLowerCase().trim()
      const code = normalizeText(item.codice).toLowerCase().trim()
      const descr = normalizeText(item.descrizione).toLowerCase().trim()
      const aliquota = String(item.aliquota ?? '').trim().toLowerCase()
      const natura = String(item.natura ?? '').trim().toLowerCase()
      return (
        normalizedQuery === normalizeText(item.id).toLowerCase().trim() ||
        normalizedQuery === code ||
        normalizedQuery === descr ||
        normalizedQuery === label ||
        normalizedQuery === aliquota ||
        normalizedQuery === natura
      )
    })
  if (exactMatches.length === 1) return exactMatches[0]
  if (exactMatches.length > 1) return exactMatches[0]

  const partialMatches = catalog
    .map(normalizeCausaleIvaCandidate)
    .filter((item) => {
      const label = buildLabel(item).toLowerCase().trim()
      const code = normalizeText(item.codice).toLowerCase().trim()
      const descr = normalizeText(item.descrizione).toLowerCase().trim()
      const aliquota = String(item.aliquota ?? '').trim().toLowerCase()
      const natura = String(item.natura ?? '').trim().toLowerCase()
      return (
        normalizeText(item.id).toLowerCase().includes(normalizedQuery) ||
        code.includes(normalizedQuery) ||
        descr.includes(normalizedQuery) ||
        label.includes(normalizedQuery) ||
        aliquota.includes(normalizedQuery) ||
        natura.includes(normalizedQuery) ||
        normalizedQuery.includes(code) ||
        normalizedQuery.includes(descr) ||
        normalizedQuery.includes(label)
      )
    })

  if (partialMatches.length === 1) return partialMatches[0]
  return partialMatches[0] || null
}

function resolveCausaleIvaCandidate(input = {}, options = {}) {
  const ivaData = input?.ivaData && typeof input.ivaData === 'object' ? input.ivaData : {}
  const causaliIva = Array.isArray(options?.causaliIva) ? options.causaliIva : Array.isArray(input?.causaliIva) ? input.causaliIva : []
  const byId = String(ivaData.causaleIvaId || ivaData.causale_iva_id || '').trim()
  const byCode = String(ivaData.causaleIvaCodice || ivaData.causale_iva_codice || ivaData.causaleIva || '').trim()
  const byLabel = String(ivaData.causaleIvaDescrizione || ivaData.causale_iva_descrizione || '').trim()

  const candidate = resolveCatalogCandidate(byId || byCode || byLabel, causaliIva)
  if (candidate) return normalizeCausaleIvaCandidate(candidate)

  if (byId || byCode || byLabel) {
    return {
      id: byId || byCode || byLabel,
      codice: byCode || byId,
      descrizione: byLabel,
      aliquota: ivaData.aliquotaIva || ivaData.aliquota_iva || '',
      natura: ivaData.naturaIva || ivaData.natura_iva || '',
      registroIva: ivaData.registroIva || ivaData.registro_iva || '',
      segnoRegistro: ivaData.segnoRegistro || ivaData.segno_registro || '',
      percentualeDetraibilita: ivaData.percentualeDetraibilita || ivaData.percentuale_detraibilita || '',
      percentualeIndetraibilita: ivaData.percentualeIndetraibilita || ivaData.percentuale_indetraibilita || '',
      detraibile: ivaData.detraibile,
      contoIva: ivaData.contoIva || ivaData.conto_iva || '',
    }
  }

  return null
}

function resolveBaseCandidate(input = {}, options = {}, normalizedRows = []) {
  const fromTopLevel = resolveCausaleIvaCandidate(input, options)
  if (fromTopLevel) return fromTopLevel
  const firstRow = normalizedRows[0] || {}
  const rowCandidate = resolveCatalogCandidate(firstRow.causaleIvaId || firstRow.causaleIvaCodice || firstRow.causaleIvaLabel || firstRow.causaleIvaQuery || '', options?.causaliIva || input?.causaliIva || [])
  return rowCandidate ? normalizeCausaleIvaCandidate(rowCandidate) : null
}

export function buildRegistrazioneIvaDraft(input = {}, options = {}) {
  const header = input?.header && typeof input.header === 'object' ? input.header : {}
  const ivaData = input?.ivaData && typeof input.ivaData === 'object' ? input.ivaData : {}
  const documentData = input?.documentData && typeof input.documentData === 'object' ? input.documentData : {}
  const behavior = options?.behavior && typeof options.behavior === 'object' ? options.behavior : {}
  const active = Boolean(behavior.showIvaPanel)
  const normalizedRows = normalizeRegistrazioneIvaRows(ivaData.rows || ivaData.ivaRows || ivaData.iva_rows || [], ivaData)
  const causaleIva = resolveBaseCandidate(input, options, normalizedRows)
  const resolver = resolveRegistrazioneCausaleIvaBehavior({
    causaleIva,
    causaleContabile: options?.causaleContabile || behavior || input?.causaleContabile || null,
    causaleBehavior: behavior,
    documentData,
  })
  const effectiveResolver = {
    ...resolver,
    aliquota: Number.isFinite(Number(resolver?.aliquota)) && Number(resolver.aliquota) > 0 ? Number(resolver.aliquota) : Number(causaleIva?.aliquota || causaleIva?.percentuale_imposta || 0),
    registroIva: resolver?.registroIva || causaleIva?.registroIva || causaleIva?.registro_iva || 'da assegnare',
    segnoRegistro: resolver?.segnoRegistro || causaleIva?.segnoRegistro || causaleIva?.segno_registro || '+',
    percentualeDetraibilita: Number.isFinite(Number(resolver?.percentualeDetraibilita))
      ? Number(resolver.percentualeDetraibilita)
      : Number.isFinite(Number(resolver?.percentualeIndetraibilita))
        ? Math.max(0, 100 - Number(resolver.percentualeIndetraibilita))
        : Number.isFinite(Number(causaleIva?.percentualeIndetraibilita))
          ? Math.max(0, 100 - Number(causaleIva.percentualeIndetraibilita))
          : Number.isFinite(Number(causaleIva?.percentualeDetraibilita))
            ? Number(causaleIva.percentualeDetraibilita)
            : 100,
    natura: resolver?.natura || causaleIva?.natura || '',
    detraibile: resolver?.detraibile ?? true,
    source: resolver?.source || (causaleIva ? 'causale_iva' : 'fallback'),
  }
  const rowsResult = buildRegistrazioneIvaRows({
    rows: normalizedRows,
    documentData,
    header,
    causaliIva: Array.isArray(options?.causaliIva) ? options.causaliIva : Array.isArray(input?.causaliIva) ? input.causaliIva : [],
    causaleContabile: options?.causaleContabile || behavior || input?.causaleContabile || null,
    causaleBehavior: effectiveResolver,
    baseCausale: causaleIva,
  })

  const rows = Array.isArray(rowsResult.rows) ? rowsResult.rows : []
  const firstRow = rows[0] || {}
  const summary = rowsResult.summary || {
    imponibile: 0,
    ivaTotale: 0,
    ivaDetratta: 0,
    ivaIndetraibile: 0,
    totaleDocumento: 0,
    residualDocumento: 0,
  }
  const selectedCausaleIvaId = normalizeText(firstRow.causaleIvaId || ivaData.causaleIvaId || ivaData.causale_iva_id || causaleIva?.id || '')
  const selectedCausaleIvaCodice = normalizeText(firstRow.causaleIvaCodice || ivaData.causaleIvaCodice || ivaData.causale_iva_codice || causaleIva?.codice || '')
  const selectedCausaleIvaDescrizione = normalizeText(firstRow.causaleIvaDescrizione || ivaData.causaleIvaDescrizione || ivaData.causale_iva_descrizione || causaleIva?.descrizione || '')
  const causaleIvaLabel = firstRow.causaleIvaLabel || buildLabel(causaleIva || {}) || resolver.codice || resolver.descrizione || 'da selezionare'
  const protocolloProvvisorio = normalizeText(firstRow.protocolloProvvisorio || ivaData.protocolloProvvisorio || ivaData.protocollo_provvisorio || 'da assegnare') || 'da assegnare'
  const protocolloDefinitivo = normalizeText(firstRow.protocolloDefinitivo || ivaData.protocolloDefinitivo || ivaData.protocollo_definitivo || 'da assegnare') || 'da assegnare'
  const dataCompetenza = normalizeText(firstRow.competenzaIva || ivaData.dataCompetenza || ivaData.data_competenza || header.dataRegistrazione)
  const dataOperazione = normalizeText(firstRow.dataOperazione || ivaData.dataOperazione || ivaData.data_operazione || header.dataRegistrazione)
  const registroIva = resolveMeaningfulText(firstRow.registroIva, effectiveResolver.registroIva || ivaData.registroIva || ivaData.registro_iva)
  const segnoRegistro = normalizeText(firstRow.segnoRegistro || effectiveResolver.segnoRegistro || ivaData.segnoRegistro || ivaData.segno_registro || '+')
  const natura = normalizeText(firstRow.natura || ivaData.naturaIva || ivaData.natura_iva || effectiveResolver.natura)
  const aliquota = Number.isFinite(Number(firstRow.aliquota)) && Number(firstRow.aliquota) > 0 ? Number(firstRow.aliquota) : effectiveResolver.aliquota

  const draft = {
    active,
    causaleIvaId: selectedCausaleIvaId,
    causaleIvaCodice: selectedCausaleIvaCodice,
    causaleIvaDescrizione: selectedCausaleIvaDescrizione,
    causaleIvaLabel,
    registroIva,
    segnoRegistro,
    protocolloProvvisorio,
    protocolloDefinitivo,
    protocolloCee: normalizeText(ivaData.protocolloCee || firstRow.protocolloCee),
    dataCompetenza,
    dataOperazione,
    imponibile: round2(summary.imponibile || 0),
    totaleImponibile: round2(summary.imponibile || 0),
    aliquotaIva: aliquota,
    aliquota,
    naturaIva: natura,
    natura,
    totaleIva: round2(summary.ivaTotale || 0),
    totaleImposta: round2(summary.ivaTotale || 0),
    imposta: round2(summary.ivaTotale || 0),
    ivaDetratta: round2(summary.ivaDetratta || 0),
    ivaDetraibile: round2(summary.ivaDetratta || 0),
    ivaIndetraibile: round2(summary.ivaIndetraibile || 0),
    totaleDocumento: round2(summary.totaleDocumento || documentData.totaleDocumento || header.totaleDocumento || 0),
    totaleRigheDocumento: round2(summary.totaleRighe || 0),
    residuoDocumento: round2(summary.residualDocumento || 0),
    causaleIva: causaleIvaLabel,
    percentualeDetraibilita: Number.isFinite(Number(firstRow.percentualeDetraibilita))
      ? Number(firstRow.percentualeDetraibilita)
      : Number.isFinite(Number(causaleIva?.percentualeDetraibilita))
        ? Number(causaleIva.percentualeDetraibilita)
        : effectiveResolver.percentualeDetraibilita,
    percentualeIndetraibilita: Number.isFinite(Number(firstRow.percentualeIndetraibilita))
      ? Number(firstRow.percentualeIndetraibilita)
      : Math.max(0, 100 - (Number.isFinite(Number(causaleIva?.percentualeDetraibilita)) ? Number(causaleIva.percentualeDetraibilita) : effectiveResolver.percentualeDetraibilita)),
    stato: normalizeText(ivaData.stato) || (active ? 'predisposto' : 'idle'),
    rows,
    warningSource: rowsResult.source || effectiveResolver.source,
    warnings: Array.from(new Set([...(rowsResult.warnings || []), ...(effectiveResolver.warnings || [])])),
    reasons: Array.from(new Set([...(rowsResult.reasons || []), ...(effectiveResolver.reasons || [])])),
  }

  const validation = validateRegistrazioneIvaDraft({ header, ivaData: draft, behavior, documentData }, options)

  return {
    ...draft,
    validation,
    status: validation.status,
    warnings: Array.from(new Set([...(draft.warnings || []), ...(validation.warnings || [])])),
    blockers: validation.blockers,
    info: Array.from(new Set([...(validation.info || []), ...(effectiveResolver.source === 'fallback' ? ['Causale IVA non selezionata: comportamento predisposto in modo neutro.'] : [])])),
  }
}
