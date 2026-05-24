import { normalizeText, round2 } from './canonicalReconciliationPayloadUtils.js'

export function buildCanonicalWithholdingPayload({ decision = {} } = {}) {
  const proposal = decision.withholdingPaymentProposal || {}
  if (!proposal.applies) return []

  return [{
    withholdingMovementId: `wm-${normalizeText(decision?.decisionId || decision?.movementId || 'movement')}`,
    percipienteId: normalizeText(proposal.percipienteId) || null,
    ritenutaId: normalizeText(proposal.ritenutaId) || `rit-${normalizeText(decision.movementId) || 'movement'}`,
    amount: round2(proposal.amount ?? 0),
    movementId: normalizeText(decision?.movementId) || null,
    decisionId: normalizeText(decision?.decisionId) || null,
    warning: normalizeText(proposal.warning) || null,
  }]
}