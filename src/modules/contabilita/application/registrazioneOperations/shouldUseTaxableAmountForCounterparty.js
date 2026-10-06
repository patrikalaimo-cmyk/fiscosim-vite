import { normalizeText } from '../canonical_mapper/utils.js'

export function shouldUseTaxableAmountForCounterparty(policy = {}, behavior = {}) {
  const documentMode = normalizeText(behavior?.documentMode).trim().toLowerCase()
  const ivaMode = normalizeText(behavior?.ivaMode).trim().toLowerCase()

  return Boolean(
    policy?.isAutofattura ||
      policy?.isCee ||
      policy?.isReverseCharge ||
      documentMode === 'autofattura' ||
      documentMode === 'documento_iva_cee' ||
      ivaMode === 'autofattura' ||
      ivaMode === 'cee'
  )
}
