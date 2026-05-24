export const RECONCILIATION_DECISION_STATUS = Object.freeze({
  PROPOSED: 'proposed',
  ACCEPTED: 'accepted',
  NEEDS_REVIEW: 'needs_review',
  IGNORED: 'ignored',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled',
})

export const RECONCILIATION_DECISION_SOURCE = Object.freeze({
  MATCHER: 'matcher',
  OPERATOR: 'operator',
  SYSTEM: 'system',
})

export const RECONCILIATION_DECISION_OPERATOR_ACTION = Object.freeze({
  ACCEPT_PROPOSAL: 'accept_proposal',
  MARK_NEEDS_REVIEW: 'mark_needs_review',
  IGNORE_MOVEMENT: 'ignore_movement',
  CANCEL_DECISION: 'cancel_decision',
  NONE: 'none',
})

export const RECONCILIATION_DECISION_READYNESS = Object.freeze({
  READY_TO_POST: 'ready_to_post',
  READY_TO_REVIEW: 'ready_to_review',
  NEEDS_OPERATOR_CHOICE: 'needs_operator_choice',
  READY_WITHOUT_PARTITA: 'ready_without_partita',
  BLOCKED: 'blocked',
  IGNORED: 'ignored',
  CANCELLED: 'cancelled',
})

export const RECONCILIATION_DECISION_ACTION_RESULT = Object.freeze({
  OK: 'ok',
  BLOCKED: 'blocked',
  INVALID: 'invalid',
})
