export function OperatorAssistPanel({
  items = [],
  onResolve = null,
  onManualResolve = null,
  onRequestClarification = null,
  title = 'Assist AI',
}) {
  if (!Array.isArray(items) || items.length === 0) return null

  return (
    <div
      style={{
        background: 'rgba(200,164,94,.06)',
        border: '1px solid rgba(200,164,94,.22)',
        borderRadius: 12,
        padding: '.8rem',
        marginBottom: '.75rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'baseline', marginBottom: '.45rem' }}>
        <div>
          <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.06em', color: 'var(--gold)' }}>{title.toUpperCase()}</div>
          <div style={{ fontSize: '.74rem', color: 'var(--mu)' }}>Domande brevi, opzioni guidate, nessun passaggio inutile.</div>
        </div>
        <span className="bdg bdg-gold" style={{ fontSize: '.64rem' }}>
          {items.length} chiarimento{items.length > 1 ? 'i' : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gap: '.6rem' }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              borderRadius: 10,
              padding: '.65rem',
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '.82rem' }}>{item.title}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginTop: '.1rem' }}>{item.message}</div>
                {item.reason && <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.15rem' }}>{item.reason}</div>}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '.35rem', marginTop: '.55rem' }}>
              {item.options?.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="btn-sec"
                  onClick={() => onResolve?.(item, option)}
                  style={{
                    textAlign: 'left',
                    padding: '.45rem .55rem',
                    borderRadius: 8,
                    background: option.id === 'manual_blank' ? 'transparent' : 'rgba(200,164,94,.06)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.55rem', alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 700 }}>{option.label}</div>
                    {option.score != null && <span style={{ fontSize: '.65rem', color: 'var(--mu)' }}>{option.score}%</span>}
                  </div>
                  {option.description && <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.1rem' }}>{option.description}</div>}
                </button>
              ))}
            </div>

            {item.manualPlaceholder && (
              <div style={{ marginTop: '.45rem', display: 'grid', gap: '.35rem' }}>
                <input
                  type="text"
                  placeholder={item.manualPlaceholder}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = String(e.currentTarget.value || '').trim()
                      if (value) onManualResolve?.(item, value)
                    }
                  }}
                  style={{
                    width: '100%',
                    background: 'var(--s1)',
                    border: '1px solid var(--bd)',
                    color: 'var(--tx)',
                    borderRadius: 8,
                    padding: '.45rem .55rem',
                    fontSize: '.78rem',
                  }}
                />
                <button
                  type="button"
                  className="btn-sec btn-sm"
                  onClick={(e) => {
                    const input = e.currentTarget.parentElement?.querySelector('input')
                    const value = String(input?.value || '').trim()
                    if (value) onManualResolve?.(item, value)
                  }}
                >
                  Applica testo manuale
                </button>
              </div>
            )}

            {onRequestClarification && (
              <div style={{ marginTop: '.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-sec btn-sm" onClick={() => onRequestClarification(item)}>
                  Intervento operatore
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
