import { useEffect, useMemo, useState } from 'react'

function engineLabel(source) {
  const s = String(source || '').toLowerCase()
  if (s.includes('local') || s.includes('ollama') || s.includes('xml')) return 'Locale'
  if (s.includes('online') || s.includes('openai') || s.includes('api') || s.includes('gateway')) return 'Online'
  return source ? String(source).charAt(0).toUpperCase() + String(source).slice(1) : 'Sconosciuto'
}

function QuestionBlock({ item, selectedId, manualText, onSelect, onManualText }) {
  const type = String(item?.type || '')

  if (type === 'uncertain_parcella_confirmation') {
    return (
      <div style={{ display: 'grid', gap: '.35rem' }}>
        <div style={{ fontSize: '.68rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--gold)' }}>PARCELLA</div>
        <div style={{ display: 'grid', gap: '.35rem' }}>
          {item.options?.map((option) => (
            <button
              key={option.id}
              type="button"
              className="btn-sec"
              onClick={() => onSelect(option)}
              style={{
                textAlign: 'left',
                padding: '.5rem .6rem',
                borderRadius: 8,
                borderColor: selectedId === option.id ? 'rgba(200,164,94,.6)' : undefined,
                background: selectedId === option.id ? 'rgba(200,164,94,.12)' : 'var(--s1)',
              }}
            >
              <div style={{ fontWeight: 700 }}>{option.label}</div>
              {option.description && <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.1rem' }}>{option.description}</div>}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '.35rem' }}>
      <div style={{ fontSize: '.68rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--gold)' }}>
        {type === 'uncertain_document_type'
          ? 'TIPO DOCUMENTO'
          : type === 'uncertain_account_mapping'
            ? 'CONTO'
            : type === 'uncertain_vat_causale'
              ? 'CAUSALE IVA'
              : 'CHIARIMENTO'}
      </div>
      <div style={{ display: 'grid', gap: '.35rem' }}>
        {item.options?.map((option) => (
          <button
            key={option.id}
            type="button"
            className="btn-sec"
            onClick={() => onSelect(option)}
            style={{
              textAlign: 'left',
              padding: '.5rem .6rem',
              borderRadius: 8,
              borderColor: selectedId === option.id ? 'rgba(200,164,94,.6)' : undefined,
              background: selectedId === option.id ? 'rgba(200,164,94,.12)' : 'var(--s1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'baseline' }}>
              <div style={{ fontWeight: 700 }}>{option.label}</div>
              {option.score != null && <span style={{ fontSize: '.65rem', color: 'var(--mu)' }}>{option.score}%</span>}
            </div>
            {option.description && <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.1rem' }}>{option.description}</div>}
          </button>
        ))}
      </div>

      {item.manualPlaceholder && (
        <div style={{ display: 'grid', gap: '.35rem', marginTop: '.25rem' }}>
          <input
            type="text"
            value={manualText}
            onChange={(e) => onManualText(e.target.value)}
            placeholder={item.manualPlaceholder}
            style={{
              width: '100%',
              background: 'var(--s1)',
              border: '1px solid var(--bd)',
              color: 'var(--tx)',
              borderRadius: 8,
              padding: '.5rem .6rem',
              fontSize: '.78rem',
            }}
          />
        </div>
      )}
    </div>
  )
}

export function OperatorClarificationModal({
  open,
  item = null,
  onClose,
  onContinue,
  onSkip,
  onReviewLater,
  onOpenPreview = null,
  previewLabel = 'Anteprima documento',
  engineSource = 'Sconosciuto',
  title = 'Intervento operatore richiesto',
  subtitle = '',
}) {
  const [selectedId, setSelectedId] = useState('')
  const [manualText, setManualText] = useState('')

  useEffect(() => {
    if (!open) return
    setSelectedId(item?.options?.[0]?.id || '')
    setManualText('')
  }, [open, item?.id])

  const selectedOption = useMemo(
    () => item?.options?.find((opt) => opt.id === selectedId) || null,
    [item, selectedId]
  )

  if (!open || !item) return null

  const canContinue = Boolean(selectedOption || String(manualText || '').trim())

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ width: 'min(920px, calc(100vw - 2rem))' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">{title}</div>
          <div className="modal-sub" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{subtitle}</span>
            <span className="bdg bdg-gold" style={{ fontSize: '.62rem' }}>
              Motore: {engineLabel(engineSource)}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'grid', gap: '.8rem' }}>
          <div
            style={{
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
              borderRadius: 12,
              padding: '.8rem',
            }}
          >
            <div style={{ fontSize: '.75rem', fontWeight: 800, letterSpacing: '.06em', color: 'var(--gold)' }}>
              {item.title}
            </div>
            <div style={{ marginTop: '.2rem', fontSize: '.82rem', fontWeight: 700 }}>{item.message}</div>
            {item.reason && <div style={{ marginTop: '.15rem', fontSize: '.72rem', color: 'var(--mu)' }}>{item.reason}</div>}
          </div>

          <QuestionBlock
            item={item}
            selectedId={selectedId}
            manualText={manualText}
            onSelect={(opt) => {
              setSelectedId(opt.id)
              if (!String(manualText || '').trim()) {
                setManualText('')
              }
            }}
            onManualText={setManualText}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-sec" onClick={() => onOpenPreview?.()}>
              Apri {previewLabel}
            </button>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-sec" onClick={() => onSkip?.(item)}>
                Salta e gestisci manualmente
              </button>
              <button type="button" className="btn-sec" onClick={() => onReviewLater?.(item)}>
                Rivedi dopo
              </button>
              <button
                type="button"
                className="btn"
                disabled={!canContinue}
                onClick={() => onContinue?.(item, selectedOption, String(manualText || '').trim())}
              >
                Continua elaborazione
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
