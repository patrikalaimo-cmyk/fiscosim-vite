/**
 * Registri IVA: popolamento da ai_parsing_results + accounting_entries (righe IVA / contabile).
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

function parseAliquota(v) {
  const n = toNum(v)
  if (n > 0 && n <= 1) return round2(n * 100)
  return n
}

/**
 * @param {Record<string, unknown>} pj
 * @returns {{ imponibile: number, iva: number, aliquota: number | null }[]}
 */
function buildIvaLinesFromParsing(pj) {
  if (!pj || typeof pj !== 'object') return []

  const datiEst = pj.dati_estratti || pj.datiEstratti || {}
  const riepilogoLista = Array.isArray(datiEst.riepilogo_iva) ? datiEst.riepilogo_iva : []

  if (riepilogoLista.length > 0) {
    const out = []
    for (let i = 0; i < riepilogoLista.length; i++) {
      const r = riepilogoLista[i] || {}
      const imponibile = toNum(r.imponibile ?? r.Imponibile)
      const iva = toNum(r.imposta ?? r.Imposta ?? r.iva)
      const aliquota = parseAliquota(r.aliquota ?? r.Aliquota) || null
      if (imponibile === 0 && iva === 0) continue
      out.push({ imponibile, iva, aliquota, riga_idx: i })
    }
    if (out.length) return out
  }

  const c = pj.contabile || {}
  const imponibile = toNum(c.imponibile)
  const iva = toNum(c.iva)
  let aliquota = c.aliquota != null ? parseAliquota(c.aliquota) : null
  if (aliquota == null && imponibile > 0 && iva > 0) {
    aliquota = round2((iva / imponibile) * 100)
  }
  if (imponibile === 0 && iva === 0) return []
  return [{ imponibile, iva, aliquota, riga_idx: 0 }]
}

/**
 * @param {unknown[]} rows
 * @returns {string | null}
 */
function findCausaleIvaIdFromRows(rows) {
  if (!Array.isArray(rows)) return null
  const ivaRow = rows.find((r) => r && r.tipo_riga_auto === 'iva' && r.causale_iva_id)
  return ivaRow?.causale_iva_id ? String(ivaRow.causale_iva_id) : null
}

/**
 * acquisto = registro acquisti (fatture passive); vendita = registro vendite (fatture attive).
 *
 * @param {Record<string, unknown>} data
 * @param {Record<string, unknown> | null} parsingJson
 */
function resolveTipoAcquistoVendita(data, parsingJson) {
  const t = String(data?.tipo || '').toLowerCase()
  if (t.includes('vendita') || t === 'attivo') return 'vendita'
  if (t.includes('acquisto') || t === 'passivo' || t === 'acquisto') return 'acquisto'

  const az = parsingJson?.azioni_suggerite
  if (Array.isArray(az) && az.some((a) => String(a).includes('registrazione_vendita'))) return 'vendita'
  if (Array.isArray(az) && az.some((a) => String(a).includes('registrazione_acquisto'))) return 'acquisto'

  const meta = parsingJson?.meta || {}
  if (String(meta.tipo_documento || '').toLowerCase() === 'attivo') return 'vendita'
  if (String(meta.tipo_documento || '').toLowerCase() === 'passivo') return 'acquisto'

  return 'acquisto'
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string | null} causaleIvaId
 * @returns {Promise<{ detraibile: boolean, percentuale_detraibilita: number }>}
 */
async function loadDetraibilitaFromCausale(db, causaleIvaId) {
  const def = { detraibile: true, percentuale_detraibilita: 100 }
  if (!causaleIvaId || !db) return def
  try {
    const { data: row } = await db
      .from('causali_iva')
      .select('detraibile, percentuale_detraibilita')
      .eq('id', causaleIvaId)
      .maybeSingle()
    if (!row) return def
    let pct = 100
    if (row.percentuale_detraibilita != null && String(row.percentuale_detraibilita).trim() !== '') {
      pct = Math.max(0, Math.min(100, toNum(row.percentuale_detraibilita)))
    }
    if (row.detraibile === false) pct = 0
    return { detraibile: row.detraibile !== false && pct > 0, percentuale_detraibilita: pct }
  } catch {
    return def
  }
}

function extractDataMovimento(data, parsingJson, entryCreatedAt) {
  const raw =
    data?.data ||
    data?.data_registrazione ||
    parsingJson?.documento?.data ||
    parsingJson?.documento?.data_documento
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
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   entry: { id: string, document_id: string, data?: Record<string, unknown>, status?: string, created_at?: string },
 *   log?: (event: string, payload?: Record<string, unknown>) => void,
 * }} opts
 */
export async function syncRegistriIvaFromAccountingEntry(opts) {
  const { db, entry, log } = opts || {}
  const L = log || ((e, p) => console.log(`[ivaRegistri] ${e}`, p || ''))

  if (!db || !entry?.id || !entry.document_id) {
    L('IVA_REGISTER_SKIPPED', { reason: 'missing_db_or_entry' })
    return { ok: false, skipped: 'missing_db_or_entry' }
  }

  if (entry.status === 'CREATED') {
    const { count, error: cntErr } = await db
      .from('accounting_entries')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', entry.document_id)
      .eq('status', 'AI_PROPOSED')
    if (!cntErr && (count || 0) > 0) {
      L('IVA_REGISTER_SKIPPED', {
        reason: 'duplicato_pipeline_minimal_vs_ai',
        document_id: entry.document_id,
      })
      return { ok: false, skipped: 'duplicato_pipeline' }
    }
  }

  let parsingJson = null
  try {
    const { data: pr } = await db
      .from('ai_parsing_results')
      .select('json_output')
      .eq('document_id', entry.document_id)
      .maybeSingle()
    if (pr?.json_output) {
      parsingJson = pr.json_output
      if (typeof parsingJson === 'string') {
        try {
          parsingJson = JSON.parse(parsingJson)
        } catch {
          parsingJson = null
        }
      }
    }
  } catch {
    parsingJson = null
  }

  const data = entry.data && typeof entry.data === 'object' ? entry.data : {}
  const rows = Array.isArray(data.rows) ? data.rows : []

  const lines = buildIvaLinesFromParsing(parsingJson)
  if (lines.length === 0) {
    L('IVA_REGISTER_SKIPPED', {
      reason: 'nessuna_riga_iva',
      document_id: entry.document_id,
      accounting_entry_id: entry.id,
    })
    return { ok: false, skipped: 'nessuna_riga_iva' }
  }

  const tipo = resolveTipoAcquistoVendita(data, parsingJson)
  const dataMov = extractDataMovimento(data, parsingJson, entry.created_at)
  const causaleIvaId = findCausaleIvaIdFromRows(rows) || data.causale_iva_id || null
  const detMeta = await loadDetraibilitaFromCausale(db, causaleIvaId)

  await db.from('registri_iva').delete().eq('accounting_entry_id', entry.id)

  const toInsert = []
  for (const line of lines) {
    const imp = round2(line.imponibile)
    const tax = round2(line.iva)
    let pctDet = detMeta.percentuale_detraibilita
    let detraibile = detMeta.detraibile
    if (tipo === 'vendita') {
      detraibile = true
      pctDet = 100
    }
    const ivaDet = round2((tax * pctDet) / 100)
    const ivaInd = round2(tax - ivaDet)

    toInsert.push({
      documento_id: String(entry.document_id),
      accounting_entry_id: entry.id,
      riga_idx: line.riga_idx ?? 0,
      data: dataMov,
      imponibile: imp,
      iva: tax,
      aliquota: line.aliquota,
      tipo,
      detraibile,
      percentuale_detraibilita: pctDet,
      iva_detraibile: ivaDet,
      iva_indetraibile: ivaInd,
      causale_iva_id: causaleIvaId || null,
    })
  }

  const ins = await db.from('registri_iva').insert(toInsert).select('id')

  if (ins.error) {
    L('IVA_REGISTER_SYNC_ERROR', { error: ins.error.message || String(ins.error) })
    return { ok: false, skipped: 'insert_failed' }
  }

  L('IVA_REGISTER_UPDATED', {
    document_id: entry.document_id,
    accounting_entry_id: entry.id,
    righe: toInsert.length,
    tipo,
    detraibile: detMeta.detraibile,
    percentuale_detraibilita: detMeta.percentuale_detraibilita,
  })

  return { ok: true, count: toInsert.length, rows: ins.data }
}
