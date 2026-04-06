/**
 * POST /api/test-scenario/run
 * Body: { scenarioId, societaId, xmlText?, filename?, xmlBatch?, pipelineOptions? }
 */

import { getSupabaseAdmin } from '../../lib/db.js'
import { runTestScenario } from '../../services/testScenarioEngine.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 300,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const scenarioId = body.scenarioId
    const societaId = body.societaId
    const xmlText = body.xmlText != null ? String(body.xmlText) : ''
    const filename = body.filename || 'fattura.xml'
    const pipelineOptions = body.pipelineOptions && typeof body.pipelineOptions === 'object' ? body.pipelineOptions : {}
    let xmlBatch = undefined
    if (Array.isArray(body.xmlBatch)) {
      xmlBatch = body.xmlBatch.map((x) => ({
        xmlText: x?.xmlText != null ? String(x.xmlText) : '',
        filename: x?.filename || 'fattura.xml',
      }))
    }

    if (!scenarioId) return res.status(400).json({ error: 'scenarioId richiesto' })
    if (!societaId) return res.status(400).json({ error: 'societaId richiesto' })

    const db = await getSupabaseAdmin()
    const serverLog = (e, p) => console.log(`[test-scenario] ${e}`, p || '')

    const out = await runTestScenario(scenarioId, {
      db,
      societaId,
      xmlText,
      filename,
      xmlBatch,
      pipelineOptions,
      onStep: serverLog,
    })

    return res.status(200).json(out)
  } catch (e) {
    console.error('[test-scenario/run]', e)
    return res.status(500).json({ error: e?.message || String(e), pass: false })
  }
}
