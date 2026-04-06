/**
 * Test Scenario Engine — esecuzione sequenziale step (E2E-style) con confronto expected_results.
 */

import { insertPassiveDocumentFromXml } from './passiveXmlDocumentInsert.js'
import { runFullPipeline } from './pipelineService.js'
import {
  getBuiltInFallbackSteps,
  normalizeBuiltInScenarioExpectedResults,
  relaxExpectedWhenPipelineTraceEmpty,
} from './testScenarioDefaults.js'
import { compareExpectedResults } from './testScenarioCompare.js'

export { compareExpectedResults } from './testScenarioCompare.js'

function parseJsonField(v, fallback) {
  if (v == null) return fallback
  if (typeof v === 'object' && !Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      return JSON.parse(v)
    } catch {
      return fallback
    }
  }
  return fallback
}

function normalizeSteps(raw) {
  const j = parseJsonField(raw, [])
  return Array.isArray(j) ? j : []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string|null} documentId
 */
export async function capturePipelineArtifacts(db, documentId) {
  const empty = {
    document: null,
    accounting_entries: [],
    partitari: [],
    registri_iva: [],
  }
  if (!db?.from || !documentId) return empty

  const { data: doc, error: docErr } = await db.from('documenti_contabilita').select('*').eq('id', documentId).maybeSingle()
  if (docErr) {
    console.warn('[testScenarioEngine] capture documenti_contabilita', docErr.message || docErr)
  }

  const { data: entries } = await db
    .from('accounting_entries')
    .select(
      'id,status,data,document_id,created_at,ai_confidence,ai_status,ai_source,ai_explanation,auto_validate_meta'
    )
    .eq('document_id', documentId)

  const list = Array.isArray(entries) ? entries : []
  const entryIds = list.map((e) => e.id).filter(Boolean)

  let partRows = []
  if (entryIds.length) {
    const { data: p } = await db.from('partitari').select('id,accounting_entry_id,dare,avere,data').in('accounting_entry_id', entryIds)
    partRows = Array.isArray(p) ? p : []
  }

  const { data: reg } = await db.from('registri_iva').select('id,tipo,iva,iva_detraibile,document_id,data').eq('document_id', documentId)
  const regRows = Array.isArray(reg) ? reg : []

  return {
    document: doc || null,
    accounting_entries: list,
    partitari: partRows,
    registri_iva: regRows,
  }
}

function summarizeForReport(capture) {
  if (!capture) return null
  return {
    document_id: capture.document?.id,
    tipo_documento: capture.document?.tipo_documento,
    workflow_status: capture.document?.workflow_status,
    numero_documento: capture.document?.numero_documento,
    accounting_entries_count: capture.accounting_entries?.length ?? 0,
    partitari_count: capture.partitari?.length ?? 0,
    registri_iva_count: capture.registri_iva?.length ?? 0,
    accounting_statuses: (capture.accounting_entries || []).map((e) => e.status),
  }
}

/** Snapshot per expected_results.ai_validation (prima scrittura = flusso utente “apertura prima nota”). */
function firstEntryAiSnapshot(entries) {
  const e = Array.isArray(entries) && entries.length ? entries[0] : null
  if (!e) return { primary_entry: null }
  return {
    primary_entry: {
      ai_confidence: e.ai_confidence,
      ai_status: e.ai_status,
      ai_source: e.ai_source,
      ai_explanation: e.ai_explanation,
      auto_validate_meta: e.auto_validate_meta,
    },
  }
}

function buildPipelinePhasesSnapshot(trace) {
  if (!trace || !Array.isArray(trace.steps)) return { steps: [], ordered_names: [] }
  const steps = trace.steps.map((s) => ({
    step: s.step,
    status: s.status,
    duration_ms: s.duration_ms,
    error_message: s.error_message,
  }))
  return { steps, ordered_names: steps.map((x) => x.step) }
}

/**
 * Insight legati al documento dopo pipeline (stesso flusso UI: società → documento).
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 */
function buildAccountingDataSnapshot(entries, document) {
  const e = Array.isArray(entries) && entries.length ? entries[0] : null
  const rows = e?.data?.rows
  const contoIds = []
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (r?.conto_id) contoIds.push(String(r.conto_id))
      if (r?.conto_codice) contoIds.push(`cod:${r.conto_codice}`)
    }
  }
  return {
    document_conto_id: document?.conto_id ?? null,
    entry_row_count: Array.isArray(rows) ? rows.length : 0,
    conto_ids_in_rows: contoIds,
    has_conto: document?.conto_id != null || contoIds.length > 0,
  }
}

function buildIvaSnapshot(registri) {
  const list = Array.isArray(registri) ? registri : []
  let sum = 0
  for (const r of list) {
    sum += Math.abs(Number(r?.iva || 0)) + Math.abs(Number(r?.iva_detraibile || 0))
  }
  return {
    registri_count: list.length,
    iva_activity_sum: Math.round(sum * 100) / 100,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 */
async function fetchLiquidazioneRowForDocumentMonth(db, document) {
  if (!db?.from || !document?.data_documento) return { row: null, anno: null, mese: null }
  const d = new Date(document.data_documento)
  if (Number.isNaN(d.getTime())) return { row: null, anno: null, mese: null }
  const anno = d.getFullYear()
  const mese = d.getMonth() + 1
  const { data } = await db
    .from('liquidazione_iva')
    .select('*')
    .eq('periodicita', 'mensile')
    .eq('anno', anno)
    .eq('mese', mese)
    .maybeSingle()
  return { row: data || null, anno, mese }
}

async function fetchInsightsForDocument(db, societaId, documentId) {
  const empty = { rows_for_document: [], counts_by_tipo: {} }
  if (!db?.from || !societaId || !documentId) return empty
  const { data, error } = await db
    .from('ai_insights')
    .select('*')
    .eq('societa_id', societaId)
    .order('created_at', { ascending: false })
    .limit(400)
  if (error || !Array.isArray(data)) return empty
  const rowsForDoc = data.filter((r) => {
    const ref = r?.entity_ref
    return ref && typeof ref === 'object' && ref.document_id === documentId
  })
  const counts = {}
  for (const r of rowsForDoc) {
    const t = String(r?.tipo || '_')
    counts[t] = (counts[t] || 0) + 1
  }
  return { rows_for_document: rowsForDoc, counts_by_tipo: counts }
}

/**
 * @param {string} scenarioId — UUID riga test_scenarios
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   societaId: string,
 *   xmlText?: string,
 *   filename?: string,
 *   onStep?: (event: string, payload?: Record<string, unknown>) => void,
 *   pipelineOptions?: { aiMode?: 'local'|'online', aiPreprocessMode?: 'on'|'off' },
 *   xmlBatch?: Array<{ xmlText: string, filename?: string }>,
 * }} options
 * @returns {Promise<{
 *   pass: boolean,
 *   scenario_id: string,
 *   scenario_nome?: string,
 *   failures: Array<{ path: string, message: string }>,
 *   steps: Array<Record<string, unknown>>,
 *   pipeline_run_id?: string | null,
 *   captured: Record<string, unknown>,
 *   pipeline_trace?: { run?: Record<string, unknown>, steps?: Array<Record<string, unknown>> } | null,
 *   error?: string,
 * }>}
 */
export async function runTestScenario(scenarioId, options = {}) {
  const { db, societaId, xmlText, filename, onStep, pipelineOptions = {}, xmlBatch } = options
  const log = (e, p) => {
    try {
      onStep?.(e, p)
    } catch {
      /* ignore */
    }
  }

  if (!db?.from || !scenarioId || !societaId) {
    return {
      pass: false,
      scenario_id: scenarioId,
      failures: [{ path: '_', message: 'db, scenarioId e societaId richiesti' }],
      steps: [],
      captured: {},
      error: 'db, scenarioId e societaId richiesti',
    }
  }

  const { data: scenario, error: scErr } = await db.from('test_scenarios').select('*').eq('id', scenarioId).maybeSingle()
  if (scErr || !scenario) {
    return {
      pass: false,
      scenario_id: scenarioId,
      failures: [{ path: 'scenario', message: scErr?.message || 'Scenario non trovato' }],
      steps: [],
      captured: {},
      error: 'Scenario non trovato',
    }
  }

  let usedBuiltInStepFallback = false
  let steps = normalizeSteps(scenario.steps)
  if (steps.length === 0) {
    const fallback = getBuiltInFallbackSteps(scenarioId)
    if (fallback.length) {
      steps = fallback
      usedBuiltInStepFallback = true
      log('SCENARIO_STEPS_FALLBACK', { scenarioId, count: steps.length })
    }
  }
  if (steps.length === 0) {
    log('SCENARIO_EMPTY_STEPS', { scenarioId })
    return {
      pass: false,
      scenario_id: scenarioId,
      scenario_nome: scenario.nome,
      failures: [
        {
          path: 'scenario.steps',
          message:
            'Nessuno step nel JSON: la colonna steps in test_scenarios è vuota o non è un array valido. Applica la migration degli scenari E2E o correggi la riga.',
        },
      ],
      warnings: [],
      steps: [],
      document_ids: [],
      pipeline_run_id: null,
      captured: {
        summary: null,
        warnings: [],
        pipeline_trace: null,
        ai_validation: { primary_entry: null },
        insights: { counts_by_tipo: {}, rows_for_document_count: 0 },
        pipeline_phases: { steps: [], ordered_names: [] },
        accounting_entries_preview: [],
        accounting_data: {
          document_conto_id: null,
          entry_row_count: 0,
          conto_ids_in_rows: [],
          has_conto: false,
        },
        iva: { registri_count: 0, iva_activity_sum: 0 },
        liquidazione: { row: null, anno: null, mese: null },
        batch_summary: { documents_processed: 0 },
      },
      pipeline_trace: null,
      error: 'scenario.steps vuoto',
    }
  }

  let expected = normalizeBuiltInScenarioExpectedResults(scenarioId, scenario.expected_results)

  const ctx = {
    societaId,
    documentId: null,
    documentIds: [],
    pipelineResult: null,
    pipeline_trace: null,
    last_capture: null,
    documents_processed: 0,
  }

  const stepReports = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {}
    const action = String(step.action || '').toLowerCase()
    const t0 = Date.now()
    const base = { index: i, action, started_at: new Date(t0).toISOString() }

    try {
      if (action === 'upload_xml') {
        if (!xmlText || !String(xmlText).trim()) {
          stepReports.push({ ...base, status: 'error', error: 'XML mancante: passa xmlText nelle opzioni' })
          log('STEP_ERROR', { step: i, action, error: 'xml mancante' })
          continue
        }
        const ins = await insertPassiveDocumentFromXml({
          db,
          societaId,
          xmlText,
          filename: filename || step.filename || 'scenario-fattura.xml',
          tryStorage: step.try_storage !== false,
        })
        if (!ins.ok) {
          stepReports.push({ ...base, status: 'error', error: ins.error })
          log('STEP_ERROR', { step: i, action, error: ins.error })
          continue
        }
        ctx.documentId = ins.documentId
        ctx.documentIds = [ins.documentId]
        ctx.documents_processed = 1
        stepReports.push({
          ...base,
          status: 'ok',
          duration_ms: Date.now() - t0,
          document_id: ins.documentId,
          storage_ok: ins.storage_ok,
        })
        log('STEP_OK', { step: i, action, document_id: ins.documentId })
        ctx.last_capture = await capturePipelineArtifacts(db, ctx.documentId)
        continue
      }

      if (action === 'batch_upload_pipeline') {
        const batch = Array.isArray(xmlBatch) ? xmlBatch : []
        if (!batch.length) {
          stepReports.push({ ...base, status: 'error', error: 'xmlBatch richiesto: array di { xmlText, filename }' })
          log('STEP_ERROR', { step: i, action, error: 'xmlBatch vuoto' })
          continue
        }
        const maxN = Math.min(20, Math.max(1, Number(step.max) || batch.length))
        const sub = []
        let lastOk = true
        let lastErr = null
        ctx.documentIds = []
        for (let bi = 0; bi < Math.min(batch.length, maxN); bi++) {
          const item = batch[bi]
          const txt = item?.xmlText != null ? String(item.xmlText) : ''
          if (!txt.trim()) {
            sub.push({ index: bi, status: 'error', phase: 'upload_xml', error: 'XML vuoto' })
            lastOk = false
            lastErr = 'XML vuoto in batch'
            break
          }
          const ins = await insertPassiveDocumentFromXml({
            db,
            societaId,
            xmlText: txt,
            filename: item?.filename || step.filename || `fattura-${bi + 1}.xml`,
            tryStorage: step.try_storage !== false,
          })
          if (!ins.ok) {
            sub.push({ index: bi, status: 'error', phase: 'upload_xml', error: ins.error })
            lastOk = false
            lastErr = ins.error
            break
          }
          ctx.documentIds.push(ins.documentId)
          ctx.documentId = ins.documentId
          const pr = await runFullPipeline(ins.documentId, {
            deps: { db },
            aiMode: pipelineOptions.aiMode || step.aiMode || 'local',
            aiPreprocessMode: pipelineOptions.aiPreprocessMode || step.aiPreprocessMode || 'on',
          })
          ctx.pipelineResult = pr
          ctx.pipeline_trace = pr.pipeline_trace ?? null
          sub.push({
            index: bi,
            status: pr.ok ? 'ok' : 'error',
            document_id: ins.documentId,
            pipeline_run_id: pr.pipeline_run_id || null,
            pipeline_error: pr.error || null,
          })
          if (!pr.ok) {
            lastOk = false
            lastErr = pr.error || 'pipeline fallita'
            break
          }
        }
        ctx.documents_processed = ctx.documentIds.length
        stepReports.push({
          ...base,
          status: lastOk ? 'ok' : 'error',
          duration_ms: Date.now() - t0,
          error: lastErr || undefined,
          sub_steps: sub,
          batch_count: ctx.documentIds.length,
          pipeline_run_id:
            sub.filter((s) => s.pipeline_run_id).slice(-1)[0]?.pipeline_run_id ||
            ctx.pipeline_trace?.run?.id ||
            null,
        })
        log(lastOk ? 'STEP_OK' : 'STEP_ERROR', { step: i, action, batch_count: ctx.documentIds.length })
        if (ctx.documentId) ctx.last_capture = await capturePipelineArtifacts(db, ctx.documentId)
        continue
      }

      if (action === 'run_pipeline') {
        if (!ctx.documentId) {
          stepReports.push({ ...base, status: 'error', error: 'Nessun documentId: eseguire upload_xml prima' })
          continue
        }
        const pr = await runFullPipeline(ctx.documentId, {
          deps: { db },
          aiMode: pipelineOptions.aiMode || step.aiMode || 'local',
          aiPreprocessMode: pipelineOptions.aiPreprocessMode || step.aiPreprocessMode || 'on',
        })
        ctx.pipelineResult = pr
        ctx.pipeline_trace = pr.pipeline_trace ?? null
        stepReports.push({
          ...base,
          status: pr.ok ? 'ok' : 'error',
          duration_ms: Date.now() - t0,
          pipeline_ok: pr.ok,
          pipeline_error: pr.error || null,
          pipeline_run_id: pr.pipeline_run_id || null,
        })
        log(pr.ok ? 'STEP_OK' : 'STEP_WARN', { step: i, action, pipeline_ok: pr.ok })
        ctx.last_capture = await capturePipelineArtifacts(db, ctx.documentId)
        continue
      }

      if (action === 'open_entry') {
        if (!ctx.documentId) {
          stepReports.push({ ...base, status: 'error', error: 'Nessun documentId' })
          continue
        }
        ctx.last_capture = await capturePipelineArtifacts(db, ctx.documentId)
        const entries = ctx.last_capture.accounting_entries || []
        stepReports.push({
          ...base,
          status: 'ok',
          duration_ms: Date.now() - t0,
          entries_count: entries.length,
          entry_ids: entries.map((e) => e.id),
        })
        log('STEP_OK', { step: i, action, entries_count: entries.length })
        continue
      }

      if (action === 'validate') {
        ctx.last_capture = ctx.documentId ? await capturePipelineArtifacts(db, ctx.documentId) : null
        const customRules = step.rules && typeof step.rules === 'object' ? step.rules : {}
        stepReports.push({
          ...base,
          status: 'ok',
          duration_ms: Date.now() - t0,
          snapshot: summarizeForReport(ctx.last_capture),
          custom_rules: customRules,
        })
        log('STEP_OK', { step: i, action })
        continue
      }

      if (action === 'wait_ms') {
        const ms = Math.min(60000, Math.max(0, Number(step.ms) || 0))
        await new Promise((r) => setTimeout(r, ms))
        stepReports.push({ ...base, status: 'ok', duration_ms: ms, waited: true })
        continue
      }

      stepReports.push({ ...base, status: 'skipped', reason: `Azione non supportata: ${action}` })
      log('STEP_SKIP', { step: i, action })
    } catch (e) {
      stepReports.push({
        ...base,
        status: 'error',
        duration_ms: Date.now() - t0,
        error: e?.message || String(e),
      })
      log('STEP_ERROR', { step: i, action, error: e?.message || String(e) })
    }
  }

  const finalCapture = ctx.documentId ? await capturePipelineArtifacts(db, ctx.documentId) : { document: null, accounting_entries: [], partitari: [], registri_iva: [] }

  const societaForInsights = finalCapture.document?.societa_id || societaId
  const insightsSnap = ctx.documentId ? await fetchInsightsForDocument(db, societaForInsights, ctx.documentId) : { rows_for_document: [], counts_by_tipo: {} }

  const liqSnap = await fetchLiquidazioneRowForDocumentMonth(db, finalCapture.document || {})

  const rawDoc = finalCapture.document
  const documentForCompare = {
    ...(rawDoc && typeof rawDoc === 'object' ? rawDoc : {}),
    tipo_documento: rawDoc?.tipo_documento || 'fattura_passiva',
  }

  expected = relaxExpectedWhenPipelineTraceEmpty(expected, ctx.pipeline_trace)

  const actualForCompare = {
    document: documentForCompare,
    accounting_entries: finalCapture.accounting_entries || [],
    partitari: finalCapture.partitari || [],
    registri_iva: finalCapture.registri_iva || [],
    ai_validation: firstEntryAiSnapshot(finalCapture.accounting_entries),
    insights: insightsSnap,
    pipeline_phases: buildPipelinePhasesSnapshot(ctx.pipeline_trace),
    accounting_data: buildAccountingDataSnapshot(finalCapture.accounting_entries, finalCapture.document),
    iva: buildIvaSnapshot(finalCapture.registri_iva),
    liquidazione: { row: liqSnap.row, anno: liqSnap.anno, mese: liqSnap.mese },
    batch_summary: { documents_processed: ctx.documents_processed || ctx.documentIds?.length || 0 },
  }

  const failures = compareExpectedResults(actualForCompare, expected, {
    pipelineResult: ctx.pipelineResult,
  })

  const pass = failures.length === 0 && stepReports.every((s) => s.status !== 'error')

  log('SCENARIO_DONE', { pass, failures_count: failures.length })

  const traceSteps = ctx.pipeline_trace?.steps
  const pipelineTraceWarning =
    Array.isArray(traceSteps) && traceSteps.length === 0 && ctx.pipelineResult
      ? 'Nessuno step in pipeline_trace: di solito pipeline_runs non è stato creato (applica migration pipeline_runs) o insert su pipeline_runs fallisce — runId null e gli step non vengono persistiti.'
      : null

  const stepsFallbackWarning = usedBuiltInStepFallback
    ? 'test_scenarios.steps era vuoto nel DB: usati gli step predefiniti per questo UUID. Esegui la migration degli scenari E2E per allineare la riga.'
    : null

  const pipelineRunId =
    ctx.pipeline_trace?.run?.id ??
    ctx.pipelineResult?.pipeline_run_id ??
    stepReports.map((s) => s.pipeline_run_id).find(Boolean) ??
    null

  return {
    pass,
    scenario_id: scenarioId,
    scenario_nome: scenario.nome,
    failures,
    warnings: [stepsFallbackWarning, pipelineTraceWarning].filter(Boolean),
    steps: stepReports,
    document_ids: ctx.documentIds?.length ? ctx.documentIds : ctx.documentId ? [ctx.documentId] : [],
    pipeline_run_id: pipelineRunId,
    captured: {
      summary: summarizeForReport(finalCapture),
      warnings: [stepsFallbackWarning, pipelineTraceWarning].filter(Boolean),
      pipeline_trace: ctx.pipeline_trace,
      ai_validation: actualForCompare.ai_validation,
      insights: {
        counts_by_tipo: insightsSnap.counts_by_tipo,
        rows_for_document_count: insightsSnap.rows_for_document?.length ?? 0,
      },
      pipeline_phases: actualForCompare.pipeline_phases,
      accounting_entries_preview: (finalCapture.accounting_entries || []).slice(0, 3).map((e) => ({
        id: e.id,
        status: e.status,
        ai_confidence: e.ai_confidence,
        ai_source: e.ai_source,
        ai_explanation: e.ai_explanation,
        data_keys: e.data && typeof e.data === 'object' ? Object.keys(e.data).slice(0, 12) : [],
      })),
      accounting_data: actualForCompare.accounting_data,
      iva: actualForCompare.iva,
      liquidazione: actualForCompare.liquidazione,
      batch_summary: actualForCompare.batch_summary,
    },
    pipeline_trace: ctx.pipeline_trace,
  }
}
