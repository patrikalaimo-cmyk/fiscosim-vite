import React, { useState } from 'react'
import { BaseCombobox } from '../../ui/BaseDropdown.jsx'
import { LiquidazioneIvaLifecyclePanel } from './LiquidazioneIvaLifecyclePanel.jsx'

const MESI_ITALIANI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

function fmt(n) {
  const val = Number(n || 0)
  return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function LiquidazioneIvaDashboard({
  dashboardModel,
  societa,
  periodParams,
  setPeriodParams,
  onUpdatePreview,
  onOpenProspect,
  onPreparaConsolidamento,
  onConsolida,
  loading = false,
  loadingProvvisoria = false,
  feedbackMessage = null,
  previewError = null,
  operatori = [],
  operatoreSel = '',
  setOperatoreSel,
  motivoConsolidamento,
  setMotivoConsolidamento,
  error = null
}) {
  const [showImpostazioni, setShowImpostazioni] = useState(false)
  const [showPeriodicityWarning, setShowPeriodicityWarning] = useState(false)
  const [pendingPeriodicity, setPendingPeriodicity] = useState(null)

  const {
    statoLiquidazione,
    kpis,
    meta,
    storico
  } = dashboardModel

  const isTrimestrale = periodParams.tipo_periodo === 'trimestrale'
  const finalColor = kpis.saldoPeriodo > 0 ? 'var(--rd, #e74c3c)' : 'var(--gr, #2ecc71)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Filtri */}
      <div className="card" style={{ padding: '1rem', border: '1px solid var(--bd)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
          
          <div className="fg" style={{ marginBottom: 0, minWidth: '160px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Società</label>
            <input 
              type="text" 
              value={societa?.denominazione || ''} 
              disabled 
              style={{ width: '100%', height: '36px', background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--text)' }}
            />
          </div>

          <div className="fg" style={{ marginBottom: 0, minWidth: '120px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Periodicità</label>
            <BaseCombobox
              value={periodParams.tipo_periodo}
              onChange={(v) => {
                const targetPeriodicita = v || 'mensile'
                const originalPeriodicita = societa?.tipo_liquidazione_iva || 'mensile'
                if (targetPeriodicita !== originalPeriodicita) {
                  setPendingPeriodicity(targetPeriodicita)
                  setShowPeriodicityWarning(true)
                } else {
                  setPeriodParams(p => ({
                    ...p,
                    tipo_periodo: targetPeriodicita,
                    periodo: 1
                  }))
                }
              }}
              options={[{ id: 'trimestrale', label: 'Trimestrale' }, { id: 'mensile', label: 'Mensile' }]}
              getOptionId={o => o?.id}
              getOptionLabel={o => o?.label}
              searchable={false}
            />
          </div>

          <div className="fg" style={{ marginBottom: 0, minWidth: '90px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Anno</label>
            <input
              type="number"
              value={periodParams.anno}
              onChange={e => {
                const val = parseInt(e.target.value) || new Date().getFullYear()
                setPeriodParams(p => ({ ...p, anno: val }))
              }}
              style={{ width: '100%', height: '36px', background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '0 8px' }}
            />
          </div>

          <div className="fg" style={{ marginBottom: 0, minWidth: '130px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>
              {isTrimestrale ? 'Trimestre' : 'Mese'}
            </label>
            <BaseCombobox
              value={String(periodParams.periodo)}
              onChange={(v) => {
                setPeriodParams(p => ({ ...p, periodo: parseInt(v || '1') }))
              }}
              options={
                isTrimestrale
                  ? [1, 2, 3, 4].map(t => ({ id: String(t), label: `${t}° Trimestre` }))
                  : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({ id: String(m), label: MESI_ITALIANI[m - 1] }))
              }
              getOptionId={o => o?.id}
              getOptionLabel={o => o?.label}
              searchable={false}
            />
          </div>

          <div className="fg" style={{ marginBottom: 0, minWidth: '110px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Stato</label>
            <div style={{
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--bd)',
              borderRadius: '4px',
              fontWeight: 700,
              fontSize: '0.72rem',
              background: statoLiquidazione === 'Definitiva' ? 'rgba(46,204,113,0.1)' : statoLiquidazione === 'Consolidata' ? 'rgba(241,196,15,0.1)' : 'rgba(52,152,219,0.1)',
              color: statoLiquidazione === 'Definitiva' ? '#2ecc71' : statoLiquidazione === 'Consolidata' ? '#f1c40f' : '#3498db'
            }}>
              {statoLiquidazione.toUpperCase()}
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowImpostazioni(!showImpostazioni)}
              className="btn-sec"
              style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              ⚙️ Impostazioni calcolo ▾
            </button>

            {showImpostazioni && (
              <div className="card" style={{
                position: 'absolute',
                top: '40px',
                right: 0,
                width: '280px',
                zIndex: 10,
                padding: '1rem',
                border: '1px solid var(--bd)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Operatore Studio</label>
                  <select 
                    value={operatoreSel} 
                    onChange={e => setOperatoreSel(e.target.value)}
                    style={{ width: '100%', height: '34px', background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--text)' }}
                  >
                    <option value="">Seleziona operatore...</option>
                    {operatori.map(op => (
                      <option key={op.id} value={op.id}>{op.nome} {op.cognome}</option>
                    ))}
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Motivo consolidamento</label>
                  <input
                    type="text"
                    value={motivoConsolidamento}
                    onChange={e => setMotivoConsolidamento(e.target.value)}
                    style={{ width: '100%', height: '34px', background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '0 8px' }}
                  />
                </div>
                <button
                  onClick={() => setShowImpostazioni(false)}
                  className="btn"
                  style={{ width: '100%', height: '30px', background: 'var(--s3)' }}
                >
                  Chiudi
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginTop: '1rem', whiteSpace: 'pre-line', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        {loadingProvvisoria && (
          <div className="alert alert-info" style={{ marginTop: '1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⏳</span>
            <span>Calcolo anteprima in corso...</span>
          </div>
        )}

        {previewError && (
          <div className="alert alert-err" style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
            <div style={{ fontWeight: 700 }}>Errore durante l’aggiornamento dell’anteprima</div>
            {previewError.detail && (
              <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.85 }}>
                {previewError.detail}
              </div>
            )}
          </div>
        )}

        {feedbackMessage && !loadingProvvisoria && !previewError && (
          <div className={`alert ${feedbackMessage.type === 'warn' ? 'alert-warn' : 'alert-ok'}`} style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
            <div style={{ fontWeight: 600 }}>{feedbackMessage.text}</div>
            {feedbackMessage.subText && (
              <div style={{ marginTop: '4px', fontSize: '0.75rem', opacity: 0.9 }}>
                {feedbackMessage.subText}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Alert Override Temporaneo */}
      {periodParams.tipo_periodo !== (societa?.tipo_liquidazione_iva || 'mensile') && (
        <div className="alert alert-warn" style={{ margin: 0, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⚠️ <strong>Periodicità diversa dall’anagrafica:</strong> anteprima calcolata con override temporaneo.
        </div>
      )}

      {/* Titolo di riepilogo periodo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
          {statoLiquidazione === 'Anteprima' ? 'Anteprima liquidazione IVA' : `Liquidazione IVA ${statoLiquidazione.toLowerCase()}`}
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>
          ▸ Nessun adempimento LIPE collegato a questa liquidazione.
        </span>
      </div>

      {/* Riepilogo KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
        
        <div className="card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--bd)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--mu)', letterSpacing: '0.04em' }}>IVA VENDITE LORDA</span>
              <span style={{ fontSize: '1rem' }}>🛒</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
              {fmt(kpis.ivaVenditeLorda)}
            </div>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--mu)', marginTop: '0.5rem' }}>
            Imponibile: {fmt(dashboardModel.currentCalc?.totaliVendite?.imponibile || 0)}
          </div>
        </div>

        <div className="card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--bd)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--mu)', letterSpacing: '0.04em' }}>IVA SPLIT PAYMENT ESCLUSA</span>
              <span style={{ fontSize: '1rem' }}>🏢</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--mu)' }}>
              {fmt(kpis.ivaSplitPayment)}
            </div>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--mu)', marginTop: '0.5rem' }}>
            Imponibile: {fmt(dashboardModel.currentCalc?.dettaglioVendite?.reduce((s, g) => s + g.ivaSplitEsclusa, 0) || 0)}
          </div>
        </div>

        <div className="card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--bd)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--mu)', letterSpacing: '0.04em' }}>IVA A DEBITO EFFETTIVA</span>
              <span style={{ fontSize: '1rem' }}>📈</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
              {fmt(kpis.ivaDebitoEffettiva)}
            </div>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--mu)', marginTop: '0.5rem' }}>
            Al netto di Split payment
          </div>
        </div>

        <div className="card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--bd)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--mu)', letterSpacing: '0.04em' }}>IVA ACQUISTI DETRAIBILE</span>
              <span style={{ fontSize: '1rem' }}>🛍️</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
              {fmt(kpis.ivaAcquisti)}
            </div>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--mu)', marginTop: '0.5rem' }}>
            Imponibile: {fmt(dashboardModel.currentCalc?.totaliAcquisti?.imponibile || 0)}
          </div>
        </div>

        <div className="card" style={{
          padding: '0.85rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          border: `1px solid ${finalColor}`,
          background: kpis.saldoPeriodo > 0 ? 'rgba(231,76,60,0.02)' : 'rgba(46,204,113,0.02)'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--mu)', letterSpacing: '0.04em' }}>ESITO PERIODO</span>
              <span style={{ fontSize: '1rem' }}>{kpis.saldoPeriodo > 0 ? '⚠️' : '✓'}</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: finalColor }}>
              {kpis.saldoPeriodo > 0 ? 'Debito ' : 'Credito '}{fmt(Math.abs(kpis.saldoPeriodo))}
            </div>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--mu)', marginTop: '0.5rem' }}>
            {kpis.saldoPeriodo > 0 ? 'Da versare con F24' : 'Credito IVA a riportare'}
          </div>
        </div>

      </div>

      {/* Dettagli micro */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '0.75rem',
        padding: '0.75rem',
        background: 'var(--s2)',
        borderRadius: '4px',
        border: '1px solid var(--bd)',
        fontSize: '0.75rem',
        color: 'var(--mu)'
      }}>
        <div>⚙️ <strong>Registri inclusi:</strong> <strong style={{ color: 'var(--text)' }}>{meta.registriInclusiCount || 27}</strong><br/>Tutti i registri IVA</div>
        <div>❌ <strong>Registri esclusi:</strong> <strong style={{ color: 'var(--text)' }}>{meta.registriEsclusiCount || 0}</strong><br/>Esclusi manualmente</div>
        <div>⏳ <strong>Righe differite:</strong> <strong style={{ color: 'var(--text)' }}>{meta.righeEscluseDifferitaCount || 0}</strong><br/>Art. 6, c. 5 DPR 633/72</div>
        <div>⏱️ <strong>Ultimo agg:</strong> <strong style={{ color: 'var(--text)' }}>{meta.ultimoAggiornamento}</strong></div>
        <div>👤 <strong>Operatore:</strong> <strong style={{ color: 'var(--text)' }}>{meta.operatoreStudio}</strong></div>
        <div>🧮 <strong>Metodo:</strong> <strong style={{ color: 'var(--text)' }}>{meta.metodoCalcolo}</strong></div>
      </div>

      {/* Timeline e Azioni */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.25fr', gap: '1rem', alignItems: 'start' }}>
        
        {/* Timeline */}
        <LiquidazioneIvaLifecyclePanel statoLiquidazione={statoLiquidazione} />

        {/* Azioni */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          
          <div className="card" style={{ padding: '1rem', border: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Azioni operative</h4>
            
            <button
              onClick={onUpdatePreview}
              className="btn"
              disabled={loading}
              style={{ width: '100%', height: '36px', background: '#f39c12', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              {loadingProvvisoria ? 'Aggiornamento...' : '🔄 Aggiorna anteprima'}
            </button>

            <button
              onClick={onOpenProspect}
              className="btn-sec"
              style={{ width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              🔍 Visualizza prospetto dettagliato
            </button>

            <button
              onClick={onPreparaConsolidamento}
              className="btn-sec"
              disabled={loading || !operatoreSel}
              style={{ width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              📥 Prepara consolidamento
            </button>

            <button
              onClick={onConsolida}
              className="btn"
              disabled={loading || statoLiquidazione === 'Definitiva' || !operatoreSel}
              style={{ width: '100%', height: '36px', background: '#3498db', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              🔒 Consolida liquidazione
            </button>

            <button
              onClick={onOpenProspect}
              className="btn-sec"
              style={{ width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              🖨️ Esporta prospetto
            </button>
          </div>

          {/* Box Informativo */}
          <div className="card" style={{ padding: '1rem', border: '1px solid rgba(241,196,15,0.2)', background: 'rgba(241,196,15,0.02)', fontSize: '0.75rem', color: 'var(--mu)' }}>
            <h5 style={{ margin: '0 0 4px', fontWeight: 700, color: '#f1c40f', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>⚠️</span> Attenzione
            </h5>
            <p style={{ margin: '0 0 8px', lineHeight: '1.4' }}>
              La modifica di una liquidazione IVA già consolidata e collegata a LIPE potrebbe richiedere il ravvedimento della LIPE stessa.
            </p>
            <a href="#" onClick={e => { e.preventDefault(); alert('Verificare le comunicazioni periodiche LIPE sul cassetto fiscale prima di rettificare.') }} style={{ color: '#f1c40f', textDecoration: 'underline', fontWeight: 600 }}>Scopri di più ↗</a>
          </div>

        </div>

      </div>

      {/* Storico liquidazioni */}
      <div className="card" style={{ border: '1px solid var(--bd)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--bd)' }}>
          <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>Storico liquidazioni IVA</h4>
          <button
            onClick={() => alert('Visualizzazione di tutte le liquidazioni storiche societarie')}
            className="btn-sec"
            style={{ height: '28px', padding: '0 8px', fontSize: '0.72rem' }}
          >
            Visualizza tutto ↗
          </button>
        </div>

        <div className="tbl-wrap">
          <table className="tbl" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Periodicità</th>
                <th>Stato</th>
                <th className="tar">IVA Dovuta</th>
                <th className="tar">Credito</th>
                <th>LIPE</th>
                <th>Operatore</th>
                <th>Data aggiornamento</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {storico.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--mu)', fontSize: '0.8rem' }}>
                    Nessuna liquidazione IVA storicizzata. Calcola e consolida per popolare lo storico.
                  </td>
                </tr>
              ) : (
                storico.map((row, idx) => (
                  <tr key={idx}>
                    <td><strong>{row.periodoLabel}</strong></td>
                    <td><span className="bdg bdg-gray">{String(row.periodicita).toUpperCase()}</span></td>
                    <td>
                      <span
                        className={`bdg ${
                          row.stato === 'definitiva' ? 'bdg-success' : 'bdg-warn'
                        }`}
                        style={{
                          fontSize: '0.68rem',
                          background: row.stato === 'definitiva' ? 'rgba(46,204,113,0.1)' : 'rgba(241,196,15,0.1)',
                          color: row.stato === 'definitiva' ? '#2ecc71' : '#f1c40f'
                        }}
                      >
                        {row.statoLabel}
                      </span>
                    </td>
                    <td className="tar" style={{ fontWeight: row.ivaDovuta > 0 ? 700 : 400, color: row.ivaDovuta > 0 ? 'var(--rd)' : 'inherit' }}>
                      {row.ivaDovuta > 0 ? fmt(row.ivaDovuta) : '—'}
                    </td>
                    <td className="tar" style={{ fontWeight: row.credito > 0 ? 700 : 400, color: row.credito > 0 ? 'var(--gr)' : 'inherit' }}>
                      {row.credito > 0 ? fmt(row.credito) : '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{row.lipe}</td>
                    <td>{row.operatore}</td>
                    <td style={{ fontSize: '0.75rem' }}>{row.dataAggiornamento}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          onClick={() => {
                            setPeriodParams({ tipo_periodo: row.periodicita, anno: row.anno, periodo: row.periodo })
                            onOpenProspect()
                          }}
                          className="btn-sec"
                          style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                          title="Visualizza prospetto analitico"
                        >
                          👁️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div style={{ padding: '0.5rem 1rem', background: 'var(--s2)', borderTop: '1px solid var(--bd)', fontSize: '0.7rem', color: 'var(--mu)' }}>
          ℹ I dati esposti sono aggiornati all'ultimo calcolo disponibile.
        </div>
      </div>

      {showPeriodicityWarning && (
        <div className="overlay" style={{ zIndex: 1000 }} onMouseDown={() => {
          setShowPeriodicityWarning(false)
        }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">⚠️ Attenzione: Variazione Periodicità</div>
              <button className="modal-close" onClick={() => setShowPeriodicityWarning(false)}>×</button>
            </div>
            <div className="modal-body" style={{ fontSize: '0.85rem', lineHeight: '1.5', padding: '1.25rem' }}>
              <p style={{ margin: 0 }}>
                Attenzione: la periodicità IVA selezionata non coincide con quella impostata nell’anagrafica della società. 
                In anagrafica risulta <strong>“{String(societa?.tipo_liquidazione_iva || 'mensile').toUpperCase()}”</strong>, mentre nella liquidazione stai usando <strong>“{String(pendingPeriodicity).toUpperCase()}”</strong>. Continuare comunque con questa periodicità solo per l’anteprima corrente?
              </p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'end' }}>
              <button 
                className="btn-sec" 
                onClick={() => {
                  setShowPeriodicityWarning(false)
                }}
              >
                Annulla e torna alla periodicità anagrafica
              </button>
              <button 
                className="btn" 
                style={{ background: '#f39c12', color: '#fff', border: 'none' }}
                onClick={() => {
                  setPeriodParams(p => ({
                    ...p,
                    tipo_periodo: pendingPeriodicity,
                    periodo: 1
                  }))
                  setShowPeriodicityWarning(false)
                }}
              >
                Continua solo per questa anteprima
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
