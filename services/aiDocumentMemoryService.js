/**
 * Persistenza memoria documenti AI dopo pipeline (parsing + accounting).
 */

import { createLayoutHash } from '../lib/layoutHash.js'

function defaultLog(event, payload) {
  if (payload === undefined) console.log(`[aiDocumentMemory] ${event}`)
  else console.log(`[aiDocumentMemory] ${event}`, payload)
}

function normPiva(v) {
  if (v == null) return null
  const s = String(v).replace(/\s/g, '').replace(/^IT/i, '')
  return s.length >= 8 ? s : String(v).trim() || null
}

/**
 * Estrae denominazione e P.IVA da json_output pipeline (schema FiscoSim o flat import).
 *
 * @param {Record<string, unknown>} jo
 * @returns {{ fornitore_nome: string | null, partita_iva: string | null }}
 */
export function extractSupplierFromParsingJson(jo) {
  if (!jo || typeof jo !== 'object') return { fornitore_nome: null, partita_iva: null }
  const doc = jo.documento
  if (doc && typeof doc === 'object') {
    const f = doc.fornitore
    if (f && typeof f === 'object') {
      return {
        fornitore_nome: f.nome != null ? String(f.nome).trim() : null,
        partita_iva: normPiva(f.piva),
      }
    }
  }
  const nome = jo.cedente_denom != null ? String(jo.cedente_denom).trim() : null
  const piva = jo.cedente_piva != null ? normPiva(jo.cedente_piva) : null
  return { fornitore_nome: nome || null, partita_iva: piva }
}

const SHORT_PRE_MAX = 8000

function shortPreprocessed(text) {
  if (text == null || typeof text !== 'string') return null
  const t = text.length > SHORT_PRE_MAX ? `${text.slice(0, SHORT_PRE_MAX)}\n[...]` : text
  return t.length <= 12000 ? t : t.slice(0, 12000)
}

/**
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   documentId: string,
 *   log?: (e: string, p?: Record<string, unknown>) => void,
 * }} opts
 */
export async function saveAiDocumentMemoryAfterPipeline(opts) {
  const { db, documentId, log = defaultLog } = opts
  if (!db || !documentId) return { ok: false, skipped: true, reason: 'missing_db_or_document' }

  const everyN = Math.max(1, parseInt(process.env.AI_MEMORY_SAVE_EVERY_N_PIPELINES || '1', 10) || 1)

  try {
    const { data: prRow, error: prErr } = await db
      .from('ai_parsing_results')
      .select('json_output, layout_hash, preprocessed_text, preprocessed_text_length')
      .eq('document_id', documentId)
      .maybeSingle()

    if (prErr) {
      log('AI_MEMORY_SKIPPED', { documentId, reason: 'read_parsing', error: prErr.message })
      return { ok: false, skipped: true, reason: 'read_parsing' }
    }
    if (!prRow) {
      log('AI_MEMORY_SKIPPED', { documentId, reason: 'no_parsing_row' })
      return { ok: false, skipped: true, reason: 'no_parsing_row' }
    }

    let layoutHash = prRow.layout_hash || null
    const rawText = prRow.preprocessed_text
    if (!layoutHash && typeof rawText === 'string' && rawText.length > 0) {
      layoutHash = createLayoutHash(rawText)
    }
    if (!layoutHash) {
      log('AI_MEMORY_SKIPPED', { documentId, reason: 'no_layout_hash' })
      return { ok: false, skipped: true, reason: 'no_layout_hash' }
    }

    let jo = prRow.json_output
    if (typeof jo === 'string') {
      try {
        jo = JSON.parse(jo)
      } catch {
        jo = {}
      }
    }
    if (!jo || typeof jo !== 'object') jo = {}

    const { fornitore_nome, partita_iva } = extractSupplierFromParsingJson(jo)

    const { data: accRows, error: accErr } = await db
      .from('accounting_entries')
      .select('data, status, created_at')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })

    if (accErr) {
      log('AI_MEMORY_SKIPPED', { documentId, reason: 'read_accounting', error: accErr.message })
      return { ok: false, skipped: true, reason: 'read_accounting' }
    }

    const list = Array.isArray(accRows) ? accRows : []
    const preferred =
      list.find((e) => e.status === 'AI_PROPOSED') ||
      list.find((e) => e.data?.source === 'ai_accounting') ||
      list[0] ||
      null

    const accounting_result = preferred?.data && typeof preferred.data === 'object' ? preferred.data : {}

    // Contatore globale pipeline (throttle: max 1 refresh per layout_hash ogni N completamenti)
    const pipelineCounter = await bumpPipelineCounter(db)

    const { data: existing } = await db
      .from('ai_document_memory')
      .select('id')
      .eq('layout_hash', layoutHash)
      .maybeSingle()

    const isNewLayout = !existing?.id
    const shouldWrite = isNewLayout || pipelineCounter % everyN === 0

    if (!shouldWrite) {
      log('AI_MEMORY_SKIPPED_THROTTLE', {
        documentId,
        layout_hash: layoutHash,
        pipeline_counter: pipelineCounter,
        every_n: everyN,
        is_new_layout: isNewLayout,
      })
      return { ok: true, skipped: true, reason: 'throttle', layout_hash: layoutHash }
    }

    const row = {
      layout_hash: layoutHash,
      fornitore_nome,
      partita_iva,
      preprocessed_text: shortPreprocessed(typeof rawText === 'string' ? rawText : null),
      parsing_result: jo,
      accounting_result,
      updated_at: new Date().toISOString(),
    }

    const ins = await db.from('ai_document_memory').upsert(row, { onConflict: 'layout_hash' }).select('id').maybeSingle()

    if (ins.error) {
      log('AI_MEMORY_SAVE_ERROR', { documentId, error: ins.error.message || String(ins.error) })
      return { ok: false, skipped: false, error: ins.error.message }
    }

    log('AI_MEMORY_SAVED', {
      documentId,
      layout_hash: layoutHash,
      memory_id: ins.data?.id,
      pipeline_counter: pipelineCounter,
      every_n: everyN,
      is_new_layout: isNewLayout,
    })
    return { ok: true, skipped: false, layout_hash: layoutHash, memory_id: ins.data?.id }
  } catch (e) {
    const msg = e?.message || String(e)
    log('AI_MEMORY_SAVE_ERROR', { documentId, error: msg })
    return { ok: false, skipped: false, error: msg }
  }
}

async function bumpPipelineCounter(db) {
  try {
    const { data: cur } = await db.from('ai_pipeline_counter').select('completed').eq('id', 1).maybeSingle()
    const next = (typeof cur?.completed === 'number' ? cur.completed : 0) + 1
    const { error } = await db.from('ai_pipeline_counter').upsert({ id: 1, completed: next }, { onConflict: 'id' })
    if (error) return next - 1
    return next
  } catch {
    return 1
  }
}
