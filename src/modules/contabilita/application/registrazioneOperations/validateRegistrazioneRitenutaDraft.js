import { normalizeText } from '../canonical_mapper/utils.js'
import { resolveRegistrazioneRitenutaDefaults } from './resolveRegistrazioneRitenutaDefaults.js'

function toAmount(value) {
  const parsed = Number.parseFloat(String(normalizeText(value)).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function validateRegistrazioneRitenutaDraft(draft = {}, options = {}) {
  const behavior = options?.behavior && typeof options.behavior === 'object' ? options.behavior : {}
  const ritenutaData = draft?.ritenutaData && typeof draft.ritenutaData === 'object' ? draft.ritenutaData : {}
  const partitarioDraft = draft?.partitarioDraft && typeof draft.partitarioDraft === 'object' ? draft.partitarioDraft : options?.partitarioDraft && typeof options.partitarioDraft === 'object' ? options.partitarioDraft : {}
  const blockers = []
  const warnings = []
  const info = []

  if (!behavior?.showRitenute) {
    return { status: 'idle', blockers, warnings, info }
  }

  const modeHint = normalizeText(behavior?.ritenuteMode || ritenutaData.mode || 'documento').toLowerCase()
  const mode = modeHint.includes('pagamento')
    ? 'pagamento'
    : modeHint.includes('documento')
      ? 'documento'
      : modeHint.includes('nessuno') || modeHint.includes('ignora') || modeHint.includes('none')
        ? 'none'
        : 'documento'
  const defaults = resolveRegistrazioneRitenutaDefaults({
    header: draft?.header || {},
    documentData: draft?.documentData || {},
    ivaDraft: draft?.ivaDraft || options?.ivaDraft || {},
    partitarioDraft: partitarioDraft,
    currentRitenutaDraft: ritenutaData,
    percipienti: Array.isArray(options?.percipienti) ? options.percipienti : [],
    causaleRitenutaDefaults: options?.causaleRitenutaDefaults || {},
    behavior,
  })
  const percipiente = normalizeText(ritenutaData.percipiente || ritenutaData.percipienteNome || draft?.header?.soggetto || draft?.header?.clienteFornitoreNome || defaults.percipienteNome)
  const aliquota = toAmount(ritenutaData.aliquotaRitenuta ?? defaults.aliquotaRitenuta)
  const importoCompenso = toAmount(ritenutaData.importoCompenso ?? ritenutaData.imponibileReddito ?? ritenutaData.imponibile ?? defaults.importoCompenso)
  const quotaNonSoggetta = toAmount(ritenutaData.quotaNonSoggetta ?? ritenutaData.quota_non_soggetta)
  const sommeNonSoggette = toAmount(ritenutaData.sommeNonSoggette ?? ritenutaData.somme_non_soggette)
  const codiceQuotaNonSoggetta = normalizeText(ritenutaData.codiceQuotaNonSoggetta || ritenutaData.codice_quota_non_soggetta || '')
  const codiceSommeNonSoggette = normalizeText(ritenutaData.codiceSommeNonSoggette || ritenutaData.codice_somme_non_soggette || '')
  const base = toAmount(ritenutaData.baseImponibile ?? ritenutaData.baseRitenuta ?? ritenutaData.imponibileSoggettoRitenuta ?? 0)
  const ritenuta = toAmount(ritenutaData.ritenuta || 0)
  const importoPagamento = toAmount(ritenutaData.importoPagamento || partitarioDraft?.importoChiusura || partitarioDraft?.importoAperto || 0)
  const expectedBase = Math.max(0, roundNumber(importoCompenso - quotaNonSoggetta - sommeNonSoggette))
  const expectedRitenuta = roundNumber((base * aliquota) / 100)

  if (mode !== 'none' && !defaults.percipienteRecord) blockers.push('percipiente / professionista non presente in anagrafica percipienti')
  if (mode !== 'none' && !ritenutaData.causaleCu && !ritenutaData.causaleReddituale) blockers.push('causale reddituale non compilata')
  if (mode !== 'none' && !percipiente) blockers.push('percipiente / professionista non compilato')
  if (mode !== 'none' && (importoCompenso <= 0 || !Number.isFinite(importoCompenso) || ritenutaData.compensoResolved === false)) {
    blockers.push('compenso professionale non identificabile: configurare una base tecnica compenso o imponibile')
  }
  if (mode !== 'none' && (!Number.isFinite(aliquota) || aliquota <= 0)) blockers.push('aliquota ritenuta non definita')
  if (mode !== 'none' && (!Number.isFinite(base) || base <= 0)) blockers.push('base imponibile / base ritenuta non compilata')
  if (mode !== 'none' && (!Number.isFinite(ritenuta) || ritenuta < 0)) blockers.push('ritenuta non valida')
  if (mode !== 'none' && Math.abs(roundNumber(base - expectedBase)) > 0.01) blockers.push('base ritenuta incoerente con importo compenso e quote non soggette')
  if (mode !== 'none' && Math.abs(roundNumber(ritenuta - expectedRitenuta)) > 0.01) blockers.push('ritenuta incoerente con base e aliquota')
  if ((quotaNonSoggetta > 0 || sommeNonSoggette > 0) && !codiceSommeNonSoggette && !codiceQuotaNonSoggetta) blockers.push('codice somme / quota non soggette mancante')
  if (mode === 'pagamento' && !partitarioDraft?.selectedPartitaId && !partitarioDraft?.selectedPartitaNumeroDocumento) warnings.push('partita collegata non selezionata per la ritenuta su pagamento')
  if (mode === 'pagamento' && importoPagamento <= 0) warnings.push('importo pagamento non disponibile')
  if (mode === 'pagamento' && !ritenutaData.linkedRitenutaRecord?.id) blockers.push('posizione ritenuta predisposta non trovata per la partita selezionata')
  if (mode === 'pagamento' && ritenutaData.linkedPartitaRecord) {
    const residuo = Math.abs(toAmount(
      ritenutaData.linkedPartitaRecord.importo_residuo ??
        ritenutaData.linkedPartitaRecord.importoResiduo ??
        ritenutaData.linkedPartitaRecord.saldo_residuo
    ))
    if (residuo > 0 && Math.abs(importoPagamento - residuo) > 0.01) {
      blockers.push('pagamento parziale ritenute non ancora supportato')
    }
  }
  if (mode !== 'none' && !normalizeText(ritenutaData.codiceTributo)) blockers.push('codice tributo ritenuta mancante')
  if (mode === 'pagamento' && !normalizeText(ritenutaData.dataScadenza)) blockers.push('data scadenza ritenuta non calcolabile')
  info.push(mode === 'pagamento'
    ? 'Ritenuta maturata, scadenza e dati CU/770 predisposti.'
    : 'Ritenuta calcolata e predisposta; scadenza e CU/770 maturano al pagamento.')

  const status = blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ok'

  return {
    status,
    blockers,
    warnings,
    info,
  }
}

function roundNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * 100) / 100
}
