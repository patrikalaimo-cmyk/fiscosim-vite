import { getSupabaseAdmin } from '../../lib/db.js'
import { runAccountingCopilotTurn } from '../../services/copilotAccountingService.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 120,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const documentId = body.documentId
    const societaId = body.societaId
    const messages = Array.isArray(body.messages) ? body.messages : null
    const accountingEntryId = body.accountingEntryId != null && String(body.accountingEntryId).trim() !== '' ? String(body.accountingEntryId).trim() : null

    if (!documentId) return res.status(400).json({ error: 'documentId richiesto' })
    if (!societaId) return res.status(400).json({ error: 'societaId richiesto' })
    if (!messages?.length) return res.status(400).json({ error: 'messages (array) richiesto' })

    const last = messages[messages.length - 1]
    if (!last || last.role !== 'user' || !String(last.content || '').trim()) {
      return res.status(400).json({ error: 'Ultimo messaggio deve essere user con content' })
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

    if (!out.ok) return res.status(400).json({ error: out.error })
    const { ok: _o, raw_model, ...rest } = out
    return res.status(200).json(rest)
  } catch (e) {
    console.error('[copilot/accounting]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
