import { normalizeText } from '../canonical_mapper/utils.js'
import { calculateRegistrazioneRitenutaTotals } from './calculateRegistrazioneRitenutaTotals.js'
import { validateRegistrazioneRitenutaDraft } from './validateRegistrazioneRitenutaDraft.js'
import { resolveRegistrazioneRitenutaDefaults } from './resolveRegistrazioneRitenutaDefaults.js'
import { resolveRitenutaScadenza } from '../../domain/ritenute/resolveRitenutaScadenza.js'

function firstMeaningful(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
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
  const base = {
    mode,
    percipienteId: defaults.percipienteId,
    percipiente: defaults.percipienteNome,
    percipienteNome: defaults.percipienteNome,
    codiceFiscale: defaults.codiceFiscale,
    causaleCu: defaults.causaleCu,
    causaleReddituale: defaults.causaleReddituale,
    codiceTributo: defaults.codiceTributo,
    importoCompenso: firstMeaningful(currentRitenutaDraft.importoCompenso, currentRitenutaDraft.imponibileReddito, currentRitenutaDraft.imponibile, defaults.importoCompenso),
    imponibile: currentRitenutaDraft.imponibile != null && currentRitenutaDraft.imponibile !== '' ? currentRitenutaDraft.imponibile : defaults.importoCompenso,
    imponibileReddito: isDocumento
      ? (currentRitenutaDraft.imponibileReddito != null && currentRitenutaDraft.imponibileReddito !== '' ? currentRitenutaDraft.imponibileReddito : currentRitenutaDraft.imponibile != null && currentRitenutaDraft.imponibile !== '' ? currentRitenutaDraft.imponibile : defaults.importoCompenso)
      : (currentRitenutaDraft.imponibileReddito != null && currentRitenutaDraft.imponibileReddito !== '' ? currentRitenutaDraft.imponibileReddito : currentRitenutaDraft.imponibile != null && currentRitenutaDraft.imponibile !== '' ? currentRitenutaDraft.imponibile : partitarioDraft?.importoChiusura || partitarioDraft?.importoAperto || defaults.importoCompenso),
    quotaNonSoggetta: currentRitenutaDraft.quotaNonSoggetta ?? currentRitenutaDraft.quota_non_soggetta ?? 0,
    sommeNonSoggette: currentRitenutaDraft.sommeNonSoggette ?? currentRitenutaDraft.somme_non_soggette ?? 0,
    codiceQuotaNonSoggetta: normalizeText(currentRitenutaDraft.codiceQuotaNonSoggetta || currentRitenutaDraft.codice_quota_non_soggetta || ''),
    codiceSommeNonSoggette: normalizeText(currentRitenutaDraft.codiceSommeNonSoggette || currentRitenutaDraft.codice_somme_non_soggette || ''),
    codiceEsclusione: normalizeText(currentRitenutaDraft.codiceEsclusione || currentRitenutaDraft.codice_esclusione || causaleRitenutaDefaults.codiceEsclusione || ''),
    cassaPrevidenziale: firstMeaningful(currentRitenutaDraft.cassaPrevidenziale, currentRitenutaDraft.cassa_previdenziale, defaults.cassaPrevidenziale, 0),
    aliquotaCassa: firstMeaningful(currentRitenutaDraft.aliquotaCassa, currentRitenutaDraft.cassaPrevidenziale, currentRitenutaDraft.cassa_previdenziale, defaults.aliquotaCassa, defaults.cassaPrevidenziale, 0),
    importoCassa: currentRitenutaDraft.importoCassa ?? currentRitenutaDraft.importo_cassa ?? '',
    codiceCassa: currentRitenutaDraft.codiceCassa || currentRitenutaDraft.codice_cassa || defaults.codiceCassa || '',
    baseImponibile: currentRitenutaDraft.baseImponibile ?? currentRitenutaDraft.base_imponibile ?? currentRitenutaDraft.baseRitenuta ?? currentRitenutaDraft.imponibileSoggettoRitenuta ?? '',
    baseRitenuta: currentRitenutaDraft.baseRitenuta ?? currentRitenutaDraft.base_imponibile ?? currentRitenutaDraft.imponibileSoggettoRitenuta ?? '',
    aliquotaRitenuta: firstMeaningful(currentRitenutaDraft.aliquotaRitenuta, causaleRitenutaDefaults.aliquotaRitenuta, defaults.aliquotaRitenuta, 0),
    ritenuta: currentRitenutaDraft.ritenuta ?? '',
    netto: currentRitenutaDraft.netto ?? '',
    note: normalizeText(currentRitenutaDraft.note || ''),
    escludiDaCu: currentRitenutaDraft.escludiDaCu == null && currentRitenutaDraft.escludi_da_cu == null
      ? !defaults.inclusaCu
      : Boolean(currentRitenutaDraft.escludiDaCu ?? currentRitenutaDraft.escludi_da_cu),
    dataPagamento: normalizeText(currentRitenutaDraft.dataPagamento || currentRitenutaDraft.dataPagamentoRitenuta || defaults.dataPagamento),
    numeroDocumento: baseDocumento.numeroDocumento,
    tipoDocumento: baseDocumento.tipoDocumento,
    importoPagamento: isPagamento ? (currentRitenutaDraft.importoPagamento || partitarioDraft?.importoChiusura || partitarioDraft?.importoAperto || baseDocumento.totaleDocumento || baseDocumento.imponibile || 0) : '',
  }

  const totals = calculateRegistrazioneRitenutaTotals(base, { mode, totaleDocumento: baseDocumento.totaleDocumento, importoPagamento: base.importoPagamento })
  const fiscalSchedule = resolveRitenutaScadenza(base.dataPagamento || base.dataDocumento)
  const draft = {
    active: Boolean(behavior.showRitenute),
    mode,
    enabled: Boolean(behavior.showRitenute),
    ...base,
    ...totals,
    dataScadenza: fiscalSchedule.dataScadenza,
    periodoRiferimento: fiscalSchedule.periodoRiferimento,
    annoRiferimento: fiscalSchedule.annoRiferimento,
    statoVersamento: normalizeText(currentRitenutaDraft.statoVersamento || currentRitenutaDraft.stato_versamento) || 'aperta',
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
        statoVersamento: normalizeText(currentRitenutaDraft.statoVersamento || currentRitenutaDraft.stato_versamento) || 'aperta',
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
    percipienteRecord: defaults.percipienteRecord,
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
