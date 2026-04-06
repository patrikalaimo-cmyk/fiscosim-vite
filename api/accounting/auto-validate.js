import { getSupabaseAdmin } from '../../lib/db.js'
import { runAutoValidateOnAccountingEntries } from '../../services/autoValidateAccountingEngine.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 60,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const entryIds = Array.isArray(body.entryIds) ? body.entryIds : null
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds : null
    if ((!entryIds || !entryIds.length) && (!documentIds || !documentIds.length)) {
      return res.status(400).json({ error: 'entryIds o documentIds (array) richiesto' })
    }

    const db = await getSupabaseAdmin()
    const out = await runAutoValidateOnAccountingEntries(db, { entryIds, documentIds })
    if (!out.ok) return res.status(400).json({ error: out.error })
    return res.status(200).json({
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
    })
  } catch (e) {
    console.error('[accounting/auto-validate]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
