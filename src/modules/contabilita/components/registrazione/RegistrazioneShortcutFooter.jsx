import { REG_CARD_STYLE } from './registrazioneUi.js'

function Shortcut({ keyLabel, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', whiteSpace: 'nowrap' }}>
      <span className="bdg bdg-gray" style={{ minHeight: 22, padding: '2px 7px', fontSize: '.56rem' }}>
        {keyLabel}
      </span>
      <span style={{ fontSize: '.68rem', color: 'rgba(188,204,226,.82)' }}>{label}</span>
    </div>
  )
}

export function RegistrazioneShortcutFooter() {
  return (
    <div style={{ marginTop: '.7rem', paddingBottom: '.2rem' }}>
      <div className="erp-bulkbar" style={{ margin: 0, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.66rem', color: 'rgba(188,204,226,.76)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
            Scorciatoie
          </span>
          <Shortcut keyLabel="ALT+N" label="Nuova registrazione" />
          <Shortcut keyLabel="INS" label="Nuova registrazione opzionale" />
          <Shortcut keyLabel="CTRL++" label="Nuova riga" />
          <Shortcut keyLabel="CTRL+-" label="Elimina riga attiva" />
          <Shortcut keyLabel="Invio" label="Campo successivo" />
          <Shortcut keyLabel="F2" label="Piano conti rapido" />
          <Shortcut keyLabel="F3" label="Ricerca conto" />
          <Shortcut keyLabel="F8" label="Ricalcola residuo" />
          <Shortcut keyLabel="F9" label="Partite" />
          <Shortcut keyLabel="F10" label="Salva registrazione" />
          <Shortcut keyLabel="ESC" label="Annulla / Esci" />
        </div>
        <div style={{ marginTop: '.35rem', fontSize: '.62rem', color: 'rgba(188,204,226,.68)' }}>
          Cliente / Fornitore: F2 selezione rapida, F3 ricerca libera sul piano conti.
        </div>
      </div>
    </div>
  )
}
