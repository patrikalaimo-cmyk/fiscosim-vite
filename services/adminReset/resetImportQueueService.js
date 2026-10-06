import { hasValidImportGeneratedOutput, isImportQueueResettable } from './resetSafetyGuards.js'
import { buildResult, normalizeId } from './resetUtils.js'

function hasNonEmptyAiRawResponse(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return typeof value === 'object' && Object.keys(value).length > 0
}

function hasSubstantialAiPayload(value) {
  if (!hasNonEmptyAiRawResponse(value)) return false
  if (typeof value === 'string') return true
  if (typeof value !== 'object') return false

  return Boolean(
    normalizeId(value?.xml_content) ||
    normalizeId(value?.tipo_documento) ||
    (Array.isArray(value?.riepilogo_iva) && value.riepilogo_iva.length > 0) ||
    (Array.isArray(value?.linee) && value.linee.length > 0) ||
    normalizeId(value?.contenuto) ||
    normalizeId(value?.causale)
  )
}

function aggregateReasons(items = []) {
  const map = new Map()
  for (const item of items || []) {
    const key = String(item?.reason || 'unknown')
    map.set(key, (map.get(key) || 0) + 1)
  }
  return Array.from(map.entries()).map(([reason, count]) => ({ reason, count }))
}

function buildPreviewMeta(items = []) {
  const aggregates = aggregateReasons(items)
  const examples = items.slice(0, 5).map((item) => ({
    id: item?.id || null,
    filename: item?.filename || null,
    decision: item?.decision || null,
    reason: item?.reason || null,
    message: item?.message || null,
  }))
  return { aggregates, examples }
}

function buildImportQueueDecision(row, { linkedDocument = null, linkedPrimaNota = null } = {}) {
  const stato = normalizeId(row?.stato).toLowerCase()
  const hasOutput = hasValidImportGeneratedOutput({ linkedDocument, linkedPrimaNota })
  const hasProcessatoAt = Boolean(row?.processato_at)
  const hasModuloDest = Boolean(normalizeId(row?.modulo_destinazione))
  const hasClienteId = Boolean(normalizeId(row?.cliente_id))
  const hasClienteMatchType = Boolean(normalizeId(row?.cliente_match_type))
  const hasSubstantialAi = hasSubstantialAiPayload(row?.ai_raw_response)
  const patch = {}

  if (hasOutput) {
    return {
      decision: 'block',
      reason: 'final_output_exists',
      patch: null,
      message: 'Record collegato a output derivato esistente: reset import bloccato per prudenza.',
    }
  }

  if (stato === 'processed') {
    patch.stato = 'pending'
    if (hasProcessatoAt) patch.processato_at = null
    if (hasModuloDest) patch.modulo_destinazione = null
    if (!hasClienteId && hasClienteMatchType) patch.cliente_match_type = null
    return {
      decision: 'touch',
      reason: 'processed_without_final_output',
      patch,
      message: 'Record processed senza output finale: riapertura tecnica a pending consentita in fase test.',
    }
  }

  if (stato === 'error') {
    patch.stato = 'pending'
    if (hasProcessatoAt) patch.processato_at = null
    if (hasModuloDest) patch.modulo_destinazione = null
    if (!hasClienteId && hasClienteMatchType) patch.cliente_match_type = null
    return {
      decision: 'touch',
      reason: 'error_without_final_output',
      patch,
      message: 'Record error senza output finale: normalizzazione tecnica a pending consentita in fase test.',
    }
  }

  if (!stato) {
    patch.stato = 'pending'
  } else if (!isImportQueueResettable(row)) {
    patch.stato = 'pending'
  }

  if (stato === 'classified' && !hasSubstantialAi) {
    patch.stato = 'pending'
  }

  if (hasProcessatoAt) patch.processato_at = null
  if (hasModuloDest) patch.modulo_destinazione = null
  if (!hasClienteId && hasClienteMatchType) patch.cliente_match_type = null

  if (!Object.keys(patch).length) {
    return {
      decision: 'skip',
      reason: 'already_coherent_queue',
      patch: null,
      message: 'Record di staging già coerente: nessuna normalizzazione necessaria.',
    }
  }

  let reason = 'queue_dirty_flags'
  let message = 'Record di staging non finalizzato: verranno ripuliti solo flag tecnici incoerenti.'
  if (!stato) {
    reason = 'nonfinal_incoherent_status'
    message = 'Stato tecnico incoerente non finalizzato: normalizzazione conservativa a pending.'
  } else if (stato === 'classified' && !hasSubstantialAi) {
    reason = 'classified_without_ai_payload'
    message = 'Record classified senza payload AI coerente: normalizzazione conservativa a pending.'
  }

  return {
    decision: 'touch',
    reason,
    patch,
    message,
  }
}

async function loadLinkedOutputs(db, societaId, importIds = []) {
  const ids = Array.from(new Set((Array.isArray(importIds) ? importIds : []).map((id) => String(id || '').trim()).filter(Boolean)))
  if (!ids.length) return { docsBySourceId: new Map(), pnByImportId: new Map() }

  const [{ data: docs, error: docsErr }, { data: pn, error: pnErr }] = await Promise.all([
    db
      .from('documenti_contabilita')
      .select('id,societa_id,source_document_id,validation_status,workflow_status,prima_nota_id,registered_at')
      .eq('societa_id', societaId)
      .in('source_document_id', ids),
    db
      .from('prima_nota')
      .select('id,societa_id,documento_import_id,stato')
      .eq('societa_id', societaId)
      .in('documento_import_id', ids),
  ])
  if (docsErr) throw docsErr
  if (pnErr) throw pnErr

  const docsBySourceId = new Map()
  for (const row of docs || []) {
    const key = String(row?.source_document_id || '').trim()
    if (key && !docsBySourceId.has(key)) docsBySourceId.set(key, row)
  }

  const pnByImportId = new Map()
  for (const row of pn || []) {
    const key = String(row?.documento_import_id || '').trim()
    if (key && !pnByImportId.has(key)) pnByImportId.set(key, row)
  }

  return { docsBySourceId, pnByImportId }
}

export async function runResetImportQueue({
  db,
  dryRun,
  societaId = '',
}) {
  const { data, error } = await db
    .from('documenti_import')
    .select('id,societa_destinazione_id,filename,stato,processato_at,modulo_destinazione,cliente_id,cliente_match_type,ai_raw_response,created_at')
    .eq('societa_destinazione_id', societaId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  const { docsBySourceId, pnByImportId } = await loadLinkedOutputs(db, societaId, rows.map((row) => row.id))
  const items = rows.map((row) => {
    const linkedDocument = docsBySourceId.get(String(row.id)) || null
    const linkedPrimaNota = pnByImportId.get(String(row.id)) || null
    const decision = buildImportQueueDecision(row, { linkedDocument, linkedPrimaNota })
    return {
      id: row.id,
      societa_id: row.societa_destinazione_id || null,
      filename: row.filename || null,
      stato: row.stato || null,
      processato_at: row.processato_at || null,
      modulo_destinazione: row.modulo_destinazione || null,
      cliente_id: row.cliente_id || null,
      cliente_match_type: row.cliente_match_type || null,
      linked_document_id: linkedDocument?.id || null,
      linked_prima_nota_id: linkedPrimaNota?.id || null,
      ...decision,
    }
  })
  const resettable = items.filter((item) => item.decision === 'touch')

  if (!dryRun) {
    for (const item of resettable) {
      const { error: updErr } = await db
        .from('documenti_import')
        .update(item.patch)
        .eq('id', item.id)
        .eq('societa_destinazione_id', item.societa_id)
      if (updErr) throw updErr
    }
  }

  const meta = buildPreviewMeta(items)
  const analyzed = items.length
  const resettableCount = resettable.length
  const blockedCount = items.filter((item) => item.decision === 'block').length
  const skippedCount = items.filter((item) => item.decision === 'skip').length

  return buildResult({
    action: 'reset_import_queue',
    dryRun,
    scopeType: 'company',
    societaId,
    status: dryRun ? 'preview' : 'completed',
    summary: dryRun
      ? `Preview reset coda import: analizzati ${analyzed}, resettabili ${resettableCount}, bloccati ${blockedCount}, saltati ${skippedCount}.`
      : `Reset coda import eseguito: normalizzati ${resettableCount} record su ${analyzed} analizzati.`,
    items,
    notes: [
      ...meta.aggregates.map((item) => `${item.reason}: ${item.count}`),
      ...meta.examples.map((item) => `Esempio ${item.id}: ${item.reason} (${item.decision})`),
      'Nessun hard delete su documenti_import in FASE 2 conservativa.',
      'Nessun intervento su documenti_contabilita o prima_nota.',
    ],
    meta,
  })
}
