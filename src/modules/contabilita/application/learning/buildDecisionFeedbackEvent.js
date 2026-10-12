/**
 * SG-L2 DecisionFeedback — event builder (LAB localStorage interim; no DB schema).
 * Contract aligned with REPORT/ARCHITETTURA_LEARNING_ENGINE.md §4.1
 */

function text(value) {
  return String(value ?? '').trim()
}

function money(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

const SOURCE_MODULES = new Set([
  'import_contabilita',
  'registrazione_manual',
  'riconciliazione_bancaria',
])

const OUTCOMES = new Set(['confirmed', 'cancelled', 'reversed'])

/**
 * @returns {object|null} normalized event or null if not appendable
 */
export function buildDecisionFeedbackEvent(raw = {}) {
  const societaId = text(raw.societaId || raw.societa_id)
  const sourceModule = text(raw.sourceModule || raw.source_module)
  const field = text(raw.field)
  const outcome = text(raw.outcome) || 'confirmed'
  const requestId = text(raw.requestId || raw.request_id)
  const primaNotaId = text(raw.primaNotaId || raw.prima_nota_id)
  const documentId = text(raw.documentId || raw.document_id)
  const movementId = text(raw.movementId || raw.movement_id)

  if (!societaId || !SOURCE_MODULES.has(sourceModule) || !field) return null
  if (!OUTCOMES.has(outcome)) return null
  // Only learn from durable outcomes with an identity anchor.
  if (!requestId && !primaNotaId && !documentId && !movementId) return null
  // Never learn from dry-run / failed commits.
  if (raw.dryRun === true) return null
  if (raw.committed === false) return null

  const proposedValue = text(raw.proposedValue ?? raw.proposed_value)
  const finalValue = text(raw.finalValue ?? raw.final_value)
  const wasOverridden = Boolean(
    raw.wasOverridden
      ?? raw.was_overridden
      ?? (proposedValue && finalValue && proposedValue !== finalValue),
  )

  return {
    id: text(raw.id) || `dfb-${societaId}-${sourceModule}-${field}-${requestId || primaNotaId || movementId || documentId}`,
    societaId,
    studioId: text(raw.studioId || raw.studio_id) || null,
    operatorAuthUserId: text(raw.operatorAuthUserId || raw.operator_auth_user_id) || null,
    sourceModule,
    documentId: documentId || null,
    movementId: movementId || null,
    primaNotaId: primaNotaId || null,
    requestId: requestId || null,
    field,
    proposedValue: proposedValue || null,
    proposedSource: text(raw.proposedSource || raw.proposed_source) || null,
    finalValue: finalValue || null,
    wasOverridden,
    outcome,
    ruleVersion: text(raw.ruleVersion || raw.rule_version) || 'lab-local-v1',
    contextKey: text(raw.contextKey || raw.context_key) || '',
    amount: money(raw.amount),
    counterpartyKey: text(raw.counterpartyKey || raw.counterparty_key) || '',
    createdAt: text(raw.createdAt || raw.created_at) || new Date().toISOString(),
    storageKind: 'lab_localstorage',
  }
}

export function decisionFeedbackDedupKey(event = {}) {
  const societaId = text(event.societaId)
  const field = text(event.field)
  const anchor = text(event.requestId) || text(event.primaNotaId) || text(event.movementId) || text(event.documentId)
  return `${societaId}|${anchor}|${field}`
}
