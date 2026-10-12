/**
 * LAB-only DecisionFeedback HTTP facade (append + list).
 * Table: public.contabile_decision_feedback — service_role only; scoped by societa.
 */
import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin } from '../../lib/db.js'
import { scopedCompanyIds } from '../../lib/fiscalReadScope.js'
import { isIsolatedStudioEnvironment } from '../../lib/isolatedStudioLab.js'
import { buildDecisionFeedbackEvent } from '../../src/modules/contabilita/application/learning/buildDecisionFeedbackEvent.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SOURCE_MODULES = new Set([
  'import_contabilita',
  'registrazione_manual',
  'riconciliazione_bancaria',
])

function labEnabled() {
  return isIsolatedStudioEnvironment()
    && Boolean(String(process.env.VITE_SUPABASE_URL || '').trim())
    && String(process.env.FISCOSIM_DECISION_FEEDBACK_DB_LAB_ENABLED || '').trim() === 'true'
}

export function parseDecisionFeedbackListQuery(input = {}) {
  const societa_id = String(input.societa_id || input.societaId || '').trim()
  const source_module = String(input.source_module || input.sourceModule || '').trim()
  const limitRaw = Number(input.limit)
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200)
  if (!UUID.test(societa_id)) return null
  if (source_module && !SOURCE_MODULES.has(source_module)) return null
  return { societa_id, source_module: source_module || '', limit }
}

function mapDbRow(row = {}) {
  return buildDecisionFeedbackEvent({
    id: row.id,
    societaId: row.societa_id,
    studioId: row.studio_id,
    operatorAuthUserId: row.operator_auth_user_id,
    sourceModule: row.source_module,
    documentId: row.document_id,
    movementId: row.movement_id,
    primaNotaId: row.prima_nota_id,
    requestId: row.request_id,
    field: row.field,
    proposedValue: row.proposed_value,
    proposedSource: row.proposed_source,
    finalValue: row.final_value,
    wasOverridden: row.was_overridden,
    outcome: row.outcome,
    ruleVersion: row.rule_version,
    contextKey: row.context_key,
    amount: row.amount,
    counterpartyKey: row.counterparty_key,
    createdAt: row.created_at,
    committed: true,
    dryRun: false,
    storageKind: 'lab_db',
  })
}

function toInsertRow(event, operatorAuthUserId) {
  return {
    societa_id: event.societaId,
    studio_id: event.studioId || null,
    operator_auth_user_id: event.operatorAuthUserId || operatorAuthUserId || null,
    source_module: event.sourceModule,
    document_id: event.documentId || null,
    movement_id: event.movementId || null,
    prima_nota_id: UUID.test(String(event.primaNotaId || '')) ? event.primaNotaId : null,
    request_id: event.requestId || null,
    field: event.field,
    proposed_value: event.proposedValue || null,
    proposed_source: event.proposedSource || null,
    final_value: event.finalValue || null,
    was_overridden: Boolean(event.wasOverridden),
    outcome: event.outcome || 'confirmed',
    rule_version: event.ruleVersion || 'lab-db-v1',
    context_key: event.contextKey || '',
    amount: event.amount,
    counterparty_key: event.counterpartyKey || '',
  }
}

export default async function handler(req, res) {
  if (!labEnabled()) {
    return res.status(503).json({ error: 'DECISION_FEEDBACK_DB_LAB_ONLY_DISABLED' })
  }
  const ctx = await requireApiAuth(req, res, {
    methods: 'GET, POST, OPTIONS',
    roles: ['owner', 'admin'],
  })
  if (!ctx) return

  if (req.method === 'GET') {
    const plan = parseDecisionFeedbackListQuery(req.query || {})
    if (!plan) return res.status(400).json({ error: 'DECISION_FEEDBACK_QUERY_INVALID' })
    if (!scopedCompanyIds(ctx).includes(plan.societa_id)) {
      return res.status(403).json({ error: 'SOCIETA_NON_AUTORIZZATA' })
    }
    try {
      const db = await getSupabaseAdmin()
      let query = db
        .from('contabile_decision_feedback')
        .select([
          'id', 'societa_id', 'studio_id', 'operator_auth_user_id', 'source_module',
          'document_id', 'movement_id', 'prima_nota_id', 'request_id', 'field',
          'proposed_value', 'proposed_source', 'final_value', 'was_overridden',
          'outcome', 'rule_version', 'context_key', 'amount', 'counterparty_key', 'created_at',
        ].join(','))
        .eq('societa_id', plan.societa_id)
        .is('deactivated_at', null)
        .order('created_at', { ascending: false })
        .limit(plan.limit)
      if (plan.source_module) query = query.eq('source_module', plan.source_module)
      const { data, error } = await query
      if (error) throw error
      const rows = (Array.isArray(data) ? data : []).map(mapDbRow).filter(Boolean)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({
        ok: true,
        societa_id: plan.societa_id,
        source_module: plan.source_module || null,
        count: rows.length,
        rows,
      })
    } catch (error) {
      console.error('Decision feedback list rejected', { code: error?.code || 'UNKNOWN' })
      return res.status(503).json({ error: 'DECISION_FEEDBACK_UNAVAILABLE' })
    }
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const societa_id = String(body.societa_id || body.societaId || '').trim()
    if (!UUID.test(societa_id)) return res.status(400).json({ error: 'DECISION_FEEDBACK_BODY_INVALID' })
    if (!scopedCompanyIds(ctx).includes(societa_id)) {
      return res.status(403).json({ error: 'SOCIETA_NON_AUTORIZZATA' })
    }
    const rawEvents = Array.isArray(body.events) ? body.events : []
    if (!rawEvents.length) return res.status(400).json({ error: 'DECISION_FEEDBACK_EVENTS_REQUIRED' })

    const operatorId = String(ctx.user?.id || '').trim() || null
    const inserts = []
    for (const raw of rawEvents.slice(0, 50)) {
      const event = buildDecisionFeedbackEvent({
        ...raw,
        societaId: societa_id,
        committed: true,
        dryRun: false,
        operatorAuthUserId: raw.operatorAuthUserId || raw.operator_auth_user_id || operatorId,
      })
      if (!event) continue
      inserts.push(toInsertRow(event, operatorId))
    }
    if (!inserts.length) return res.status(400).json({ error: 'DECISION_FEEDBACK_EVENTS_INVALID' })

    try {
      const db = await getSupabaseAdmin()
      const { data, error } = await db
        .from('contabile_decision_feedback')
        .insert(inserts)
        .select('id, societa_id, field, request_id, prima_nota_id, created_at')
      if (error) {
        // Unique violation = idempotent success (append-only dedup)
        if (String(error.code || '') === '23505') {
          return res.status(200).json({ ok: true, inserted: 0, deduped: true })
        }
        throw error
      }
      res.setHeader('Cache-Control', 'no-store')
      return res.status(201).json({
        ok: true,
        inserted: Array.isArray(data) ? data.length : 0,
        rows: data || [],
      })
    } catch (error) {
      console.error('Decision feedback append rejected', { code: error?.code || 'UNKNOWN' })
      return res.status(503).json({ error: 'DECISION_FEEDBACK_UNAVAILABLE' })
    }
  }

  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
}
