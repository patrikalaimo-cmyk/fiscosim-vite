// POST — crea batch proposte da catalogo fonti (placeholder, nessun scraping).
import { runFiscalKnowledgePlaceholderScan } from '../services/fiscalKnowledgeScanService.js'

export const config = {
  api: { bodyParser: true },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const out = await runFiscalKnowledgePlaceholderScan()
    if (!out.ok) return res.status(500).json({ error: out.error || 'Scan failed' })
    return res.status(200).json({ ok: true, batchId: out.batchId, itemsCount: out.itemsCount })
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) })
  }
}
