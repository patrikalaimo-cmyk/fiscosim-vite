// api/process-document.js — Vercel Serverless Function
// POST { documentId } → runs full AI pipeline

import { runFullPipeline } from '../services/pipelineService.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 120,
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    console.log('[process-document] request', { method: req.method })
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const documentId = body?.documentId
    if (!documentId) return res.status(400).json({ error: 'documentId mancante' })
    const aiMode = body?.aiMode === 'online' ? 'online' : 'local'
    const aiPreprocessMode = body?.aiPreprocessMode === 'off' ? 'off' : 'on'
    console.log('AUTO_PIPELINE_TRIGGERED', {
      documentId,
      via: 'vercel/process-document',
      aiMode,
      aiPreprocessMode,
    })
    console.log('[process-document] start pipeline', { documentId })

    const result = await runFullPipeline(documentId, { aiMode, aiPreprocessMode })
    if (!result.ok) {
      console.error('[process-document] pipeline failed', { documentId, step: result.step, error: result.error })
      return res.status(500).json({
        error: result.error || 'Pipeline error',
        step: result.step || null,
        pipeline_run_id: result.pipeline_run_id ?? null,
        pipeline_trace: result.pipeline_trace ?? null,
      })
    }

    console.log('[process-document] ok', { documentId, pipeline_run_id: result.pipeline_run_id })
    return res.status(200).json({
      status: 'ok',
      documentId,
      pipeline_run_id: result.pipeline_run_id ?? null,
      pipeline_trace: result.pipeline_trace ?? null,
    })
  } catch (e) {
    console.error('[process-document] handler error', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}

