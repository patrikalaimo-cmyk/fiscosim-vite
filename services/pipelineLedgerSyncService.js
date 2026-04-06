/**
 * Fasi partitari / IVA dopo insert su accounting_entries (pipeline tracciata).
 * Usare quando deferLedgerSync evita sync in runAiAccounting / runAccounting.
 */

import { syncPartitarioFromAccountingEntry } from './partitarioSyncService.js'
import { syncRegistriIvaFromAccountingEntry } from './ivaRegistriSyncService.js'
import { logBilancioUpdated } from './bilancioMastriniService.js'
import { maybeAutoValidateAfterPersist } from './autoValidateAccountingEngine.js'

/**
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   documentId: string,
 *   log?: (event: string, payload?: Record<string, unknown>) => void,
 * }} p
 */
export async function runPartitariPhaseForDocument({ db, documentId, log }) {
  if (!db?.from || !documentId) {
    return { entries_count: 0, results: [], error: 'db o documentId mancante' }
  }
  const { data: entries, error } = await db.from('accounting_entries').select('*').eq('document_id', documentId)
  if (error) {
    return { entries_count: 0, results: [], error: error.message || String(error) }
  }
  const list = Array.isArray(entries) ? entries : []
  const results = []
  for (const entry of list) {
    if (!entry?.id) continue
    const rowOut = { entry_id: entry.id }
    try {
      const r = await syncPartitarioFromAccountingEntry({ db, entry, log })
      rowOut.sync = r
    } catch (e) {
      rowOut.error = e?.message || String(e)
    }
    results.push(rowOut)
  }
  return { entries_count: list.length, results }
}

/**
 * Bilancio (una volta per documento), sync registri IVA e auto-validate per ogni entry.
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   documentId: string,
 *   log?: (event: string, payload?: Record<string, unknown>) => void,
 * }} p
 */
export async function runIvaLedgerPhaseForDocument({ db, documentId, log }) {
  if (!db?.from || !documentId) {
    return { entries_count: 0, results: [], error: 'db o documentId mancante' }
  }
  const { data: entries, error } = await db.from('accounting_entries').select('*').eq('document_id', documentId)
  if (error) {
    return { entries_count: 0, results: [], error: error.message || String(error) }
  }
  const list = Array.isArray(entries) ? entries : []
  try {
    await logBilancioUpdated({ documentId, log, deps: { db } })
  } catch {
    /* best-effort */
  }
  const results = []
  for (const entry of list) {
    if (!entry?.id) continue
    const rowOut = { entry_id: entry.id }
    try {
      await syncRegistriIvaFromAccountingEntry({ db, entry, log })
      rowOut.registri_iva_ok = true
    } catch (e) {
      rowOut.registri_iva_error = e?.message || String(e)
    }
    try {
      await maybeAutoValidateAfterPersist(db, entry, log)
      rowOut.auto_validate_touched = true
    } catch (e) {
      rowOut.auto_validate_error = e?.message || String(e)
    }
    results.push(rowOut)
  }
  return { entries_count: list.length, results }
}
