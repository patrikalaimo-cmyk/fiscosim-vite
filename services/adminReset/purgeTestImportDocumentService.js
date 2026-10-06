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

function isMissingColumnError(error, column) {
  const msg = String(error?.message || '').toLowerCase()
  return Boolean(column && msg.includes('column') && msg.includes(String(column).toLowerCase()))
}

export async function runPurgeTestImportDocument({
  db,
  dryRun,
  societaId = '',
  body = {},
  auth,
}) {
  void auth
  const sid = normalizeId(societaId)
  if (!sid) throw new Error('societaId obbligatoria')

  const importId = normalizeId(body?.importId)
  const filename = normalizeId(body?.filename)
  const force = toBoolean(body?.force, false)

  if (!importId && !filename) {
    throw new Error('purge_test_import_document richiede filename oppure importId')
  }

  // 1) risolvi documenti_import
  let impQuery = db
    .from('documenti_import')
    .select('id,societa_destinazione_id,filename,stato,created_at')
    .eq('societa_destinazione_id', sid)
    .order('created_at', { ascending: false })
    .limit(1)

  if (importId) impQuery = impQuery.eq('id', importId)
  else impQuery = impQuery.eq('filename', filename)

  const { data: impRow, error: impErr } = await impQuery.maybeSingle()
  if (impErr) throw impErr

  if (!impRow?.id) {
    return buildResult({
      action: 'purge_test_import_document',
      dryRun,
      scopeType: 'company',
      societaId: sid,
      status: 'completed',
      summary: 'Nessun record documenti_import trovato: niente da eliminare.',
      items: [{
        decision: 'skip',
        reason: 'not_found',
        message: 'documenti_import non trovato per i criteri forniti.',
        import_id: importId || null,
        filename: filename || null,
      }],
      notes: [],
      meta: { forceRequested: force },
    })
  }

  const resolvedImportId = normalizeId(impRow.id)

  // 2) carica collegamenti
  const [{ data: docs, error: docsErr }, { data: pn, error: pnErr }, { data: mem, error: memErr }] =
    await Promise.all([
      db
        .from('documenti_contabilita')
        .select('id,societa_id,workflow_status,validation_status,prima_nota_id,registered_at,source_document_id,created_at')
        .eq('societa_id', sid)
        .eq('source_document_id', resolvedImportId)
        .limit(50),
      db
        .from('prima_nota')
        .select('id,societa_id,stato,documento_import_id,created_at')
        .eq('societa_id', sid)
        .eq('documento_import_id', resolvedImportId)
        .limit(50),
      db
        .from('ai_document_memory')
        .select('id,source_document_id,created_at')
        .eq('source_document_id', resolvedImportId)
        .limit(200),
    ])
  if (docsErr) throw docsErr
  const pnColumnMissing = isMissingColumnError(pnErr, 'documento_import_id')
  if (pnErr && !pnColumnMissing) throw pnErr
  if (memErr) throw memErr

  const linkedDocs = Array.isArray(docs) ? docs : []
  const linkedPn = pnColumnMissing ? [] : Array.isArray(pn) ? pn : []
  const linkedMem = Array.isArray(mem) ? mem : []

  const finalizedDocs = linkedDocs.filter((d) => isFinalizedDoc(d))
  const hasFinalized = finalizedDocs.length > 0

  if (hasFinalized && !force) {
    return buildResult({
      action: 'purge_test_import_document',
      dryRun,
      scopeType: 'company',
      societaId: sid,
      status: 'blocked',
      summary: 'Purge bloccato: esistono output contabili finalizzati. Ripeti con force=true se sei in ambiente test.',
      items: [
        {
          decision: 'block',
          reason: 'finalized_output_exists',
          message: 'Documento contabile collegato risulta registrato/finalizzato.',
          import_id: resolvedImportId,
          filename: impRow.filename || null,
          linked_docs: linkedDocs.map((d) => d.id),
          finalized_docs: finalizedDocs.map((d) => d.id),
        },
      ],
      notes: [
        'Ordine purge previsto: prima_nota → documenti_contabilita → documenti_import → ai_document_memory.',
        'Per procedere su record finalizzati serve force=true.',
      ],
      meta: {
        resolved: { importId: resolvedImportId, filename: impRow.filename || null },
        counts: { linkedDocs: linkedDocs.length, linkedPn: linkedPn.length, linkedMem: linkedMem.length },
      },
    })
  }

  const plan = [
    { step: 1, table: 'prima_nota', ids: linkedPn.map((r) => r.id) },
    { step: 2, table: 'documenti_contabilita', ids: linkedDocs.map((r) => r.id) },
    { step: 3, table: 'documenti_import', ids: [resolvedImportId] },
    { step: 4, table: 'ai_document_memory', ids: linkedMem.map((r) => r.id) },
  ]

  if (!dryRun) {
    // step 1: prima_nota
    if (linkedPn.length) {
      for (const ids of chunk(linkedPn.map((r) => r.id))) {
        const { error } = await db.from('prima_nota').delete().in('id', ids).eq('societa_id', sid)
        if (error) throw error
      }
    }

    // step 2: documenti_contabilita
    if (linkedDocs.length) {
      for (const ids of chunk(linkedDocs.map((r) => r.id))) {
        const { error } = await db.from('documenti_contabilita').delete().in('id', ids).eq('societa_id', sid)
        if (error) throw error
      }
    }

    // step 3: documenti_import
    {
      const { error } = await db
        .from('documenti_import')
        .delete()
        .eq('id', resolvedImportId)
        .eq('societa_destinazione_id', sid)
      if (error) throw error
    }

    // step 4: ai_document_memory
    if (linkedMem.length) {
      for (const ids of chunk(linkedMem.map((r) => r.id))) {
        const { error } = await db.from('ai_document_memory').delete().in('id', ids)
        if (error) throw error
      }
    }
  }

  const items = [
    {
      decision: 'touch',
      reason: dryRun ? 'preview' : 'purged',
      message: dryRun ? 'Preview purge singolo documento test.' : 'Purge singolo documento test completato.',
      import_id: resolvedImportId,
      filename: impRow.filename || null,
      plan,
      counts: { linkedDocs: linkedDocs.length, linkedPn: linkedPn.length, linkedMem: linkedMem.length },
    },
  ]

  return buildResult({
    action: 'purge_test_import_document',
    dryRun,
    scopeType: 'company',
    societaId: sid,
    status: dryRun ? 'preview' : 'completed',
    summary: dryRun ? 'Preview purge documento di test.' : 'Purge documento di test eseguito.',
    items,
    notes: [
      'Delete order: prima_nota → documenti_contabilita → documenti_import → ai_document_memory.',
      hasFinalized ? 'Force=true: purge su output finalizzati abilitato (ambiente test).' : 'Nessun output finalizzato rilevato.',
      ...(pnColumnMissing
        ? ['Colonna prima_nota.documento_import_id non disponibile: link PN valutati come assenti (compat mode).']
        : []),
    ],
    meta: {
      forceRequested: force,
      resolved: { importId: resolvedImportId, filename: impRow.filename || null },
    },
  })
}

