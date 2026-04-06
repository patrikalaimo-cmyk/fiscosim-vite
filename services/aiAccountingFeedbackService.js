/**
 * Registra feedback confronto conto predetto (accounting_entries / auto_validate) vs conto finale.
 */

import { inferContoIdFromAccountingRows } from './autoValidateAccountingEngine.js'
import { applyLearningFromFeedback } from './aiLearningEngine.js'

function normPiva(v) {
  if (v == null) return ''
  return String(v)
    .replace(/\s/g, '')
    .replace(/^IT/i, '')
    .toUpperCase()
}

function findAnagraficaContoId(pianoConti, pivaNorm) {
  if (!pivaNorm || !Array.isArray(pianoConti)) return null
  const c = pianoConti.find((row) => {
    const p = normPiva(row.partita_iva || row.anagrafica_piva)
    return p && p === pivaNorm && (row.is_fornitore || row.is_cliente) && row.livello >= 3
  })
  return c?.id ?? null
}

function normContoId(id) {
  if (id == null || id === '') return null
  return String(id)
}

function contoIdsEqual(a, b) {
  const na = normContoId(a)
  const nb = normContoId(b)
  if (!na && !nb) return true
  if (!na || !nb) return false
  return na === nb
}

async function loadPianoConti(db, societaId) {
  if (!societaId || !db) return []
  const { data, error } = await db
    .from('piano_conti')
    .select('id,codice,descrizione,partita_iva,anagrafica_piva,is_fornitore,is_cliente,livello')
    .eq('societa_id', societaId)
    .eq('attivo', true)
  if (error) console.warn('[aiFeedback] piano_conti', error.message)
  return data || []
}

async function getLatestAccountingEntry(db, documentId) {
  if (!documentId || !db) return null
  const { data, error } = await db
    .from('accounting_entries')
    .select('*')
    .eq('document_id', String(documentId))
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) {
    console.warn('[aiFeedback] accounting_entries', error.message)
    return null
  }
  return data?.[0] || null
}

export function getPredictedContoIdFromEntry(entry, pianoConti) {
  if (!entry) return null
  const meta = entry.auto_validate_meta
  if (meta && typeof meta === 'object' && meta.proposedContoId != null && meta.proposedContoId !== '') {
    return meta.proposedContoId
  }
  const rows = entry.data && typeof entry.data === 'object' ? entry.data.rows : null
  return inferContoIdFromAccountingRows(rows, pianoConti || []) || null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{
 *   documentId: string,
 *   finalContoId: string | null | undefined,
 *   primaNotaRigaId?: string | null,
 *   documentRow?: object | null,
 *   pianoConti?: object[] | null,
 * }} opts
 * @returns {Promise<{ ok: true, inserted: boolean, tipo?: string } | { ok: false, error: string }>}
 */
export async function recordAiAccountingFeedback(db, opts) {
  const documentId = opts?.documentId
  if (!db || !documentId) return { ok: false, error: 'db o documentId mancante' }

  let doc = opts.documentRow
  if (!doc) {
    const { data, error } = await db.from('documenti_contabilita').select('*').eq('id', documentId).maybeSingle()
    if (error) return { ok: false, error: error.message }
    doc = data
  }
  if (!doc) return { ok: false, error: 'documento non trovato' }

  const societaId = doc.societa_id
  const pianoConti = opts.pianoConti?.length ? opts.pianoConti : await loadPianoConti(db, societaId)

  const entry = await getLatestAccountingEntry(db, documentId)
  const contoPredetto = getPredictedContoIdFromEntry(entry, pianoConti)

  const finalRaw = opts.finalContoId !== undefined ? opts.finalContoId : doc.conto_id
  const contoCorretto = finalRaw != null && finalRaw !== '' ? finalRaw : null

  const pivaNorm = normPiva(doc.soggetto_piva)
  const anagraficaId = findAnagraficaContoId(pianoConti, pivaNorm)

  if (!contoPredetto && !contoCorretto) {
    return { ok: true, inserted: false, reason: 'no_conti' }
  }

  const tipo = contoIdsEqual(contoPredetto, contoCorretto) ? 'conferma' : 'correzione'

  const payload = {
    prima_nota_riga_id: opts.primaNotaRigaId != null && opts.primaNotaRigaId !== '' ? opts.primaNotaRigaId : null,
    conto_predetto: contoPredetto,
    conto_corretto: contoCorretto,
    anagrafica_id: anagraficaId,
    tipo,
  }

  const { error: insErr } = await db.from('ai_feedback_log').insert(payload)
  if (insErr) {
    console.warn('[aiFeedback] insert', insErr.message)
    return { ok: false, error: insErr.message }
  }

  if (anagraficaId && contoCorretto) {
    await applyLearningFromFeedback(db, {
      societaId,
      anagraficaId,
      contoId: contoCorretto,
      tipo,
    })
  }

  return { ok: true, inserted: true, tipo }
}

/**
 * Dopo approvazione multipla: un record per documento (conto = quello sul documento al momento della richiesta).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string[]} documentIds
 */
export async function recordAiAccountingFeedbackBatch(db, documentIds) {
  const ids = Array.isArray(documentIds) ? documentIds.filter(Boolean) : []
  if (!ids.length) return { ok: true, results: [] }
  const results = []
  for (const id of ids) {
    const r = await recordAiAccountingFeedback(db, { documentId: id })
    results.push({ documentId: id, ...r })
  }
  return { ok: true, results }
}
