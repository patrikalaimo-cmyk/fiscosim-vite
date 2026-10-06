import { getAdminResetLockThresholds, normalizeId } from './resetUtils.js'

export function hasValidPrimaNota(documentRow = {}, primaNotaRow = null) {
  const linkedId = normalizeId(documentRow?.prima_nota_id)
  const primaNotaId = normalizeId(primaNotaRow?.id)
  return Boolean(linkedId || primaNotaId)
}

export function isDocumentAccountingFinalized(documentRow = {}, primaNotaRow = null) {
  return hasValidPrimaNota(documentRow, primaNotaRow) || Boolean(documentRow?.registered_at)
}

export function hasBlockingRegisteredState(documentRow = {}, primaNotaRow = null) {
  const workflowStatus = normalizeId(documentRow?.workflow_status).toLowerCase()
  return workflowStatus === 'registered' || isDocumentAccountingFinalized(documentRow, primaNotaRow)
}

export function getZombieLockAnalysis(documentRow = {}, { nowMs = Date.now(), staleMs = null } = {}) {
  const lockedBy = normalizeId(documentRow?.locked_by)
  const lockedAtRaw = documentRow?.locked_at
  const workflowStatus = normalizeId(documentRow?.workflow_status).toLowerCase()
  const lockKind = workflowStatus === 'registering' ? 'registration' : 'editing'
  const thresholds = getAdminResetLockThresholds()
  const appliedThresholdMs = Number.isFinite(Number(staleMs)) && Number(staleMs) > 0
    ? Number(staleMs)
    : lockKind === 'registration'
      ? thresholds.registrationMs
      : thresholds.editingMs
  const lockedAtMs = lockedAtRaw ? new Date(lockedAtRaw).getTime() : 0
  const hasValidLockedAt = Number.isFinite(lockedAtMs) && lockedAtMs > 0
  const ageMs = hasValidLockedAt ? Math.max(0, nowMs - lockedAtMs) : null
  const stale = lockedBy && hasValidLockedAt ? ageMs > appliedThresholdMs : false

  let reason = ''
  let previewReason = ''
  if (lockedBy && !hasValidLockedAt) {
    reason = 'locked_by_without_locked_at'
    previewReason = 'locked_by valorizzato ma locked_at nullo/non valido'
  } else if (!lockedBy && hasValidLockedAt) {
    reason = 'locked_at_without_locked_by'
    previewReason = 'locked_at presente ma locked_by vuoto'
  } else if (stale) {
    reason = 'stale_lock'
    previewReason = `lock ${lockKind} oltre soglia (${appliedThresholdMs} ms)`
  } else if (workflowStatus === 'registering' && !lockedBy) {
    reason = 'registering_without_lock_owner'
    previewReason = 'workflow_status=registering senza owner del lock'
  }

  return {
    isZombie: Boolean(reason),
    reason: reason || null,
    previewReason: previewReason || 'lock non zombie',
    lockKind,
    thresholdMs: appliedThresholdMs,
    ageMs,
    hasLockedBy: Boolean(lockedBy),
    hasValidLockedAt,
  }
}

export function isZombieLock(documentRow = {}, options = {}) {
  return getZombieLockAnalysis(documentRow, options).isZombie
}

export function isImportQueueResettable(importRow = {}) {
  const stato = normalizeId(importRow?.stato).toLowerCase()
  return ['pending', 'classified', 'manual_pending'].includes(stato)
}

export function hasValidImportGeneratedOutput({ linkedDocument = null, linkedPrimaNota = null } = {}) {
  const workflowStatus = normalizeId(linkedDocument?.workflow_status).toLowerCase()
  return Boolean(
    linkedPrimaNota?.id ||
    linkedDocument?.prima_nota_id ||
    linkedDocument?.registered_at ||
    workflowStatus === 'registered'
  )
}

export function isWorkflowResettable(documentRow = {}, primaNotaRow = null) {
  if (hasBlockingRegisteredState(documentRow, primaNotaRow)) return false
  const workflowStatus = normalizeId(documentRow?.workflow_status).toLowerCase()
  return ['pending', 'confirmed', 'registering', 'error', ''].includes(workflowStatus)
}
