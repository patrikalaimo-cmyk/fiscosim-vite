export function ImportRow({ label, value, onChange, type = 'text' }) {
  return (
    <div style={{ marginBottom: '.35rem' }}>
      <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginBottom: '.1rem' }}>{label}</div>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        style={{
          width: '100%',
          background: 'var(--s2)',
          border: '1px solid var(--bd)',
          color: 'var(--tx)',
          borderRadius: 5,
          padding: '.3rem .45rem',
          fontSize: '.78rem',
        }}
      />
    </div>
  )
}
