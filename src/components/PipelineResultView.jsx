import { useEffect, useState, useCallback } from 'react'
import { sb } from '../lib/supabase'

const sectionStyle = {
  marginTop: '1.25rem',
  padding: '1rem 1.1rem',
  borderRadius: 10,
  border: '1px solid var(--bd, #2a3340)',
  background: 'var(--s2, #151a22)',
}

const labelStyle = {
  fontSize: '.72rem',
  color: 'var(--mu, #8b949e)',
  marginBottom: '0.2rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const valueStyle = {
  fontSize: '.9rem',
  color: 'var(--tx, #e6edf3)',
  fontWeight: 600,
}

function formatMoney(n) {
  const x = typeof n === 'number' ? n : parseFloat(String(n ?? '').replace(',', '.'))
  if (!Number.isFinite(x)) return '—'
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x)
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return String(iso)
  }
}

/**
 * Vista lettura per esito pipeline: parsing da ai_parsing_results e registrazione da accounting_entries.
 * Nessun log tecnico.
 */
export default function PipelineResultView({ documentId, refreshKey = 0 }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [parsingRow, setParsingRow] = useState(null)
  const [entries, setEntries] = useState([])

  const load = useCallback(async () => {
    if (!documentId || !String(documentId).trim()) {
      setParsingRow(null)
      setEntries([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [pRes, eRes] = await Promise.all([
        sb
          .from('ai_parsing_results')
          .select('json_output, confidence, updated_at')
          .eq('document_id', String(documentId).trim())
          .maybeSingle(),
        sb
          .from('accounting_entries')
          .select('id, data, status, created_at')
          .eq('document_id', String(documentId).trim())
          .order('created_at', { ascending: false }),
      ])

      if (pRes.error) throw new Error(pRes.error.message || 'Lettura parsing non riuscita')
      if (eRes.error) throw new Error(eRes.error.message || 'Lettura contabilità non riuscita')

      setParsingRow(pRes.data || null)
      const rawEntries = Array.isArray(eRes.data) ? eRes.data : []
      const preferred =
        rawEntries.find((e) => e.status === 'AI_PROPOSED') ||
        rawEntries.find((e) => e.data?.source === 'ai_accounting') ||
        rawEntries[0]
      setEntries(preferred ? [preferred, ...rawEntries.filter((e) => e.id !== preferred.id)] : rawEntries)
    } catch (e) {
      setError(e?.message || String(e))
      setParsingRow(null)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  let jo = parsingRow?.json_output
  if (typeof jo === 'string') {
    try {
      jo = JSON.parse(jo)
    } catch {
      jo = null
    }
  }
  const doc = jo?.documento || {}
  const cont = jo?.contabile || {}
  const fornitore = doc?.fornitore || {}

  const hasParsing = Boolean(jo && typeof jo === 'object')
  const hasAccounting = entries.length > 0
  let pipelineLabel = 'Nessun dato ancora'
  let pipelineTone = 'var(--mu, #8b949e)'
  if (error) {
    pipelineLabel = 'Impossibile caricare i risultati'
    pipelineTone = 'var(--rd, #f85149)'
  } else if (loading) {
    pipelineLabel = 'Caricamento…'
    pipelineTone = 'var(--mu, #8b949e)'
  } else if (hasParsing && hasAccounting) {
    pipelineLabel = 'Completata'
    pipelineTone = 'var(--cy, #3fb950)'
  } else if (hasParsing || hasAccounting) {
    pipelineLabel = 'Parziale'
    pipelineTone = 'var(--gold, #c9a227)'
  }

  const latestEntry = entries[0]
  const entryData = latestEntry?.data && typeof latestEntry.data === 'object' ? latestEntry.data : null
  const righeContabili =
    Array.isArray(entryData?.righe) && entryData.righe.length > 0
      ? entryData.righe
      : Array.isArray(entryData?.rows) && entryData.rows.length > 0
        ? entryData.rows
        : null

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          marginTop: '0.75rem',
          padding: '0.75rem 1rem',
          borderRadius: 10,
          border: `1px solid ${pipelineTone}`,
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <div style={{ ...labelStyle, marginBottom: 0 }}>Stato pipeline</div>
        <div style={{ ...valueStyle, color: pipelineTone, marginTop: '0.35rem' }}>{pipelineLabel}</div>
        {error && (
          <div style={{ fontSize: '.78rem', color: 'var(--rd, #f85149)', marginTop: '0.5rem' }}>{error}</div>
        )}
      </div>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Documento</h2>
        {loading ? (
          <div style={{ fontSize: '.85rem', color: 'var(--mu, #8b949e)' }}>Caricamento…</div>
        ) : !hasParsing ? (
          <div style={{ fontSize: '.85rem', color: 'var(--mu, #8b949e)' }}>
            Nessun esito di analisi salvato per questo documento.
          </div>
        ) : (
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.85rem 1.5rem',
              margin: 0,
            }}
          >
            <div>
              <dt style={labelStyle}>Data documento</dt>
              <dd style={{ ...valueStyle, margin: 0 }}>{formatDate(doc?.data)}</dd>
            </div>
            <div>
              <dt style={labelStyle}>Affidabilità stimata</dt>
              <dd style={{ ...valueStyle, margin: 0 }}>
                {typeof parsingRow?.confidence === 'number'
                  ? `${Math.round(parsingRow.confidence * 100)} %`
                  : '—'}
              </dd>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <dt style={labelStyle}>Fornitore</dt>
              <dd style={{ ...valueStyle, margin: 0 }}>{fornitore?.nome || '—'}</dd>
            </div>
            <div>
              <dt style={labelStyle}>Partita IVA</dt>
              <dd style={{ ...valueStyle, margin: 0 }}>{fornitore?.piva || '—'}</dd>
            </div>
            <div>
              <dt style={labelStyle}>Aliquota IVA</dt>
              <dd style={{ ...valueStyle, margin: 0 }}>
                {cont?.aliquota != null && cont?.aliquota !== '' ? `${cont.aliquota} %` : '—'}
              </dd>
            </div>
            <div>
              <dt style={labelStyle}>Imponibile</dt>
              <dd style={{ ...valueStyle, margin: 0 }}>{formatMoney(cont?.imponibile)} €</dd>
            </div>
            <div>
              <dt style={labelStyle}>IVA</dt>
              <dd style={{ ...valueStyle, margin: 0 }}>{formatMoney(cont?.iva)} €</dd>
            </div>
          </dl>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Contabilità</h2>
        {loading ? (
          <div style={{ fontSize: '.85rem', color: 'var(--mu, #8b949e)' }}>Caricamento…</div>
        ) : !hasAccounting ? (
          <div style={{ fontSize: '.85rem', color: 'var(--mu, #8b949e)' }}>
            Nessuna registrazione contabile salvata per questo documento.
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '0.85rem',
                marginBottom: entries.length > 1 ? '1rem' : 0,
              }}
            >
              <div>
                <div style={labelStyle}>Tipo registrazione</div>
                <div style={valueStyle}>{entryData?.tipo || latestEntry?.status || '—'}</div>
              </div>
              <div>
                <div style={labelStyle}>Data</div>
                <div style={valueStyle}>{formatDate(entryData?.data || latestEntry?.created_at)}</div>
              </div>
              <div>
                <div style={labelStyle}>Imponibile</div>
                <div style={valueStyle}>{formatMoney(entryData?.imponibile)} €</div>
              </div>
              <div>
                <div style={labelStyle}>IVA</div>
                <div style={valueStyle}>{formatMoney(entryData?.iva)} €</div>
              </div>
              <div>
                <div style={labelStyle}>Totale</div>
                <div style={valueStyle}>{formatMoney(entryData?.totale)} €</div>
              </div>
            </div>

            {righeContabili && righeContabili.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>Righe contabili</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--bd, #2a3340)' }}>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Conto</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Descrizione</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Dare</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Avere</th>
                      </tr>
                    </thead>
                    <tbody>
                      {righeContabili.map((r, i) => (
                        <tr key={r?.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <td style={{ padding: '0.45rem 0.5rem', color: 'var(--tx, #e6edf3)' }}>
                            {r?.conto_id ?? r?.conto ?? '—'}
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', color: 'var(--mu, #adb5bd)' }}>
                            {r?.descrizione || '—'}
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem' }}>{r?.dare ? formatMoney(r.dare) : '—'}</td>
                          <td style={{ padding: '0.45rem 0.5rem' }}>{r?.avere ? formatMoney(r.avere) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {entries.length > 1 && (
              <div style={{ marginTop: '0.75rem', fontSize: '.72rem', color: 'var(--mu, #8b949e)' }}>
                {
                  'Ultima registrazione mostrata; in archivio sono presenti ' +
                  entries.length +
                  ' versioni.'
                }
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
