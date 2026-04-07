import { useState } from 'react'
import { traceStep, traceDiff, traceIva, insertCausaleIvaMeta } from '../../../utils/pipelineLogger.js'
import { DaValidareSplitView } from '../da_validare_split_view.jsx'
import { PrimaNotaGuidata } from '../prima_nota_guidata.jsx'
import { createPrimaNota } from '../../../../services/primaNotaService.js'
import { fmtCurrency as fmt, fmtDate } from '../ui/formatters.js'
import {
  getDocumentoTipoBadge,
  getPrimaNotaStatoBadgeClass,
  mapScritturaRowForTrace,
} from '../ui/viewMappers.js'

function PrimaNotaViewScritturaRow({ s, getClienteCodice, getClienteNome }) {
  traceStep(
    'UI_ROW_PROPS',
    {
      id: s.id,
      numero_registrazione: s.numero_registrazione,
      cliente_id: s.cliente_id,
      causale_codice: s.causale_codice,
      causale_iva_codice: s.causale_iva_codice ?? null,
    },
    { component: 'PrimaNotaViewScritturaRow' }
  )
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{s.numero_registrazione}</td>
      <td style={{ fontSize: '.78rem' }}>{fmtDate(s.data_registrazione)}</td>
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
          {getClienteCodice(s.cliente_id)}
        </span>
      </td>
      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {s.cliente_fornitore_nome || getClienteNome(s.cliente_id)}
      </td>
      <td>
        <span className="bdg bdg-blue">{s.causale_codice || '—'}</span>
      </td>
      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '.8rem' }}>
        {s.descrizione}
      </td>
      <td style={{ fontWeight: 600, color: 'var(--gr)', textAlign: 'right' }}>{fmt(s.totale_dare)}</td>
      <td style={{ fontWeight: 600, color: 'var(--rd)', textAlign: 'right' }}>{fmt(s.totale_avere)}</td>
      <td>
        <span className={'bdg ' + getPrimaNotaStatoBadgeClass(s.stato)}>{s.stato}</span>
      </td>
    </tr>
  )
}

function PrimaNotaView({ scritture, causali, causaliIva, clienti, societaId, onRefresh }) {
  const [modalNuova, setModalNuova] = useState(false)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    data_registrazione: new Date().toISOString().split('T')[0],
    data_documento: '',
    numero_documento: '',
    cliente_id: '',
    causale_codice: '',
    causale_iva_id: '',
    descrizione: '',
    totale_dare: 0,
    totale_avere: 0,
    conto_dare_id: '',
    conto_avere_id: '',
    imponibile: 0,
    imposta: 0,
  })

  const getClienteNome = (id) => {
    const c = clienti.find((x) => x.id === id)
    if (!c) return '—'
    return c.ragione_sociale || `${c.nome || ''} ${c.cognome || ''}`.trim()
  }

  const getClienteCodice = (id) => {
    const c = clienti.find((x) => x.id === id)
    return c?.codice_cliente || '—'
  }

  const filtered = scritture.filter((s) => {
    if (filtroCliente && s.cliente_id !== filtroCliente) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      return (
        (s.descrizione || '').toLowerCase().includes(q) ||
        (s.numero_documento || '').toLowerCase().includes(q) ||
        (s.cliente_fornitore_nome || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const onClienteChange = (id) => {
    traceStep('UI_INPUT_CHANGE', { value: id, payload: { field: 'cliente_id', scope: 'PrimaNotaView_modal' } })
    const c = clienti.find((x) => x.id === id)
    setFormData((p) => ({
      ...p,
      cliente_id: id,
      descrizione: c ? `${c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}` : '',
    }))
  }

  const calcolaIVA = (imponibile, aliquota) => {
    const imp = parseFloat(imponibile || 0)
    const iva = (imp * (aliquota || 22)) / 100
    return { imposta: iva.toFixed(2), totale: (imp + iva).toFixed(2) }
  }

  const onImponibileChange = (val) => {
    traceStep('UI_INPUT_CHANGE', { value: val, payload: { field: 'imponibile', scope: 'PrimaNotaView_modal' } })
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
    const cliente = clienti.find((c) => c.id === formData.cliente_id)
    const nextNum = scritture.length > 0 ? Math.max(...scritture.map((s) => s.numero_registrazione || 0)) + 1 : 1

    const record = {
      societa_id: societaId,
      numero_registrazione: nextNum,
      data_registrazione: formData.data_registrazione,
      data_documento: formData.data_documento || formData.data_registrazione,
      numero_documento: formData.numero_documento,
      cliente_id: formData.cliente_id || null,
      cliente_fornitore_nome: cliente
        ? cliente.ragione_sociale || `${cliente.nome} ${cliente.cognome || ''}`.trim()
        : formData.descrizione,
      causale_codice: formData.causale_codice,
      causale_iva_codice: causaliIva.find((c) => c.id === formData.causale_iva_id)?.codice || '',
      descrizione: formData.descrizione,
      totale_dare: parseFloat(formData.totale_dare || 0),
      totale_avere: parseFloat(formData.totale_avere || 0),
      imponibile: parseFloat(formData.imponibile || 0),
      imposta: parseFloat(formData.imposta || 0),
      stato: 'provvisoria',
    }

    traceIva('PRE_INSERT_PRIMA_NOTA_VIEW', 'DB', formData.causale_iva_id ?? null)
    traceStep('INSERT_PAYLOAD', record, { table: 'prima_nota', ...insertCausaleIvaMeta(record) })
    traceDiff(
      'DB_MAPPING_DIFF',
      { causale_iva_id: formData.causale_iva_id ?? null },
      { causale_iva_id: record.causale_iva_id ?? null }
    )
    const pnViewIns = await createPrimaNota({ pnPayload: record, headerSelect: '*' })
    traceStep('INSERT_RESULT', { table: 'prima_nota', data: pnViewIns.data, error: pnViewIns.error })
    const error = pnViewIns.error
    if (error) {
      alert('Errore: ' + error.message)
      return
    }
    setModalNuova(false)
    setFormData({
      data_registrazione: new Date().toISOString().split('T')[0],
      data_documento: '',
      numero_documento: '',
      cliente_id: '',
      causale_codice: '',
      causale_iva_id: '',
      descrizione: '',
      totale_dare: 0,
      totale_avere: 0,
      conto_dare_id: '',
      conto_avere_id: '',
      imponibile: 0,
      imposta: 0,
    })
    onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>📝 Prima Nota</div>
          <div style={{ fontSize: '.75rem', color: 'var(--mu)' }}>{scritture.length} scritture registrate</div>
        </div>
        <button className="btn" onClick={() => setModalNuova(true)}>+ Nuova Scrittura</button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ flex: 1, minWidth: 200 }}>
            <label>Cerca</label>
            <input
              placeholder="🔍 N° documento, descrizione..."
              value={searchTerm}
              onChange={(e) => {
                const value = e.target.value
                traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'searchTerm', scope: 'PrimaNotaView_filtri' } })
                setSearchTerm(value)
              }}
            />
          </div>
          <div className="fg" style={{ minWidth: 200 }}>
            <label>Filtra per Cliente</label>
            <select
              value={filtroCliente}
              onChange={(e) => {
                const value = e.target.value
                traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'filtroCliente', scope: 'PrimaNotaView_filtri' } })
                setFiltroCliente(value)
              }}
            >
              <option value="">Tutti i clienti</option>
              {clienti.filter((c) => c.codice_cliente).map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.codice_cliente}] {c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty"><div className="empty-ico">📝</div><div className="empty-t">Nessuna scrittura</div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>N°</th><th>Data</th><th>Cod.Cli.</th><th>Cliente/Fornitore</th><th>Causale</th><th>Descrizione</th><th style={{ textAlign: 'right' }}>Dare</th><th style={{ textAlign: 'right' }}>Avere</th><th>Stato</th></tr></thead>
            <tbody>
              {(() => {
                traceStep('UI_RENDER_RIGHE', { righe: filtered.map(mapScritturaRowForTrace) }, { component: 'PrimaNotaView' })
                return null
              })()}
              {filtered.map((s) => (
                <PrimaNotaViewScritturaRow key={s.id} s={s} getClienteCodice={getClienteCodice} getClienteNome={getClienteNome} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalNuova && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setModalNuova(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650 }}>
            <div className="modal-hdr">
              <div className="modal-drag" />
              <div className="modal-title">📝 Nuova Scrittura Prima Nota</div>
              <button className="modal-close" onClick={() => setModalNuova(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg"><label>Data Registrazione *</label><input type="date" value={formData.data_registrazione} onChange={(e) => { const value = e.target.value; traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'data_registrazione', scope: 'PrimaNotaView_modal' } }); setFormData((p) => ({ ...p, data_registrazione: value })) }} /></div>
                <div className="fg"><label>Data Documento</label><input type="date" value={formData.data_documento} onChange={(e) => { const value = e.target.value; traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'data_documento', scope: 'PrimaNotaView_modal' } }); setFormData((p) => ({ ...p, data_documento: value })) }} /></div>
                <div className="fg"><label>N° Documento</label><input value={formData.numero_documento} onChange={(e) => { const value = e.target.value; traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'numero_documento', scope: 'PrimaNotaView_modal' } }); setFormData((p) => ({ ...p, numero_documento: value })) }} placeholder="Es. FT-001/2025" /></div>
                <div className="fg"><label>Causale Contabile</label><select value={formData.causale_codice} onChange={(e) => { const value = e.target.value; traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'causale_codice', scope: 'PrimaNotaView_modal' } }); setFormData((p) => ({ ...p, causale_codice: value })) }}><option value="">-- Seleziona --</option>{causali.map((c) => <option key={c.id} value={c.codice}>{c.codice} - {c.descrizione}</option>)}</select></div>
                <div className="fg full" style={{ background: 'rgba(200,164,94,.08)', padding: '.75rem', borderRadius: 8, border: '1px solid rgba(200,164,94,.2)' }}>
                  <label style={{ color: 'var(--gold)', fontWeight: 600 }}>👤 Cliente</label>
                  <select value={formData.cliente_id} onChange={(e) => onClienteChange(e.target.value)} style={{ marginTop: '.35rem' }}>
                    <option value="">-- Seleziona Cliente --</option>
                    {clienti.map((c) => <option key={c.id} value={c.id}>{c.codice_cliente ? `[${c.codice_cliente}] ` : ''}{c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}</option>)}
                  </select>
                  <div style={{ fontSize: '.7rem', color: 'var(--mu)', marginTop: '.25rem' }}>Il codice cliente collegherà questa scrittura all'anagrafica</div>
                </div>
                <div className="fg full"><label>Descrizione</label><input value={formData.descrizione} onChange={(e) => { const value = e.target.value; traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'descrizione', scope: 'PrimaNotaView_modal' } }); setFormData((p) => ({ ...p, descrizione: value })) }} placeholder="Descrizione operazione" /></div>
                <div className="fg"><label>Imponibile €</label><input type="number" step="0.01" value={formData.imponibile} onChange={(e) => onImponibileChange(e.target.value)} /></div>
                <div className="fg"><label>Causale IVA</label><select value={formData.causale_iva_id} onChange={(e) => onCausaleIvaChange(e.target.value)}><option value="">-- Seleziona --</option>{causaliIva.map((c) => <option key={c.id} value={c.id}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}</select></div>
                <div className="fg"><label>IVA €</label><input type="number" step="0.01" value={formData.imposta} readOnly style={{ background: 'var(--bg)' }} /></div>
                <div className="fg"><label>Totale €</label><input type="number" step="0.01" value={formData.totale_dare} readOnly style={{ background: 'var(--bg)', fontWeight: 700, color: 'var(--gold)' }} /></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={() => setModalNuova(false)}>Annulla</button>
              <button className="btn" onClick={salvaScrittura}>💾 Registra</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RegistrateView({ documenti }) {
  return (
    <div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '.25rem' }}>✓ Documenti Registrati</div>
      <div style={{ fontSize: '.75rem', color: 'var(--mu)', marginBottom: '1rem' }}>{documenti.length} documenti registrati in contabilità</div>

      {documenti.length === 0 ? (
        <div className="empty"><div className="empty-ico">✓</div><div className="empty-t">Nessun documento registrato</div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Tipo</th><th>N° Doc</th><th>Data</th><th>Soggetto</th><th>Totale</th><th>Registrato</th></tr></thead>
            <tbody>{documenti.map((d) => {
              const tipoBadge = getDocumentoTipoBadge(d.tipo_documento)
              return (
                <tr key={d.id}>
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
      )}
    </div>
  )
}

export default function PrimaNotaHubView({
  contTab,
  documenti,
  scritture,
  pianoConti,
  causaliIva,
  causaliContabili,
  clienti,
  societaAttiva,
  stats,
  caricaTutto,
  patchDocumento,
  confermaDoc,
  registraConfermati,
  openGuidataAt,
  pnGuidataDraft,
  pnGuidataNav,
  gotoGuidataRelative,
  setPnGuidataDraft,
  persistGuidataDraft,
}) {
  if (!societaAttiva) return null

  return (
    <>
      {contTab === 'da_validare' && (
        <DaValidareSplitView
          documenti={documenti.filter((d) => d.workflow_status !== 'registered')}
          pianoConti={pianoConti}
          causaliIva={causaliIva}
          societaId={societaAttiva.id}
          stats={stats}
          onRefresh={caricaTutto}
          patchDocumento={patchDocumento}
          confermaDoc={confermaDoc}
          registraConfermati={registraConfermati}
          onEdit={async (doc, ids, idx) => {
            const listIds =
              Array.isArray(ids) && ids.length
                ? ids
                : documenti.filter((d) => d.workflow_status !== 'registered').map((d) => d.id)
            const i = Number.isFinite(idx) ? idx : Math.max(0, listIds.indexOf(doc.id))
            await openGuidataAt(doc, listIds, i)
          }}
        />
      )}

      {contTab === 'prima_nota' && (
        <PrimaNotaView
          scritture={scritture}
          causali={causaliContabili}
          causaliIva={causaliIva}
          clienti={clienti}
          societaId={societaAttiva.id}
          onRefresh={caricaTutto}
        />
      )}

      {contTab === 'prima_nota_guidata' && (
        <PrimaNotaGuidata
          pianoConti={pianoConti}
          causali={causaliContabili}
          causaliIva={causaliIva}
          clientiFornitori={clienti}
          initialDraft={pnGuidataDraft}
          fromImport={true}
          societaId={societaAttiva?.id}
          onPrev={() => gotoGuidataRelative(-1)}
          onNext={() => gotoGuidataRelative(+1)}
          canPrev={pnGuidataNav.idx > 0}
          canNext={pnGuidataNav.idx >= 0 && pnGuidataNav.idx < (pnGuidataNav.ids?.length || 0) - 1}
          onDraftChange={(d) => {
            setPnGuidataDraft(d)
            persistGuidataDraft(d)
          }}
        />
      )}

      {contTab === 'registrate' && (
        <RegistrateView documenti={documenti.filter((d) => d.workflow_status === 'registered')} />
      )}
    </>
  )
}
