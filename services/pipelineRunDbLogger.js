/**
 * Persistenza trace pipeline su pipeline_runs / pipeline_steps.
 * Tutte le funzioni sono best-effort: non lanciano verso il chiamante.
 */

const MAX_JSON_CHARS = 62000

/**
 * @param {unknown} v
 * @returns {object|null}
 */
export function jsonSnapshotForDb(v) {
  try {
    if (v === undefined) return null
    const s = JSON.stringify(v)
    if (s.length <= MAX_JSON_CHARS) return JSON.parse(s)
    return {
      _truncated: true,
      original_length: s.length,
      head: s.slice(0, MAX_JSON_CHARS),
    }
  } catch {
    return { _error: 'json_serialize_failed', preview: String(v).slice(0, 500) }
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} documentoId
 * @returns {Promise<string|null>} run id
 */
export async function createPipelineRun(db, documentoId) {
  try {
    if (!db?.from || !documentoId) return null
    const started_at = new Date().toISOString()
    const { data, error } = await db
      .from('pipeline_runs')
      .insert({ documento_id: documentoId, stato: 'running', started_at })
      .select('id')
      .maybeSingle()
    if (error) {
      console.warn('[pipelineRunDbLogger] createPipelineRun', error.message || error)
      return null
    }
    return data?.id || null
  } catch (e) {
    console.warn('[pipelineRunDbLogger] createPipelineRun', e?.message || e)
    return null
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string|null|undefined} runId
 * @param {'completed'|'failed'} stato
 */
export async function finalizePipelineRun(db, runId, stato) {
  try {
    if (!db?.from || !runId) return
    const ended_at = new Date().toISOString()
    const { error } = await db.from('pipeline_runs').update({ stato, ended_at }).eq('id', runId)
    if (error) console.warn('[pipelineRunDbLogger] finalizePipelineRun', error.message || error)
  } catch (e) {
    console.warn('[pipelineRunDbLogger] finalizePipelineRun', e?.message || e)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string|null|undefined} runId
 * @param {string} step
 * @param {unknown} input
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<{ ok: boolean, output?: unknown, error?: string, duration_ms: number, status: string }>}
 */
export async function runTrackedStep(db, runId, step, input, fn) {
  const t0 = Date.now()
  const startedIso = new Date(t0).toISOString()
  let output = null
  let errMsg = null
  let status = 'ok'
  try {
    output = await fn()
  } catch (e) {
    errMsg = e?.message || String(e)
    status = 'error'
  }
  const duration_ms = Date.now() - t0
  const endedIso = new Date().toISOString()

  try {
    if (db?.from && runId) {
      const { error } = await db.from('pipeline_steps').insert({
        pipeline_run_id: runId,
        step,
        status,
        input: jsonSnapshotForDb(input),
        output: jsonSnapshotForDb(output),
        error_message: errMsg,
        duration_ms,
        started_at: startedIso,
        ended_at: endedIso,
      })
      if (error) console.warn('[pipelineRunDbLogger] insert step', step, error.message || error)
    }
  } catch (e) {
    console.warn('[pipelineRunDbLogger] insert step', step, e?.message || e)
  }

  return { ok: status === 'ok', output, error: errMsg, duration_ms, status }
}

/**
 * Registra uno step senza eseguire corpo (es. skipped).
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string|null|undefined} runId
 * @param {string} step
 * @param {unknown} input
 * @param {unknown} output
 * @param {string} [reason]
 */
export async function recordSkippedStep(db, runId, step, input, output, reason) {
  const startedIso = new Date().toISOString()
  try {
    if (!db?.from || !runId) return
    const out = reason ? { ...(typeof output === 'object' && output ? output : {}), skip_reason: reason } : output
    await db.from('pipeline_steps').insert({
      pipeline_run_id: runId,
      step,
      status: 'skipped',
      input: jsonSnapshotForDb(input),
      output: jsonSnapshotForDb(out),
      error_message: null,
      duration_ms: 0,
      started_at: startedIso,
      ended_at: startedIso,
    })
  } catch (e) {
    console.warn('[pipelineRunDbLogger] recordSkippedStep', e?.message || e)
  }
}

/**
 * Carica run + steps per risposta API.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} runId
 */
export async function fetchPipelineTrace(db, runId) {
  try {
    if (!db?.from || !runId) return null
    const { data: run, error: e1 } = await db.from('pipeline_runs').select('*').eq('id', runId).maybeSingle()
    if (e1 || !run) return null
    const { data: steps, error: e2 } = await db
      .from('pipeline_steps')
      .select('*')
      .eq('pipeline_run_id', runId)
      .order('started_at', { ascending: true })
    if (e2) return { run, steps: [] }
    return { run, steps: Array.isArray(steps) ? steps : [] }
  } catch {
    return null
  }
}
