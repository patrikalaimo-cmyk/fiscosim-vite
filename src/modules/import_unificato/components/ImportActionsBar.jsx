export function ImportActionsBar({
  documenti,
  onConfermaTutti,
  onSvuotaTutto,
  busy = false,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
      <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>
        {documenti.length} documento{documenti.length > 1 ? 'i' : ''} da confermare
      </div>
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button
          onClick={onConfermaTutti}
          disabled={busy}
          style={{
            background: 'var(--gold)',
            border: 'none',
            color: '#0d1117',
            borderRadius: 6,
            padding: '.35rem .9rem',
            fontSize: '.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Conferma in corso...' : 'âœ“ Conferma tutti'}
        </button>
        <button
          onClick={onSvuotaTutto}
          disabled={busy}
          style={{
            background: 'transparent',
            border: '1px solid rgba(224,82,82,.4)',
            color: '#e05252',
            borderRadius: 6,
            padding: '.35rem .9rem',
            fontSize: '.75rem',
            cursor: 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          ðŸ—‘ Svuota tutto
        </button>
      </div>
    </div>
  )
}
