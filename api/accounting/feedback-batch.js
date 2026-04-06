import { getSupabaseAdmin } from '../../lib/db.js'
import { recordAiAccountingFeedbackBatch } from '../../services/aiAccountingFeedbackService.js'

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
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds.filter(Boolean) : []
    if (!documentIds.length) return res.status(400).json({ error: 'documentIds (array) richiesto' })

    const db = await getSupabaseAdmin()
    const out = await recordAiAccountingFeedbackBatch(db, documentIds)
    return res.status(200).json(out)
  } catch (e) {
    console.error('[accounting/feedback-batch]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
