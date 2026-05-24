const AUTH_DEBUG_ENABLED = true

function nowIso() {
  return new Date().toISOString()
}

function nowMs() {
  return Date.now()
}

function emit(level, event, payload = {}) {
  if (!AUTH_DEBUG_ENABLED) return
  const logger =
    level === 'warn' ? console.warn
    : level === 'error' ? console.error
    : console.log
  logger(`[auth][server][${nowIso()}] ${event}`, payload)
}

export function authServerLog(event, payload = {}) {
  emit('log', event, payload)
}

export function authServerWarn(event, payload = {}) {
  emit('warn', event, payload)
}

export function authServerError(event, payload = {}) {
  emit('error', event, payload)
}

export function authServerSpan(event, payload = {}) {
  const startedAt = nowIso()
  const startedMs = nowMs()
  authServerLog(`${event}:start`, { startedAt, ...payload })
  return {
    end(extra = {}) {
      authServerLog(`${event}:end`, {
        startedAt,
        finishedAt: nowIso(),
        duration_ms: Math.max(0, nowMs() - startedMs),
        ...extra,
      })
    },
    fail(error, extra = {}) {
      authServerError(`${event}:fail`, {
        startedAt,
        finishedAt: nowIso(),
        duration_ms: Math.max(0, nowMs() - startedMs),
        error: error?.message || String(error || ''),
        ...extra,
      })
    },
    warn(message, extra = {}) {
      authServerWarn(`${event}:warn`, {
        startedAt,
        duration_ms: Math.max(0, nowMs() - startedMs),
        message,
        ...extra,
      })
    },
  }
}
