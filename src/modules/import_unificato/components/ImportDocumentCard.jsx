import { useEffect, useMemo, useState } from 'react'
import { suggestContiPerDocumento } from '../../../shared/utils/pianoContiSuggestions.js'
import { buildHistoricalContoSuggestions, extractHistoricalSearchIdentity } from '../../../shared/utils/historicalContoSuggestions.js'
import { pickContoFromAiAccountingRows } from '../../../utils/matchAiAccountingRowsToPianoConti.js'
import { buildOperatorAssistItems, appendOperatorClarification } from '../../../shared/utils/operatorAssist.js'
import * as importRepo from '../data/importRepo.js'
import * as contabilitaRepo from '../../contabilita/data/contabilitaRepo.js'
import { ImportPreviewPanel } from './ImportPreviewPanel.jsx'
import { evaluateDraftReliability, reliabilityTierLabel } from '../../../../domain/draftReliability.js'
import { OperatorAssistPanel } from '../../../shared/components/OperatorAssistPanel.jsx'
import { OperatorClarificationModal } from '../../../shared/components/OperatorClarificationModal.jsx'
import { DocumentPreviewModal } from '../../../shared/ui/DocumentPreviewModal.jsx'

export function ImportDocumentCard({
  doc,
  onConferma,
  onElimina,
  clienti,
  pianoConti,
  causaliIva,
  societaId,
  tipiDocumento,
  aliquoteIva,
  fmt,
}) {
  const [form, setForm] = useState(null)
  const [cercaConto, setCercaConto] = useState('')
  const [saving, setSaving] = useState(false)
  const [sourcePreviewOpen, setSourcePreviewOpen] = useState(false)
  const [historicalContoSuggestions, setHistoricalContoSuggestions] = useState([])
  const [historicalContoLoading, setHistoricalContoLoading] = useState(false)
  const [historicalLearningRows, setHistoricalLearningRows] = useState([])
  const [clarificationModalItem, setClarificationModalItem] = useState(null)

  const sanitizeRiepilogoIva = (riepilogo) => {
    if (!Array.isArray(riepilogo) || !Array.isArray(causaliIva) || causaliIva.length === 0) return riepilogo

    const pct = (v) => {
      if (v === null || v === undefined || v === '') return null
      const raw = String(v).trim().replace(/[%\s]/g, '').replace(',', '.')
      const n = parseFloat(raw)
      if (!Number.isFinite(n)) return null
      return Math.round(n)
    }

    return riepilogo.map((r) => {
      const id = r?.causale_iva_id != null ? String(r.causale_iva_id) : ''
      if (!id) return r
      const c = causaliIva.find((x) => String(x?.id) === id) || null
      if (!c) return { ...r, causale_iva_id: '' }

      const rowAliq = pct(r?.aliquota ?? r?.Aliquota)
      const causAliq = pct(c?.aliquota)
      // If row aliquota is known and the selected "causale" doesn't match it, this is a stale/broken state.
      // Resetting the id lets the UI pick the correct default by aliquota without changing amounts.
      if (rowAliq !== null && causAliq !== null && rowAliq !== causAliq) {
        return { ...r, causale_iva_id: '' }
      }
      return r
    })
  }

  useEffect(() => {
    if (!doc) return
    setClarificationModalItem(null)
    const d = doc.ai_raw_response || {}
    let causaleIvaDefault = ''
    if (causaliIva?.length && d.riepilogo_iva?.length > 0) {
      const aliqNum = Math.round(parseFloat(String(d.riepilogo_iva[0]?.aliquota || '0').replace(/[%\s]/g, '')))
      const nat = (d.riepilogo_iva[0]?.natura || '').toLowerCase()
      const isRC = nat.includes('n6') || nat.includes('n7') || nat.includes('rev')
      const codFS = aliqNum > 0 ? (isRC ? `F${aliqNum}RC` : `F${aliqNum}`) : 'F0FC'
      const globale = causaliIva.find((c) => !c.societa_id && c.codice === codFS)
      if (globale) causaleIvaDefault = globale.id
    }
    setForm({
      tipo_documento: doc.tipo_documento || d.tipo_documento || 'fattura_passiva',
      numero: d.numero || '',
      data: d.data || '',
      cedente_denom: d.cedente_denom || '',
      cedente_piva: d.cedente_piva || '',
      cedente_cf: d.cedente_cf || '',
      cessionario_denom: d.cessionario_denom || '',
      cessionario_piva: d.cessionario_piva || '',
      imponibile: d.imponibile ?? '',
      iva_totale: d.iva ?? '',
      totale: d.totale ?? '',
      riepilogo_iva: sanitizeRiepilogoIva(d.riepilogo_iva || []),
      causale: d.causale || '',
      causale_iva_id: causaleIvaDefault,
      conto_id: null,
      conto_search: '',
      operator_clarifications: Array.isArray(d.operator_clarifications) ? d.operator_clarifications : [],
      parcella_confirmation: d.parcella_confirmation ?? null,
      contribuente: d.contribuente || '',
      cf_f24: d.codice_fiscale || '',
      data_versamento: d.data_versamento || '',
      saldo_finale: d.saldo_finale ?? '',
      sezione_erario: d.sezione_erario || [],
      sezione_inps: d.sezione_inps || [],
      tipo_avviso: d.tipo_avviso || '',
      numero_atto: d.numero_atto || '',
      importo_avviso: d.importo ?? '',
      scadenza: d.data_scadenza || '',
      anno_imposta: d.anno_imposta || '',
      modello_dich: d.modello_dichiarativo || '',
      contenuto: d.contenuto || '',
      cliente_id: doc.cliente_id || null,
    })
  }, [doc, causaliIva])

  useEffect(() => {
    let alive = true
    if (!societaId) {
      setHistoricalLearningRows([])
      return () => {
        alive = false
      }
    }
    contabilitaRepo
      .getArchivioStoricoAiLearning([societaId], { limit: 5000 })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          console.warn('[Import] historical learning rows', error.message)
          setHistoricalLearningRows([])
          return
        }
        setHistoricalLearningRows(Array.isArray(data) ? data : [])
      })
      .catch((error) => {
        if (!alive) return
        console.warn('[Import] historical learning rows', error?.message || error)
        setHistoricalLearningRows([])
      })
    return () => {
      alive = false
    }
  }, [societaId])

  const historicalIdentity = useMemo(() => extractHistoricalSearchIdentity(doc), [doc?.id, doc?.soggetto_piva, doc?.soggetto_cf, doc?.soggetto_denominazione, doc?.dati_estratti, doc?.ai_raw_response])

  useEffect(() => {
    let alive = true
    const { piva, cf, nomeLike, nome } = historicalIdentity || {}
    if (!doc?.id || (!piva && !cf && !nomeLike)) {
      setHistoricalContoSuggestions([])
      return () => {
        alive = false
      }
    }
    setHistoricalContoLoading(true)
    importRepo
      .getHistoricalConfirmedDocumentsForCounterparty({
        piva,
        cf,
        nomeLike: nomeLike || nome,
        limit: 80,
      })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          console.warn('[Import] historical conto suggestions', error.message)
          setHistoricalContoSuggestions([])
          return
        }
        const label = piva
          ? `${(data || []).length} fatture confermate con stessa P.IVA`
          : cf
            ? `${(data || []).length} fatture confermate con stesso CF`
            : `${(data || []).length} documenti confermati con ragione sociale simile`
        setHistoricalContoSuggestions(
          buildHistoricalContoSuggestions({
            historicalDocs: data || [],
            learningRows: historicalLearningRows,
            pianoConti,
            maxResults: 3,
            sourceLabel: label,
            currentDoc: doc,
            currentSocietaId: societaId,
          })
        )
      })
      .finally(() => {
        if (alive) setHistoricalContoLoading(false)
      })
    return () => {
      alive = false
    }
  }, [doc?.id, historicalIdentity?.piva, historicalIdentity?.cf, historicalIdentity?.nomeLike, historicalLearningRows, pianoConti, societaId])

  useEffect(() => {
    return
    if (!doc?.id || !form?.tipo_documento || !pianoConti?.length) return
    let cancelled = false

    const applyAiAccounting = async () => {
      const { data, error } = await importRepo.getAccountingEntriesByDocumentId(doc.id)

      if (cancelled) return
      if (error) {
        console.warn('[Import] accounting_entries:', error.message)
        return
      }

      const preferred = (data || []).find((e) => e.status === 'AI_PROPOSED') || (data || [])[0]
      const payload = preferred?.data
      if (!payload || payload.source !== 'ai_accounting' || !Array.isArray(payload.rows)) return

      setForm((f) => {
        if (!f) return f
        if (f.conto_da_anagrafica && f.conto_id) return f
        const matched = pickContoFromAiAccountingRows(payload.rows, f.tipo_documento, pianoConti)
        if (!matched?.id) return f
        return {
          ...f,
          conto_id: matched.id,
          conto_search: `${matched.codice} — ${matched.descrizione || ''}`,
          conto_da_ai: true,
        }
      })
    }

    void applyAiAccounting()

    const onPipeline = (ev) => {
      const d = ev?.detail
      if (d?.documentId === doc.id && d?.phase === 'end' && d?.ok) void applyAiAccounting()
    }
    if (typeof window !== 'undefined') window.addEventListener('fiscosim:ai-pipeline', onPipeline)
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') window.removeEventListener('fiscosim:ai-pipeline', onPipeline)
    }
  }, [doc?.id, form?.tipo_documento, pianoConti])

  const contoSuggestions = useMemo(
    () => suggestContiPerDocumento({ doc, pianoConti, maxResults: 3 }),
    [
      doc?.id,
      doc?.tipo_documento,
      doc?.soggetto_denominazione,
      doc?.soggetto_piva,
      doc?.soggetto_cf,
      doc?.dati_estratti,
      pianoConti,
    ]
  )

  const reliability = useMemo(() => evaluateDraftReliability({ doc, form }), [doc, form])
  const engineSource = useMemo(() => {
    const metodo = String(doc?.ai_raw_response?.metodo || '').toLowerCase()
    if (metodo.includes('ollama') || metodo.includes('xml_deterministico') || metodo.includes('local')) return 'locale'
    if (metodo.includes('openai') || metodo.includes('online') || metodo.includes('gateway') || metodo.includes('api')) return 'online'
    return 'sconosciuto'
  }, [doc?.ai_raw_response?.metodo])
  const parcellaAssistRaw = useMemo(() => {
    const txt = [
      doc?.tipo_documento,
      doc?.ai_raw_response?.tipo_documento,
      doc?.ai_raw_response?.xml_content,
      doc?.ai_raw_response?.causale,
      doc?.soggetto_denominazione,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return /parcella|onorario|ritenuta|cassa|inps|enasarco|compenso|prestazione|consulenza/.test(txt)
  }, [doc?.tipo_documento, doc?.ai_raw_response?.tipo_documento, doc?.ai_raw_response?.xml_content, doc?.ai_raw_response?.causale, doc?.soggetto_denominazione])
  const operatorAssistItems = useMemo(
    () =>
      buildOperatorAssistItems({
        doc,
        form,
        reliability,
        tipiDocumento,
        contoSuggestions,
        historicalContoSuggestions,
        causaliIva,
        includeDocumentType: true,
        includeAccountMapping: true,
        includeVatCausale: true,
        includeParcellaConfirmation: parcellaAssistRaw,
      }),
    [doc, form, reliability, tipiDocumento, contoSuggestions, historicalContoSuggestions, causaliIva, parcellaAssistRaw]
  )

  const xmlContent = doc?.ai_raw_response?.xml_content || null
  // Avoid hook-order issues: this is a cheap sync computation and does not need a hook.
  let publicUrl = ''
  if (doc?.file_path) {
    try {
      const { data } = importRepo.getDocumentoPublicUrl(doc.file_path)
      publicUrl = data?.publicUrl || ''
    } catch {
      publicUrl = ''
    }
  }

  const canPreviewSource = Boolean(publicUrl) || Boolean(xmlContent)

  if (!form) return null

  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const tipo = tipiDocumento.find((t) => t.id === form.tipo_documento)

  const contiFiltered =
    pianoConti
      ?.filter((c) => {
        if (!cercaConto) return c.livello >= 3
        const s = cercaConto.toLowerCase()
        return (
          c.livello >= 3 &&
          ((c.descrizione || '').toLowerCase().includes(s) ||
            (c.codice || '').replace(/\s/g, '').startsWith(s.replace(/[\s.]/g, '')))
        )
      })
      .slice(0, 60) || []

  const handleConferma = async () => {
    setSaving(true)
    if (form.salva_contropartita && form.conto_id) {
      let codContoCosto = null
      const contoCosto = pianoConti?.find((c) => c.id === form.conto_id)
      if (contoCosto) {
        codContoCosto = contoCosto.codice
      } else if (form.conto_search) {
        codContoCosto = form.conto_search.split('—')[0].trim()
      }
      const aliquotaIva = form.riepilogo_iva?.[0]?.aliquota || form.aliquota_iva || null
      const contoFornId = form.fornitore_conto_id
      if (contoFornId && codContoCosto) {
        const { error: updErr } = await importRepo.updatePianoContiById(contoFornId, {
          contropartita: codContoCosto,
          aliquota_iva: aliquotaIva || null,
        })
        if (!updErr) {
          console.log('[Import] OK contropartita', codContoCosto, 'salvata su conto fornitore', contoFornId)
        } else {
          console.error('[Import] Errore update contropartita:', updErr.message)
        }
      }
    }
    await onConferma(doc, form)
    setSaving(false)
  }

  const resolveOperatorAssist = (item, option, manualText = '', context = {}) => {
    if (!item) return
    setForm((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      if (option?.patch && typeof option.patch === 'object') {
        Object.assign(next, option.patch)
      }
      if (item.type === 'uncertain_account_mapping' && manualText && !option?.patch?.conto_id) {
        next.conto_search = manualText
      }
      if (item.type === 'uncertain_parcella_confirmation' && option?.patch && typeof option.patch === 'object') {
        Object.assign(next, option.patch)
      }
      next.operator_clarifications = appendOperatorClarification(prev.operator_clarifications, item, option, manualText, {
        issue_type: item.type,
        shown_options: item.options,
        selected_answer: option?.label || manualText || 'Manuale',
        rerun_result: context.rerun_result || 'continue',
        engine_source: engineSource,
      })
      return next
    })
    if (item.type === 'uncertain_account_mapping') {
      setCercaConto('')
    }
    if (item.type === 'uncertain_parcella_confirmation') {
      setClarificationModalItem(null)
    }
    if (context?.closeModal !== false) setClarificationModalItem(null)
  }

  return (
    <div
      style={{
        background: 'var(--s2)',
        border: '1px solid var(--bd)',
        borderRadius: 10,
        marginBottom: '1rem',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '.75rem',
          padding: '.75rem 1rem',
          borderBottom: '1px solid var(--bd)',
          background: 'var(--s1)',
        }}
      >
        <div
          style={{
            background: `${tipo?.color}22`,
            border: `1px solid ${tipo?.color}66`,
            color: tipo?.color,
            borderRadius: 6,
            padding: '.2rem .6rem',
            fontSize: '.72rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {tipo?.label || form.tipo_documento}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '.85rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {doc.filename}
          </div>
          <div style={{ fontSize: '.7rem', color: 'var(--mu)' }}>
            {doc.confidence != null && `Confidenza AI: ${Math.round(doc.confidence * 100)}%`}
            {doc.ai_raw_response?.metodo === 'xml_deterministico' && ' · XML deterministico'}
          </div>
          {reliability && (
            <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.1rem' }}>
              Affidabilita bozza: <strong>{reliabilityTierLabel(reliability.tier)}</strong> · {reliability.score}%
              {reliability.reasons?.length > 0 && (
                <div style={{ marginTop: '.15rem', color: 'var(--mu)' }}>
                  Motivi: {reliability.reasons.slice(0, 2).map((r) => r.message).join('; ')}
                </div>
              )}
            </div>
          )}
        </div>
        <select
          value={form.tipo_documento}
          onChange={(e) => up('tipo_documento', e.target.value)}
          style={{
            background: 'var(--s2)',
            border: '1px solid var(--bd)',
            color: 'var(--tx)',
            borderRadius: 6,
            padding: '.3rem .5rem',
            fontSize: '.75rem',
          }}
        >
          {tipiDocumento.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ padding: '0 1rem' }}>
        <OperatorAssistPanel
          items={operatorAssistItems}
          onResolve={resolveOperatorAssist}
          onManualResolve={(item, value) => resolveOperatorAssist(item, { id: 'manual', label: value, patch: {} }, value)}
          onRequestClarification={setClarificationModalItem}
          title="Chiarimenti guidati"
        />
      </div>

      <OperatorClarificationModal
        open={Boolean(clarificationModalItem)}
        item={clarificationModalItem}
        onClose={() => setClarificationModalItem(null)}
        engineSource={engineSource}
        subtitle={doc?.filename || form?.numero || 'Documento importato'}
        onOpenPreview={() => setSourcePreviewOpen(true)}
        onContinue={(item, option, manualText) => resolveOperatorAssist(item, option, manualText, { rerun_result: 'continue' })}
        onSkip={(item) => resolveOperatorAssist(item, { id: 'skip', label: 'Salta e gestisci manualmente', patch: {} }, '', { rerun_result: 'skip' })}
        onReviewLater={(item) => resolveOperatorAssist(item, { id: 'review_later', label: 'Rivedi dopo', patch: {} }, '', { rerun_result: 'review_later' })}
      />

      <ImportPreviewPanel
        form={form}
        up={up}
        fmt={fmt}
        clienti={clienti}
        pianoConti={pianoConti}
        causaliIva={causaliIva}
        aliquoteIva={aliquoteIva}
        cercaConto={cercaConto}
        setCercaConto={setCercaConto}
        contiFiltered={contiFiltered}
        contoSuggestions={contoSuggestions}
        historicalContoSuggestions={historicalContoSuggestions}
        historicalContoLoading={historicalContoLoading}
        showAnteprimaDocumento={canPreviewSource}
        onAnteprimaDocumento={() => setSourcePreviewOpen(true)}
      />

      <DocumentPreviewModal
        open={sourcePreviewOpen}
        onClose={() => setSourcePreviewOpen(false)}
        title="Anteprima documento"
        subtitle={`${form.numero || 'Documento'} · ${form.cedente_denom || form.cessionario_denom || 'Soggetto'}${form.data ? ` · ${form.data}` : ''}`}
        fileUrl={publicUrl || ''}
        filename={doc?.filename || ''}
        mimeType={doc?.mime_type || ''}
        xmlContent={xmlContent || ''}
        fallback={{
          tipo_doc: form.tipo_doc || form.tipo_documento,
          numero: form.numero,
          data: form.data,
          cedente_denom: form.cedente_denom,
          cedente_piva: form.cedente_piva,
          cedente_cf: form.cedente_cf,
          cessionario_denom: form.cessionario_denom,
          cessionario_piva: form.cessionario_piva,
          imponibile: form.imponibile,
          iva: form.iva_totale,
          totale: form.totale,
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '.5rem',
          padding: '.75rem 1rem',
          borderTop: '1px solid var(--bd)',
          background: 'var(--s1)',
        }}
      >
        <button
          onClick={() => onElimina(doc.id)}
          style={{
            background: 'transparent',
            border: '1px solid rgba(224,82,82,.3)',
            color: '#e05252',
            borderRadius: 6,
            padding: '.35rem .75rem',
            fontSize: '.78rem',
            cursor: 'pointer',
          }}
        >
          Scarta
        </button>
        <button
          onClick={handleConferma}
          disabled={saving}
          style={{
            background: 'var(--gold)',
            border: 'none',
            color: '#0d1117',
            borderRadius: 6,
            padding: '.35rem 1rem',
            fontSize: '.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            opacity: saving ? 0.4 : 1,
          }}
        >
          {saving ? 'Conferma...' : 'Conferma e invia'}
        </button>
      </div>
    </div>
  )
}
