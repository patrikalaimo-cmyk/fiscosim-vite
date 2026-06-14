import React from 'react'
import { buildLiquidazioneIvaExportCsv, buildLiquidazioneIvaExportHtml } from '../../application/helper/buildLiquidazioneIvaExportModel.js'

export function LiquidazioneIvaExportActions({
  prospettoModel,
  societa,
  periodoLabel,
  periodicitaLabel,
  statoLabel,
  operatoreLabel,
  onClose = null
}) {
  const meta = {
    societa: societa?.denominazione || '—',
    periodo: periodoLabel,
    periodicita: periodicitaLabel,
    stato: statoLabel,
    operatore: operatoreLabel,
    data: new Date().toLocaleString('it-IT')
  }

  const handlePrint = () => {
    const html = buildLiquidazioneIvaExportHtml(prospettoModel, meta)
    const win = window.open('', '_blank')
    if (!win) {
      alert('Impossibile aprire la finestra di stampa. Verifica che i pop-up non siano bloccati.')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    // Lasciamo che la pagina si carichi prima di stampare
    setTimeout(() => {
      win.print()
    }, 350)
  }

  const handleExportCsv = () => {
    const csvContent = buildLiquidazioneIvaExportCsv(prospettoModel, meta)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const sanitizeComp = String(societa?.denominazione || 'societa').replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const sanitizePeriod = String(periodoLabel).replace(/[^a-z0-9]/gi, '_').toLowerCase()
    
    link.href = url
    link.setAttribute('download', `prospetto_iva_${sanitizeComp}_${sanitizePeriod}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <button
        onClick={handlePrint}
        className="btn-sec"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '36px' }}
        title="Esporta prospetto in formato PDF"
      >
        <span>📄</span> Esporta PDF
      </button>

      <button
        onClick={handleExportCsv}
        className="btn-sec"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '36px' }}
        title="Esporta dati in formato compatibile Excel"
      >
        <span>📊</span> Esporta Excel
      </button>

      <button
        onClick={handlePrint}
        className="btn-sec"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '36px' }}
        title="Stampa prospetto"
      >
        <span>🖨️</span> Stampa
      </button>

      {onClose && (
        <button
          onClick={onClose}
          className="btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '36px', background: 'var(--s3)', border: '1px solid var(--bd)' }}
        >
          Chiudi
        </button>
      )}
    </div>
  )
}
