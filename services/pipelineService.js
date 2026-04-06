/**
 * Full AI pipeline runner — ready for a Vercel API endpoint.
 *
 * Fasi tracciate (pipeline_steps): parsing → ai_accounting → partitari → iva → liquidazione → insights
 * Con deferLedgerSync, partitario/registri IVA/auto-validate sono eseguiti nelle fasi dedicate.
 */

import { runParsing } from './aiParsingService.js'
import { orchestrate } from './orchestratorService.js'
import { logStep } from './aiSupervisorService.js'
import { runAccounting } from './accountingModuleService.js'
import { runAiAccounting, trySkipAiAccountingFromMemory } from './aiAccountingService.js'
import { saveAiDocumentMemoryAfterPipeline } from './aiDocumentMemoryService.js'
import { getSupabaseAdmin } from '../lib/db.js'
import {
  getFiscalKnowledge,
  promptBodyFromFiscalRows,
  FISCAL_CATEGORIES_ACCOUNTING,
} from '../lib/fiscalKnowledge.js'
import {
  createPipelineRun,
  finalizePipelineRun,
  fetchPipelineTrace,
  runTrackedStep,
} from './pipelineRunDbLogger.js'
import { runPartitariPhaseForDocument, runIvaLedgerPhaseForDocument } from './pipelineLedgerSyncService.js'
import { runLiquidazioneIva } from './liquidazioneIvaService.js'
import { runProactiveInsightEngine } from './proactiveInsightEngine.js'

const DEFER_LEDGER_SYNC = true

/**
 * @param {string} documentId
 * @param {{
 *   deps?: { db?: any },
 *   pipelineContext?: Record<string, unknown>,
 *   aiMode?: 'local' | 'online',
 *   aiPreprocessMode?: 'on' | 'off',
 * }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   result?: any,
 *   error?: string,
 *   step?: string,
 *   pipeline_run_id?: string | null,
 *   pipeline_trace?: { run: any, steps: any[] } | null,
 * }>}
 */
export async function runFullPipeline(documentId, options = {}) {
  const { deps = {}, pipelineContext, aiMode, aiPreprocessMode } = options

  if (!documentId || String(documentId).trim() === '') {
    return {
      ok: false,
      step: 'input',
      error: 'documentId mancante',
      pipeline_run_id: null,
      pipeline_trace: null,
    }
  }

  const mkLog =
    (step) =>
    (event, payload) => {
      try {
        const msg = payload === undefined ? String(event) : `${event} ${safeJson(payload)}`
        void logStep(documentId, step, msg, 'info', { deps })
      } catch {
        /* ignore */
      }
    }

  let db
  try {
    db = deps.db || (await getSupabaseAdmin())
  } catch (e) {
    return { ok: false, step: 'db', error: e?.message || String(e), pipeline_run_id: null, pipeline_trace: null }
  }

  const runId = await createPipelineRun(db, documentId)

  let orchestrationResult = null
  let orchestrationOk = false
  let parsingSnapshot = null

  try {
    await logStep(documentId, 'PIPELINE', 'START PIPELINE', 'info', { deps })

    const parsingTracked = await runTrackedStep(
      db,
      runId,
      'parsing',
      { documentId, aiMode: aiMode === 'online' ? 'online' : 'local', aiPreprocessMode },
      async () => {
        const parsingRes = await runParsing(documentId, {
          deps: { ...deps, log: mkLog('runParsing') },
          pipelineContext,
          aiMode: aiMode === 'online' ? 'online' : 'local',
          aiPreprocessMode: aiPreprocessMode === 'off' ? 'off' : 'on',
        })
        if (!parsingRes.ok) {
          throw new Error(parsingRes.error || 'runParsing failed')
        }
        parsingSnapshot = parsingRes.result
        return {
          ok: true,
          has_json_output: Boolean(parsingRes.result?.json_output),
        }
      }
    )

    if (!parsingTracked.ok) {
      await logStep(documentId, 'PIPELINE', `runParsing failed: ${parsingTracked.error}`, 'error', { deps })
      await finalizePipelineRun(db, runId, 'failed')
      const pipeline_trace = runId ? await fetchPipelineTrace(db, runId) : null
      return {
        ok: false,
        step: 'parsing',
        error: parsingTracked.error || 'runParsing failed',
        pipeline_run_id: runId,
        pipeline_trace,
      }
    }

    const aiAccMode = aiMode === 'online' ? 'online' : 'local'
    let fiscalAppendix = ''
    try {
      const fk = await getFiscalKnowledge(db, FISCAL_CATEGORIES_ACCOUNTING)
      if (fk.ok && Array.isArray(fk.rows)) {
        fiscalAppendix = promptBodyFromFiscalRows(fk.rows)
      }
    } catch {
      /* best-effort */
    }
    const memRaw = pipelineContext?.aiAccountingMemory ?? pipelineContext?.accountingMemoryExamples
    const memory =
      memRaw == null || memRaw === ''
        ? undefined
        : typeof memRaw === 'string'
          ? memRaw
          : (() => {
              try {
                return JSON.stringify(memRaw)
              } catch {
                return String(memRaw)
              }
            })()

    await runTrackedStep(db, runId, 'ai_accounting', { documentId, aiMode: aiAccMode, deferLedgerSync: DEFER_LEDGER_SYNC }, async () => {
      const skipRes = await trySkipAiAccountingFromMemory({
        db,
        documentId,
        log: mkLog('trySkipAiAccounting'),
        persist: true,
        deferLedgerSync: DEFER_LEDGER_SYNC,
      })
      if (skipRes.skipped) {
        return { skipped: true, memory_id: skipRes.memory_id || null }
      }
      const aiAcc = await runAiAccounting({
        documentId,
        parsingJson: parsingSnapshot?.json_output ?? {},
        fiscalKnowledge: fiscalAppendix,
        memory,
        aiMode: aiAccMode,
        deferLedgerSync: DEFER_LEDGER_SYNC,
        deps: { ...deps, db, log: mkLog('runAiAccounting') },
      })
      return {
        skipped: false,
        ai_ok: aiAcc.ok,
        ai_error: aiAcc.ok ? null : aiAcc.error || null,
        rowCount: aiAcc.rows?.length,
      }
    })

    await runTrackedStep(db, runId, 'partitari', { documentId }, async () => {
      const accRes = await runAccounting(documentId, parsingSnapshot?.json_output || {}, {
        deps: { ...deps, db, log: mkLog('runAccounting') },
        pipelineContext,
        deferLedgerSync: DEFER_LEDGER_SYNC,
      })
      const part = await runPartitariPhaseForDocument({
        db,
        documentId,
        log: mkLog('partitari_phase'),
      })
      return {
        runAccounting_ok: accRes.ok,
        runAccounting_error: accRes.ok ? null : accRes.error,
        partitari: part,
      }
    })

    await runTrackedStep(db, runId, 'iva', { documentId }, async () => {
      const led = await runIvaLedgerPhaseForDocument({
        db,
        documentId,
        log: mkLog('iva_ledger_phase'),
      })
      const orchRes = await orchestrate(documentId, {
        deps: { ...deps, db, log: mkLog('orchestrate') },
        pipelineContext,
      })
      orchestrationResult = orchRes?.result ?? null
      orchestrationOk = Boolean(orchRes.ok)
      try {
        await saveAiDocumentMemoryAfterPipeline({
          db,
          documentId,
          log: (event, payload) => mkLog('saveAiDocumentMemory')(event, payload),
        })
      } catch (e) {
        await logStep(documentId, 'PIPELINE', `ai document memory: ${e?.message || String(e)}`, 'warning', { deps })
      }
      return {
        ledger: led,
        orchestration_ok: orchestrationOk,
        orchestration_error: orchRes.ok ? null : orchRes.error || null,
      }
    })

    await runTrackedStep(db, runId, 'liquidazione', { documentId }, async () => {
      const { data: doc, error: docErr } = await db
        .from('documenti_contabilita')
        .select('societa_id, data_documento')
        .eq('id', documentId)
        .maybeSingle()
      if (docErr) {
        return { skipped: true, reason: 'doc_query_error', error: docErr.message }
      }
      if (!doc?.societa_id) {
        return { skipped: true, reason: 'no_societa' }
      }
      const dt = doc.data_documento ? new Date(doc.data_documento) : new Date()
      if (Number.isNaN(dt.getTime())) {
        return { skipped: true, reason: 'bad_date' }
      }
      const r = await runLiquidazioneIva({
        db,
        periodicita: 'mensile',
        anno: dt.getFullYear(),
        mese: dt.getMonth() + 1,
        generateFiscalOutputs: false,
        persistAiLog: true,
      })
      return { liquidazione_ok: r.ok, liquidazione_error: r.ok ? null : r.error || null, skipped: false }
    })

    await runTrackedStep(db, runId, 'insights', { documentId }, async () => {
      const { data: doc, error: docErr } = await db
        .from('documenti_contabilita')
        .select('societa_id')
        .eq('id', documentId)
        .maybeSingle()
      if (docErr) {
        return { skipped: true, reason: 'doc_query_error', error: docErr.message }
      }
      if (!doc?.societa_id) {
        return { skipped: true, reason: 'no_societa' }
      }
      const eng = await runProactiveInsightEngine(db, {
        societaId: doc.societa_id,
        log: (e, p) => mkLog('proactive_insights')(e, p),
      })
      return { engine_ok: eng.ok, generated: eng.generated, inserted: eng.inserted }
    })

    await finalizePipelineRun(db, runId, 'completed')
    await logStep(documentId, 'PIPELINE', 'END PIPELINE', 'info', { deps })

    const pipeline_trace = runId ? await fetchPipelineTrace(db, runId) : null

    return {
      ok: true,
      result: {
        parsing: parsingSnapshot,
        orchestration: orchestrationResult,
        orchestration_ok: orchestrationOk,
      },
      pipeline_run_id: runId,
      pipeline_trace,
    }
  } catch (e) {
    const msg = e?.message || String(e)
    try {
      await logStep(documentId, 'PIPELINE', msg, 'error', { deps })
    } catch {
      /* ignore */
    }
    await finalizePipelineRun(db, runId, 'failed')
    const pipeline_trace = runId ? await fetchPipelineTrace(db, runId) : null
    return {
      ok: false,
      step: 'global',
      error: msg,
      pipeline_run_id: runId,
      pipeline_trace,
    }
  }
}

function safeJson(v) {
  try {
    return JSON.stringify(v)
  } catch {
    return '[unserializable]'
  }
}
