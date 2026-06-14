import React from 'react'

function fmt(n) {
  const val = Number(n || 0)
  return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function LiquidazioneIvaRiepilogoPanel({ riepilogo }) {
  if (!riepilogo) return null
  riep.val = riepilogo

  const items = [
    { label: 'IVA da registro vendite', val: riep.ivaVendite, subtract: false },
    { label: 'IVA da registro corrispettivi', val: riep.ivaCorrispettivi, subtract: false },
    { label: 'IVA split payment detratta / esclusa', val: riep.ivaSplitPayment, subtract: true },
    { label: 'Totale imposta esigibile del periodo', val: riep.totaleImpostaEsigibile, subtract: false, highlight: true },
    { label: 'IVA da registro acquisti (detraibile)', val: riep.ivaAcquistiDetraibile, subtract: true },
    { label: 'IVA acquisti indetraibile (inclusa nei registri)', val: riep.ivaAcquistiIndetraibile, subtract: false, muted: true },
    { label: 'Totale imposta detraibile del periodo', val: riep.totaleImpostaDetraibile, subtract: false, highlight: true },
    { label: 'Credito IVA periodo precedente', val: riep.creditoIvaPrecedente, subtract: true },
    { label: 'Credito compensabile usato in liquidazione', val: riep.creditoCompensabileUsato, subtract: true },
    { label: 'Acconto IVA versato', val: riep.accontoIva, subtract: true },
    { label: 'Interessi trimestrali liquidazione (1%)', val: riep.interessiTrimestrali, subtract: false, hideZero: true }
  ]

  const finalColor = riepilogo.risultatoTipo === 'debito' ? 'var(--rd, #e74c3c)' : 'var(--gr, #2ecc71)'
  const finalLabel = riepilogo.risultatoTipo === 'debito' ? 'RISULTATO FINALE: IVA A DEBITO' : 'RISULTATO FINALE: IVA A CREDITO'

  return (
    <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--bd)' }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
        Riepilogo contabile liquidazione
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((item, idx) => {
          if (item.hideZero && !item.val) return null

          const isHighlight = item.highlight
          const isMuted = item.muted
          const sign = item.subtract ? '- ' : ''

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.35rem 0',
                borderBottom: isHighlight ? '1.5px solid var(--bd)' : '1px solid rgba(255, 255, 255, 0.03)',
                fontWeight: isHighlight ? 700 : 400,
                fontSize: '0.8rem',
                color: isMuted ? 'var(--mu)' : 'var(--text)',
                background: isHighlight ? 'rgba(255, 255, 255, 0.01)' : 'transparent',
                paddingLeft: isMuted ? '0.75rem' : '0'
              }}
            >
              <span>{item.label}</span>
              <span>{sign}{fmt(item.val)}</span>
            </div>
          )
        })}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0.75rem 0.5rem',
            marginTop: '0.5rem',
            borderRadius: '4px',
            background: 'var(--s3)',
            fontWeight: 800,
            fontSize: '0.9rem',
            color: finalColor,
            borderLeft: `4px solid ${finalColor}`
          }}
        >
          <span>{finalLabel}</span>
          <span>{fmt(riepilogo.risultatoFinale)}</span>
        </div>
      </div>
    </div>
  )
}

// Fallback selector helper
const riep = {
  get ivaVendite() { return this._val?.ivaVendite || 0 },
  get ivaCorrispettivi() { return this._val?.ivaCorrispettivi || 0 },
  get ivaSplitPayment() { return this._val?.ivaSplitPayment || 0 },
  get totaleImpostaEsigibile() { return this._val?.totaleImpostaEsigibile || 0 },
  get ivaAcquistiDetraibile() { return this._val?.ivaAcquistiDetraibile || 0 },
  get ivaAcquistiIndetraibile() { return this._val?.ivaAcquistiIndetraibile || 0 },
  get totaleImpostaDetraibile() { return this._val?.totaleImpostaDetraibile || 0 },
  get creditoIvaPrecedente() { return this._val?.creditoIvaPrecedente || 0 },
  get creditoCompensabileUsato() { return this._val?.creditoCompensabileUsato || 0 },
  get accontoIva() { return this._val?.accontoIva || 0 },
  get interessiTrimestrali() { return this._val?.interessiTrimestrali || 0 },
  set val(v) { this._val = v }
}
