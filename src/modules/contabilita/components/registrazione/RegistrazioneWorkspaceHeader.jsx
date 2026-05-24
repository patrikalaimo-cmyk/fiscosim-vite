import { REG_BUTTON_DARK_STYLE, REG_BUTTON_PRIMARY_STYLE, REG_CARD_STYLE, REG_INLINE_BADGE_STYLE, resolveSocietaLabel } from './registrazioneUi.js'

function GotoSelect({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gap: '.18rem', minWidth: 120 }}>
      <div style={{ fontSize: '.58rem', color: 'rgba(188,204,226,.7)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Vai a</div>
      <select value={value} onChange={(event) => onChange?.(event.target.value)} style={{ minHeight: 38, padding: '.38rem .6rem' }}>
        <option value="">Sezioni</option>
        <option value="header">Testata</option>
        <option value="document">Dati documento</option>
        <option value="iva">IVA</option>
        <option value="rows">Righe</option>
        <option value="preview">Anteprima</option>
        <option value="footer">Shortcut</option>
      </select>
    </div>
  )
}

export function RegistrazioneWorkspaceHeader({
  societaAttiva,
  esercizio,
  exerciseOptions = [],
  onExerciseChange,
  onSave,
  onReset,
  onNewRegistration,
  onGotoChange,
  gotoTarget = '',
  saving = false,
  realSaveBlocked = false,
  draftStarted = false,
}) {
  const societaLabel = resolveSocietaLabel(societaAttiva)
  const saveLabel = realSaveBlocked
    ? 'Salvataggio reale disabilitato'
    : saving
      ? 'Salvataggio...'
      : 'Salva registrazione'

  return (
    <div className="erp-flat-panel" style={{ marginBottom: '.75rem', padding: '.9rem 1rem' }}>
      <div className="cont-module-header compact-header" style={{ marginBottom: 0 }}>
        <div style={{ minWidth: 0, display: 'grid', gap: '.1rem' }}>
          <div style={{ fontSize: '.72rem', color: 'rgba(188,204,226,.76)', textTransform: 'uppercase', letterSpacing: '.13em', fontWeight: 700 }}>
            CONTABILITA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.45rem', lineHeight: 1.08, letterSpacing: '-.03em' }}>Registrazione manuale</h1>
            <span className="bdg bdg-gold" style={REG_INLINE_BADGE_STYLE}>ALT+N</span>
          </div>
          <div style={{ fontSize: '.82rem', color: 'rgba(188,204,226,.8)', lineHeight: 1.35 }}>
            {draftStarted ? 'Workspace contabile dinamico guidato dalla causale' : 'Premi Nuova registrazione per iniziare'}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end', gap: '.55rem' }}>
          <div style={{ display: 'grid', gap: '.18rem', minWidth: 220 }}>
            <div style={{ fontSize: '.58rem', color: 'rgba(188,204,226,.7)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Società</div>
            <div className="bdg" style={{ ...REG_BUTTON_DARK_STYLE, minHeight: 38, justifyContent: 'space-between', padding: '.42rem .62rem', borderRadius: 12, width: '100%' }}>
              <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'rgba(188,204,226,.74)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Società:
              </span>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--tx)' }}>{societaLabel}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '.18rem', minWidth: 120 }}>
            <div style={{ fontSize: '.58rem', color: 'rgba(188,204,226,.7)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Esercizio</div>
            <select
              value={esercizio || ''}
              onChange={(event) => onExerciseChange?.(event.target.value)}
              style={{ ...REG_BUTTON_DARK_STYLE, minHeight: 38, padding: '.42rem .62rem', borderRadius: 12, width: '100%' }}
            >
              {exerciseOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <button type="button" className="btn" onClick={onSave} disabled={saving || realSaveBlocked} style={{ ...REG_BUTTON_PRIMARY_STYLE, minHeight: 38 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem' }}>
              <span style={{ fontSize: '.92rem' }}>💾</span>
              {saveLabel}
              <span className="bdg bdg-green" style={{ marginLeft: '.2rem' }}>F12</span>
            </span>
          </button>

          <button type="button" className="btn-sec" onClick={onNewRegistration} style={{ minHeight: 38, padding: '0 .95rem' }}>
            Nuova registrazione
          </button>

          <button type="button" className="btn-sec" onClick={onReset} style={{ minHeight: 38, padding: '0 .95rem' }}>
            Reset
          </button>

          <GotoSelect value={gotoTarget} onChange={onGotoChange} />
        </div>
      </div>
    </div>
  )
}
