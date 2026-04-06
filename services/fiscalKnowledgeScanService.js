/**
 * Verifica “fonti attendibili” — v1: nessuno scraping automatico.
 * Crea un batch con voci di promemoria + link ufficiali / testate da rivedere in app.
 * In futuro: fetch controllato + estrazione assistita (sempre con conferma umana).
 */

import { getSupabaseAdmin } from '../lib/db.js'

const SOURCE_CATALOG = [
  {
    label: 'Agenzia delle Entrate — Portale',
    url: 'https://www.agenziaentrate.gov.it/portale/web/guest/home',
  },
  {
    label: 'Agenzia delle Entrate — IVA',
    url: 'https://www.agenziaentrate.gov.it/portale/iva',
  },
  {
    label: 'Agenzia Entrate-Riscossione',
    url: 'https://www.aer.it/',
  },
  {
    label: 'Il Sole 24 Ore — Norme & Tributi',
    url: 'https://www.ilsole24ore.com/norme-e-tributi',
  },
  {
    label: 'Fisco Focus (Sole 24 Ore)',
    url: 'https://fisco.focus.it/',
  },
]

/**
 * @param {{ db?: import('@supabase/supabase-js').SupabaseClient, log?: (e:string,p?:any)=>void }} [opts]
 * @returns {Promise<{ ok: boolean, batchId?: string, error?: string, itemsCount?: number }>}
 */
export async function runFiscalKnowledgePlaceholderScan(opts = {}) {
  const log = opts.log || ((e, p) => console.log(`[fiscalKnowledgeScan] ${e}`, p ?? ''))
  const db = opts.db || (await getSupabaseAdmin())

  const title = `Verifica fonti ${new Date().toISOString().slice(0, 10)}`
  const sources_summary = SOURCE_CATALOG.map((s) => `${s.label}: ${s.url}`).join('\n')

  const insBatch = await db
    .from('fiscal_knowledge_proposals')
    .insert([
      {
        status: 'pending',
        title,
        notes:
          'Scansione automatica non eseguita: voci generate come promemoria. Confrontare manualmente le fonti elencate e confermare o rifiutare ogni proposta. Le integrazioni automatiche saranno aggiunte con versioni successive.',
        sources_summary,
        scan_meta: {
          engine: 'placeholder_v1',
          catalog: SOURCE_CATALOG,
          generated_at: new Date().toISOString(),
        },
      },
    ])
    .select('id')
    .maybeSingle()

  if (insBatch.error || !insBatch.data?.id) {
    const err = insBatch.error?.message || 'insert batch failed'
    log('FISCAL_SCAN_BATCH_FAILED', { error: err })
    return { ok: false, error: err }
  }

  const batchId = insBatch.data.id

  const items = SOURCE_CATALOG.map((s, i) => ({
    batch_id: batchId,
    sort_order: i,
    categoria: 'documento',
    chiave: `fonte_verifica_${i + 1}`,
    valore: `Consultare aggiornamenti su: ${s.label}. Nessun testo normativo è stato importato automaticamente.`,
    contesto: 'Italia',
    descrizione: `Fonte indicativa per revisione periodica regole IA. URL: ${s.url}`,
    metadata: { scan_engine: 'placeholder_v1' },
    source_url: s.url,
    source_label: s.label,
    proposed_action: 'add',
  }))

  const insItems = await db.from('fiscal_knowledge_proposal_items').insert(items).select('id')
  if (insItems.error) {
    log('FISCAL_SCAN_ITEMS_FAILED', { batchId, error: insItems.error.message })
    await db.from('fiscal_knowledge_proposals').delete().eq('id', batchId)
    return { ok: false, error: insItems.error.message }
  }

  log('FISCAL_SCAN_PLACEHOLDER_OK', { batchId, itemsCount: items.length })
  return { ok: true, batchId, itemsCount: items.length }
}
