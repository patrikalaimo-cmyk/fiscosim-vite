import { getSupabaseAdmin } from '../../../lib/db.js'
import { recordAiAccountingFeedbackBatch } from '../../../services/aiAccountingFeedbackService.js'

export async function accountingFeedbackBatchHandler({ body }) {
  const documentIds = Array.isArray(body?.documentIds) ? body.documentIds.filter(Boolean) : []
  if (!documentIds.length) return { status: 400, json: { error: 'documentIds (array) richiesto' } }

  const db = await getSupabaseAdmin()
  const out = await recordAiAccountingFeedbackBatch(db, documentIds)
  return { status: 200, json: out }
}
