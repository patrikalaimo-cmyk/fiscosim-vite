const AUTH_DEBUG_ENABLED = true

function nowIso() {
  return new Date().toISOString()
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function emit(level, event, payload = {}) {
  if (!AUTH_DEBUG_ENABLED) return
  const logger =
    level === 'warn' ? console.warn
    : level === 'error' ? console.error
    : console.log
  logger(`[auth][client][${nowIso()}] ${event}`, payload)
}

export function authClientLog(event, payload = {}) {
  emit('log', event, payload)
}

export function authClientWarn(event, payload = {}) {
  emit('warn', event, payload)
}

export function authClientError(event, payload = {}) {
  emit('error', event, payload)
}

export function authClientSpan(event, payload = {}) {
  const startedAt = nowIso()
  const startedMs = nowMs()
  authClientLog(`${event}:start`, { startedAt, ...payload })
  return {
    end(extra = {}) {
      authClientLog(`${event}:end`, {
        startedAt,
        finishedAt: nowIso(),
        duration_ms: Math.round(nowMs() - startedMs),
        ...extra,
      })
    },
    fail(error, extra = {}) {
      authClientError(`${event}:fail`, {
        startedAt,
        finishedAt: nowIso(),
        duration_ms: Math.round(nowMs() - startedMs),
        error: error?.message || String(error || ''),
        ...extra,
      })
    },
    warn(message, extra = {}) {
      authClientWarn(`${event}:warn`, {
        startedAt,
        duration_ms: Math.round(nowMs() - startedMs),
        message,
        ...extra,
      })
    },
  }
}
