import { normalizeText, round2 } from '../canonical_mapper/utils.js'
import { calculateRitenutaProfessionista } from '../../domain/ritenute/calculateRitenutaProfessionista.js'

function toAmount(value) {
  const text = normalizeText(value).replace(',', '.')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

export function calculateRegistrazioneRitenutaTotals(input = {}, options = {}) {
  const mode = normalizeText(options?.mode || input?.mode || 'documento').toLowerCase()
  const totaleDocumento = toAmount(input.totaleDocumento ?? input.totale_documento ?? options?.totaleDocumento ?? 0)
  const importoPagamento = toAmount(input.importoPagamento ?? input.importo_pagamento ?? options?.importoPagamento ?? 0)
  
  const aliquotaCassa = toAmount(input.aliquotaCassa ?? input.aliquota_cassa ?? input.cassaPrevidenziale ?? input.cassa_previdenziale ?? 0)
  const manualCompensoOverride = Boolean(input.manualCompensoOverride || input.manual_compenso_override)
  
  const importoCompensoSeed = input.importoCompenso ?? input.importo_compenso ?? input.imponibileReddito ?? input.imponibile ?? (mode === 'pagamento' ? importoPagamento : totaleDocumento)
  const baseSeed = toAmount(importoCompensoSeed)

  const importoCompenso = baseSeed
  const quotaNonSoggetta = toAmount(input.quotaNonSoggetta ?? input.quota_non_soggetta)
  const sommeNonSoggette = toAmount(input.sommeNonSoggette ?? input.somme_non_soggette)
  const nonSoggetteTotali = round2(quotaNonSoggetta + sommeNonSoggette)
  const manualBaseOverride = Boolean(input.manualBaseOverride || input.manual_base_override)
  const manualRitenutaOverride = Boolean(input.manualRitenutaOverride || input.manual_ritenuta_override)
  const manualNettoOverride = Boolean(input.manualNettoOverride || input.manual_netto_override)

  const aliquotaRitenuta = toAmount(input.aliquotaRitenuta ?? input.aliquota_ritenuta)
  const baseImponibileInput = toAmount(input.baseImponibile ?? input.base_imponibile)
  const baseRitenutaInput = toAmount(input.baseRitenuta ?? input.base_ritenuta)
  const imponibileSoggettoRitenutaInput = toAmount(input.imponibileSoggettoRitenuta ?? input.imponibile_soggetto_ritenuta)
  const paymentSeed = input.importoPagamento ?? input.importo_pagamento ?? options?.importoPagamento ?? 0
  const calculationSeed = mode === 'pagamento' ? toAmount(paymentSeed || importoCompenso) : importoCompenso
  
  const suggestedBase = toAmount(
    input.baseImponibile != null && input.baseImponibile !== ''
      ? input.baseImponibile
      : input.imponibileSoggettoRitenuta != null && input.imponibileSoggettoRitenuta !== ''
        ? input.imponibileSoggettoRitenuta
        : input.baseRitenuta != null && input.baseRitenuta !== ''
          ? input.baseRitenuta
          : Math.max(0, calculationSeed - nonSoggetteTotali)
  )

  const baseImponibile = manualBaseOverride
    ? (baseImponibileInput || baseRitenutaInput || imponibileSoggettoRitenutaInput)
    : (baseImponibileInput || baseRitenutaInput || imponibileSoggettoRitenutaInput || suggestedBase)

  const baseRitenuta = baseImponibile

  const fiscalTotals = calculateRitenutaProfessionista({
    compenso: importoCompenso,
    aliquotaCassa,
    importoCassa: input.importoCassa ?? input.importo_cassa,
    quotaNonSoggetta,
    sommeNonSoggette,
    baseRitenuta,
    aliquotaRitenuta,
    ritenuta: manualRitenutaOverride || (input.ritenuta != null && input.ritenuta !== '') ? input.ritenuta : undefined,
    totaleDocumento: mode === 'pagamento'
      ? (importoPagamento || totaleDocumento || importoCompenso)
      : (totaleDocumento || importoCompenso),
  })
  const ritenuta = fiscalTotals.ritenuta
  const nettoDefault = fiscalTotals.nettoPagabile
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
    cassaPrevidenziale: aliquotaCassa,
    aliquotaCassa,
    importoCassa: fiscalTotals.importoCassa,
    imponibileIva: fiscalTotals.imponibileIva,
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
