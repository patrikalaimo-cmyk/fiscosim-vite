import { buildPdfViewerUrl } from './buildPdfViewerUrl.js'

const shellStyle = {
  display: 'grid',
  gap: '.45rem',
}

function ControlButton({ children, onClick, disabled = false }) {
  return (
    <button className="btn-sec" type="button" onClick={onClick} disabled={disabled} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.64rem' }}>
      {children}
    </button>
  )
}

export default function RiconciliazioneDocumentPreview({
  preview,
  onPrevPage,
  onNextPage,
  onZoomOut,
  onZoomIn,
  onFitWidth,
  onResetZoom,
  onOpenMovement,
  onOpenDocumentModal,
  fullScreen = false,
  showLogicalLink = true,
}) {
  const hasUrl = Boolean(preview?.url)
  const isImage = preview?.kind === 'image'
  const zoomLabel = preview?.zoom === 'fit' ? 'Fit width' : `${Math.round(Number(preview?.zoom || 1) * 100)}%`
  const pageLabel = preview?.page ? `Pagina ${preview.page}` : 'Pagina -'
  const previewTitle = preview?.fileName || 'Documento originale'
  const iframeKey = `${preview?.url || 'no-url'}|${preview?.page || 1}|${preview?.zoom || 'fit'}`
  const zoomPercent = preview?.zoom === 'fit' ? 100 : Math.round(Number(preview?.zoom || 1) * 100)
  const viewerHeight = fullScreen ? 'calc(98vh - 230px)' : 340
  const imageMaxHeight = fullScreen ? 'calc(98vh - 230px)' : 300
  const fallbackNote = preview?.fileName
    ? 'Documento originale non disponibile dopo refresh. Ricaricare il file per anteprima.'
    : 'Nessuna anteprima reale disponibile. Usa le righe raw per la verifica documentale.'

  return (
    <div style={shellStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '.82rem', color: '#eef6ff' }}>{previewTitle}</div>
          <div style={{ fontSize: '.62rem', color: 'rgba(210, 223, 237, 0.78)' }}>
            {preview?.sourceFileType || 'preview'} | {pageLabel} | {zoomLabel}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem', justifyContent: 'flex-end' }}>
          <ControlButton onClick={onPrevPage} disabled={!preview?.page || preview.page <= 1}>Prev</ControlButton>
          <ControlButton onClick={onNextPage} disabled={!preview?.page}>Next</ControlButton>
          <ControlButton onClick={onZoomOut}>-</ControlButton>
          <ControlButton onClick={onZoomIn}>+</ControlButton>
          <ControlButton onClick={onFitWidth}>Fit</ControlButton>
          <ControlButton onClick={onResetZoom}>100%</ControlButton>
          {onOpenDocumentModal ? (
            <ControlButton onClick={onOpenDocumentModal} disabled={!hasUrl}>
              Vista documento ampia
            </ControlButton>
          ) : null}
        </div>
      </div>

      <div
        style={{
          minHeight: fullScreen ? 'calc(98vh - 230px)' : 300,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(127, 154, 182, 0.16)',
          background: 'rgba(6, 15, 27, 0.96)',
        }}
      >
        {hasUrl ? (
          isImage ? (
            <div style={{ padding: '.5rem', display: 'grid', placeItems: 'center', minHeight: imageMaxHeight }}>
              <img
                src={preview.url}
                alt={previewTitle}
                style={{
                  width: preview?.zoom === 'fit' ? '100%' : `${zoomPercent}%`,
                  maxWidth: '100%',
                  maxHeight: imageMaxHeight,
                  height: 'auto',
                  transformOrigin: 'center top',
                  borderRadius: 10,
                }}
              />
            </div>
          ) : (
            <iframe
              key={iframeKey}
              title={previewTitle}
              src={buildPdfViewerUrl(preview.url, { page: preview.page || 1, zoomMode: preview?.zoom === 'fit' ? 'fit' : 'percent', zoomPercent })}
              style={{ width: '100%', height: viewerHeight, border: 'none', background: '#09111d' }}
            />
          )
        ) : (
          <div style={{ padding: '1rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5 }}>
            {fallbackNote}
          </div>
        )}
      </div>

      {showLogicalLink ? (
        <div style={{ display: 'grid', gap: '.25rem', padding: '.4rem .55rem', borderRadius: 12, border: '1px solid rgba(127, 154, 182, 0.14)', background: 'rgba(9, 20, 35, 0.82)' }}>
          <div style={{ fontSize: '.66rem', color: '#9fd0ff', textTransform: 'uppercase', letterSpacing: '.06em' }}>Collegamento logico</div>
          <div style={{ fontSize: '.74rem', color: '#eef6ff' }}>
            Pagina: <strong>{preview?.page || '-'}</strong> | Raw row: <strong>{preview?.rawRowId || '-'}</strong> | Movimento: <strong>{preview?.movementId || '-'}</strong>
          </div>
          <div style={{ fontSize: '.7rem', color: 'rgba(215, 227, 239, 0.82)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {preview?.rawText || 'Nessun raw text disponibile per il movimento selezionato.'}
          </div>
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
            <button className="btn-sec" type="button" onClick={onOpenMovement} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.64rem' }}>
              Seleziona movimento collegato
            </button>
            <span className="bdg bdg-cy">Confidence {Number.isFinite(Number(preview?.confidence)) ? `${Math.round(preview.confidence)}%` : '-'}</span>
            <span className="bdg bdg-gld">Stato review {preview?.reviewLabel || 'Da verificare'}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
