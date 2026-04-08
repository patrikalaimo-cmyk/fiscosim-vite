import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseXMLFattura } from '../../../domain/fatture.js'
import { resolveIvaOrNull } from '../../../domain/resolveIva.js'
import { evaluateDraftReliability, reliabilityTierLabel } from '../../../domain/draftReliability.js'
import { sb } from '../../lib/supabase.js'
import { FatturaCourtesyViewer } from './FatturaCourtesyViewer.jsx'
import { ContabileCopilotPanel } from './ContabileCopilotPanel.jsx'
import { buildCopilotFixPromptFromInsight } from './CopilotInsightsBlock.jsx'
import { loadIvaInsightsForSocieta } from './application/ivaInsightsClient.js'
import * as contabilitaRepo from './data/contabilitaRepo.js'
import { fmtCurrency as fmt, fmtDate } from './ui/formatters.js'

function parseDati(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? { ...raw } : {}
}

/** Stile badge punteggio 0–100 */
function confidenceBadgeStyle(c) {
  if (c == null || c === '' || !Number.isFinite(Number(c))) {
    return { background: 'var(--s2)', color: 'var(--mu)', border: '1px solid var(--bd)' }
  }
  const n = Number(c)
  if (n > 90) return { background: 'rgba(46,125,50,.35)', color: '#a5d6a7', border: '1px solid rgba(76,175,80,.5)' }
  if (n >= 70) return { background: 'rgba(245,180,0,.35)', color: '#ffe082', border: '1px solid rgba(255,193,7,.55)' }
  return { background: 'rgba(183,28,28,.4)', color: '#ffcdd2', border: '1px solid rgba(239,83,80,.5)' }
}

/** Tooltip testuale: spiegazione breve + fonte AI + breakdown punteggi */
function buildAutoValidateTooltip(row) {
  if (!row) {
    return 'Nessuna scrittura contabile in pipeline per questo documento.\nEsegui l’import con pipeline AI oppure “Aggiorna punteggi” per calcolare.'
  }
  const lines = []
  const expl = String(row.ai_explanation || '').trim()
  if (expl) lines.push(expl)
  const src = row.ai_source
  if (src === 'memory') {
    lines.push('Fonte: memoria — conto collegato in anagrafica sul piano dei conti (P.IVA).')
  } else if (src === 'learning') {
    lines.push('Fonte: apprendimento — conto proposto da regole ai_learning (conferme/correzioni cumulative per anagrafica).')
  } else if (src === 'pattern') {
    lines.push('Fonte: pattern — stesso conto o abitudine ricavata da documenti precedenti della stessa anagrafica.')
  } else if (src === 'fallback') {
    lines.push('Fonte: fallback — pochi segnali automatici; decisione da verificare.')
  } else {
    lines.push(`Fonte: ${src || 'non assegnata'}.`)
  }
  const b = row.auto_validate_meta && typeof row.auto_validate_meta === 'object' ? row.auto_validate_meta : {}
  const parts = []
  if (b.ai_learning_frequenza) parts.push(`Apprendimento ${b.ai_learning_frequenza}×`)
  if (b.combined_boost) parts.push(`Rafforzamento +${b.combined_boost}`)
  if (b.mapping_piano_anagrafica) parts.push(`Mapping piano +${b.mapping_piano_anagrafica}`)
  if (b.stessa_anagrafica_stesso_conto) parts.push(`Stesso conto in passato +${b.stessa_anagrafica_stesso_conto}`)
  if (b.ai_pattern_storico) parts.push(`Pattern storico +${b.ai_pattern_storico}`)
  if (b.nuova_anagrafica) parts.push(`Anagrafica nuova ${b.nuova_anagrafica}`)
  if (parts.length) lines.push('Punteggio: ' + parts.join(', ') + '.')
  if (row.ai_status) lines.push(`Stato automatico: ${row.ai_status}.`)
  return lines.join('\n')
}

function learningFrequenzaFromMeta(row) {
  const b = row?.auto_validate_meta && typeof row.auto_validate_meta === 'object' ? row.auto_validate_meta : {}
  const n = Number(b.ai_learning_frequenza)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function isAiLearningSource(row) {
  return row?.ai_source === 'learning'
}

/** Raggruppa accounting_entries per document_id (più recente). */
function latestEntryByDocumentId(rows) {
  const map = {}
  const list = Array.isArray(rows) ? rows : []
  const sorted = [...list].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime()
    const tb = new Date(b.created_at || 0).getTime()
    return tb - ta
  })
  for (const r of sorted) {
    const id = r.document_id != null ? String(r.document_id) : ''
    if (id && map[id] == null) map[id] = r
  }
  return map
}

function PdfZoomPane({ doc, xmlPreview }) {
  const [zoom, setZoom] = useState(1)
  const wrapRef = useRef(null)

  useEffect(() => {
    setZoom(1)
  }, [doc?.id])

  const fileUrl = useMemo(() => {
    if (doc?.file_url) return doc.file_url
    if (doc?.file_path) {
      const { data } = contabilitaRepo.getDocumentoPublicUrl(doc.file_path)
      return data?.publicUrl || ''
    }
    return ''
  }, [doc?.id, doc?.file_url, doc?.file_path])

  return (
    <div className="split-pane" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="split-pane-header" style={{ flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: '.85rem' }}>Documento</span>
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
      <div
        ref={wrapRef}
        className="split-pane-content"
        style={{
          overflow: 'auto',
          padding: 0,
          minHeight: 0,
          flex: 1,
          background: 'var(--s2)',
        }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: `${100 / zoom}%`,
            minHeight: `${100 / zoom}%`,
          }}
        >
          {xmlPreview ? (
            <FatturaCourtesyViewer data={xmlPreview} />
          ) : fileUrl ? (
            <iframe title="pdf" src={fileUrl} style={{ width: '100%', height: '100%', minHeight: 480, border: 'none' }} />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--mu)', padding: '2rem' }}>
              <div style={{ fontSize: '2rem' }}>??</div>
              <div>Nessun file collegato</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function useXmlPreview(doc) {
  const [xmlPreview, setXmlPreview] = useState(null)
  useEffect(() => {
    setXmlPreview(null)
    if (!doc?.id) return
    const isXML =
      doc.mime_type?.includes('xml') ||
      doc.filename?.toLowerCase().endsWith('.xml') ||
      doc.filename?.toLowerCase().endsWith('.p7m') ||
      doc.tipo_documento?.includes('fattura')
    if (!isXML) return

    const datiEst = parseDati(doc.dati_estratti)
    const tryParseXml = (text) => {
      try {
        setXmlPreview(parseXMLFattura(text))
      } catch (e) {
        console.error('XML parse:', e)
      }
    }

    if (datiEst?.xml_filename) {
      contabilitaRepo.getFatturaXmlByFilename(datiEst.xml_filename)
        .then(({ data }) => {
          if (data?.[0]?.xml_content) tryParseXml(data[0].xml_content)
        })
      return
    }

    let url = doc.file_url
    if (!url && doc.file_path) {
      const { data: u } = contabilitaRepo.getDocumentoPublicUrl(doc.file_path)
      url = u?.publicUrl
    }
    if (!url) return
    fetch(url)
      .then((r) => r.text())
      .then(tryParseXml)
      .catch((e) => console.error('XML fetch:', e))
  }, [doc?.id, doc?.file_url, doc?.file_path, doc?.filename, doc?.mime_type, doc?.tipo_documento, doc?.dati_estratti])

  return xmlPreview
}

function normContoCode(c) {
  return String(c || '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .trim()
}

function getDocImponibileIva(doc) {
  const d = parseDati(doc?.dati_estratti)
  const imponibile =
    Number(doc?.imponibile ?? d?.imponibile ?? d?.totale_imponibile ?? d?.base_imponibile ?? 0) || 0
  let iva =
    Number(doc?.imposta ?? doc?.iva ?? d?.imposta ?? d?.iva ?? d?.totale_iva ?? 0) || 0

  if ((!iva || iva === 0) && Array.isArray(d?.riepilogo_iva)) {
    iva = d.riepilogo_iva.reduce((acc, row) => acc + (Number(row?.imposta ?? row?.iva ?? 0) || 0), 0)
  }

  return { imponibile, iva }
}

function AccountingForm({
  doc,
  pianoConti,
  causaliIva,
  onSave,
  onOpenGuidata,
  listIds,
  idxInList,
  autoValidateMode = false,
  entryMeta = null,
  onTogglePinExplanation = null,
  onRefreshEntryMeta = null,
  copilotHighlight = null,
  ivaInsights = [],
  ivaInsightsLoading = false,
}) {
  const [contoId, setContoId] = useState('')
  const [causaleIva, setCausaleIva] = useState('')
  const [dataReg, setDataReg] = useState('')
  const [tipoPag, setTipoPag] = useState('')
  const [contoSearch, setContoSearch] = useState('')
  const [showDd, setShowDd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [learningRuleModal, setLearningRuleModal] = useState(null)
  const [learningRuleBusy, setLearningRuleBusy] = useState(false)

  useEffect(() => {
    setLearningRuleModal(null)
  }, [doc?.id])

  useEffect(() => {
    if (!doc) return
    const d = parseDati(doc.dati_estratti)
    setContoId(doc.conto_id || d.conto_id || '')
    setCausaleIva(doc.causale_iva || '')
    setDataReg((d.data_registrazione || doc.data_documento || '').toString().slice(0, 10))
    setTipoPag(d.tipo_pagamento || '')
    setContoSearch('')
    setShowDd(false)
  }, [doc?.id])

  useEffect(() => {
    if (!doc || !causaliIva?.length) return
    const de = parseDati(doc.dati_estratti)
    const riepilogo = de?.riepilogo_iva || []
    const pivaFornitore = doc.soggetto_piva || de?.cedente_piva
    const contoFornitore =
      pianoConti?.find((c) => c.partita_iva === pivaFornitore || c.anagrafica_piva === pivaFornitore) || null
    if (riepilogo.length === 0) {
      if (!causaleIva) {
        const aliqDoc = doc.aliquota_iva || de?.aliquota_iva || '22'
        const id = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: aliqDoc, natura: '', causaliIva, pipelineContext: undefined }) || '')
        if (id) setCausaleIva(id)
      }
      return
    }
    if (riepilogo.length === 1 && !causaleIva) {
      const r = riepilogo[0]
      const id = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: r.aliquota, natura: r.natura || '', causaliIva, pipelineContext: undefined }) || '')
      if (id) setCausaleIva(id)
    }
  }, [causaliIva?.length, doc?.id])

  const selectedConto = pianoConti.find((c) => c.id === contoId)
  const filteredConti = pianoConti
    .filter((c) => {
      if (c.livello < 3) return false
      if (!contoSearch) return true
      const s = contoSearch.toLowerCase().trim()
      if ((c.descrizione || '').toLowerCase().includes(s)) return true
      const codeNorm = (c.codice || '').replace(/\s+/g, '')
      const searchNorm = s.replace(/[.\s]+/g, '')
      return codeNorm.startsWith(searchNorm)
    })
    .slice(0, 80)

  const handleSave = async () => {
    if (!doc) return
    setSaving(true)
    try {
      const d0 = parseDati(doc.dati_estratti)
      const nextDati = {
        ...d0,
        ...(dataReg ? { data_registrazione: dataReg } : {}),
        ...(tipoPag ? { tipo_pagamento: tipoPag } : {}),
      }
      await sb
        .from('documenti_contabilita')
        .update({
          conto_id: contoId || null,
          causale_iva: causaleIva || null,
          dati_estratti: nextDati,
        })
        .eq('id', doc.id)
      const prevConto = String(doc.conto_id ?? '')
      const nextConto = String(contoId ?? '')
      if (prevConto !== nextConto && nextConto !== '') {
        setLearningRuleModal({ documentId: doc.id, contoId: contoId || null })
      }
      await onSave?.({
        id: doc.id,
        conto_id: contoId || null,
        causale_iva: causaleIva || null,
        dati_estratti: nextDati,
      })
    } finally {
      setSaving(false)
    }
  }

  const reliability = useMemo(() => evaluateDraftReliability({ doc }), [doc])
  const insightRows = useMemo(() => {
    if (!Array.isArray(ivaInsights)) return []
    const seen = new Set()
    const out = []
    for (const ins of ivaInsights) {
      const key = ins.fingerprint || ins.titolo || ins.descrizione
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(ins)
    }
    return out
  }, [ivaInsights])
  const insightRowsLimited = useMemo(() => insightRows.slice(0, 3), [insightRows])
  const insightExtraCount = insightRows.length > insightRowsLimited.length ? (insightRows.length - insightRowsLimited.length) : 0
  const learnFq = learningFrequenzaFromMeta(entryMeta)
  const showLearningInsight = isAiLearningSource(entryMeta)

  const hl = copilotHighlight && typeof copilotHighlight === 'object' ? copilotHighlight : null
  const contoCodHl =
    hl?.contoCodes?.length > 0 &&
    selectedConto &&
    hl.contoCodes.some((c) => normContoCode(c) === normContoCode(selectedConto.codice))

  if (!doc) {
    return (
      <div className="split-pane" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="split-pane-header">
          <span style={{ fontWeight: 600 }}>Scrittura</span>
        </div>
        <div className="split-pane-content" style={{ color: 'var(--mu)' }}>
          Seleziona un documento dalla lista.
        </div>
      </div>
    )
  }

  return (
    <div className="split-pane" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="split-pane-header" style={{ flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: '.85rem' }}>Registrazione</span>
        <span className={'bdg status-' + doc.validation_status}>
          {doc.validation_status === 'pending' ? 'In attesa' : doc.validation_status === 'confirmed' ? 'Confermato' : 'Errore'}
        </span>
      </div>
      <div className="split-pane-content" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {showLearningInsight && (
          <div
            style={{
              marginBottom: '.55rem',
              padding: '.45rem .55rem',
              borderRadius: 8,
              fontSize: '.7rem',
              lineHeight: 1.35,
              border: '1px solid rgba(76, 175, 80, .45)',
              background: 'rgba(46, 125, 50, .12)',
              color: '#c8e6c9',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '.15rem' }}>Learned from your past corrections</div>
            <div style={{ opacity: 0.95 }}>{learnFq != null ? `Used ${learnFq} times` : 'Based on your usage history'}</div>
          </div>
        )}
        {autoValidateMode && (
          <div
            role="button"
            tabIndex={0}
            title={`${buildAutoValidateTooltip(entryMeta)}\n\nClic per fissare la spiegazione sotto l’elenco documenti.`}
            onClick={() => onTogglePinExplanation?.()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onTogglePinExplanation?.()
              }
            }}
            style={{
              marginBottom: '.65rem',
              padding: '.45rem .6rem',
              borderRadius: 8,
              fontSize: '.72rem',
              cursor: onTogglePinExplanation ? 'pointer' : 'help',
              ...confidenceBadgeStyle(entryMeta?.ai_confidence),
            }}
          >
            <strong>Auto-validazione</strong>
            {entryMeta?.ai_confidence != null && Number.isFinite(Number(entryMeta.ai_confidence)) ? (
              <>
                {' '}
                · {Math.round(Number(entryMeta.ai_confidence))}% · {entryMeta.ai_source || '—'} · {entryMeta.ai_status || '—'}
              </>
            ) : (
              <span style={{ opacity: 0.85 }}> · nessun punteggio — usa &quot;Aggiorna punteggi&quot; o la pipeline</span>
            )}
          </div>
        )}
        <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '.75rem', marginBottom: '.75rem', fontSize: '.78rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem' }}>
            <div className={hl?.numeroDocumento ? 'copilot-highlight' : undefined} style={{ padding: 2, margin: -2, borderRadius: 6 }}>
              <span style={{ color: 'var(--mu)' }}>N°</span> <strong>{doc.numero_documento}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--mu)' }}>Data doc.</span> <strong>{fmtDate(doc.data_documento)}</strong>
            </div>
            <div
              className={hl?.soggetto || hl?.piva ? 'copilot-highlight' : undefined}
              style={{ gridColumn: '1 / -1', padding: 2, margin: -2, borderRadius: 6 }}
            >
              <span style={{ color: 'var(--mu)' }}>Soggetto</span> <strong>{doc.soggetto_denominazione}</strong>
            </div>
            <div
              className={hl?.totale || hl?.imponibile || hl?.iva ? 'copilot-highlight' : undefined}
              style={{ padding: 2, margin: -2, borderRadius: 6 }}
            >
              <span style={{ color: 'var(--mu)' }}>Totale</span> <strong style={{ color: 'var(--gld2)' }}>{fmt(doc.totale)}</strong>
            </div>
          </div>
        </div>
        {reliability && (
          <div style={{ marginBottom: '.75rem', fontSize: '.72rem', color: 'var(--mu)' }}>
            Affidabilita bozza: <strong>{reliabilityTierLabel(reliability.tier)}</strong> · {reliability.score}%
            {reliability.reasons?.length > 0 && (
              <div style={{ marginTop: '.2rem', color: 'var(--mu)' }}>
                Motivi: {reliability.reasons.slice(0, 2).map((r) => r.message).join('; ')}
              </div>
            )}
          </div>
        )}
        {(ivaInsightsLoading || insightRowsLimited.length > 0) && (
          <div style={{ marginBottom: '.75rem', display: 'grid', gap: '.4rem' }}>
            {ivaInsightsLoading && insightRowsLimited.length === 0 && (
              <div className="alert alert-info" style={{ margin: 0 }}>
                Analisi IVA in corso…
              </div>
            )}
            {insightRowsLimited.map((ins) => {
              const sev = String(ins.gravita || '').toLowerCase()
              const tipo = String(ins.tipo || '').toLowerCase()
              const isWarn = tipo === 'iva_anomaly'
                ? (sev === 'critical' || sev === 'warning' || sev === 'high' || sev === 'medium')
                : false
              return (
                <div key={ins.fingerprint || ins.titolo} className={`alert ${isWarn ? 'alert-warn' : 'alert-info'}`} style={{ margin: 0 }}>
                  <strong>{ins.titolo || 'Segnale IVA'}</strong>
                  <div style={{ fontSize: '.72rem', marginTop: '.2rem' }}>{ins.descrizione}</div>
                </div>
              )
            })}
            {insightExtraCount > 0 && (
              <div className="alert alert-info" style={{ margin: 0 }}>
                Altri {insightExtraCount} segnali IVA disponibili.
              </div>
            )}
          </div>
        )}

        <div className="fg" style={{ marginBottom: '.65rem' }}>
          <label>Data registrazione</label>
          <input type="date" value={dataReg || ''} onChange={(e) => setDataReg(e.target.value)} />
        </div>
        <div className="fg" style={{ marginBottom: '.65rem' }}>
          <label>Tipo pagamento</label>
          <input value={tipoPag} onChange={(e) => setTipoPag(e.target.value)} placeholder="es. MP05 Bonifico" />
        </div>

        <div
          className={`fg${contoCodHl ? ' copilot-highlight' : ''}`}
          style={{ marginBottom: '.65rem', position: 'relative', padding: contoCodHl ? '.35rem' : undefined, borderRadius: 8 }}
        >
          <label>Conto {doc.tipo_documento?.includes('attiva') ? 'Cliente' : 'Fornitore/Costo'}</label>
          <input
            placeholder="Cerca conto…"
            value={contoSearch || (selectedConto ? `${selectedConto.codice} — ${selectedConto.descrizione}` : '')}
            onChange={(e) => {
              setContoSearch(e.target.value)
              setShowDd(true)
              if (!e.target.value) setContoId('')
            }}
            onFocus={() => setShowDd(true)}
            style={{ width: '100%' }}
          />
          {showDd && contoSearch && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                background: 'var(--s1)',
                border: '1px solid var(--bd)',
                borderRadius: 8,
                maxHeight: 200,
                overflow: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,.25)',
              }}
            >
              {filteredConti.length === 0 ? (
                <div style={{ padding: '.5rem', fontSize: '.75rem', color: 'var(--mu)' }}>Nessun risultato</div>
              ) : (
                filteredConti.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setContoId(c.id)
                      setContoSearch('')
                      setShowDd(false)
                    }}
                    style={{ padding: '.4rem .6rem', cursor: 'pointer', fontSize: '.75rem', borderBottom: '1px solid var(--s2)' }}
                  >
                    <code style={{ color: 'var(--gold)', fontSize: '.65rem' }}>{c.codice}</code> {c.descrizione}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className={`fg${hl?.causaleIva ? ' copilot-highlight' : ''}`} style={{ marginBottom: '.75rem', padding: hl?.causaleIva ? '.35rem' : undefined, borderRadius: 8 }}>
          <label>Causale IVA</label>
          <select value={causaleIva} onChange={(e) => setCausaleIva(e.target.value)}>
            <option value="">Seleziona…</option>
            {causaliIva.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codice} — {c.descrizione} ({c.aliquota}%)
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
          <button type="button" className="btn" disabled={saving} onClick={handleSave}>
            {saving ? '…' : 'Salva bozza'}
          </button>
          <button type="button" className="btn-sec" onClick={() => onOpenGuidata?.(doc, listIds, idxInList)}>
            Scheda completa (guidata)
          </button>
        </div>
      </div>

      {learningRuleModal && (
        <div
          className="overlay"
          style={{ zIndex: 200 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !learningRuleBusy) setLearningRuleModal(null)
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '90%' }}>
            <div className="modal-hdr">
              <div className="modal-title">Learning rule</div>
              <button type="button" className="modal-close" disabled={learningRuleBusy} onClick={() => setLearningRuleModal(null)}>
                ?
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: '.85rem', lineHeight: 1.45 }}>
              <p style={{ margin: '0 0 1rem' }}>Apply this rule in future?</p>
              <p style={{ margin: '0 0 1rem', fontSize: '.78rem', color: 'var(--mu)' }}>
                Saving records this account choice for the supplier profile and improves future suggestions. Ignore leaves the document saved without updating learning.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-sec" disabled={learningRuleBusy} onClick={() => setLearningRuleModal(null)}>
                  Ignore
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={learningRuleBusy}
                  onClick={async () => {
                    const m = learningRuleModal
                    if (!m?.documentId) return
                    setLearningRuleBusy(true)
                    try {
                      const res = await fetch('/api/accounting/feedback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ documentId: m.documentId, finalContoId: m.contoId }),
                      })
                      if (!res.ok) {
                        const j = await res.json().catch(() => ({}))
                        console.warn('[DaValidare] learning feedback', j.error || res.statusText)
                      }
                      await onRefreshEntryMeta?.(m.documentId)
                    } catch (e) {
                      console.warn('[DaValidare] learning feedback', e)
                    } finally {
                      setLearningRuleBusy(false)
                      setLearningRuleModal(null)
                    }
                  }}
                >
                  {learningRuleBusy ? '…' : 'Save rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function DaValidareSplitView({
  documenti,
  pianoConti,
  causaliIva,
  societaId,
  stats,
  onRefresh,
  onEdit,
  patchDocumento,
  confermaDoc,
  registraConfermati,
  registrazioneInCorso = false,
}) {
  const [filtroStato, setFiltroStato] = useState('tutti')
  const [filtroFornitore, setFiltroFornitore] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [focusedId, setFocusedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const lastAnchorRef = useRef(-1)

  const [bulkDataReg, setBulkDataReg] = useState('')
  const [bulkTipoPag, setBulkTipoPag] = useState('')
  const [bulkContoId, setBulkContoId] = useState('')
  const [bulkCausaleIva, setBulkCausaleIva] = useState('')
  const [bulkApprove, setBulkApprove] = useState(false)
  const [bulkRegister, setBulkRegister] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRows, setPreviewRows] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [pendingFlags, setPendingFlags] = useState(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [detailMode, setDetailMode] = useState('form')

  const [autoValidateMode, setAutoValidateMode] = useState(false)
  const [entryMetaByDocId, setEntryMetaByDocId] = useState({})
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [pinnedExplanation, setPinnedExplanation] = useState(null)
  const [focusedOnlyEntryMeta, setFocusedOnlyEntryMeta] = useState(null)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [copilotHighlights, setCopilotHighlights] = useState(null)
  const sendCopilotPromptRef = useRef(null)
  const [insightToPromptOnOpen, setInsightToPromptOnOpen] = useState(null)
  const requestAutoSelectHighRef = useRef(false)
  const [ivaInsightsByDocId, setIvaInsightsByDocId] = useState({})
  const [ivaInsightsLoading, setIvaInsightsLoading] = useState(false)

  const handleInsightFixNow = useCallback(
    (insight) => {
      const ref = insight?.entity_ref || {}
      const docId = ref.document_id
      if (docId) {
        const doc = documenti.find((d) => d.id === docId)
        const listIds = documenti.map((d) => d.id)
        const idx = listIds.indexOf(docId)
        if (doc && idx >= 0) {
          onEdit?.(doc, listIds, idx)
          return
        }
      }
      setInsightToPromptOnOpen(insight)
      setCopilotOpen(true)
    },
    [documenti, onEdit]
  )

  useEffect(() => {
    if (!copilotOpen || !insightToPromptOnOpen) return
    const ins = insightToPromptOnOpen
    setInsightToPromptOnOpen(null)
    const text = buildCopilotFixPromptFromInsight(ins)
    if (sendCopilotPromptRef.current) {
      sendCopilotPromptRef.current(text)
      return
    }
    const t = window.setTimeout(() => sendCopilotPromptRef.current?.(text), 120)
    return () => clearTimeout(t)
  }, [copilotOpen, insightToPromptOnOpen])

  useEffect(() => {
    setCopilotHighlights(null)
  }, [focusedId])

  useEffect(() => {
    let alive = true
    if (!societaId) return () => { alive = false }
    setIvaInsightsLoading(true)
    loadIvaInsightsForSocieta(societaId)
      .then((res) => {
        if (!alive) return
        setIvaInsightsByDocId(res.byDocId || {})
      })
      .finally(() => {
        if (alive) setIvaInsightsLoading(false)
      })
    return () => { alive = false }
  }, [societaId])

  useEffect(() => {
    if (!autoValidateMode) setPinnedExplanation(null)
  }, [autoValidateMode])

  const togglePinExplanationForDoc = useCallback((docId, meta) => {
    const text = String(meta?.ai_explanation || '').trim() || buildAutoValidateTooltip(meta)
    setPinnedExplanation((p) => (p?.docId === docId ? null : { docId, text }))
  }, [])

  const filtered = useMemo(() => {
    return documenti.filter((d) => {
      if (filtroStato !== 'tutti' && d.validation_status !== filtroStato) return false
      if (filtroFornitore && d.soggetto_piva !== filtroFornitore) return false
      if (searchTerm) {
        const s = searchTerm.toLowerCase()
        if (
          !(d.soggetto_denominazione || '').toLowerCase().includes(s) &&
          !(d.numero_documento || '').toLowerCase().includes(s)
        )
          return false
      }
      return true
    })
  }, [documenti, filtroStato, filtroFornitore, searchTerm])

  const listIds = useMemo(() => filtered.map((d) => d.id), [filtered])
  const filteredIdsKey = useMemo(() => filtered.map((d) => d.id).join(','), [filtered])

  const loadAccountingEntryMeta = useCallback(async (docIds, opts = {}) => {
    const merge = opts.merge === true
    if (!docIds?.length) {
      if (!merge) setEntryMetaByDocId({})
      return
    }
    setEntriesLoading(true)
    let merged = {}
    try {
      const chunkSize = 60
      const all = []
      for (let i = 0; i < docIds.length; i += chunkSize) {
        const part = docIds.slice(i, i + chunkSize)
        const { data, error } = await sb
          .from('accounting_entries')
          .select('id, document_id, ai_confidence, ai_status, ai_source, ai_explanation, auto_validate_meta, created_at')
          .in('document_id', part)
        if (error) {
          console.warn('[DaValidare] accounting_entries', error.message)
          continue
        }
        all.push(...(data || []))
      }
      merged = latestEntryByDocumentId(all)
      if (merge) {
        setEntryMetaByDocId((prev) => ({ ...prev, ...merged }))
      } else {
        setEntryMetaByDocId(merged)
      }
    } finally {
      setEntriesLoading(false)
    }
    if (Object.keys(merged).length === 0 && requestAutoSelectHighRef.current && !merge) {
      requestAutoSelectHighRef.current = false
    }
  }, [])

  const fetchEntryMetaForSingleDoc = useCallback(async (docId) => {
    if (!docId) return null
    const { data, error } = await sb
      .from('accounting_entries')
      .select('id, document_id, ai_confidence, ai_status, ai_source, ai_explanation, auto_validate_meta, created_at')
      .eq('document_id', docId)
      .order('created_at', { ascending: false })
      .limit(8)
    if (error) {
      console.warn('[DaValidare] accounting_entries single', error.message)
      return null
    }
    const map = latestEntryByDocumentId(data || [])
    return map[docId] || null
  }, [])

  const refreshEntryMetaForDocument = useCallback(
    async (docId) => {
      if (!docId) return
      await loadAccountingEntryMeta([docId], { merge: true })
      const row = await fetchEntryMetaForSingleDoc(docId)
      setFocusedOnlyEntryMeta((prev) => {
        if (autoValidateMode) return null
        return row && String(row.document_id) === String(docId) ? row : prev
      })
    },
    [loadAccountingEntryMeta, fetchEntryMetaForSingleDoc, autoValidateMode]
  )

  useEffect(() => {
    let cancelled = false
    if (autoValidateMode) {
      setFocusedOnlyEntryMeta(null)
      return () => {
        cancelled = true
      }
    }
    if (!focusedId) {
      setFocusedOnlyEntryMeta(null)
      return () => {
        cancelled = true
      }
    }
    void fetchEntryMetaForSingleDoc(focusedId).then((row) => {
      if (!cancelled) setFocusedOnlyEntryMeta(row)
    })
    return () => {
      cancelled = true
    }
  }, [autoValidateMode, focusedId, fetchEntryMetaForSingleDoc])

  useEffect(() => {
    if (!autoValidateMode) {
      setEntryMetaByDocId({})
      return
    }
    const ids = filtered.map((d) => d.id)
    void loadAccountingEntryMeta(ids)
  }, [autoValidateMode, filteredIdsKey, loadAccountingEntryMeta])

  useEffect(() => {
    if (!autoValidateMode || !requestAutoSelectHighRef.current) return
    if (!Object.keys(entryMetaByDocId).length) return
    requestAutoSelectHighRef.current = false
    const high = filtered
      .filter((d) => {
        const c = entryMetaByDocId[d.id]?.ai_confidence
        return c != null && Number(c) > 90 && d.validation_status === 'pending'
      })
      .map((d) => d.id)
    if (high.length) setSelectedIds((prev) => [...new Set([...prev, ...high])])
  }, [autoValidateMode, entryMetaByDocId, filtered])

  const toggleAutoValidateMode = useCallback(() => {
    setAutoValidateMode((prev) => {
      const next = !prev
      if (next) requestAutoSelectHighRef.current = true
      else requestAutoSelectHighRef.current = false
      return next
    })
  }, [])

  const refreshAutoValidateScores = useCallback(async () => {
    const ids = filtered.map((d) => d.id)
    if (!ids.length) return
    setEntriesLoading(true)
    try {
      const res = await fetch('/api/accounting/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_validate', documentIds: ids }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) console.warn('[DaValidare] auto-validate API', j.error || res.statusText)
      await loadAccountingEntryMeta(ids)
    } catch (e) {
      console.warn('[DaValidare] refreshAutoValidateScores', e)
      await loadAccountingEntryMeta(ids)
    } finally {
      setEntriesLoading(false)
    }
  }, [filtered, loadAccountingEntryMeta])

  const getConfidence = useCallback(
    (docId) => {
      const row = entryMetaByDocId[docId]
      if (row?.ai_confidence == null) return null
      return Number(row.ai_confidence)
    },
    [entryMetaByDocId]
  )

  const approveDocumentsByIds = useCallback(
    async (ids) => {
      if (!ids?.length) return
      const now = new Date().toISOString()
      const { error } = await sb
        .from('documenti_contabilita')
        .update({ validation_status: 'confirmed', validated_at: now })
        .in('id', ids)
      if (error) {
        alert(error.message || String(error))
        return
      }
      ids.forEach((id) => patchDocumento?.(id, { validation_status: 'confirmed', validated_at: now }))
      void fetch('/api/accounting/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'feedback_batch', documentIds: ids }),
      }).catch(() => {})
      await onRefresh?.()
    },
    [onRefresh, patchDocumento]
  )

  const handleApproveAllHighConfidence = useCallback(() => {
    const ids = filtered
      .filter((d) => {
        if (d.validation_status !== 'pending') return false
        const c = getConfidence(d.id)
        return c != null && c > 90
      })
      .map((d) => d.id)
    if (!ids.length) {
      alert('Nessun documento in attesa con punteggio > 90%.')
      return
    }
    if (!confirm(`Confermare ${ids.length} documenti con punteggio > 90%?`)) return
    void approveDocumentsByIds(ids)
  }, [filtered, getConfidence, approveDocumentsByIds])

  const handleApproveAllFilteredPending = useCallback(() => {
    const ids = filtered.filter((d) => d.validation_status === 'pending').map((d) => d.id)
    if (!ids.length) {
      alert('Nessun documento in attesa nella lista filtrata.')
      return
    }
    if (!confirm(`Confermare ${ids.length} documenti in attesa?`)) return
    void approveDocumentsByIds(ids)
  }, [filtered, approveDocumentsByIds])

  const handleSelectLowConfidenceOnly = useCallback(() => {
    const ids = filtered
      .filter((d) => {
        if (d.validation_status !== 'pending') return false
        const c = getConfidence(d.id)
        return c == null || c < 70
      })
      .map((d) => d.id)
    setSelectedIds(ids)
    if (!ids.length) alert('Nessun documento in attesa con punteggio sotto 70% (o senza dato).')
  }, [filtered, getConfidence])

  useEffect(() => {
    if (!filtered.length) {
      setFocusedId(null)
      return
    }
    if (!focusedId || !filtered.some((d) => d.id === focusedId)) {
      setFocusedId(filtered[0].id)
    }
  }, [filtered, focusedId])

  const focusedDoc = useMemo(() => filtered.find((d) => d.id === focusedId) || null, [filtered, focusedId])
  useEffect(() => {
    if (!focusedDoc) setDetailPanelOpen(false)
  }, [focusedDoc])
  const copilotContextDoc = useMemo(() => focusedDoc || filtered[0] || null, [focusedDoc, filtered])
  const copilotDocumentIdForApi = copilotContextDoc?.id || null
  const focusedEntryMetaDisplay = useMemo(() => {
    if (!focusedDoc) return null
    return entryMetaByDocId[focusedDoc.id] ?? focusedOnlyEntryMeta
  }, [focusedDoc, entryMetaByDocId, focusedOnlyEntryMeta])
  const xmlPreview = useXmlPreview(focusedDoc)
  const idxInList = focusedDoc ? listIds.indexOf(focusedDoc.id) : -1

  const fornitori = [...new Set(documenti.map((d) => d.soggetto_piva).filter(Boolean))]

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const selectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const all = filtered.map((d) => d.id)
      const allSelected = all.length > 0 && all.every((id) => prev.includes(id))
      return allSelected ? prev.filter((id) => !all.includes(id)) : [...new Set([...prev, ...all])]
    })
  }, [filtered])

  const handleRowClick = useCallback(
    (e, d, index) => {
      if (e.target.closest('input[type="checkbox"]')) return
      const isMac = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (e.shiftKey && lastAnchorRef.current >= 0) {
        const a = Math.min(lastAnchorRef.current, index)
        const b = Math.max(lastAnchorRef.current, index)
        const range = filtered.slice(a, b + 1).map((x) => x.id)
        setSelectedIds((prev) => [...new Set([...prev, ...range])])
      } else if (mod) {
        toggleSelected(d.id)
        lastAnchorRef.current = index
      } else {
        setFocusedId(d.id)
        setDetailPanelOpen(true)
        setDetailMode('form')
        lastAnchorRef.current = index
      }
    },
    [filtered, toggleSelected]
  )

  const selectSameAnagrafica = useCallback(() => {
    if (!focusedDoc?.soggetto_piva) return
    const ids = filtered.filter((d) => d.soggetto_piva === focusedDoc.soggetto_piva).map((d) => d.id)
    setSelectedIds((prev) => [...new Set([...prev, ...ids])])
  }, [filtered, focusedDoc])

  const selectSameAiConto = useCallback(() => {
    const cid = focusedDoc?.conto_id
    if (!cid) {
      const ids = filtered.filter((d) => !d.conto_id).map((d) => d.id)
      setSelectedIds((prev) => [...new Set([...prev, ...ids])])
      return
    }
    const ids = filtered.filter((d) => d.conto_id === cid).map((d) => d.id)
    setSelectedIds((prev) => [...new Set([...prev, ...ids])])
  }, [filtered, focusedDoc])

  const buildBulkBody = useCallback(
    (preview, flags) => {
      const updates = {}
      if (bulkContoId) updates.conto_id = bulkContoId
      if (bulkDataReg) updates.data_registrazione = bulkDataReg
      if (bulkTipoPag) updates.tipo_pagamento = bulkTipoPag
      if (bulkCausaleIva) updates.causale_iva = bulkCausaleIva
      const reg = flags?.approveAndRegister ?? bulkRegister
      const appr = flags?.approve ?? bulkApprove
      return {
        societaId,
        documentIds: selectedIds,
        preview,
        updates,
        approve: appr || reg,
        approveAndRegister: reg,
      }
    },
    [societaId, selectedIds, bulkContoId, bulkDataReg, bulkTipoPag, bulkCausaleIva, bulkApprove, bulkRegister]
  )

  const runBulkPreview = async (flags) => {
    if (!selectedIds.length) {
      alert('Seleziona almeno un documento.')
      return
    }
    setBulkLoading(true)
    try {
      const res = await fetch('/prima-nota/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBulkBody(true, flags)),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || res.statusText)
      setPreviewRows(j.preview || [])
      setPendingFlags(flags || null)
      setPreviewOpen(true)
    } catch (err) {
      alert(err?.message || String(err))
    } finally {
      setBulkLoading(false)
    }
  }

  const runBulkApply = async () => {
    setBulkLoading(true)
    try {
      const res = await fetch('/prima-nota/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBulkBody(false, pendingFlags || undefined)),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || res.statusText)
      setPreviewOpen(false)
      setPendingFlags(null)
      setSelectedIds([])
      await onRefresh?.()
      const n = j.results?.filter((r) => r.ok).length
      alert(j.results ? `Operazione completata: ${n}/${j.results.length} documenti.` : 'Completato.')
    } catch (err) {
      alert(err?.message || String(err))
    } finally {
      setBulkLoading(false)
    }
  }

  const onSingleSave = async (partial) => {
    patchDocumento?.(partial.id, {
      conto_id: partial.conto_id,
      causale_iva: partial.causale_iva,
      dati_estratti: partial.dati_estratti,
    })
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((d) => selectedIds.includes(d.id))

  return (
    <div className="erp-view erp-table-dominant" style={{ flex: 1, minHeight: 0 }}>
      <div className="erp-filter-card erp-filter-card-compact">
        <div className="erp-filter-zones">
        <div className="erp-filter-zone erp-filter-zone-main">
          <div className="fg erp-search-field" style={{ flex: 1, minWidth: 280, marginBottom: 0 }}>
            <input placeholder="Cerca numero documento o soggetto" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="fg" style={{ minWidth: 220, marginBottom: 0 }}>
            <select value={filtroFornitore} onChange={(e) => setFiltroFornitore(e.target.value)}>
              <option value="">Tutti i soggetti</option>
              {fornitori.map((p) => (
                <option key={p} value={p}>
                  {documenti.find((d) => d.soggetto_piva === p)?.soggetto_denominazione || p}
                </option>
              ))}
            </select>
          </div>
          <div className="cont-toolbar-summary">
            <span className="cont-toolbar-pill"><strong>{filtered.length}</strong> documenti</span>
            {selectedIds.length > 0 && <span className="cont-toolbar-pill"><strong>{selectedIds.length}</strong> selezionati</span>}
          </div>
        </div>

        <div className="erp-filter-zone erp-filter-zone-states-actions">
          <div className="erp-status-tabs erp-status-segmented">
            {[
              ['tutti', filtered.length, 'Tutti'],
              ['pending', stats.daValidare, 'In attesa'],
              ['confirmed', stats.confermati, 'Confermati'],
              ['error', stats.errori, 'Da rivedere'],
            ].map(([value, count, label]) => (
              <button
                type="button"
                key={value}
                className={'erp-status-tab' + (filtroStato === value ? ' active' : '')}
                onClick={() => setFiltroStato(value)}
              >
                <span>{label}</span>
                <span className="erp-status-count">{count}</span>
              </button>
            ))}
          </div>
          <div className="erp-toolbar-group erp-toolbar-group-actions erp-toolbar-group-actions-end">
            <button type="button" className="btn-sec btn-sm" onClick={selectSameAnagrafica}>Stessa anagrafica</button>
            <button type="button" className="btn-sec btn-sm" onClick={selectSameAiConto}>Stesso conto AI</button>
            {autoValidateMode && (
              <>
                <button type="button" className="btn-sec btn-sm" disabled={entriesLoading} onClick={() => void refreshAutoValidateScores()}>
                  {entriesLoading ? '...' : 'Aggiorna punteggi'}
                </button>
                <button type="button" className="btn-sec btn-sm" onClick={handleApproveAllHighConfidence}>Approva &gt;90%</button>
                <button type="button" className="btn-sec btn-sm" onClick={handleApproveAllFilteredPending}>Approva lista</button>
              </>
            )}
            <label className={'erp-inline-toggle' + (autoValidateMode ? ' active' : '')}>
              <input type="checkbox" checked={autoValidateMode} onChange={toggleAutoValidateMode} />
              <span>Auto Validate</span>
            </label>
            <button type="button" className={copilotOpen ? 'btn' : 'btn-sec'} onClick={() => setCopilotOpen((v) => !v)}>
              {copilotOpen ? 'Chiudi Copilot' : 'Copilot contabile'}
            </button>
          </div>
        </div>
        </div>
      </div>

      {selectedIds.length >= 1 && (
        <div className="erp-bulkbar">
          <strong style={{ fontSize: '.78rem' }}>Selezione: {selectedIds.length}</strong>
          <input type="date" value={bulkDataReg} onChange={(e) => setBulkDataReg(e.target.value)} style={{ fontSize: '.72rem' }} />
          <select value={bulkContoId} onChange={(e) => setBulkContoId(e.target.value)} style={{ fontSize: '.72rem', maxWidth: 220 }}>
            <option value="">Conto (nessun cambio)</option>
            {pianoConti
              .filter((c) => c.livello >= 3)
              .slice(0, 400)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codice} - {c.descrizione}
                </option>
              ))}
          </select>
          <input placeholder="Tipo pagamento" value={bulkTipoPag} onChange={(e) => setBulkTipoPag(e.target.value)} style={{ fontSize: '.72rem', width: 140 }} />
          <select value={bulkCausaleIva} onChange={(e) => setBulkCausaleIva(e.target.value)} style={{ fontSize: '.72rem', maxWidth: 180 }}>
            <option value="">Causale IVA (nessun cambio)</option>
            {causaliIva.map((c) => (
              <option key={c.id} value={c.id}>{c.codice}</option>
            ))}
          </select>
          <label style={{ fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: '.25rem' }}>
            <input type="checkbox" checked={bulkApprove} onChange={(e) => setBulkApprove(e.target.checked)} />
            Approva
          </label>
          <label style={{ fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: '.25rem' }}>
            <input type="checkbox" checked={bulkRegister} onChange={(e) => setBulkRegister(e.target.checked)} />
            Contabilizza
          </label>
          <button type="button" className="btn-sec" disabled={bulkLoading} onClick={() => { setBulkApprove(true); setBulkRegister(false); void runBulkPreview({ approve: true, approveAndRegister: false }) }}>
            Anteprima approva
          </button>
          <button type="button" className="btn-sec" disabled={bulkLoading} onClick={() => { setBulkApprove(true); setBulkRegister(true); void runBulkPreview({ approve: true, approveAndRegister: true }) }}>
            Anteprima approva + contabilizza
          </button>
          <button type="button" className="btn-sec" disabled={bulkLoading} onClick={() => runBulkPreview()}>
            Anteprima (caselle)
          </button>
          <button type="button" className="btn" disabled={bulkLoading} onClick={() => setSelectedIds([])}>
            Deseleziona
          </button>
          <button
            type="button"
            className="btn-sec"
            style={{ borderColor: 'rgba(224,82,82,.35)', color: '#ff8585' }}
            disabled={bulkLoading}
            onClick={async () => {
              if (!confirm(`Eliminare ${selectedIds.length} documenti selezionati?`)) return
              for (const id of selectedIds) {
                await contabilitaRepo.deleteDocumentoContabilita(id)
              }
              setSelectedIds([])
              await onRefresh?.()
            }}
          >
            Elimina selezionati
          </button>
        </div>
      )}

      {autoValidateMode && (
        <div className="erp-inline-note">
          Verde &gt;90%, giallo 70-90%, rosso &lt;70%. Passa sul punteggio o clicca per fissare il motivo sotto l'elenco.
          <button type="button" className="btn-sec btn-sm" onClick={handleSelectLowConfidenceOnly}>Solo bassa confidenza</button>
        </div>
      )}

      <div className="erp-dominant-main">
        <div className="erp-table-shell table-dominant erp-data-card" style={{ flex: 1, minHeight: 0 }}>
            <div className="erp-table-head">
              <div>
                <div className="erp-table-title">Documenti da validare</div>
                <div className="erp-table-meta">Elenco operativo per conferma, revisione e contabilizzazione.</div>
              </div>
              <div className="erp-table-tools">
                <span className="cont-toolbar-pill"><strong>{filtered.length}</strong> righe</span>
                {selectedIds.length > 0 && <span className="cont-toolbar-pill"><strong>{selectedIds.length}</strong> selezionati</span>}
              </div>
            </div>
            {autoValidateMode && pinnedExplanation && (
              <div style={{ padding: '.55rem .75rem', borderBottom: '1px solid var(--bd)', background: 'rgba(200,164,94,.06)', fontSize: '.72rem', lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--gold)' }}>Motivo</strong> {pinnedExplanation.text}
              </div>
            )}
            <div className="erp-table-body">
              {filtered.length === 0 ? (
                <div className="empty" style={{ padding: '1rem' }}>
                  <div className="empty-t">Nessun documento</div>
                </div>
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl" style={{ fontSize: '.74rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}></th>
                        <th>Stato</th>
                        {autoValidateMode && <th style={{ width: 76 }}>AI %</th>}
                        <th>N° documento</th>
                        <th>Data</th>
                        <th>Soggetto</th>
                        <th style={{ textAlign: 'right' }}>Imponibile</th>
                        <th style={{ textAlign: 'right' }}>IVA</th>
                        <th style={{ textAlign: 'right' }}>Totale</th>
                        <th>Conto</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((d, i) => {
                        const rh = focusedId === d.id ? copilotHighlights : null
                        const pcRow = pianoConti.find((c) => c.id === d.conto_id)
                        const { imponibile, iva } = getDocImponibileIva(d)
                        const contoCellHl =
                          rh?.contoCodes?.length > 0 &&
                          pcRow &&
                          rh.contoCodes.some((c) => normContoCode(c) === normContoCode(pcRow.codice))
                        return (
                          <tr
                            key={d.id}
                            onClick={(e) => handleRowClick(e, d, i)}
                            className={[
                              'tbl-row-clickable',
                              focusedId === d.id ? ' is-focused' : '',
                              selectedIds.includes(d.id) ? ' is-selected' : '',
                            ].join(' ')}
                            style={{ cursor: 'pointer' }}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => toggleSelected(d.id)} />
                            </td>
                            <td>
                              <span className={'bdg status-' + d.validation_status}>
                                {d.validation_status === 'pending' ? 'In attesa' : d.validation_status === 'confirmed' ? 'Confermato' : 'Errore'}
                              </span>
                            </td>
                            {autoValidateMode && (
                              <td onClick={(e) => e.stopPropagation()}>
                                {(() => {
                                  const meta = entryMetaByDocId[d.id]
                                  const c = meta?.ai_confidence
                                  const label = c != null && Number.isFinite(Number(c)) ? `${Math.round(Number(c))}%` : '—'
                                  const tip = `${buildAutoValidateTooltip(meta)}\n\nClic per fissare sotto l'elenco.`
                                  const learnRow = isAiLearningSource(meta)
                                  const learnFqRow = learningFrequenzaFromMeta(meta)
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        title={tip}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          togglePinExplanationForDoc(d.id, meta)
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            togglePinExplanationForDoc(d.id, meta)
                                          }
                                        }}
                                        style={{
                                          display: 'inline-block',
                                          minWidth: 40,
                                          textAlign: 'center',
                                          padding: '.12rem .35rem',
                                          borderRadius: 6,
                                          fontSize: '.68rem',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          ...confidenceBadgeStyle(c),
                                        }}
                                      >
                                        {label}
                                      </span>
                                      {learnRow && (
                                        <span style={{ fontSize: '.58rem', color: 'var(--mu)', lineHeight: 1.15, textAlign: 'center', maxWidth: 72 }} title="Learned from your past corrections">
                                          {learnFqRow != null ? `Used ${learnFqRow}x` : 'Learning'}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })()}
                              </td>
                            )}
                            <td className={rh?.numeroDocumento ? 'copilot-highlight' : undefined} style={{ fontWeight: 600, padding: rh?.numeroDocumento ? 6 : undefined }}>
                              {d.numero_documento || '—'}
                            </td>
                            <td>{fmtDate(d.data_documento)}</td>
                            <td className={rh?.soggetto || rh?.piva ? 'copilot-highlight' : undefined} style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', padding: rh?.soggetto || rh?.piva ? 6 : undefined }}>
                              {d.soggetto_denominazione}
                            </td>
                            <td className={(rh?.imponibile ? 'copilot-highlight ' : '') + 'tbl-num'} style={{ fontVariantNumeric: 'tabular-nums', padding: rh?.imponibile ? 6 : undefined }}>
                              {fmt(imponibile)}
                            </td>
                            <td className={(rh?.iva ? 'copilot-highlight ' : '') + 'tbl-num'} style={{ fontVariantNumeric: 'tabular-nums', padding: rh?.iva ? 6 : undefined }}>
                              {fmt(iva)}
                            </td>
                            <td className={(rh?.totale ? 'copilot-highlight ' : '') + 'tbl-num'} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, padding: rh?.totale ? 6 : undefined }}>
                              {fmt(d.totale)}
                            </td>
                            <td className={contoCellHl ? 'copilot-highlight' : undefined} style={{ color: 'var(--mu)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', padding: contoCellHl ? 6 : undefined }}>
                              {pianoConti.find((c) => c.id === d.conto_id)?.descrizione || '—'}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {d.validation_status === 'pending' && (
                                <button type="button" className="btn-icon" title="Conferma" onClick={() => confermaDoc?.(d.id)}>
                                  ✓
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
      </div>

      {detailPanelOpen && focusedDoc && (
        <div className="overlay" style={{ zIndex: 120 }} onMouseDown={(e) => {
          if (e.target === e.currentTarget) setDetailPanelOpen(false)
        }}>
          <div className="modal erp-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">Documento selezionato</div>
              <div className="modal-sub">{focusedDoc.numero_documento || 'Documento'} · {focusedDoc.soggetto_denominazione || 'Soggetto'}</div>
              <button type="button" className="modal-close" onClick={() => setDetailPanelOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body erp-detail-modal-body">
              <div className="erp-detail-rail-tabs">
                <button type="button" className={'erp-inline-tab' + (detailMode === 'form' ? ' active' : '')} onClick={() => setDetailMode('form')}>
                  Registrazione
                </button>
                <button type="button" className={'erp-inline-tab' + (detailMode === 'preview' ? ' active' : '')} onClick={() => setDetailMode('preview')}>
                  Anteprima
                </button>
              </div>
              <div className="erp-detail-modal-content">
                {detailMode === 'preview' ? (
                  <PdfZoomPane doc={focusedDoc} xmlPreview={xmlPreview} />
                ) : (
                  <AccountingForm
                    doc={focusedDoc}
                    pianoConti={pianoConti}
                    causaliIva={causaliIva}
                    onSave={onSingleSave}
                    onOpenGuidata={onEdit}
                    listIds={listIds}
                    idxInList={idxInList}
                    autoValidateMode={autoValidateMode}
                    entryMeta={focusedEntryMetaDisplay}
                    onRefreshEntryMeta={refreshEntryMetaForDocument}
                    copilotHighlight={copilotHighlights}
                    ivaInsights={focusedDoc ? (ivaInsightsByDocId[String(focusedDoc.id)] || []) : []}
                    ivaInsightsLoading={ivaInsightsLoading}
                    onTogglePinExplanation={
                      focusedDoc && autoValidateMode
                        ? () => togglePinExplanationForDoc(focusedDoc.id, focusedEntryMetaDisplay)
                        : null
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {previewOpen && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setPreviewOpen(false)
              setPendingFlags(null)
            }
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: '92%', maxHeight: '85vh' }}>
            <div className="modal-hdr">
              <div className="modal-title">Anteprima modifiche massive</div>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setPreviewOpen(false)
                  setPendingFlags(null)
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={{ overflow: 'auto', maxHeight: '58vh' }}>
              <table className="tbl" style={{ fontSize: '.72rem' }}>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Prima</th>
                    <th>Dopo</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.filename}</td>
                      <td>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '.62rem' }}>
                          {JSON.stringify(row.before, null, 2)}
                        </pre>
                      </td>
                      <td>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '.62rem' }}>
                          {JSON.stringify(row.after, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn-sec"
                onClick={() => {
                  setPreviewOpen(false)
                  setPendingFlags(null)
                }}
              >
                Annulla
              </button>
              <button type="button" className="btn" disabled={bulkLoading} onClick={runBulkApply}>
                {bulkLoading ? '…' : 'Applica'}
              </button>
            </div>
          </div>
        </div>
      )}

      {copilotOpen && (
        <ContabileCopilotPanel
          layout="sidebar"
          documentId={focusedDoc?.id}
          copilotDocumentId={copilotDocumentIdForApi}
          societaId={societaId}
          accountingEntryId={focusedEntryMetaDisplay?.id || null}
          contextDoc={copilotContextDoc}
          pianoConti={pianoConti}
          causaliIva={causaliIva}
          docLabel={
            copilotContextDoc
              ? `${copilotContextDoc.numero_documento || '—'} · ${String(copilotContextDoc.soggetto_denominazione || '').slice(0, 42)}`
              : ''
          }
          onClose={() => setCopilotOpen(false)}
          onRefreshAutoValidate={() => void refreshAutoValidateScores()}
          onOpenGuidata={() => focusedDoc && onEdit?.(focusedDoc, listIds, idxInList)}
          onRefreshEntryMeta={refreshEntryMetaForDocument}
          onHighlightsChange={setCopilotHighlights}
          onRegisterSendPrompt={(fn) => {
            sendCopilotPromptRef.current = fn
          }}
          onInsightFixNow={handleInsightFixNow}
        />
      )}
    </div>
  )
}


