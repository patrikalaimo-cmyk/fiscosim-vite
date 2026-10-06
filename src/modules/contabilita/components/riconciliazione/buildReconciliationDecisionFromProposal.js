import {
  RECONCILIATION_DECISION_OPERATOR_ACTION,
  RECONCILIATION_DECISION_READYNESS,
  RECONCILIATION_DECISION_SOURCE,
  RECONCILIATION_DECISION_STATUS,
} from './reconciliationDecisionTypes.js'

function cloneDeep(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function buildAuditEvent(eventType, details = {}) {
  return {
    eventType,
    at: new Date().toISOString(),
    ...details,
  }
}

export function buildReconciliationDecisionFromProposal(decisionProposal = {}, overrides = {}) {
  const blockers = Array.isArray(decisionProposal.blockers) ? [...decisionProposal.blockers] : []
  const warnings = Array.isArray(decisionProposal.warnings) ? [...decisionProposal.warnings] : []
  const status = blockers.length ? RECONCILIATION_DECISION_STATUS.BLOCKED : RECONCILIATION_DECISION_STATUS.PROPOSED

  return {
    decisionId: overrides.decisionId || `rd-${decisionProposal.movementId || 'movement'}-${Date.now()}`,
    movementId: decisionProposal.movementId || overrides.movementId || null,
    source: RECONCILIATION_DECISION_SOURCE.MATCHER,
    status,
    decisionType: decisionProposal.decisionType || 'nessun_match',
    movementType: decisionProposal.movementType || 'movimento_da_classificare',
    selectedMatch: cloneDeep(decisionProposal.selectedCandidate || null),
    candidateMatches: cloneDeep(Array.isArray(decisionProposal.candidates) ? decisionProposal.candidates : []),
    accountingProposal: cloneDeep(decisionProposal.accountingProposal || null),
    cashVatImpact: cloneDeep(decisionProposal.cashVatImpact || null),
    withholdingPaymentProposal: cloneDeep(decisionProposal.withholdingPaymentProposal || null),
    readiness: decisionProposal.readiness || RECONCILIATION_DECISION_READYNESS.NEEDS_OPERATOR_CHOICE,
    warnings,
    blockers,
    operatorAction: RECONCILIATION_DECISION_OPERATOR_ACTION.NONE,
    operatorNotes: '',
    auditTrail: [buildAuditEvent('decision_proposed', {
      source: RECONCILIATION_DECISION_SOURCE.MATCHER,
      status,
      decisionType: decisionProposal.decisionType || 'nessun_match',
      readiness: decisionProposal.readiness || RECONCILIATION_DECISION_READYNESS.NEEDS_OPERATOR_CHOICE,
      warnings,
      blockers,
    })],
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  }
}
