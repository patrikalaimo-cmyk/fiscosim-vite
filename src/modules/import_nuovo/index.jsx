import { useEffect, useMemo, useState } from 'react'
import { sb } from '../../lib/supabase'
import { parseXML } from './parserXML'
import { resolveIva } from './ivaResolver'
import { insertDocumento } from './importService'
import { traceIva } from '../../utils/pipelineLogger.js'
import { triggerAutoPipeline } from '../../utils/autoPipeline.js'

export function ModuloImportNuovo() {
  const [file, setFile] = useState(null)
  const [societaId, setSocietaId] = useState(null)
  const [societaList, setSocietaList] = useState([])
  const [causaliIva, setCausaliIva] = useState([])
  const [loadingCausali, setLoadingCausali] = useState(false)
  const [importing, setImporting] = useState(false)

  const firstAliquota = useMemo(() => {
    return null
  }, [])

  useEffect(() => {
    sb.from('societa')
      .select('id,denominazione')
      .order('denominazione')
      .then(({ data }) => {
        setSocietaList((data || []).map(s => ({ id: s.id, nome: s.denominazione })))
      })
  }, [])

  const loadCausali = async () => {
    setLoadingCausali(true)
    try {
      const { data, error } = await sb.from('causali_iva')
        .select('*')
        .order('codice', { ascending: true })
      if (error) throw error
      setCausaliIva(data || [])
      console.log('[import_nuovo] causaliIva loaded:', (data || []).length)
    } finally {
      setLoadingCausali(false)
    }
  }

  const onImporta = async () => {
    if (!file) {
      console.warn('[import_nuovo] no file selected')
      return
    }
    if (!societaId) {
      console.warn('[import_nuovo] no societa selected')
      return
    }

    setImporting(true)
    try {
      console.log('[import_nuovo] upload → parseXML → resolveIva → insert')
      console.log('[import_nuovo] file:', file.name, file.type, file.size)

      const parsed = await parseXML(file)
      console.log('[import_nuovo] parsed:', parsed)

      const aliquote = (parsed.riepilogo_iva || [])
        .map(r => parseFloat(String(r.aliquota).replace(',', '.')))
        .filter(n => !isNaN(n))

      const aliquota = aliquote.length ? Math.max(...aliquote) : null
      console.log('[import_nuovo] aliquota:', aliquota)

      const causale_iva_id = resolveIva(aliquota, causaliIva, { natura: null })
      traceIva('POST_RESOLVE_IVA', 'builder', causale_iva_id)
      console.log('[import_nuovo] causale_iva_id:', causale_iva_id)

      const imponibile = (parsed.riepilogo_iva || [])
        .reduce((s, r) => s + (r.imponibile || 0), 0)

      const iva = (parsed.riepilogo_iva || [])
        .reduce((s, r) => s + (r.imposta || 0), 0)

      const totale = imponibile + iva

      console.log("[import_nuovo] societaId:", societaId)
      const documento = {
        societa_id: societaId,
        stato: 'da_validare',
        conto_id: null,
        tipo_documento: 'fattura_passiva',
        numero_documento: parsed.numero_documento || null,
        data_documento: parsed.data_documento || null,
        soggetto_denominazione: parsed.fornitore || null,
        soggetto_piva: parsed.cedente_piva || null,
        causale_iva_id,
        causale_iva: causale_iva_id,

        imponibile,
        iva,
        totale,

        dati_estratti: {
          riepilogo_iva: parsed.riepilogo_iva,
          linee: [],
          cedente_denom: parsed.fornitore,
          cedente_piva: null,
          conto_id: null,
          conto_codice: null,
          conto_descrizione: null,
          totale: parsed.totale,
          filename: file.name,
        },
      }

      const righe_iva = (parsed.riepilogo_iva || []).map(r => {
        const causale_iva_id = resolveIva(r?.aliquota, causaliIva, r)

        console.log("DEBUG RIGA IVA MATCH", {
          aliquota: r.aliquota,
          natura: r.natura,
          causale_id: causale_iva_id
        });

        return {
          aliquota: r.aliquota,
          imponibile: r.imponibile,
          imposta: r.imposta,
          causale_iva_id,
        }
      })
      console.log("DEBUG RIGHE IVA SALVATE", righe_iva);

      console.log("DEBUG DOCUMENTO PRIMA INSERT", documento);
      traceIva('BUILDER_OUTPUT', 'builder', documento.causale_iva_id)
      const insertedId = await insertDocumento(documento)
      if (insertedId) triggerAutoPipeline(insertedId, { source: 'import_nuovo' })

      console.log('[import_nuovo] insert OK')
    } catch (e) {
      console.error('[import_nuovo] import failed:', e?.message || e, e)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-hdr">
        <div className="page-hdr-l">
          <div className="page-title">📥 Import Nuovo (Passiva)</div>
          <div className="page-sub">XML deterministico · IVA causale strict match · Insert minimale</div>
        </div>
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select onChange={(e) => setSocietaId(e.target.value || null)}>
            <option value="">Seleziona cliente</option>
            {societaList.map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>

          <input
            type="file"
            accept=".xml"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <button
            onClick={loadCausali}
            disabled={loadingCausali}
            style={{ padding: '.4rem .7rem' }}
          >
            {loadingCausali ? 'Carico causali...' : 'Carica causali IVA'}
          </button>

          <button
            onClick={onImporta}
            disabled={!file || importing || !societaId}
            style={{ padding: '.4rem .9rem', fontWeight: 700 }}
          >
            {importing ? 'Importo...' : 'Importa'}
          </button>
        </div>

        <div style={{ marginTop: '.75rem', fontSize: '.85rem', color: 'var(--mu)' }}>
          File: <b style={{ color: 'var(--tx)' }}>{file ? file.name : '—'}</b> · Causali: <b style={{ color: 'var(--tx)' }}>{causaliIva.length}</b>
        </div>
      </div>
    </div>
  )
}

