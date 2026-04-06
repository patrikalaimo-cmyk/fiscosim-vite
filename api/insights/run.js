import { getSupabaseAdmin } from '../../lib/db.js'
import { runProactiveInsightEngine } from '../../services/proactiveInsightEngine.js'

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
    const societaId = body.societaId
    if (!societaId) return res.status(400).json({ error: 'societaId richiesto' })

    const db = await getSupabaseAdmin()
    const out = await runProactiveInsightEngine(db, {
      societaId,
      log: (e, p) => console.log(`[api/insights/run] ${e}`, p || ''),
    })

    if (!out.ok) {
      return res.status(500).json({
        error: 'Persistenza insight fallita (vedi byTipo)',
        ...out,
      })
    }

    return res.status(200).json(out)
  } catch (e) {
    console.error('[api/insights/run]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
