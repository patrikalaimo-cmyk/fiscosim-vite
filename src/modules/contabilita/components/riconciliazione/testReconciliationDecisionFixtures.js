import { getRiconciliazioneMatchingFixtures } from './riconciliazioneMatchingFixtures.js'
import { runRiconciliazioneMatchForMovement } from './runRiconciliazioneMatchForMovement.js'
import { buildReconciliationDecisionFromProposal } from './buildReconciliationDecisionFromProposal.js'
import { validateReconciliationDecision } from './validateReconciliationDecision.js'
import { applyReconciliationDecisionAction } from './applyReconciliationDecisionAction.js'
import { RECONCILIATION_DECISION_OPERATOR_ACTION, RECONCILIATION_DECISION_STATUS } from './reconciliationDecisionTypes.js'

function toSummaryRow(caseId, movementId, step, ok, reason) {
  return { caseId, movementId, step, status: ok ? 'PASS' : 'FAIL', reason: reason || '' }
}

export function runReconciliationDecisionFixtureChecks() {
  const fixtures = getRiconciliazioneMatchingFixtures()
  const rows = []
  const failures = []

  for (const testCase of fixtures.expectedCases) {
    const movement = fixtures.movements.find((item) => item.movementId === testCase.movementId)
    const proposal = runRiconciliazioneMatchForMovement({ movement, partiteAperte: fixtures.partiteAperte })
    const baseDecision = buildReconciliationDecisionFromProposal(proposal, { movementId: movement?.movementId || movement?.id || null })
    const validation = validateReconciliationDecision(baseDecision)

    const baseOk = Boolean(baseDecision.movementId && baseDecision.decisionType && baseDecision.movementType)
    rows.push(toSummaryRow(testCase.caseId, testCase.movementId, 'build', baseOk, baseOk ? '' : 'decisione base non valida'))
    if (!baseOk) failures.push({ caseId: testCase.caseId, movementId: testCase.movementId, reason: 'decisione base non valida' })

    const acceptResult = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.ACCEPT_PROPOSAL, { operatorNotes: 'accept test' })
    const shouldAccept = validation.blockers.length === 0 && baseDecision.status !== RECONCILIATION_DECISION_STATUS.BLOCKED
    const acceptOk = shouldAccept ? acceptResult.ok && acceptResult.decision.status === RECONCILIATION_DECISION_STATUS.ACCEPTED : !acceptResult.ok
    rows.push(toSummaryRow(testCase.caseId, testCase.movementId, 'accept', acceptOk, acceptOk ? '' : shouldAccept ? 'accept non applicato' : 'accept non bloccato'))
    if (!acceptOk) failures.push({ caseId: testCase.caseId, movementId: testCase.movementId, reason: shouldAccept ? 'accept non applicato' : 'accept non bloccato' })

    const reviewResult = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.MARK_NEEDS_REVIEW, { operatorNotes: 'review test' })
    const reviewOk = reviewResult.ok && reviewResult.decision.status === RECONCILIATION_DECISION_STATUS.NEEDS_REVIEW && reviewResult.decision.auditTrail.length >= baseDecision.auditTrail.length + 1
    rows.push(toSummaryRow(testCase.caseId, testCase.movementId, 'mark_needs_review', reviewOk, reviewOk ? '' : 'needs_review non applicato'))
    if (!reviewOk) failures.push({ caseId: testCase.caseId, movementId: testCase.movementId, reason: 'needs_review non applicato' })

    const ignoreResult = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.IGNORE_MOVEMENT, { operatorNotes: 'ignore test' })
    const ignoreOk = ignoreResult.ok && ignoreResult.decision.status === RECONCILIATION_DECISION_STATUS.IGNORED && ignoreResult.decision.auditTrail.length >= baseDecision.auditTrail.length + 1
    rows.push(toSummaryRow(testCase.caseId, testCase.movementId, 'ignore_movement', ignoreOk, ignoreOk ? '' : 'ignored non applicato'))
    if (!ignoreOk) failures.push({ caseId: testCase.caseId, movementId: testCase.movementId, reason: 'ignored non applicato' })

    const cancelResult = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.CANCEL_DECISION, { operatorNotes: 'cancel test' })
    const cancelOk = cancelResult.ok && cancelResult.decision.status === RECONCILIATION_DECISION_STATUS.CANCELLED && cancelResult.decision.auditTrail.length >= baseDecision.auditTrail.length + 1
    rows.push(toSummaryRow(testCase.caseId, testCase.movementId, 'cancel_decision', cancelOk, cancelOk ? '' : 'cancelled non applicato'))
    if (!cancelOk) failures.push({ caseId: testCase.caseId, movementId: testCase.movementId, reason: 'cancelled non applicato' })
  }

  return { fixtures, rows, failures }
}
