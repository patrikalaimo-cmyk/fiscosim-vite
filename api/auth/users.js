import { getSupabaseAdmin, hasSupabaseServiceRoleConfigured } from '../../lib/db.js'
import { requireApiAuth } from '../../lib/auth.js'
import {
  buildUserProfileSnapshot,
  buildSessionProfile,
  findAuthUserByEmail,
  listMembershipRowsForUtenteIds,
  normalizeEmail,
  normalizeRole,
  normalizeSocietaIds,
  readStudioUserByEmail,
  replaceUserMemberships,
  resolveProvisionedSocietaIds,
  syncAuthUserMetadata,
} from '../../lib/authMembership.js'
import { sanitizeUtenteProfile } from '../../src/shared/utils/userProfile.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 60,
}

function assertAdminStudioUserGuards(res, ctx, { existingRow = null, requestedRole = '' } = {}) {
  const managerRole = normalizeRole(ctx?.profile?.ruolo)
  if (managerRole !== 'admin') return true
  if (existingRow && normalizeRole(existingRow.ruolo) === 'owner') {
    res.status(403).json({ error: 'Non è consentito modificare l\'account Owner' })
    return false
  }
  if (normalizeRole(requestedRole) === 'owner') {
    res.status(403).json({ error: 'Solo l\'Owner può assegnare il ruolo Owner' })
    return false
  }
  return true
}

function assertServiceRoleForUserProvisioning(res) {
  if (hasSupabaseServiceRoleConfigured()) return true
  res.status(503).json({
    error:
      'Manca SUPABASE_SERVICE_ROLE_KEY sul server (es. Vercel). Senza service role non si possono creare utenti in Auth o aggiornare le membership nel database. Aggiungi la variabile d\'ambiente e rideploy.',
  })
  return false
}

function parsePermessiBody(raw) {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function normalizeUserPayload(body = {}) {
  const permessi = parsePermessiBody(body.permessi)
  const ruolo = String(body.ruolo || 'collaboratore').trim() || 'collaboratore'
  const soloClientiAssegnati = Boolean(permessi?.clienti?.solo_assegnati)
  let clienti_assegnati = Array.isArray(body.clienti_assegnati) ? body.clienti_assegnati : []
  if (normalizeRole(ruolo) === 'collaboratore' && !soloClientiAssegnati) {
    clienti_assegnati = []
  }
  return {
    nome: String(body.nome || '').trim(),
    cognome: String(body.cognome || '').trim(),
    email: normalizeEmail(body.email),
    ruolo,
    permessi,
    clienti_assegnati,
    societa_assegnate: Array.isArray(body.societa_assegnate) ? body.societa_assegnate : [],
    password: String(body.password || '').trim(),
    attivo: body.attivo !== false,
  }
}

function collaboratorSoloClientiSenzaSelezione(payload) {
  if (normalizeRole(payload.ruolo) !== 'collaboratore') return false
  if (!payload.permessi?.clienti?.solo_assegnati) return false
  return !Array.isArray(payload.clienti_assegnati) || payload.clienti_assegnati.length === 0
}

async function getUtenteByEmail(admin, email) {
  return readStudioUserByEmail(admin, email)
}

async function syncUserSocietaMembership(admin, { utenteId, authUserId, societaIds = [], ruolo = 'collaboratore' }) {
  return replaceUserMemberships(admin, {
    utenteId,
    authUserId,
    societaIds,
    ruolo,
  })
}

async function buildResponseUser(admin, row, authUser, societaIds) {
  await syncAuthUserMetadata(admin, {
    authUserId: authUser?.id || row?.auth_user_id,
    currentUser: authUser,
    profile: row,
  })
  const profile = await buildSessionProfile(admin, {
    authUser: {
      id: authUser?.id || row?.auth_user_id || '',
      email: authUser?.email || row?.email || '',
    },
  })
  const expectedSocietaIds = normalizeSocietaIds(societaIds)
  const resolvedSocietaIds = normalizeSocietaIds(profile?.societa_assegnate || [])
  if (!profile || resolvedSocietaIds.length === 0) {
    throw new Error('Profilo utente non operativo dopo provisioning')
  }
  if (
    expectedSocietaIds.length > 0
    && (
      resolvedSocietaIds.length !== expectedSocietaIds.length
      || expectedSocietaIds.some((id) => !resolvedSocietaIds.includes(id))
    )
  ) {
    throw new Error('Membership utente incoerente dopo provisioning')
  }
  if (!profile?.societa_default_id || !resolvedSocietaIds.includes(profile.societa_default_id)) {
    throw new Error('Societa default non valida dopo provisioning')
  }
  return sanitizeUtenteProfile(profile)
}

async function createAuthUser(admin, payload) {
  const { data, error } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      nome: payload.nome,
      cognome: payload.cognome,
      ruolo: payload.ruolo,
    },
  })
  if (error) throw error
  return data.user
}

async function updateAuthUser(admin, authUserId, payload, updatePassword) {
  const attributes = {
    email: payload.email,
    user_metadata: {
      nome: payload.nome,
      cognome: payload.cognome,
      ruolo: payload.ruolo,
    },
  }
  if (updatePassword) attributes.password = payload.password
  const { data, error } = await admin.auth.admin.updateUserById(authUserId, attributes)
  if (error) throw error
  return data.user
}

export default async function handler(req, res) {
  const ctx = await requireApiAuth(req, res, {
    methods: 'GET, POST, PATCH, DELETE, OPTIONS',
    roles: ['owner', 'admin'],
  })
  if (!ctx) return

  if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!assertServiceRoleForUserProvisioning(res)) return
  }

  const admin = await getSupabaseAdmin()
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}

  try {
    if (req.method === 'GET') {
      const { data, error } = await admin
        .from('utenti_studio')
        .select('id, auth_user_id, nome, cognome, email, ruolo, permessi, clienti_assegnati, attivo, created_at')
        .eq('attivo', true)
        .order('nome')
      if (error) throw error
      const studioUsers = Array.isArray(data) ? data : []
      const membershipRows = await listMembershipRowsForUtenteIds(admin, studioUsers.map((row) => row.id))
      const membershipsByUtenteId = new Map()
      for (const row of membershipRows) {
        const key = String(row?.utente_id || '').trim()
        if (!key) continue
        const list = membershipsByUtenteId.get(key) || []
        list.push(row)
        membershipsByUtenteId.set(key, list)
      }
      return res.status(200).json({
        ok: true,
        users: studioUsers.map((row) => sanitizeUtenteProfile(
          buildUserProfileSnapshot({
            profileRow: {
              ...row,
              ruolo: normalizeRole(row?.ruolo),
            },
            membershipRows: membershipsByUtenteId.get(String(row.id || '').trim()) || [],
          })
        )),
      })
    }

    if (req.method === 'POST') {
      const payload = normalizeUserPayload(body)
      if (!assertAdminStudioUserGuards(res, ctx, { requestedRole: payload.ruolo })) return
      if (!payload.nome || !payload.email || !payload.password) {
        return res.status(400).json({ error: 'Nome, email e password sono obbligatori' })
      }
      if (collaboratorSoloClientiSenzaSelezione(payload)) {
        return res.status(400).json({
          error: 'Con "Clienti solo assegnati" attivo seleziona almeno un cliente',
        })
      }
      const provisionedSocietaIds = await resolveProvisionedSocietaIds(admin, {
        requestedIds: payload.societa_assegnate,
        ruolo: payload.ruolo,
      })
      if (!provisionedSocietaIds.length) {
        return res.status(400).json({ error: 'Nessuna società attiva nello studio: crea almeno una società prima di aggiungere utenti' })
      }

      let authUser = await findAuthUserByEmail(admin, payload.email)
      let createdAuthUserId = ''
      if (authUser) {
        authUser = await updateAuthUser(admin, authUser.id, payload, true)
      } else {
        authUser = await createAuthUser(admin, payload)
        createdAuthUserId = authUser?.id || ''
      }

      try {
        const existing = await getUtenteByEmail(admin, payload.email)
        const upsertRow = {
          auth_user_id: authUser.id,
          nome: payload.nome,
          cognome: payload.cognome,
          email: payload.email,
          ruolo: payload.ruolo,
          permessi: payload.permessi,
          clienti_assegnati: payload.clienti_assegnati,
          attivo: payload.attivo,
          password_hash: null,
        }
        let data
        let error
        if (existing?.id) {
          ({ data, error } = await admin
            .from('utenti_studio')
            .update(upsertRow)
            .eq('id', existing.id)
            .select('*')
            .single())
        } else {
          ({ data, error } = await admin.from('utenti_studio').insert([upsertRow]).select('*').single())
        }
        if (error) throw error

        await syncUserSocietaMembership(admin, {
          utenteId: data.id,
          authUserId: authUser.id,
          societaIds: provisionedSocietaIds,
          ruolo: payload.ruolo,
        })
        const user = await buildResponseUser(admin, data, authUser, provisionedSocietaIds)
        return res.status(existing?.id ? 200 : 201).json({ ok: true, user })
      } catch (writeError) {
        if (createdAuthUserId) {
          await admin.auth.admin.deleteUser(createdAuthUserId).catch(() => null)
        }
        throw writeError
      }
    }

    if (req.method === 'PATCH') {
      const userId = String(body.id || '').trim()
      if (!userId) return res.status(400).json({ error: 'id obbligatorio' })
      const payload = normalizeUserPayload(body)
      const { data: existing, error: existingError } = await admin
        .from('utenti_studio')
        .select('id, auth_user_id, email, ruolo')
        .eq('id', userId)
        .maybeSingle()
      if (existingError) throw existingError
      if (!existing) return res.status(404).json({ error: 'Utente non trovato' })
      if (!assertAdminStudioUserGuards(res, ctx, { existingRow: existing, requestedRole: payload.ruolo })) return
      if (collaboratorSoloClientiSenzaSelezione(payload)) {
        return res.status(400).json({
          error: 'Con "Clienti solo assegnati" attivo seleziona almeno un cliente',
        })
      }
      const provisionedSocietaIds = await resolveProvisionedSocietaIds(admin, {
        requestedIds: payload.societa_assegnate,
        ruolo: payload.ruolo,
      })
      if (!provisionedSocietaIds.length) {
        return res.status(400).json({ error: 'Nessuna società attiva nello studio: crea almeno una società prima di aggiungere utenti' })
      }
      let authUser = null
      if (existing.auth_user_id) {
        authUser = await updateAuthUser(admin, existing.auth_user_id, payload, Boolean(payload.password))
      } else {
        authUser = await findAuthUserByEmail(admin, payload.email || existing.email)
        if (authUser) {
          authUser = await updateAuthUser(admin, authUser.id, payload, Boolean(payload.password))
        } else {
          if (!payload.password) {
            return res.status(400).json({
              error: 'Password obbligatoria per collegare un utente legacy senza auth user',
            })
          }
          authUser = await createAuthUser(admin, payload)
        }
      }
      const updateRow = {
        auth_user_id: authUser.id,
        nome: payload.nome,
        cognome: payload.cognome,
        email: payload.email,
        ruolo: payload.ruolo,
        permessi: payload.permessi,
        clienti_assegnati: payload.clienti_assegnati,
        attivo: payload.attivo,
        password_hash: null,
      }
      const { data, error } = await admin
        .from('utenti_studio')
        .update(updateRow)
        .eq('id', userId)
        .select('*')
        .single()
      if (error) throw error
      await syncUserSocietaMembership(admin, {
        utenteId: userId,
        authUserId: authUser.id,
        societaIds: provisionedSocietaIds,
        ruolo: payload.ruolo,
      })
      return res.status(200).json({
        ok: true,
        user: await buildResponseUser(admin, data, authUser, provisionedSocietaIds),
      })
    }

    if (req.method === 'DELETE') {
      const userId = String(body.id || '').trim()
      if (!userId) return res.status(400).json({ error: 'id obbligatorio' })
      const { data: existing, error: existingError } = await admin
        .from('utenti_studio')
        .select('id, auth_user_id, ruolo')
        .eq('id', userId)
        .maybeSingle()
      if (existingError) throw existingError
      if (!existing) return res.status(404).json({ error: 'Utente non trovato' })
      if (normalizeRole(existing.ruolo) === 'owner') {
        return res.status(403).json({ error: 'Owner non eliminabile' })
      }
      const { error } = await admin.from('utenti_studio').update({ attivo: false }).eq('id', userId)
      if (error) throw error
      if (existing.auth_user_id) {
        await admin.auth.admin.updateUserById(existing.auth_user_id, {
          ban_duration: '876000h',
        }).catch(() => null)
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    const detail = e?.details || e?.hint || ''
    console.error('[api/auth/users]', e?.message || e, detail || '')
    const msg = [e?.message, e?.code].filter(Boolean).join(' ')
    return res.status(500).json({ error: msg || String(e) })
  }
}
