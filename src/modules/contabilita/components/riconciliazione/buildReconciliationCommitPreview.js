import { buildReconciliationCommitPlan } from './reconciliationCommitPlanning.js'

export function buildReconciliationCommitPreview(payload = {}, context = {}) {
  const plan = buildReconciliationCommitPlan(payload, context)
  return {
    mode: 'dry_run',
    supportedCase: plan.supportedCase,
    idempotencyKey: plan.idempotencyKey,
    primaNota: plan.preview.primaNota,
    primaNotaRighe: plan.preview.primaNotaRighe,
    partitarioMovements: plan.preview.partitarioMovements,
    cashVatMovements: plan.preview.cashVatMovements,
    withholdingMovements: plan.preview.withholdingMovements,
    bankMovement: plan.preview.bankMovement,
    operationsPlanned: plan.operationsPlanned,
    blockers: plan.blockers,
    warnings: plan.warnings,
    noDbWriteInDryRun: true,
    message: plan.preview.message,
    accountingSummary: plan.accountingSummary,
  }
}