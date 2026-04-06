import { getSupabaseAdmin } from '../lib/db.js'
import { registerDocumentoPrimaNotaFromContabilita } from './registerDocumentoPrimaNotaFromContabilita.js'
import { recordAiAccountingFeedback } from './aiAccountingFeedbackService.js'

function parseDatiEstratti(raw) {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? { ...raw } : {}
}

/**
 * @param {object} body
 * @param {string} body.societaId
 * @param {string[]} body.documentIds
 * @param {boolean} [body.preview]
 * @param {object} [body.updates] — conto_id, data_registrazione, tipo_pagamento, causale_iva
 * @param {boolean} [body.approve]
 * @param {boolean} [body.approveAndRegister]
 */
export async function runPrimaNotaBulkUpdate(body) {
  const societaId = body?.societaId
  const documentIds = Array.isArray(body?.documentIds) ? body.documentIds.filter(Boolean) : []
  const preview = body?.preview === true
  const updates = body?.updates && typeof body.updates === 'object' ? body.updates : {}
  const approve = body?.approve === true
  const approveAndRegister = body?.approveAndRegister === true

  if (!societaId) return { ok: false, status: 400, error: 'societaId mancante' }
  if (!documentIds.length) return { ok: false, status: 400, error: 'documentIds vuoto' }

  const db = await getSupabaseAdmin()

  const { data: rows, error: qErr } = await db
    .from('documenti_contabilita')
    .select('*')
    .eq('societa_id', societaId)
    .in('id', documentIds)

  if (qErr) return { ok: false, status: 500, error: qErr.message || String(qErr) }
  const docs = rows || []
  if (docs.length !== documentIds.length) {
    return { ok: false, status: 400, error: 'Alcuni documenti non appartengono alla società o non esistono' }
  }

  const contoIdNew = updates.conto_id != null && updates.conto_id !== '' ? updates.conto_id : null
  const dataRegNew = updates.data_registrazione != null && updates.data_registrazione !== '' ? updates.data_registrazione : null
  const tipoPagNew =
    updates.tipo_pagamento != null && updates.tipo_pagamento !== '' ? updates.tipo_pagamento : null
  const causaleIvaNew = updates.causale_iva != null && updates.causale_iva !== '' ? updates.causale_iva : null

  const previewRows = docs.map((doc) => {
    const datiBefore = parseDatiEstratti(doc.dati_estratti)
    const datiAfter = { ...datiBefore }
    if (dataRegNew) datiAfter.data_registrazione = dataRegNew
    if (tipoPagNew) datiAfter.tipo_pagamento = tipoPagNew

    const patch = {
      conto_id: contoIdNew != null ? contoIdNew : doc.conto_id,
      causale_iva: causaleIvaNew != null ? causaleIvaNew : doc.causale_iva,
      dati_estratti: dataRegNew || tipoPagNew ? datiAfter : datiBefore,
    }

    return {
      id: doc.id,
      filename: doc.filename,
      before: {
        conto_id: doc.conto_id,
        causale_iva: doc.causale_iva,
        validation_status: doc.validation_status,
        workflow_status: doc.workflow_status,
        data_registrazione: datiBefore.data_registrazione ?? null,
        tipo_pagamento: datiBefore.tipo_pagamento ?? null,
      },
      after: {
        conto_id: patch.conto_id,
        causale_iva: patch.causale_iva,
        validation_status:
          approve || approveAndRegister
            ? 'confirmed'
            : doc.validation_status,
        will_register_to_prima_nota:
          approveAndRegister && doc.workflow_status !== 'registered',
        data_registrazione: datiAfter.data_registrazione ?? null,
        tipo_pagamento: datiAfter.tipo_pagamento ?? null,
      },
      wouldRegister:
        approveAndRegister && doc.workflow_status !== 'registered',
    }
  })

  if (preview) {
    return { ok: true, status: 200, preview: previewRows }
  }

  const nowIso = new Date().toISOString()
  const results = []

  let pianoContiCache = null
  let causaliContabiliCache = null
  const ensureAccountingContext = async () => {
    if (pianoContiCache) return
    const [{ data: pc }, { data: cc }] = await Promise.all([
      db.from('piano_conti').select('*').eq('societa_id', societaId).eq('attivo', true),
      db.from('causali_contabili').select('*').eq('societa_id', societaId).eq('attivo', true),
    ])
    pianoContiCache = pc || []
    causaliContabiliCache = cc || []
  }

  for (const doc of docs) {
    const dati = parseDatiEstratti(doc.dati_estratti)
    if (dataRegNew) dati.data_registrazione = dataRegNew
    if (tipoPagNew) dati.tipo_pagamento = tipoPagNew

    const rowUpdate = {}
    if (contoIdNew != null) rowUpdate.conto_id = contoIdNew
    if (causaleIvaNew != null) rowUpdate.causale_iva = causaleIvaNew
    if (dataRegNew || tipoPagNew) rowUpdate.dati_estratti = dati
    if (approve || approveAndRegister) {
      rowUpdate.validation_status = 'confirmed'
      rowUpdate.validated_at = nowIso
    }

    if (Object.keys(rowUpdate).length > 0) {
      const { error: uErr } = await db.from('documenti_contabilita').update(rowUpdate).eq('id', doc.id)
      if (uErr) {
        results.push({ id: doc.id, ok: false, error: uErr.message })
        continue
      }
    }

    let reg = null
    let registrationSucceeded = false
    if (approveAndRegister && doc.workflow_status !== 'registered') {
      await ensureAccountingContext()

      const mergedDoc = {
        ...doc,
        ...rowUpdate,
        dati_estratti: rowUpdate.dati_estratti != null ? rowUpdate.dati_estratti : doc.dati_estratti,
        conto_id: rowUpdate.conto_id ?? doc.conto_id,
        validation_status: 'confirmed',
      }

      reg = await registerDocumentoPrimaNotaFromContabilita({
        db,
        doc: mergedDoc,
        societaId,
        pianoConti: pianoContiCache,
        causaliContabili: causaliContabiliCache,
      })
      if (!reg.ok) {
        const finalContoFail = mergedDoc.conto_id ?? null
        await recordAiAccountingFeedback(db, { documentId: doc.id, finalContoId: finalContoFail })
        results.push({ id: doc.id, ok: false, error: reg.error, phase: 'register' })
        continue
      }
      registrationSucceeded = true
    }

    const shouldFeedback =
      Object.keys(rowUpdate).length > 0 && (approve || approveAndRegister || contoIdNew != null)

    if (shouldFeedback && !registrationSucceeded) {
      const finalConto = rowUpdate.conto_id !== undefined ? rowUpdate.conto_id : doc.conto_id
      await recordAiAccountingFeedback(db, { documentId: doc.id, finalContoId: finalConto })
    }

    results.push({
      id: doc.id,
      ok: true,
      prima_nota_id: reg?.ok ? reg.prima_nota_id : undefined,
    })
  }

  return { ok: true, status: 200, results }
}
