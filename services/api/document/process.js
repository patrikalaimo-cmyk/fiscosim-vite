// api/process-document.js — Vercel Serverless Function
// POST { documentId } → runs full AI pipeline

import { runFullPipeline } from '../../pipelineService.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 120,
}

export async function processDocumentHandler({ body }) {
  try {
    const documentId = body?.documentId
    if (!documentId) return { status: 400, json: { error: 'documentId mancante' } }
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
      return {
        status: 500,
        json: {
          error: result.error || 'Pipeline error',
          step: result.step || null,
          pipeline_run_id: result.pipeline_run_id ?? null,
          pipeline_trace: result.pipeline_trace ?? null,
        },
      }
    }

    console.log('[process-document] ok', { documentId, pipeline_run_id: result.pipeline_run_id })
    return {
      status: 200,
      json: {
        status: 'ok',
        documentId,
        pipeline_run_id: result.pipeline_run_id ?? null,
        pipeline_trace: result.pipeline_trace ?? null,
      },
    }
  } catch (e) {
    console.error('[process-document] handler error', e)
    return { status: 500, json: { error: e?.message || String(e) } }
  }
}
