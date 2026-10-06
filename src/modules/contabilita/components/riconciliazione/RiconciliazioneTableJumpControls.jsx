export default function RiconciliazioneTableJumpControls({
  onJumpStart,
  onJumpPrevious,
  onJumpEnd,
  canJumpPrevious = false,
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.28rem', justifyContent: 'flex-end' }}>
      <button className="btn-sec" type="button" onClick={onJumpStart} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.62rem' }}>
        ↑ Inizio
      </button>
      <button className="btn-sec" type="button" onClick={onJumpPrevious} disabled={!canJumpPrevious} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.62rem' }}>
        ↕ Torna posizione
      </button>
      <button className="btn-sec" type="button" onClick={onJumpEnd} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.62rem' }}>
        ↓ Fine
      </button>
    </div>
  )
}
