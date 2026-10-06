import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import {
  buildLiquidazioneIvaExportCsv,
  buildLiquidazioneIvaExportHtml,
  buildLiquidazioneIvaExportXlsx,
  buildLiquidazioneIvaClienteModel,
  buildLiquidazioneIvaClienteHtml,
  buildLiquidazioneIvaClienteXlsx
} from '../../application/helper/buildLiquidazioneIvaExportModel.js'

export function LiquidazioneIvaExportActions({
  prospettoModel,
  dashboardModel,
  societa,
  periodoLabel,
  periodicitaLabel,
  statoLabel,
  operatoreLabel,
  onClose = null
}) {
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [showClienteModal, setShowClienteModal] = useState(false)
  const [isClientWorking, setIsClientWorking] = useState(false)
  const [exportType, setExportType] = useState('dettagliato')

  const getMeta = () => ({
    societa: societa?.denominazione || '—',
    partitaIva: societa?.partita_iva || '—',
    codiceFiscale: societa?.codice_fiscale || '—',
    periodoLabel: periodoLabel,
    periodicitaLabel: periodicitaLabel,
    operatore: operatoreLabel,
    periodicita: dashboardModel?.periodicita || (periodicitaLabel === 'Trimestrale' ? 'trimestrale' : 'mensile'),
    periodoNum: dashboardModel?.periodo || 1,
    anno: dashboardModel?.anno || new Date().getFullYear(),
    data: new Date().toLocaleString('it-IT')
  })

  const handlePrint = async () => {
    setIsPrinting(true)
    setErrorMsg('')
    try {
      await new Promise(resolve => setTimeout(resolve, 450))
      const meta = getMeta()
      const html = exportType === 'sintetico'
        ? buildLiquidazioneIvaClienteHtml(buildLiquidazioneIvaClienteModel(prospettoModel, meta))
        : buildLiquidazioneIvaExportHtml(prospettoModel, meta)
      const win = window.open('', '_blank')
      if (!win) {
        throw new Error('Impossibile aprire la finestra di stampa. Verifica che i pop-up non siano bloccati nel browser.')
      }
      
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      
      setTimeout(() => {
        win.print()
      }, 350)
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message || String(err))
    } finally {
      setIsPrinting(false)
    }
  }

  const handleExportPdf = async () => {
    setIsExportingPdf(true)
    setErrorMsg('')
    try {
      await new Promise(resolve => setTimeout(resolve, 450))
      const meta = getMeta()
      const html = exportType === 'sintetico'
        ? buildLiquidazioneIvaClienteHtml(buildLiquidazioneIvaClienteModel(prospettoModel, meta))
        : buildLiquidazioneIvaExportHtml(prospettoModel, meta)
      const win = window.open('', '_blank')
      if (!win) {
        throw new Error("Impossibile aprire la finestra per l'esportazione PDF. Verifica che i pop-up non siano bloccati.")
      }
      
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      
      setTimeout(() => {
        win.print()
      }, 350)
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message || String(err))
    } finally {
      setIsExportingPdf(false)
    }
  }

  const handleExportExcel = async () => {
    setIsExportingExcel(true)
    setErrorMsg('')
    try {
      await new Promise(resolve => setTimeout(resolve, 600))
      const meta = getMeta()
      
      const sanitizeComp = String(societa?.denominazione || 'societa')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
      const sanitizePeriod = String(periodoLabel)
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()

      if (exportType === 'sintetico') {
        const model = buildLiquidazioneIvaClienteModel(prospettoModel, meta)
        const wb = buildLiquidazioneIvaClienteXlsx(model)
        XLSX.writeFile(wb, `comunicazione_cliente_iva_${sanitizeComp}_${sanitizePeriod}.xlsx`)
      } else {
        const wb = buildLiquidazioneIvaExportXlsx(prospettoModel, meta)
        XLSX.writeFile(wb, `prospetto_iva_${sanitizeComp}_${sanitizePeriod}.xlsx`)
      }
    } catch (err) {
      console.error(err)
      setErrorMsg(`Errore durante l'esportazione Excel: ${err.message || String(err)}`)
    } finally {
      setIsExportingExcel(false)
    }
  }

  // GESTORI PROSPETTO CLIENTE
  const getClienteModel = () => {
    const meta = getMeta()
    return buildLiquidazioneIvaClienteModel(prospettoModel, meta)
  }

  const handlePrintCliente = async () => {
    setIsClientWorking(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 450))
      const model = getClienteModel()
      const html = buildLiquidazioneIvaClienteHtml(model)
      const win = window.open('', '_blank')
      if (!win) {
        throw new Error('Impossibile aprire la finestra di stampa. Controlla i blocchi pop-up.')
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => {
        win.print()
      }, 350)
    } catch (err) {
      alert(`Errore di stampa: ${err.message || err}`)
    } finally {
      setIsClientWorking(false)
    }
  }

  const handleExcelCliente = async () => {
    setIsClientWorking(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      const model = getClienteModel()
      const wb = buildLiquidazioneIvaClienteXlsx(model)
      
      const sanitizeComp = String(societa?.denominazione || 'societa')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
      const sanitizePeriod = String(periodoLabel)
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()

      XLSX.writeFile(wb, `comunicazione_cliente_iva_${sanitizeComp}_${sanitizePeriod}.xlsx`)
    } catch (err) {
      alert(`Errore esportazione Excel: ${err.message || err}`)
    } finally {
      setIsClientWorking(false)
    }
  }

  const isWorking = isExportingPdf || isExportingExcel || isPrinting || isClientWorking
  const clientModel = showClienteModal ? getClienteModel() : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.65rem', color: 'var(--mu)', fontWeight: 600 }}>Tipo prospetto</label>
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value)}
            style={{
              height: '36px',
              padding: '0 8px',
              borderRadius: '4px',
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              minWidth: '160px'
            }}
          >
            <option value="dettagliato">Dettagliato interno</option>
            <option value="sintetico">Sintetico cliente</option>
          </select>
        </div>

        <button
          onClick={handleExportPdf}
          disabled={isWorking}
          className="btn-sec"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '36px', marginTop: '13px' }}
          title="Esporta prospetto in formato PDF tramite dialogo di stampa"
        >
          <span>📄</span> {isExportingPdf ? 'Esportazione PDF...' : 'Esporta PDF'}
        </button>

        <button
          onClick={handleExportExcel}
          disabled={isWorking}
          className="btn-sec"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '36px', marginTop: '13px' }}
          title="Esporta foglio di calcolo multi-scheda (.xlsx)"
        >
          <span>📊</span> {isExportingExcel ? 'Esportazione Excel...' : 'Esporta Excel'}
        </button>

        <button
          onClick={handlePrint}
          disabled={isWorking}
          className="btn-sec"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '36px', marginTop: '13px' }}
          title="Stampa prospetto liquidazione"
        >
          <span>🖨️</span> {isPrinting ? 'Stampa in corso...' : 'Stampa'}
        </button>

        <button
          onClick={() => setShowClienteModal(true)}
          disabled={isWorking}
          className="btn-sec"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            height: '36px',
            borderColor: 'var(--gold, #c8a45e)',
            color: 'var(--gold, #c8a45e)',
            fontWeight: 600,
            marginTop: '13px'
          }}
          title="Genera il prospetto riassuntivo con F24 per la comunicazione al cliente"
        >
          <span>✉️</span> Prospetto cliente
        </button>

        {onClose && (
          <button
            onClick={onClose}
            disabled={isWorking}
            className="btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '36px', background: 'var(--s3)', border: '1px solid var(--bd)', marginTop: '13px' }}
            title="Torna alla dashboard Liquidazione IVA"
          >
            Torna alla dashboard
          </button>
        )}
      </div>

      {errorMsg && (
        <div style={{ color: '#e74c3c', fontSize: '0.78rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ⚠️ <span>{errorMsg}</span>
        </div>
      )}

      {/* MODAL ANTEPRIMA PROSPETTO CLIENTE */}
      {showClienteModal && clientModel && (
        <div className="overlay" style={{ zIndex: 1100 }} onMouseDown={() => setShowClienteModal(false)}>
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '850px', width: '90%', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
          >
            <div className="modal-hdr">
              <div className="modal-drag" />
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>✉️</span> Comunicazione e Prospetto Cliente Liquidazione IVA
              </div>
              <button className="modal-close" onClick={() => setShowClienteModal(false)}>×</button>
            </div>
            
            {/* Toolbar Modal */}
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--bd)', background: 'var(--s2)' }}>
              <button
                className="btn"
                style={{ background: 'var(--gold, #c8a45e)', color: '#000', border: 'none', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 12px', fontSize: '0.8rem', fontWeight: 600 }}
                onClick={handlePrintCliente}
                disabled={isClientWorking}
              >
                <span>🖨️</span> Stampa / Salva PDF
              </button>
              <button
                className="btn-sec"
                style={{ height: '32px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 12px', fontSize: '0.8rem' }}
                onClick={handleExcelCliente}
                disabled={isClientWorking}
              >
                <span>📊</span> Esporta Excel
              </button>
              <button
                className="btn-sec"
                style={{ marginLeft: 'auto', height: '32px' }}
                onClick={() => setShowClienteModal(false)}
              >
                Chiudi
              </button>
            </div>

            {/* Body modal: White page preview simulator */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#090d16', padding: '2rem 1.5rem', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                background: '#ffffff',
                color: '#111827',
                width: '100%',
                maxWidth: '700px',
                minHeight: '800px',
                padding: '2.5rem',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '11px',
                lineHeight: '1.5',
                textAlign: 'left'
              }}>
                {/* Letter Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '12px', marginBottom: '20px' }}>
                  <div>
                    <strong style={{ fontSize: '15px', color: '#111827' }}>FiscoSim</strong><br/>
                    <span style={{ fontSize: '9px', color: '#374151' }}>Software Gestionale Studio Commercialista</span>
                  </div>
                  <div style={{ fontSize: '9px', color: '#374151', textAlign: 'right' }}>
                    <strong style={{ color: '#111827' }}>STUDIO ASSOCIAZIONE PROFESSIONALE</strong><br/>
                    <span style={{ color: '#374151' }}>Elaborazione del prospetto periodico IVA</span><br/>
                    <span style={{ color: '#374151' }}>Operatore: {clientModel.testata.operatore}</span><br/>
                    <span style={{ color: '#374151' }}>Data: {clientModel.testata.dataElaborazione}</span>
                  </div>
                </div>

                {/* Client Card */}
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, color: '#374151' }}>Documento per:</h3>
                  <strong style={{ fontSize: '13px', color: '#111827' }}>{clientModel.testata.societa}</strong><br/>
                  <span style={{ color: '#111827' }}>Partita IVA: {clientModel.testata.partitaIva}</span>
                  {clientModel.testata.codiceFiscale !== '—' && clientModel.testata.codiceFiscale !== clientModel.testata.partitaIva && (
                    <span style={{ color: '#111827' }}> · Codice Fiscale: {clientModel.testata.codiceFiscale}</span>
                  )}
                </div>

                <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '12px', textTransform: 'uppercase', borderBottom: '2px solid #111827', paddingBottom: '4px' }}>
                  Comunicazione Risultato Liquidazione IVA
                </div>

                <p style={{ marginBottom: '12px', color: '#111827' }}>
                  Si comunica che l'elaborazione dei registri contabili IVA per la periodicità <strong>{clientModel.testata.periodicitaLabel}</strong> 
                  relativa al periodo <strong>{clientModel.testata.periodoLabel}</strong> presenta il seguente saldo contabile:
                </p>

                {/* Section A */}
                <div style={{ fontSize: '11px', fontWeight: 700, margin: '14px 0 6px', textTransform: 'uppercase', color: '#111827', borderBottom: '1px solid #cbd5e1', paddingBottom: '2px' }}>
                  A. Dettaglio Calcolo Esigibilità ed Acquisti
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>Per fatture emesse / registro corrispettivi giornalieri</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.ivaEsigibile.fattureEmesse.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>Per IVA differita incassata nel periodo</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.ivaEsigibile.ivaDifferitaIncassata.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr style={{ fontWeight: 700, background: '#f1f5f9' }}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>Totale IVA a debito esigibile nel periodo</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.ivaEsigibile.totaleIvaDebito.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>Acquisti di beni e servizi detraibili (compresi CEE/Importazioni)</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.ivaDetraitta.acquistiBeniServizi.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>Per IVA differita pagata nel periodo</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.ivaDetraitta.ivaDifferitaPagata.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr style={{ fontWeight: 700, background: '#f1f5f9' }}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>Totale IVA detratta nel periodo (Pro-rata: {clientModel.ivaDetraitta.prorata})</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.ivaDetraitta.totaleIvaDetratta.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                  </tbody>
                </table>

                {/* Section B */}
                <div style={{ fontSize: '11px', fontWeight: 700, margin: '14px 0 6px', textTransform: 'uppercase', color: '#111827', borderBottom: '1px solid #cbd5e1', paddingBottom: '2px' }}>
                  B. Risultato Periodico e Compensazioni
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>IVA a debito risultante</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.risultato.ivaDebito.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>IVA a debito da regimi speciali</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.risultato.ivaDebitoSpeciale.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>Riporto credito IVA da periodo precedente</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.risultato.creditoPrecedente.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', color: '#111827' }}>Credito IVA compensabile usato in F24</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{clientModel.risultato.creditoCompensabileUsato.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr style={{ fontWeight: 700, background: '#f1f5f9', color: clientModel.versamento.isDebito ? '#b91c1c' : 'inherit' }}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px' }}>Differenza IVA a debito da versare</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: clientModel.versamento.isDebito ? '#b91c1c' : '#111827' }}>{clientModel.risultato.differenzaDebito.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    <tr style={{ fontWeight: 700, background: '#f1f5f9', color: !clientModel.versamento.isDebito ? '#15803d' : 'inherit' }}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px' }}>Differenza IVA a credito da portare a nuovo</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: !clientModel.versamento.isDebito ? '#15803d' : '#111827' }}>{clientModel.risultato.differenzaCredito.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                  </tbody>
                </table>

                {/* Versamento Card */}
                {clientModel.versamento.isDebito ? (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', fontSize: '10.5px', color: '#991b1b', marginBottom: '15px' }}>
                    <strong>DISPOSIZIONE DI VERSAMENTO:</strong><br/>
                    L'importo di <strong>{clientModel.versamento.impostaArrotondata.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</strong> 
                    {clientModel.versamento.interessiTrimestrali > 0 && ` (di cui interessi trimestrali 1% pari a ${clientModel.versamento.interessiTrimestrali.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €)`} 
                    dovrà essere versato entro il <strong>{clientModel.versamento.scadenza}</strong> tramite modello F24 come riportato nella delega di compilazione seguente.
                  </div>
                ) : (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '12px', fontSize: '10.5px', color: '#166534', marginBottom: '15px' }}>
                    <strong>RISULTATO A CREDITO:</strong><br/>
                    La liquidazione evidenzia un credito IVA di <strong>{clientModel.risultato.differenzaCredito.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</strong> da riportare al periodo successivo. Non è dovuto alcun versamento per il periodo elaborato.
                  </div>
                )}

                {/* Section F24 */}
                <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '20px', textTransform: 'uppercase', color: '#111827', background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', marginBottom: '6px' }}>
                  Sezione Erario - Prospetto di delega di compilazione F24
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', fontSize: '9px', color: '#374151' }}>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 6px', color: '#374151', background: '#f8fafc' }}>Sezione / Tributo</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center', color: '#374151', background: '#f8fafc' }}>Codice tributo</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center', color: '#374151', background: '#f8fafc' }}>Rateazione</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center', color: '#374151', background: '#f8fafc' }}>Anno rif.</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'right', color: '#374151', background: '#f8fafc' }}>Debito</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'right', color: '#374151', background: '#f8fafc' }}>Credito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientModel.versamento.isDebito ? (
                      <>
                        <tr>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', color: '#111827', background: '#ffffff' }}><strong>IMPOSTE DIRETTE - IVA</strong></td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'center', color: '#111827', background: '#ffffff' }}>{clientModel.sezioneErario.codiceTributo}</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'center', color: '#111827', background: '#ffffff' }}>{clientModel.sezioneErario.rateazione || '—'}</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'center', color: '#111827', background: '#ffffff' }}>{clientModel.sezioneErario.annoRiferimento}</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827', background: '#ffffff' }}>{clientModel.sezioneErario.importoDebito.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827', background: '#ffffff' }}>{clientModel.sezioneErario.importoCredito.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                        </tr>
                        <tr style={{ fontWeight: 700, background: '#f8fafc' }}>
                          <td colSpan={4} style={{ border: '1px solid #cbd5e1', padding: '5px 6px', color: '#111827', background: '#f8fafc' }}>TOTALE A (Importi a debito)</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827', background: '#f8fafc' }}>{clientModel.sezioneErario.totaleA.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', background: '#f8fafc' }}></td>
                        </tr>
                        <tr style={{ fontWeight: 700, background: '#f8fafc' }}>
                          <td colSpan={4} style={{ border: '1px solid #cbd5e1', padding: '5px 6px', color: '#111827', background: '#f8fafc' }}>TOTALE B (Importi a credito)</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', background: '#f8fafc' }}></td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111827', background: '#f8fafc' }}>{clientModel.sezioneErario.totaleB.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</td>
                        </tr>
                        <tr style={{ fontWeight: 700, background: '#cbd5e1' }}>
                          <td colSpan={4} style={{ border: '1px solid #cbd5e1', padding: '5px 6px', color: '#111827', background: '#cbd5e1' }}>SALDO FINALE (A - B)</td>
                          <td colSpan={2} style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#991b1b', fontSize: '12px', background: '#cbd5e1' }}>
                            {clientModel.sezioneErario.saldoAB.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €
                          </td>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ border: '1px solid #cbd5e1', padding: '12px', textAlign: 'center', color: '#374151', background: '#ffffff' }}>
                          Nessun importo da esporre in delega F24.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Footer */}
                <div style={{ marginTop: '30px', fontSize: '8px', color: '#374151', textAlign: 'center', borderTop: '1px solid #cbd5e1', paddingTop: '8px' }}>
                  Documento informativo ad uso interno dello studio e del cliente · Stato liquidazione: {clientModel.testata.periodoLabel} ({clientModel.testata.operatore})
                </div>

              </div>
            </div>
            
            <div className="modal-foot">
              <button className="btn-sec" onClick={() => setShowClienteModal(false)}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
