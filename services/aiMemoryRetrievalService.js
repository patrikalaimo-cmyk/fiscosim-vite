/**
 * Recupero memoria da ai_document_memory per arricchire prompt AI (parsing / accounting).
 */

import { createLayoutHash } from '../lib/layoutHash.js'
import { extractSupplierFromParsingJson } from './aiDocumentMemoryService.js'

/** Tetto unico blocco memoria nel prompt (istruzione + elenco esempi). */
export const AI_MEMORY_PROMPT_MAX_CHARS = 1500

/** Avviso forte per il modello (anche in assenza di altro testo guida). */
export const AI_MEMORY_IMPORTANT_BLOCK =
  'IMPORTANTE:\nSe i documenti simili sono coerenti, SEGUILI come riferimento principale.'

/** Alias breve per compatibilità con import esistenti. */
export const AI_MEMORY_GUIDANCE_LINE =
  'Se i documenti simili sono coerenti, SEGUILI come riferimento principale.'

const DEFAULT_MAX_BLOCK_CHARS = AI_MEMORY_PROMPT_MAX_CHARS

function normPiva(v) {
  if (v == null) return null
  const s = String(v).replace(/\s/g, '').replace(/^IT/i, '')
  return s.length >= 8 ? s : String(v).trim() || null
}

function sanitizeIlikeFragment(s) {
  return String(s || '')
    .replace(/[%_\\]/g, ' ')
    .trim()
    .slice(0, 80)
}

/**
 * Sintesi compatta di parsing_result per prompt.
 *
 * @param {unknown} parsing
 * @returns {string}
 */
export function synthesizeParsingForMemory(parsing) {
  const p = parsing && typeof parsing === 'object' ? /** @type {Record<string, unknown>} */ (parsing) : {}
  const doc = p.documento && typeof p.documento === 'object' ? p.documento : {}
  const f = doc.fornitore && typeof doc.fornitore === 'object' ? doc.fornitore : {}
  const c = p.contabile && typeof p.contabile === 'object' ? p.contabile : {}
  const bits = []
  const nome = f.nome ?? p.cedente_denom
  if (nome) bits.push(`forn ${String(nome).slice(0, 48)}`)
  const pv = f.piva ?? p.cedente_piva
  if (pv) bits.push(`P.IVA ${String(pv).slice(0, 16)}`)
  const imp = c.imponibile ?? p.imponibile
  const iva = c.iva ?? p.iva
  if (imp != null) bits.push(`imp ${imp}`)
  if (iva != null) bits.push(`iva ${iva}`)
  if (p.causale) bits.push(String(p.causale).slice(0, 56))
  return bits.join('; ') || '(vuoto)'
}

/**
 * Sintesi compatta di accounting_result per prompt.
 *
 * @param {unknown} acc
 * @returns {string}
 */
export function synthesizeAccountingForMemory(acc) {
  const a = acc && typeof acc === 'object' ? /** @type {Record<string, unknown>} */ (acc) : {}
  if (Array.isArray(a.rows) && a.rows.length) {
    return a.rows
      .slice(0, 5)
      .map((r) => {
        const x = r && typeof r === 'object' ? r : {}
        const co = String(x.conto ?? '').slice(0, 24)
        return `${co || '?'} D${x.dare ?? 0}/A${x.avere ?? 0}`
      })
      .join(' | ')
  }
  if (a.tipo != null || a.totale != null) return `tipo ${a.tipo ?? ''} tot ${a.totale ?? ''}`.trim()
  return ''
}

function synthesizeClarificationsForMemory(parsing, accounting) {
  const chunks = []
  const parsingClarifications = parsing && typeof parsing === 'object' ? parsing.operator_clarifications : null
  const accountingClarifications = accounting && typeof accounting === 'object' ? accounting.operator_clarifications : null
  const all = []
  if (Array.isArray(parsingClarifications)) all.push(...parsingClarifications)
  if (Array.isArray(accountingClarifications)) all.push(...accountingClarifications)
  for (const row of all.slice(0, 3)) {
    const type = String(row?.type || '').trim()
    const sel = String(row?.selected_label || row?.selected || '').trim()
    const answer = String(row?.selected_answer || '').trim()
    const title = String(row?.title || '').trim()
    if (!type && !sel && !answer) continue
    chunks.push(`${title || type}: ${answer || sel}`)
  }
  return chunks.join(' | ')
}

/**
 * Estrae prima P.IVA italiana plausibile dal testo grezzo.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function extractPivaHintFromText(text) {
  const t = String(text || '').slice(0, 12000)
  const m = t.match(/\bIT\s*([0-9]{11})\b/i) || t.match(/\b([0-9]{11})\b/)
  if (!m) return null
  const raw = (m[1] || m[0]).replace(/\D/g, '')
  if (raw.length < 11) return null
  return normPiva(raw)
}

const MEMORY_SELECT =
  'id, layout_hash, partita_iva, fornitore_nome, parsing_result, accounting_result, operatore_corrections, source_document_id, created_at'

/**
 * Record con correzioni operatore prima (per prompt “verità reale”).
 *
 * @param {any[]} rows
 * @returns {any[]}
 */
export function sortMemoryRowsByOperatorCorrections(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ca = a?.operatore_corrections != null ? 1 : 0
    const cb = b?.operatore_corrections != null ? 1 : 0
    if (cb !== ca) return cb - ca
    const ta = new Date(a?.created_at || 0).getTime()
    const tb = new Date(b?.created_at || 0).getTime()
    return tb - ta
  })
}

/**
 * Ordine retrieval memoria (dal più forte al più debole):
 * 1) layout_hash + operatore_corrections (priorità massima)
 * 2) layout_hash
 * 3) partita_iva
 * 4) fornitore_nome
 *
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   layoutHash?: string | null,
 *   partitaIva?: string | null,
 *   fornitoreNome?: string | null,
 *   limit?: number,
 *   log?: (e: string, p?: Record<string, unknown>) => void,
 * }} opts
 * @returns {Promise<any[]>}
 */
export async function fetchPrioritizedMemoryRows(
  db,
  { layoutHash, partitaIva, fornitoreNome, limit = 3, log } = {}
) {
  if (!db || typeof db.from !== 'function') return []

  const cap = Math.min(Math.max(1, limit), 3)
  const maxFetch = Math.max(cap * 4, 12)
  const collected = []
  const seen = new Set()

  const addRows = (rows, tier) => {
    const ordered =
      tier === 'layout_hash' || tier === 'partita_iva' || tier === 'fornitore_nome'
        ? sortMemoryRowsByOperatorCorrections(rows || [])
        : [...(rows || [])].sort(
            (a, b) =>
              new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
          )
    for (const row of ordered) {
      if (!row?.id || seen.has(row.id)) continue
      if (collected.length >= cap) break
      seen.add(row.id)
      collected.push(row)
    }
  }

  // 1) layout_hash + operatore_corrections (massima priorità — dati verificati operatore)
  if (layoutHash) {
    const { data, error } = await db
      .from('ai_document_memory')
      .select(MEMORY_SELECT)
      .eq('layout_hash', layoutHash)
      .not('operatore_corrections', 'is', null)
      .order('created_at', { ascending: false })
      .limit(maxFetch)
    if (!error && data?.length) {
      const nBefore = collected.length
      addRows(data, 'layout_hash_corrections')
      const added = collected.length - nBefore
      if (added > 0) {
        log?.('AI_MEMORY_PRIORITY_CORRECTIONS', {
          tier: 'layout_hash+operatore_corrections',
          added,
          layout_hash: layoutHash,
          total_so_far: collected.length,
          cap,
        })
      }
    }
  }

  // 2) layout_hash (stesso modello documento, anche senza correzioni)
  if (collected.length < cap && layoutHash) {
    const { data, error } = await db
      .from('ai_document_memory')
      .select(MEMORY_SELECT)
      .eq('layout_hash', layoutHash)
      .order('created_at', { ascending: false })
      .limit(maxFetch)
    if (!error && data?.length) addRows(data, 'layout_hash')
  }

  // 3) partita_iva
  if (collected.length < cap && partitaIva) {
    const pv = normPiva(partitaIva)
    if (pv) {
      const { data, error } = await db
        .from('ai_document_memory')
        .select(MEMORY_SELECT)
        .eq('partita_iva', pv)
        .order('created_at', { ascending: false })
        .limit(maxFetch)
      if (!error && data?.length) addRows(data, 'partita_iva')
    }
  }

  // 4) fornitore_nome
  if (collected.length < cap && fornitoreNome) {
    const frag = sanitizeIlikeFragment(fornitoreNome)
    if (frag.length >= 4) {
      const { data, error } = await db
        .from('ai_document_memory')
        .select(MEMORY_SELECT)
        .ilike('fornitore_nome', `%${frag}%`)
        .order('created_at', { ascending: false })
        .limit(maxFetch)
      if (!error && data?.length) addRows(data, 'fornitore_nome')
    }
  }

  return collected.slice(0, cap)
}

/**
 * Costruisce blocco testo per il prompt (max caratteri).
 *
 * @param {any[]} rows
 * @param {{ maxChars?: number, log?: Function, documentId?: string }} [opts]
 */
export function buildSimilarDocumentsPromptBlock(rows, opts = {}) {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_BLOCK_CHARS
  const log = opts.log
  const documentId = opts.documentId

  const matchCount = Array.isArray(rows) ? rows.length : 0
  log?.('AI_MEMORY_MATCH_COUNT', { documentId, count: matchCount })

  if (!matchCount) {
    log?.('AI_MEMORY_USED', { documentId, match_count: 0, chars: 0, skipped: true })
    return { block: '', matchCount: 0 }
  }

  const lines = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const synP = synthesizeParsingForMemory(r.parsing_result)
    const synA = synthesizeAccountingForMemory(r.accounting_result)
    const synC = synthesizeClarificationsForMemory(r.parsing_result, r.accounting_result)
    const verified = r?.operatore_corrections != null ? ' — verificato operatore' : ''
    const one = `ESEMPIO PRECEDENTE CORRETTO ${i + 1}${verified}\n  • parsing: ${synP}\n  • conti: ${synA}${synC ? `\n  • chiarimenti: ${synC}` : ''}`
    lines.push(one)
  }

  const bodyRaw = lines.join('\n\n')
  const subHeader = 'Documenti simili già processati (usa come guida principale se coerenti):\n\n'
  const prefix = `${AI_MEMORY_IMPORTANT_BLOCK}\n\n${subHeader}`
  let body = bodyRaw
  let block = prefix + body

  if (block.length > maxChars) {
    const room = Math.max(0, maxChars - prefix.length - 3)
    body = body.slice(0, room) + (room < bodyRaw.length ? '...' : '')
    block = prefix + body
  }

  log?.('AI_MEMORY_USED', {
    documentId,
    match_count: matchCount,
    chars: block.length,
    max_chars: maxChars,
  })

  return { block, matchCount }
}

/**
 * Flusso parsing: hint da testo + hash layout su testo inviato all’AI.
 *
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   documentId: string,
 *   docTextForAi: string,
 *   fullText?: string,
 *   fornitoreNomeHint?: string | null,
 *   log?: (e: string, p?: Record<string, unknown>) => void,
 *   maxChars?: number,
 * }} opts
 */
export async function fetchAiMemoryContextForParsing(opts) {
  const {
    db,
    documentId,
    docTextForAi,
    fullText = '',
    fornitoreNomeHint = null,
    log,
    maxChars = DEFAULT_MAX_BLOCK_CHARS,
  } = opts

  const layoutHash = createLayoutHash(docTextForAi)
  const pivaHint = extractPivaHintFromText(fullText) || extractPivaHintFromText(docTextForAi)

  const rows = await fetchPrioritizedMemoryRows(db, {
    layoutHash,
    partitaIva: pivaHint,
    fornitoreNome: fornitoreNomeHint,
    limit: 3,
    log,
  })

  return buildSimilarDocumentsPromptBlock(rows, { maxChars, log, documentId })
}

/**
 * Flusso accounting: usa parsingJson + opzionale riga ai_parsing_results.
 * Con `layoutTextForHash` (es. /api/accounting/ai action=proposta_contabile) calcola layout come il parsing senza documentId.
 *
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   documentId?: string | null,
 *   parsingJson?: Record<string, unknown> | null,
 *   log?: (e: string, p?: Record<string, unknown>) => void,
 *   maxChars?: number,
 *   layoutTextForHash?: string | null,
 *   partitaIvaHint?: string | null,
 *   fornitoreNomeHint?: string | null,
 * }} opts
 */
export async function fetchAiMemoryContextForAccounting(opts) {
  const {
    db,
    documentId = null,
    parsingJson = null,
    log,
    maxChars = DEFAULT_MAX_BLOCK_CHARS,
    layoutTextForHash = null,
    partitaIvaHint = null,
    fornitoreNomeHint = null,
  } = opts

  let layoutHash = null
  let preprocessed = null

  if (layoutTextForHash != null && String(layoutTextForHash).trim().length > 0) {
    layoutHash = createLayoutHash(layoutTextForHash)
  } else if (documentId) {
    try {
      const { data: pr } = await db
        .from('ai_parsing_results')
        .select('layout_hash, preprocessed_text')
        .eq('document_id', documentId)
        .maybeSingle()
      layoutHash = pr?.layout_hash || null
      preprocessed = pr?.preprocessed_text
    } catch {
      /* ignore */
    }
  }

  if (!layoutHash && typeof preprocessed === 'string' && preprocessed.length > 0) {
    layoutHash = createLayoutHash(preprocessed)
  }
  if (!layoutHash && parsingJson) {
    try {
      layoutHash = createLayoutHash(JSON.stringify(parsingJson))
    } catch {
      /* ignore */
    }
  }

  const extracted = extractSupplierFromParsingJson(
    parsingJson && typeof parsingJson === 'object' ? parsingJson : {}
  )
  const partita_iva = partitaIvaHint ?? extracted.partita_iva ?? null
  const fornitore_nome = fornitoreNomeHint ?? extracted.fornitore_nome ?? null

  const rows = await fetchPrioritizedMemoryRows(db, {
    layoutHash,
    partitaIva: partita_iva,
    fornitoreNome: fornitore_nome,
    limit: 3,
    log,
  })

  const hasOperatorCorrections = rows.some((r) => r?.operatore_corrections != null)
  const docIdForLog = documentId || 'proposta-contabile'
  const built = buildSimilarDocumentsPromptBlock(rows, { maxChars, log, documentId: docIdForLog })
  return {
    ...built,
    hasOperatorCorrections,
    matchCount: rows.length,
  }
}
