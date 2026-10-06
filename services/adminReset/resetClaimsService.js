import {
  hasBlockingRegisteredState,
  getZombieLockAnalysis,
  isDocumentAccountingFinalized,
  isWorkflowResettable,
} from './resetSafetyGuards.js'
import {
  buildResult,
  normalizeId,
  pickDocumentResetBaseWorkflow,
} from './resetUtils.js'

function buildClaimResetDecision(row, { nowMs = Date.now(), scopeType = 'company' } = {}) {
  const workflowStatus = normalizeId(row?.workflow_status).toLowerCase()
  const hasLock = Boolean(row?.locked_by || row?.locked_at)
  const zombieLock = getZombieLockAnalysis(row, { nowMs })
  const finalized = isDocumentAccountingFinalized(row)
  const zombieReasonSuffix = zombieLock.isZombie
    ? ` (${zombieLock.previewReason}; soglia ${zombieLock.lockKind === 'registration' ? 'registrazione' : 'editing'} ${zombieLock.thresholdMs} ms)`
    : ''

  if (finalized) {
    if (!hasLock) {
      return {
        decision: 'skip',
        reason: 'already_finalized',
        patch: null,
        message: 'Documento con collegamento contabile valido: nessun reset necessario.',
        zombie: zombieLock,
      }
    }
    return {
      decision: 'touch',
      reason: 'finalized_clear_lock_only',
      patch: { locked_by: null, locked_at: null },
      message: `Documento contabilizzato: verranno liberati solo i lock incoerenti${zombieReasonSuffix}.`,
      zombie: zombieLock,
    }
  }

  if (workflowStatus === 'registering' && zombieLock.isZombie) {
    return {
      decision: 'touch',
      reason: 'zombie_registering_claim',
      patch: {
        workflow_status: pickDocumentResetBaseWorkflow(row),
        locked_by: null,
        locked_at: null,
      },
      message: `Claim zombie: reset a stato coerente con lock ripulito${zombieReasonSuffix}.`,
      zombie: zombieLock,
    }
  }

  if (scopeType === 'document' && workflowStatus === 'registering' && !hasBlockingRegisteredState(row)) {
    return {
      decision: 'touch',
      reason: 'manual_registering_claim_reset',
      patch: {
        workflow_status: pickDocumentResetBaseWorkflow(row),
        locked_by: null,
        locked_at: null,
      },
      message: 'Documento selezionato in registrazione senza finalizzazione contabile: reset manuale del claim consentito in v1.',
      zombie: zombieLock,
    }
  }

  if (workflowStatus === 'registering' && !hasBlockingRegisteredState(row)) {
    return {
      decision: 'touch',
      reason: 'test_registering_claim_reset',
      patch: {
        workflow_status: pickDocumentResetBaseWorkflow(row),
        locked_by: null,
        locked_at: null,
      },
      message: 'Documento in registering non finalizzato: reset claim consentito in fase test.',
      zombie: zombieLock,
    }
  }

  if (zombieLock.isZombie) {
    return {
      decision: 'touch',
      reason: 'zombie_lock_only',
      patch: { locked_by: null, locked_at: null },
      message: `Lock zombie: verrà ripulito senza toccare la contabilità${zombieReasonSuffix}.`,
      zombie: zombieLock,
    }
  }

  const validationStatus = normalizeId(row?.validation_status).toLowerCase()
  const workflowResetRecommended = !finalized && (
    workflowStatus === 'error' ||
    (workflowStatus === 'pending' && validationStatus === 'confirmed')
  )
  if (workflowResetRecommended && isWorkflowResettable(row)) {
    return {
      decision: 'skip',
      reason: 'workflow_reset_recommended',
      patch: null,
      recommended_action: 'reset_document_workflow',
      message: 'Nessun claim/lock da ripulire: il documento risulta in workflow tecnico incoerente. Usa reset workflow documento.',
      zombie: zombieLock,
    }
  }

  return {
    decision: 'skip',
    reason: 'nothing_to_reset',
    patch: null,
    message: 'Nessun claim/lock incoerente rilevato.',
    zombie: zombieLock,
  }
}

export function buildResetDocumentClaimsPlan(rows = [], { nowMs = Date.now(), scopeType = 'company' } = {}) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const plan = buildClaimResetDecision(row, { nowMs, scopeType })
    return {
      id: row?.id || null,
      societa_id: row?.societa_id || null,
      numero_documento: row?.numero_documento || null,
      soggetto_denominazione: row?.soggetto_denominazione || null,
      workflow_status: row?.workflow_status || null,
      validation_status: row?.validation_status || null,
      validated_at: row?.validated_at || null,
      locked_by: row?.locked_by || null,
      locked_at: row?.locked_at || null,
      prima_nota_id: row?.prima_nota_id || null,
      registered_at: row?.registered_at || null,
      zombie_lock: Boolean(plan?.zombie?.isZombie),
      zombie_reason: plan?.zombie?.reason || null,
      zombie_preview_reason: plan?.zombie?.previewReason || null,
      zombie_lock_kind: plan?.zombie?.lockKind || null,
      zombie_threshold_ms: plan?.zombie?.thresholdMs ?? null,
      zombie_age_ms: plan?.zombie?.ageMs ?? null,
      ...plan,
    }
  })
}

async function loadTargetDocuments(db, { scopeType, scopeId = '', societaId = '' }) {
  const select = 'id,societa_id,numero_documento,soggetto_denominazione,workflow_status,validation_status,validated_at,locked_by,locked_at,prima_nota_id,registered_at'
  if (scopeType === 'document') {
    let query = db.from('documenti_contabilita').select(select).eq('id', scopeId).limit(1)
    if (societaId) query = query.eq('societa_id', societaId)
    const res = await query
    return { data: res?.data ? [res.data].flat().filter(Boolean) : [], error: res?.error || null }
  }

  let query = db.from('documenti_contabilita').select(select).eq('societa_id', societaId).limit(500)
  const res = await query.order('created_at', { ascending: false })
  return { data: Array.isArray(res?.data) ? res.data : [], error: res?.error || null }
}

export async function runResetDocumentClaims({
  db,
  dryRun,
  scopeType,
  scopeId = '',
  societaId = '',
  nowMs = Date.now(),
}) {
  const targetRowsRes = await loadTargetDocuments(db, { scopeType, scopeId, societaId })
  if (targetRowsRes?.error) throw targetRowsRes.error

  const plan = buildResetDocumentClaimsPlan(targetRowsRes.data || [], { nowMs, scopeType })
  const resettable = plan.filter((item) => item.decision === 'touch')
  const workflowRecommended = plan.filter((item) => item.reason === 'workflow_reset_recommended')

  if (!dryRun) {
    for (const item of resettable) {
      const { error } = await db
        .from('documenti_contabilita')
        .update(item.patch)
        .eq('id', item.id)
        .eq('societa_id', item.societa_id)
      if (error) throw error
    }
  }

  const status = dryRun ? 'preview' : 'completed'
  const summary = resettable.length > 0
    ? `${dryRun ? 'Preview' : 'Eseguito'} reset claim/lock su ${resettable.length} documenti.`
    : workflowRecommended.length > 0
      ? `Nessun claim/lock incoerente. ${workflowRecommended.length} documento/i richiedono reset workflow tecnico.`
      : 'Nessun claim/lock incoerente da resettare.'

  return buildResult({
    action: 'reset_document_claims',
    dryRun,
    scopeType,
    scopeId,
    societaId,
    status,
    summary,
    items: plan,
    notes: [
      'Il reset claim/lock non modifica prima_nota, prima_nota_righe o partitario.',
      'Se il documento ha contabilità valida collegata, in v1 vengono liberati solo lock incoerenti.',
      ...(workflowRecommended.length > 0
        ? ['Per i casi workflow_reset_recommended usa reset_document_workflow sul documento selezionato.']
        : []),
    ],
  })
}
