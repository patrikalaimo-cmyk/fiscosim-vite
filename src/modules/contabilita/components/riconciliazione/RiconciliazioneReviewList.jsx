const severityToneMap = {
  green: { color: '#8ee7b6', border: 'rgba(88, 182, 132, 0.23)' },
  amber: { color: '#ffd38c', border: 'rgba(219, 170, 80, 0.25)' },
  red: { color: '#ff9fb0', border: 'rgba(231, 99, 121, 0.22)' },
  blue: { color: '#9fd0ff', border: 'rgba(98, 154, 214, 0.24)' },
}

function Badge({ label, tone = 'blue' }) {
  const selectedTone = severityToneMap[tone] || severityToneMap.blue
  return (
    <span
      className="bdg"
      style={{
        background: 'rgba(14, 32, 54, 0.96)',
        color: selectedTone.color,
        border: `1px solid ${selectedTone.border}`,
        fontSize: '.62rem',
        padding: '.14rem .38rem',
      }}
    >
      {label}
    </span>
  )
}

export default function RiconciliazioneReviewList({
  items = [],
  onMarkVerified,
  onMarkIgnored,
  onMarkManualMapping,
  onOpenDocument,
  onSelectMovement,
  selectedMovementId,
}) {
  const buildItemKey = (item, index) => {
    const raw = String(item?.rawText || '').trim().slice(0, 48)
    return [
      String(item?.reviewKey || '').trim(),
      String(item?.rawRowId || '').trim(),
      String(item?.linkedMovementId || '').trim(),
      String(item?.movementId || '').trim(),
      String(item?.pageNumber || '').trim(),
      raw,
      String(index),
    ].join('|')
  }

  return (
    <div style={{ display: 'grid', gap: '.35rem' }}>
      {items.length ? items.map((item, index) => {
        const isActive = item.linkedMovementId && item.linkedMovementId === selectedMovementId
        const tone = item.severity || 'amber'
        return (
          <div
            key={buildItemKey(item, index)}
            style={{
              borderRadius: 12,
              border: `1px solid ${severityToneMap[tone]?.border || severityToneMap.amber.border}`,
              background: isActive ? 'rgba(22, 49, 74, 0.38)' : 'rgba(9, 20, 35, 0.56)',
              padding: '.45rem .5rem',
              display: 'grid',
              gap: '.28rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.4rem', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '.74rem', color: '#eef6ff' }}>
                  {item.pageNumber ? `p.${item.pageNumber}` : 'p.-'} | {item.reviewKey || item.rawRowId || '-'}
                </div>
                <div style={{ fontSize: '.62rem', color: 'rgba(210, 223, 237, 0.76)' }}>
                  {item.movementId ? `Movimento ${item.movementId}` : 'Nessun movimento collegato'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Badge label={item.reviewLabel || 'Da verificare'} tone={tone} />
                {item.correction ? <Badge label="Corretto" tone="green" /> : null}
              </div>
            </div>

            <div style={{ fontSize: '.72rem', color: '#dce9f8', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {item.rawText || '-'}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', fontSize: '.62rem', color: 'rgba(215, 227, 239, 0.82)' }}>
              <span className="bdg bdg-cy">Importo {item.amount != null ? item.amount : '-'}</span>
              <span className="bdg bdg-cy">Severity {item.severity || '-'}</span>
              <span className="bdg bdg-cy">Reason {item.reason || '-'}</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.28rem' }}>
              <button className="btn-sec" type="button" onClick={() => onMarkVerified(item)} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.63rem' }}>
                Segna verificata
              </button>
              <button className="btn-sec" type="button" onClick={() => onMarkIgnored(item)} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.63rem' }}>
                Segna come non movimento
              </button>
              <button className="btn-sec" type="button" onClick={() => onMarkManualMapping(item)} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.63rem' }}>
                Richiede mapping manuale
              </button>
              <button className="btn-sec" type="button" onClick={() => onOpenDocument(item)} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.63rem' }}>
                Apri nel documento
              </button>
              <button className="btn-sec" type="button" onClick={() => onSelectMovement(item)} disabled={!item.linkedMovementId} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.63rem' }}>
                Seleziona movimento collegato
              </button>
            </div>
          </div>
        )
      }) : (
        <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.82)' }}>Nessuna riga sospetta attiva.</div>
      )}
    </div>
  )
}
