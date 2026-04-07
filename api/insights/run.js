import { insightsRunHandler } from '../../services/api/insights/run.js'
import { fiscalKnowledgeScanHandler } from '../../services/api/insights/fiscal-knowledge-scan.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 60,
}

const handlers = {
  run: insightsRunHandler,
  fiscal_knowledge_scan: fiscalKnowledgeScanHandler,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
  const action = (typeof body.action === 'string' ? body.action : 'run').trim().toLowerCase() || 'run'
  const handlerFn = handlers[action] || handlers.run

  const result = await handlerFn({
    body,
    log: (e, payload) => console.log(`[api/insights/run:${action}] ${e}`, payload || ''),
  })

  return res.status(result.status).json(result.json)
}
