import { propostaContabileHandler } from '../../services/api/accounting/proposta-contabile.js'
import { copilotAccountingHandler } from '../../services/api/accounting/copilot-accounting.js'

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
  maxDuration: 120,
}

const handlers = {
  proposta_contabile: propostaContabileHandler,
  copilot_turn: copilotAccountingHandler,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const actionRaw = typeof body.action === 'string' ? body.action : ''
    const action =
      actionRaw.trim().toLowerCase()
      || (Array.isArray(body.messages) ? 'copilot_turn' : '')
      || 'proposta_contabile'

    const handlerFn = handlers[action] || handlers.proposta_contabile
    const result = await handlerFn({ body })
    return res.status(result.status).json(result.json)
  } catch (e) {
    console.error('[accounting/ai]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}

