function fmt(value) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0,00'
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function MetricCard({ label, value, tone = 'neutral', compact = false }) {
  const palette = {
    neutral: { fg: 'var(--tx)' },
    positive: { fg: '#8be28e' },
    negative: { fg: '#ff8f8f' },
    accent: { fg: '#9bd3ff' },
    warning: { fg: '#ffb054' },
  }
  const style = palette[tone] || palette.neutral

  return (
    <div
      className="card"
      style={{
        margin: 0,
        padding: '.66rem .85rem',
        background: 'linear-gradient(180deg, rgba(16,42,68,.72), rgba(10,26,43,.9))',
        border: '1px solid rgba(96,165,250,.12)',
        minHeight: compact ? 76 : 88,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.02)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: 'rgba(255,255,255,.04)',
              color: style.fg,
              display: 'grid',
              placeItems: 'center',
              fontSize: '.8rem',
              fontWeight: 800,
              flex: '0 0 auto',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.05)',
            }}
          >
            {label.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.72rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
            <div style={{ fontSize: compact ? '1.04rem' : '1.16rem', fontWeight: 800, marginTop: '.1rem', color: style.fg, lineHeight: 1.1 }}>
              {typeof value === 'number' ? fmt(value) : value}
            </div>
          </div>
        </div>
        <div style={{ color: 'rgba(255,255,255,.28)', fontSize: '1.3rem', lineHeight: 1, flex: '0 0 auto' }}>›</div>
      </div>
    </div>
  )
}

export function ConsultazioneSaldoSummary({ summary, compact = false, note = '' }) {
  if (!summary) return null

  const cards = [
    { label: 'Righe trovate', value: summary.righeTrovate, tone: 'accent' },
    { label: 'Totale dare', value: summary.totaleDare, tone: 'positive' },
    { label: 'Totale avere', value: summary.totaleAvere, tone: 'negative' },
    { label: 'Saldo', value: summary.saldo, tone: Number(summary.saldo || 0) >= 0 ? 'positive' : 'negative' },
    { label: 'Da verificare / Non quadrate', value: summary.daVerificare || 0, tone: (summary.daVerificare || 0) > 0 ? 'warning' : 'neutral' },
  ]

  return (
    <div
      className="card"
      style={{
        marginBottom: '.75rem',
        overflow: 'hidden',
        borderRadius: 20,
        border: '1px solid rgba(96,165,250,.1)',
        background: 'linear-gradient(180deg, rgba(19,45,70,.82), rgba(12,31,49,.9))',
        boxShadow: '0 18px 40px rgba(0,0,0,.13)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: '.5rem',
          padding: '.7rem .85rem .85rem',
        }}
      >
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} compact={compact} />
        ))}
      </div>
    </div>
  )
}
