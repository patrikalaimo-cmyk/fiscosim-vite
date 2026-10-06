import { useEffect } from 'react'
import RiconciliazioneDocumentPreview from './RiconciliazioneDocumentPreview.jsx'

export default function RiconciliazioneDocumentModal({
  open,
  preview,
  onClose,
  onPrevPage,
  onNextPage,
  onZoomOut,
  onZoomIn,
  onFitWidth,
  onResetZoom,
}) {
  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(2, 8, 16, 0.86)',
        backdropFilter: 'blur(4px)',
        display: 'grid',
        placeItems: 'center',
        padding: '1vh 1vw',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '98vw',
          height: '98vh',
          background: 'linear-gradient(180deg, rgba(7, 16, 29, 0.98) 0%, rgba(5, 12, 21, 0.99) 100%)',
          border: '1px solid rgba(127, 154, 182, 0.2)',
          borderRadius: 18,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          gap: '.45rem',
          padding: '.55rem',
          overflow: 'hidden',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.45rem', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '.94rem', color: '#f0f7ff' }}>{preview?.fileName || 'Documento originale'}</div>
            <div style={{ fontSize: '.65rem', color: 'rgba(210, 223, 237, 0.82)' }}>
              {preview?.sourceFileType || 'preview'} | Pagina {preview?.page || '-'} | Raw row {preview?.rawRowId || '-'}
            </div>
          </div>
          <button className="btn-sec" type="button" onClick={onClose} style={{ minHeight: 28, padding: '0 .55rem', fontSize: '.65rem' }}>
            Chiudi
          </button>
        </div>

        <div style={{ minHeight: 0, overflow: 'auto', display: 'grid', gap: '.4rem' }}>
          <RiconciliazioneDocumentPreview
            preview={preview}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
            onZoomOut={onZoomOut}
            onZoomIn={onZoomIn}
            onFitWidth={onFitWidth}
            onResetZoom={onResetZoom}
            onOpenMovement={onClose}
            onOpenDocumentModal={onClose}
            fullScreen
            showLogicalLink={false}
          />
          <div style={{ display: 'grid', gap: '.25rem', padding: '.45rem .55rem', borderRadius: 12, border: '1px solid rgba(127, 154, 182, 0.14)', background: 'rgba(9, 20, 35, 0.82)' }}>
            <div style={{ fontSize: '.66rem', color: '#9fd0ff', textTransform: 'uppercase', letterSpacing: '.06em' }}>Collegamento logico</div>
            <div style={{ fontSize: '.74rem', color: '#eef6ff' }}>
              Pagina: <strong>{preview?.page || '-'}</strong> | Raw row: <strong>{preview?.rawRowId || '-'}</strong> | Movimento: <strong>{preview?.movementId || '-'}</strong>
            </div>
            <div style={{ fontSize: '.7rem', color: 'rgba(215, 227, 239, 0.82)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {preview?.rawText || 'Nessun raw text disponibile per il movimento selezionato.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
