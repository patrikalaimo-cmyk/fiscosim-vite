const shellStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '.6rem',
  padding: '.38rem .65rem',
  borderRadius: 14,
  border: '1px solid rgba(124, 156, 187, 0.18)',
  background: 'linear-gradient(135deg, #08172b 0%, #0c223d 100%)',
  boxShadow: '0 10px 22px rgba(4, 14, 28, 0.24)',
}

const titleStyle = {
  fontSize: '.98rem',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: '#eef6ff',
}

const subtitleStyle = {
  marginTop: '.04rem',
  fontSize: '.62rem',
  color: 'rgba(209, 223, 240, 0.82)',
}

const controlStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '.45rem',
  minHeight: 24,
  padding: '0 .45rem',
  borderRadius: 10,
  border: '1px solid rgba(157, 185, 213, 0.18)',
  background: 'rgba(15, 29, 49, 0.72)',
  color: '#dfe9f4',
  fontSize: '.64rem',
}

export default function RiconciliazioneHeader({
  companyName,
  bankName,
  iban,
  period,
  selectedCount,
  canConfirm,
  confirmBlockReason = '',
  onLoadStatement,
  onAutoMatch,
  onRianalizzaSelected,
  onConfirmSelected,
  onRestoreDemo,
  onCancelImport,
  onClearStaging,
  actionNote,
  stagingBadge = '',
  stagingSavedAt = '',
  stagingNotice = '',
  stagingWarning = '',
}) {
  return (
    <div style={shellStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={titleStyle}>Riconciliazione bancaria</div>
        <div style={subtitleStyle}>Importa, abbina e contabilizza movimenti bancari</div>
      </div>

      <div style={{ display: 'grid', gap: '.25rem', minWidth: 390 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '.25rem' }}>
          <div style={controlStyle}>
            <span>Societa</span>
            <strong style={{ fontSize: '.64rem', color: '#eef6ff', textAlign: 'right' }}>{companyName}</strong>
          </div>
          <div style={controlStyle}>
            <span>Conto banca</span>
            <strong style={{ fontSize: '.64rem', color: '#eef6ff', textAlign: 'right' }}>{bankName}</strong>
          </div>
          <div style={controlStyle}>
            <span>Periodo</span>
            <strong style={{ fontSize: '.64rem', color: '#eef6ff', textAlign: 'right' }}>{period}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.2rem', alignItems: 'center' }}>
          <button className="btn-sec" onClick={onLoadStatement} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.64rem' }}>Carica estratto</button>
          <button className="btn-sec" onClick={onAutoMatch} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.64rem' }}>Abbina automaticamente</button>
          <button className="btn-sec" onClick={onRianalizzaSelected} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.64rem' }}>Rianalizza selezionati</button>
          <button className="btn" onClick={onConfirmSelected} disabled={!canConfirm} title={canConfirm ? '' : confirmBlockReason || 'Conferma bloccata dall audit'} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.64rem' }}>
            Conferma selezionati
          </button>
          <button className="btn-sec" style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.64rem' }}>Vai a</button>
          <span className="bdg bdg-cy" style={{ background: 'rgba(10, 35, 52, 0.92)', color: '#bde8ff', fontSize: '.64rem' }}>
            Selezionate {selectedCount}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.22rem', alignItems: 'center' }}>
          {stagingBadge ? (
            <span className="bdg bdg-gld" style={{ fontSize: '.62rem', background: 'rgba(38, 33, 12, 0.92)' }}>
              {stagingBadge}
            </span>
          ) : null}
          {stagingSavedAt ? (
            <span className="bdg bdg-cy" style={{ fontSize: '.62rem', background: 'rgba(10, 35, 52, 0.92)' }}>
              Ultimo salvataggio {stagingSavedAt}
            </span>
          ) : null}
          {stagingNotice ? (
            <span className="bdg" style={{ fontSize: '.62rem', background: 'rgba(12, 36, 29, 0.92)', color: '#8ee7b6' }}>
              {stagingNotice}
            </span>
          ) : null}
          {onRestoreDemo ? (
            <button className="btn-sec" type="button" onClick={onRestoreDemo} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.62rem' }}>
              Ripristina demo
            </button>
          ) : null}
          {onCancelImport ? (
            <button className="btn-sec" type="button" onClick={onCancelImport} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.62rem' }}>
              Annulla import
            </button>
          ) : null}
          {onClearStaging ? (
            <button className="btn-sec" type="button" onClick={onClearStaging} style={{ minHeight: 24, padding: '0 .42rem', fontSize: '.62rem' }}>
              Cancella staging
            </button>
          ) : null}
        </div>
        {!canConfirm && confirmBlockReason ? (
          <div style={{ fontSize: '.6rem', color: '#ffd38c', textAlign: 'right', lineHeight: 1.1 }}>{confirmBlockReason}</div>
        ) : null}
        {stagingWarning ? (
          <div style={{ fontSize: '.6rem', color: '#ffd38c', textAlign: 'right', lineHeight: 1.1 }}>{stagingWarning}</div>
        ) : null}
        {actionNote ? <div style={{ fontSize: '.6rem', color: 'rgba(216, 232, 245, 0.72)', lineHeight: 1.1 }}>{actionNote}</div> : null}
      </div>
    </div>
  )
}
