import { useEffect, useMemo, useState } from 'react'
import { pickContoFromAiAccountingRows } from '../../../utils/matchAiAccountingRowsToPianoConti.js'
import * as importRepo from '../data/importRepo.js'
import { ImportPreviewPanel } from './ImportPreviewPanel.jsx'
import { evaluateDraftReliability, reliabilityTierLabel } from '../../../../domain/draftReliability.js'

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

  useEffect(() => {
    if (!doc) return
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
      riepilogo_iva: d.riepilogo_iva || [],
      causale: d.causale || '',
      causale_iva_id: causaleIvaDefault,
      conto_id: null,
      conto_search: '',
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
    if (!form || !pianoConti?.length || !societaId) return
    const piva = form.cedente_piva || form.cessionario_piva
    const cf = form.cedente_cf || form.cessionario_piva
    const nome = form.cedente_denom || form.cessionario_denom
    if (!piva && !cf && !nome) return

    const norm = (v) => (v || '').replace(/\s|-/g, '').replace(/^IT/i, '').toUpperCase().trim()

    const match = pianoConti.find(
      (c) =>
        (piva &&
          piva.length >= 8 &&
          (norm(c.partita_iva) === norm(piva) || norm(c.anagrafica_piva) === norm(piva))) ||
        (cf &&
          cf.length >= 11 &&
          (norm(c.codice_fiscale) === norm(cf) || norm(c.anagrafica_cf) === norm(cf))) ||
        (nome?.length > 4 &&
          (c.is_fornitore || c.is_cliente) &&
          (c.descrizione || '').toLowerCase().includes(nome.toLowerCase().substring(0, 12)))
    )
    if (!match) return

    const updates = {
      fornitore_conto_id: match.id,
      fornitore_conto_search: `${match.codice} — ${match.descrizione}`,
    }

    if (match.contropartita && !form.conto_id) {
      const contoCosto = pianoConti.find((c) => c.codice === match.contropartita)
      if (contoCosto) {
        updates.conto_id = contoCosto.id
        updates.conto_search = `${contoCosto.codice} — ${contoCosto.descrizione}`
        updates.conto_da_anagrafica = true
      } else {
        updates.conto_search = match.contropartita
        updates.conto_da_anagrafica = true
      }
    }

    if (match.aliquota_iva && (!form.riepilogo_iva?.length || form.riepilogo_iva[0]?.aliquota === '22')) {
      updates.aliquota_iva_default = match.aliquota_iva
    }

    setForm((f) => ({ ...f, ...updates }))
  }, [form?.cedente_piva, form?.cedente_cf, form?.cedente_denom, pianoConti, societaId])

  useEffect(() => {
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

  if (!form) return null

  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const tipo = tipiDocumento.find((t) => t.id === form.tipo_documento)
  const reliability = useMemo(() => evaluateDraftReliability({ doc, form }), [doc, form])

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
          console.log('[Import] ✓ Contropartita', codContoCosto, 'salvata su conto fornitore', contoFornId)
        } else {
          console.error('[Import] Errore update contropartita:', updErr.message)
        }
      }
    }
    await onConferma(doc, form)
    setSaving(false)
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
            {doc.ai_raw_response?.metodo === 'xml_deterministico' && ' · XML deterministico ✓'}
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
          🗑 Scarta
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
          {saving ? '⏳ Conferma...' : '✓ Conferma e invia'}
        </button>
      </div>
    </div>
  )
}
