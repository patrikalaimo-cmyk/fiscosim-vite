import { formatMoney } from './registrazioneUi.js'

function Metric({ label, value, tone = 'neutral' }) {
  const color = tone === 'positive' ? '#8be28e' : tone === 'negative' ? '#ff8f8f' : 'var(--tx)'
  return (
    <div style={{ display: 'grid', gap: '.12rem', minWidth: 0 }}>
      <div style={{ fontSize: '.62rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 850, color, lineHeight: 1.08, whiteSpace: 'nowrap' }}>
        {typeof value === 'number' ? `${formatMoney(value)} €` : value}
      </div>
    </div>
  )
}

export function RegistrazioneTotalsBar({ totals, validation }) {
  if (!totals) return null
  const balanced = Boolean(totals.isBalanced)
  const statusText = balanced
    ? 'Quadrata'
    : validation?.blockers?.[0]
      ? validation.blockers[0]
      : validation?.warnings?.[0]
        ? validation.warnings[0]
        : totals.differenza
          ? `Sbilancio ${formatMoney(Math.abs(totals.differenza))} in ${totals.differenza > 0 ? 'Avere' : 'Dare'}`
          : 'Da completare'

  return (
    <div className="erp-bulkbar" style={{ marginTop: '.75rem', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: '1 1 720px', minWidth: 0 }}>
        <Metric label="Totale dare" value={totals.totaleDare} tone="positive" />
        <Metric label="Totale avere" value={totals.totaleAvere} tone="negative" />
        <Metric label="Differenza" value={totals.differenza} tone={balanced ? 'positive' : 'negative'} />
        <Metric label="Stato quadratura" value={balanced ? 'Quadrata' : 'Non quadrata'} tone={balanced ? 'positive' : 'negative'} />
      </div>
      <span className={`bdg ${balanced ? 'bdg-green' : 'bdg-gold'}`} style={{ minHeight: 26, padding: '2px 7px', fontSize: '.58rem', whiteSpace: 'nowrap' }}>
        {statusText}
      </span>
    </div>
  )
}
