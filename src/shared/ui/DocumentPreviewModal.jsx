import { useEffect, useMemo, useState } from 'react'
import { formattaXML, parseXMLFattura } from '../../../domain/fatture.js'

function moneyFmt(value) {
  const n = Number(value || 0)
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number.isFinite(n) ? n : 0)
  } catch {
    return `${(Number.isFinite(n) ? n : 0).toFixed(2)} €`
  }
}

function normalizeXmlParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  const linesSrc = Array.isArray(parsed.lines) ? parsed.lines : Array.isArray(parsed.linee) ? parsed.linee : []
  const rieSrc = Array.isArray(parsed.riepilogo) ? parsed.riepilogo : Array.isArray(parsed.riepilogo_iva) ? parsed.riepilogo_iva : []
  return {
    ...parsed,
    lines: linesSrc,
    riepilogo: rieSrc,
  }
}

function InvoicePreview({ parsed, fallback = {} }) {
  const p = normalizeXmlParsed(parsed) || {}
  const lines = Array.isArray(p.lines) ? p.lines : []
  const riepilogo = Array.isArray(p.riepilogo) ? p.riepilogo : []

  const tipoDoc = p.tipo_documento || fallback.tipo_doc || fallback.tipo_documento || 'TD01'
  const numero = p.numero || fallback.numero || fallback.numero_documento || '—'
  const data = p.data || fallback.data || fallback.data_documento || '—'
  const divisa = p.divisa || 'EUR'

  const fornitoreNome = p.nome_cedente || p.fornitore || fallback.cedente_denom || fallback.soggetto_denominazione || '—'
  const fornitorePiva = p.piva_cedente || fallback.cedente_piva || fallback.soggetto_piva || '—'
  const fornitoreCf = p.cf_cedente || fallback.cedente_cf || fallback.soggetto_cf || ''

  const clienteNome = p.nome_cessionario || p.cliente || fallback.cessionario_denom || '—'
  const clientePiva = p.piva_cessionario || fallback.cessionario_piva || '—'
  const clienteCf = p.cf_cessionario || fallback.cessionario_cf || ''

  const imponibile = fallback.imponibile ?? p.imponibile ?? 0
  const iva = fallback.iva ?? fallback.imposta ?? p.imposta ?? 0
  const totale = fallback.totale ?? p.totale_doc ?? p.totale ?? 0

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div
        style={{
          background: 'var(--s1)',
          border: '1px solid var(--bd)',
          borderRadius: 12,
          padding: '1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>TIPO DOCUMENTO</div>
            <div style={{ fontSize: '.95rem', fontWeight: 700, marginTop: '.2rem' }}>{tipoDoc}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>TOTALE</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--gold)', marginTop: '.2rem' }}>{moneyFmt(totale)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>FORNITORE</div>
            <div style={{ fontWeight: 700, marginTop: '.2rem' }}>{fornitoreNome}</div>
            <div style={{ fontSize: '.78rem', color: 'var(--mu)', marginTop: '.2rem' }}>
              P.IVA {fornitorePiva}
              {fornitoreCf ? ` · CF ${fornitoreCf}` : ''}
            </div>
            {p.indirizzo_cedente && (
              <div style={{ fontSize: '.78rem', color: 'var(--mu)', marginTop: '.15rem' }}>{p.indirizzo_cedente}</div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>CLIENTE / CESSIONARIO</div>
            <div style={{ fontWeight: 700, marginTop: '.2rem' }}>{clienteNome}</div>
            <div style={{ fontSize: '.78rem', color: 'var(--mu)', marginTop: '.2rem' }}>
              P.IVA {clientePiva}
              {clienteCf ? ` · CF ${clienteCf}` : ''}
            </div>
            {p.indirizzo_cessionario && (
              <div style={{ fontSize: '.78rem', color: 'var(--mu)', marginTop: '.15rem' }}>{p.indirizzo_cessionario}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>NUMERO</div>
            <div style={{ fontWeight: 700, marginTop: '.2rem' }}>{numero}</div>
          </div>
          <div>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>DATA</div>
            <div style={{ fontWeight: 700, marginTop: '.2rem' }}>{data}</div>
          </div>
          <div>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>DIVISA</div>
            <div style={{ fontWeight: 700, marginTop: '.2rem' }}>{divisa}</div>
          </div>
        </div>
      </div>

      {lines.length > 0 ? (
        <div
          style={{
            background: 'var(--s1)',
            border: '1px solid var(--bd)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '.75rem 1rem', borderBottom: '1px solid var(--bd)', fontWeight: 800, fontSize: '.78rem', color: 'var(--mu)', letterSpacing: '.06em' }}>
            RIGHE DOCUMENTO
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--bd)' }}>
                <th style={{ padding: '.55rem .75rem', textAlign: 'left', color: 'var(--mu)', fontWeight: 700 }}>Descrizione</th>
                <th style={{ padding: '.55rem .75rem', textAlign: 'right', color: 'var(--mu)', fontWeight: 700, width: 110 }}>Imponibile</th>
                <th style={{ padding: '.55rem .75rem', textAlign: 'right', color: 'var(--mu)', fontWeight: 700, width: 90 }}>IVA</th>
              </tr>
            </thead>
            <tbody>
              {lines.slice(0, 60).map((l, idx) => {
                const desc = l.descrizione || l.desc || '—'
                const imponibileRow = l.prezzoTotale ?? l.imponibile ?? l.totale ?? 0
                const ivaLabel = String(l.aliquotaIVA || l.iva || '').trim()
                  ? `${String(l.aliquotaIVA || l.iva).trim()}%`
                  : (String(l.natura || '').trim() ? String(l.natura).trim() : '0%')
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--bd)' }}>
                    <td style={{ padding: '.55rem .75rem' }}>
                      <div style={{ fontWeight: 700 }}>{desc}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginTop: '.15rem' }}>
                        {l.quantita != null ? `Q.tà ${l.quantita}` : ''}
                        {l.prezzoUnitario != null ? ` · Prezzo ${moneyFmt(l.prezzoUnitario)}` : ''}
                        {l.natura ? ` · Natura ${l.natura}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '.55rem .75rem', textAlign: 'right', fontWeight: 800 }}>{moneyFmt(imponibileRow)}</td>
                    <td style={{ padding: '.55rem .75rem', textAlign: 'right', color: 'var(--mu)' }}>{ivaLabel}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--s1)',
            border: '1px solid var(--bd)',
            borderRadius: 12,
            padding: '1rem',
            color: 'var(--mu)',
            fontSize: '.85rem',
          }}
        >
          Righe documento non disponibili (XML incompleto)
        </div>
      )}

      <div
        style={{
          background: 'var(--s1)',
          border: '1px solid var(--bd)',
          borderRadius: 12,
          padding: '1rem',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>IMPONIBILE</div>
            <div style={{ fontWeight: 800, marginTop: '.2rem' }}>{moneyFmt(imponibile)}</div>
          </div>
          <div>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>IVA</div>
            <div style={{ fontWeight: 800, marginTop: '.2rem' }}>{moneyFmt(iva)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)' }}>TOTALE</div>
            <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--gold)', marginTop: '.2rem' }}>{moneyFmt(totale)}</div>
          </div>
        </div>

        {riepilogo.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ fontSize: '.7rem', letterSpacing: '.06em', fontWeight: 800, color: 'var(--mu)', marginBottom: '.35rem' }}>RIEPILOGO IVA</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
              <thead>
                <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--bd)' }}>
                  <th style={{ padding: '.45rem .6rem', textAlign: 'left', color: 'var(--mu)', fontWeight: 700 }}>Aliquota</th>
                  <th style={{ padding: '.45rem .6rem', textAlign: 'right', color: 'var(--mu)', fontWeight: 700 }}>Imponibile</th>
                  <th style={{ padding: '.45rem .6rem', textAlign: 'right', color: 'var(--mu)', fontWeight: 700 }}>Imposta</th>
                  <th style={{ padding: '.45rem .6rem', textAlign: 'left', color: 'var(--mu)', fontWeight: 700 }}>Natura</th>
                </tr>
              </thead>
              <tbody>
                {riepilogo.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                    <td style={{ padding: '.45rem .6rem', fontWeight: 800 }}>{String(r.aliquota || '0').trim()}%</td>
                    <td style={{ padding: '.45rem .6rem', textAlign: 'right' }}>{moneyFmt(r.imponibile || 0)}</td>
                    <td style={{ padding: '.45rem .6rem', textAlign: 'right' }}>{moneyFmt(r.imposta || 0)}</td>
                    <td style={{ padding: '.45rem .6rem', color: 'var(--mu)' }}>{r.natura || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export function DocumentPreviewModal({
  open,
  onClose,
  title = 'Anteprima documento',
  subtitle = '',
  document = null,
  resolvePublicUrl = null, // (filePath: string) => string
  fetchXmlByFilename = null, // async (filename: string) => string | null
  fileUrl = '',
  filename = '',
  mimeType = '',
  xmlContent = '',
  parsedXml = null,
  fallback = null,
}) {
  const [tab, setTab] = useState('preview') // preview | xml
  const [zoom, setZoom] = useState(1)
  const [resolvedXml, setResolvedXml] = useState('')
  const [xmlLoading, setXmlLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab('preview')
    setZoom(1)
    setResolvedXml('')
    setXmlLoading(false)
  }, [open])

  const parsedDatiEstratti = useMemo(() => {
    const raw = document?.dati_estratti
    if (!raw) return {}
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return {}
      }
    }
    return typeof raw === 'object' ? raw : {}
  }, [document?.dati_estratti])

  const effectiveFilename = filename || document?.filename || ''
  const effectiveMimeType = mimeType || document?.mime_type || ''

  const resolvedFileUrl = useMemo(() => {
    if (fileUrl) return fileUrl
    if (document?.file_url) return document.file_url
    if (document?.file_path && typeof resolvePublicUrl === 'function') {
      try {
        return resolvePublicUrl(document.file_path) || ''
      } catch {
        return ''
      }
    }
    return ''
  }, [fileUrl, document?.file_url, document?.file_path, resolvePublicUrl])

  const preferPdf = useMemo(() => {
    const mt = String(effectiveMimeType || '').toLowerCase()
    const name = String(effectiveFilename || '').toLowerCase()
    const url = String(resolvedFileUrl || '').toLowerCase()
    return Boolean(resolvedFileUrl) && (mt.includes('pdf') || name.endsWith('.pdf') || url.includes('.pdf'))
  }, [effectiveMimeType, effectiveFilename, resolvedFileUrl])

  useEffect(() => {
    if (!open) return
    let alive = true

    const directXml =
      xmlContent ||
      document?.ai_raw_response?.xml_content ||
      parsedDatiEstratti?.xml_content ||
      ''

    if (directXml) {
      setResolvedXml(directXml)
      return () => {
        alive = false
      }
    }

    const xmlFilename = parsedDatiEstratti?.xml_filename
    if (xmlFilename && typeof fetchXmlByFilename === 'function') {
      setXmlLoading(true)
      Promise.resolve(fetchXmlByFilename(xmlFilename))
        .then((text) => {
          if (!alive) return
          setResolvedXml(text || '')
        })
        .catch(() => {
          if (!alive) return
          setResolvedXml('')
        })
        .finally(() => {
          if (alive) setXmlLoading(false)
        })
      return () => {
        alive = false
      }
    }

    // Fallback: if the source looks like XML and it's fetchable, try to load it.
    const url = String(resolvedFileUrl || '')
    const looksXml = /\\.xml(\\?|$)/i.test(url) || String(effectiveMimeType || '').toLowerCase().includes('xml')
    if (looksXml && resolvedFileUrl) {
      setXmlLoading(true)
      fetch(resolvedFileUrl)
        .then((r) => r.text())
        .then((text) => {
          if (!alive) return
          setResolvedXml(text || '')
        })
        .catch(() => {
          if (!alive) return
          setResolvedXml('')
        })
        .finally(() => {
          if (alive) setXmlLoading(false)
        })
      return () => {
        alive = false
      }
    }

    return () => {
      alive = false
    }
  }, [
    open,
    xmlContent,
    document?.id,
    document?.dati_estratti,
    document?.ai_raw_response?.xml_content,
    fetchXmlByFilename,
    resolvedFileUrl,
    effectiveMimeType,
    parsedDatiEstratti?.xml_content,
    parsedDatiEstratti?.xml_filename,
  ])

  const canShowXml = Boolean(resolvedXml)

  const parsed = useMemo(() => {
    if (parsedXml) return parsedXml
    if (!resolvedXml) return null
    try {
      return parseXMLFattura(resolvedXml)
    } catch {
      return null
    }
  }, [parsedXml, resolvedXml])

  if (!open) return null

  return (
    <div
      className="overlay"
      style={{ zIndex: 200 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="modal erp-detail-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1180, width: '94%', maxHeight: '88vh' }}>
        <div className="modal-hdr">
          <div className="modal-title">{title}</div>
          <div className="modal-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle || effectiveFilename || '—'}
          </div>
          <button type="button" className="modal-close" onClick={() => onClose?.()}>
            ×
          </button>
        </div>

        {!preferPdf && canShowXml && (
          <div className="erp-detail-rail-tabs" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className={'erp-inline-tab' + (tab === 'preview' ? ' active' : '')} onClick={() => setTab('preview')}>
              Anteprima
            </button>
            <button type="button" className={'erp-inline-tab' + (tab === 'xml' ? ' active' : '')} onClick={() => setTab('xml')}>
              Mostra XML
            </button>
          </div>
        )}

        <div className="modal-body erp-detail-modal-body" style={{ overflow: 'hidden', display: 'block' }}>
          {/*
            NOTE: `erp-detail-modal-content` in the app is sometimes styled as a split layout (grid/flex),
            which can cause the preview to render in a narrow left column with unused space on the right.
            Here we force a single-column centered preview container.
          */}
          <div className="erp-detail-modal-content" style={{ minHeight: 0, width: '100%', display: 'block', margin: '0 auto' }}>
            {preferPdf && resolvedFileUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '.5rem' }}>
                  <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>PDF</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                    <button type="button" className="btn-sec" style={{ padding: '.2rem .45rem', fontSize: '.65rem' }} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}>
                      -
                    </button>
                    <span style={{ fontSize: '.68rem', color: 'var(--mu)', minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                    <button type="button" className="btn-sec" style={{ padding: '.2rem .45rem', fontSize: '.65rem' }} onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}>
                      +
                    </button>
                    <button type="button" className="btn-sec" style={{ padding: '.2rem .45rem', fontSize: '.65rem' }} onClick={() => setZoom(1)}>
                      Reset
                    </button>
                  </div>
                </div>
                <div style={{ overflow: 'auto', minHeight: 0, flex: 1, background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 12 }}>
                  <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100 / zoom}%` }}>
                    <iframe title="pdf" src={resolvedFileUrl} style={{ width: '100%', height: '100%', minHeight: 560, border: 'none' }} />
                  </div>
                </div>
              </div>
            ) : tab === 'xml' && canShowXml ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '.78rem',
                  lineHeight: 1.45,
                  background: 'var(--s1)',
                  border: '1px solid var(--bd)',
                  borderRadius: 12,
                  padding: '1rem',
                  color: 'var(--tx)',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  overflow: 'auto',
                  maxHeight: '68vh',
                }}
              >
                {(() => {
                  try {
                    return formattaXML(resolvedXml)
                  } catch {
                    return resolvedXml
                  }
                })()}
              </pre>
            ) : parsed ? (
              <div style={{ overflow: 'auto', maxHeight: '74vh' }}>
                {/* Center the readable invoice preview and keep equal left/right breathing room */}
                <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 16px' }}>
                  <InvoicePreview parsed={parsed} fallback={fallback || {}} />
                </div>
              </div>
            ) : resolvedFileUrl ? (
              <iframe title="file" src={resolvedFileUrl} style={{ width: '100%', height: '100%', minHeight: 560, border: 'none' }} />
            ) : xmlLoading ? (
              <div style={{ color: 'var(--mu)', padding: '1rem' }}>Caricamento anteprima…</div>
            ) : (
              <div style={{ color: 'var(--mu)', padding: '1rem' }}>Anteprima non disponibile per questo documento.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
