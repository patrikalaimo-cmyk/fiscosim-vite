export function ImportActionsBar({
  documenti,
  onConfermaTutti,
  onSvuotaTutto,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
      <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>
        {documenti.length} documento{documenti.length > 1 ? 'i' : ''} da confermare
      </div>
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button
          onClick={onConfermaTutti}
          style={{
            background: 'var(--gold)',
            border: 'none',
            color: '#0d1117',
            borderRadius: 6,
            padding: '.35rem .9rem',
            fontSize: '.75rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ✓ Conferma tutti
        </button>
        <button
          onClick={onSvuotaTutto}
          style={{
            background: 'transparent',
            border: '1px solid rgba(224,82,82,.4)',
            color: '#e05252',
            borderRadius: 6,
            padding: '.35rem .9rem',
            fontSize: '.75rem',
            cursor: 'pointer',
          }}
        >
          🗑 Svuota tutto
        </button>
      </div>
    </div>
  )
}
