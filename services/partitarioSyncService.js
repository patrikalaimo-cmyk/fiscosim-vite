/**
 * Sincronizza movimenti partitario quando viene inserita una riga in accounting_entries.
 * Risolve soggetto_id (tabella clienti) da: payload, documento documenti_contabilita, righe tipo soggetto + piano conti.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function toNum(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number' && Number.isFinite(v)) return round2(v)
  const s = String(v).replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? round2(n) : 0
}

function normalizePiva(s) {
  return String(s || '')
    .replace(/\s/g, '')
    .replace(/^IT/i, '')
    .trim()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} documentId
 * @returns {Promise<string | null>}
 */
async function resolveSoggettoFromAiParsing(db, documentId) {
  if (!documentId || !db) return null
  try {
    const { data: pr, error } = await db
      .from('ai_parsing_results')
      .select('json_output')
      .eq('document_id', documentId)
      .maybeSingle()
    if (error || !pr?.json_output) return null
    let jo = pr.json_output
    if (typeof jo === 'string') {
      try {
        jo = JSON.parse(jo)
      } catch {
        return null
      }
    }
    if (!jo || typeof jo !== 'object') return null
    const doc = jo.documento || {}
    const candidates = [
      doc.fornitore?.piva,
      doc.cedente?.piva,
      doc.prestatore?.piva,
      doc.cliente?.piva,
      doc.cessionario?.piva,
      doc.committente?.piva,
    ].filter(Boolean)
    for (const raw of candidates) {
      const piva = normalizePiva(raw)
      if (piva.length < 5) continue
      const variants = [piva, `IT${piva}`]
      const { data: list } = await db
        .from('clienti')
        .select('id')
        .eq('attivo', true)
        .in('partita_iva', variants)
        .limit(2)
      const rows = Array.isArray(list) ? list : []
      if (rows.length === 1) return String(rows[0].id)
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * @param {unknown[]} rows
 * @returns {Record<string, unknown> | null}
 */
function findSoggettoRow(rows) {
  if (!Array.isArray(rows)) return null
  const byTipo = rows.find((r) => r && r.tipo_riga_auto === 'soggetto')
  if (byTipo) return byTipo
  const byField = rows.find((r) => r && (r.soggetto_id || r.cliente_fornitore_id))
  return byField || null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} contoId
 * @returns {Promise<string | null>} clienti.id
 */
async function resolveSoggettoFromContoId(db, contoId) {
  if (!contoId || !db) return null
  const { data: pc, error } = await db
    .from('piano_conti')
    .select('id, is_cliente, is_fornitore, anagrafica_piva')
    .eq('id', contoId)
    .maybeSingle()
  if (error || !pc) return null
  if (!pc.is_cliente && !pc.is_fornitore) return null
  const piva = String(pc.anagrafica_piva || '').trim()
  if (!piva) return null
  const { data: cl } = await db
    .from('clienti')
    .select('id')
    .eq('partita_iva', piva)
    .eq('attivo', true)
    .limit(1)
    .maybeSingle()
  return cl?.id ? String(cl.id) : null
}

/**
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   documentId: string,
 *   data: Record<string, unknown>,
 *   rows: unknown[],
 * }} p
 * @returns {Promise<string | null>}
 */
async function resolveSoggettoId({ db, documentId, data, rows }) {
  const direct = data?.soggetto_id || data?.cliente_fornitore_id
  if (direct) return String(direct)

  try {
    const { data: doc } = await db
      .from('documenti_contabilita')
      .select('cliente_id, data_documento')
      .eq('id', documentId)
      .maybeSingle()
    if (doc?.cliente_id) return String(doc.cliente_id)
  } catch {
    /* tabella assente o errore */
  }

  const fromParsing = await resolveSoggettoFromAiParsing(db, documentId)
  if (fromParsing) return fromParsing

  const soggettoRow = findSoggettoRow(rows)
  if (soggettoRow?.soggetto_id) return String(soggettoRow.soggetto_id)
  if (soggettoRow?.cliente_fornitore_id) return String(soggettoRow.cliente_fornitore_id)

  const cid = soggettoRow?.conto_id
  if (cid) {
    const fromPc = await resolveSoggettoFromContoId(db, String(cid))
    if (fromPc) return fromPc
  }

  for (const r of rows || []) {
    if (!r || typeof r !== 'object') continue
    const id = r.conto_id
    if (!id) continue
    const resolved = await resolveSoggettoFromContoId(db, String(id))
    if (resolved) return resolved
  }

  return null
}

/**
 * @param {Record<string, unknown>} data
 * @param {unknown[]} rows
 * @param {string | null} tipoAcquistoVendita acquisto | vendita | null
 */
function extractDareAvere({ data, rows, tipoAcquistoVendita, log }) {
  const r = findSoggettoRow(rows)
  if (r) {
    return {
      dare: toNum(r.dare),
      avere: toNum(r.avere),
      descrizione: String(r.descrizione || r.descrizione_riga || '').slice(0, 500) || null,
    }
  }

  const tipo = data?.tipo || tipoAcquistoVendita
  const totale = toNum(data?.totale)
  if (totale === 0) return null

  if (tipo === 'acquisto' || tipo === 'passivo') {
    return {
      dare: 0,
      avere: totale,
      descrizione: 'Sintesi registrazione acquisto',
    }
  }
  if (tipo === 'vendita' || tipo === 'attivo') {
    return {
      dare: totale,
      avere: 0,
      descrizione: 'Sintesi registrazione vendita',
    }
  }

  return null
}

function extractDataMovimento(data, entryCreatedAt) {
  const raw =
    data?.data ||
    data?.data_registrazione ||
    data?.data_documento ||
    data?.documento?.data
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  if (entryCreatedAt) {
    const d = new Date(entryCreatedAt)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

/**
 * Dopo insert su accounting_entries: crea/aggiorna riga partitari e log PARTITARIO_UPDATED.
 *
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   entry: { id: string, document_id: string, data?: Record<string, unknown>, created_at?: string },
 *   log?: (event: string, payload?: Record<string, unknown>) => void,
 * }} opts
 * @returns {Promise<{ ok: boolean, skipped?: string, partitario_id?: string }>}
 */
export async function syncPartitarioFromAccountingEntry(opts) {
  const { db, entry, log } = opts || {}
  const L = log || ((e, p) => console.log(`[partitarioSync] ${e}`, p || ''))

  if (!db || !entry?.id || !entry.document_id) {
    L('PARTITARIO_SKIPPED', { reason: 'missing_db_or_entry' })
    return { ok: false, skipped: 'missing_db_or_entry' }
  }

  // Pipeline: runAiAccounting (AI_PROPOSED) + runAccounting minimo (CREATED). Evita doppio partitario.
  if (entry.status === 'CREATED') {
    const { count, error: cntErr } = await db
      .from('accounting_entries')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', entry.document_id)
      .eq('status', 'AI_PROPOSED')
    if (!cntErr && (count || 0) > 0) {
      L('PARTITARIO_SKIPPED', {
        reason: 'duplicato_pipeline_minimal_vs_ai',
        document_id: entry.document_id,
        accounting_entry_id: entry.id,
      })
      return { ok: false, skipped: 'duplicato_pipeline' }
    }
  }

  const data = entry.data && typeof entry.data === 'object' ? entry.data : {}
  if (data.skip_partitario === true) {
    L('PARTITARIO_SKIPPED', { reason: 'skip_partitario_flag', document_id: entry.document_id })
    return { ok: false, skipped: 'skip_partitario' }
  }

  const rows = Array.isArray(data.rows) ? data.rows : []
  let tipoDoc = null
  if (String(data.tipo || '').includes('acquisto') || data.tipo === 'acquisto') tipoDoc = 'acquisto'
  else if (String(data.tipo || '').includes('vendita') || data.tipo === 'vendita') tipoDoc = 'vendita'

  const soggettoId = await resolveSoggettoId({
    db,
    documentId: entry.document_id,
    data,
    rows,
  })

  if (!soggettoId) {
    L('PARTITARIO_SKIPPED', {
      reason: 'soggetto_non_risolto',
      document_id: entry.document_id,
      accounting_entry_id: entry.id,
    })
    return { ok: false, skipped: 'soggetto_non_risolto' }
  }

  const dareAvere = extractDareAvere({
    data,
    rows,
    tipoAcquistoVendita: tipoDoc,
    log: L,
  })
  if (!dareAvere || (dareAvere.dare === 0 && dareAvere.avere === 0)) {
    L('PARTITARIO_SKIPPED', {
      reason: 'importi_zero',
      document_id: entry.document_id,
      accounting_entry_id: entry.id,
    })
    return { ok: false, skipped: 'importi_zero' }
  }

  const dataMov = extractDataMovimento(data, entry.created_at)

  const { data: lastRow, error: lastErr } = await db
    .from('partitari')
    .select('saldo_progressivo')
    .eq('soggetto_id', soggettoId)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastErr) {
    L('PARTITARIO_SYNC_ERROR', { step: 'read_last_saldo', error: lastErr.message || String(lastErr) })
    return { ok: false, skipped: 'db_read' }
  }

  const prevSaldo = lastRow?.saldo_progressivo != null ? toNum(lastRow.saldo_progressivo) : 0
  const net = round2(dareAvere.dare - dareAvere.avere)
  const saldoProgressivo = round2(prevSaldo + net)

  await db.from('partitari').delete().eq('accounting_entry_id', entry.id)

  const ins = await db
    .from('partitari')
    .insert([
      {
        soggetto_id: soggettoId,
        documento_id: String(entry.document_id),
        accounting_entry_id: entry.id,
        data: dataMov,
        dare: dareAvere.dare,
        avere: dareAvere.avere,
        saldo_progressivo: saldoProgressivo,
        descrizione: dareAvere.descrizione,
      },
    ])
    .select('id')
    .maybeSingle()

  if (ins.error) {
    L('PARTITARIO_SYNC_ERROR', { step: 'insert', error: ins.error.message || String(ins.error) })
    return { ok: false, skipped: 'insert_failed' }
  }

  L('PARTITARIO_UPDATED', {
    document_id: entry.document_id,
    accounting_entry_id: entry.id,
    soggetto_id: soggettoId,
    data: dataMov,
    dare: dareAvere.dare,
    avere: dareAvere.avere,
    saldo_progressivo: saldoProgressivo,
    prev_saldo: prevSaldo,
  })

  return { ok: true, partitario_id: ins.data?.id }
}
