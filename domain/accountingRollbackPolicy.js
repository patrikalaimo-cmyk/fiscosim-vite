export function buildAccountingRollbackPlan(plan, ctx = {}) {
  return [
    'delete_prima_nota_righe',
    'delete_prima_nota',
    'release_documenti_contabilita_claim',
    'delete_documenti_contabilita_if_created_by_this_commit',
  ]
}