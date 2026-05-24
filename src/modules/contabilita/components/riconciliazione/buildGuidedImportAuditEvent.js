import {
  GUIDED_IMPORT_AUDIT_EVENT_SOURCE_VALUES,
  GUIDED_IMPORT_AUDIT_EVENT_SOURCES,
  GUIDED_IMPORT_AUDIT_EVENT_TYPE_SET,
} from './guidedImportAuditEventTypes.js'

let localSequence = 0

function sanitizeArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item != null)
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function buildGuidedImportAuditEvent(input = {}) {
  const now = input.timestamp ? new Date(input.timestamp) : new Date()
  const timestamp = Number.isNaN(now.getTime()) ? new Date().toISOString() : now.toISOString()

  localSequence += 1

  const eventType = String(input.eventType || '').trim()
  const hasKnownEventType = GUIDED_IMPORT_AUDIT_EVENT_TYPE_SET.has(eventType)
  const sourceCandidate = String(input.source || '').trim()
  const source = GUIDED_IMPORT_AUDIT_EVENT_SOURCE_VALUES.includes(sourceCandidate)
    ? sourceCandidate
    : GUIDED_IMPORT_AUDIT_EVENT_SOURCES.SYSTEM

  const eventId = String(input.eventId || '').trim() || `${eventType || 'unknown_event'}-${Date.parse(timestamp)}-${localSequence}`

  const payload = isObject(input.payload) ? { ...input.payload } : {}
  const warnings = sanitizeArray(input.warnings)
  const blockers = sanitizeArray(input.blockers)

  if (!hasKnownEventType) {
    blockers.push({
      code: 'unknown_event_type',
      message: `eventType non supportato: ${eventType || '(vuoto)'}`,
    })
  }

  return {
    eventId,
    eventType,
    auditId: String(input.auditId || '').trim(),
    importId: String(input.importId || '').trim(),
    sourceFileName: String(input.sourceFileName || '').trim(),
    profileCandidate: String(input.profileCandidate || '').trim(),
    timestamp,
    operatorId: String(input.operatorId || '').trim(),
    source,
    payload,
    previousStateSnapshot: isObject(input.previousStateSnapshot) ? { ...input.previousStateSnapshot } : null,
    resultingStateSnapshot: isObject(input.resultingStateSnapshot) ? { ...input.resultingStateSnapshot } : null,
    warnings,
    blockers,
  }
}

export default buildGuidedImportAuditEvent
