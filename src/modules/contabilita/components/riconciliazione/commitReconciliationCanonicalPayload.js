import { commitCanonicalAccountingPayload } from '../../../../../services/canonicalAccountingCommitService.js'
import { buildReconciliationCommitInput } from '../../canonical/buildReconciliationCommitInput.js'
import { buildReconciliationCommitPreview } from './buildReconciliationCommitPreview.js'
import { validateReconciliationCommitPayload } from './validateReconciliationCommitPayload.js'

function uniqueList(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).filter((item) => item != null)))
}

function normalizeCreatedIds(createdIds = {}) {
  return {
    primaNotaId: createdIds.primaNotaId || null,
    primaNotaRigheIds: uniqueList(createdIds.primaNotaRigheIds),
    registriIvaIds: uniqueList(createdIds.registriIvaIds),
    partitarioMovementIds: uniqueList(createdIds.partitarioIds || createdIds.partitarioMovementIds),
    bankMovementActionId: createdIds.bankMovementId || createdIds.bankMovementActionId || null,
    bankMovementStatus: createdIds.bankMovementStatus || null,
    sourceDocumentId: createdIds.sourceDocumentId || null,
  }
}

function normalizeAudit(result = {}) {
  const auditPreview = result.auditPreview || {}
  return {
    ...auditPreview,
    reusedExistingCommit: Boolean(result.reusedExistingCommit),
    auditId: result.auditId || auditPreview.auditId || null,
    auditPersisted: Boolean(result.auditPersisted),
    resultSnapshot: result.resultSnapshot || null,
  }
}

function normalizeResult(result = {}) {
  return {
    ...result,
    committed: result.status === 'committed',
    createdIds: normalizeCreatedIds(result.createdIds || {}),
    audit: normalizeAudit(result),
  }
}

function normalizeBlockedResult(payload, context, validation) {
  const preview = buildReconciliationCommitPreview(payload, context)
  return normalizeResult({
    ...preview,
    status: 'blocked',
    mode: 'dry_run',
    committed: false,
    blockers: validation.blockers,
    warnings: validation.warnings,
    noDbWriteInDryRun: true,
    reusedExistingCommit: false,
    auditPreview: {
      idempotencyKey: preview.idempotencyKey,
      payloadHash: preview.payloadHash || '',
      sourceModule: 'riconciliazione_bancaria',
      sourceDocumentId: preview.sourceDocumentId || context?.bankStatementId || null,
      mode: 'dry_run',
      status: 'blocked',
      auditPersisted: false,
      noDbWriteInDryRun: true,
      createdIds: preview.createdIds || {},
      warnings: validation.warnings,
      blockers: validation.blockers,
    },
  })
}

export async function commitReconciliationCanonicalPayload(payload = {}, context = {}, repo = null) {
  const validation = validateReconciliationCommitPayload(payload, {
    ...context,
    allowRealCommit: false,
    adapterTransactional: false,
    adapterSupportsIdempotency: false,
  })

  if (validation.blockers.length > 0) {
    return normalizeBlockedResult(payload, context, validation)
  }

  const commitInput = buildReconciliationCommitInput({ canonicalPayload: payload, context })
  const result = await commitCanonicalAccountingPayload(commitInput, {
    repo: repo || undefined,
    dryRun: true,
    allowRealCommit: false,
    auditWriteEnabled: false,
  })

  return normalizeResult(result)
}