import { useCallback, useEffect, useMemo, useState } from 'react'
import * as contabilitaRepo from './data/contabilitaRepo.js'

const TIPO_LABEL = {
  iva_anomaly: 'IVA',
  cost_trend: 'Trend costi',
  fiscal_suggestion: 'Suggerimento fiscale',
  cost_analysis: 'Analisi costi',
}

const gravitaStyle = (g) => {
  const x = String(g || '').toLowerCase()
  if (x === 'critical') return { border: '1px solid rgba(239,83,80,.45)', background: 'rgba(183,28,28,.12)' }
  if (x === 'warning') return { border: '1px solid rgba(255,193,7,.4)', background: 'rgba(245,180,0,.1)' }
  return { border: '1px solid var(--bd)', background: 'var(--s2)' }
}

function docIdFromInsight(row) {
  const r = row?.entity_ref
  if (!r || typeof r !== 'object') return null
  return r.document_id || r.documento_id || null
}

function matchesDocument(row, documentId) {
  if (!documentId) return false
  const id = docIdFromInsight(row)
  return id != null && String(id) === String(documentId)
}

function isSocietaWide(row) {
  const r = row?.entity_ref
  if (!r || typeof r !== 'object') return true
  if (r.entity_type === 'societa') return true
  return docIdFromInsight(row) == null
}

/**
 * Insight da ai_insights: fetch, filtri per contesto documento, azioni visto / risolto / correggi.
 * @param {{ societaId: string, documentId?: string|null, variant?: 'panel'|'dashboard', compact?: boolean, onFixNow?: (row: object) => void, refreshKey?: number }} props
 */
export function CopilotInsightsBlock({
  societaId,
  documentId = null,
  variant = 'panel',
  compact = false,
  onFixNow,
  refreshKey = 0,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)

  const load = useCallback(async () => {
    if (!societaId) {
      setRows([])
      return
    }
    setLoading(true)
    setErr(null)
    const { data, error } = await contabilitaRepo.getAiInsights(societaId)

    if (error) {
      setErr(error.message || String(error))
      setRows([])
    } else {
      setRows(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [societaId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const { forDoc, forSocieta } = useMemo(() => {
    if (!documentId) {
      return { forDoc: [], forSocieta: rows }
    }
    const doc = []
    const soc = []
    const other = []
    for (const r of rows) {
      if (matchesDocument(r, documentId)) doc.push(r)
      else if (isSocietaWide(r)) soc.push(r)
      else other.push(r)
    }
    return { forDoc: doc, forSocieta: [...soc, ...other] }
  }, [rows, documentId])

  const markSeen = async (row) => {
    if (!row?.id || row.seen_at) return
    setUpdatingId(row.id)
    const now = new Date().toISOString()
    const { error } = await contabilitaRepo.markAiInsightSeen(row.id, societaId, now)
    setUpdatingId(null)
    if (!error) setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, seen_at: now } : x)))
  }

  const markResolved = async (row) => {
    if (!row?.id) return
    setUpdatingId(row.id)
    const now = new Date().toISOString()
    const { error } = await contabilitaRepo.markAiInsightResolved(row.id, societaId, now)
    setUpdatingId(null)
    if (!error) setRows((prev) => prev.filter((x) => x.id !== row.id))
  }

  const sortByGravita = (list) => {
    const rank = { critical: 0, warning: 1, info: 2 }
    return [...list].sort((a, b) => {
      const ra = rank[String(a.gravita).toLowerCase()] ?? 3
      const rb = rank[String(b.gravita).toLowerCase()] ?? 3
      if (ra !== rb) return ra - rb
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    })
  }

  if (!societaId) {
    return variant === 'dashboard' ? null : (
      <div style={{ fontSize: '.65rem', color: 'var(--mu)', padding: '.25rem 0' }}>Insight: seleziona una società.</div>
    )
  }

  const renderSection = (title, list) => {
    const sorted = sortByGravita(list)
    if (!sorted.length) return null
    return (
      <div style={{ marginBottom: compact ? '.35rem' : '.5rem' }}>
        {!compact && (
          <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.3rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {title}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
          {sorted.map((row) => {
            const open = expandedId === row.id
            const st = gravitaStyle(row.gravita)
            return (
              <div
                key={row.id}
                style={{
                  ...st,
                  borderRadius: 8,
                  padding: '.4rem .5rem',
                  fontSize: compact ? '.68rem' : '.72rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.35rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.25rem', marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, lineHeight: 1.35 }}>{row.titolo}</span>
                      <span className="bdg bdg-gold" style={{ fontSize: '.55rem', opacity: 0.9 }}>
                        {TIPO_LABEL[row.tipo] || row.tipo}
                      </span>
                      {!row.seen_at && (
                        <span className="bdg" style={{ fontSize: '.55rem', background: 'rgba(100,181,246,.2)', border: '1px solid rgba(100,181,246,.35)' }}>
                          Nuovo
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginTop: '.35rem' }}>
                  <button
                    type="button"
                    className="btn-sec"
                    style={{ fontSize: '.6rem', padding: '.15rem .4rem' }}
                    disabled={updatingId === row.id}
                    onClick={() => {
                      setExpandedId(open ? null : row.id)
                      if (!open) void markSeen(row)
                    }}
                  >
                    {open ? 'Nascondi dettagli' : 'Mostra dettagli'}
                  </button>
                  <button
                    type="button"
                    className="btn-sec"
                    style={{ fontSize: '.6rem', padding: '.15rem .4rem' }}
                    disabled={updatingId === row.id || !!row.seen_at}
                    onClick={() => void markSeen(row)}
                  >
                    Segna come visto
                  </button>
                  {onFixNow && (
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '.6rem', padding: '.15rem .4rem' }}
                      disabled={updatingId === row.id}
                      onClick={() => onFixNow(row)}
                    >
                      Correggi ora
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-sec"
                    style={{ fontSize: '.6rem', padding: '.15rem .4rem', color: 'var(--mu)' }}
                    disabled={updatingId === row.id}
                    onClick={() => void markResolved(row)}
                  >
                    Risolvi
                  </button>
                </div>
                {open && (
                  <div style={{ marginTop: '.45rem', paddingTop: '.45rem', borderTop: '1px solid var(--bd)', fontSize: '.68rem', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {row.descrizione}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const totalShown = documentId ? forDoc.length + forSocieta.length : rows.length

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.35rem' }}>
        <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--gold)' }}>Insight Copilot</div>
        <button type="button" className="btn-sec" style={{ fontSize: '.58rem', padding: '.12rem .35rem' }} disabled={loading} onClick={() => void load()}>
          Aggiorna
        </button>
      </div>
      {loading && rows.length === 0 && <div style={{ fontSize: '.65rem', color: 'var(--mu)' }}>Caricamento insight…</div>}
      {err && (
        <div style={{ fontSize: '.65rem', color: '#ff8585', marginBottom: '.35rem' }}>
          {err}
          <div style={{ fontSize: '.58rem', color: 'var(--mu)', marginTop: 2 }}>Se la colonna non esiste, applica le migration Supabase (seen_at / resolved_at).</div>
        </div>
      )}
      {!loading && !err && totalShown === 0 && (
        <div style={{ fontSize: '.65rem', color: 'var(--mu)', lineHeight: 1.4 }}>Nessun insight attivo. Esegui lo scan da API o attendi il prossimo aggiornamento.</div>
      )}
      {documentId ? (
        <>
          {renderSection('Contesto documento', forDoc)}
          {renderSection('Società e altri', forSocieta)}
        </>
      ) : (
        renderSection('Tutti gli insight', rows)
      )}
    </div>
  )
}

export function buildCopilotFixPromptFromInsight(insight) {
  const t = String(insight?.titolo || '').trim()
  const d = String(insight?.descrizione || '').trim()
  return `Insight: "${t}".\n\n${d}\n\nCosa conviene fare per verificare o correggere in contabilità? Usa i tool se servono dati aggiornati.`
}
