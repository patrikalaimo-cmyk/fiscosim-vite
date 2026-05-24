function normalizeId(value) {
  return String(value || '').trim()
}

function parseMaybeJson(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

export const SCOPE_FIELDS = ['tenant_id', 'company_id', 'created_by', 'owner_user_id', 'visibility', 'locked_by', 'locked_at']

/** Profilo costruito in dev con bypass locale: `utente.id` è spesso un placeholder non presente in `utenti_studio`. */
const DEV_LOCAL_AUTH_BYPASS_SOURCE = 'dev_local_auth_bypass'

function isDevLocalAuthBypassProfile(utente) {
  return String(utente?.profile_source || '').trim() === DEV_LOCAL_AUTH_BYPASS_SOURCE
}

export function getScopeUserId(utente) {
  return normalizeId(utente?.id)
}

export function getScopeCompanyId(societaId) {
  return normalizeId(societaId)
}

export function getValidActiveCompanyId(list = [], { utente = null, preferredSocietaId = '' } = {}) {
  const options = Array.isArray(list) ? list : []
  const preferredId = normalizeId(preferredSocietaId)
  if (preferredId && options.some((item) => normalizeId(item?.id) === preferredId)) {
    return preferredId
  }
  const defaultSocietaId = normalizeId(utente?.societa_default_id)
  if (defaultSocietaId && options.some((item) => normalizeId(item?.id) === defaultSocietaId)) {
    return defaultSocietaId
  }
  return normalizeId(options[0]?.id)
}

export function getScopedStorageKey(baseKey, { utente = null, societaId = '' } = {}) {
  const parts = [baseKey, getScopeCompanyId(societaId) || 'global', getScopeUserId(utente) || 'shared']
  return parts.filter(Boolean).join('::')
}

export function getScopedStorageItem(baseKey, { utente = null, societaId = '' } = {}, fallbackValue = null) {
  if (typeof localStorage === 'undefined') return fallbackValue
  const key = getScopedStorageKey(baseKey, { utente, societaId })
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallbackValue : raw
  } catch {
    return fallbackValue
  }
}

export function setScopedStorageItem(baseKey, value, { utente = null, societaId = '' } = {}) {
  if (typeof localStorage === 'undefined') return
  const key = getScopedStorageKey(baseKey, { utente, societaId })
  try {
    if (value == null || value === '') localStorage.removeItem(key)
    else localStorage.setItem(key, String(value))
  } catch {
    /* ignore */
  }
}

export function buildScopeMetadata({
  utente = null,
  societaId = '',
  visibility = 'shared',
  ownerUserId = null,
  createdBy = null,
  lockedBy = null,
  lockedAt = null,
} = {}) {
  const userId = normalizeId(utente?.id)
  // Non inserire UUID mock su colonne FK verso public.utenti_studio(id): il trigger DB valorizza da JWT se null.
  const bypass = isDevLocalAuthBypassProfile(utente)
  const created_by = bypass
    ? null
    : normalizeId(createdBy) || userId || null
  const owner_user_id = bypass ? null : normalizeId(ownerUserId) || null
  return {
    tenant_id: getScopeCompanyId(societaId) || null,
    company_id: getScopeCompanyId(societaId) || null,
    created_by,
    owner_user_id,
    visibility: visibility || 'shared',
    locked_by: normalizeId(lockedBy) || null,
    locked_at: lockedAt || null,
  }
}

export function stripScopeFields(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const next = { ...payload }
  for (const key of SCOPE_FIELDS) delete next[key]
  return next
}

export function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('column') && message.includes(String(columnName || '').toLowerCase())
}

export function shouldFallbackScope(error) {
  return SCOPE_FIELDS.some((field) => isMissingColumnError(error, field))
}

export function getRowScope(row) {
  const dati = parseMaybeJson(row?.dati_estratti)
  const aiRaw = parseMaybeJson(row?.ai_raw_response)
  return {
    createdBy: normalizeId(row?.created_by || row?.createdBy || aiRaw?.created_by || dati?.created_by),
    ownerUserId: normalizeId(row?.owner_user_id || row?.ownerUserId || aiRaw?.owner_user_id || dati?.owner_user_id),
    visibility: normalizeId(row?.visibility || row?.scope || aiRaw?.visibility || dati?.visibility) || 'shared',
    lockedBy: normalizeId(row?.locked_by || row?.lockedBy || aiRaw?.locked_by || dati?.locked_by),
    lockedAt: row?.locked_at || row?.lockedAt || aiRaw?.locked_at || dati?.locked_at || null,
    companyId: normalizeId(row?.company_id || row?.tenant_id || row?.societa_id || aiRaw?.company_id || dati?.company_id),
  }
}

export function isRowOwnedByUser(row, userId) {
  const uid = normalizeId(userId)
  if (!uid) return false
  const scope = getRowScope(row)
  return [scope.ownerUserId, scope.createdBy, scope.lockedBy].some((value) => normalizeId(value) === uid)
}

export function isRowLockedByOther(row, userId) {
  const uid = normalizeId(userId)
  const scope = getRowScope(row)
  const locked = normalizeId(scope.lockedBy)
  return Boolean(locked && locked !== uid)
}

export function isRowVisibleToUser(row, userId, { allowLegacyUnscoped = true } = {}) {
  const uid = normalizeId(userId)
  if (!uid) return true
  const scope = getRowScope(row)
  const hasScopeMetadata = Boolean(scope.createdBy || scope.ownerUserId || scope.lockedBy || scope.visibility !== 'shared')
  if (!hasScopeMetadata) return allowLegacyUnscoped
  if (isRowOwnedByUser(row, uid)) return true
  return scope.visibility === 'shared'
}

export function splitRowsByScope(rows = [], userId) {
  const owned = []
  const shared = []
  const otherLocked = []
  for (const row of rows || []) {
    if (isRowLockedByOther(row, userId)) {
      otherLocked.push(row)
      continue
    }
    if (isRowOwnedByUser(row, userId)) {
      owned.push(row)
    } else {
      shared.push(row)
    }
  }
  return { owned, shared, otherLocked }
}
