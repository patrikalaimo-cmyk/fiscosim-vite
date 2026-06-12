import { sb } from './supabase'
import {
  authClientLog,
  authClientSpan,
  authClientWarn,
} from './authDebug.js'

const SESSION_PROFILE_TIMEOUT_MS = 6000
const ACCESS_TOKEN_CACHE_TTL_MS = 15000
let cachedAccessToken = ''
let cachedAccessTokenAt = 0
let inflightAccessTokenPromise = null

function isLocalHostLike() {
  if (typeof window === 'undefined') return false
  const host = String(window.location?.hostname || '').trim().toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function parseTruthyFlag(value) {
  const s = String(value || '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

export function isLocalAuthDisabled() {
  const isDev = Boolean(import.meta.env.DEV);
  const localHostLike = isLocalHostLike();
  const rawBypass = import.meta.env.VITE_DEV_LOCAL_AUTH_BYPASS;
  const parsedBypass = parseTruthyFlag(rawBypass);
  return Boolean(isDev && localHostLike && parsedBypass);
}

function clearAccessTokenCache() {
  cachedAccessToken = ''
  cachedAccessTokenAt = 0
  inflightAccessTokenPromise = null
}

function isSameOriginApiPath(url) {
  if (!url) return false
  if (typeof url === 'string') {
    return url.startsWith('/api/') || url.startsWith('/prima-nota/')
  }
  try {
    const parsed = new URL(String(url), globalThis?.location?.origin || 'http://localhost')
    const sameOrigin = !globalThis?.location || parsed.origin === globalThis.location.origin
    return sameOrigin && (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/prima-nota/'))
  } catch {
    return false
  }
}

export async function getAccessToken() {
  if (isLocalAuthDisabled()) return ''
  const span = authClientSpan('getAccessToken')
  const now = Date.now()
  if (cachedAccessToken && now - cachedAccessTokenAt < ACCESS_TOKEN_CACHE_TTL_MS) {
    span.end({ hasToken: true, cached: true })
    return cachedAccessToken
  }
  if (inflightAccessTokenPromise) {
    span.end({ hasToken: Boolean(cachedAccessToken), reusedInflight: true })
    return inflightAccessTokenPromise
  }

  const requestPromise = (async () => {
    const { data, error } = await sb.auth.getSession()
    if (error) {
      span.fail(error)
      throw error
    }
    const token = data?.session?.access_token || ''
    cachedAccessToken = token
    cachedAccessTokenAt = Date.now()
    span.end({ hasToken: Boolean(token) })
    return token
  })()

  inflightAccessTokenPromise = requestPromise.finally(() => {
    if (inflightAccessTokenPromise === requestPromise) {
      inflightAccessTokenPromise = null
    }
  })

  return inflightAccessTokenPromise
}

export async function apiFetch(input, init = {}) {
  const span = authClientSpan('apiFetch', {
    input: typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || ''),
    method: init?.method || (input instanceof Request ? input.method : 'GET'),
  })
  const headers = new Headers(init.headers || {})
  const token = await getAccessToken().catch(() => '')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  span.end({ hasToken: Boolean(token) })
  return fetch(input, { ...init, headers })
}

export async function signInWithPassword(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const span = authClientSpan('signInWithPassword', { email: normalizedEmail })
  try {
    const result = await sb.auth.signInWithPassword({
      email: normalizedEmail,
      password: String(password || ''),
    })
    if (result?.error) {
      span.fail(result.error, { email: normalizedEmail })
    } else {
      if (result?.data?.session?.access_token) {
        cachedAccessToken = result.data.session.access_token
        cachedAccessTokenAt = Date.now()
        inflightAccessTokenPromise = null
      } else {
        clearAccessTokenCache()
      }
      span.end({
        email: normalizedEmail,
        hasSession: Boolean(result?.data?.session),
        authUserId: result?.data?.user?.id || null,
      })
    }
    return result
  } catch (error) {
    span.fail(error, { email: normalizedEmail })
    throw error
  }
}

export async function signOutSession() {
  const span = authClientSpan('signOutSession')
  try {
    clearAccessTokenCache()
    const result = await sb.auth.signOut()
    if (result?.error) {
      span.fail(result.error)
    } else {
      span.end()
    }
    return result
  } catch (error) {
    span.fail(error)
    throw error
  }
}

function normalizeSocietaIds(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  )
}

function hasOperationalScope(profile = null) {
  const societaAssegnate = normalizeSocietaIds(profile?.societa_assegnate || [])
  const societaDefaultId = String(profile?.societa_default_id || '').trim()
  return societaAssegnate.length > 0 && societaAssegnate.includes(societaDefaultId)
}

export async function fetchSessionProfile(accessToken = '') {
  const span = authClientSpan('fetchSessionProfile', {
    hasAccessToken: Boolean(accessToken),
    timeout_ms: SESSION_PROFILE_TIMEOUT_MS,
  })
  const headers = new Headers()
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), SESSION_PROFILE_TIMEOUT_MS)
    : null

  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      headers,
      signal: controller?.signal,
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = new Error(payload?.message || payload?.error || 'Sessione non valida')
      span.fail(error, {
        status: res.status,
        responseError: payload?.error || null,
      })
      throw error
    }
    const profile = payload?.user || null
    if (!profile || !hasOperationalScope(profile)) {
      const error = new Error('Profilo utente incompleto: manca una societa predefinita valida.')
      span.fail(error, {
        status: res.status,
        hasProfile: Boolean(profile),
        societaCount: normalizeSocietaIds(profile?.societa_assegnate || []).length,
        societaDefaultId: profile?.societa_default_id || null,
      })
      throw error
    }
    span.end({
      status: res.status,
      profileId: profile?.id || null,
      ruolo: profile?.ruolo || null,
      societaCount: normalizeSocietaIds(profile?.societa_assegnate || []).length,
      societaDefaultId: profile?.societa_default_id || null,
    })
    return profile
  } catch (error) {
    const message = String(error?.message || error || '')
    if (String(error?.name || '') === 'AbortError' || /timeout|abort/i.test(message)) {
      authClientWarn('fetchSessionProfile:timeout', {
        timeout_ms: SESSION_PROFILE_TIMEOUT_MS,
      })
      const timeoutError = new Error('Timeout caricamento profilo utente.')
      span.fail(timeoutError, { timeout_ms: SESSION_PROFILE_TIMEOUT_MS })
      throw timeoutError
    }
    if (!/Profilo utente incompleto|Sessione non valida/.test(message)) {
      span.fail(error)
    }
    throw error
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
  }
}

export function installApiAuthFetchInterceptor() {
  if (typeof window === 'undefined' || window.__fiscosimAuthFetchInstalled || isLocalAuthDisabled()) return
  authClientLog('installApiAuthFetchInterceptor', { installed: true })
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof Request
        ? input.url
        : String(input || '')

    if (!isSameOriginApiPath(requestUrl)) {
      return nativeFetch(input, init)
    }

    authClientLog('authFetchInterceptor:intercept', {
      url: requestUrl,
      method: init?.method || (input instanceof Request ? input.method : 'GET'),
    })

    const token = await getAccessToken().catch(() => '')
    if (!token) {
      authClientWarn('authFetchInterceptor:no-token', { url: requestUrl })
      return nativeFetch(input, init)
    }

    const headers = new Headers(input instanceof Request ? input.headers : init.headers || {})
    headers.set('Authorization', `Bearer ${token}`)

    if (input instanceof Request) {
      const nextRequest = new Request(input, {
        headers,
      })
      return nativeFetch(nextRequest)
    }

    return nativeFetch(input, {
      ...init,
      headers,
    })
  }
  window.__fiscosimAuthFetchInstalled = true
}
