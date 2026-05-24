import { authServerSpan, authServerWarn } from './authDebug.js'

const ACTIVE_SOCIETA_SELECT = 'id, denominazione, attiva'
const AUTH_LIST_PAGE_SIZE = 200
const STUDIO_USER_SELECT = 'id, auth_user_id, nome, cognome, email, ruolo, permessi, clienti_assegnati, attivo'

export function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function normalizeRole(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || 'collaboratore'
}

export function normalizeSocietaIds(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  )
}

export function roleHasGlobalSocietaFallback(role = '') {
  const normalized = normalizeRole(role)
  return normalized === 'owner' || normalized === 'admin'
}

export function buildUserProfileSnapshot({
  profileRow = null,
  membershipRows = [],
  authEmail = null,
  preferredSocietaId = '',
} = {}) {
  if (!profileRow) return null
  const cleanMembershipRows = Array.isArray(membershipRows) ? membershipRows : []
  const societaIds = normalizeSocietaIds(cleanMembershipRows.map((row) => row?.societa_id))
  const societaDefaultId = pickDeterministicDefaultSocietaId({
    preferredId: preferredSocietaId,
    assignments: cleanMembershipRows,
    fallbackIds: societaIds,
  })
  return {
    ...profileRow,
    ruolo: normalizeRole(profileRow?.ruolo),
    auth_email: authEmail || null,
    societa_assegnate: societaIds,
    societa_default_id: societaDefaultId,
  }
}

export function pickDeterministicDefaultSocietaId({
  preferredId = '',
  assignments = [],
  fallbackIds = [],
} = {}) {
  const normalizedPreferred = String(preferredId || '').trim()
  const assignedIds = normalizeSocietaIds(assignments.map((row) => row?.societa_id))
  const candidates = assignedIds.length > 0 ? assignedIds : normalizeSocietaIds(fallbackIds)
  if (normalizedPreferred && candidates.includes(normalizedPreferred)) return normalizedPreferred
  const flaggedDefault = assignments.find((row) => row?.is_default && candidates.includes(String(row?.societa_id || '').trim()))
  return flaggedDefault?.societa_id || candidates[0] || null
}

export async function listActiveSocieta(admin) {
  const span = authServerSpan('authMembership.listActiveSocieta')
  const { data, error } = await admin
    .from('societa')
    .select(ACTIVE_SOCIETA_SELECT)
    .eq('attiva', true)
    .order('denominazione')
    .limit(500)
  if (error) {
    span.fail(error)
    throw error
  }
  const rows = Array.isArray(data) ? data : []
  span.end({ rows: rows.length })
  return rows
}

export async function listActiveSocietaIds(admin) {
  return normalizeSocietaIds((await listActiveSocieta(admin)).map((row) => row?.id))
}

export async function findAuthUserByEmail(admin, email) {
  const span = authServerSpan('authMembership.findAuthUserByEmail', {
    email: normalizeEmail(email),
  })
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    span.end({ found: false, reason: 'empty-email' })
    return null
  }

  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_LIST_PAGE_SIZE,
    })
    if (error) {
      span.fail(error, { page })
      throw error
    }
    const users = Array.isArray(data?.users) ? data.users : []
    const match = users.find((user) => normalizeEmail(user?.email) === normalizedEmail)
    if (match) {
      span.end({ found: true, page, authUserId: match?.id || null })
      return match
    }
    if (users.length < AUTH_LIST_PAGE_SIZE) break
    page += 1
  }

  span.end({ found: false, page })
  return null
}

export async function readStudioUserByAuthUserId(admin, authUserId) {
  const normalizedAuthUserId = String(authUserId || '').trim()
  if (!normalizedAuthUserId) return null
  const { data, error } = await admin
    .from('utenti_studio')
    .select(STUDIO_USER_SELECT)
    .eq('auth_user_id', normalizedAuthUserId)
    .eq('attivo', true)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function readStudioUserByEmail(admin, email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null
  const { data, error } = await admin
    .from('utenti_studio')
    .select(STUDIO_USER_SELECT)
    .eq('email', normalizedEmail)
    .eq('attivo', true)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function queryMemberships(admin, column, value) {
  const span = authServerSpan('authMembership.queryMemberships', {
    column,
    hasValue: Boolean(value),
  })
  if (!value) return []
  const { data, error } = await admin
    .from('utenti_studio_societa')
    .select('id, utente_id, auth_user_id, societa_id, ruolo, is_default, created_at')
    .eq(column, value)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) {
    span.fail(error, { column })
    throw error
  }
  const rows = Array.isArray(data) ? data : []
  span.end({ column, rows: rows.length })
  return rows
}

export async function readMembershipRows(admin, { authUserId = '', utenteId = '' } = {}) {
  const span = authServerSpan('authMembership.readMembershipRows', {
    authUserId: authUserId || null,
    utenteId: utenteId || null,
  })
  const normalizedAuthUserId = String(authUserId || '').trim()
  const normalizedUtenteId = String(utenteId || '').trim()

  let rows = await queryMemberships(admin, 'auth_user_id', normalizedAuthUserId)
  if (rows.length > 0 || !normalizedUtenteId) {
    span.end({ strategy: 'auth_user_id', rows: rows.length })
    return rows
  }

  rows = await queryMemberships(admin, 'utente_id', normalizedUtenteId)
  span.end({ strategy: 'utente_id', rows: rows.length })
  return rows
}

export async function listMembershipRowsForUtenteIds(admin, utenteIds = []) {
  const cleanUtenteIds = normalizeSocietaIds(utenteIds)
  if (cleanUtenteIds.length === 0) return []
  const { data, error } = await admin
    .from('utenti_studio_societa')
    .select('id, utente_id, auth_user_id, societa_id, ruolo, is_default, created_at')
    .in('utente_id', cleanUtenteIds)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function replaceUserMemberships(admin, {
  utenteId,
  authUserId,
  societaIds = [],
  ruolo = 'collaboratore',
} = {}) {
  const span = authServerSpan('authMembership.replaceUserMemberships', {
    utenteId: utenteId || null,
    authUserId: authUserId || null,
    societaCount: Array.isArray(societaIds) ? societaIds.length : 0,
    ruolo,
  })
  const normalizedUtenteId = String(utenteId || '').trim()
  const normalizedAuthUserId = String(authUserId || '').trim()
  const cleanIds = normalizeSocietaIds(societaIds)
  if (!normalizedUtenteId || !normalizedAuthUserId) {
    span.end({ skipped: true, reason: 'missing-identifiers' })
    return []
  }

  const { error: deleteError } = await admin
    .from('utenti_studio_societa')
    .delete()
    .eq('utente_id', normalizedUtenteId)
  if (deleteError) {
    span.fail(deleteError, { stage: 'delete-existing' })
    throw deleteError
  }

  if (cleanIds.length === 0) {
    span.end({ rows: 0, skipped: true, reason: 'no-societa-ids' })
    return []
  }

  const membershipRole = roleHasGlobalSocietaFallback(ruolo)
    ? String(ruolo || '').trim() || 'collaboratore'
    : 'collaboratore'

  const rows = cleanIds.map((societaId, index) => ({
    utente_id: normalizedUtenteId,
    auth_user_id: normalizedAuthUserId,
    societa_id: societaId,
    ruolo: membershipRole,
    is_default: index === 0,
  }))
  const { error } = await admin.from('utenti_studio_societa').insert(rows)
  if (error) {
    span.fail(error, { stage: 'insert-memberships' })
    throw error
  }
  span.end({ rows: rows.length })
  return rows
}

export async function resolveProvisionedSocietaIds(admin, {
  requestedIds = [],
  ruolo = '',
} = {}) {
  const span = authServerSpan('authMembership.resolveProvisionedSocietaIds', {
    requestedCount: Array.isArray(requestedIds) ? requestedIds.length : 0,
    ruolo,
  })
  const cleanRequestedIds = normalizeSocietaIds(requestedIds)
  if (cleanRequestedIds.length > 0) {
    span.end({ source: 'request', societaCount: cleanRequestedIds.length })
    return cleanRequestedIds
  }

  const activeSocietaIds = await listActiveSocietaIds(admin)
  span.end({ source: 'all-active-default', societaCount: activeSocietaIds.length })
  return activeSocietaIds
}

export async function buildSessionProfile(admin, {
  authUser = null,
} = {}) {
  const authUserId = String(authUser?.id || '').trim()
  if (!authUserId) return null

  const linkedProfile = await readStudioUserByAuthUserId(admin, authUserId)
  const fallbackProfile =
    linkedProfile
    || await readStudioUserByEmail(admin, authUser?.email || '')

  if (!fallbackProfile) return null

  const membershipRows = await readMembershipRows(admin, {
    authUserId,
    utenteId: fallbackProfile?.id || '',
  })

  return buildUserProfileSnapshot({
    profileRow: linkedProfile || fallbackProfile,
    membershipRows,
    authEmail: normalizeEmail(authUser?.email || ''),
  })
}

export async function syncAuthUserMetadata(admin, {
  authUserId = '',
  currentUser = null,
  profile = {},
} = {}) {
  const span = authServerSpan('authMembership.syncAuthUserMetadata', {
    authUserId: authUserId || null,
  })
  const normalizedAuthUserId = String(authUserId || '').trim()
  if (!normalizedAuthUserId) {
    span.end({ skipped: true, reason: 'missing-auth-user-id' })
    return currentUser
  }

  const existingMeta =
    currentUser?.user_metadata && typeof currentUser.user_metadata === 'object'
      ? currentUser.user_metadata
      : {}

  const nextMeta = {
    ...existingMeta,
    nome: String(profile?.nome || existingMeta?.nome || '').trim(),
    cognome: String(profile?.cognome || existingMeta?.cognome || '').trim(),
    ruolo: normalizeRole(profile?.ruolo || existingMeta?.ruolo || 'collaboratore'),
    email: normalizeEmail(profile?.email || currentUser?.email || existingMeta?.email || ''),
  }

  const currentComparable = JSON.stringify({
    nome: existingMeta?.nome || '',
    cognome: existingMeta?.cognome || '',
    ruolo: normalizeRole(existingMeta?.ruolo || ''),
    email: normalizeEmail(currentUser?.email || existingMeta?.email || ''),
  })
  const nextComparable = JSON.stringify({
    nome: nextMeta.nome,
    cognome: nextMeta.cognome,
    ruolo: nextMeta.ruolo,
    email: nextMeta.email,
  })
  if (currentComparable === nextComparable) {
    span.end({ skipped: true, reason: 'metadata-unchanged' })
    return currentUser
  }

  const { data, error } = await admin.auth.admin.updateUserById(normalizedAuthUserId, {
    user_metadata: nextMeta,
  })
  if (error) {
    span.fail(error)
    throw error
  }
  span.end({ updated: true })
  return data?.user || currentUser
}

export async function resolveUserSocietaScope(admin, {
  user = null,
  profile = null,
  mutateMembership = true,
} = {}) {
  const span = authServerSpan('authMembership.resolveUserSocietaScope', {
    authUserId: user?.id || null,
    profileId: profile?.id || null,
    ruolo: profile?.ruolo || null,
    mutateMembership,
  })
  const authUserId = String(user?.id || '').trim()
  const utenteId = String(profile?.id || '').trim()
  const role = String(profile?.ruolo || '').trim()
  const metadataIds = normalizeSocietaIds(user?.user_metadata?.societa_assegnate || [])

  let assignments = await readMembershipRows(admin, { authUserId, utenteId })
  let societaIds = normalizeSocietaIds(assignments.map((row) => row?.societa_id))
  let activeSocietaIds = []

  if (societaIds.length === 0) {
    activeSocietaIds = await listActiveSocietaIds(admin).catch(() => [])
    const fallbackIds = metadataIds.length > 0
      ? metadataIds
      : roleHasGlobalSocietaFallback(role)
      ? activeSocietaIds
      : activeSocietaIds.length === 1
      ? activeSocietaIds
      : []

    if (mutateMembership && fallbackIds.length > 0 && utenteId && authUserId) {
      authServerWarn('authMembership.resolveUserSocietaScope:fallback-membership-repair', {
        authUserId,
        utenteId,
        societaCount: fallbackIds.length,
      })
      await replaceUserMemberships(admin, {
        utenteId,
        authUserId,
        societaIds: fallbackIds,
        ruolo: role,
      })
      assignments = await readMembershipRows(admin, { authUserId, utenteId })
      societaIds = normalizeSocietaIds(assignments.map((row) => row?.societa_id))
    }

    if (societaIds.length === 0) {
      societaIds = fallbackIds
    }
  }

  const societaDefaultId = pickDeterministicDefaultSocietaId({
    preferredId: user?.user_metadata?.societa_default_id,
    assignments,
    fallbackIds: societaIds,
  })

  const resolved = {
    assignments,
    societaIds,
    societaDefaultId,
    activeSocietaIds,
  }
  span.end({
    societaCount: societaIds.length,
    societaDefaultId: societaDefaultId || null,
    usedMetadataFallback: assignments.length === 0 && metadataIds.length > 0,
    activeSocietaCount: activeSocietaIds.length,
  })
  return resolved
}
