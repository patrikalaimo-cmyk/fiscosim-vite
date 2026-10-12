/**
 * Cronologia Import — interrogabile (file / hash / esito / PN).
 */
export function ImportCronologiaPanel({
  open = false,
  entries = [],
  onClose,
}) {
  if (!open) return null

  const rows = Array.isArray(entries) ? entries : []

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cronologia import"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(2, 8, 18, .62)',
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
      }}
    >
      <section
        style={{
          width: 'min(920px, 100%)',
          maxHeight: 'min(78vh, 720px)',
          overflow: 'auto',
          borderRadius: 16,
          border: '1px solid rgba(96,165,250,.22)',
          background: 'linear-gradient(180deg, rgba(9,24,40,.98), rgba(8,20,34,.96))',
          boxShadow: '0 24px 48px rgba(0,0,0,.35)',
          padding: '.7rem .8rem .85rem',
          display: 'grid',
          gap: '.55rem',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
          <div>
            <div style={{ fontSize: '.7rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Import Contabilità
            </div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--tx)' }}>Cronologia import</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,.35)',
              background: 'rgba(15,23,42,.75)',
              color: 'var(--tx)',
              padding: '.28rem .55rem',
              cursor: 'pointer',
            }}
          >
            Chiudi
          </button>
        </header>

        {rows.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--mu)', fontSize: '.85rem' }}>
            Nessun commit import in cronologia per questa società.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--mu)' }}>
                <th style={{ padding: '.28rem .2rem', fontWeight: 600 }}>Quando</th>
                <th style={{ padding: '.28rem .2rem', fontWeight: 600 }}>File</th>
                <th style={{ padding: '.28rem .2rem', fontWeight: 600 }}>Hash</th>
                <th style={{ padding: '.28rem .2rem', fontWeight: 600 }}>Esito</th>
                <th style={{ padding: '.28rem .2rem', fontWeight: 600 }}>Documento</th>
                <th style={{ padding: '.28rem .2rem', fontWeight: 600 }}>PN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.requestId || row.primaNotaId || row.sourceHash}-${row.createdAt}`}>
                  <td style={{ padding: '.28rem .2rem', color: 'var(--tx)', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {String(row.createdAt || '').replace('T', ' ').slice(0, 19) || '—'}
                  </td>
                  <td style={{ padding: '.28rem .2rem', color: 'var(--tx)', verticalAlign: 'top', wordBreak: 'break-all' }}>
                    {row.sourceFileName || '—'}
                  </td>
                  <td style={{ padding: '.28rem .2rem', color: 'var(--tx)', verticalAlign: 'top', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                    {row.sourceHash || '—'}
                  </td>
                  <td style={{ padding: '.28rem .2rem', color: 'var(--tx)', verticalAlign: 'top' }}>
                    {row.esito || '—'}
                  </td>
                  <td style={{ padding: '.28rem .2rem', color: 'var(--tx)', verticalAlign: 'top' }}>
                    {row.numeroDocumento || '—'}
                  </td>
                  <td style={{ padding: '.28rem .2rem', color: 'var(--tx)', verticalAlign: 'top', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                    {row.primaNotaId ? String(row.primaNotaId).slice(0, 8) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
