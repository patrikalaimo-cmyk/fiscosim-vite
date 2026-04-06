/**
 * Conoscenza fiscale/contabile da tabella `fiscal_knowledge` (Supabase).
 * Usata per arricchire i prompt AI senza dipendere dalla data di training del modello.
 */

/**
 * @param {unknown} row
 * @param {Date} ref
 * @returns {boolean}
 */
function rowValidAt(row, ref) {
  if (!row || row.attivo === false) return false
  const t = ref.getTime()
  if (row.valido_dal) {
    const d = new Date(row.valido_dal)
    if (!Number.isNaN(d.getTime()) && d.getTime() > t) return false
  }
  if (row.valido_al) {
    const a = new Date(row.valido_al)
    if (!Number.isNaN(a.getTime()) && a.getTime() < t) return false
  }
  return true
}

/**
 * Carica righe attive dalla knowledge base, opzionalmente filtrate per categoria.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string | string[] | null | undefined} categoria - Una categoria, un elenco, o null/undefined per tutte
 * @param {{ referenceDate?: Date | string }} [options]
 * @returns {Promise<{ ok: boolean, rows: any[], error?: string }>}
 */
export async function getFiscalKnowledge(db, categoria, options = {}) {
  if (!db || typeof db.from !== 'function') {
    return { ok: false, rows: [], error: 'db mancante' }
  }

  const ref = options.referenceDate != null ? new Date(options.referenceDate) : new Date()
  if (Number.isNaN(ref.getTime())) {
    return { ok: false, rows: [], error: 'referenceDate non valida' }
  }

  try {
    let q = db.from('fiscal_knowledge').select('*').eq('attivo', true)

    if (categoria != null && categoria !== '') {
      if (Array.isArray(categoria)) {
        const list = categoria.filter(Boolean)
        if (list.length) q = q.in('categoria', list)
      } else {
        q = q.eq('categoria', String(categoria))
      }
    }

    const { data, error } = await q
      .order('categoria', { ascending: true })
      .order('chiave', { ascending: true })

    if (error) {
      return { ok: false, rows: [], error: error.message || String(error) }
    }

    const rows = (data || []).filter((r) => rowValidAt(r, ref))
    return { ok: true, rows, error: undefined }
  } catch (e) {
    return { ok: false, rows: [], error: e?.message || String(e) }
  }
}

/**
 * Blocco testo compatto per system/user prompt (tetto caratteri per contesto LLM).
 *
 * @param {any[]} rows
 * @param {{ maxChars?: number }} [options]
 * @returns {string}
 */
export function formatFiscalKnowledgeForPrompt(rows, options = {}) {
  const maxChars = options.maxChars ?? 14000
  if (!Array.isArray(rows) || !rows.length) return ''

  const lines = rows.map((r) => {
    const ctx = r.contesto ? ` [contesto: ${r.contesto}]` : ''
    const desc = r.descrizione ? ` — ${r.descrizione}` : ''
    let meta = ''
    if (r.metadata && typeof r.metadata === 'object' && Object.keys(r.metadata).length) {
      try {
        meta = ` {meta:${JSON.stringify(r.metadata)}}`
      } catch {
        meta = ''
      }
    }
    const dal = r.valido_dal ? ` dal ${r.valido_dal}` : ''
    const al = r.valido_al ? ` al ${r.valido_al}` : ''
    const period = dal || al ? `${dal}${al}` : ''
    return `- [${r.categoria}/${r.chiave}]${period}${ctx}: ${String(r.valore ?? '')}${desc}${meta}`
  })

  let s = lines.join('\n')
  if (s.length > maxChars) s = s.slice(0, maxChars) + '\n…[fiscal_knowledge troncato]'
  return s
}

/** Se `formatFiscalKnowledgeForPrompt` è vuoto, il prompt deve comunque citare il DB. */
export const FISCAL_KNOWLEDGE_EMPTY_PLACEHOLDER =
  '(Nessuna riga attiva in fiscal_knowledge per le categorie selezionate.)'

/**
 * Sempre invocare `formatFiscalKnowledgeForPrompt` su `rows`, poi placeholder se stringa vuota.
 *
 * @param {any[]} rows
 * @param {{ maxChars?: number }} [formatOptions]
 * @returns {string}
 */
export function promptBodyFromFiscalRows(rows, formatOptions) {
  const formatted = formatFiscalKnowledgeForPrompt(Array.isArray(rows) ? rows : [], formatOptions || {})
  const t = String(formatted || '').trim()
  return t || FISCAL_KNOWLEDGE_EMPTY_PLACEHOLDER
}

/**
 * Aggiunge sempre il blocco fiscal_knowledge al prompt di sistema (anche solo placeholder).
 *
 * @param {string} basePrompt
 * @param {string} bodyText — output di `promptBodyFromFiscalRows` o testo già formattato
 * @returns {string}
 */
export function appendFiscalKnowledgeToPromptBase(basePrompt, bodyText) {
  const b = String(bodyText || '').trim() || FISCAL_KNOWLEDGE_EMPTY_PLACEHOLDER
  return `${basePrompt}\n\n--- Riferimenti operativi (database FiscoSim fiscal_knowledge) ---\nApplica queste indicazioni come linee guida; in caso di conflitto con il documento, prevale il documento e segnala in meta.anomalie.\n\n${b}\n`
}

/** Categorie default per il parsing documenti / estrazione. */
export const FISCAL_CATEGORIES_PARSING = ['documento', 'iva', 'contabile', 'regime']

/** Categorie default per contabilità / revisione. */
export const FISCAL_CATEGORIES_ACCOUNTING = ['contabile', 'iva', 'regime', 'supervisione']
