import { normalizeText } from '../canonical_mapper/utils.js'
import { calculateRegistrazioneRitenutaTotals } from './calculateRegistrazioneRitenutaTotals.js'
import { validateRegistrazioneRitenutaDraft } from './validateRegistrazioneRitenutaDraft.js'
import { resolveRegistrazioneRitenutaDefaults } from './resolveRegistrazioneRitenutaDefaults.js'
import { resolveRitenutaScadenza } from '../../domain/ritenute/resolveRitenutaScadenza.js'

function firstMeaningful(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

function resolveLinkedRitenuta(ritenute = [], partitarioData = {}, partite = []) {
  const selectedIds = Array.isArray(partitarioData?.selectedPartitaIds)
    ? partitarioData.selectedPartitaIds.map((id) => String(id || '').trim()).filter(Boolean)
    : partitarioData?.selectedPartitaId
      ? [String(partitarioData.selectedPartitaId).trim()]
      : []
  if (selectedIds.length !== 1) return { record: null, partita: null, importoChiusura: 0 }

  const partitaId = selectedIds[0]
  const partita = (Array.isArray(partite) ? partite : []).find((item) => String(item?.id || '').trim() === partitaId) || null
  const record = (Array.isArray(ritenute) ? ritenute : []).find((item) =>
    String(item?.partitario_id || item?.partitarioId || '').trim() === partitaId &&
    !['versata', 'annullata'].includes(normalizeText(item?.stato).toLowerCase())
  ) || null
  const configuredAmount = partitarioData?.importiChiusura?.[partitaId] ?? partitarioData?.importoChiusura
  const importoChiusura = Number.parseFloat(String(
    configuredAmount ?? partita?.importo_residuo ?? partita?.importoResiduo ?? partita?.saldo_residuo ?? 0
  ).replace(',', '.')) || 0
  return { record, partita, importoChiusura: Math.abs(importoChiusura) }
}

export function buildRegistrazioneRitenutaDraft(input = {}, options = {}) {
  const header = input?.header && typeof input.header === 'object' ? input.header : {}
  const ritenutaData = input?.ritenutaData && typeof input.ritenutaData === 'object' ? input.ritenutaData : {}
  const documentData = input?.documentData && typeof input.documentData === 'object' ? input.documentData : {}
  const ivaDraft = input?.ivaDraft && typeof input.ivaDraft === 'object' ? input.ivaDraft : {}
  const partitarioDraft = input?.partitarioDraft && typeof input.partitarioDraft === 'object' ? input.partitarioDraft : {}
  const currentRitenutaDraft = input?.currentRitenutaDraft && typeof input.currentRitenutaDraft === 'object' ? input.currentRitenutaDraft : ritenutaData
  const percipienti = Array.isArray(input?.percipienti) ? input.percipienti : Array.isArray(options?.percipienti) ? options.percipienti : []
  const rows = Array.isArray(input?.rows) ? input.rows : []
  const partitarioData = input?.partitarioData && typeof input.partitarioData === 'object' ? input.partitarioData : {}
  const partite = Array.isArray(input?.partite) ? input.partite : []
  const ritenute = Array.isArray(input?.ritenute) ? input.ritenute : Array.isArray(options?.ritenute) ? options.ritenute : []
  const causaleRitenutaDefaults = options?.causaleRitenutaDefaults && typeof options.causaleRitenutaDefaults === 'object' ? options.causaleRitenutaDefaults : {}
  const behavior = options?.behavior && typeof options.behavior === 'object' ? options.behavior : {}
  const modeHint = normalizeText(behavior?.ritenuteMode || behavior?.opRitenute || behavior?.op_ritenute || ritenutaData.mode || '').toLowerCase()
  const mode = modeHint.includes('pagamento')
    ? 'pagamento'
    : modeHint.includes('documento')
      ? 'documento'
      : modeHint.includes('nessuno') || modeHint.includes('ignora') || modeHint.includes('none')
        ? 'none'
      : behavior?.showRitenute
        ? 'documento'
        : 'none'
  const defaults = resolveRegistrazioneRitenutaDefaults({
    header,
    documentData,
    ivaDraft,
    partitarioDraft,
    currentRitenutaDraft,
    percipienti,
    causaleRitenutaDefaults,
    behavior,
    rows,
  })
  const baseDocumento = {
    totaleDocumento: documentData.totaleDocumento || documentData.totale_documento || header.totaleDocumento || header.totale_documento || '',
    imponibile: defaults.importoCompenso,
    dataDocumento: defaults.dataDocumento,
    numeroDocumento: defaults.numeroDocumento,
    tipoDocumento: defaults.tipoDocumento,
  }
  const isDocumento = mode === 'documento'
  const isPagamento = mode === 'pagamento'
  const linked = isPagamento ? resolveLinkedRitenuta(ritenute, partitarioData, partite) : { record: null, partita: null, importoChiusura: 0 }
  const linkedRitenuta = linked.record || {}
  const manualCompensoOverride = Boolean(currentRitenutaDraft.manualCompensoOverride || currentRitenutaDraft.manual_compenso_override)
  const manualImportoCassaOverride = Boolean(currentRitenutaDraft.manualImportoCassaOverride || currentRitenutaDraft.manual_importo_cassa_override)
  const currentCompenso = manualCompensoOverride
    ? firstMeaningful(currentRitenutaDraft.importoCompenso, currentRitenutaDraft.imponibileReddito, currentRitenutaDraft.imponibile)
    : undefined
  const base = {
    mode,
    ritenutaId: normalizeText(currentRitenutaDraft.ritenutaId || currentRitenutaDraft.ritenuta_id || linkedRitenuta.id),
    percipienteId: normalizeText(linkedRitenuta.percipiente_id || defaults.percipienteId),
    percipiente: normalizeText(linkedRitenuta.percipiente_denominazione || defaults.percipienteNome),
    percipienteNome: normalizeText(linkedRitenuta.percipiente_denominazione || defaults.percipienteNome),
    codiceFiscale: normalizeText(linkedRitenuta.percipiente_cf || defaults.codiceFiscale),
    causaleCu: normalizeText(linkedRitenuta.causale_prestazione || linkedRitenuta.causale || defaults.causaleCu),
    causaleReddituale: normalizeText(linkedRitenuta.causale_prestazione || linkedRitenuta.causale || defaults.causaleReddituale),
    codiceTributo: normalizeText(linkedRitenuta.codice_tributo || defaults.codiceTributo),
    compensoSource: linkedRitenuta.compenso_lordo ? 'ritenuta_collegata' : defaults.compensoSource,
    compensoResolved: Boolean(linkedRitenuta.compenso_lordo) || defaults.compensoResolved,
    imponibileIvaInclusaCassa: ivaDraft.imponibile ?? ivaDraft.totaleImponibile ?? documentData.imponibile ?? documentData.totaleImponibile ?? '',
    manualCompensoOverride,
    manualImportoCassaOverride,
    importoCompenso: firstMeaningful(linkedRitenuta.compenso_lordo, currentCompenso, defaults.importoCompenso),
    imponibile: firstMeaningful(currentCompenso, defaults.importoCompenso),
    imponibileReddito: isDocumento
      ? firstMeaningful(currentCompenso, defaults.importoCompenso)
      : (currentRitenutaDraft.imponibileReddito != null && currentRitenutaDraft.imponibileReddito !== '' ? currentRitenutaDraft.imponibileReddito : currentRitenutaDraft.imponibile != null && currentRitenutaDraft.imponibile !== '' ? currentRitenutaDraft.imponibile : partitarioDraft?.importoChiusura || partitarioDraft?.importoAperto || defaults.importoCompenso),
    quotaNonSoggetta: currentRitenutaDraft.quotaNonSoggetta ?? currentRitenutaDraft.quota_non_soggetta ?? 0,
    sommeNonSoggette: currentRitenutaDraft.sommeNonSoggette ?? currentRitenutaDraft.somme_non_soggette ?? 0,
    codiceQuotaNonSoggetta: normalizeText(currentRitenutaDraft.codiceQuotaNonSoggetta || currentRitenutaDraft.codice_quota_non_soggetta || ''),
    codiceSommeNonSoggette: normalizeText(currentRitenutaDraft.codiceSommeNonSoggette || currentRitenutaDraft.codice_somme_non_soggette || ''),
    codiceEsclusione: normalizeText(currentRitenutaDraft.codiceEsclusione || currentRitenutaDraft.codice_esclusione || causaleRitenutaDefaults.codiceEsclusione || ''),
    cassaPrevidenziale: firstMeaningful(currentRitenutaDraft.cassaPrevidenziale, currentRitenutaDraft.cassa_previdenziale, defaults.cassaPrevidenziale, 0),
    aliquotaCassa: firstMeaningful(currentRitenutaDraft.aliquotaCassa, currentRitenutaDraft.cassaPrevidenziale, currentRitenutaDraft.cassa_previdenziale, defaults.aliquotaCassa, defaults.cassaPrevidenziale, 0),
    importoCassa: manualImportoCassaOverride
      ? currentRitenutaDraft.importoCassa ?? currentRitenutaDraft.importo_cassa ?? ''
      : '',
    codiceCassa: currentRitenutaDraft.codiceCassa || currentRitenutaDraft.codice_cassa || defaults.codiceCassa || '',
    baseImponibile: firstMeaningful(linkedRitenuta.imponibile_ritenuta, currentRitenutaDraft.baseImponibile, currentRitenutaDraft.base_imponibile, currentRitenutaDraft.baseRitenuta, currentRitenutaDraft.imponibileSoggettoRitenuta, ''),
    baseRitenuta: firstMeaningful(linkedRitenuta.imponibile_ritenuta, currentRitenutaDraft.baseRitenuta, currentRitenutaDraft.base_imponibile, currentRitenutaDraft.imponibileSoggettoRitenuta, ''),
    aliquotaRitenuta: firstMeaningful(linkedRitenuta.aliquota_ritenuta, currentRitenutaDraft.aliquotaRitenuta, causaleRitenutaDefaults.aliquotaRitenuta, defaults.aliquotaRitenuta, 0),
    ritenuta: firstMeaningful(linkedRitenuta.importo_ritenuta, linkedRitenuta.ritenuta, currentRitenutaDraft.ritenuta, ''),
    netto: isPagamento ? '' : currentRitenutaDraft.netto ?? '',
    note: normalizeText(currentRitenutaDraft.note || ''),
    escludiDaCu: isPagamento
      ? false
      : true,
    dataPagamento: isPagamento
      ? normalizeText(currentRitenutaDraft.dataPagamento || currentRitenutaDraft.dataPagamentoRitenuta || header.dataRegistrazione || defaults.dataPagamento)
      : '',
    numeroDocumento: baseDocumento.numeroDocumento,
    tipoDocumento: baseDocumento.tipoDocumento,
    importoPagamento: isPagamento ? (linked.importoChiusura || currentRitenutaDraft.importoPagamento || partitarioDraft?.importoChiusura || partitarioDraft?.importoAperto || baseDocumento.totaleDocumento || baseDocumento.imponibile || 0) : '',
  }

  const totals = calculateRegistrazioneRitenutaTotals(base, { mode, totaleDocumento: baseDocumento.totaleDocumento, importoPagamento: base.importoPagamento })
  const fiscalSchedule = isPagamento
    ? resolveRitenutaScadenza(base.dataPagamento)
    : { dataScadenza: '', periodoRiferimento: '', annoRiferimento: null }
  const draft = {
    active: Boolean(behavior.showRitenute),
    mode,
    enabled: Boolean(behavior.showRitenute),
    ...base,
    ...totals,
    dataScadenza: fiscalSchedule.dataScadenza,
    periodoRiferimento: fiscalSchedule.periodoRiferimento,
    annoRiferimento: fiscalSchedule.annoRiferimento,
    statoVersamento: isPagamento
      ? 'da_versare'
      : normalizeText(currentRitenutaDraft.statoVersamento || currentRitenutaDraft.stato_versamento) || 'predisposta',
    dataPagamento: base.dataPagamento,
    stato: normalizeText(currentRitenutaDraft.stato || defaults.stato) || (behavior.showRitenute ? (isPagamento ? 'ritenuta_pagamento_predisposta' : 'ritenuta_documento_predisposta') : 'idle'),
    rows: [
      {
        id: 'ritenuta-row-1',
        riga: 1,
        mode,
        percipienteId: base.percipienteId,
        percipienteNome: base.percipienteNome,
        codiceFiscale: base.codiceFiscale,
        causaleCu: base.causaleCu,
        causaleReddituale: base.causaleReddituale,
        codiceTributo: base.codiceTributo,
        imponibile: totals.imponibile,
        imponibileReddito: totals.imponibile,
        importoCompenso: totals.importoCompenso,
        quotaNonSoggetta: totals.quotaNonSoggetta,
        sommeNonSoggette: totals.sommeNonSoggette,
        codiceQuotaNonSoggetta: base.codiceQuotaNonSoggetta,
        codiceSommeNonSoggette: base.codiceSommeNonSoggette,
        codiceEsclusione: base.codiceEsclusione,
        cassaPrevidenziale: totals.cassaPrevidenziale,
        aliquotaCassa: totals.aliquotaCassa,
        importoCassa: totals.importoCassa,
        codiceCassa: base.codiceCassa,
        baseImponibile: totals.baseImponibile,
        baseRitenuta: totals.baseRitenuta,
        imponibileSoggettoRitenuta: totals.imponibileSoggettoRitenuta,
        aliquotaRitenuta: totals.aliquotaRitenuta,
        ritenuta: totals.ritenuta,
        netto: totals.netto,
        dataScadenza: fiscalSchedule.dataScadenza,
        dueDateF24: fiscalSchedule.dataScadenza,
        periodoRiferimento: fiscalSchedule.periodoRiferimento,
        period: fiscalSchedule.periodoRiferimento,
        annoRiferimento: fiscalSchedule.annoRiferimento,
        tributeCode: base.codiceTributo,
        statoVersamento: isPagamento ? 'da_versare' : 'predisposta',
        dataDocumento: base.dataDocumento,
        numeroDocumento: base.numeroDocumento,
        dataPagamento: base.dataPagamento,
        importoPagamento: base.importoPagamento,
        percipiente: base.percipiente,
        percipienteNome: base.percipienteNome,
        percipienteId: base.percipienteId,
        codiceFiscale: base.codiceFiscale,
        note: base.note,
        escludiDaCu: base.escludiDaCu,
        stato: normalizeText(currentRitenutaDraft.stato) || (behavior.showRitenute ? (isPagamento ? 'ritenuta_pagamento_predisposta' : 'ritenuta_documento_predisposta') : 'idle'),
      },
    ],
    documentData: baseDocumento,
    percipienteRecord: defaults.percipienteRecord || percipienti.find((item) =>
      String(item?.id || '').trim() === String(linkedRitenuta.percipiente_id || '').trim()
    ) || null,
    linkedRitenutaRecord: linked.record,
    linkedPartitaRecord: linked.partita,
    partitarioDraft,
  }
  const validation = validateRegistrazioneRitenutaDraft({ header, ritenutaData: draft, behavior, documentData, ivaDraft, partitarioDraft, percipienti }, { ...options, percipienti, partitarioDraft, documentData, ivaDraft })

  return {
    ...draft,
    validation,
    status: validation.status,
    warnings: validation.warnings,
    blockers: validation.blockers,
    info: validation.info,
  }
}
