export function ImportContabilitaReportDetail({
  reportData,
  reportHelpers,
}) {
  const {
    report,
    selectedSocietaName,
    batchId,
    stagingRowsLength,
    selectedReimportCount,
    busy,
    onAddSelectedReimports,
  } = reportData

  const {
    ActionButton,
    MetricChip,
    MessageBox,
    formatCount,
    renderReimportList,
  } = reportHelpers

  if (!report) return null

  return (
    <div style={{ display: 'grid', gap: '.14rem', borderTop: '1px solid rgba(124, 157, 202, .08)', paddingTop: '.14rem' }}>
      <div style={{ display: 'grid', gap: '.12rem' }}>
        <div style={{ fontSize: '.63rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Riepilogo file</div>
        <div style={{ color: 'var(--mu)', fontSize: '.64rem' }}>
          {report.totals?.files ? `Lotto ${batchId || '-'} • ${selectedSocietaName || '-'} • ${formatCount(stagingRowsLength || 0)} righe in working table` : 'Nessun dettaglio disponibile'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.12rem' }}>
          <MetricChip label="File originali" value={formatCount(report.uploadedFilesCount)} />
          <MetricChip label="XML estratti" value={formatCount(report.extractedXmlCount)} />
          <MetricChip label="File scartati" value={formatCount(report.discardedFilesCount)} />
          <MetricChip label="Errori parsing" value={formatCount(report.totals?.errors)} />
        </div>
        {Array.isArray(report.discardedReasons) && report.discardedReasons.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.12rem' }}>
            {report.discardedReasons.map((reason) => (
              <span
                key={`${reason?.code || 'reason'}-${reason?.label || 'x'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.22rem',
                  padding: '.12rem .28rem',
                  borderRadius: 999,
                  border: '1px solid rgba(255,193,7,.22)',
                  background: 'rgba(255,193,7,.08)',
                  color: '#ffe9a8',
                  fontSize: '.62rem',
                  fontWeight: 700,
                }}
              >
                <span>{reason?.code || reason?.label || 'scarto'}</span>
                <strong>{formatCount(reason?.count)}</strong>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: '.12rem' }}>
        <div style={{ fontSize: '.63rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Working table locale</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.12rem' }}>
          <MetricChip label="Righe già presenti prima" value={formatCount(report.localMergeExistingCount)} />
          <MetricChip label="Nuove fatture aggiunte" value={formatCount(report.localMergeAddedCount)} />
          <MetricChip label="Già presenti e non duplicate" value={formatCount(report.localMergeSkippedCount)} />
          <MetricChip label="Totale righe attuali" value={formatCount(report.localMergeTotalCount || stagingRowsLength)} />
        </div>
      </div>

      <div style={{ display: 'grid', gap: '.12rem' }}>
        <div style={{ fontSize: '.63rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Dedup DB</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.12rem' }}>
          <MetricChip label="Già presenti in staging" value={formatCount(report.duplicateInStagingCount)} />
          <MetricChip label="Già contabilizzate" value={formatCount(report.duplicateInAccountingCount)} />
          <MetricChip label="Cancellate da staging e reimportabili" value={formatCount(report.deletedInStagingCount)} />
          <MetricChip label="Cancellate da contabilità e reimportabili" value={formatCount(report.deletedInAccountingCount)} />
        </div>
      </div>

      {report.deletedDetectionNote ? <MessageBox tone="neutral">{report.deletedDetectionNote}</MessageBox> : null}

      {Array.isArray(report.deletedInStagingRows) && report.deletedInStagingRows.length || Array.isArray(report.deletedInAccountingRows) && report.deletedInAccountingRows.length || selectedReimportCount ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.35rem', flexWrap: 'wrap', marginTop: '.04rem' }}>
          <div style={{ fontSize: '.62rem', color: 'var(--mu)' }}>
            Reimport locali: le righe cancellate restano disponibili solo se lo storico DB le rende ancora rilevabili.
          </div>
          <ActionButton
            label={`Aggiungi reimport selezionate${selectedReimportCount ? ` (${selectedReimportCount})` : ''}`}
            onClick={onAddSelectedReimports}
            disabled={!selectedReimportCount || busy}
            kind="ghost"
            small
          />
        </div>
      ) : null}

      {renderReimportList('Reimportabili da staging', report.deletedInStagingRows)}
      {renderReimportList('Reimportabili da contabilità', report.deletedInAccountingRows)}
    </div>
  )
}


