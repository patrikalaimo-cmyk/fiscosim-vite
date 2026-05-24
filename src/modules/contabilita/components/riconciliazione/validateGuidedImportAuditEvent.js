import {
  GUIDED_IMPORT_AUDIT_CRITICAL_MANUAL_REASON_FIELDS,
  GUIDED_IMPORT_AUDIT_FIELD_EVENT_TYPES,
  GUIDED_IMPORT_AUDIT_EVENT_SOURCE_SET,
  GUIDED_IMPORT_AUDIT_EVENT_SOURCES,
  GUIDED_IMPORT_AUDIT_EVENT_TYPE_SET,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES,
  GUIDED_IMPORT_AUDIT_FIELD_ID_SET,
} from './guidedImportAuditEventTypes.js'

const TEMPLATE_DECISION_EVENTS_REQUIRING_DRY_RUN_REF = new Set([
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_DECISION_SET,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_SAVED,
])

function addBlocker(blockers, code, message) {
  blockers.push({ code, message })
}

function addWarning(warnings, code, message) {
  warnings.push({ code, message })
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateGuidedImportAuditEvent(event) {
  const warnings = []
  const blockers = []

  if (!event || typeof event !== 'object') {
    addBlocker(blockers, 'invalid_event', 'Evento assente o non oggetto')
    return { valid: false, warnings, blockers }
  }

  const eventId = String(event.eventId || '').trim()
  const eventType = String(event.eventType || '').trim()
  const auditId = String(event.auditId || '').trim()
  const timestamp = String(event.timestamp || '').trim()
  const source = String(event.source || '').trim()
  const payload = event.payload

  if (!eventId) addBlocker(blockers, 'missing_event_id', 'eventId obbligatorio')
  if (!eventType) addBlocker(blockers, 'missing_event_type', 'eventType obbligatorio')
  if (eventType && !GUIDED_IMPORT_AUDIT_EVENT_TYPE_SET.has(eventType)) {
    addBlocker(blockers, 'unknown_event_type', `eventType non supportato: ${eventType}`)
  }
  if (!auditId) addBlocker(blockers, 'missing_audit_id', 'auditId obbligatorio')
  if (!timestamp) addBlocker(blockers, 'missing_timestamp', 'timestamp obbligatorio')
  if (!source) {
    addBlocker(blockers, 'missing_source', 'source obbligatorio')
  } else if (!GUIDED_IMPORT_AUDIT_EVENT_SOURCE_SET.has(source)) {
    addBlocker(blockers, 'invalid_source', `source non ammesso: ${source}`)
  }
  if (!isObject(payload)) addBlocker(blockers, 'invalid_payload', 'payload deve essere un oggetto')

  if (GUIDED_IMPORT_AUDIT_FIELD_EVENT_TYPES.has(eventType)) {
    const fieldId = String(payload?.fieldId || '').trim()
    if (!fieldId) {
      addBlocker(blockers, 'missing_field_id', 'fieldId obbligatorio per eventi document_field_*')
    } else if (!GUIDED_IMPORT_AUDIT_FIELD_ID_SET.has(fieldId)) {
      addBlocker(blockers, 'invalid_field_id', `fieldId non supportato: ${fieldId}`)
    }
  }

  if (eventType === GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_SELECTED_FROM_ROW) {
    const selectedRowId = String(payload?.selectedRowId || '').trim()
    const rawText = String(payload?.rawText || '').trim()
    if (!selectedRowId) addBlocker(blockers, 'missing_selected_row', 'selectedRowId obbligatorio per selected_from_row')
    if (!rawText) addBlocker(blockers, 'missing_raw_text', 'rawText obbligatorio per selected_from_row')
  }

  if (eventType === GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MANUAL_CHANGED) {
    const fieldId = String(payload?.fieldId || '').trim()
    const reason = String(payload?.reason || '').trim()
    if (GUIDED_IMPORT_AUDIT_CRITICAL_MANUAL_REASON_FIELDS.has(fieldId) && !reason) {
      addBlocker(blockers, 'missing_reason_critical_manual', `reason obbligatoria per modifica manuale del campo critico ${fieldId}`)
    }
  }

  if (eventType === GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_SAVED) {
    if (source === GUIDED_IMPORT_AUDIT_EVENT_SOURCES.AI_SUGGESTION) {
      addBlocker(blockers, 'ai_cannot_save_template', 'source ai_suggestion non puo salvare template')
    }
    if (payload?.operatorConfirmed !== true) {
      addBlocker(blockers, 'operator_confirmation_required', 'operatorConfirmed=true obbligatorio per template_saved')
    }
  }

  if (TEMPLATE_DECISION_EVENTS_REQUIRING_DRY_RUN_REF.has(eventType)) {
    const dryRunAuditRef = String(payload?.dryRunAuditRef || '').trim()
    if (!dryRunAuditRef) {
      addWarning(warnings, 'missing_dry_run_ref', `${eventType}: dryRunAuditRef assente`)
    }
  }

  return {
    valid: blockers.length === 0,
    warnings,
    blockers,
  }
}

export default validateGuidedImportAuditEvent
