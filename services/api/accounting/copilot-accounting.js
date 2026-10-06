import { getSupabaseAdmin } from '../../../lib/db.js'
import { runAccountingCopilotTurn } from '../../copilotAccountingService.js'

export async function copilotAccountingHandler({ body }) {
  try {
    const documentId = body.documentId
    const societaId = body.societaId
    const messages = Array.isArray(body.messages) ? body.messages : null
    const accountingEntryId = body.accountingEntryId != null && String(body.accountingEntryId).trim() !== '' ? String(body.accountingEntryId).trim() : null

    if (!documentId) return { status: 400, json: { error: 'documentId richiesto' } }
    if (!societaId) return { status: 400, json: { error: 'societaId richiesto' } }
    if (!messages?.length) return { status: 400, json: { error: 'messages (array) richiesto' } }

    const last = messages[messages.length - 1]
    if (!last || last.role !== 'user' || !String(last.content || '').trim()) {
      return { status: 400, json: { error: 'Ultimo messaggio deve essere user con content' } }
    }

    const db = await getSupabaseAdmin()
    const out = await runAccountingCopilotTurn({
      db,
      documentId,
      societaId,
      messages,
      accountingEntryId,
      log: (e, p) => console.log(`[copilot/accounting] ${e}`, p || ''),
    })

    if (!out.ok) return { status: 400, json: { error: out.error } }
    const { ok: _o, raw_model, ...rest } = out
    return { status: 200, json: rest }
  } catch (e) {
    console.error('[copilot/accounting]', e)
    return { status: 500, json: { error: e?.message || String(e) } }
  }
}
