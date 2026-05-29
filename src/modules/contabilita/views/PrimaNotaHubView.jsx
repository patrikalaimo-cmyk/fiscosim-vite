import { useMemo, useState } from 'react'
import { traceStep, traceDiff, traceIva, insertCausaleIvaMeta } from '../../../utils/pipelineLogger.js'
import { DaValidareSplitView } from '../da_validare_split_view.jsx'
import { RegistrazioneManualeView } from './RegistrazioneManualeView.jsx'

function buildDraftFromPrimaNota(scrittura = {}, righe = []) {
  if (!scrittura) return null
  const safeRighe = Array.isArray(righe) ? righe : []
  const formatIso = (val) => {
    if (!val) return ''
    return String(val).slice(0, 10)
  }
  const exercise = scrittura.esercizio || String(new Date(scrittura.data_registrazione || Date.now()).getFullYear())
  return {
    header: {
      esercizioContabile: String(exercise),
      dataRegistrazione: formatIso(scrittura.data_registrazione),
      dataDocumento: formatIso(scrittura.data_documento || scrittura.data_registrazione),
      numeroDocumento: scrittura.numero_documento || '',
      causaleContabileId: scrittura.causale_codice || '',
      soggetto: scrittura.cliente_fornitore_nome || '',
      clienteFornitoreId: scrittura.cliente_fornitore_id || '',
      clienteFornitoreNome: scrittura.cliente_fornitore_nome || '',
      clienteFornitoreCodice: scrittura.cliente_fornitore_codice || '',
      totaleDocumento: String(scrittura.totale_dare || scrittura.totale_avere || ''),
      descrizioneGenerale: scrittura.descrizione || '',
      stato: scrittura.stato || 'bozza',
      versione: scrittura.versione || 1,
    },
    documentData: {
      divisa: 'EUR',
      cambio: '1,000000',
      condizioniPagamento: '',
      modalitaPagamento: '',
      totaleImponibile: '',
      totaleImposte: '',
      totaleDocumento: String(scrittura.totale_dare || scrittura.totale_avere || ''),
    },
    ivaData: {
      causaleIvaId: scrittura.causale_iva_id || '',
      causaleIvaCodice: scrittura.causale_iva_codice || '',
      causaleIvaDescrizione: '',
      registroIva: '',
      segnoRegistro: '',
      protocolloProvvisorio: '',
      protocolloDefinitivo: '',
      protocolloCee: '',
      dataCompetenza: formatIso(scrittura.data_registrazione),
      dataOperazione: formatIso(scrittura.data_registrazione),
      imponibile: '',
      totaleImponibile: '',
      totaleImposta: '',
      totaleDocumento: String(scrittura.totale_dare || scrittura.totale_avere || ''),
      ivaDetratta: '',
      ivaIndetraibile: '',
      percentualeDetraibilita: '',
      percentualeIndetraibilita: '',
      causaleIva: '',
      aliquotaIva: '',
      naturaIva: '',
      rows: [],
      stato: 'predisposto',
    },
    partitarioData: {
      selectedPartitaId: '',
      tipoMovimento: '',
      numeroDocumento: '',
      dataDocumento: '',
      tipoDocumento: '',
      importoOrigine: '',
      saldoResiduo: '',
      importoAperto: '',
      selectedPartitaNumeroDocumento: '',
      selectedPartitaDataDocumento: '',
      selectedPartitaTipoDocumento: '',
      selectedPartitaImportoOrigine: '',
      selectedPartitaSaldoResiduo: '',
      importoChiusura: '',
      manualImportoApertoOverride: false,
      manualImportoChiusuraOverride: false,
      segnoChiusura: 'A',
      stato: 'predisposto',
    },
    ritenutaData: {
      mode: '',
      percipienteId: '',
      percipiente: '',
      percipienteNome: '',
      codiceFiscale: '',
      causaleCu: '',
      causaleReddituale: '',
      codiceTributo: '',
      imponibile: '',
      imponibileReddito: '',
      importoCompenso: '',
      quotaNonSoggetta: '',
      sommeNonSoggette: '',
      codiceQuotaNonSoggetta: '',
      codiceSommeNonSoggette: '',
      codiceEsclusione: '',
      cassaPrevidenziale: '',
      baseImponibile: '',
      baseRitenuta: '',
      imponibileSoggettoRitenuta: '',
      aliquotaRitenuta: '',
      ritenuta: '',
      netto: '',
      importoPagamento: '',
      dataPagamento: '',
      note: '',
      escludiDaCu: false,
      manualBaseOverride: false,
      manualRitenutaOverride: false,
      manualNettoOverride: false,
      manualCompensoOverride: false,
      stato: 'predisposto',
    },
    rows: safeRighe.map((r, index) => {
      const dareVal = Number(r.importo_dare ?? r.dare) || 0
      const avereVal = Number(r.importo_avere ?? r.avere) || 0
      return {
        id: r.id || `row-${Date.now()}-${index}`,
        contoQuery: r.conto_codice ? `${r.conto_codice} - ${r.conto_descrizione}` : r.conto_descrizione || '',
        conto_id: r.conto_id || '',
        conto_codice: r.conto_codice || '',
        conto_descrizione: r.conto_descrizione || '',
        descrizione: r.descrizione_riga || r.descrizione || '',
        dare: dareVal > 0 ? String(dareVal) : '',
        avere: avereVal > 0 ? String(avereVal) : '',
        autoResidualApplied: false,
        manualAmountOverride: true,
        manualEdited: true,
        templateGenerated: false,
        templateKey: '',
        templateScope: false,
      }
    }),
    meta: {
      primaNotaId: scrittura.id,
      stato: scrittura.stato || 'bozza',
      versione: scrittura.versione || 1,
    }
  }
}
import { ConsultazionePrimaNotaView } from './ConsultazionePrimaNotaView.jsx'
import ArchivioStoricoAIView from './ArchivioStoricoAIView.jsx'
import ImportStoricoNesView from './ImportStoricoNesView.jsx'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import * as scritturaContabileService from '../application/scritturaContabileService.js'
import { buildPrimaNotaListViewModel } from '../application/primaNotaOperations/buildPrimaNotaListViewModel.js'
import { buildPrimaNotaDetailViewModel } from '../application/primaNotaOperations/buildPrimaNotaDetailViewModel.js'
import { fmtCurrency as fmt, fmtDate } from '../ui/formatters.js'
import {
  getDocumentoTipoBadge,
  mapScritturaRowForTrace,
} from '../ui/viewMappers.js'
import { getScopedStorageKey } from '../../../shared/utils/accessScope.js'
import { BaseCombobox } from '../ui/BaseDropdown.jsx'
import { ScritturaDetailPanel } from '../components/ScritturaDetailPanel.jsx'

function PrimaNotaViewScritturaRow({ s, onOpenScrittura }) {
  traceStep(
    'UI_ROW_PROPS',
    {
      id: s.id,
      numero_registrazione: s.numeroRegistrazione,
      cliente_fornitore_id: s.clienteFornitoreId,
      causale_codice: s.causaleCodice,
      causale_iva_codice: s.causaleIvaCodice ?? null,
    },
    { component: 'PrimaNotaViewScritturaRow' }
  )
  const hasDetail = Boolean(s?.hasPrimaNotaHeader ?? s?.has_prima_nota_header) && Boolean(onOpenScrittura)
  return (
    <tr onClick={() => hasDetail && onOpenScrittura?.(s.primaNotaId || s.id)} style={{ cursor: hasDetail ? 'pointer' : 'default' }}>
      <td style={{ fontWeight: 600 }}>{s.numeroRegistrazione}</td>
      <td style={{ fontSize: '.78rem' }}>{fmtDate(s.dataRegistrazione)}</td>
      <td>
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            color: 'var(--gold)',
            background: 'rgba(200,164,94,.1)',
            padding: '.1rem .3rem',
            borderRadius: 4,
            fontSize: '.7rem',
          }}
        >
          {s.clienteFornitoreCodice || '—'}
        </span>
      </td>
      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {s.clienteFornitoreNome || '—'}
        </div>
        <div style={{ fontSize: '.7rem', color: 'var(--mu)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Doc. {s.numeroDocumento || '—'}
        </div>
      </td>
      <td>
        <span className="bdg bdg-blue">{s.causaleCodice || '—'}</span>
      </td>
      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '.8rem' }}>
        {s.descrizione || '—'}
      </td>
      <td style={{ fontWeight: 600, color: 'var(--gr)', textAlign: 'right' }}>{fmt(s.totaleDare)}</td>
      <td style={{ fontWeight: 600, color: 'var(--rd)', textAlign: 'right' }}>{fmt(s.totaleAvere)}</td>
      <td>
        <span className={'bdg ' + (s.statoQuadratura === 'quadrata' ? 'bdg-green' : 'bdg-gold')}>
          {s.statoQuadratura || '—'}
        </span>
      </td>
    </tr>
  )
}

function PrimaNotaView({ scritture, causali, causaliIva, pianoConti, societaId, onRefresh, onOpenScrittura }) {
  const CAUSALI_APRONO_PARTITA = new Set(['FF', 'FC', 'RP', 'FFPC', 'FCPC', 'A17R', 'FF5'])
  const [modalNuova, setModalNuova] = useState(false)
  const [filtroControparte, setFiltroControparte] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    data_registrazione: new Date().toISOString().split('T')[0],
    data_documento: '',
    numero_documento: '',
    cliente_fornitore_id: '',
    causale_codice: '',
    causale_iva_id: '',
    descrizione: '',
    conto_contropartita_id: '',
    totale_dare: 0,
    totale_avere: 0,
    imponibile: 0,
    imposta: 0,
  })

  const causaleSelezionata = String(formData.causale_codice || '').trim().toUpperCase()
  const isCausalePartita = CAUSALI_APRONO_PARTITA.has(causaleSelezionata)

  const primaNotaListViewModel = useMemo(
    () => buildPrimaNotaListViewModel(scritture, { pianoConti }),
    [scritture, pianoConti]
  )

  const filtered = useMemo(() => {
    return primaNotaListViewModel.rows.filter((s) => {
      if (filtroControparte && String(s.clienteFornitoreId || '') !== String(filtroControparte || '')) return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        return (
          String(s.descrizione || '').toLowerCase().includes(q) ||
          String(s.numeroDocumento || '').toLowerCase().includes(q) ||
          String(s.clienteFornitoreNome || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [primaNotaListViewModel.rows, filtroControparte, searchTerm])

  const showLimitWarning = primaNotaListViewModel.hasLimitWarning

  const onClienteChange = (id) => {
    traceStep('UI_INPUT_CHANGE', { value: id, payload: { field: 'cliente_fornitore_id', scope: 'PrimaNotaView_modal' } })
    const c = pianoConti.find((x) => x.id === id)
    setFormData((p) => ({
      ...p,
      cliente_fornitore_id: id,
      descrizione: c ? `${c.descrizione || c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}` : '',
    }))
  }

  const calcolaIVA = (imponibile, aliquota) => {
    const imp = parseFloat(imponibile || 0)
    const iva = (imp * (aliquota || 22)) / 100
    return { imposta: iva.toFixed(2), totale: (imp + iva).toFixed(2) }
  }

  const onImponibileChange = (val) => {
    traceStep('UI_INPUT_CHANGE', { value: val, payload: { field: 'imponibile', scope: 'PrimaNotaView_modal' } })
    if (!isCausalePartita) {
      const totale = parseFloat(val || 0) || 0
      setFormData((p) => ({ ...p, imponibile: val, imposta: 0, totale_dare: totale, totale_avere: totale }))
      return
    }
    const causIva = causaliIva.find((c) => c.id === formData.causale_iva_id)
    const { imposta, totale } = calcolaIVA(val, causIva?.aliquota || 22)
    setFormData((p) => ({ ...p, imponibile: val, imposta, totale_dare: totale, totale_avere: totale }))
  }

  const onCausaleIvaChange = (causaleId) => {
    traceStep('UI_INPUT_CHANGE', { value: causaleId, payload: { field: 'causale_iva_id', scope: 'PrimaNotaView_modal' } })
    const causIva = causaliIva.find((c) => c.id === causaleId)
    const { imposta, totale } = calcolaIVA(formData.imponibile, causIva?.aliquota || 22)
    setFormData((p) => ({ ...p, causale_iva_id: causaleId, imposta, totale_dare: totale, totale_avere: totale }))
  }

  const salvaScrittura = async () => {
    alert('Salvataggio diretto legacy disabilitato. Usa Registrazione guidata.')
  }

  return (
    <div className="erp-view">
      <div className="erp-filter-card">
      <div className="erp-toolbar">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', width: '100%' }}>
          <div className="fg" style={{ flex: 1, minWidth: 200 }}>
            <label>Cerca</label>
              <input
                placeholder="N° documento, descrizione..."
              value={searchTerm}
              onChange={(e) => {
                const value = e.target.value
                traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'searchTerm', scope: 'PrimaNotaView_filtri' } })
                setSearchTerm(value)
              }}
            />
          </div>
          <div className="fg" style={{ minWidth: 200 }}>
            <label>Filtra per Controparte</label>
            <BaseCombobox
              value={filtroControparte}
              onChange={(value) => {
                traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'filtroControparte', scope: 'PrimaNotaView_filtri' } })
                setFiltroControparte(value || '')
              }}
              options={[
                { id: '', label: 'Tutte le controparti' },
                ...pianoConti.filter((c) => c.is_cliente || c.is_fornitore || Number(c.livello || 0) >= 3).map((c) => ({
                  id: c.id,
                  label: `${c.codice ? `[${c.codice}] ` : ''}${c.descrizione || c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}`,
                })),
              ]}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              placeholder="Tutte le controparti"
              maxItems={140}
              searchable
            />
          </div>
          <div className="erp-toolbar-spacer" />
          <div className="cont-toolbar-summary">
            <span className="cont-toolbar-pill"><strong>{filtered.length}</strong> righe</span>
          </div>
        </div>
      </div>
      </div>

      {showLimitWarning && (
        <div className="alert alert-info" style={{ marginBottom: '.75rem' }}>
          Mostrate le ultime {primaNotaListViewModel.count} registrazioni. Per consultazioni su periodo specifico, usa <strong>Consultazione e partite</strong>.
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty"><div className="empty-ico">?</div><div className="empty-t">Nessuna scrittura</div></div>
      ) : (
        <div className="erp-table-shell erp-data-card">
          <div className="erp-table-head">
            <div>
              <div className="erp-table-title">Registrazioni</div>
              <div className="erp-table-meta">Vista operativa delle scritture di prima nota.</div>
            </div>
            <div className="erp-table-tools">
              <span className="cont-toolbar-pill"><strong>{filtered.length}</strong> righe</span>
            </div>
          </div>
          <div className="erp-table-body">
          <table className="tbl">
            <thead><tr><th>N?</th><th>Data</th><th>Cod.CP.</th><th>Cliente/Fornitore</th><th>Causale</th><th>Descrizione</th><th style={{ textAlign: 'right' }}>Dare</th><th style={{ textAlign: 'right' }}>Avere</th><th>Quadratura</th></tr></thead>
            <tbody>
              {(() => {
                traceStep('UI_RENDER_RIGHE', { righe: filtered.map(mapScritturaRowForTrace) }, { component: 'PrimaNotaView' })
                return null
              })()}
              {filtered.map((s) => (
                <PrimaNotaViewScritturaRow
                  key={s.id}
                  s={s}
                  onOpenScrittura={onOpenScrittura}
                />
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {modalNuova && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setModalNuova(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650 }}>
            <div className="modal-hdr">
              <div className="modal-drag" />
              <div className="modal-title">Nuova scrittura prima nota</div>
              <button className="modal-close" onClick={() => setModalNuova(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warn" style={{ marginBottom: '.75rem' }}>
                Salvataggio diretto legacy disabilitato per sicurezza contabile. Usa il flusso guidato.
              </div>
              <div className="form-grid">
                <div className="fg"><label>Data Registrazione *</label><input type="date" value={formData.data_registrazione} onChange={(e) => { const value = e.target.value; traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'data_registrazione', scope: 'PrimaNotaView_modal' } }); setFormData((p) => ({ ...p, data_registrazione: value })) }} /></div>
                <div className="fg"><label>Data Documento</label><input type="date" value={formData.data_documento} onChange={(e) => { const value = e.target.value; traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'data_documento', scope: 'PrimaNotaView_modal' } }); setFormData((p) => ({ ...p, data_documento: value })) }} /></div>
                <div className="fg"><label>N° Documento</label><input value={formData.numero_documento} onChange={(e) => { const value = e.target.value; traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'numero_documento', scope: 'PrimaNotaView_modal' } }); setFormData((p) => ({ ...p, numero_documento: value })) }} placeholder="Es. FT-001/2025" /></div>
                <div className="fg"><label>Causale Contabile</label><BaseCombobox value={formData.causale_codice} onChange={(value) => { traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'causale_codice', scope: 'PrimaNotaView_modal' } }); const nextCausale = value || ''; const isPartita = CAUSALI_APRONO_PARTITA.has(String(nextCausale).trim().toUpperCase()); setFormData((p) => ({ ...p, causale_codice: nextCausale, cliente_fornitore_id: isPartita ? p.cliente_fornitore_id : '', causale_iva_id: isPartita ? p.causale_iva_id : '', conto_contropartita_id: isPartita ? '' : p.conto_contropartita_id, imposta: isPartita ? p.imposta : 0 })) }} options={[{ id: '', label: '-- Seleziona --' }, ...causali.map((c) => ({ id: c.codice, label: `${c.codice} - ${c.descrizione}` }))]} getOptionId={(o) => o?.id} getOptionLabel={(o) => o?.label} placeholder="-- Seleziona --" maxItems={140} searchable /></div>
                {isCausalePartita ? (
                  <div className="fg full" style={{ background: 'rgba(200,164,94,.08)', padding: '.75rem', borderRadius: 8, border: '1px solid rgba(200,164,94,.2)' }}>
                    <label style={{ color: 'var(--gold)', fontWeight: 600 }}>Cliente / Fornitore</label>
                    <div style={{ marginTop: '.35rem' }}>
                      <BaseCombobox
                        value={formData.cliente_fornitore_id}
                        onChange={(value) => onClienteChange(value || '')}
                        options={[
                          { id: '', label: '-- Seleziona controparte --' },
                          ...pianoConti.filter((c) => c.is_cliente || c.is_fornitore || Number(c.livello || 0) >= 3).map((c) => ({
                            id: c.id,
                            label: `${c.codice ? `[${c.codice}] ` : ''}${c.descrizione || c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}`,
                          })),
                        ]}
                        getOptionId={(o) => o?.id}
                        getOptionLabel={(o) => o?.label}
                        placeholder="-- Seleziona controparte --"
                        maxItems={140}
                        searchable
                      />
                    </div>
                    <div style={{ fontSize: '.7rem', color: 'var(--mu)', marginTop: '.25rem' }}>La scrittura verrà agganciata alla controparte del piano dei conti.</div>
                  </div>
                ) : (
                  <div className="fg full">
                    <label>Conto di contropartita</label>
                    <BaseCombobox
                      value={formData.conto_contropartita_id}
                      onChange={(value) => setFormData((p) => ({ ...p, conto_contropartita_id: value || '' }))}
                      options={[
                        { id: '', label: '-- Seleziona conto --' },
                        ...pianoConti.filter((c) => Number(c.livello || 0) >= 2).map((c) => ({
                          id: c.id,
                          label: `${c.codice ? `[${c.codice}] ` : ''}${c.descrizione || c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}`,
                        })),
                      ]}
                      getOptionId={(o) => o?.id}
                      getOptionLabel={(o) => o?.label}
                      placeholder="-- Seleziona conto --"
                      maxItems={140}
                      searchable
                    />
                  </div>
                )}
                <div className="fg full"><label>Descrizione</label><input value={formData.descrizione} onChange={(e) => { const value = e.target.value; traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'descrizione', scope: 'PrimaNotaView_modal' } }); setFormData((p) => ({ ...p, descrizione: value })) }} placeholder="Descrizione operazione" /></div>
                <div className="fg"><label>{isCausalePartita ? 'Imponibile €' : 'Importo €'}</label><input type="number" step="0.01" value={formData.imponibile} onChange={(e) => onImponibileChange(e.target.value)} /></div>
                {isCausalePartita ? (
                  <>
                    <div className="fg"><label>Causale IVA</label><BaseCombobox value={formData.causale_iva_id} onChange={(value) => onCausaleIvaChange(value || '')} options={[{ id: '', label: '-- Seleziona --' }, ...causaliIva.map((c) => ({ id: c.id, label: `${c.codice} - ${c.descrizione} (${c.aliquota}%)` }))]} getOptionId={(o) => o?.id} getOptionLabel={(o) => o?.label} placeholder="-- Seleziona --" maxItems={140} searchable /></div>
                    <div className="fg"><label>IVA €</label><input type="number" step="0.01" value={formData.imposta} readOnly style={{ background: 'var(--bg)' }} /></div>
                  </>
                ) : null}
                <div className="fg"><label>Totale €</label><input type="number" step="0.01" value={formData.totale_dare} readOnly style={{ background: 'var(--bg)', fontWeight: 700, color: 'var(--gold)' }} /></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={() => setModalNuova(false)}>Annulla</button>
              <button
                className="btn"
                onClick={salvaScrittura}
                disabled
                title="Legacy direct write disabled: manual registrations must pass through guided canonical flow."
              >
                Registra (legacy disabilitato)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RegistrateView({ documenti, onOpenScrittura }) {
  return (
    <div className="erp-view">
      <div className="erp-header">
        <div className="erp-header-copy">
          <div className="erp-kicker">Contabilita</div>
          <div className="erp-title">Completate</div>
          <div className="erp-subtitle">{documenti.length} documenti già registrati in contabilità.</div>
        </div>
      </div>

      {documenti.length === 0 ? (
        <div className="empty"><div className="empty-ico">?</div><div className="empty-t">Nessun documento registrato</div></div>
      ) : (
        <div className="erp-table-shell">
          <div className="erp-table-head">
            <div>
              <div className="erp-table-title">Documenti completati</div>
              <div className="erp-table-meta">Storico operativo già contabilizzato, utile per controlli e consultazioni rapide.</div>
            </div>
          </div>
          <div className="erp-table-body">
          <table className="tbl">
            <thead><tr><th>Tipo</th><th>N° Doc</th><th>Data</th><th>Soggetto</th><th>Totale</th><th>Registrato</th></tr></thead>
            <tbody>{documenti.map((d) => {
              const tipoBadge = getDocumentoTipoBadge(d.tipo_documento)
              return (
                <tr
                  key={d.id}
                  onClick={() => d?.prima_nota_id && onOpenScrittura?.(d.prima_nota_id)}
                  style={{ cursor: d?.prima_nota_id && onOpenScrittura ? 'pointer' : 'default' }}
                >
                  <td><span className={'bdg ' + tipoBadge.className}>{tipoBadge.label}</span></td>
                  <td style={{ fontWeight: 600 }}>{d.numero_documento}</td>
                  <td style={{ fontSize: '.78rem' }}>{fmtDate(d.data_documento)}</td>
                  <td>{d.soggetto_denominazione}</td>
                  <td style={{ fontWeight: 600, color: 'var(--gld2)' }}>{fmt(d.totale)}</td>
                  <td style={{ fontSize: '.72rem', color: 'var(--mu)' }}>{fmtDate(d.registered_at?.split('T')[0])}</td>
                </tr>
              )
            })}</tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PrimaNotaHubView({
  contTab,
  setContTab,
  documenti,
  scritture,
  pianoConti,
  societaList = [],
  causaliIva,
  causaliContabili,
  societaAttiva,
  stats,
  caricaTutto,
  patchDocumento,
  confermaDoc,
  registraConfermati,
  registrazioneInCorso = false,
  utente = null,
  openGuidataAt,
  pnGuidataDraft,
  pnGuidataDoc,
  pnGuidataNav,
  gotoGuidataRelative,
  setPnGuidataDraft,
  persistGuidataDraft,
  registrationResults,
  setRegistrationResults,
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailScrittura, setDetailScrittura] = useState(null)
  const [detailRighe, setDetailRighe] = useState([])
  const [detailSavingHeader, setDetailSavingHeader] = useState(false)
  const [detailCheckingDeleteGuards, setDetailCheckingDeleteGuards] = useState(false)
  const [detailDeleteGuards, setDetailDeleteGuards] = useState(null)
  const [detailOperationContext, setDetailOperationContext] = useState(null)
  const [detailPreparingAnnulla, setDetailPreparingAnnulla] = useState(false)
  const [detailAnnullaPrepare, setDetailAnnullaPrepare] = useState(null)
  const [detailRunningAnnulla, setDetailRunningAnnulla] = useState(false)
  const [detailDeleting, setDetailDeleting] = useState(false)
  const [detailSuccess, setDetailSuccess] = useState('')

  const detailViewModel = useMemo(() => buildPrimaNotaDetailViewModel({ scrittura: detailScrittura, righe: detailRighe }), [detailScrittura, detailRighe])

  const openScritturaDetail = async (primaNotaId) => {
    const id = String(primaNotaId || '').trim()
    if (!id) return
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError('')
    setDetailSuccess('')
    setDetailDeleteGuards(null)
    setDetailOperationContext(null)
    setDetailAnnullaPrepare(null)
    try {
      const { data, error } = await contabilitaRepo.getScritturaDettaglioById(id)
      if (error) throw error
      setDetailScrittura(data?.scrittura || null)
      setDetailRighe(Array.isArray(data?.righe) ? data.righe : [])
      const societaId = String(societaAttiva?.id || '').trim()
      if (societaId) {
        const { data: opCtx } = await scritturaContabileService.getScritturaOperationContext(id, societaId)
        setDetailOperationContext(opCtx || null)
        if (opCtx?.actionModel?.requiresAnnullaRegistrazione && !opCtx?.actionModel?.canDeleteIsolated) {
          setDetailPreparingAnnulla(true)
          const { data: prepData, error: prepErr } = await scritturaContabileService.prepareAnnullaRegistrazione(id, societaId)
          if (prepErr) throw prepErr
          setDetailAnnullaPrepare(prepData || null)
        }
      }
    } catch (e) {
      setDetailScrittura(null)
      setDetailRighe([])
      setDetailOperationContext(null)
      setDetailAnnullaPrepare(null)
      setDetailError(e?.message || String(e))
    } finally {
      setDetailPreparingAnnulla(false)
      setDetailLoading(false)
    }
  }

  const closeScritturaDetail = () => {
    setDetailOpen(false)
    setDetailLoading(false)
    setDetailSavingHeader(false)
    setDetailCheckingDeleteGuards(false)
    setDetailPreparingAnnulla(false)
    setDetailRunningAnnulla(false)
    setDetailDeleting(false)
    setDetailError('')
    setDetailSuccess('')
    setDetailScrittura(null)
    setDetailRighe([])
    setDetailDeleteGuards(null)
    setDetailOperationContext(null)
    setDetailAnnullaPrepare(null)
  }

  const saveScritturaHeader = async (primaNotaId, form) => {
    const id = String(primaNotaId || '').trim()
    if (!id || detailSavingHeader || detailCheckingDeleteGuards || detailDeleting) return
    setDetailSavingHeader(true)
    setDetailError('')
    setDetailSuccess('')
    try {
      const payload = {
        descrizione: String(form?.descrizione || ''),
        data_documento: String(form?.data_documento || ''),
        data_registrazione: String(form?.data_registrazione || ''),
        numero_documento: String(form?.numero_documento || ''),
      }
      const { error: saveErr } = await scritturaContabileService.updateScritturaContabile(id, payload)
      if (saveErr) throw saveErr
      const { data, error: readErr } = await contabilitaRepo.getScritturaDettaglioById(id)
      if (readErr) throw readErr
      setDetailScrittura(data?.scrittura || null)
      setDetailRighe(Array.isArray(data?.righe) ? data.righe : [])
      setDetailDeleteGuards(null)
      setDetailOperationContext(null)
      setDetailAnnullaPrepare(null)
      setDetailSuccess('Header salvato correttamente. Verifica eliminazione da rieseguire.')
      await caricaTutto?.()
    } catch (e) {
      setDetailError(e?.message || String(e))
    } finally {
      setDetailSavingHeader(false)
    }
  }

  const checkDeleteScritturaGuards = async (primaNotaId) => {
    const id = String(primaNotaId || '').trim()
    const societaId = String(societaAttiva?.id || '').trim()
    if (!id || !societaId || detailSavingHeader || detailCheckingDeleteGuards || detailDeleting) return
    setDetailCheckingDeleteGuards(true)
    setDetailError('')
    setDetailSuccess('')
    try {
      const { data, error } = await contabilitaRepo.getDeleteScritturaGuards(id, societaId)
      if (error) throw error
      setDetailDeleteGuards(data || null)
      const { data: opCtx } = await scritturaContabileService.getScritturaOperationContext(id, societaId)
      setDetailOperationContext(opCtx || null)
      if (opCtx?.actionModel?.requiresAnnullaRegistrazione && !opCtx?.actionModel?.canDeleteIsolated) {
        setDetailPreparingAnnulla(true)
        const { data: prepData, error: prepErr } = await scritturaContabileService.prepareAnnullaRegistrazione(id, societaId)
        if (prepErr) throw prepErr
        setDetailAnnullaPrepare(prepData || null)
      } else {
        setDetailAnnullaPrepare(null)
      }
      setDetailSuccess(data?.canDelete ? 'Pre-check completato: eliminazione consentita.' : 'Pre-check completato: eliminazione bloccata.')
    } catch (e) {
      setDetailDeleteGuards(null)
      setDetailOperationContext(null)
      setDetailAnnullaPrepare(null)
      setDetailError(e?.message || String(e))
    } finally {
      setDetailPreparingAnnulla(false)
      setDetailCheckingDeleteGuards(false)
    }
  }

  const deleteScritturaControllata = async (primaNotaId) => {
    const id = String(primaNotaId || '').trim()
    const societaId = String(societaAttiva?.id || '').trim()
    if (!id || !societaId || detailSavingHeader || detailCheckingDeleteGuards || detailDeleting) return
    setDetailDeleting(true)
    setDetailError('')
    setDetailSuccess('')
    try {
      const { data: guardData, error: guardErr } = await contabilitaRepo.getDeleteScritturaGuards(id, societaId)
      if (guardErr) throw guardErr
      setDetailDeleteGuards(guardData || null)
      const { data: opCtx } = await scritturaContabileService.getScritturaOperationContext(id, societaId)
      setDetailOperationContext(opCtx || null)
      if (opCtx?.actionModel?.requiresAnnullaRegistrazione && !opCtx?.actionModel?.canDeleteIsolated) {
        setDetailPreparingAnnulla(true)
        const { data: prepData, error: prepErr } = await scritturaContabileService.prepareAnnullaRegistrazione(id, societaId)
        if (prepErr) throw prepErr
        setDetailAnnullaPrepare(prepData || null)
      } else {
        setDetailAnnullaPrepare(null)
      }
      if (!guardData?.canDelete) {
        const reasons = Array.isArray(guardData?.reasons) ? guardData.reasons.join(' ') : ''
        throw new Error(reasons || 'Eliminazione bloccata dai controlli di sicurezza')
      }

      const { error: deleteErr } = await scritturaContabileService.deleteScritturaIsolata(id, societaId)
      if (deleteErr) {
        const reasons = Array.isArray(deleteErr?.details?.reasons) ? deleteErr.details.reasons.join(' ') : ''
        throw new Error(reasons || deleteErr.message || String(deleteErr))
      }
      await caricaTutto?.()
      alert('Scrittura eliminata con successo.')
      closeScritturaDetail()
    } catch (e) {
      setDetailError(e?.message || String(e))
    } finally {
      setDetailPreparingAnnulla(false)
      setDetailDeleting(false)
    }
  }

  const runAnnullaRegistrazioneCollegata = async (primaNotaId) => {
    const id = String(primaNotaId || '').trim()
    const societaId = String(societaAttiva?.id || '').trim()
    if (!id || !societaId || detailSavingHeader || detailCheckingDeleteGuards || detailPreparingAnnulla || detailDeleting || detailRunningAnnulla) return
    setDetailRunningAnnulla(true)
    setDetailError('')
    setDetailSuccess('')
    try {
      const { data: prepData, error: prepErr } = await scritturaContabileService.prepareAnnullaRegistrazione(id, societaId)
      if (prepErr) throw prepErr
      setDetailAnnullaPrepare(prepData || null)
      if (!prepData?.canPrepare || prepData?.nextAction !== 'annulla_registrazione_collegata') {
        const reasons = Array.isArray(prepData?.reasons) ? prepData.reasons.join(' ') : ''
        throw new Error(reasons || 'Annullamento collegato non disponibile in questo contesto')
      }

      const { error: runErr } = await scritturaContabileService.annullaRegistrazioneCollegata(id, societaId)
      if (runErr) {
        const reasons = Array.isArray(runErr?.details?.reasons) ? runErr.details.reasons.join(' ') : ''
        const rollbackInfo = Array.isArray(runErr?.details?.rollbackErrors) && runErr.details.rollbackErrors.length
          ? ` Rollback parziale: ${runErr.details.rollbackErrors.join(' | ')}`
          : ''
        throw new Error((reasons || runErr?.message || String(runErr)) + rollbackInfo)
      }
      await caricaTutto?.()
      alert('Annullamento registrazione collegata completato con successo.')
      closeScritturaDetail()
    } catch (e) {
      setDetailError(e?.message || String(e))
    } finally {
      setDetailRunningAnnulla(false)
    }
  }

  if (!societaAttiva) return null

  return (
    <>
      {contTab === 'da_validare' && (
        <>
          {registrationResults && (
            <div
              className={`alert alert-${
                registrationResults.type === 'success'
                  ? 'success'
                  : registrationResults.type === 'error'
                  ? 'warn'
                  : registrationResults.type === 'warning'
                  ? 'info'
                  : 'info'
              }`}
              style={{ marginBottom: '1rem', position: 'relative' }}
            >
              <button
                onClick={() => setRegistrationResults(null)}
                style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  color: 'var(--mu)',
                }}
              >
                ×
              </button>
              {registrationResults.message ? (
                <div>{registrationResults.message}</div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>
                    Registrati {registrationResults.registrati}/{registrationResults.total} documenti
                  </div>
                  {registrationResults.errors.length > 0 && (
                    <div style={{ marginTop: '.5rem' }}>
                      <strong>Errori ({registrationResults.errors.length}):</strong>
                      <ul style={{ marginTop: '.25rem', paddingLeft: '1.5rem', fontSize: '.85rem' }}>
                        {registrationResults.errors.slice(0, 5).map((e, i) => (
                          <li key={i}>Doc {e.docId}: {e.error || e.message || 'Errore sconosciuto'}</li>
                        ))}
                        {registrationResults.errors.length > 5 && <li>... altri {registrationResults.errors.length - 5} errori</li>}
                      </ul>
                    </div>
                  )}
                  {registrationResults.warnings.length > 0 && (
                    <div style={{ marginTop: '.5rem' }}>
                      <strong>Avvisi ({registrationResults.warnings.length}):</strong>
                      <ul style={{ marginTop: '.25rem', paddingLeft: '1.5rem', fontSize: '.85rem' }}>
                        {registrationResults.warnings.slice(0, 5).map((w, i) => (
                          <li key={i}>
                            Doc {w.docId}: {w.warnings.map((c) => c.message).join('; ')}
                          </li>
                        ))}
                        {registrationResults.warnings.length > 5 && <li>... altri {registrationResults.warnings.length - 5} avvisi</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        <DaValidareSplitView
          documenti={documenti.filter((d) => d.workflow_status !== 'registered')}
          pianoConti={pianoConti}
          causaliIva={causaliIva}
          societaId={societaAttiva.id}
          utente={utente}
          stats={stats}
          onRefresh={caricaTutto}
          patchDocumento={patchDocumento}
          confermaDoc={confermaDoc}
          registraConfermati={registraConfermati}
          registrazioneInCorso={registrazioneInCorso}
          onEdit={async (doc, ids, idx) => {
            const listIds =
              Array.isArray(ids) && ids.length
                ? ids
                : documenti.filter((d) => d.workflow_status !== 'registered').map((d) => d.id)
            const i = Number.isFinite(idx) ? idx : Math.max(0, listIds.indexOf(doc.id))
            await openGuidataAt(doc, listIds, i)
          }}
        />
        </>
      )}

      {contTab === 'prima_nota' && (
        <PrimaNotaView
          scritture={scritture}
          causali={causaliContabili}
          causaliIva={causaliIva}
          pianoConti={pianoConti}
          societaId={societaAttiva.id}
          onRefresh={caricaTutto}
          onOpenScrittura={openScritturaDetail}
        />
      )}

      {/* Chiave legacy temporanea: il tab `prima_nota_guidata` monta la nuova RegistrazioneManualeView. */}
      {contTab === 'prima_nota_guidata' && (
        <RegistrazioneManualeView
          pianoConti={pianoConti}
          causaliContabili={causaliContabili}
          causaliIva={causaliIva}
          societaAttiva={societaAttiva}
          onRefresh={caricaTutto}
          initialDraft={pnGuidataDraft}
          utente={utente}
        />
      )}

      {(contTab === 'consultazione' || contTab === 'consultazione_partite') && (
        <ConsultazionePrimaNotaView
          societaAttiva={societaAttiva}
          pianoConti={pianoConti}
          causaliContabili={causaliContabili}
          causaliIva={causaliIva}
          utente={utente}
          onEditScrittura={(id, scrittura, righe, mode = 'edit') => {
            const draft = buildDraftFromPrimaNota(scrittura, righe)
            if (draft) {
              draft.meta = {
                ...draft.meta,
                operationMode: mode
              }
            }
            setPnGuidataDraft(draft)
            setContTab('prima_nota_guidata')
          }}
        />
      )}

      {contTab === 'archivio_storico_ai' && (
        <ArchivioStoricoAIView
          societaAttiva={societaAttiva}
          societaList={societaList}
        />
      )}

      {contTab === 'import_storico_nes' && (
        <ImportStoricoNesView
          societaAttiva={societaAttiva}
          pianoConti={pianoConti}
          causaliContabili={causaliContabili}
          causaliIva={causaliIva}
          utente={utente}
          onRefresh={caricaTutto}
        />
      )}

      {contTab === 'registrate' && (
        <RegistrateView
          documenti={documenti.filter((d) => d.workflow_status === 'registered')}
          onOpenScrittura={openScritturaDetail}
        />
      )}

      <ScritturaDetailPanel
        open={detailOpen}
        onClose={closeScritturaDetail}
        loading={detailLoading}
        error={detailError}
        successMessage={detailSuccess}
        scrittura={detailViewModel.scrittura}
        righe={detailViewModel.righe}
        canEditHeader
        onSaveHeader={saveScritturaHeader}
        savingHeader={detailSavingHeader}
        onCheckDeleteGuards={checkDeleteScritturaGuards}
        checkingDeleteGuards={detailCheckingDeleteGuards}
        deleteGuards={detailDeleteGuards}
        operationContext={detailOperationContext}
        annulloPrepare={detailAnnullaPrepare}
        preparingAnnulla={detailPreparingAnnulla}
        onRunAnnullaRegistrazione={runAnnullaRegistrazioneCollegata}
        runningAnnullaRegistrazione={detailRunningAnnulla}
        onDeleteScrittura={deleteScritturaControllata}
        deletingScrittura={detailDeleting}
      />
    </>
  )
}
