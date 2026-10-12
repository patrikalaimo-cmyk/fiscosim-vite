import { sb } from '../src/lib/supabase.js'

export async function createPrimaNota({
  db = sb,
  pnPayload,
  headerSelect = '*',
}) {
  const query = db.from('prima_nota').insert([pnPayload])
  return headerSelect ? query.select(headerSelect).single() : query.select().single()
}

export async function insertPrimaNotaRighe({
  db = sb,
  righePayload,
  righeSelect = '*',
}) {
  const query = db.from('prima_nota_righe').insert(righePayload)
  return righeSelect ? query.select(righeSelect) : query.select()
}

export async function insertPrimaNotaPartitario({
  db = sb,
  partEntries,
  partitarioSelect = '*',
}) {
  const query = db.from('partitario').insert(partEntries)
  return partitarioSelect ? query.select(partitarioSelect) : query.select()
}

export async function insertRegistriIva({
  db = sb,
  vatEntries,
  vatSelect = '*',
}) {
  const query = db.from('registri_iva').insert(vatEntries)
  return vatSelect ? query.select(vatSelect) : query.select()
}

export async function deletePrimaNotaById({
  db = sb,
  primaNotaId,
}) {
  return db.from('prima_nota').delete().eq('id', primaNotaId)
}

async function deletePrimaNotaRigheByPrimaNotaId({
  db = sb,
  primaNotaId,
}) {
  return db.from('prima_nota_righe').delete().eq('prima_nota_id', primaNotaId)
}

async function deletePrimaNotaPartitarioByPrimaNotaId({
  db = sb,
  primaNotaId,
}) {
  return db.from('partitario').delete().eq('prima_nota_id', primaNotaId)
}

async function deleteRegistriIvaByPrimaNotaId({
  db = sb,
  primaNotaId,
}) {
  return db.from('registri_iva').delete().eq('prima_nota_id', primaNotaId)
}

async function deleteRitenuteDaccontoByPrimaNotaId({
  db = sb,
  primaNotaId,
}) {
  return db.from('ritenute_dacconto').delete().eq('prima_nota_id', primaNotaId)
}

async function cleanupPrimaNotaCompleta({ db = sb, primaNotaId }) {
  for (const cleanupStep of [
    () => deleteRitenuteDaccontoByPrimaNotaId({ db, primaNotaId }),
    () => deletePrimaNotaPartitarioByPrimaNotaId({ db, primaNotaId }),
    () => deleteRegistriIvaByPrimaNotaId({ db, primaNotaId }),
    () => deletePrimaNotaRigheByPrimaNotaId({ db, primaNotaId }),
    () => deletePrimaNotaById({ db, primaNotaId }),
  ]) {
    try {
      await cleanupStep()
    } catch {
      // best effort cleanup: preserve the original save failure
    }
  }
}

export async function createPrimaNotaCompleta({
  db = sb,
  pnPayload,
  righePayload = [],
  partEntries = [],
  vatEntries = [],
  ritenutaEntries = [],
  ritenutaUpdates = [],
  headerSelect = 'id',
  righeSelect = '*',
  partitarioSelect = '*',
  vatSelect = '*',
  ritenutaSelect = '*',
  rollbackOnRigheError = true,
}) {
  const { data: pn, error: pnErr } = await createPrimaNota({ db, pnPayload, headerSelect })
  if (pnErr) return { data: null, error: pnErr, pn: null, righeIns: null, vatIns: null, partIns: null, ritenuteIns: null }

  const primaNotaId = pn?.id
  if (!primaNotaId) {
    return {
      data: null,
      error: new Error('Insert prima_nota: id mancante'),
      pn,
      righeIns: null,
      vatIns: null,
      partIns: null,
      ritenuteIns: null,
    }
  }

  let righeIns = null
  if (Array.isArray(righePayload) && righePayload.length > 0) {
    const righeWithPrimaNotaId = righePayload.map((r) => ({
      prima_nota_id: primaNotaId,
      ...r,
    }))
    righeIns = await insertPrimaNotaRighe({ db, righePayload: righeWithPrimaNotaId, righeSelect })
    if (righeIns.error && rollbackOnRigheError) {
      await cleanupPrimaNotaCompleta({ db, primaNotaId })
      return { data: null, error: righeIns.error, pn, righeIns, vatIns: null, partIns: null, ritenuteIns: null }
    }
  }

  let vatIns = null
  if (Array.isArray(vatEntries) && vatEntries.length > 0) {
    const vatEntriesWithPrimaNotaId = vatEntries.map((r) => ({
      prima_nota_id: primaNotaId,
      ...r,
    }))
    vatIns = await insertRegistriIva({ db, vatEntries: vatEntriesWithPrimaNotaId, vatSelect })
    if (vatIns.error) {
      await cleanupPrimaNotaCompleta({ db, primaNotaId })
      return { data: null, error: vatIns.error, pn, righeIns, vatIns, partIns: null, ritenuteIns: null }
    }
  }

  let ritenuteIns = null
  let ritenuteUpd = null
  let partIns = null
  if (Array.isArray(partEntries) && partEntries.length > 0) {
    const partEntriesWithPrimaNotaId = partEntries.map((r) => ({
      prima_nota_id: primaNotaId,
      ...r,
    }))

    // Separate openings from closures: closures have a 'documento_id' pointing to the original invoice,
    // while openings are new records to be inserted in the partitario ledger.
    const openings = partEntriesWithPrimaNotaId.filter(r => !r.documento_id || r.tipo_movimento === 'apertura')
    const closures = partEntriesWithPrimaNotaId.filter(r => r.documento_id && r.tipo_movimento !== 'apertura')

    if (openings.length > 0) {
      // Clean up local property before db insert to prevent Supabase from complaining about unknown columns
      const sanitizedOpenings = openings.map(({ tipo_movimento, ...rest }) => rest)
      partIns = await insertPrimaNotaPartitario({ db, partEntries: sanitizedOpenings, partitarioSelect })
      if (partIns.error) {
        await cleanupPrimaNotaCompleta({ db, primaNotaId })
        return {
          data: null,
          error: partIns.error,
          pn,
          righeIns,
          vatIns,
          partIns,
          ritenuteIns,
        }
      }
    }

    if (closures.length > 0) {
      // Update the open items ledger (partitario) so residuals/states are consistent across the app.
      try {
        await applyPartitarioClosures(db, { primaNotaId, partEntries: closures })
      } catch (closureError) {
        await cleanupPrimaNotaCompleta({ db, primaNotaId })
        return {
          data: null,
          error: closureError,
          pn,
          righeIns,
          vatIns,
          partIns,
          ritenuteIns,
        }
      }
    }
  }

  if (Array.isArray(ritenutaEntries) && ritenutaEntries.length > 0) {
    const openedPartitarioId = Array.isArray(partIns?.data) ? partIns.data[0]?.id || null : null
    const linkedEntries = ritenutaEntries.map((entry) => {
      const matured = String(entry?.stato || '').trim().toLowerCase() === 'da_versare'
      return {
        ...entry,
        prima_nota_id: entry.prima_nota_id || primaNotaId,
        partitario_id: entry.partitario_id || openedPartitarioId,
        ...(matured ? { prima_nota_pagamento_id: primaNotaId } : {}),
      }
    })
    const query = db.from('ritenute_dacconto').insert(linkedEntries)
    ritenuteIns = await (ritenutaSelect ? query.select(ritenutaSelect) : query.select())
    if (ritenuteIns.error) {
      await cleanupPrimaNotaCompleta({ db, primaNotaId })
      return { data: null, error: ritenuteIns.error, pn, righeIns, vatIns, partIns, ritenuteIns }
    }
  }

  if (Array.isArray(ritenutaUpdates) && ritenutaUpdates.length > 0) {
    const updatedRows = []
    for (const entry of ritenutaUpdates) {
      const id = String(entry?.id || '').trim()
      if (!id) {
        const error = new Error('Posizione ritenuta da maturare non identificata')
        await cleanupPrimaNotaCompleta({ db, primaNotaId })
        return { data: null, error, pn, righeIns, vatIns, partIns, ritenuteIns, ritenuteUpd }
      }
      const { id: _id, ...updates } = entry
      const keepOpen = String(updates.stato || '').trim().toLowerCase() === 'aperta'
      const payload = {
        ...updates,
        updated_at: new Date().toISOString(),
      }
      if (!keepOpen) {
        payload.prima_nota_pagamento_id = primaNotaId
      }
      const query = db
        .from('ritenute_dacconto')
        .update(payload)
        .eq('id', id)
        .select(ritenutaSelect || '*')
      const result = await query
      if (result.error || !Array.isArray(result.data) || result.data.length !== 1) {
        const error = result.error || new Error(`Posizione ritenuta '${id}' non aggiornata`)
        await cleanupPrimaNotaCompleta({ db, primaNotaId })
        return { data: null, error, pn, righeIns, vatIns, partIns, ritenuteIns, ritenuteUpd: result }
      }
      updatedRows.push(result.data[0])
    }
    ritenuteUpd = { data: updatedRows, error: null }
  }

  // SG-P0-03: every successful fiscal commit must leave an audit_contabile row.
  // Best-effort on legacy multi-step path (Stage3W already inserts audit in-RPC).
  try {
    const societaId = pnPayload?.societa_id || pn?.societa_id || null
    if (societaId && primaNotaId) {
      await db.from('audit_contabile').insert([{
        societa_id: societaId,
        entity_type: 'prima_nota',
        entity_id: primaNotaId,
        operation_type: 'INSERT',
        operation_reason: String(pnPayload?.motivazione || pnPayload?.descrizione || 'createPrimaNotaCompleta').slice(0, 500),
        after_data: {
          path: 'createPrimaNotaCompleta',
          numero_documento: pnPayload?.numero_documento || pn?.numero_documento || null,
          data_registrazione: pnPayload?.data_registrazione || pn?.data_registrazione || null,
        },
        performed_by: pnPayload?.created_by || pnPayload?.operatore_id || null,
        source_module: pnPayload?.documento_import_id ? 'import_contabilita' : 'registrazione_manual',
      }])
    }
  } catch {
    /* audit best-effort on legacy path */
  }

  return {
    data: { primaNotaId, pn, righeIns, vatIns, partIns, ritenuteIns, ritenuteUpd },
    error: null,
    pn,
    righeIns,
    vatIns,
    partIns,
    ritenuteIns,
    ritenuteUpd,
  }
}

async function applyPartitarioClosures(db, { primaNotaId, partEntries }) {
  const grouped = new Map()
  for (const r of partEntries || []) {
    const id = r?.documento_id
    if (!id) continue
    const imp = Number(String(r?.importo_chiuso ?? 0).replace(',', '.')) || 0
    grouped.set(String(id), (grouped.get(String(id)) || 0) + imp)
  }

  for (const [partitaId, inc] of grouped.entries()) {
    if (!inc && inc !== 0) continue
    const { data: p, error } = await db
      .from('partitario')
      .select('id, importo_originale, importo_pagato, stato')
      .eq('id', partitaId)
      .maybeSingle()
    if (error || !p?.id) {
      throw new Error(`Partita non trovata con ID ${partitaId}`)
    }

    if (p.stato === 'chiusa') {
      throw new Error(`La partita '${partitaId}' è già chiusa`)
    }

    const original = Number(p.importo_originale || 0)
    const pagatoBefore = Number(p.importo_pagato || 0)
    const residualBefore = Math.round((original - pagatoBefore) * 100) / 100

    if (Math.abs(inc) > Math.abs(residualBefore) + 0.01) {
      throw new Error(`Importo di chiusura/compensazione ${inc} eccede il residuo di ${residualBefore} per la partita '${partitaId}'`)
    }

    const pagato = pagatoBefore + inc
    const residuo = Math.round((original - pagato) * 100) / 100
    const chiusa = Math.abs(residuo) <= 0.01

    const finalResiduo = chiusa ? 0 : residuo
    const finalPagato = chiusa ? original : pagato

    const stato = chiusa ? 'chiusa' : 'aperta'

    const updates = {
      importo_pagato: Math.round(finalPagato * 100) / 100,
      importo_residuo: Math.round(finalResiduo * 100) / 100,
      stato,
      chiusa_da_prima_nota_id: chiusa ? primaNotaId : null,
      data_chiusura: chiusa ? new Date().toISOString().slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    }

    const { error: updErr } = await db.from('partitario').update(updates).eq('id', partitaId)
    if (updErr) {
      throw new Error(`Errore durante l'aggiornamento della partita ${partitaId}: ${updErr.message}`)
    }
  }
}
