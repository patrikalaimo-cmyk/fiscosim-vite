export function ImportContabilitaPreviewDrawer({ previewRow, onClose, ActionButton, children }) {
  return (
    <aside
      style={{
        position: 'fixed',
        top: '.42rem',
        right: '.42rem',
        bottom: '.42rem',
        width: 'min(420px, calc(100vw - .84rem))',
        zIndex: 60,
        border: '1px solid var(--bd)',
        borderRadius: 14,
        background: 'rgba(12,16,24,.98)',
        boxShadow: '0 18px 44px rgba(0,0,0,.32)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '.45rem',
          padding: '.42rem .5rem',
          borderBottom: '1px solid rgba(124,157,202,.12)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '.68rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Anteprima riga</div>
          <div style={{ fontSize: '.84rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {previewRow?.filename || 'Documento'}
          </div>
        </div>
        <ActionButton label="Chiudi" onClick={onClose} kind="ghost" small />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {children}
      </div>
    </aside>
  )
}
