import { normalizeText } from '../canonical_mapper/utils.js'

function toAmount(value) {
  const parsed = Number.parseFloat(String(normalizeText(value)).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function firstMeaningful(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

function resolvePercipienteRecord(percipienti = [], draft = {}, header = {}) {
  const rows = Array.isArray(percipienti) ? percipienti : []
  const id = String(draft?.percipienteId || '').trim()
  const codiceFiscale = normalizeText(draft?.codiceFiscale || header?.codiceFiscale || header?.clienteFornitoreCodice || '').toLowerCase()
  const nome = normalizeText(draft?.percipiente || draft?.percipienteNome || header?.soggetto || header?.clienteFornitoreNome || '').toLowerCase()
  if (!rows.length) return null

  return (
    rows.find((item) => {
      const itemId = String(item?.id || '').trim()
      const itemName = normalizeText(item?.ragione_sociale || item?.denominazione || item?.nome || item?.cognome || '').toLowerCase()
      const itemCf = normalizeText(item?.codice_fiscale || item?.cf || '').toLowerCase()
      return (id && itemId === id) || (codiceFiscale && itemCf && itemCf === codiceFiscale) || (nome && itemName && itemName === nome)
    }) || null
  )
}

function resolveImportoCompenso({ documentData = {}, ivaDraft = {}, partitarioDraft = {}, rows = [], header = {}, mode = 'documento', aliquotaCassa = 0 } = {}) {
  const rowsList = Array.isArray(rows) ? rows : []
  const costRowsAmount = rowsList
    .filter(row => {
      const contoId = String(row.conto_id || row.contoId || '').trim()
      if (!contoId) return false
      const isCounterparty = contoId === String(header.clienteFornitoreId || header.cliente_fornitore_id || '').trim()
      const contoCod = String(row.conto_codice || row.contoCodice || '')
      const isVat = contoCod.startsWith('22') || contoCod.startsWith('33')
      const desc = String(row.conto_descrizione || row.contoDescrizione || '').toLowerCase()
      const isVatByDesc = desc.includes('iva c/') || desc.includes('iva su ') || desc.includes('erario c/iva')
      const role = normalizeText(row.ruolo || row.role || row.formula_importo).toLowerCase()
      const isCassa = role.includes('cassa') || desc.includes('cassa previd')
      return !isCounterparty && !isVat && !isVatByDesc && !isCassa
    })
    .reduce((sum, row) => sum + toAmount(row.dare || row.importo_dare || row.avere || row.importo_avere || 0), 0)

  if (costRowsAmount > 0) {
    return costRowsAmount
  }

  const ivaNetto = toAmount(
    ivaDraft?.imponibile ??
      ivaDraft?.totaleImponibile ??
      ivaDraft?.totaleDocumento ??
      documentData?.imponibile ??
      documentData?.totaleImponibile ??
      0
  )
  const documentTotal = toAmount(documentData?.totaleDocumento || documentData?.totale_documento || 0)
  const ivaTotale = toAmount(
    ivaDraft?.totaleIva ??
      ivaDraft?.totaleImposta ??
      ivaDraft?.totaleImposte ??
      documentData?.totaleImposte ??
      documentData?.totaleImposta ??
      0
  )
  const documentImponibile = toAmount(documentData?.imponibile || documentData?.totaleImponibile || 0)
  const partitarioAmount = toAmount(partitarioDraft?.importoChiusura || partitarioDraft?.importoAperto || 0)

  if (mode === 'pagamento') return partitarioAmount || documentImponibile || ivaNetto || documentTotal
  const imponibileIva = ivaNetto || documentImponibile || (documentTotal && ivaTotale ? Math.max(0, documentTotal - ivaTotale) : 0)
  return aliquotaCassa > 0 ? imponibileIva / (1 + aliquotaCassa / 100) : imponibileIva
}

function resolveAliquota({ currentDraft = {}, percipienteRecord = null, causaleRitenutaDefaults = {}, mode = 'documento' } = {}) {
  const direct = currentDraft.aliquotaRitenuta ?? causaleRitenutaDefaults.aliquotaRitenuta ?? percipienteRecord?.aliquota_ritenuta ?? percipienteRecord?.aliquotaRitenuta
  if (Number.isFinite(Number(direct)) && Number(direct) > 0) return Number(direct)
  const text = normalizeText([
    currentDraft.causaleCu,
    currentDraft.causaleReddituale,
    percipienteRecord?.causale_prevalente,
    percipienteRecord?.causale_reddituale,
    percipienteRecord?.descrizione,
    percipienteRecord?.ragione_sociale,
  ].filter(Boolean).join(' ')).toLowerCase()
  if (text.includes('provvig') || text.includes('commission') || text.includes('agenz') || text.includes('mediaz') || text.includes('rappresent')) return 23
  return mode === 'pagamento' ? 20 : 20
}

function resolveCodiceTributo({ currentDraft = {}, percipienteRecord = null } = {}) {
  return normalizeText(currentDraft.codiceTributo || currentDraft.codice_tributo || percipienteRecord?.codice_tributo || '1040') || '1040'
}

export function resolveRegistrazioneRitenutaDefaults(input = {}) {
  const header = input?.header && typeof input.header === 'object' ? input.header : {}
  const documentData = input?.documentData && typeof input.documentData === 'object' ? input.documentData : {}
  const ivaDraft = input?.ivaDraft && typeof input.ivaDraft === 'object' ? input.ivaDraft : {}
  const partitarioDraft = input?.partitarioDraft && typeof input.partitarioDraft === 'object' ? input.partitarioDraft : {}
  const currentRitenutaDraft = input?.currentRitenutaDraft && typeof input.currentRitenutaDraft === 'object' ? input.currentRitenutaDraft : {}
  const percipienti = Array.isArray(input?.percipienti) ? input.percipienti : []
  const causaleRitenutaDefaults = input?.causaleRitenutaDefaults && typeof input.causaleRitenutaDefaults === 'object' ? input.causaleRitenutaDefaults : {}
  const behavior = input?.behavior && typeof input.behavior === 'object' ? input.behavior : {}
  const rows = Array.isArray(input?.rows) ? input.rows : []
  const modeHint = normalizeText(behavior?.ritenuteMode || behavior?.opRitenute || behavior?.op_ritenute || currentRitenutaDraft.mode || '').toLowerCase()
  const mode = modeHint.includes('pagamento')
    ? 'pagamento'
    : modeHint.includes('documento')
      ? 'documento'
      : modeHint.includes('nessuno') || modeHint.includes('ignora') || modeHint.includes('none')
        ? 'none'
        : behavior?.showRitenute
          ? 'documento'
          : 'none'
  const percipienteRecord = resolvePercipienteRecord(percipienti, currentRitenutaDraft, header)
  const percipienteNome = normalizeText(
    currentRitenutaDraft.percipiente || currentRitenutaDraft.percipienteNome || header.soggetto || header.clienteFornitoreNome || percipienteRecord?.ragione_sociale || percipienteRecord?.denominazione || percipienteRecord?.nome || ''
  )
  const aliquotaCassa = toAmount(
    firstMeaningful(
      currentRitenutaDraft.aliquotaCassa,
      currentRitenutaDraft.aliquota_cassa,
      currentRitenutaDraft.cassaPrevidenziale,
      currentRitenutaDraft.cassa_previdenziale,
      percipienteRecord?.aliquota_cassa,
      percipienteRecord?.cassa_previdenziale,
      percipienteRecord?.metadata?.aliquota_cassa,
      0
    )
  )
  const importoCompenso = resolveImportoCompenso({ documentData, ivaDraft, partitarioDraft, rows, header, mode, aliquotaCassa })
  return {
    mode,
    percipienteRecord,
    percipienteId: normalizeText(currentRitenutaDraft.percipienteId || percipienteRecord?.id || ''),
    percipienteNome,
    codiceFiscale: normalizeText(currentRitenutaDraft.codiceFiscale || percipienteRecord?.codice_fiscale || percipienteRecord?.cf || header.codiceFiscale || ''),
    causaleCu: normalizeText(currentRitenutaDraft.causaleCu || currentRitenutaDraft.causaleReddituale || percipienteRecord?.causale_prevalente || percipienteRecord?.causale_reddituale || causaleRitenutaDefaults.causaleCu || ''),
    causaleReddituale: normalizeText(currentRitenutaDraft.causaleReddituale || currentRitenutaDraft.causaleCu || percipienteRecord?.causale_prevalente || percipienteRecord?.causale_reddituale || causaleRitenutaDefaults.causaleReddituale || ''),
    codiceTributo: resolveCodiceTributo({ currentDraft: currentRitenutaDraft, percipienteRecord }),
    importoCompenso: toAmount(firstMeaningful(currentRitenutaDraft.importoCompenso, currentRitenutaDraft.imponibileReddito, currentRitenutaDraft.imponibile, importoCompenso)),
    quotaNonSoggetta: toAmount(currentRitenutaDraft.quotaNonSoggetta || currentRitenutaDraft.quota_non_soggetta || 0),
    sommeNonSoggette: toAmount(currentRitenutaDraft.sommeNonSoggette || currentRitenutaDraft.somme_non_soggette || 0),
    codiceQuotaNonSoggetta: normalizeText(currentRitenutaDraft.codiceQuotaNonSoggetta || currentRitenutaDraft.codice_quota_non_soggetta || ''),
    codiceSommeNonSoggette: normalizeText(currentRitenutaDraft.codiceSommeNonSoggette || currentRitenutaDraft.codice_somme_non_soggette || ''),
    codiceEsclusione: normalizeText(currentRitenutaDraft.codiceEsclusione || currentRitenutaDraft.codice_esclusione || causaleRitenutaDefaults.codiceEsclusione || ''),
    cassaPrevidenziale: aliquotaCassa,
    aliquotaCassa,
    codiceCassa: normalizeText(
      currentRitenutaDraft.codiceCassa ||
        currentRitenutaDraft.codice_cassa ||
        percipienteRecord?.codice_cassa ||
        percipienteRecord?.metadata?.codice_cassa ||
        ''
    ),
    inclusaCu: currentRitenutaDraft.escludiDaCu == null && currentRitenutaDraft.escludi_da_cu == null
      ? Boolean(percipienteRecord?.soggetto_cu ?? percipienteRecord?.inclusa_cu ?? percipienteRecord?.metadata?.soggetto_cu ?? true)
      : !Boolean(currentRitenutaDraft.escludiDaCu ?? currentRitenutaDraft.escludi_da_cu),
    stato: normalizeText(currentRitenutaDraft.stato || percipienteRecord?.stato_ritenuta_default || percipienteRecord?.metadata?.stato_ritenuta_default || 'predisposto'),
    aliquotaRitenuta: resolveAliquota({ currentDraft: currentRitenutaDraft, percipienteRecord, causaleRitenutaDefaults, mode }),
    dataDocumento: normalizeText(currentRitenutaDraft.dataDocumento || documentData.dataDocumento || header.dataDocumento || header.dataRegistrazione || ''),
    numeroDocumento: normalizeText(currentRitenutaDraft.numeroDocumento || documentData.numeroDocumento || header.numeroDocumento || ''),
    tipoDocumento: normalizeText(currentRitenutaDraft.tipoDocumento || documentData.tipoDocumento || header.tipoDocumento || ''),
    dataPagamento: normalizeText(currentRitenutaDraft.dataPagamento || currentRitenutaDraft.dataPagamentoRitenuta || documentData.dataPagamento || partitarioDraft?.dataDocumento || header.dataDocumento || ''),
  }
}
