import {
  RECONCILIATION_DECISION_ACTION_RESULT,
  RECONCILIATION_DECISION_OPERATOR_ACTION,
  RECONCILIATION_DECISION_READYNESS,
  RECONCILIATION_DECISION_STATUS,
} from './reconciliationDecisionTypes.js'
import { validateReconciliationDecision } from './validateReconciliationDecision.js'

function buildActionEvent(action, payload = {}, previousStatus, nextStatus) {
  return {
    eventType: action,
    at: new Date().toISOString(),
    payload: { ...payload },
    previousStatus,
    nextStatus,
  }
}

function cloneDeep(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

export function applyReconciliationDecisionAction(decision = {}, action = RECONCILIATION_DECISION_OPERATOR_ACTION.NONE, payload = {}) {
  const next = cloneDeep(decision) || {}
  next.auditTrail = Array.isArray(next.auditTrail) ? [...next.auditTrail] : []
  const validation = validateReconciliationDecision(next)

  if (action === RECONCILIATION_DECISION_OPERATOR_ACTION.ACCEPT_PROPOSAL) {
    if (validation.blockers.length || next.blockers?.length || next.status === RECONCILIATION_DECISION_STATUS.BLOCKED) {
      return {
        ok: false,
        result: RECONCILIATION_DECISION_ACTION_RESULT.BLOCKED,
        error: 'blocked_decision',
        decision: next,
        validation,
      }
    }
    next.status = RECONCILIATION_DECISION_STATUS.ACCEPTED
    next.source = 'operator'
    next.operatorAction = RECONCILIATION_DECISION_OPERATOR_ACTION.ACCEPT_PROPOSAL
    next.readiness = next.selectedMatch?.partitaId ? RECONCILIATION_DECISION_READYNESS.READY_TO_POST : RECONCILIATION_DECISION_READYNESS.READY_TO_REVIEW
    next.operatorNotes = String(payload.operatorNotes || next.operatorNotes || '').trim()
    next.auditTrail.push(buildActionEvent(action, payload, decision.status, next.status))
    next.updatedAt = new Date().toISOString()
    return { ok: true, result: RECONCILIATION_DECISION_ACTION_RESULT.OK, decision: next, validation: validateReconciliationDecision(next) }
  }

  if (action === RECONCILIATION_DECISION_OPERATOR_ACTION.MARK_NEEDS_REVIEW) {
    next.status = RECONCILIATION_DECISION_STATUS.NEEDS_REVIEW
    next.source = 'operator'
    next.operatorAction = RECONCILIATION_DECISION_OPERATOR_ACTION.MARK_NEEDS_REVIEW
    next.readiness = RECONCILIATION_DECISION_READYNESS.NEEDS_OPERATOR_CHOICE
    next.operatorNotes = String(payload.operatorNotes || next.operatorNotes || '').trim()
    next.auditTrail.push(buildActionEvent(action, payload, decision.status, next.status))
    next.updatedAt = new Date().toISOString()
    return { ok: true, result: RECONCILIATION_DECISION_ACTION_RESULT.OK, decision: next, validation: validateReconciliationDecision(next) }
  }

  if (action === RECONCILIATION_DECISION_OPERATOR_ACTION.IGNORE_MOVEMENT) {
    next.status = RECONCILIATION_DECISION_STATUS.IGNORED
    next.source = 'operator'
    next.operatorAction = RECONCILIATION_DECISION_OPERATOR_ACTION.IGNORE_MOVEMENT
    next.readiness = RECONCILIATION_DECISION_READYNESS.IGNORED
    next.operatorNotes = String(payload.operatorNotes || next.operatorNotes || '').trim()
    next.accountingProposal = null
    next.auditTrail.push(buildActionEvent(action, payload, decision.status, next.status))
    next.updatedAt = new Date().toISOString()
    return { ok: true, result: RECONCILIATION_DECISION_ACTION_RESULT.OK, decision: next, validation: validateReconciliationDecision(next) }
  }

  if (action === RECONCILIATION_DECISION_OPERATOR_ACTION.CANCEL_DECISION) {
    next.status = RECONCILIATION_DECISION_STATUS.CANCELLED
    next.source = 'operator'
    next.operatorAction = RECONCILIATION_DECISION_OPERATOR_ACTION.CANCEL_DECISION
    next.readiness = RECONCILIATION_DECISION_READYNESS.NEEDS_OPERATOR_CHOICE
    next.operatorNotes = String(payload.operatorNotes || next.operatorNotes || '').trim()
    next.auditTrail.push(buildActionEvent(action, payload, decision.status, next.status))
    next.updatedAt = new Date().toISOString()
    return { ok: true, result: RECONCILIATION_DECISION_ACTION_RESULT.OK, decision: next, validation: validateReconciliationDecision(next) }
  }

  return {
    ok: false,
    result: RECONCILIATION_DECISION_ACTION_RESULT.INVALID,
    error: 'unsupported_action',
    decision: next,
    validation,
  }
}
