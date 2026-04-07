import { getSupabaseAdmin } from '../../../lib/db.js'
import { runAutoValidateOnAccountingEntries } from '../../../services/autoValidateAccountingEngine.js'

export async function accountingAutoValidateHandler({ body }) {
  const entryIds = Array.isArray(body?.entryIds) ? body.entryIds : null
  const documentIds = Array.isArray(body?.documentIds) ? body.documentIds : null
  if ((!entryIds || !entryIds.length) && (!documentIds || !documentIds.length)) {
    return { status: 400, json: { error: 'entryIds o documentIds (array) richiesto' } }
  }

  const db = await getSupabaseAdmin()
  const out = await runAutoValidateOnAccountingEntries(db, { entryIds, documentIds })
  if (!out.ok) return { status: 400, json: { error: out.error } }
  return {
    status: 200,
    json: {
      ok: true,
      entries: out.entries.map((e) => ({
        id: e.id,
        document_id: e.document_id,
        status: e.status,
        ai_confidence: e.ai_confidence,
        ai_status: e.ai_status,
        ai_source: e.ai_source,
        ai_explanation: e.ai_explanation,
        auto_validate_meta: e.auto_validate_meta,
        data: e.data,
        created_at: e.created_at,
      })),
    },
  }
}
