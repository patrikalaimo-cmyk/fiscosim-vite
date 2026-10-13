/**
 * LAB-only opt-in for routing persistPrimaNotaDraft through Stage3W HTTP.
 * Default OFF in every environment. Production builds must leave this unset.
 */
export function isFiscalJournalPersistLabEnabled(override) {
  if (override === true) return true
  if (override === false) return false
  try {
    if (typeof import.meta !== 'undefined'
      && import.meta.env
      && String(import.meta.env.VITE_FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB || '') === 'true') {
      return true
    }
  } catch {
    /* ignore non-Vite runtimes */
  }
  if (typeof process !== 'undefined'
    && process.env
    && String(process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED || '') === 'true') {
    return true
  }
  return false
}
