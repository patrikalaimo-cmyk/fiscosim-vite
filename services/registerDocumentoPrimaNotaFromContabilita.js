/**
 * Crea una registrazione prima nota da un documento `documenti_contabilita` (stesso flusso del client).
 * Usabile da API server (Supabase service role) e testabile in isolamento.
 */

import { recordAiAccountingFeedback } from './aiAccountingFeedbackService.js'
import { createPrimaNotaCompleta } from './primaNotaService.js'
import { buildDocumentoContabilePrimaNotaPayload } from '../domain/primaNotaPayloadBuilder.js'

function pickCausale(causaliContabili, isPassiva) {
  if (!Array.isArray(causaliContabili)) return null
  return isPassiva
    ? causaliContabili.find((c) => /FF|fatt.*forn/i.test((c.codice || '') + (c.descrizione || '')))
    : causaliContabili.find((c) => /FC|fatt.*cli/i.test((c.codice || '') + (c.descrizione || '')))
}

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.db
 * @param {object} params.doc — riga documenti_contabilita
 * @param {string} params.societaId
 * @param {object[]} params.pianoConti
 * @param {object[]} params.causaliContabili
 * @returns {Promise<{ ok: true, prima_nota_id: string } | { ok: false, error: string }>}
 */
export async function registerDocumentoPrimaNotaFromContabilita({
  db,
  doc,
  societaId,
  pianoConti,
  causaliContabili,
}) {
  try {
    const isPassiva = doc.tipo_documento?.includes('passiva')
    const isAttiva = doc.tipo_documento?.includes('attiva')
    if (!isPassiva && !isAttiva) {
      return { ok: false, error: `Tipo documento non supportato: ${doc.tipo_documento || '?'}` }
    }

    const conto = doc.conto_id ? pianoConti.find((c) => c.id === doc.conto_id) : null
    const contoIva = pianoConti.find(
      (c) =>
        c.is_iva &&
        c.livello >= 3 &&
        (isPassiva ? /credito/i.test(c.descrizione || '') : /debito/i.test(c.descrizione || ''))
    )
    const contoControparte = doc.conto_id
      ? conto
      : pianoConti.find((c) => (isPassiva ? c.is_fornitore : c.is_cliente) && c.livello >= 4)
    const contoCostoRicavo =
      conto ||
      (isPassiva
        ? pianoConti.find((c) => c.codice?.startsWith('4') && c.livello >= 3)
        : pianoConti.find((c) => c.codice?.startsWith('3') && c.livello >= 3))

    const causale = pickCausale(causaliContabili, isPassiva)

    const mergeDati = (raw) => {
      if (!raw) return {}
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw)
        } catch {
          return {}
        }
      }
      return typeof raw === 'object' ? { ...raw } : {}
    }
    const dati = mergeDati(doc.dati_estratti)
    const dataReg =
      dati.data_registrazione || doc.data_documento || new Date().toISOString().slice(0, 10)

    const {
      pnPayload: pnInsertPayload,
      righePayload: righe,
      partEntries,
    } = buildDocumentoContabilePrimaNotaPayload({
      doc,
      societaId,
      dataRegistrazione: dataReg,
      causaleCodice: causale?.codice,
      isPassiva,
      contoCostoRicavo,
      contoIva,
      contoControparte,
      stato: 'provvisoria',
    })

    const complete = await createPrimaNotaCompleta({
      db,
      pnPayload: pnInsertPayload,
      righePayload: righe,
      partEntries,
      headerSelect: '*',
      righeSelect: 'id, riga_numero, conto_id',
      partitarioSelect: '*',
    })
    if (complete.error) return { ok: false, error: complete.error.message || String(complete.error) }

    const pn = complete.pn
    const insertedRighe = complete.righeIns?.data
    if (righe.length > 0) {
      const mainRigaNumero = isPassiva ? 1 : 2
      const mainRiga = insertedRighe?.find((r) => r.riga_numero === mainRigaNumero) || insertedRighe?.[0]
      await recordAiAccountingFeedback(db, {
        documentId: doc.id,
        finalContoId: mainRiga?.conto_id ?? null,
        primaNotaRigaId: mainRiga?.id ?? null,
        documentRow: doc,
        pianoConti,
      })
    }

    const { error: upErr } = await db
      .from('documenti_contabilita')
      .update({
        workflow_status: 'registered',
        registered_at: new Date().toISOString(),
        prima_nota_id: pn.id,
      })
      .eq('id', doc.id)
    if (upErr) return { ok: false, error: upErr.message || String(upErr) }

    return { ok: true, prima_nota_id: pn.id }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}
