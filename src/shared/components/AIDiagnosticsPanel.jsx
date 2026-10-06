import { useEffect, useMemo, useState } from 'react'

const STATE_META = {
  not_configured: { tone: 'neutral', dot: 'var(--mu)', label: 'Non configurata' },
  configured_stopped: { tone: 'warn', dot: 'var(--gold)', label: 'Configurata ma ferma' },
  starting: { tone: 'warn', dot: 'var(--gold)', label: 'In avvio' },
  active_responding: { tone: 'success', dot: 'var(--gr)', label: 'Attiva e funzionante' },
  active_not_responding: { tone: 'error', dot: 'var(--rd)', label: 'Attiva ma non risponde' },
  timeout_error: { tone: 'error', dot: 'var(--rd)', label: 'Timeout / errore' },
  degraded_slow: { tone: 'warn', dot: 'var(--gold)', label: 'Attiva ma lenta' },
}

function toneColors(tone) {
  if (tone === 'success') {
    return {
      bg: 'rgba(52,194,122,.08)',
      border: 'rgba(52,194,122,.22)',
      text: 'var(--tx)',
      chip: 'rgba(52,194,122,.18)',
    }
  }
  if (tone === 'error') {
    return {
      bg: 'rgba(224,82,82,.08)',
      border: 'rgba(224,82,82,.22)',
      text: 'var(--tx)',
      chip: 'rgba(224,82,82,.18)',
    }
  }
  if (tone === 'warn') {
    return {
      bg: 'rgba(212,175,55,.08)',
      border: 'rgba(212,175,55,.24)',
      text: 'var(--tx)',
      chip: 'rgba(212,175,55,.18)',
    }
  }
  return {
    bg: 'rgba(107,122,153,.08)',
    border: 'rgba(107,122,153,.20)',
    text: 'var(--tx)',
    chip: 'rgba(107,122,153,.18)',
  }
}

function fmtMs(value) {
  if (!Number.isFinite(value)) return 'n/d'
  return `${Math.max(0, Math.round(value))} ms`
}

function BrainIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10 4.5c-2.4 0-4.5 1.9-4.5 4.3 0 1 .3 1.9.9 2.7-.8.7-1.4 1.8-1.4 3 0 2.1 1.6 3.9 3.7 4.2.4 1.5 1.8 2.6 3.4 2.6.9 0 1.8-.3 2.5-.9.7.6 1.6.9 2.5.9 1.6 0 3-1.1 3.4-2.6 2.1-.3 3.7-2.1 3.7-4.2 0-1.2-.6-2.3-1.4-3 .6-.8.9-1.7.9-2.7 0-2.4-2.1-4.3-4.5-4.3-.8 0-1.6.2-2.3.6-.7-.4-1.5-.6-2.3-.6-.8 0-1.6.2-2.3.6-.7-.4-1.5-.6-2.3-.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.3 9.2h.02M15.7 9.2h.02M7.8 14.1c1.1.9 2.4 1.4 4.2 1.4s3.1-.5 4.2-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EngineCard({ title, engine, onTest, onStart, testLabel, startLabel, disabledStart = false, loading = false }) {
  const meta = STATE_META[engine?.state] || STATE_META.not_configured
  const colors = toneColors(meta.tone)

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        padding: '.7rem .8rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', minWidth: 0 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: meta.dot,
              boxShadow: `0 0 0 3px ${colors.chip}`,
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: '.82rem', fontWeight: 700, color: colors.text }}>
            {title}
          </div>
        </div>
        <div style={{ fontSize: '.66rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {meta.label}
        </div>
      </div>

      <div style={{ marginTop: '.45rem', fontSize: '.78rem', lineHeight: 1.45, color: 'var(--tx)' }}>
        {engine?.message || 'Nessun dettaglio disponibile.'}
      </div>

      <div style={{ marginTop: '.3rem', fontSize: '.7rem', color: 'var(--mu)' }}>
        <div><strong style={{ color: 'var(--tx)' }}>Motivo:</strong> {engine?.reason || 'n/d'}</div>
        <div><strong style={{ color: 'var(--tx)' }}>Prossimo passo:</strong> {engine?.nextAction || 'n/d'}</div>
        {Number.isFinite(engine?.responseTimeMs) && (
          <div><strong style={{ color: 'var(--tx)' }}>Tempo:</strong> {fmtMs(engine.responseTimeMs)}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem' }}>
        <button type="button" className="btn-sec" onClick={onTest} disabled={loading}>
          {loading ? 'Verifica...' : testLabel}
        </button>
        {onStart && (
          <button type="button" className="btn-sec" onClick={onStart} disabled={loading || disabledStart}>
            {startLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function EngineCompactCard({ title, engine, onTest, onStart, testLabel, startLabel, disabledStart = false, loading = false }) {
  const meta = STATE_META[engine?.state] || STATE_META.not_configured
  const colors = toneColors(meta.tone)

  return (
    <div className="sb-engine-card" style={{ background: colors.bg, borderColor: colors.border }}>
      <div className="sb-engine-card-top">
        <div className="sb-engine-card-title">
          <span className="sb-engine-card-dot" style={{ background: meta.dot, boxShadow: `0 0 0 3px ${colors.chip}` }} />
          <strong>{title}</strong>
        </div>
        <span className="sb-engine-card-state">{meta.label}</span>
      </div>

      <div className="sb-engine-card-message">{engine?.message || 'Nessun dettaglio disponibile.'}</div>
      <div className="sb-engine-card-meta">
        <div><strong>Motivo:</strong> {engine?.reason || 'n/d'}</div>
        <div><strong>Prossimo passo:</strong> {engine?.nextAction || 'n/d'}</div>
        {Number.isFinite(engine?.responseTimeMs) && <div><strong>Tempo:</strong> {fmtMs(engine.responseTimeMs)}</div>}
      </div>
      <div className="sb-engine-card-actions">
        <button type="button" className="btn-sec" onClick={onTest} disabled={loading}>
          {loading ? 'Verifica...' : testLabel}
        </button>
        {onStart && (
          <button type="button" className="btn-sec" onClick={onStart} disabled={loading || disabledStart}>
            {startLabel}
          </button>
        )}
      </div>
    </div>
  )
}

async function postAiDiagnostics(payload) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }
  return data
}

export function AIDiagnosticsPanel({ mode = 'floating' }) {
  const [open, setOpen] = useState(true)
  const [diagnostics, setDiagnostics] = useState(null)
  const [loading, setLoading] = useState({ all: false, local: false, online: false, startLocal: false })
  const [error, setError] = useState(null)

  const loadDiagnostics = async (scope = 'all') => {
    setError(null)
    setLoading((s) => ({ ...s, [scope]: true }))
    try {
      const data = await postAiDiagnostics({ action: 'diagnostics', scope })
      setDiagnostics(data)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading((s) => ({ ...s, [scope]: false }))
    }
  }

  const startLocal = async () => {
    setError(null)
    setLoading((s) => ({ ...s, startLocal: true }))
    try {
      await postAiDiagnostics({ action: 'start_local' })
      await loadDiagnostics('local')
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading((s) => ({ ...s, startLocal: false }))
    }
  }

  useEffect(() => {
    void loadDiagnostics('all')
  }, [])

  const local = diagnostics?.local || null
  const online = diagnostics?.online || null

  const overall = useMemo(() => {
    const engines = [local, online].filter(Boolean)
    if (!engines.length) return { label: 'Verifica AI', tone: 'neutral' }
    if (engines.every((e) => e.state === 'active_responding' || e.state === 'degraded_slow')) {
      return { label: 'AI operativa', tone: 'success' }
    }
    if (engines.some((e) => e.state === 'active_responding' || e.state === 'degraded_slow')) {
      return { label: 'AI parziale', tone: 'warn' }
    }
    return { label: 'AI non disponibile', tone: 'error' }
  }, [local, online])

  const overallColors = toneColors(overall.tone)

  if (mode === 'sidebar') {
    return (
      <div className="sb-footer-entry sb-engine-entry">
        <button
          type="button"
          className={'sb-item sb-footer-item sb-engine-toggle' + (open ? ' active' : '')}
          onClick={() => setOpen((v) => !v)}
          title="Engine status"
        >
          <span className="sb-item-ico sb-engine-ico"><BrainIcon className="shell-icon" /></span>
          <span className="sb-item-label">Engine status</span>
          <span className="sb-engine-inline-status">
            <span className="sb-engine-dot" style={{ background: overallColors.dot }} />
            <span>{overall.label}</span>
          </span>
        </button>

        {open && (
          <div className="sb-engine-popover">
            <div className="sb-engine-popover-hdr">
              <div>
                <div className="sb-engine-popover-kicker">Engine status</div>
                <div className="sb-engine-popover-title">{overall.label}</div>
              </div>
              <div className="sb-engine-popover-time">
                {diagnostics?.serverTime
                  ? new Date(diagnostics.serverTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                  : 'n/d'}
              </div>
            </div>

            {error && <div className="sb-engine-error">{error}</div>}

            <div className="sb-engine-actions">
              <button type="button" className="btn-sec" onClick={() => loadDiagnostics('local')} disabled={loading.local || loading.all}>
                {loading.local ? 'Test locale...' : 'Test local AI'}
              </button>
              <button type="button" className="btn-sec" onClick={startLocal} disabled={loading.startLocal || loading.local || loading.all}>
                {loading.startLocal ? 'Avvio...' : 'Avvia local AI'}
              </button>
              <button type="button" className="btn-sec" onClick={() => loadDiagnostics('online')} disabled={loading.online || loading.all}>
                {loading.online ? 'Test online...' : 'Test online AI'}
              </button>
              <button type="button" className="btn" onClick={() => loadDiagnostics('all')} disabled={loading.all}>
                {loading.all ? 'Riprova...' : 'Riprova tutto'}
              </button>
            </div>

            <div className="sb-engine-grid">
              <EngineCompactCard
                title="IA locale"
                engine={local}
                onTest={() => loadDiagnostics('local')}
                onStart={startLocal}
                testLabel="Test local AI"
                startLabel={loading.startLocal ? 'Avvio...' : 'Avvia local AI'}
                disabledStart={loading.startLocal}
                loading={loading.local || loading.all || loading.startLocal}
              />
              <EngineCompactCard
                title="IA online"
                engine={online}
                onTest={() => loadDiagnostics('online')}
                onStart={null}
                testLabel="Test online AI"
                loading={loading.online || loading.all}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      style={{
        position: 'fixed',
        left: 18,
        bottom: 18,
        zIndex: 9998,
        width: open ? 360 : 230,
        maxWidth: 'calc(100vw - 36px)',
        background: 'rgba(21,28,38,.96)',
        border: '1px solid var(--bd)',
        borderRadius: 18,
        boxShadow: '0 16px 36px rgba(0,0,0,.32)',
        backdropFilter: 'blur(10px)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          border: 'none',
          background: overallColors.bg,
          color: 'var(--tx)',
          padding: '.72rem .85rem',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '.75rem',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--mu)' }}>
            Engine status
          </div>
          <div style={{ fontSize: '.95rem', fontWeight: 700 }}>{overall.label}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: 'var(--mu)', fontSize: '.72rem' }}>
          <span>{diagnostics?.serverTime ? new Date(diagnostics.serverTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          <span>{open ? 'Minimizza' : 'Apri'}</span>
        </div>
      </button>

      {open && (
        <div style={{ padding: '.8rem' }}>
          <div style={{ display: 'flex', gap: '.35rem', marginBottom: '.7rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-sec" onClick={() => loadDiagnostics('local')} disabled={loading.local || loading.all}>
              {loading.local ? 'Test locale...' : 'Test local AI'}
            </button>
            <button type="button" className="btn-sec" onClick={startLocal} disabled={loading.startLocal || loading.local || loading.all}>
              {loading.startLocal ? 'Avvio...' : 'Avvia local AI'}
            </button>
            <button type="button" className="btn-sec" onClick={() => loadDiagnostics('online')} disabled={loading.online || loading.all}>
              {loading.online ? 'Test online...' : 'Test online AI'}
            </button>
            <button type="button" className="btn" onClick={() => loadDiagnostics('all')} disabled={loading.all}>
              {loading.all ? 'Riprova...' : 'Riprova tutto'}
            </button>
          </div>

          {error && (
            <div style={{ marginBottom: '.7rem', padding: '.45rem .55rem', borderRadius: 10, border: '1px solid rgba(224,82,82,.24)', background: 'rgba(224,82,82,.08)', color: 'var(--tx)', fontSize: '.75rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gap: '.55rem' }}>
            <EngineCard
              title="IA locale"
              engine={local}
              onTest={() => loadDiagnostics('local')}
              onStart={startLocal}
              testLabel="Test local AI"
              startLabel={loading.startLocal ? 'Avvio...' : 'Avvia local AI'}
              disabledStart={loading.startLocal}
              loading={loading.local || loading.all || loading.startLocal}
            />
            <EngineCard
              title="IA online"
              engine={online}
              onTest={() => loadDiagnostics('online')}
              onStart={null}
              testLabel="Test online AI"
              loading={loading.online || loading.all}
            />
          </div>
        </div>
      )}
    </aside>
  )
}
