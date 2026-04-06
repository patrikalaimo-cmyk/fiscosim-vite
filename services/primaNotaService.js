import { sb } from '../src/lib/supabase'

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
      try {
        await deletePrimaNotaById({ db, primaNotaId })
      } catch {
        // rollback best effort
      }
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
  }

  return {
    data: { primaNotaId, pn, righeIns, partIns },
    error: null,
    pn,
    righeIns,
    partIns,
  }
}
