import { isOperationalProfile, requireApiAuth } from '../../lib/auth.js'
import { authServerLog, authServerSpan, authServerWarn } from '../../lib/authDebug.js'
import { sanitizeUtenteProfile } from '../../src/shared/utils/userProfile.js'

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
}

export default async function handler(req, res) {
  const span = authServerSpan('api.auth.session', {
    method: req?.method || 'GET',
    url: req?.url || '/api/auth/session',
  })
  const ctx = await requireApiAuth(req, res, { methods: 'GET, OPTIONS' })
  if (!ctx) {
    span.end({ outcome: 'requireApiAuth-returned-null' })
    return
  }
  if (req.method !== 'GET') {
    authServerWarn('api.auth.session:method-not-allowed', { method: req.method })
    span.fail(new Error('Method not allowed'), { status: 405 })
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isOperationalProfile(ctx.profile)) {
    authServerWarn('api.auth.session:profile-incomplete', {
      profileId: ctx.profile?.id || null,
      societaCount: Array.isArray(ctx.profile?.societa_assegnate) ? ctx.profile.societa_assegnate.length : 0,
      societaDefaultId: ctx.profile?.societa_default_id || null,
    })
    span.fail(new Error('PROFILE_INCOMPLETE'), { status: 409, profileId: ctx.profile?.id || null })
    return res.status(409).json({
      error: 'PROFILE_INCOMPLETE',
      message: 'Profilo utente incompleto: manca una societa predefinita valida. Contatta l’amministratore.',
    })
  }

  const safeUser = sanitizeUtenteProfile({
    ...ctx.profile,
    auth_email: ctx.user?.email || null,
  })
  authServerLog('api.auth.session:response', {
    status: 200,
    profileId: safeUser?.id || null,
    ruolo: safeUser?.ruolo || null,
    societaCount: Array.isArray(safeUser?.societa_assegnate) ? safeUser.societa_assegnate.length : 0,
    societaDefaultId: safeUser?.societa_default_id || null,
  })
  span.end({
    status: 200,
    profileId: safeUser?.id || null,
  })
  return res.status(200).json({
    ok: true,
    user: safeUser,
  })
}
