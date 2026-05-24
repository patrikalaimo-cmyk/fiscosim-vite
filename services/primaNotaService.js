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
  const query = db.from('prima_nota_partitario').insert(partEntries)
  return partitarioSelect ? query.select(partitarioSelect) : query.select()
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
  return db.from('prima_nota_partitario').delete().eq('prima_nota_id', primaNotaId)
}

async function cleanupPrimaNotaCompleta({ db = sb, primaNotaId }) {
  for (const cleanupStep of [
    () => deletePrimaNotaPartitarioByPrimaNotaId({ db, primaNotaId }),
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
  headerSelect = 'id',
  righeSelect = '*',
  partitarioSelect = '*',
  rollbackOnRigheError = true,
}) {
  const { data: pn, error: pnErr } = await createPrimaNota({ db, pnPayload, headerSelect })
  if (pnErr) return { data: null, error: pnErr, pn: null, righeIns: null, partIns: null }

  const primaNotaId = pn?.id
  if (!primaNotaId) {
    return {
      data: null,
      error: new Error('Insert prima_nota: id mancante'),
      pn,
      righeIns: null,
      partIns: null,
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
      return { data: null, error: righeIns.error, pn, righeIns, partIns: null }
    }
  }

  let partIns = null
  if (Array.isArray(partEntries) && partEntries.length > 0) {
    const partEntriesWithPrimaNotaId = partEntries.map((r) => ({
      prima_nota_id: primaNotaId,
      ...r,
    }))
    partIns = await insertPrimaNotaPartitario({ db, partEntries: partEntriesWithPrimaNotaId, partitarioSelect })
    if (partIns.error) {
      await cleanupPrimaNotaCompleta({ db, primaNotaId })
      return {
        data: null,
        error: partIns.error,
        pn,
        righeIns,
        partIns,
      }
    }

    // Update the open items ledger (partitario) so residuals/states are consistent across the app.
    try {
      await applyPartitarioClosures(db, { primaNotaId, partEntries: partEntriesWithPrimaNotaId })
    } catch (closureError) {
      await cleanupPrimaNotaCompleta({ db, primaNotaId })
      return {
        data: null,
        error: closureError,
        pn,
        righeIns,
        partIns,
      }
    }
  }

  return {
    data: { primaNotaId, pn, righeIns, partIns },
    error: null,
    pn,
    righeIns,
    partIns,
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
    if (!inc || inc <= 0) continue
    const { data: p, error } = await db
      .from('partitario')
      .select('id, importo_originale, importo_pagato')
      .eq('id', partitaId)
      .maybeSingle()
    if (error || !p?.id) continue

    const original = Number(p.importo_originale || 0)
    const pagato = Number(p.importo_pagato || 0) + inc
    const residuo = Math.round((original - pagato) * 100) / 100
    const chiusa = residuo <= 0.01
    const stato = chiusa ? 'chiusa' : 'parziale'

    const updates = {
      importo_pagato: Math.round(pagato * 100) / 100,
      importo_residuo: Math.max(0, residuo),
      stato,
      chiusa_da_prima_nota_id: chiusa ? primaNotaId : null,
      data_chiusura: chiusa ? new Date().toISOString().slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    }

    await db.from('partitario').update(updates).eq('id', partitaId)
  }
}
