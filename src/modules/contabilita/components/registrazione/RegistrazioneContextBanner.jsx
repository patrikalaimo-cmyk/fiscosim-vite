import { REG_CARD_STYLE, REG_INLINE_BADGE_STYLE, resolveCausaleLabel } from './registrazioneUi.js'

function Chip({ children, tone = 'neutral' }) {
  const color =
    tone === 'success'
      ? 'bdg-green'
      : tone === 'warning'
        ? 'bdg-gold'
        : tone === 'danger'
          ? 'bdg-red'
          : 'bdg-gray'
  return (
    <span
      className={`bdg ${color}`}
      style={{
        ...REG_INLINE_BADGE_STYLE,
        minHeight: 20,
        padding: '.16rem .42rem',
        fontSize: '.7rem',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

export function RegistrazioneContextBanner({
  esercizio,
  exerciseWarning,
  selectedCausale,
  selectedCausaleConfig,
  selectedCausaleBehavior,
  activePanels = [],
  onConfirmExerciseUpdate,
}) {
  const causaleLabel = resolveCausaleLabel(selectedCausale)
  const panels = Array.isArray(activePanels) ? activePanels : []
  const behavior = selectedCausaleBehavior || selectedCausaleConfig || {}

  return (
    <div className="erp-bulkbar" style={{ marginBottom: '.6rem', justifyContent: 'space-between' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '.55rem' }}>
        <div style={{ display: 'grid', gap: '.05rem', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', minWidth: 0, flexWrap: 'nowrap' }}>
            <span className="bdg bdg-blue" style={REG_INLINE_BADGE_STYLE}>i</span>
            <div
              style={{
                fontSize: '.8rem',
                fontWeight: 700,
                color: 'var(--tx)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Esercizio contabile: {esercizio || '—'}
            </div>
          </div>
          <div
            style={{
              fontSize: '.68rem',
              color: 'rgba(188,204,226,.8)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {exerciseWarning || 'Derivato dalla data registrazione. Verrà aggiornato automaticamente se la data appartiene ad un altro esercizio.'}
          </div>
          {exerciseWarning ? (
            <div style={{ marginTop: '.25rem', display: 'flex', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap' }}>
              <span className="bdg bdg-gold" style={REG_INLINE_BADGE_STYLE}>
                Esercizio non allineato
              </span>
              <button type="button" className="btn-sec btn-sm" onClick={onConfirmExerciseUpdate} disabled={!onConfirmExerciseUpdate}>
                Aggiorna esercizio
              </button>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', flexWrap: 'nowrap', justifyContent: 'flex-end', minWidth: 0, overflow: 'hidden' }}>
          <Chip tone="success">Causale {causaleLabel}</Chip>
          {behavior?.family ? <Chip tone="neutral">{behavior.family}</Chip> : null}
          {behavior?.typeCausale ? <Chip tone="neutral">{behavior.typeCausale}</Chip> : null}
          {behavior?.operazionePartite ? <Chip tone="neutral">Partite {behavior.operazionePartite}</Chip> : null}
          {behavior?.opRitenute ? <Chip tone="neutral">Rit. {behavior.opRitenute}</Chip> : null}
          {behavior?.showDocumentPanel ? <Chip tone="neutral">Doc.</Chip> : null}
          {behavior?.showIvaPanel ? <Chip tone="neutral">IVA</Chip> : null}
          {behavior?.showPartitario ? <Chip tone="neutral">Part.</Chip> : null}
          {behavior?.showRitenute ? <Chip tone="neutral">Rit.</Chip> : null}
          <span
            style={{
              fontSize: '.68rem',
              color: 'rgba(188,204,226,.82)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            Layout guidato dal comportamento causale.
          </span>
        </div>
      </div>
    </div>
  )
}
