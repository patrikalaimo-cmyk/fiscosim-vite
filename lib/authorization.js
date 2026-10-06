import { getSupabaseAdmin } from './db.js'

export async function getAuthorizedSocietaIdsForUser({ authUserId }) {
  if (!authUserId) return []
  const db = await getSupabaseAdmin()
  const { data: membershipRows, error } = await db
    .from('utenti_studio_societa')
    .select('societa_id')
    .eq('auth_user_id', authUserId)
  if (error) throw error

  const directIds = Array.from(new Set((membershipRows || []).map((row) => String(row.societa_id || '')).filter(Boolean)))
  if (directIds.length > 0) return directIds

  const { data: profile, error: profileError } = await db
    .from('utenti_studio')
    .select('id, ruolo')
    .eq('auth_user_id', authUserId)
    .eq('attivo', true)
    .maybeSingle()
  if (profileError) throw profileError

  const role = String(profile?.ruolo || '').trim().toLowerCase()
  if (role === 'owner' || role === 'admin') {
    const { data: societaRows, error: societaError } = await db
      .from('societa')
      .select('id')
      .eq('attiva', true)
      .order('denominazione')
      .limit(500)
    if (societaError) throw societaError
    return Array.from(new Set((societaRows || []).map((row) => String(row.id || '')).filter(Boolean)))
  }

  if (profile?.id) {
    const { data: legacyMembershipRows, error: legacyMembershipError } = await db
      .from('utenti_studio_societa')
      .select('societa_id')
      .eq('utente_id', profile.id)
    if (legacyMembershipError) throw legacyMembershipError
    return Array.from(new Set((legacyMembershipRows || []).map((row) => String(row.societa_id || '')).filter(Boolean)))
  }

  return []
}

export async function requireSocietaAccess({ authUserId, societaId }) {
  const cleanSocietaId = String(societaId || '').trim()
  if (!authUserId || !cleanSocietaId) return false
  const ids = await getAuthorizedSocietaIdsForUser({ authUserId })
  return ids.includes(cleanSocietaId)
}

export async function assertSocietaAccess({ authUserId, societaId, message = 'Accesso non autorizzato alla società' }) {
  const ok = await requireSocietaAccess({ authUserId, societaId })
  if (!ok) {
    const err = new Error(message)
    err.code = 'FORBIDDEN_SOCIETA'
    throw err
  }
  return true
}

export async function requireDocumentAccess({ authUserId, documentId, societaId = '' }) {
  const db = await getSupabaseAdmin()
  let q = db
    .from('documenti_contabilita')
    .select('id, societa_id')
    .eq('id', documentId)
    .limit(1)
  if (societaId) q = q.eq('societa_id', societaId)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  if (data?.id) {
    return requireSocietaAccess({ authUserId, societaId: data.societa_id })
  }

  // Staging import: pipeline e POST /api/document usano l'id di `documenti_import`, non `documenti_contabilita`
  let qi = db
    .from('documenti_import')
    .select('id, societa_destinazione_id')
    .eq('id', documentId)
    .limit(1)
  if (societaId) qi = qi.eq('societa_destinazione_id', societaId)
  const { data: rowImport, error: errImport } = await qi.maybeSingle()
  if (errImport) throw errImport
  if (!rowImport?.id) return false
  return requireSocietaAccess({ authUserId, societaId: rowImport.societa_destinazione_id })
}

export async function assertDocumentAccess({ authUserId, documentId, societaId = '', message = 'Accesso non autorizzato al documento' }) {
  const ok = await requireDocumentAccess({ authUserId, documentId, societaId })
  if (!ok) {
    const err = new Error(message)
    err.code = 'FORBIDDEN_DOCUMENT'
    throw err
  }
  return true
}
