/**
 * LAB-only opt-in for DecisionFeedback DB dual-write / remote read.
 * Default OFF. Requires isolated stack + explicit env flag.
 */
export function isDecisionFeedbackDbLabEnabled(override) {
  if (override === true) return true
  if (override === false) return false
  try {
    if (typeof import.meta !== 'undefined'
      && import.meta.env
      && String(import.meta.env.VITE_FISCOSIM_DECISION_FEEDBACK_DB_LAB || '') === 'true') {
      return true
    }
  } catch {
    /* ignore non-Vite runtimes */
  }
  if (typeof process !== 'undefined'
    && process.env
    && String(process.env.FISCOSIM_DECISION_FEEDBACK_DB_LAB_ENABLED || '').trim() === 'true') {
    return true
  }
  return false
}
