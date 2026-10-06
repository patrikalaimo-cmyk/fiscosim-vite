export function ImportContabilitaHeader({
  ActionButton,
  busy,
  selectedSocietaId,
  societaLoading,
  societaOptions,
  onSocietaChange,
  onTriggerFilePicker,
  onAnalyze,
  showGoToMenu,
  onToggleGoToMenu,
  onGoToSelection,
}) {
  return (
    <header style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.22rem 1.1rem', marginBottom: '.28rem', paddingTop: '.08rem' }}>
      <div style={{ minWidth: 280, display: 'grid', gap: '.1rem', alignContent: 'start', paddingTop: '.14rem' }}>
        <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.18em', fontWeight: 800 }}>Document Hub</div>
        <h1 style={{ margin: 0, fontSize: '1.78rem', lineHeight: 1, letterSpacing: '-.03em' }}>Import Contabilità</h1>
        <p style={{ margin: 0, color: 'var(--mu)', fontSize: '.78rem', lineHeight: 1.34, maxWidth: 820 }}>
          Importa, controlla e prepara i documenti per la registrazione in contabilità.
        </p>
      </div>

      <div style={{ display: 'grid', justifyItems: 'end', gap: '.14rem', alignSelf: 'start', paddingTop: '.06rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '.22rem',
            flexWrap: 'wrap',
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.48rem',
              padding: '.32rem .56rem',
              borderRadius: 14,
              border: '1px solid rgba(96,165,250,.18)',
              background: 'linear-gradient(180deg, rgba(16,42,68,.82), rgba(10,26,43,.94))',
              minWidth: 300,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.02)',
            }}
          >
            <div style={{ fontSize: '.64rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Società</div>
            <select
              value={selectedSocietaId}
              disabled={societaLoading}
              onChange={onSocietaChange}
              style={{
                flex: 1,
                background: 'transparent',
                color: 'var(--tx)',
                border: '1px solid rgba(96,165,250,.16)',
                borderRadius: 12,
                outline: 'none',
                fontSize: '.88rem',
                fontWeight: 700,
                padding: '.28rem .34rem',
                minWidth: 0,
              }}
            >
              <option value="">{societaLoading ? 'Caricamento società...' : 'Seleziona società'}</option>
              {societaOptions.map((societa) => (
                <option key={societa.id} value={societa.id}>
                  {societa.denominazione}
                </option>
              ))}
            </select>
          </div>

          <ActionButton label="Carica fatture" onClick={onTriggerFilePicker} disabled={busy} kind="success" emphasis />
          <ActionButton label="Rianalizza" onClick={onAnalyze} disabled={busy || !selectedSocietaId} kind="ghost" emphasis />
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <ActionButton
              label={showGoToMenu ? 'Vai a ▴' : 'Vai a ▾'}
              onClick={onToggleGoToMenu}
              disabled={busy}
              kind="ghost"
              emphasis
            />
            {showGoToMenu ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + .35rem)',
                  right: 0,
                  minWidth: 210,
                  padding: '.34rem',
                  borderRadius: 14,
                  border: '1px solid rgba(96,165,250,.2)',
                  background: 'linear-gradient(180deg, rgba(16,42,68,.98), rgba(9,24,40,.98))',
                  boxShadow: '0 18px 40px rgba(0,0,0,.28)',
                  zIndex: 40,
                  display: 'grid',
                  gap: '.18rem',
                }}
              >
                {[
                  { label: 'Contabilità', target: 'contabilita' },
                  { label: 'Piano dei conti', target: 'piano_conti' },
                  { label: 'Anagrafiche', target: 'clienti' },
                  { label: 'Percipienti', target: 'percipienti' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onGoToSelection(item.target)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: '1px solid transparent',
                      borderRadius: 10,
                      background: 'transparent',
                      color: 'var(--tx)',
                      padding: '.42rem .58rem',
                      fontSize: '.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = 'rgba(59,130,246,.12)'
                      event.currentTarget.style.borderColor = 'rgba(96,165,250,.18)'
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'transparent'
                      event.currentTarget.style.borderColor = 'transparent'
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ fontSize: '.62rem', color: 'var(--mu)', justifySelf: 'end', lineHeight: 1.15, paddingRight: '.04rem' }}>
          Formati supportati: <strong style={{ color: 'var(--tx)', fontWeight: 700 }}>XML • PDF • ZIP XML/PDF • P7M</strong>
        </div>
      </div>
    </header>
  )
}
