import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react'
import { sb } from '../lib/supabase'

// ─── AI STATUS CONTEXT ──────────────────────────────────────────
const DURATIONS_KEY = 'fiscosim_ai_pipeline_durations'

export const AIStatusContext = createContext({
  status: 'idle',
  lastOp: null,
  method: null,
  ts: null,
  trackingDocumentId: null,
  setAI: () => {},
})

export function getAvgPipelineMs() {
  try {
    const arr = JSON.parse(localStorage.getItem(DURATIONS_KEY) || '[]')
    if (!Array.isArray(arr) || !arr.length) return 12000
    const valid = arr.filter((n) => typeof n === 'number' && n > 300 && n < 600000)
    if (!valid.length) return 12000
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
  } catch {
    return 12000
  }
}

function pushPipelineDuration(durationMs) {
  if (durationMs < 500 || durationMs > 600000) return
  try {
    const arr = JSON.parse(localStorage.getItem(DURATIONS_KEY) || '[]')
    if (!Array.isArray(arr)) return
    arr.push(durationMs)
    while (arr.length > 5) arr.shift()
    localStorage.setItem(DURATIONS_KEY, JSON.stringify(arr))
  } catch {
    /* ignore */
  }
}

/**
 * Mappa ai_logs → progresso (max sul batch di righe).
 * START PIPELINE 10% · fase parsing 40% · orchestrazione 70% · accounting 90% · END 100%
 */
export function progressFromAiLogs(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0
  let p = 0
  for (const r of rows) {
    const msg = String(r.message ?? '')
    const step = String(r.step ?? '')
    if (msg.includes('END PIPELINE')) p = Math.max(p, 100)
    else if (step === 'runAccounting' || msg.includes('runAccounting')) p = Math.max(p, 90)
    else if (step === 'orchestrate' || /ORCH_|orchestrate/i.test(msg)) p = Math.max(p, 70)
    else if (step === 'runParsing' || msg.includes('runParsing') || /PARSING_/i.test(msg)) p = Math.max(p, 40)
    else if (msg.includes('START PIPELINE')) p = Math.max(p, 10)
  }
  return p
}

function etaSecondsFromProgress(progress, avgMs) {
  const pct = Math.min(100, Math.max(0, progress))
  const rem = avgMs * ((100 - pct) / 100)
  return Math.max(1, Math.round(rem / 1000))
}

export function AIStatusProvider({ children }) {
  const [state, setState] = useState({
    status: 'idle',
    lastOp: null,
    method: null,
    ts: null,
    trackingDocumentId: null,
  })

  const setAI = useCallback((status, op, method, extras) => {
    const ex = extras && typeof extras === 'object' ? extras : {}
    const documentId = ex.documentId != null ? String(ex.documentId) : null

    setState((s) => {
      let trackingDocumentId = s.trackingDocumentId

      if (status === 'processing') {
        if (documentId) {
          trackingDocumentId = documentId
        } else {
          trackingDocumentId = null
        }
      }

      if (status === 'idle' || status === 'done' || status === 'error') {
        trackingDocumentId = null
      }

      return {
        ...s,
        status,
        lastOp: op ?? null,
        method: method ?? null,
        ts: Date.now(),
        trackingDocumentId,
      }
    })
  }, [])

  useEffect(() => {
    const onPipe = (e) => {
      const d = e?.detail
      if (!d?.documentId) return
      const id = String(d.documentId)
      if (d.phase === 'start') {
        setState((s) => ({
          ...s,
          status: 'processing',
          lastOp: 'Pipeline',
          method: 'ai',
          ts: Date.now(),
          trackingDocumentId: id,
        }))
      }
      if (d.phase === 'end') {
        if (d.ok) pushPipelineDuration(d.durationMs)
        setState((s) => {
          if (s.trackingDocumentId !== id) return s
          return {
            ...s,
            trackingDocumentId: null,
            status: d.ok ? 'done' : 'error',
            lastOp: d.ok ? 'Completato' : 'Errore AI',
            method: 'ai',
            ts: Date.now(),
          }
        })
      }
    }
    window.addEventListener('fiscosim:ai-pipeline', onPipe)
    return () => window.removeEventListener('fiscosim:ai-pipeline', onPipe)
  }, [])

  useEffect(() => {
    if (state.status === 'done') {
      const t = setTimeout(
        () => setState((s) => (s.status === 'done' ? { ...s, status: 'idle', lastOp: null } : s)),
        8000
      )
      return () => clearTimeout(t)
    }
    if (state.status === 'error') {
      const t = setTimeout(
        () => setState((s) => (s.status === 'error' ? { ...s, status: 'idle', lastOp: null } : s)),
        10000
      )
      return () => clearTimeout(t)
    }
  }, [state.status, state.ts])

  return (
    <AIStatusContext.Provider value={{ ...state, setAI }}>
      {children}
    </AIStatusContext.Provider>
  )
}

export function useAIStatus() {
  return useContext(AIStatusContext)
}

// ─── AI BADGE ────────────────────────────────────────────────────
export function AIBadge() {
  const ctx = useAIStatus()
  const { status, trackingDocumentId, ts } = ctx

  const [logProgress, setLogProgress] = useState(0)
  const [fallbackProgress, setFallbackProgress] = useState(10)
  const avgMsRef = useRef(getAvgPipelineMs())

  const processing = status === 'processing'
  const docId = trackingDocumentId

  useEffect(() => {
    if (processing) avgMsRef.current = getAvgPipelineMs()
  }, [processing])

  useEffect(() => {
    if (!processing || !docId) {
      setLogProgress(0)
      return
    }
    let cancelled = false
    const load = async () => {
      const { data, error } = await sb
        .from('ai_logs')
        .select('step,message')
        .eq('document_id', docId)
        .order('created_at', { ascending: true })
        .limit(800)
      if (cancelled || error) return
      setLogProgress(progressFromAiLogs(data || []))
    }
    load()
    const iv = setInterval(load, 550)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [processing, docId])

  useEffect(() => {
    if (!processing || docId) return
    const t0 = ts || Date.now()
    const tick = () => {
      const elapsed = Date.now() - t0
      const avg = avgMsRef.current || 12000
      const est = Math.min(88, 10 + (elapsed / avg) * 78)
      setFallbackProgress(Math.round(est))
    }
    tick()
    const iv = setInterval(tick, 400)
    return () => clearInterval(iv)
  }, [processing, docId, ts])

  const progressPct = processing ? (docId ? logProgress : fallbackProgress) : 0
  const etaSec = processing ? etaSecondsFromProgress(progressPct, avgMsRef.current) : 0

  const CFG_MAP = {
    idle: { ico: '⚪', label: 'AI standby', color: 'rgba(107,122,153,.5)', op: 0.6, pulse: false, showBar: false },
    done: {
      ico: '🟢',
      label: 'Completato',
      color: 'rgba(52,194,122,.85)',
      op: 1,
      pulse: false,
      showBar: false,
    },
    error: {
      ico: '🔴',
      label: 'Errore AI',
      color: 'rgba(224,82,82,.9)',
      op: 1,
      pulse: false,
      showBar: false,
    },
  }
  const cfg =
    status === 'processing'
      ? {
          ico: '🟡',
          label: `${Math.min(100, Math.max(0, progressPct))}% — ~${etaSec}s`,
          color: 'rgba(200,164,94,.85)',
          op: 1,
          pulse: true,
          showBar: true,
        }
      : CFG_MAP[status] || CFG_MAP.idle

  const barWidth = Math.min(100, Math.max(0, status === 'processing' ? progressPct : 0))

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 18,
        right: 18,
        zIndex: 9999,
        background: 'var(--s1)',
        border: '1px solid var(--bd)',
        borderRadius: 20,
        padding: '.35rem .85rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 0,
        fontSize: '.72rem',
        color: cfg.color,
        opacity: cfg.op,
        transition: 'opacity .4s',
        animation: cfg.pulse ? 'aiBadgePulse 1.4s infinite' : 'none',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 2px 12px rgba(0,0,0,.25)',
        minWidth: 140,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
        <span>{cfg.ico}</span>
        <span style={{ color: 'var(--tx)', opacity: 0.8 }}>{cfg.label}</span>
      </div>
      {cfg.showBar && (
        <div
          style={{
            marginTop: 6,
            height: 3,
            borderRadius: 2,
            background: 'var(--bd)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${barWidth}%`,
              height: '100%',
              background: cfg.color,
              borderRadius: 2,
              transition: 'width .45s ease-out',
            }}
          />
        </div>
      )}
    </div>
  )
}
