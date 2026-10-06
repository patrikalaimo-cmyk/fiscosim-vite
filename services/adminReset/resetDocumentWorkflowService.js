import { hasBlockingRegisteredState, isWorkflowResettable } from './resetSafetyGuards.js'
import { buildResult } from './resetUtils.js'
import { pickDocumentResetBaseWorkflow } from './resetUtils.js'

export async function runResetDocumentWorkflow({
  db,
  dryRun,
  scopeId = '',
  societaId = '',
}) {
  let query = db
    .from('documenti_contabilita')
    .select('id,societa_id,numero_documento,soggetto_denominazione,workflow_status,validation_status,locked_by,locked_at,prima_nota_id,registered_at')
    .eq('id', scopeId)
    .limit(1)
  if (societaId) query = query.eq('societa_id', societaId)
  const { data, error } = await query
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : null
  const items = row
    ? (() => {
        const finalized = hasBlockingRegisteredState(row)
        const resettable = isWorkflowResettable(row)
        const targetWorkflowStatus = pickDocumentResetBaseWorkflow(row)
        const patch = {}
        if (!finalized && resettable) {
          if (String(row?.workflow_status || '') !== String(targetWorkflowStatus)) {
            patch.workflow_status = targetWorkflowStatus
          }
          if (row?.locked_by) patch.locked_by = null
          if (row?.locked_at) patch.locked_at = null
        }
        const hasPatch = Object.keys(patch).length > 0
        return [{
          id: row.id,
          societa_id: row.societa_id || null,
          numero_documento: row.numero_documento || null,
          soggetto_denominazione: row.soggetto_denominazione || null,
          workflow_status: row.workflow_status || null,
          validation_status: row.validation_status || null,
          locked_by: row.locked_by || null,
          locked_at: row.locked_at || null,
          prima_nota_id: row.prima_nota_id || null,
          registered_at: row.registered_at || null,
          decision: finalized ? 'block' : resettable && hasPatch ? 'touch' : 'skip',
          reason: finalized ? 'accounting_finalized' : resettable && hasPatch ? 'workflow_resettable' : 'workflow_already_coherent',
          patch: hasPatch ? patch : null,
          message: finalized
            ? 'Documento con collegamento contabile valido: reset workflow bloccato.'
            : resettable && hasPatch
              ? 'Reset workflow tecnico consentito: ripristino stato base + rilascio lock.'
              : 'Workflow già coerente: nessuna patch tecnica necessaria.',
        }]
      })()
    : []

  const resettable = items.filter((item) => item.decision === 'touch')
  if (!dryRun) {
    for (const item of resettable) {
      const { error: updErr } = await db
        .from('documenti_contabilita')
        .update(item.patch)
        .eq('id', item.id)
        .eq('societa_id', item.societa_id)
      if (updErr) throw updErr
    }
  }

  return buildResult({
    action: 'reset_document_workflow',
    dryRun,
    scopeType: 'document',
    scopeId,
    societaId,
    status: dryRun ? 'preview' : resettable.length > 0 ? 'completed' : 'blocked',
    summary: row
      ? dryRun
        ? 'Preview reset workflow tecnico documento.'
        : resettable.length > 0
          ? 'Reset workflow documento eseguito.'
          : 'Nessuna modifica eseguibile sul workflow documento.'
      : 'Documento non trovato.',
    items,
    notes: [
      'Non modifica prima_nota_id o registered_at.',
      'Se esiste una prima nota valida collegata, il reset resta bloccato.',
    ],
    meta: { phase: 'v1_active' },
  })
}
