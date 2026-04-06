import { runPrimaNotaBulkUpdate } from '../../services/primaNotaBulkUpdateService.js'

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
    const out = await runPrimaNotaBulkUpdate(body)
    if (!out.ok) return res.status(out.status || 500).json({ error: out.error })
    return res.status(out.status || 200).json(out)
  } catch (e) {
    console.error('[prima-nota/bulk-update]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
