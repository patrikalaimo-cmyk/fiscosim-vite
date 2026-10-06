import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from './db.js'
import { authServerSpan, authServerWarn } from './authDebug.js'
import {
  buildSessionProfile,
  normalizeSocietaIds,
} from './authMembership.js'
function firstAuthHeader(value) {
  if (!value || typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed.toLowerCase().startsWith('bearer ')) return ''
  return trimmed.slice(7).trim()
}

function getAllowedOrigins() {
  return String(process.env.APP_ALLOWED_ORIGINS || process.env.VITE_APP_ORIGIN || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

export function applyCors(req, res, { methods = 'GET, POST, OPTIONS' } = {}) {
  const allowedOrigins = getAllowedOrigins()
  const origin = req.headers.origin || ''
  const allowOrigin =
    allowedOrigins.length === 0
      ? origin || '*'
      : allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0]

  res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

export async function getUserFromRequest(req) {
  const span = authServerSpan('getUserFromRequest', {
    hasAuthorizationHeader: Boolean(req?.headers?.authorization),
  })
  const token = firstAuthHeader(req.headers.authorization || '')
  if (!token) {
    const error = new Error('Missing bearer token')
    span.fail(error)
    return { user: null, token: '', error }
  }

  const admin = await getSupabaseAdmin()
  const { data, error } = await admin.auth.getUser(token)
  if (error) {
    span.fail(error)
  } else {
    span.end({
      authUserId: data?.user?.id || null,
      email: data?.user?.email || null,
    })
  }
  return { user: data?.user || null, token, error: error || null }
}

function hasServiceRoleConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY)
}

async function getSessionProfileReader(token = '') {
  if (hasServiceRoleConfigured()) {
    return getSupabaseAdmin()
  }
  authServerWarn('auth:getSessionProfileReader:fallback-user-scoped', {
    hasServiceRole: false,
  })
  return createUserScopedServerClient(token)
}

export function isOperationalProfile(profile = null) {
  const societaAssegnate = normalizeSocietaIds(profile?.societa_assegnate || [])
  const societaDefaultId = String(profile?.societa_default_id || '').trim()
  return societaAssegnate.length > 0 && societaAssegnate.includes(societaDefaultId)
}

export async function getAuthenticatedContext(req) {
  const span = authServerSpan('getAuthenticatedContext', {
    method: req?.method || 'GET',
    url: req?.url || req?.headers?.host || 'unknown',
  })
  const { user, token, error } = await getUserFromRequest(req)
  if (error || !user) {
    const nextError = error || new Error('Unauthorized')
    span.fail(nextError, { stage: 'getUserFromRequest' })
    return { user: null, token: '', profile: null, error: nextError }
  }

  let profile = null
  try {
    const profileReader = await getSessionProfileReader(token)
    profile = await buildSessionProfile(profileReader, { authUser: user })
  } catch (sessionProfileError) {
    span.fail(sessionProfileError, { stage: 'buildSessionProfile', authUserId: user.id })
    return { user, token, profile: null, error: sessionProfileError }
  }

  if (!profile) {
    const nextError = new Error('Profilo utente non trovato')
    span.fail(nextError, { stage: 'buildSessionProfile', authUserId: user.id })
    return { user, token, profile: null, error: nextError }
  }

  const ctx = {
    user,
    token,
    profile,
    error: null,
  }
  span.end({
    authUserId: user.id,
    profileId: ctx.profile?.id || null,
    societaCount: Array.isArray(ctx.profile?.societa_assegnate) ? ctx.profile.societa_assegnate.length : 0,
    societaDefaultId: ctx.profile?.societa_default_id || null,
  })
  return ctx
}

export async function requireApiAuth(req, res, options = {}) {
  const span = authServerSpan('requireApiAuth', {
    method: req?.method || 'GET',
    url: req?.url || req?.headers?.host || 'unknown',
  })
  const {
    methods = 'GET, POST, OPTIONS',
    roles = [],
  } = options

  applyCors(req, res, { methods })

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    span.end({ outcome: 'options-preflight' })
    return null
  }

  const ctx = await getAuthenticatedContext(req)
  if (ctx.error || !ctx.profile) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: ctx.error?.message || 'Authentication required',
    })
    span.fail(ctx.error || new Error('Authentication required'), { outcome: 'unauthorized' })
    return null
  }

  if (roles.length > 0 && !roles.includes(ctx.profile.ruolo)) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Permessi insufficienti',
    })
    span.fail(new Error('Permessi insufficienti'), {
      outcome: 'forbidden',
      ruolo: ctx.profile?.ruolo || null,
    })
    return null
  }

  span.end({
    outcome: 'authorized',
    profileId: ctx.profile?.id || null,
    ruolo: ctx.profile?.ruolo || null,
  })
  return ctx
}

export function createUserScopedServerClient(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY mancanti')
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })
}
