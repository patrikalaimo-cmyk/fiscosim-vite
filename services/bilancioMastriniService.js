/**
 * Mastrini e bilancio: viste SQL su accounting_entries (vedi migration mastrini_bilancio).
 * Qui: log operativo e lettura opzionale via API/servizi.
 */

import { logStep } from './aiSupervisorService.js'

/**
 * Dopo nuove scritture: le viste mastrini/bilancio riflettono automaticamente i dati.
 * Log strutturato per tracciabilità (e opzionale riga in ai_logs).
 *
 * @param {{
 *   documentId?: string | null,
 *   log?: (event: string, payload?: Record<string, unknown>) => void,
 *   deps?: { db?: import('@supabase/supabase-js').SupabaseClient },
 *   persistAiLog?: boolean,
 * }} opts
 */
export async function logBilancioUpdated(opts = {}) {
  const { documentId, log, deps = {}, persistAiLog = true } = opts
  const L = log || ((e, p) => console.log(`[bilancioMastrini] ${e}`, p || ''))

  const docId =
    documentId && String(documentId).trim() ? String(documentId).trim() : 'bilancio-unknown'

  const payload = {
    kind: 'BILANCIO',
    event: 'BILANCIO_UPDATED',
    views: ['mastrini', 'bilancio_stato_patrimoniale', 'bilancio_conto_economico', 'bilancio'],
    note: 'Aggregazione da accounting_entries (data.rows); join piano_conti per sezioni',
  }

  L('BILANCIO_UPDATED', { documentId: docId, ...payload })

  if (persistAiLog && deps.db && typeof deps.db.from === 'function') {
    try {
      await logStep(docId, 'BILANCIO', JSON.stringify(payload), 'info', { deps })
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Lettura mastrini (tabella/vista).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {Promise<{ data: unknown[] | null, error: Error | null }>}
 */
export async function fetchMastrini(db) {
  if (!db?.from) return { data: null, error: new Error('db mancante') }
  return db.from('mastrini').select('*').order('conto_id')
}

/**
 * Bilancio unificato (colonna sezione).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {Promise<{ data: unknown[] | null, error: Error | null }>}
 */
export async function fetchBilancio(db) {
  if (!db?.from) return { data: null, error: new Error('db mancante') }
  return db
    .from('bilancio')
    .select('*')
    .order('sezione', { ascending: true })
    .order('conto_id', { ascending: true })
}
