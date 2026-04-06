import { useCallback, useEffect, useState } from 'react'
import { getLogs, clearLogs } from '../utils/pipelineLogStore.js'
import { downloadLogs } from '../utils/exportLogs.js'
import { clearIvaPipelineWatch } from '../utils/pipelineLogger.js'

function pickStep(entry) {
  if (entry == null) return '—'
  if (typeof entry.step === 'string') return entry.step
  return '—'
}

function pickTimestamp(entry) {
  if (entry == null) return '—'
  if (typeof entry.timestamp === 'string') return entry.timestamp
  return '—'
}

function pickContextLabel(entry) {
  if (entry == null) return ''
  const cid = typeof entry.contextId === 'string' ? entry.contextId : ''
  const short = cid ? `${cid.slice(0, 8)}…` : '—'
  const did = entry.meta?.documentId
  const doc = did ? ` · doc ${String(did).slice(0, 8)}…` : ''
  return `${short}${doc}`
}

function isIvaPipelineAlert(entry) {
  if (entry == null || typeof entry !== 'object') return false
  if (entry.meta?.autoIvaAlert || entry.meta?.resolve_iva_error) return true
  const s = entry.step
  return (
    s === 'IVA_LOST' ||
    s === 'IVA_TYPE_CHANGED' ||
    s === 'IVA_FIELD_CHANGE' ||
    s === 'RESOLVE_IVA_NO_MATCH_ERROR' ||
    s === 'RESOLVE_IVA_NO_ALIQUOTA_ERROR' ||
    s === 'RESOLVE_IVA_EMPTY_CAUSALI_ERROR'
  )
}

function previewJson(entry, maxLen = 140) {
  try {
    const s = JSON.stringify(entry)
    if (s.length <= maxLen) return s
    return `${s.slice(0, maxLen)}…`
  } catch {
    return '[non serializzabile]'
  }
}

/** Distanza dal bordo destro: lasciare spazio al badge AI (fixed right ~18px). */
const PIPELINE_FLOAT_RIGHT = 190
const PIPELINE_FLOAT_BOTTOM = 18

/**
 * Pannello flottante: log pipeline (getLogs), copia, download, svuota.
 */
export function PipelineDebugPanel({ pollMs = 800, defaultCollapsed = true }) {
  const [logs, setLogs] = useState(() => getLogs())
  const [panelOpen, setPanelOpen] = useState(!defaultCollapsed)

  useEffect(() => {
    const id = setInterval(() => {
      try {
        setLogs(getLogs())
      } catch {
        setLogs([])
      }
    }, pollMs)
    return () => clearInterval(id)
  }, [pollMs])

  const refresh = useCallback(() => {
    try {
      setLogs(getLogs())
    } catch {
      setLogs([])
    }
  }, [])

  const copyAll = useCallback(async () => {
    try {
      const text = JSON.stringify(logs, null, 2)
      await navigator.clipboard.writeText(text)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = JSON.stringify(logs, null, 2)
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        // ignore
      }
    }
  }, [logs])

  const handleDownload = useCallback(() => {
    downloadLogs()
  }, [])

  const handleClear = useCallback(() => {
    clearLogs()
    clearIvaPipelineWatch()
    setLogs([])
  }, [])

  const ivaAlertCount = logs.filter(isIvaPipelineAlert).length

  if (!panelOpen) {
    return (
      <button
        type="button"
        className="btn-sec"
        onClick={() => setPanelOpen(true)}
        style={{
          position: 'fixed',
          bottom: PIPELINE_FLOAT_BOTTOM,
          right: PIPELINE_FLOAT_RIGHT,
          zIndex: 9998,
          fontSize: '.72rem',
          padding: '.4rem .65rem',
          boxShadow: ivaAlertCount > 0 ? '0 0 0 2px rgba(239,68,68,.55), 0 2px 12px rgba(0,0,0,.2)' : '0 2px 12px rgba(0,0,0,.2)'
        }}
        title="Apri pannello log pipeline"
      >
        📋 Log pipeline ({logs.length})
        {ivaAlertCount > 0 ? ` · ⚠ ${ivaAlertCount} IVA` : ''}
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: PIPELINE_FLOAT_BOTTOM,
        right: 14,
        width: 'min(440px, calc(100vw - 28px))',
        maxHeight: 'min(72vh, 640px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--s1, #1a1d24)',
        border: '1px solid var(--bd, #333)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,.35)',
        overflow: 'hidden',
        fontSize: '.75rem',
        color: 'var(--tx, #e8eaed)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '.5rem',
          padding: '.55rem .75rem',
          borderBottom: '1px solid var(--bd, #333)',
          background: 'var(--s2, #22262e)',
          flexShrink: 0
        }}
      >
        <span style={{ fontWeight: 700 }}>
          Pipeline debug
          {ivaAlertCount > 0 ? (
            <span style={{ marginLeft: '.35rem', color: '#f87171', fontSize: '.68rem' }}>⚠ {ivaAlertCount} IVA</span>
          ) : null}
        </span>
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-sec" style={{ fontSize: '.68rem', padding: '.25rem .45rem' }} onClick={refresh}>
            Aggiorna
          </button>
          <button type="button" className="btn-sec" style={{ fontSize: '.68rem', padding: '.25rem .45rem' }} onClick={copyAll}>
            Copia tutto
          </button>
          <button type="button" className="btn-sec" style={{ fontSize: '.68rem', padding: '.25rem .45rem' }} onClick={handleDownload}>
            Scarica
          </button>
          <button type="button" className="btn-sec" style={{ fontSize: '.68rem', padding: '.25rem .45rem' }} onClick={handleClear}>
            Svuota
          </button>
          <button
            type="button"
            className="btn-sec"
            style={{ fontSize: '.68rem', padding: '.25rem .45rem' }}
            onClick={() => setPanelOpen(false)}
            title="Chiudi"
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ overflow: 'auto', flex: 1, padding: '.5rem' }}>
        {logs.length === 0 ? (
          <div style={{ color: 'var(--mu, #888)', padding: '.75rem', textAlign: 'center' }}>Nessun log.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
            {logs.map((entry, i) => {
              const ivaAlert = isIvaPipelineAlert(entry)
              return (
              <li
                key={`${pickTimestamp(entry)}-${i}`}
                style={{
                  border: ivaAlert ? '1px solid rgba(248,113,113,0.75)' : '1px solid var(--bd, #333)',
                  borderRadius: 6,
                  overflow: 'hidden',
                  boxShadow: ivaAlert ? 'inset 0 0 0 1px rgba(127,29,29,0.35)' : undefined
                }}
              >
                <details style={{ margin: 0 }}>
                  <summary
                    style={{
                      cursor: 'pointer',
                      padding: '.45rem .55rem',
                      background: ivaAlert ? 'rgba(127,29,29,0.25)' : 'var(--s2, #22262e)',
                      listStyle: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '.2rem',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: ivaAlert ? '#fca5a5' : 'var(--gold, #c9a227)',
                          wordBreak: 'break-word'
                        }}
                      >
                        {ivaAlert ? '⚠ ' : ''}
                        {pickStep(entry)}
                      </span>
                      <span style={{ fontSize: '.65rem', color: 'var(--mu, #888)', fontFamily: 'monospace' }}>{pickTimestamp(entry)}</span>
                    </div>
                    <div style={{ fontSize: '.6rem', color: 'var(--mu, #666)', fontFamily: 'monospace' }}>{pickContextLabel(entry)}</div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '.65rem',
                        color: 'var(--mu, #aaa)',
                        wordBreak: 'break-all',
                        lineHeight: 1.35
                      }}
                      title="Anteprima JSON"
                    >
                      {previewJson(entry)}
                    </div>
                  </summary>
                  <pre
                    style={{
                      margin: 0,
                      padding: '.5rem .55rem',
                      background: 'var(--bg, #12141a)',
                      fontSize: '.62rem',
                      lineHeight: 1.4,
                      overflow: 'auto',
                      maxHeight: 220,
                      borderTop: '1px solid var(--bd, #333)'
                    }}
                  >
                    {(() => {
                      try {
                        return JSON.stringify(entry, null, 2)
                      } catch {
                        return String(entry)
                      }
                    })()}
                  </pre>
                </details>
              </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
