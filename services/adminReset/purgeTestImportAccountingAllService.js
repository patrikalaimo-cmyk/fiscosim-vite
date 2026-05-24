import { buildResult, normalizeId, toBoolean } from './resetUtils.js'
import { hasBlockingRegisteredState } from './resetSafetyGuards.js'

function chunk(ids = [], size = 400) {
  const out = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

function isFinalizedDoc(docRow = {}) {
  return hasBlockingRegisteredState(docRow, null)
}

export async function runPurgeTestImportAccountingAll({
  db,
  dryRun,
  societaId = '',
  body = {},
  auth,
}) {
  void auth
  const sid = normalizeId(societaId)
  if (!sid) throw new Error('societaId obbligatoria')

  const force = toBoolean(body?.force, false)
  if (!dryRun && !force) {
    throw new Error('purge_test_import_accounting_all richiede force=true per esecuzione reale')
  }

  // Carica ids principali per societa (no cross-societa)
  const [{ data: imports, error: impErr }, { data: docs, error: docErr }, { data: pn, error: pnErr }] =
    await Promise.all([
      db
        .from('documenti_import')
        .select('id,filename,stato,created_at')
        .eq('societa_destinazione_id', sid)
        .order('created_at', { ascending: false })
        .limit(5000),
      db
        .from('documenti_contabilita')
        .select('id,societa_id,workflow_status,validation_status,prima_nota_id,registered_at,source_document_id,created_at')
        .eq('societa_id', sid)
        .order('created_at', { ascending: false })
        .limit(5000),
      db
        .from('prima_nota')
        .select('id,societa_id,stato,documento_import_id,created_at')
        .eq('societa_id', sid)
        .order('created_at', { ascending: false })
        .limit(5000),
    ])
  if (impErr) throw impErr
  if (docErr) throw docErr
  if (pnErr) throw pnErr

  const importRows = Array.isArray(imports) ? imports : []
  const docRows = Array.isArray(docs) ? docs : []
  const pnRows = Array.isArray(pn) ? pn : []

  const importIds = importRows.map((r) => String(r.id))
  const docIds = docRows.map((r) => String(r.id))
  const pnIds = pnRows.map((r) => String(r.id))

  // ai_document_memory collegata ai documenti_import di questa societa (per source_document_id)
  let memRows = []
  if (importIds.length) {
    const memAcc = []
    for (const ids of chunk(importIds, 400)) {
      const { data: mem, error: memErr } = await db
        .from('ai_document_memory')
        .select('id,source_document_id,created_at')
        .in('source_document_id', ids)
        .limit(5000)
      if (memErr) throw memErr
      memAcc.push(...(Array.isArray(mem) ? mem : []))
    }
    // dedupe by id
    const seen = new Set()
    memRows = memAcc.filter((r) => {
      const id = String(r?.id || '')
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
  }

  const finalizedDocs = docRows.filter((d) => isFinalizedDoc(d))
  const hasFinalized = finalizedDocs.length > 0

  if (hasFinalized && !force) {
    return buildResult({
      action: 'purge_test_import_accounting_all',
      dryRun,
      scopeType: 'company',
      societaId: sid,
      status: 'blocked',
      summary: 'Purge totale bloccato: trovati documenti contabili finalizzati. Ripeti con force=true in ambiente test.',
      items: [{
        decision: 'block',
        reason: 'finalized_output_exists',
        message: 'Sono presenti documenti contabili registrati/finalizzati nella società: purge totale richiede force=true.',
        societa_id: sid,
        counts: {
          documenti_import: importIds.length,
          documenti_contabilita: docIds.length,
          prima_nota: pnIds.length,
          ai_document_memory: memRows.length,
          finalized_docs: finalizedDocs.length,
        },
        examples_finalized_docs: finalizedDocs.slice(0, 10).map((d) => d.id),
      }],
      notes: [
        'Ordine purge previsto: prima_nota → documenti_contabilita → documenti_import → ai_document_memory.',
        'Per procedere serve force=true.',
      ],
      meta: { forceRequested: force },
    })
  }

  const plan = [
    { step: 1, table: 'prima_nota', count: pnIds.length },
    { step: 2, table: 'documenti_contabilita', count: docIds.length },
    { step: 3, table: 'documenti_import', count: importIds.length },
    { step: 4, table: 'ai_document_memory', count: memRows.length },
  ]

  if (!dryRun) {
    // 1) prima_nota (tutta la societa)
    if (pnIds.length) {
      for (const ids of chunk(pnIds)) {
        const { error } = await db.from('prima_nota').delete().in('id', ids).eq('societa_id', sid)
        if (error) throw error
      }
    }

    // 2) documenti_contabilita (tutta la societa)
    if (docIds.length) {
      for (const ids of chunk(docIds)) {
        const { error } = await db.from('documenti_contabilita').delete().in('id', ids).eq('societa_id', sid)
        if (error) throw error
      }
    }

    // 3) documenti_import (tutta la societa)
    if (importIds.length) {
      for (const ids of chunk(importIds)) {
        const { error } = await db.from('documenti_import').delete().in('id', ids).eq('societa_destinazione_id', sid)
        if (error) throw error
      }
    }

    // 4) ai_document_memory (solo per source_document_id legati agli importIds)
    if (memRows.length) {
      const memIds = memRows.map((r) => String(r.id))
      for (const ids of chunk(memIds)) {
        const { error } = await db.from('ai_document_memory').delete().in('id', ids)
        if (error) throw error
      }
    }
  }

  return buildResult({
    action: 'purge_test_import_accounting_all',
    dryRun,
    scopeType: 'company',
    societaId: sid,
    status: dryRun ? 'preview' : 'completed',
    summary: dryRun ? 'Preview purge totale ambiente test (import+contabilità).' : 'Purge totale ambiente test eseguito.',
    items: [{
      decision: 'touch',
      reason: dryRun ? 'preview' : 'purged',
      message: dryRun ? 'Preview purge totale.' : 'Purge totale completato.',
      societa_id: sid,
      plan,
      counts: {
        documenti_import: importIds.length,
        documenti_contabilita: docIds.length,
        prima_nota: pnIds.length,
        ai_document_memory: memRows.length,
        finalized_docs: finalizedDocs.length,
      },
    }],
    notes: [
      'Delete order: prima_nota → documenti_contabilita → documenti_import → ai_document_memory.',
      hasFinalized ? 'Force=true: purge su output finalizzati abilitato (ambiente test).' : 'Nessun output finalizzato rilevato.',
      'Nessun wipe cross-società: filtro su societa_id / societa_destinazione_id.',
    ],
    meta: { forceRequested: force },
  })
}

