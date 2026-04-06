import { getSupabaseAdmin } from '../../lib/db.js'
import { recordAiAccountingFeedback } from '../../services/aiAccountingFeedbackService.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 30,
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
    if (!documentId) return res.status(400).json({ error: 'documentId richiesto' })

    const db = await getSupabaseAdmin()
    const out = await recordAiAccountingFeedback(db, {
      documentId,
      finalContoId: body.finalContoId,
      primaNotaRigaId: body.primaNotaRigaId ?? null,
    })
    if (!out.ok) return res.status(400).json({ error: out.error })
    return res.status(200).json(out)
  } catch (e) {
    console.error('[accounting/feedback]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
