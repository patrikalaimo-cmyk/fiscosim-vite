import { AI_MODE_STORAGE_KEY, AI_PREPROCESS_MODE_STORAGE_KEY } from '../shared/constants'

/** Legge motore AI da localStorage (browser). */
function readAiModeForPipeline() {
  try {
    return localStorage.getItem(AI_MODE_STORAGE_KEY) === 'online' ? 'online' : 'local'
  } catch {
    return 'local'
  }
}

function readAiPreprocessModeForPipeline() {
  try {
    return localStorage.getItem(AI_PREPROCESS_MODE_STORAGE_KEY) === 'off' ? 'off' : 'on'
  } catch {
    return 'on'
  }
}

/**
 * Dopo insert su `documenti_contabilita`, chiama in background `runFullPipeline(documentId)`
 * via `POST /api/document` (action process; nessun await in UI).
 * Richiede API attiva (`npm run dev:api` in locale: proxy Vite `/api` → :3001).
 *
 * @param {string | null | undefined} documentId
 * @param {{ source?: string, aiMode?: 'local' | 'online', aiPreprocessMode?: 'on' | 'off' }} [options]
 */
export function triggerAutoPipeline(documentId, options = {}) {
  const source = options.source || 'unknown'
  if (!documentId || typeof documentId !== 'string') return

  const aiMode =
    options.aiMode === 'online' || options.aiMode === 'local'
      ? options.aiMode
      : typeof window !== 'undefined'
        ? readAiModeForPipeline()
        : 'local'

  const aiPreprocessMode =
    options.aiPreprocessMode === 'off' || options.aiPreprocessMode === 'on'
      ? options.aiPreprocessMode
      : typeof window !== 'undefined'
        ? readAiPreprocessModeForPipeline()
        : 'on'

  const payload = { documentId, source, aiMode, aiPreprocessMode, ts: new Date().toISOString() }
  console.log('AUTO_PIPELINE_TRIGGERED', payload)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('fiscosim:ai-pipeline', { detail: { phase: 'start', documentId } })
    )
  }

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()

  void fetch('/api/document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId, aiMode, aiPreprocessMode }),
    keepalive: true,
  })
    .then(async (res) => {
      const durationMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
      )
      if (!res.ok) {
        let errBody = {}
        try {
          errBody = await res.json()
        } catch {
          /* ignore */
        }
        console.warn(
          'AUTO_PIPELINE_FAILED',
          documentId,
          errBody.step || res.status,
          errBody.error || res.statusText,
          { documentId, source, status: res.status, ...errBody }
        )
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fiscosim:ai-pipeline', {
            detail: { phase: 'end', documentId, ok: res.ok, durationMs },
          })
        )
      }
    })
    .catch((err) => {
      const durationMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
      )
      console.warn('AUTO_PIPELINE_REQUEST_ERROR', {
        documentId,
        source,
        message: err?.message || String(err),
      })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fiscosim:ai-pipeline', {
            detail: { phase: 'end', documentId, ok: false, durationMs },
          })
        )
      }
    })
}
