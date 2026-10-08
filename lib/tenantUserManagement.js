import { normalizeSocietaIds } from './authMembership.js'

// Authorization input is the verified server profile, never request body or user_metadata.
export function authorizedManagerSocietaIds(ctx) {
  const authId = String(ctx?.user?.id || '').trim()
  const linkedAuthId = String(ctx?.profile?.auth_user_id || '').trim()
  if (!authId || !linkedAuthId || authId !== linkedAuthId || ctx?.profile?.attivo !== true) {
    return []
  }
  return normalizeSocietaIds(ctx?.profile?.societa_assegnate || [])
}

export function areRequestedSocietaIdsAllowed(requestedIds, allowedIds) {
  const requested = normalizeSocietaIds(requestedIds)
  const allowed = new Set(normalizeSocietaIds(allowedIds))
  return requested.length > 0 && allowed.size > 0 &&
    requested.every((societaId) => allowed.has(societaId))
}

export function areTargetMembershipsFullyAllowed(rows, allowedIds) {
  const memberships = Array.isArray(rows) ? rows : []
  const allowed = new Set(normalizeSocietaIds(allowedIds))
  if (!memberships.length || !allowed.size) return false
  return memberships.every((row) => {
    const companyId = String(row?.societa_id || '').trim()
    return Boolean(companyId) && allowed.has(companyId)
  })
}

export function visibleMembershipsForManager(rows, allowedIds) {
  const memberships = Array.isArray(rows) ? rows : []
  const allowed = new Set(normalizeSocietaIds(allowedIds))
  return memberships.filter((row) => allowed.has(String(row?.societa_id || '').trim()))
}
