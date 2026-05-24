import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function toAmount(value) {
  const text = normalizeText(value).replace(',', '.')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

export function calculateRegistrazioneRitenutaTotals(input = {}, options = {}) {
  const mode = normalizeText(options?.mode || input?.mode || 'documento').toLowerCase()
  const totaleDocumento = toAmount(input.totaleDocumento ?? input.totale_documento ?? options?.totaleDocumento ?? 0)
  const importoPagamento = toAmount(input.importoPagamento ?? input.importo_pagamento ?? options?.importoPagamento ?? 0)
  const importoCompensoSeed = input.importoCompenso ?? input.importo_compenso ?? input.imponibileReddito ?? input.imponibile ?? (mode === 'pagamento' ? importoPagamento : totaleDocumento)
  const importoCompenso = toAmount(importoCompensoSeed)
  const quotaNonSoggetta = toAmount(input.quotaNonSoggetta ?? input.quota_non_soggetta)
  const sommeNonSoggette = toAmount(input.sommeNonSoggette ?? input.somme_non_soggette)
  const nonSoggetteTotali = round2(quotaNonSoggetta + sommeNonSoggette)
  const cassaPrevidenziale = toAmount(input.cassaPrevidenziale ?? input.cassa_previdenziale)
  const manualBaseOverride = Boolean(input.manualBaseOverride || input.manual_base_override)
  const manualRitenutaOverride = Boolean(input.manualRitenutaOverride || input.manual_ritenuta_override)
  const manualNettoOverride = Boolean(input.manualNettoOverride || input.manual_netto_override)
  const manualCompensoOverride = Boolean(input.manualCompensoOverride || input.manual_compenso_override)

  const aliquotaRitenuta = toAmount(input.aliquotaRitenuta ?? input.aliquota_ritenuta)
  const baseImponibileInput = toAmount(input.baseImponibile ?? input.base_imponibile)
  const baseRitenutaInput = toAmount(input.baseRitenuta ?? input.base_ritenuta)
  const imponibileSoggettoRitenutaInput = toAmount(input.imponibileSoggettoRitenuta ?? input.imponibile_soggetto_ritenuta)
  const paymentSeed = input.importoPagamento ?? input.importo_pagamento ?? options?.importoPagamento ?? 0
  const baseSeed = mode === 'pagamento' ? toAmount(paymentSeed || importoCompenso) : importoCompenso
  const suggestedBase = toAmount(
    input.baseImponibile != null && input.baseImponibile !== ''
      ? input.baseImponibile
      : input.imponibileSoggettoRitenuta != null && input.imponibileSoggettoRitenuta !== ''
        ? input.imponibileSoggettoRitenuta
        : input.baseRitenuta != null && input.baseRitenuta !== ''
          ? input.baseRitenuta
          : Math.max(0, baseSeed - nonSoggetteTotali)
  )

  const baseImponibile = manualBaseOverride
    ? (baseImponibileInput || baseRitenutaInput || imponibileSoggettoRitenutaInput)
    : (baseImponibileInput || baseRitenutaInput || imponibileSoggettoRitenutaInput || suggestedBase)

  const baseRitenuta = baseImponibile

  const ritenutaCalcolata = round2((baseRitenuta * aliquotaRitenuta) / 100)
  const ritenuta = manualRitenutaOverride
    ? toAmount(input.ritenuta)
    : toAmount(input.ritenuta != null && input.ritenuta !== '' ? input.ritenuta : ritenutaCalcolata)

  const nettoDefault = mode === 'pagamento'
    ? round2(Math.max(0, (importoPagamento || importoCompenso || totaleDocumento) - ritenuta))
    : round2(Math.max(0, importoCompenso - ritenuta))
  const netto = manualNettoOverride
    ? toAmount(input.netto)
    : toAmount(input.netto != null && input.netto !== '' ? input.netto : nettoDefault)

  return {
    mode,
    totaleDocumento,
    importoPagamento,
    importoCompenso,
    imponibile: importoCompenso,
    imponibileReddito: importoCompenso,
    quotaNonSoggetta,
    sommeNonSoggette,
    cassaPrevidenziale,
    baseImponibile: round2(baseImponibile),
    baseRitenuta: round2(baseRitenuta),
    imponibileSoggettoRitenuta: round2(baseRitenuta),
    aliquotaRitenuta,
    ritenuta: round2(ritenuta),
    netto: round2(netto),
    manualBaseOverride,
    manualRitenutaOverride,
    manualNettoOverride,
    manualCompensoOverride,
  }
}
