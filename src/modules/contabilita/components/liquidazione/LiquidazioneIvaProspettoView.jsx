import React, { useState } from 'react'
import { LiquidazioneIvaExportActions } from './LiquidazioneIvaExportActions.jsx'
import { LiquidazioneIvaRegistroTable } from './LiquidazioneIvaRegistroTable.jsx'
import { LiquidazioneIvaRiepilogoPanel } from './LiquidazioneIvaRiepilogoPanel.jsx'

function fmt(n) {
  const val = Number(n || 0)
  return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function LiquidazioneIvaProspettoView({
  prospettoModel,
  dashboardModel,
  societa,
  onClose
}) {
  const [activeTab, setActiveTab] = useState('vendite')

  if (!prospettoModel || !dashboardModel) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mu)' }}>
        Nessun dato del prospetto disponibile. Elabora l'anteprima prima di visualizzare il prospetto.
      </div>
    )
  }

  const {
    dettaglioVendite,
    totaliVendite,
    dettaglioAcquisti,
    totaliAcquisti,
    ivaPerCassa,
    riepilogoLiquidazione,
    creditoCompensabile,
    controlliWarning
  } = prospettoModel

const MESI_ITALIANI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

  const periodLabel = dashboardModel.periodicita === 'trimestrale'
    ? `${dashboardModel.periodo}° Trimestre ${dashboardModel.anno}`
    : `${MESI_ITALIANI[Number(dashboardModel.periodo) - 1]} ${dashboardModel.anno}`

  const isAnteprima = dashboardModel.statoLiquidazione === 'Anteprima'
  const isConsolidata = dashboardModel.statoLiquidazione === 'Consolidata'
  const isDefinitiva = dashboardModel.statoLiquidazione === 'Definitiva'

  const tabs = [
    { id: 'vendite', label: '1. Registro IVA vendite' },
    { id: 'acquisti', label: '2. Registro IVA acquisti' },
    { id: 'cassa', label: '3. IVA per cassa / Esigibilità differita' },
    { id: 'riepilogo', label: '4. Riepilogo liquidazione' },
    { id: 'credito', label: '5. Credito compensabile' },
    { id: 'controlli', label: '6. Controlli e warning' }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '80vh' }}>
      
      {/* Header Prospetto */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid var(--bd)',
          paddingBottom: '1rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          {onClose && (
            <button
              onClick={onClose}
              className="btn-sec"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '0.75rem',
                height: '32px',
                padding: '0 12px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
              title="Torna alla dashboard Liquidazione IVA"
            >
              <span>⬅</span> Torna alla dashboard
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>
              Prospetto liquidazione IVA
            </h2>
            <span
              className={`bdg ${
                isDefinitiva ? 'bdg-success' : isConsolidata ? 'bdg-warn' : 'bdg-info'
              }`}
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                background: isDefinitiva ? 'rgba(46, 204, 113, 0.15)' : isConsolidata ? 'rgba(241, 196, 15, 0.15)' : 'rgba(52, 152, 219, 0.15)',
                color: isDefinitiva ? '#2ecc71' : isConsolidata ? '#f1c40f' : '#3498db'
              }}
            >
              {dashboardModel.statoLiquidazione.toUpperCase()}
            </span>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--mu)', marginTop: '4px', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <span>🏢 <strong>Società:</strong> {societa?.denominazione}</span>
            <span>📅 <strong>Periodo:</strong> {periodLabel}</span>
            <span>👤 <strong>Operatore:</strong> {dashboardModel.meta.operatoreStudio}</span>
            <span>⏱️ <strong>Elaborato il:</strong> {dashboardModel.meta.ultimoAggiornamento === '—' ? new Date().toLocaleDateString('it-IT') : dashboardModel.meta.ultimoAggiornamento}</span>
          </div>
        </div>

        <LiquidazioneIvaExportActions
          prospettoModel={prospettoModel}
          dashboardModel={dashboardModel}
          societa={societa}
          periodoLabel={periodLabel}
          periodicitaLabel={dashboardModel.periodicita === 'trimestrale' ? 'Trimestrale' : 'Mensile'}
          statoLabel={dashboardModel.statoLiquidazione}
          operatoreLabel={dashboardModel.meta.operatoreStudio}
          onClose={onClose}
        />
      </div>

      {/* Banner Stato */}
      {isAnteprima && (
        <div className="alert alert-info" style={{ margin: 0, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          💡 <strong>Anteprima non consolidata:</strong> il prospetto è calcolato sui registri IVA correnti e non è collegato ad alcuna LIPE.
        </div>
      )}
      {isConsolidata && (
        <div className="alert alert-warn" style={{ margin: 0, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⚠️ <strong>Liquidazione consolidata:</strong> LIPE elaborata ed inviata, variazioni del periodo contabile potrebbero richiedere ravvedimento operoso.
        </div>
      )}
      {isDefinitiva && (
        <div className="alert alert-danger" style={{ margin: 0, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(231, 76, 60, 0.08)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.2)' }}>
          🛑 <strong>Liquidazione definitiva:</strong> esercizio chiuso o stampato definitivamente. Le modifiche sono vietate in generale salvo sblocco Owner/Admin.
        </div>
      )}

      {(dettaglioVendite.length === 0 && dettaglioAcquisti.length === 0 && ivaPerCassa.length === 0) && (
        <div className="alert alert-warn" style={{ margin: 0, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(243, 156, 18, 0.08)', color: '#e67e22', border: '1px solid rgba(243, 156, 18, 0.2)' }}>
          ⚠️ <strong>Nota operativa:</strong> il dettaglio analitico delle righe non è disponibile in questa versione. La liquidazione è esposta sui totali consolidati.
        </div>
      )}


      {/* Tab bar */}
      <div className="cont-settings-tabs" role="tablist" style={{ borderBottom: '1px solid var(--bd)', marginBottom: '0.5rem' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`cont-settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div style={{ flex: 1 }}>
        {activeTab === 'vendite' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Registro IVA Vendite - Dettaglio Aliquote</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Imponibile totale: <strong>{fmt(totaliVendite.imponibile)}</strong></span>
            </div>
            <LiquidazioneIvaRegistroTable type="vendita" data={dettaglioVendite} totali={totaliVendite} />
          </div>
        )}

        {activeTab === 'acquisti' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Registro IVA Acquisti - Dettaglio Aliquote</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Imponibile totale: <strong>{fmt(totaliAcquisti.imponibile)}</strong></span>
            </div>
            <LiquidazioneIvaRegistroTable type="acquisto" data={dettaglioAcquisti} totali={totaliAcquisti} />
          </div>
        )}

        {activeTab === 'cassa' && (
          <div>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>Operazioni IVA per cassa / Esigibilità differita</h4>
            {ivaPerCassa.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--s2)', borderRadius: '4px', border: '1px solid var(--bd)', color: 'var(--mu)', fontSize: '0.8rem' }}>
                Nessuna operazione IVA per cassa o a esigibilità differita nel periodo.
              </div>
            ) : (
              <div className="tbl-wrap" style={{ border: '1px solid var(--bd)', borderRadius: '4px', overflow: 'hidden' }}>
                <table className="tbl" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Soggetto</th>
                      <th>Data documento</th>
                      <th className="tar">Totale documento</th>
                      <th className="tar">IVA sospesa / non esigibile</th>
                      <th className="tar">IVA rilasciata nel periodo</th>
                      <th className="tar">Residuo IVA sospesa</th>
                      <th>Motivo esclusione/rilascio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ivaPerCassa.map((row, idx) => (
                      <tr key={idx}>
                        <td><strong>{row.documento}</strong></td>
                        <td>{row.clienteFornitore}</td>
                        <td style={{ fontSize: '0.78rem' }}>{row.dataDocumento ? new Date(row.dataDocumento).toLocaleDateString('it-IT') : '—'}</td>
                        <td className="tar">{fmt(row.totaleDocumento)}</td>
                        <td className="tar" style={{ color: row.ivaSospesa > 0 ? 'var(--gold, #c8a45e)' : 'inherit' }}>{row.ivaSospesa > 0 ? fmt(row.ivaSospesa) : '—'}</td>
                        <td className="tar" style={{ color: row.ivaRilasciata > 0 ? 'var(--gr, #2ecc71)' : 'inherit' }}>{row.ivaRilasciata > 0 ? fmt(row.ivaRilasciata) : '—'}</td>
                        <td className="tar" style={{ fontWeight: 600 }}>{row.residuoIvaSospesa > 0 ? fmt(row.residuoIvaSospesa) : '—'}</td>
                        <td>
                          <span className="bdg bdg-gray" style={{ fontSize: '0.7rem' }}>
                            {row.motivo}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'riepilogo' && (
          <div style={{ maxWidth: '650px', margin: '0 auto' }}>
            <LiquidazioneIvaRiepilogoPanel riepilogo={riepilogoLiquidazione} />
          </div>
        )}

        {activeTab === 'credito' && (
          <div style={{ maxWidth: '550px', margin: '0 auto' }}>
            <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--bd)' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600 }}>Gestione credito compensabile</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span>Credito compensabile inizio periodo:</span>
                  <strong>{fmt(creditoCompensabile.inizioPeriodo)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span>Credito usato in liquidazione:</span>
                  <strong style={{ color: 'var(--rd)' }}>- {fmt(creditoCompensabile.usatoInLiquidazione)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span>Credito usato con F24:</span>
                  <strong style={{ color: 'var(--rd)' }}>- {fmt(creditoCompensabile.usatoF24)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', background: 'var(--s3)', borderRadius: '4px', paddingLeft: '8px', paddingRight: '8px' }}>
                  <span>Credito compensabile finale residuo:</span>
                  <strong style={{ color: 'var(--gr)' }}>{fmt(creditoCompensabile.finale)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span>Credito da riportare al periodo successivo:</span>
                  <strong>{fmt(creditoCompensabile.daRiportare)}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'controlli' && (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--bd)' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600 }}>Controlli diagnostici FiscoSim</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                <div className="card-box" style={{ background: 'var(--s2)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--bd)' }}>
                  <div style={{ color: 'var(--mu)', marginBottom: '4px' }}>Inclusione registri</div>
                  <div><strong>Registri inclusi:</strong> {controlliWarning.registriInclusi}</div>
                  <div style={{ marginTop: '4px' }}><strong>Registri esclusi:</strong> {controlliWarning.registriEsclusi}</div>
                </div>

                <div className="card-box" style={{ background: 'var(--s2)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--bd)' }}>
                  <div style={{ color: 'var(--mu)', marginBottom: '4px' }}>Volume elaborato</div>
                  <div><strong>Righe escluse competenza:</strong> {controlliWarning.righeEscluse}</div>
                  <div style={{ marginTop: '4px' }}><strong>Righe differite per cassa:</strong> {controlliWarning.righeEscluseCassa}</div>
                </div>

                <div className="card-box" style={{ background: 'var(--s2)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--bd)' }}>
                  <div style={{ color: 'var(--mu)', marginBottom: '4px' }}>Regimi ed esigibilità</div>
                  <div><strong>Operazioni split payment:</strong> {controlliWarning.operazioniSplit}</div>
                  <div style={{ marginTop: '4px' }}><strong>Operazioni reverse charge:</strong> {controlliWarning.operazioniReverse}</div>
                </div>

                <div className="card-box" style={{ background: 'var(--s2)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--bd)' }}>
                  <div style={{ color: 'var(--mu)', marginBottom: '4px' }}>Detrazione</div>
                  <div><strong>IVA indetraibile rilevata:</strong> {fmt(controlliWarning.ivaIndetraibileRilevata)}</div>
                </div>
              </div>

              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '4px',
                  background: 'rgba(46, 204, 113, 0.05)',
                  border: '1px solid rgba(46, 204, 113, 0.2)',
                  color: 'var(--gr, #2ecc71)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  textAlign: 'center'
                }}
              >
                ✓ Stato controlli: {controlliWarning.squadrature}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
