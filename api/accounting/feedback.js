import { accountingFeedbackHandler } from '../../services/api/accounting/feedback.js'
import { accountingFeedbackBatchHandler } from '../../services/api/accounting/feedback-batch.js'
import { accountingAutoValidateHandler } from '../../services/api/accounting/auto-validate.js'
import { saveOperatorCorrectionsHandler } from '../../services/api/accounting/save-operator-corrections.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 30,
}

const handlers = {
  feedback: accountingFeedbackHandler,
  feedback_batch: accountingFeedbackBatchHandler,
  auto_validate: accountingAutoValidateHandler,
  save_operator_corrections: saveOperatorCorrectionsHandler,
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
      || (body.documentId ? 'feedback' : '')
      || (Array.isArray(body.documentIds) && body.documentIds.length ? 'feedback_batch' : '')
      || 'feedback'

    const handlerFn = handlers[action] || handlers.feedback
    const result = await handlerFn({ body })
    return res.status(result.status).json(result.json)
  } catch (e) {
    console.error('[accounting/feedback]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
