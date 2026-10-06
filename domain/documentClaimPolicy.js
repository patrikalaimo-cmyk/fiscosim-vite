export function buildDocumentClaimPlan(plan, ctx = {}) {
  return {
    targetTable: 'documenti_contabilita',
    claimStatus: 'registering',
    successStatus: 'registered',
    failureFallbackStatus: 'confirmed',
    lockFields: ['locked_by', 'locked_at'],
    status: 'not_executed',
  }
}