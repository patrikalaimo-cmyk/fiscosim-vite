import { normalizeText, round2 } from '../canonical_mapper/utils.js'
import { normalizeRegistrazioneIvaRows } from './normalizeRegistrazioneIvaRows.js'
import { buildRegistrazioneContoSelection, resolveRegistrazioneContoDescrizione, resolveRegistrazioneContoLabel } from './resolveRegistrazioneConti.js'

function normalizeDate(value) {
  const text = normalizeText(value)
  return text ? text.slice(0, 10) : ''
}

function resolveCatalogItem(input, items = []) {
  const query = normalizeText(input).toLowerCase()
  if (!query) return null

  const catalog = Array.isArray(items) ? items : []
  const exactMatches = catalog.filter((item) => {
    const id = normalizeText(item?.id).toLowerCase()
    const code = normalizeText(item?.codice ?? item?.code ?? item?.sigla).toLowerCase()
    const descr = normalizeText(item?.descrizione ?? item?.description ?? item?.denominazione ?? item?.nome).toLowerCase()
    return query === id || query === code || query === descr
  })

  if (exactMatches.length === 1) return exactMatches[0]
  if (exactMatches.length > 1) return exactMatches[0]

  const partialMatches = catalog.filter((item) => {
    const id = normalizeText(item?.id).toLowerCase()
    const code = normalizeText(item?.codice ?? item?.code ?? item?.sigla).toLowerCase()
    const descr = normalizeText(item?.descrizione ?? item?.description ?? item?.denominazione ?? item?.nome).toLowerCase()
    return (
      id.includes(query) ||
      code.includes(query) ||
      descr.includes(query) ||
      query.includes(id) ||
      query.includes(code) ||
      query.includes(descr)
    )
  })

  if (partialMatches.length === 1) return partialMatches[0]
  return partialMatches[0] || null
}

function resolveStrictContoItem(input, items = []) {
  const query = normalizeText(input).toLowerCase().trim()
  if (!query) return null
  const catalog = Array.isArray(items) ? items : []
  const labelCode = normalizeText(String(input || '').split(/\s+-\s+/)[0]).toLowerCase().trim()
  const exactMatches = catalog.filter((item) => {
    const id = normalizeText(item?.id).toLowerCase().trim()
    const code = normalizeText(item?.codice ?? item?.code ?? item?.sigla).toLowerCase().trim()
    const descr = normalizeText(item?.conto_descrizione ?? item?.descrizione_conto ?? item?.descrizioneConto ?? item?.contoDescription ?? item?.denominazione ?? item?.nome ?? item?.label ?? item?.title ?? item?.description ?? item?.descrizione).toLowerCase().trim()
    const label = normalizeText(resolveRegistrazioneContoLabel(item)).toLowerCase().trim()
    return query === id || query === code || query === descr || query === label || (labelCode && labelCode === code)
  })

  if (exactMatches.length === 1) return exactMatches[0]
  return exactMatches[0] || null
}

function normalizeRow(row = {}, index = 0, pianoConti = []) {
  const contoQuery = normalizeText(row.contoQuery ?? row.conto ?? row.conto_id ?? row.conto_codice ?? row.conto_descrizione)
  const contoMatch = normalizeText(row.conto_id) ? resolveCatalogItem(row.conto_id, pianoConti) : resolveStrictContoItem(contoQuery, pianoConti)
  const contoSelection = contoMatch ? buildRegistrazioneContoSelection(contoMatch, contoQuery) : null
  const resolvedContoId = normalizeText(contoSelection?.id || contoSelection?.value || contoMatch?.id || contoMatch?.value)

  return {
    id: normalizeText(row.id) || `row-${index + 1}`,
    riga_numero: Number.isFinite(Number(row.riga_numero)) ? Number(row.riga_numero) : index + 1,
    contoQuery,
    conto_id: resolvedContoId,
    conto_codice: normalizeText(row.conto_codice) || normalizeText(contoSelection?.codice ?? contoSelection?.code ?? contoSelection?.sigla ?? contoMatch?.codice ?? contoMatch?.code ?? contoMatch?.sigla),
    conto_descrizione:
      normalizeText(row.conto_descrizione) ||
      normalizeText(contoSelection?.conto_descrizione || (contoMatch ? resolveRegistrazioneContoDescrizione(contoSelection || contoMatch) : '')),
    descrizione: normalizeText(row.descrizione ?? row.descrizione_riga),
    dare: round2(row.dare ?? row.importo_dare ?? 0),
    avere: round2(row.avere ?? row.importo_avere ?? 0),
    autoResidualApplied: Boolean(row.autoResidualApplied),
    manualAmountOverride: Boolean(row.manualAmountOverride),
    lastAmountSide: normalizeText(row.lastAmountSide),
    manualEdited: Boolean(row.manualEdited),
    templateGenerated: Boolean(row.templateGenerated),
    templateKey: normalizeText(row.templateKey),
    templateScope: Boolean(row.templateScope),
  }
}

function normalizeCausaleContabile(value, causaliContabili = []) {
  if (value && typeof value === 'object') {
    return {
      id: normalizeText(value.id),
      codice: normalizeText(value.codice ?? value.code ?? value.sigla),
      descrizione: normalizeText(value.descrizione ?? value.description ?? value.denominazione ?? value.nome),
    }
  }

  const query = normalizeText(value)
  if (!query) return { id: '', codice: '', descrizione: '' }
  const item = resolveCatalogItem(query, causaliContabili)
  return {
    id: normalizeText(item?.id || query),
    codice: normalizeText(item?.codice ?? item?.code ?? item?.sigla ?? query),
    descrizione: normalizeText(item?.descrizione ?? item?.description ?? item?.denominazione ?? item?.nome),
  }
}

function normalizePanelText(value) {
  return normalizeText(value)
}

function normalizePanelNumber(value) {
  const text = normalizeText(value).replace(',', '.')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? round2(parsed) : ''
}

function normalizePanelBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 'SI' || value === 'S' || value === 'X') return true
  if (value === false || value === 'false' || value === 0 || value === '0' || value === 'NO' || value === 'N') return false
  return fallback
}

function normalizeDocumentData(source = {}) {
  return {
    divisa: normalizePanelText(source.divisa) || 'EUR',
    cambio: normalizePanelText(source.cambio) || '1,000000',
    condizioniPagamento: normalizePanelText(source.condizioniPagamento || source.condizioni_pagamento),
    modalitaPagamento: normalizePanelText(source.modalitaPagamento || source.modalita_pagamento),
    imponibile: normalizePanelNumber(source.imponibile || source.totaleImponibile || source.totale_imponibile),
    totaleImponibile: normalizePanelNumber(source.totaleImponibile || source.totale_imponibile),
    totaleImposte: normalizePanelNumber(source.totaleImposte || source.totale_imposte),
    totaleDocumento: normalizePanelNumber(source.totaleDocumento || source.totale_documento),
    tipoDocumento: normalizePanelText(source.tipoDocumento || source.tipo_documento),
    netto: normalizePanelNumber(source.netto),
  }
}

function normalizeIvaData(source = {}, header = {}) {
  return {
    causaleIvaId: normalizePanelText(source.causaleIvaId || source.causale_iva_id),
    causaleIvaCodice: normalizePanelText(source.causaleIvaCodice || source.causale_iva_codice),
    causaleIvaDescrizione: normalizePanelText(source.causaleIvaDescrizione || source.causale_iva_descrizione),
    registroIva: normalizePanelText(source.registroIva || source.registro_iva),
    segnoRegistro: normalizePanelText(source.segnoRegistro || source.segno_registro || source.segnoRegistroIva || source.segno_registro_iva),
    protocolloProvvisorio: normalizePanelText(source.protocolloProvvisorio || source.protocollo_provvisorio),
    protocolloDefinitivo: normalizePanelText(source.protocolloDefinitivo || source.protocollo_definitivo),
    protocolloCee: normalizePanelText(source.protocolloCee || source.protocollo_cee),
    dataCompetenza: normalizeDate(source.dataCompetenza || source.data_competenza || header.dataRegistrazione),
    dataOperazione: normalizeDate(source.dataOperazione || source.data_operazione || header.dataRegistrazione),
    totaleImponibile: normalizePanelNumber(source.totaleImponibile || source.imponibile || source.totale_imponibile),
    totaleImposta: normalizePanelNumber(source.totaleImposta || source.imposta || source.totale_imposta),
    totaleDocumento: normalizePanelNumber(source.totaleDocumento || source.totale_documento || header.totaleDocumento),
    imponibile: normalizePanelNumber(source.imponibile || source.totaleImponibile || source.totale_imponibile),
    ivaDetratta: normalizePanelNumber(source.ivaDetratta || source.iva_detraibile),
    ivaIndetraibile: normalizePanelNumber(source.ivaIndetraibile || source.iva_indetraibile),
    percentualeDetraibilita: normalizePanelNumber(source.percentualeDetraibilita || source.percentuale_detraibilita),
    percentualeIndetraibilita: normalizePanelNumber(source.percentualeIndetraibilita || source.percentuale_indetraibilita),
    causaleIva: normalizePanelText(source.causaleIva || source.causale_iva),
    aliquotaIva: normalizePanelText(source.aliquotaIva || source.aliquota_iva),
    naturaIva: normalizePanelText(source.naturaIva || source.natura_iva),
    rows: normalizeRegistrazioneIvaRows(source.rows || source.ivaRows || source.iva_rows || [], source),
    stato: normalizePanelText(source.stato) || 'predisposto',
  }
}

function normalizePartitarioData(source = {}) {
  const tipoMovimento = normalizePanelText(source.tipoMovimento || source.tipo_movimento || source.operazionePartite || source.operazione_partite)
  return {
    selectedPartitaId: normalizePanelText(source.selectedPartitaId || source.selected_partita_id),
    tipoMovimento,
    numeroDocumento: normalizePanelText(source.numeroDocumento || source.numero_documento || source.selectedPartitaNumeroDocumento || source.selected_partita_numero_documento),
    dataDocumento: normalizeDate(source.dataDocumento || source.data_documento || source.selectedPartitaDataDocumento || source.selected_partita_data_documento),
    tipoDocumento: normalizePanelText(source.tipoDocumento || source.tipo_documento || source.selectedPartitaTipoDocumento || source.selected_partita_tipo_documento),
    importoOrigine: normalizePanelNumber(source.importoOrigine || source.importo_origine || source.selectedPartitaImportoOrigine || source.selected_partita_importo_origine),
    saldoResiduo: normalizePanelNumber(source.saldoResiduo || source.saldo_residuo || source.selectedPartitaSaldoResiduo || source.selected_partita_saldo_residuo),
    importoAperto: normalizePanelNumber(source.importoAperto || source.importo_aperto),
    selectedPartitaNumeroDocumento: normalizePanelText(source.selectedPartitaNumeroDocumento || source.selected_partita_numero_documento),
    selectedPartitaDataDocumento: normalizeDate(source.selectedPartitaDataDocumento || source.selected_partita_data_documento),
    selectedPartitaTipoDocumento: normalizePanelText(source.selectedPartitaTipoDocumento || source.selected_partita_tipo_documento),
    selectedPartitaImportoOrigine: normalizePanelNumber(source.selectedPartitaImportoOrigine || source.selected_partita_importo_origine),
    selectedPartitaSaldoResiduo: normalizePanelNumber(source.selectedPartitaSaldoResiduo || source.selected_partita_saldo_residuo),
    importoChiusura: normalizePanelNumber(source.importoChiusura || source.importo_chiusura),
    segnoChiusura: normalizePanelText(source.segnoChiusura || source.segno_chiusura || source.segno),
    manualImportoApertoOverride: normalizePanelBoolean(source.manualImportoApertoOverride || source.manual_importo_aperto_override, false),
    manualImportoChiusuraOverride: normalizePanelBoolean(source.manualImportoChiusuraOverride || source.manual_importo_chiusura_override, false),
    stato: normalizePanelText(source.stato) || 'predisposto',
  }
}

function normalizeRitenutaData(source = {}) {
  return {
    mode: normalizePanelText(source.mode),
    percipienteId: normalizePanelText(source.percipienteId || source.percipiente_id),
    percipiente: normalizePanelText(source.percipiente),
    percipienteNome: normalizePanelText(source.percipienteNome || source.percipiente_nome),
    codiceFiscale: normalizePanelText(source.codiceFiscale || source.codice_fiscale),
    causaleCu: normalizePanelText(source.causaleCu || source.causale_cu),
    causaleReddituale: normalizePanelText(source.causaleReddituale || source.causale_reddituale),
    codiceTributo: normalizePanelText(source.codiceTributo || source.codice_tributo),
    imponibile: normalizePanelNumber(source.imponibile),
    imponibileReddito: normalizePanelNumber(source.imponibileReddito || source.imponibile_reddito || source.imponibile),
    importoCompenso: normalizePanelNumber(source.importoCompenso || source.importo_compenso),
    quotaNonSoggetta: normalizePanelNumber(source.quotaNonSoggetta || source.quota_non_soggetta),
    sommeNonSoggette: normalizePanelNumber(source.sommeNonSoggette || source.somme_non_soggette),
    codiceQuotaNonSoggetta: normalizePanelText(source.codiceQuotaNonSoggetta || source.codice_quota_non_soggetta),
    codiceSommeNonSoggette: normalizePanelText(source.codiceSommeNonSoggette || source.codice_somme_non_soggette),
    codiceEsclusione: normalizePanelText(source.codiceEsclusione || source.codice_esclusione),
    cassaPrevidenziale: normalizePanelNumber(source.cassaPrevidenziale || source.cassa_previdenziale),
    baseImponibile: normalizePanelNumber(source.baseImponibile || source.base_imponibile),
    imponibileSoggettoRitenuta: normalizePanelNumber(source.imponibileSoggettoRitenuta || source.imponibile_soggetto_ritenuta),
    baseRitenuta: normalizePanelNumber(source.baseRitenuta || source.base_ritenuta),
    aliquotaRitenuta: normalizePanelNumber(source.aliquotaRitenuta || source.aliquota_ritenuta),
    ritenuta: normalizePanelNumber(source.ritenuta),
    netto: normalizePanelNumber(source.netto),
    importoPagamento: normalizePanelNumber(source.importoPagamento || source.importo_pagamento),
    dataDocumento: normalizeDate(source.dataDocumento || source.data_documento),
    numeroDocumento: normalizePanelText(source.numeroDocumento || source.numero_documento),
    tipoDocumento: normalizePanelText(source.tipoDocumento || source.tipo_documento),
    dataPagamento: normalizeDate(source.dataPagamento || source.data_pagamento),
    note: normalizePanelText(source.note),
    escludiDaCu: normalizePanelBoolean(source.escludiDaCu || source.escludi_da_cu, false),
    manualBaseOverride: normalizePanelBoolean(source.manualBaseOverride || source.manual_base_override, false),
    manualRitenutaOverride: normalizePanelBoolean(source.manualRitenutaOverride || source.manual_ritenuta_override, false),
    manualNettoOverride: normalizePanelBoolean(source.manualNettoOverride || source.manual_netto_override, false),
    manualCompensoOverride: normalizePanelBoolean(source.manualCompensoOverride || source.manual_compenso_override, false),
    stato: normalizePanelText(source.stato) || 'predisposto',
  }
}

function pickMeaningfulText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

export function normalizeRegistrazioneInput(input = {}, { pianoConti = [], causaliContabili = [] } = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const header = source.header && typeof source.header === 'object' ? source.header : source
  const rowsSource = Array.isArray(source.rows) ? source.rows : Array.isArray(header.rows) ? header.rows : []
  const mergedDocumentData = {
    ...(header.documentData || {}),
    ...(source.documentData || {}),
    totaleDocumento: pickMeaningfulText(
      source.documentData?.totaleDocumento,
      source.documentData?.totale_documento,
      header.documentData?.totaleDocumento,
      header.documentData?.totale_documento,
      header.totaleDocumento,
      header.totale_documento,
    ),
    tipoDocumento: pickMeaningfulText(
      source.documentData?.tipoDocumento,
      source.documentData?.tipo_documento,
      header.documentData?.tipoDocumento,
      header.documentData?.tipo_documento,
      header.tipoDocumento,
      header.tipo_documento,
    ),
  }

  const normalizedHeader = {
    societaId: normalizeText(source.societaId ?? header.societaId ?? header.societa_id),
    esercizioContabile: normalizeText(header.esercizioContabile ?? header.esercizio_contabile ?? header.esercizio),
    dataRegistrazione: normalizeDate(header.dataRegistrazione ?? header.data_registrazione),
    dataDocumento: normalizeDate(header.dataDocumento ?? header.data_documento),
    numeroDocumento: normalizeText(header.numeroDocumento ?? header.numero_documento),
    totaleDocumento: normalizePanelNumber(header.totaleDocumento ?? header.totale_documento ?? source.documentData?.totaleDocumento ?? source.documentData?.totale_documento),
    tipoDocumento: normalizePanelText(header.tipoDocumento ?? header.tipo_documento),
    causaleContabile: normalizeCausaleContabile(header.causaleContabile ?? header.causaleContabileId ?? header.causaleContabileCodice ?? header.causale_id ?? header.causale_codice, causaliContabili),
    descrizioneGenerale: normalizeText(header.descrizioneGenerale ?? header.descrizione_generale ?? header.descrizione),
    soggetto: normalizeText(header.soggetto),
    clienteFornitoreId: normalizeText(header.clienteFornitoreId ?? header.cliente_fornitore_id),
    clienteFornitoreNome: normalizeText(header.clienteFornitoreNome ?? header.cliente_fornitore_nome),
    clienteFornitoreCodice: normalizeText(header.clienteFornitoreCodice ?? header.cliente_fornitore_codice),
    clienteFornitoreTipo: normalizeText(header.clienteFornitoreTipo ?? header.cliente_fornitore_tipo),
  }

  const normalizedRows = rowsSource.map((row, index) => normalizeRow(row, index, pianoConti))
  const normalizedMeta = {
    sourceModule: 'registrazione_manuale',
    sourceMode: 'manuale',
    sourceRowKey: normalizeText(source.sourceRowKey || source.docId || source.id || ''),
  }

  return {
    header: normalizedHeader,
    rows: normalizedRows,
    documentData: normalizeDocumentData(mergedDocumentData),
    ivaData: normalizeIvaData(source.ivaData || header.ivaData || {}, normalizedHeader),
    partitarioData: normalizePartitarioData(source.partitarioData || header.partitarioData || {}),
    ritenutaData: normalizeRitenutaData(source.ritenutaData || header.ritenutaData || {}),
    meta: normalizedMeta,
  }
}
