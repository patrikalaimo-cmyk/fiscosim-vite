/**
 * LAB-only gate for real bank reconciliation commits via Stage3W fiscal journal.
 * Default OFF: UI/bank path stays dry-run.
 */
export function isBankFiscalCommitLabEnabled(env = process.env) {
  return (
    String(env.FISCOSIM_ISOLATED_LAB_API || '').trim() === 'true'
    && String(env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED || '').trim() === 'true'
    && String(env.FISCOSIM_BANK_COMMIT_LAB_ENABLED || '').trim() === 'true'
  )
}
