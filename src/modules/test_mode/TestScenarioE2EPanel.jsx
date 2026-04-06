import { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { DEFAULT_TEST_SCENARIO_FATTURA_PASSIVA_ID } from '../../shared/constants'
import {
  parseScenarioSteps,
  scenarioNeedsClientFile,
  scenarioNeedsBatchFiles,
  humanizeStepAction,
  PIPELINE_USER_PHASES,
  getBatchMinDocuments,
} from './testScenarioUtils.js'

function StepLine({ index, step, mode }) {
  const action = String(step?.action || '?')
  const label = humanizeStepAction(step)
  const st = step?.status
  const err = step?.error
  const ms = step?.duration_ms
  const pending = mode === 'pending'
  const active = mode === 'active'
  const done = mode === 'done'

  const border = active ? 'rgba(200,164,94,.55)' : st === 'error' ? 'rgba(224,82,82,.45)' : done && st === 'ok' ? 'rgba(52,194,122,.4)' : 'var(--bd)'
  const bg = active ? 'rgba(200,164,94,.1)' : st === 'error' ? 'rgba(224,82,82,.07)' : done && st === 'ok' ? 'rgba(52,194,122,.07)' : 'var(--s2)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '.5rem',
        padding: '.45rem .55rem',
        borderRadius: 8,
        border: `1px solid ${border}`,
        background: bg,
        fontSize: '.74rem',
        marginBottom: '.35rem',
      }}
    >
      <span style={{ fontFamily: 'monospace', color: 'var(--mu)', minWidth: 22 }}>{index + 1}.</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--tx)' }}>
          {label}
          <span style={{ fontWeight: 400, color: 'var(--mu)', marginLeft: 6, fontSize: '.65rem' }}>({action})</span>
        </div>
        {pending && <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginTop: 2 }}>In attesa…</div>}
        {active && <div style={{ color: 'var(--gold)', fontSize: '.68rem', marginTop: 2 }}>▸ In corso…</div>}
        {done && (
          <div style={{ marginTop: 4, fontSize: '.68rem', color: st === 'error' ? '#ff8585' : '#8892a4' }}>
            {st === 'ok' && '✓ Completato'}
            {st === 'error' && `✗ ${err || 'Errore'}`}
            {st === 'skipped' && '○ Saltato'}
            {ms != null && ` · ${ms} ms`}
          </div>
        )}
        {done && step.pipeline_run_id && (
          <div style={{ marginTop: 6, fontSize: '.6rem', color: 'var(--mu)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            <span style={{ color: 'var(--gold)' }}>pipeline_run_id</span> {String(step.pipeline_run_id)}
          </div>
        )}
        {done && Array.isArray(step.sub_steps) && step.sub_steps.length > 0 && (
          <div style={{ marginTop: 8, padding: 6, borderRadius: 6, background: 'var(--s1)', border: '1px solid var(--bd)', fontSize: '.58rem', color: 'var(--mu)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--tx)' }}>Sotto-step (come in produzione)</div>
            {step.sub_steps.map((ss, j) => (
              <div key={j} style={{ marginBottom: 2 }}>
                Fattura {(ss.index ?? j) + 1}:{' '}
                <span style={{ color: ss.status === 'ok' ? '#34c27a' : ss.status === 'error' ? '#e05252' : 'var(--mu)' }}>{ss.status || '—'}</span>
                {ss.document_id && <span style={{ marginLeft: 6, fontFamily: 'monospace' }}>doc {String(ss.document_id).slice(0, 8)}…</span>}
                {ss.pipeline_run_id && <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: '.52rem' }}>run {String(ss.pipeline_run_id).slice(0, 8)}…</span>}
                {(ss.pipeline_error || ss.error) && (
                  <span style={{ color: '#e05252' }}> — {ss.pipeline_error || ss.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Visualizza le 6 fasi utente allineate a pipeline_steps (DB). */
function PipelinePhasesStrip({ trace, fetching }) {
  const steps = Array.isArray(trace?.steps) ? trace.steps : []
  const byId = Object.fromEntries(steps.map((s) => [String(s?.step || ''), s]))

  return (
    <div style={{ marginBottom: '.75rem' }}>
      <div style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--mu)', marginBottom: '.35rem' }}>
        Fasi pipeline (utente)
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 6,
        }}
      >
        {PIPELINE_USER_PHASES.map((ph) => {
          const s = byId[ph.id]
          let color = 'var(--mu)'
          let short = '—'
          if (fetching && !s) {
            short = '…'
            color = 'var(--gold)'
          } else if (s?.status === 'ok') {
            short = 'OK'
            color = '#34c27a'
          } else if (s?.status === 'error') {
            short = 'Err'
            color = '#e05252'
          } else if (s?.status === 'skipped') {
            short = 'Skip'
            color = '#c8a45e'
          }
          return (
            <div
              key={ph.id}
              title={ph.desc}
              style={{
                textAlign: 'center',
                padding: '.4rem .25rem',
                border: '1px solid var(--bd)',
                borderRadius: 8,
                background: 'var(--s2)',
                minWidth: 0,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '.58rem', color: 'var(--tx)', lineHeight: 1.2 }}>{ph.label}</div>
              <div style={{ fontSize: '.55rem', color, marginTop: 2 }}>{short}</div>
              {s?.duration_ms != null && <div style={{ fontSize: '.5rem', color: 'var(--mu)' }}>{s.duration_ms}ms</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function safeJsonStringify(v) {
  try {
    if (v === undefined) return '—'
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

/** Fasi pipeline persistite (pipeline_runs / pipeline_steps): durata, errori, input/output. */
function PipelineTraceSection({ trace, pipelineRunId }) {
  const run = trace?.run
  const steps = Array.isArray(trace?.steps) ? trace.steps : []
  const id = pipelineRunId || run?.id
  if (!id && steps.length === 0) return null

  const copyId = () => {
    if (!id) return
    void navigator.clipboard?.writeText(String(id)).catch(() => {})
  }

  const statusColor = (st) => {
    if (st === 'ok') return '#34c27a'
    if (st === 'error') return '#e05252'
    if (st === 'skipped') return '#c8a45e'
    return 'var(--mu)'
  }

  return (
    <div
      style={{
        marginTop: '.75rem',
        padding: '.65rem .75rem',
        borderRadius: 8,
        border: '1px solid rgba(52, 194, 122, 0.35)',
        background: 'rgba(52, 194, 122, 0.06)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '.78rem', color: 'var(--gold)', marginBottom: '.4rem' }}>⚙️ Log pipeline (DB)</div>
      {id && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem', fontSize: '.68rem' }}>
          <span style={{ color: 'var(--mu)' }}>pipeline_run_id</span>
          <code style={{ fontSize: '.62rem', wordBreak: 'break-all', flex: '1 1 200px' }}>{String(id)}</code>
          <button type="button" className="btn-sec" style={{ fontSize: '.62rem', padding: '2px 10px' }} onClick={copyId}>
            Copia ID
          </button>
        </div>
      )}
      {run && (
        <div style={{ fontSize: '.65rem', color: 'var(--mu)', marginBottom: '.5rem', lineHeight: 1.45 }}>
          Stato run: <strong style={{ color: 'var(--tx)' }}>{run.stato || '—'}</strong>
          {run.started_at && (
            <>
              {' '}
              · inizio {new Date(run.started_at).toLocaleString('it-IT')}
            </>
          )}
          {run.ended_at && (
            <>
              {' '}
              · fine {new Date(run.ended_at).toLocaleString('it-IT')}
            </>
          )}
        </div>
      )}
      {steps.length === 0 && (
        <div style={{ fontSize: '.7rem', color: 'var(--mu)' }}>Nessuno step pipeline in risposta. Se la pipeline è partita, controlla i log server o le policy Supabase su pipeline_steps.</div>
      )}
      {steps.map((ps, idx) => (
        <div
          key={ps.id || `${ps.step}-${idx}`}
          style={{
            marginBottom: '.45rem',
            padding: '.45rem .5rem',
            borderRadius: 7,
            border: '1px solid var(--bd)',
            background: 'var(--s2)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '.35rem .75rem', fontSize: '.72rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--tx)' }}>{ps.step || '?'}</span>
            <span style={{ color: statusColor(ps.status), fontWeight: 600 }}>{ps.status || '—'}</span>
            {ps.duration_ms != null && <span style={{ color: 'var(--mu)', fontSize: '.65rem' }}>{ps.duration_ms} ms</span>}
          </div>
          {ps.error_message && (
            <div style={{ marginTop: 4, fontSize: '.65rem', color: '#ff8585', whiteSpace: 'pre-wrap' }}>{ps.error_message}</div>
          )}
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: '.65rem', color: 'var(--gold)' }}>Input / output</summary>
            <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
              <div>
                <div style={{ fontSize: '.58rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--mu)', marginBottom: 2 }}>Input</div>
                <pre
                  style={{
                    margin: 0,
                    padding: '.4rem .5rem',
                    background: '#0d1117',
                    borderRadius: 4,
                    fontSize: '.58rem',
                    overflow: 'auto',
                    maxHeight: 160,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {safeJsonStringify(ps.input)}
                </pre>
              </div>
              <div>
                <div style={{ fontSize: '.58rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--mu)', marginBottom: 2 }}>Output</div>
                <pre
                  style={{
                    margin: 0,
                    padding: '.4rem .5rem',
                    background: '#0d1117',
                    borderRadius: 4,
                    fontSize: '.58rem',
                    overflow: 'auto',
                    maxHeight: 160,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {safeJsonStringify(ps.output)}
                </pre>
              </div>
            </div>
          </details>
        </div>
      ))}
    </div>
  )
}

/**
 * Pannello Test Mode: elenco scenari, Run, modale upload se necessario, progress step, log, PASS/FAIL.
 */
export function TestScenarioE2EPanel({ societaId }) {
  const [scenarios, setScenarios] = useState([])
  const [loadErr, setLoadErr] = useState(null)
  const [modal, setModal] = useState(null)
  const [file, setFile] = useState(null)
  /** File XML multipli per scenari batch_upload_pipeline */
  const [batchFiles, setBatchFiles] = useState([])
  const [runningScenarioId, setRunningScenarioId] = useState(null)
  const [logs, setLogs] = useState([])
  const [report, setReport] = useState(null)
  /** Step completati nella UI (0 … n) dopo risposta server */
  const [revealIdx, setRevealIdx] = useState(0)
  const [fetching, setFetching] = useState(false)
  /** Se l’API non include gli step, carichiamo pipeline_runs + pipeline_steps dal client */
  const [pipelineTraceHydrated, setPipelineTraceHydrated] = useState(null)
  const logRef = useRef(null)

  const loadScenarios = useCallback(() => {
    setLoadErr(null)
    sb.from('test_scenarios')
      .select('id,nome,descrizione,steps,expected_results,attivo,created_at,critical_tags,kind')
      .eq('attivo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) {
          setLoadErr(error.message || String(error))
          setScenarios([])
          return
        }
        setScenarios(Array.isArray(data) ? data : [])
      })
  }, [])

  useEffect(() => {
    loadScenarios()
  }, [loadScenarios])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    const runId = report?.pipeline_run_id
    const apiSteps = report?.pipeline_trace?.steps
    const hasApiSteps = Array.isArray(apiSteps) && apiSteps.length > 0
    if (!runId) {
      setPipelineTraceHydrated(null)
      return
    }
    if (hasApiSteps) {
      setPipelineTraceHydrated(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: run, error: e1 } = await sb.from('pipeline_runs').select('*').eq('id', runId).maybeSingle()
      if (cancelled || e1 || !run) return
      const { data: steps, error: e2 } = await sb
        .from('pipeline_steps')
        .select('*')
        .eq('pipeline_run_id', runId)
        .order('started_at', { ascending: true })
      if (cancelled || e2) return
      setPipelineTraceHydrated({ run, steps: Array.isArray(steps) ? steps : [] })
    })()
    return () => {
      cancelled = true
    }
  }, [report?.pipeline_run_id, report?.pipeline_trace])

  const pushLog = useCallback((msg, status = 'info') => {
    setLogs((prev) => [...prev, { ts: new Date().toISOString(), msg, status }])
  }, [])

  const openRun = (scenario) => {
    setModal(scenario)
    setFile(null)
    setBatchFiles([])
    setLogs([])
    setReport(null)
    setRevealIdx(0)
    setFetching(false)
    setPipelineTraceHydrated(null)
  }

  const closeModal = () => {
    if (runningScenarioId) return
    setModal(null)
    setFile(null)
    setBatchFiles([])
    setReport(null)
    setLogs([])
    setRevealIdx(0)
    setPipelineTraceHydrated(null)
  }

  const runScenario = async () => {
    if (!modal || !societaId) return
    const scenario = modal
    const needsBatch = scenarioNeedsBatchFiles(scenario.steps)
    const needsSingle = !needsBatch && scenarioNeedsClientFile(scenario.steps)
    const batchMin = getBatchMinDocuments(scenario.expected_results)

    if (needsBatch) {
      if (batchFiles.length < batchMin) {
        alert(`Seleziona almeno ${batchMin} file XML (questo scenario simula più import consecutivi).`)
        return
      }
    } else if (needsSingle && !file) {
      alert('Carica il file XML richiesto da questo scenario.')
      return
    }

    setRunningScenarioId(scenario.id)
    setLogs([])
    setReport(null)
    setRevealIdx(0)
    setFetching(true)
    pushLog(`Connessione al server per «${scenario.nome}»…`)

    let xmlText = ''
    let filename = 'fattura.xml'
    let xmlBatch = undefined

    if (needsBatch) {
      pushLog(`Lettura ${batchFiles.length} file XML…`)
      try {
        xmlBatch = []
        for (const f of batchFiles) {
          const t = await f.text()
          xmlBatch.push({ xmlText: t, filename: f.name })
          pushLog(`  · ${f.name} (${t.length} caratteri)`, 'info')
        }
      } catch (e) {
        pushLog(`Errore lettura file: ${e.message}`, 'error')
        setFetching(false)
        setRunningScenarioId(null)
        return
      }
    } else if (needsSingle && file) {
      pushLog(`Lettura file: ${file.name}`)
      try {
        xmlText = await file.text()
        filename = file.name
      } catch (e) {
        pushLog(`Errore lettura file: ${e.message}`, 'error')
        setFetching(false)
        setRunningScenarioId(null)
        return
      }
    }

    let j
    try {
      const body = {
        scenarioId: scenario.id,
        societaId,
        xmlText,
        filename,
      }
      if (xmlBatch) body.xmlBatch = xmlBatch

      const res = await fetch('/api/test-scenario/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const rawText = await res.text()
      try {
        j = rawText ? JSON.parse(rawText) : {}
      } catch {
        j = { error: rawText?.slice(0, 400) || 'Risposta non JSON dal server' }
      }
      if (!res.ok) {
        pushLog(`HTTP ${res.status}: ${j.error || res.statusText}`, 'error')
        if (j.hint) pushLog(String(j.hint), 'error')
        setReport({ ...j, pass: false, failures: j.failures || [] })
        setFetching(false)
        setRunningScenarioId(null)
        return
      }
    } catch (e) {
      pushLog(`Errore rete: ${e.message}`, 'error')
      setFetching(false)
      setRunningScenarioId(null)
      return
    }

    setFetching(false)
    const serverSteps = Array.isArray(j.steps) ? j.steps : []
    setReport(j)

    if (serverSteps.length === 0) {
      pushLog(
        '⚠️ Risposta senza step (array vuoto): l’avanzamento sopra non può mostrare ok/error per ogni fase. Verifica `test_scenarios.steps` nel DB e che `dev:api` usi l’ultimo `testScenarioEngine`.',
        'info'
      )
    }

    for (let i = 0; i < serverSteps.length; i++) {
      const s = serverSteps[i]
      setRevealIdx(i)
      pushLog(
        `[${i + 1}/${serverSteps.length}] ${humanizeStepAction(s)} — ${s.status}${s.error ? `: ${s.error}` : ''}${s.duration_ms != null ? ` (${s.duration_ms}ms)` : ''}`,
        s.status === 'error' ? 'error' : 'success'
      )
      if (String(s.action || '').toLowerCase() === 'run_pipeline' && s.pipeline_run_id) {
        pushLog(`  → pipeline_run_id ${s.pipeline_run_id}`, 'info')
      }
      if (String(s.action || '').toLowerCase() === 'batch_upload_pipeline' && Array.isArray(s.sub_steps)) {
        s.sub_steps.forEach((ss) => {
          pushLog(
            `    · fattura ${(ss.index ?? 0) + 1}: ${ss.status}${ss.pipeline_error ? ` — ${ss.pipeline_error}` : ''}`,
            ss.status === 'error' ? 'error' : 'success'
          )
        })
      }
      await new Promise((r) => setTimeout(r, 130))
    }
    setRevealIdx(serverSteps.length)

    if (j.pass) {
      pushLog('✅ Esito finale: PASS', 'success')
    } else {
      pushLog(`❌ Esito finale: FAIL (${(j.failures || []).length} controllo/i)`, 'error')
      ;(j.failures || []).forEach((f) => pushLog(`  · ${f.path}: ${f.message}`, 'error'))
    }

    setRunningScenarioId(null)
  }

  const needsBatchModal = modal && scenarioNeedsBatchFiles(modal.steps)
  const needsFileModal = modal && scenarioNeedsClientFile(modal.steps)
  const batchMin = modal ? getBatchMinDocuments(modal.expected_results) : 3
  const plannedSteps = modal ? parseScenarioSteps(modal.steps) : []
  const displaySteps = report?.steps?.length ? report.steps : plannedSteps

  const effectivePipelineTrace =
    Array.isArray(report?.pipeline_trace?.steps) && report.pipeline_trace.steps.length > 0
      ? report.pipeline_trace
      : pipelineTraceHydrated

  const rowMode = (i) => {
    if (fetching) return i === 0 ? 'active' : 'pending'
    if (!report) return 'pending'
    // Se il server non restituisce `steps`, prima era tutto "In attesa…" anche dopo PASS
    if (!Array.isArray(report.steps) || report.steps.length === 0) return 'done'
    if (i < revealIdx) return 'done'
    if (i === revealIdx && runningScenarioId) return 'active'
    if (i >= revealIdx) return 'pending'
    return 'done'
  }

  return (
    <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.25rem', border: '1px solid rgba(52,194,122,.35)', background: 'rgba(52,194,122,.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.65rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--gold)' }}>🧭 Test Mode — Scenari E2E</div>
          <div style={{ fontSize: '.72rem', color: 'var(--mu)', lineHeight: 1.45, maxWidth: 720, marginTop: '.25rem' }}>
            Scenari da <code style={{ fontSize: '.65rem' }}>test_scenarios</code>: ogni riga ha <strong>Run</strong>. Se uno step richiede file, viene chiesto nel modale prima dell&apos;esecuzione. Serve{' '}
            <code style={{ fontSize: '.65rem' }}>npm run dev:api</code>.
          </div>
        </div>
        <button type="button" className="btn-sec" style={{ fontSize: '.72rem' }} onClick={() => loadScenarios()}>
          Ricarica elenco
        </button>
      </div>

      {loadErr && (
        <div style={{ fontSize: '.74rem', color: '#ff8585', marginBottom: '.5rem', padding: '.5rem', borderRadius: 8, background: 'rgba(183,28,28,.12)' }}>
          Impossibile leggere scenari: {loadErr}
          <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: 4 }}>Applica la migration Supabase per <code>test_scenarios</code>.</div>
        </div>
      )}

      {!loadErr && scenarios.length === 0 && (
        <div className="empty" style={{ padding: '1rem' }}>
          <div className="empty-t" style={{ fontSize: '.82rem' }}>
            Nessuno scenario attivo. Inserisci righe in <code>test_scenarios</code> o applica la migration (scenario predefinito id {DEFAULT_TEST_SCENARIO_FATTURA_PASSIVA_ID.slice(0, 8)}…).
          </div>
        </div>
      )}

      {scenarios.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {scenarios.map((sc) => {
            const needFile = scenarioNeedsClientFile(sc.steps)
            const nSteps = parseScenarioSteps(sc.steps).length
            const rowBusy = runningScenarioId === sc.id
            return (
              <div
                key={sc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '.75rem',
                  flexWrap: 'wrap',
                  padding: '.55rem .65rem',
                  borderRadius: 9,
                  border: '1px solid var(--bd)',
                  background: 'var(--s1)',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: '.82rem' }}>{sc.nome}</div>
                  {sc.descrizione && (
                    <div style={{ fontSize: '.7rem', color: 'var(--mu)', marginTop: 2, lineHeight: 1.35 }}>{sc.descrizione}</div>
                  )}
                  <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginTop: 4 }}>
                    {nSteps} step
                    {sc.kind === 'intelligent' && (
                      <span style={{ marginLeft: '.5rem', color: '#a78bfa' }} title="Scenario intelligente (AI / insight / pipeline)">
                        🧠 L5
                      </span>
                    )}
                    {Array.isArray(sc.critical_tags) &&
                      sc.critical_tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            marginLeft: '.35rem',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: '.58rem',
                            fontWeight: 700,
                            background:
                              tag === 'pipeline'
                                ? 'rgba(52,194,122,.2)'
                                : tag === 'iva'
                                  ? 'rgba(78,142,247,.2)'
                                  : tag === 'ai_learning'
                                    ? 'rgba(200,164,94,.25)'
                                    : 'var(--s2)',
                            color: 'var(--tx)',
                          }}
                          title="Test critico"
                        >
                          {tag}
                        </span>
                      ))}
                    {scenarioNeedsBatchFiles(sc.steps) && (
                      <span style={{ marginLeft: '.5rem', color: '#fb923c' }} title="Richiede più file XML">
                        📎 Batch
                      </span>
                    )}
                    {needFile && !scenarioNeedsBatchFiles(sc.steps) && (
                      <span style={{ marginLeft: '.5rem', color: '#fb923c' }} title="Richiede upload file">
                        📎 XML
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={!societaId || !!runningScenarioId}
                  style={{ fontSize: '.78rem', flexShrink: 0, opacity: rowBusy ? 1 : 1 }}
                  onClick={() => openRun(sc)}
                >
                  {rowBusy ? '⏳ …' : '▶ Run'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !runningScenarioId && closeModal()}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: 'min(96vw, 640px)' }}>
            <div className="modal-hdr">
              <div className="modal-drag" />
              <div>
                <div className="modal-title">Scenario: {modal.nome}</div>
                <div className="modal-sub">{modal.descrizione || '—'}</div>
              </div>
              <button className="modal-close" type="button" onClick={closeModal} disabled={!!runningScenarioId}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              {needsBatchModal && (
                <div
                  style={{
                    background: 'rgba(251,146,60,.1)',
                    border: '1px solid rgba(251,146,60,.45)',
                    borderRadius: 8,
                    padding: '.75rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#fb923c', marginBottom: '.35rem', fontSize: '.82rem' }}>📎 Fatture multiple</div>
                  <div style={{ fontSize: '.76rem', color: 'var(--mu)', marginBottom: '.5rem' }}>
                    Seleziona almeno <strong>{batchMin}</strong> file XML (stesso file ripetuto o fatture distinte). Ogni file viene importato e sottoposto alla{' '}
                    <strong>pipeline completa</strong>, come in produzione.
                  </div>
                  <label style={{ cursor: runningScenarioId ? 'default' : 'pointer' }}>
                    <input
                      type="file"
                      multiple
                      accept=".xml,application/xml,text/xml"
                      disabled={!!runningScenarioId}
                      style={{ display: 'none' }}
                      onChange={(e) => setBatchFiles(Array.from(e.target.files || []))}
                    />
                    <span className="btn-sec" style={{ fontSize: '.78rem' }}>
                      Scegli file XML (multipli)
                    </span>
                  </label>
                  {batchFiles.length > 0 && (
                    <div style={{ marginTop: '.5rem', fontSize: '.72rem', color: '#34c27a' }}>
                      ✓ {batchFiles.length} file selezionati
                      {batchFiles.length < batchMin && (
                        <span style={{ color: '#fb923c', marginLeft: 8 }}>(servono almeno {batchMin})</span>
                      )}
                    </div>
                  )}
                </div>
              )}
              {needsFileModal && !needsBatchModal && (
                <div
                  style={{
                    background: 'rgba(251,146,60,.1)',
                    border: '1px solid rgba(251,146,60,.45)',
                    borderRadius: 8,
                    padding: '.75rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#fb923c', marginBottom: '.35rem', fontSize: '.82rem' }}>📎 File richiesto</div>
                  <div style={{ fontSize: '.76rem', color: 'var(--mu)', marginBottom: '.5rem' }}>
                    Questo scenario include lo step <code>upload_xml</code>. Carica una fattura elettronica (XML).
                  </div>
                  <label style={{ cursor: runningScenarioId ? 'default' : 'pointer' }}>
                    <input
                      type="file"
                      accept=".xml,application/xml,text/xml"
                      disabled={!!runningScenarioId}
                      style={{ display: 'none' }}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <span className="btn-sec" style={{ fontSize: '.78rem' }}>
                      Scegli file XML
                    </span>
                  </label>
                  {file && <span style={{ marginLeft: '.5rem', fontSize: '.74rem', color: '#34c27a' }}>✓ {file.name}</span>}
                </div>
              )}

              <PipelinePhasesStrip trace={effectivePipelineTrace} fetching={fetching && !report?.pipeline_trace} />

              <div style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--mu)', marginBottom: '.35rem' }}>
                Avanzamento step scenario
              </div>
              <div style={{ marginBottom: '.75rem', maxHeight: 220, overflowY: 'auto' }}>
                {fetching && (
                  <div style={{ fontSize: '.74rem', color: 'var(--gold)', marginBottom: '.5rem' }}>
                    ⏳ Esecuzione sul server in corso…
                  </div>
                )}
                {displaySteps.map((st, i) => {
                  const merged = report?.steps?.[i] ? report.steps[i] : st
                  const mode = rowMode(i)
                  return <StepLine key={i} index={i} step={merged} mode={mode} />
                })}
              </div>

              <div style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--mu)', marginBottom: '.35rem' }}>
                Log
              </div>
              <div
                ref={logRef}
                style={{
                  background: '#0d1117',
                  border: '1px solid var(--bd)',
                  borderRadius: 7,
                  padding: '.55rem .75rem',
                  minHeight: 100,
                  maxHeight: 200,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '.68rem',
                }}
              >
                {logs.length === 0 && <span style={{ color: 'var(--mu)' }}>Premi &quot;Esegui test&quot; per avviare.</span>}
                {logs.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      color: e.status === 'error' ? '#ff8585' : e.status === 'success' ? '#4dde96' : '#8892a4',
                      marginBottom: '.1rem',
                    }}
                  >
                    <span style={{ opacity: 0.45, marginRight: '.4rem' }}>{new Date(e.ts).toLocaleTimeString('it-IT')}</span>
                    {e.msg}
                  </div>
                ))}
              </div>

              {report && (
                <div style={{ marginTop: '1rem' }}>
                  <div
                    style={{
                      padding: '.65rem .85rem',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: '.9rem',
                      textAlign: 'center',
                      background: report.pass ? 'rgba(52,194,122,.15)' : 'rgba(224,82,82,.15)',
                      color: report.pass ? '#34c27a' : '#e05252',
                      border: `1px solid ${report.pass ? 'rgba(52,194,122,.4)' : 'rgba(224,82,82,.4)'}`,
                    }}
                  >
                    {report.pass ? '✅ PASS' : '❌ FAIL'}
                  </div>

                  {Array.isArray(report.warnings) && report.warnings.length > 0 && (
                    <div
                      style={{
                        marginTop: '.5rem',
                        padding: '.5rem .65rem',
                        borderRadius: 8,
                        fontSize: '.68rem',
                        color: 'var(--cy)',
                        background: 'rgba(200, 164, 94, 0.12)',
                        border: '1px solid rgba(200, 164, 94, 0.35)',
                      }}
                    >
                      <strong>Avviso</strong>
                      {report.warnings.map((w, i) => (
                        <div key={i} style={{ marginTop: i ? 6 : 4 }}>
                          {w}
                        </div>
                      ))}
                    </div>
                  )}

                  <PipelineTraceSection trace={effectivePipelineTrace} pipelineRunId={report.pipeline_run_id} />

                  <details style={{ marginTop: '.65rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '.78rem', color: 'var(--gold)' }}>Dettaglio breakdown</summary>
                    <div style={{ marginTop: '.5rem', fontSize: '.68rem', color: 'var(--mu)', lineHeight: 1.5 }}>
                      <div>
                        <strong>Controlli su expected_results</strong>:{' '}
                        {(report.failures || []).length === 0 ? 'nessun errore' : `${report.failures.length} mismatch`}
                      </div>
                      {report.captured?.summary && (
                        <div style={{ marginTop: '.35rem' }}>
                          Documento: {report.captured.summary.document_id?.slice?.(0, 12) || '—'} · Scritture: {report.captured.summary.accounting_entries_count} ·
                          Partitari: {report.captured.summary.partitari_count} · Registri IVA: {report.captured.summary.registri_iva_count}
                        </div>
                      )}
                      {Array.isArray(report.document_ids) && report.document_ids.length > 0 && (
                        <div style={{ marginTop: '.35rem', fontSize: '.62rem' }}>
                          <strong>Documenti processati</strong> ({report.document_ids.length}):{' '}
                          {report.document_ids.map((id) => id?.slice?.(0, 8)).join(', ')}…
                        </div>
                      )}
                      {report.captured?.ai_validation?.primary_entry && (
                        <div style={{ marginTop: '.4rem', fontSize: '.65rem' }}>
                          <strong>AI entry</strong>: confidence {report.captured.ai_validation.primary_entry.ai_confidence ?? '—'} · source{' '}
                          {report.captured.ai_validation.primary_entry.ai_source ?? '—'} · explanation{' '}
                          {(report.captured.ai_validation.primary_entry.ai_explanation || '').slice(0, 120) || '—'}
                        </div>
                      )}
                      {report.captured?.insights && (
                        <div style={{ marginTop: '.35rem', fontSize: '.65rem' }}>
                          <strong>Insight (documento)</strong>: {report.captured.insights.rows_for_document_count ?? 0} · tipi{' '}
                          {report.captured.insights.counts_by_tipo
                            ? Object.entries(report.captured.insights.counts_by_tipo)
                                .map(([k, v]) => `${k}:${v}`)
                                .join(', ') || '—'
                            : '—'}
                        </div>
                      )}
                    </div>
                    {(report.failures || []).length > 0 && (
                      <ul style={{ margin: '.5rem 0 0 1rem', fontSize: '.7rem', color: '#ff8585' }}>
                        {(report.failures || []).map((f, i) => (
                          <li key={i}>
                            <code>{f.path}</code>: {f.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    <details style={{ marginTop: '.5rem' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '.72rem' }}>JSON completo (debug)</summary>
                      <pre
                        style={{
                          marginTop: '.35rem',
                          padding: '.5rem',
                          background: 'var(--s2)',
                          borderRadius: 6,
                          fontSize: '.58rem',
                          overflow: 'auto',
                          maxHeight: 240,
                        }}
                      >
                        {JSON.stringify(report, null, 2)}
                      </pre>
                    </details>
                  </details>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-sec" onClick={closeModal} disabled={!!runningScenarioId}>
                Chiudi
              </button>
              <button
                type="button"
                className="btn"
                disabled={
                  !!runningScenarioId ||
                  !societaId ||
                  (needsBatchModal && batchFiles.length < batchMin) ||
                  (needsFileModal && !needsBatchModal && !file)
                }
                onClick={() => void runScenario()}
              >
                {runningScenarioId ? '⏳ Esecuzione…' : '▶ Esegui test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
