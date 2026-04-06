/**
 * Motore apprendimento: aggiorna ai_learning in base a feedback (conferma / correzione).
 *
 * - Stessa coppia (anagrafica_id, conto_id): incrementa frequenza e confidence (RPC atomico).
 * - Nuova coppia: nuova riga (gestita dalla stessa RPC ON CONFLICT).
 * - correzione → +20 confidence; conferma → +5 (cap 100).
 */

import { findAnagraficaConto, normPiva } from './autoValidateAccountingEngine.js'

const DELTA_CORREZIONE = 20
const DELTA_CONFERMA = 5

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{
 *   societaId: string,
 *   anagraficaId: string,
 *   contoId: string,
 *   tipo: 'correzione' | 'conferma',
 * }} p
 */
export async function applyLearningFromFeedback(db, { societaId, anagraficaId, contoId, tipo }) {
  if (!db || !societaId || !anagraficaId || !contoId) {
    return { ok: true, skipped: true, reason: 'missing_keys' }
  }

  const delta = tipo === 'correzione' ? DELTA_CORREZIONE : DELTA_CONFERMA

  const { error } = await db.rpc('apply_ai_learning_from_feedback', {
    p_societa_id: societaId,
    p_anagrafica_id: anagraficaId,
    p_conto_id: contoId,
    p_delta: delta,
  })

  if (error) {
    console.warn('[aiLearning] rpc apply_ai_learning_from_feedback', error.message)
    return { ok: false, error: error.message }
  }

  return { ok: true, delta }
}

/**
 * Blocco prompt da anteporre alla conoscenza fiscale quando c’è match forte (frequenza > 2).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} documentId — id documenti_contabilita
 */
export async function buildLearningPromptAppendixForDocument(db, documentId) {
  if (!db || !documentId) return { appendix: '', used: false }

  const { data: doc, error: dErr } = await db
    .from('documenti_contabilita')
    .select('societa_id, soggetto_piva')
    .eq('id', documentId)
    .maybeSingle()
  if (dErr || !doc?.societa_id || !doc.soggetto_piva) return { appendix: '', used: false }

  const { data: pianoConti, error: pErr } = await db
    .from('piano_conti')
    .select('id,codice,descrizione,partita_iva,anagrafica_piva,is_fornitore,is_cliente,livello')
    .eq('societa_id', doc.societa_id)
    .eq('attivo', true)
  if (pErr) console.warn('[aiLearning] piano_conti', pErr.message)

  const pc = pianoConti || []
  const anag = findAnagraficaConto(pc, normPiva(doc.soggetto_piva))
  if (!anag?.id) return { appendix: '', used: false }

  const { data: learnRows, error: lErr } = await db
    .from('ai_learning')
    .select('conto_id, frequenza')
    .eq('societa_id', doc.societa_id)
    .eq('anagrafica_id', anag.id)
    .order('frequenza', { ascending: false })
    .limit(1)

  if (lErr) {
    console.warn('[aiLearning] ai_learning select', lErr.message)
    return { appendix: '', used: false }
  }

  const top = learnRows?.[0]
  const fq = Number(top?.frequenza) || 0
  if (!top?.conto_id || fq <= 2) return { appendix: '', used: false }

  const contoRow = pc.find((c) => String(c.id) === String(top.conto_id))
  const cod = String(contoRow?.codice || '').replace(/\s+/g, '').trim() || String(top.conto_id)
  const desc = String(contoRow?.descrizione || '').trim()

  const appendix =
    `--- Apprendimento anagrafica (conferme/correzioni operative — valuta prima della sola conoscenza fiscale generica) ---\n` +
    `Registrato ${fq} volte l'uso del conto **${cod}**` +
    (desc ? ` (${desc})` : '') +
    ` per questa anagrafica nel piano. Per la riga di costo/ricavo principale, privilegia questo conto se coerente col documento.\n\n`

  return { appendix, used: true, conto_id: top.conto_id, frequenza: fq }
}
