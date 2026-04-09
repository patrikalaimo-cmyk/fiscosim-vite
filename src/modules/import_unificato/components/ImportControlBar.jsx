export function ImportControlBar({
  societa,
  societaId,
  setSocietaId,
  aiEnabled,
  aiMode,
  setAiMode,
  aiPreprocessMode,
  setAiPreprocessMode,
  tipoManuale,
  setTipoManuale,
  tipiDocumento,
  ruolo,
  onPersistSocieta,
}) {
  return (
    <div
      className="card"
      style={{
        marginBottom: '.75rem',
        padding: '.7rem .9rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.9rem', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
        <div style={{ minWidth: 260, flex: '1 1 340px' }}>
          <div style={{ fontWeight: 600, fontSize: '.72rem', color: 'var(--mu)', marginBottom: '.35rem' }}>Società</div>
          <select
            value={societaId}
            onChange={(e) => {
              const v = e.target.value
              setSocietaId(v)
              onPersistSocieta?.(v)
            }}
            style={{
              width: '100%',
              minWidth: 200,
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
              color: 'var(--tx)',
              borderRadius: 7,
              padding: '.4rem .75rem',
              fontSize: '.85rem',
            }}
          >
            <option value="">— Seleziona società —</option>
            {societa.map((s) => (
              <option key={s.id} value={s.id}>
                {s.denominazione}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '.3rem',
            background: aiEnabled ? 'rgba(52,194,122,.12)' : 'rgba(224,82,82,.12)',
            border: `1px solid ${aiEnabled ? 'rgba(52,194,122,.3)' : 'rgba(224,82,82,.3)'}`,
            color: aiEnabled ? '#34c27a' : '#e05252',
            borderRadius: 6,
            padding: '.25rem .6rem',
            fontSize: '.72rem',
            fontWeight: 600,
            alignSelf: 'center',
            marginBottom: '.1rem',
          }}
        >
          {aiEnabled ? 'AI ON' : 'AI OFF'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.9rem', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', opacity: aiEnabled ? 1 : 0.5, minWidth: 180 }}>
          <span style={{ fontSize: '.72rem', color: 'var(--mu)', fontWeight: 600 }}>Motore</span>
          <select
            value={aiMode}
            disabled={!aiEnabled}
            onChange={(e) => setAiMode(e.target.value === 'online' ? 'online' : 'local')}
            style={{
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
              color: aiMode === 'online' ? 'var(--gold)' : 'var(--tx)',
              borderRadius: 7,
              padding: '.38rem .6rem',
              fontSize: '.74rem',
              fontWeight: 600,
              cursor: aiEnabled ? 'pointer' : 'not-allowed',
            }}
          >
            <option value="local">Locale (Ollama)</option>
            <option value="online">Online (Claude)</option>
          </select>
        </div>

        {ruolo === 'owner' && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', opacity: aiEnabled ? 1 : 0.5, minWidth: 180 }}
            title="Debug: confronto input grezzo PDF vs riepilogo strutturato per l'AI"
          >
            <span style={{ fontSize: '.72rem', color: 'var(--mu)', fontWeight: 600 }}>Input AI</span>
            <select
              value={aiPreprocessMode}
              disabled={!aiEnabled}
              onChange={(e) => setAiPreprocessMode(e.target.value === 'off' ? 'off' : 'on')}
              style={{
                background: 'var(--s2)',
                border: '1px solid var(--bd)',
                color: aiPreprocessMode === 'off' ? 'var(--gold)' : 'var(--tx)',
                borderRadius: 7,
                padding: '.38rem .6rem',
                fontSize: '.74rem',
                fontWeight: 600,
                cursor: aiEnabled ? 'pointer' : 'not-allowed',
              }}
            >
              <option value="off">RAW</option>
              <option value="on">PREPROCESSED</option>
            </select>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', minWidth: 180 }}>
          <span style={{ fontSize: '.72rem', color: 'var(--mu)', fontWeight: 600 }}>Tipo manuale</span>
          <select
            value={tipoManuale}
            onChange={(e) => setTipoManuale(e.target.value)}
            style={{
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
              color: tipoManuale ? 'var(--gold)' : 'var(--mu)',
              borderRadius: 7,
              padding: '.38rem .6rem',
              fontSize: '.74rem',
            }}
          >
            <option value="">AI decide</option>
            {tipiDocumento.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
