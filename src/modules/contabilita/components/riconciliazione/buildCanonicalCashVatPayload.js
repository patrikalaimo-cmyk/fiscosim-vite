import { normalizeText, round2 } from './canonicalReconciliationPayloadUtils.js'

export function buildCanonicalCashVatPayload({ decision = {} } = {}) {
  const impact = decision.cashVatImpact || {}
  if (!impact.applies) return []
  const selectedMatch = decision.selectedMatch || {}

  return [{
    cashVatMovementId: `cvm-${normalizeText(decision?.decisionId || decision?.movementId || 'movement')}`,
    documentId: normalizeText(impact.documentId) || normalizeText(selectedMatch.documentoId) || `doc-${normalizeText(decision.movementId) || 'movement'}`,
    direction: normalizeText(impact.direction) || null,
    taxableAmountReleased: round2(impact.taxableAmountReleased ?? 0),
    vatAmountReleased: round2(impact.vatAmountReleased ?? 0),
    proportion: round2(impact.proportion ?? 0),
    movementId: normalizeText(decision?.movementId) || null,
    decisionId: normalizeText(decision?.decisionId) || null,
    warning: normalizeText(impact.warning) || null,
  }]
}