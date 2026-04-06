// POST { documentId, parsingAfter, accountingAfter } — salva correzioni in ai_document_memory
import { saveOperatorCorrectionsMemory } from '../services/operatorCorrectionsMemoryService.js'

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
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const documentId = body?.documentId
    const parsingAfter = body?.parsingAfter
    const accountingAfter = body?.accountingAfter ?? {}
    if (!documentId) return res.status(400).json({ error: 'documentId mancante' })

    const result = await saveOperatorCorrectionsMemory({
      documentId,
      parsingAfter,
      accountingAfter,
      deps: { log: (e, p) => console.log(e, p) },
    })

    return res.status(200).json(result)
  } catch (e) {
    console.error('[save-operator-corrections]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
