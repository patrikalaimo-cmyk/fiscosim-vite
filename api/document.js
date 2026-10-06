import { analyzeDocumentHandler } from '../services/api/document/analyze.js'
import { processDocumentHandler } from '../services/api/document/process.js'
import { parseContabilitaPdfHandler } from '../services/api/document/parse-contabilita-pdf.js'
import { splitCuHandler } from '../services/api/document/split-cu.js'

export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } },
  maxDuration: 120,
}

const handlers = {
  analyze: analyzeDocumentHandler,
  process: processDocumentHandler,
  parse_contabilita_pdf: parseContabilitaPdfHandler,
  split_cu: splitCuHandler,
}

function inferAction(body) {
  if (!body || typeof body !== 'object') return 'analyze'

  if (body.documentId) return 'process'

  if (body.mode === 'split_cu') return 'split_cu'

  // split-cu legacy payload: { pdfBase64, anno? }
  if (body.pdfBase64 && typeof body.tipo !== 'string') {
    if (body.anno != null) return 'split_cu'
  }

  // parse-contabilita-pdf legacy payload: { pdfBase64, tipo } or { fileBase64, tipo }
  if ((body.pdfBase64 || body.fileBase64 || body.pdf) && typeof body.tipo === 'string') {
    return 'parse_contabilita_pdf'
  }

  // analyze-document legacy payload: { fileBase64, filename, mimeType, tipoDocumento? }
  if (body.fileBase64) return 'analyze'

  return 'analyze'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const actionRaw = typeof body.action === 'string' ? body.action : ''
    const action = actionRaw.trim().toLowerCase() || inferAction(body)

    const handlerFn = handlers[action] || handlers.analyze
    const result = await handlerFn({ body })
    return res.status(result.status).json(result.json)
  } catch (e) {
    console.error('[api/document]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}

