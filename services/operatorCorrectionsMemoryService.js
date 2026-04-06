/**
 * Salva correzioni operatore in ai_document_memory (diff + snapshot “verità”).
 */

import { getSupabaseAdmin } from '../lib/db.js'
import { createLayoutHash } from '../lib/layoutHash.js'
import { extractSupplierFromParsingJson } from './aiDocumentMemoryService.js'

function stableStringify(obj) {
  try {
    return JSON.stringify(obj, Object.keys(obj || {}).sort())
  } catch {
    return String(obj)
  }
}

function shallowChanged(before, after) {
  return stableStringify(before) !== stableStringify(after)
}

/**
 * @param {{
 *   documentId: string,
 *   parsingAfter: Record<string, unknown>,
 *   accountingAfter: Record<string, unknown>,
 *   deps?: { db?: import('@supabase/supabase-js').SupabaseClient, log?: (e: string, p?: unknown) => void },
 * }} opts
 */
export async function saveOperatorCorrectionsMemory(opts) {
  const { documentId, parsingAfter, accountingAfter, deps = {} } = opts
  const db = deps.db || (await getSupabaseAdmin())
  const log = deps.log || ((e, p) => console.log(e, p))

  if (!documentId || !parsingAfter || typeof parsingAfter !== 'object') {
    return { ok: false, skipped: true, reason: 'invalid_input' }
  }

  const { data: pr, error: prErr } = await db
    .from('ai_parsing_results')
    .select('json_output, layout_hash, preprocessed_text')
    .eq('document_id', documentId)
    .maybeSingle()

  if (prErr || !pr) {
    log('OPERATOR_CORRECTION_SKIPPED', { documentId, reason: 'no_ai_parsing_results' })
    return { ok: false, skipped: true, reason: 'no_parsing_row' }
  }

  let parsingBefore = pr.json_output
  if (typeof parsingBefore === 'string') {
    try {
      parsingBefore = JSON.parse(parsingBefore)
    } catch {
      parsingBefore = {}
    }
  }
  if (!parsingBefore || typeof parsingBefore !== 'object') parsingBefore = {}

  const { data: accRows } = await db
    .from('accounting_entries')
    .select('data, status, created_at')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })

  const list = Array.isArray(accRows) ? accRows : []
  const preferred =
    list.find((e) => e.status === 'AI_PROPOSED') ||
    list.find((e) => e.data?.source === 'ai_accounting') ||
    list[0] ||
    null

  const accountingBefore =
    preferred?.data && typeof preferred.data === 'object' ? { ...preferred.data } : {}

  const accAfter = accountingAfter && typeof accountingAfter === 'object' ? accountingAfter : {}

  if (!shallowChanged(parsingBefore, parsingAfter) && !shallowChanged(accountingBefore, accAfter)) {
    log('OPERATOR_CORRECTION_SKIPPED', { documentId, reason: 'no_diff' })
    return { ok: true, skipped: true, reason: 'no_diff' }
  }

  let layoutHash = pr.layout_hash || null
  if (!layoutHash && typeof pr.preprocessed_text === 'string' && pr.preprocessed_text.length > 0) {
    layoutHash = createLayoutHash(pr.preprocessed_text)
  }
  if (!layoutHash) {
    log('OPERATOR_CORRECTION_SKIPPED', { documentId, reason: 'no_layout_hash' })
    return { ok: false, skipped: true, reason: 'no_layout_hash' }
  }

  const savedAt = new Date().toISOString()
  const operatore_corrections = {
    document_id: documentId,
    layout_hash: layoutHash,
    saved_at: savedAt,
    parsing: { before: parsingBefore, after: parsingAfter },
    accounting: { before: accountingBefore, after: accAfter },
  }

  const { fornitore_nome, partita_iva } = extractSupplierFromParsingJson(parsingAfter)

  const row = {
    layout_hash: layoutHash,
    source_document_id: documentId,
    fornitore_nome,
    partita_iva,
    parsing_result: parsingAfter,
    accounting_result: accAfter,
    operatore_corrections,
    updated_at: savedAt,
  }

  const ins = await db.from('ai_document_memory').upsert(row, { onConflict: 'layout_hash' }).select('id').maybeSingle()

  if (ins.error) {
    log('OPERATOR_CORRECTION_SAVE_ERROR', { documentId, error: ins.error.message })
    return { ok: false, error: ins.error.message }
  }

  log('OPERATOR_CORRECTION_SAVED', {
    documentId,
    layout_hash: layoutHash,
    memory_id: ins.data?.id,
    parsing_changed: shallowChanged(parsingBefore, parsingAfter),
    accounting_changed: shallowChanged(accountingBefore, accAfter),
  })

  return { ok: true, memory_id: ins.data?.id, layout_hash: layoutHash }
}
