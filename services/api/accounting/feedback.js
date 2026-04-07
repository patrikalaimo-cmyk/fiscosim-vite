import { getSupabaseAdmin } from '../../../lib/db.js'
import { recordAiAccountingFeedback } from '../../../services/aiAccountingFeedbackService.js'

export async function accountingFeedbackHandler({ body }) {
  const documentId = body?.documentId
  if (!documentId) return { status: 400, json: { error: 'documentId richiesto' } }

  const db = await getSupabaseAdmin()
  const out = await recordAiAccountingFeedback(db, {
    documentId,
    finalContoId: body.finalContoId,
    primaNotaRigaId: body.primaNotaRigaId ?? null,
  })
  if (!out.ok) return { status: 400, json: { error: out.error } }
  return { status: 200, json: out }
}
