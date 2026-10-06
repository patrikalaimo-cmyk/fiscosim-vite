export const ADMIN_RESET_ACTIONS = {
  reset_document_claims: 'reset_document_claims',
  reset_import_queue: 'reset_import_queue',
  reset_document_workflow: 'reset_document_workflow',
  purge_test_import_document: 'purge_test_import_document',
  purge_test_import_accounting_all: 'purge_test_import_accounting_all',
}

export const ADMIN_RESET_SCOPE_TYPES = {
  company: 'company',
  document: 'document',
}

export const DEFAULT_EDIT_ZOMBIE_LOCK_MS = 30 * 60 * 1000
export const DEFAULT_REGISTRATION_ZOMBIE_LOCK_MS = 90 * 60 * 1000

export function normalizeId(value) {
  return String(value || '').trim()
}

export function normalizeResetAction(value) {
  const action = normalizeId(value).toLowerCase()
  return Object.values(ADMIN_RESET_ACTIONS).includes(action) ? action : ''
}

export function normalizeScopeType(value) {
  const scopeType = normalizeId(value).toLowerCase()
  return Object.values(ADMIN_RESET_SCOPE_TYPES).includes(scopeType) ? scopeType : ''
}

export function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value == null) return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return fallback
}

export function safeJson(value, fallback = {}) {
  if (value == null) return fallback
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function safeStringify(value) {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return JSON.stringify({ error: 'stringify_failed' })
  }
}

function readEnvMs(name, fallback) {
  const raw = process?.env?.[name]
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function getAdminResetLockThresholds() {
  const sharedFallback = readEnvMs('ADMIN_RESET_ZOMBIE_LOCK_MS', 0)
  const editingMs = readEnvMs(
    'ADMIN_RESET_EDIT_ZOMBIE_LOCK_MS',
    sharedFallback || DEFAULT_EDIT_ZOMBIE_LOCK_MS
  )
  const registrationMs = readEnvMs(
    'ADMIN_RESET_REGISTRATION_ZOMBIE_LOCK_MS',
    sharedFallback || DEFAULT_REGISTRATION_ZOMBIE_LOCK_MS
  )
  return {
    editingMs,
    registrationMs,
  }
}

export function summarizeItems(items = []) {
  const list = Array.isArray(items) ? items : []
  const touchedCount = list.filter((item) => item?.decision === 'touch').length
  const blockedCount = list.filter((item) => item?.decision === 'block').length
  const skippedCount = list.filter((item) => item?.decision === 'skip').length
  return { touchedCount, blockedCount, skippedCount }
}

export function buildResult({
  action,
  dryRun,
  scopeType,
  scopeId = '',
  societaId = '',
  status = 'ok',
  summary = '',
  items = [],
  notes = [],
  meta = {},
}) {
  const counts = summarizeItems(items)
  return {
    ok: status !== 'error',
    action,
    dryRun,
    scopeType,
    scopeId: normalizeId(scopeId) || null,
    societaId: normalizeId(societaId) || null,
    status,
    summary,
    touchedCount: counts.touchedCount,
    blockedCount: counts.blockedCount,
    skippedCount: counts.skippedCount,
    items,
    notes: Array.isArray(notes) ? notes : [],
    meta,
  }
}

export function pickDocumentResetBaseWorkflow(row) {
  const workflowStatus = normalizeId(row?.workflow_status).toLowerCase()
  const validationStatus = normalizeId(row?.validation_status).toLowerCase()
  const hasValidatedAt = Boolean(row?.validated_at)

  if (['confirmed', 'pending', 'error'].includes(workflowStatus)) return workflowStatus
  if (validationStatus === 'error') return 'error'
  if (validationStatus === 'confirmed' || hasValidatedAt) return 'confirmed'
  if (validationStatus === 'pending') return 'pending'
  return 'pending'
}
