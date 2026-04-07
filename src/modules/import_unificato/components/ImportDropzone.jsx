export function ImportDropzone({
  dropRef,
  fileInputRef,
  uploading,
  societaId,
  dragOver,
  progress,
  societaImportHint,
  tipoManuale,
  tipiDocumento,
  onFilesSelected,
  onRequireSocieta,
  onClickZone,
}) {
  return (
    <div
      ref={dropRef}
      onClick={onClickZone}
      style={{
        border: `2px dashed ${dragOver ? 'var(--gold)' : 'var(--bd)'}`,
        borderRadius: 12,
        padding: '2.5rem 2rem',
        textAlign: 'center',
        cursor: uploading || !societaId ? 'not-allowed' : 'pointer',
        opacity: !societaId ? 0.72 : 1,
        background: dragOver ? 'rgba(200,164,94,.06)' : 'var(--s2)',
        marginBottom: '1rem',
        transition: 'all .2s',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        disabled={!societaId}
        accept=".pdf,.xml,.p7m,.png,.jpg,.jpeg,.zip"
        style={{ display: 'none' }}
        onChange={(e) => onFilesSelected(e.target.files)}
      />
      {uploading && progress ? (
        <div>
          <div style={{ fontSize: '1.5rem', marginBottom: '.5rem' }}>⏳</div>
          <div style={{ fontWeight: 600 }}>Analisi in corso... {progress.current}/{progress.total}</div>
          <div style={{ fontSize: '.78rem', color: 'var(--mu)', marginTop: '.3rem' }}>{progress.file}</div>
          <div style={{ marginTop: '.75rem', height: 4, background: 'var(--bd)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--gold)', width: `${(progress.current / progress.total) * 100}%`, transition: 'width .3s' }} />
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📂</div>
          <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '.25rem' }}>
            {!societaId ? 'Seleziona la società per caricare' : 'Trascina i documenti qui'}
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>PDF · XML · P7M · Immagini · ZIP</div>
          {societaImportHint && (
            <div style={{ marginTop: '.65rem', fontSize: '.8rem', color: '#e8a045', fontWeight: 500 }} role="status">
              {societaImportHint}
            </div>
          )}
          {tipoManuale && (
            <div
              style={{
                marginTop: '.5rem',
                display: 'inline-block',
                background: 'rgba(200,164,94,.12)',
                border: '1px solid rgba(200,164,94,.3)',
                color: 'var(--gold)',
                borderRadius: 6,
                padding: '.2rem .6rem',
                fontSize: '.75rem',
              }}
            >
              ✓ Modalità: {tipiDocumento.find((t) => t.id === tipoManuale)?.label}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
