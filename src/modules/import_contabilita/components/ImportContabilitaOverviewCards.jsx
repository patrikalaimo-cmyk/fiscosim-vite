function MessageBox({ tone = 'neutral', children }) {
  const toneStyles = {
    neutral: {
      border: '1px solid rgba(96,165,250,.14)',
      background: 'rgba(16,42,68,.72)',
      color: 'var(--tx)',
    },
    warning: {
      border: '1px solid rgba(251,191,36,.22)',
      background: 'rgba(120,53,15,.16)',
      color: '#fde68a',
    },
  }

  const style = toneStyles[tone] || toneStyles.neutral

  return (
    <div
      style={{
        marginTop: '.02rem',
        padding: '.2rem .28rem',
        borderRadius: 12,
        fontSize: '.66rem',
        lineHeight: 1.35,
        ...style,
      }}
    >
      {children ? (
        <div style={{ gridColumn: '1 / -1', width: '100%', minWidth: 0 }}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function ImportContabilitaOverviewCards({
  ActionButton,
  MetaPill,
  busy,
  errorMsg,
  result,
  report,
  topCardsTemplateColumns,
  triggerFilePicker,
  filesLabel,
  selectedCount,
  selectedSocietaName,
  lastFileCount,
  visibleRowsCount,
  workingTableReadyCount,
  workingTableIncompleteCount,
  formatCount,
  lastImportLabel,
  stagingRowsLength,
  anagraficheStats,
  anagraficheUiRows,
  showAnagraficheDetails,
  setShowAnagraficheDetails,
  showImportReportDetails,
  setShowImportReportDetails,
  confirmAnagraficheDecisioni,
  ignoredOperationalRowsLength,
  onHideIgnoredAnagrafiche,
  percipientiLoading,
  percipientiError,
  anagraficheTipoFiltro,
  onAddSelectedReimports,
  selectedReimportCount,
  renderReimportList,
  children,
}) {
  if (busy || errorMsg || !result?.ok || !report) return null
  const showDetails = Boolean(showAnagraficheDetails || showImportReportDetails)

  return (
    <div
      style={{
        gridColumn: '1 / -1',
        width: '100%',
        display: 'grid',
        gridTemplateColumns: topCardsTemplateColumns,
        gap: '.24rem',
        alignItems: 'stretch',
        marginTop: '.12rem',
        padding: '.16rem',
        borderRadius: 20,
        border: '1px solid rgba(96,165,250,.1)',
        background: 'linear-gradient(180deg, rgba(19,45,70,.82), rgba(12,31,49,.9))',
        boxShadow: '0 18px 40px rgba(0,0,0,.13)',
      }}
    >
      <section
        style={{
          order: 1,
          borderRadius: 16,
          border: '1px solid rgba(96,165,250,.16)',
          background: 'linear-gradient(180deg, rgba(21,52,79,.94), rgba(13,34,54,.92))',
          boxShadow: '0 12px 22px rgba(0,0,0,.14)',
          padding: '.42rem .42rem .38rem',
          display: 'grid',
          gap: '.12rem',
          marginTop: 0,
          backdropFilter: 'blur(8px)',
          minHeight: 250,
          height: '100%',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, .9fr)', gap: '.18rem', alignItems: 'stretch' }}>
          <button
            type="button"
            onClick={triggerFilePicker}
            disabled={busy}
            style={{
              display: 'grid',
              gap: '.12rem',
              justifyItems: 'start',
              textAlign: 'left',
              minHeight: 176,
              padding: '.58rem .62rem',
              borderRadius: 15,
              border: '1px dashed rgba(96,165,250,.34)',
              background: 'linear-gradient(180deg, rgba(10,30,48,.96), rgba(6,19,32,.95))',
              color: 'var(--tx)',
              cursor: busy ? 'not-allowed' : 'pointer',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.02)',
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.34rem', padding: '.18rem .32rem', borderRadius: 999, border: '1px solid rgba(96,165,250,.18)', background: 'rgba(59,130,246,.08)', color: '#d9e7ff', fontSize: '.58rem', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12" fill="none" style={{ flex: '0 0 auto' }}>
                <path d="M12 16V7m0 0-3 3m3-3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 16.5a3.5 3.5 0 0 0 3.5 3.5h7A3.5 3.5 0 0 0 19 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Import & Stato
            </div>
            <div style={{ fontSize: '.98rem', fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.08 }}>
              Trascina i file qui o clicca per selezionare
            </div>
            <div style={{ color: 'var(--mu)', fontSize: '.68rem', lineHeight: 1.35, maxWidth: 320 }}>
              Formati supportati: XML, PDF, ZIP, P7M.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.12rem', marginTop: '.06rem' }}>
              <MetaPill label="File selezionati" value={filesLabel} />
              <MetaPill label="Selezione" value={`${selectedCount} righe`} />
              <MetaPill label="Società" value={selectedSocietaName || '—'} />
            </div>
          </button>

          <div style={{ display: 'grid', gap: '.14rem' }}>
            <div style={{ display: 'grid', gap: '.02rem' }}>
              <div style={{ fontSize: '.63rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Ultimo import</div>
              <div style={{ fontSize: '.98rem', fontWeight: 900, color: 'var(--tx)' }}>
                {lastImportLabel}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '.08rem' }}>
              {[
                ['File elaborati', formatCount(lastFileCount), 'var(--tx)'],
                ['Visibili', formatCount(visibleRowsCount), '#dbeafe'],
                ['Complete', formatCount(workingTableReadyCount), '#86efac'],
                ['Incomplete', formatCount(workingTableIncompleteCount), '#fbbf24'],
              ].map(([label, value, tone]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '.4rem',
                    padding: '.18rem .28rem',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid rgba(96,165,250,.08)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.28rem', color: 'var(--mu)', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: tone, boxShadow: `0 0 0 3px rgba(255,255,255,.03)` }} />
                    {label}
                  </span>
                  <strong style={{ fontSize: '.86rem', color: 'var(--tx)' }}>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          order: 3,
          borderRadius: 16,
          border: '1px solid rgba(96,165,250,.16)',
          background: 'linear-gradient(180deg, rgba(21,52,79,.94), rgba(13,34,54,.92))',
          boxShadow: '0 12px 22px rgba(0,0,0,.14)',
          padding: '.42rem .42rem .38rem',
          display: 'grid',
          gap: '.18rem',
          marginTop: 0,
          backdropFilter: 'blur(8px)',
          minHeight: 250,
          height: '100%',
        }}
      >
        <div style={{ display: 'grid', gap: '.12rem' }}>
          <div style={{ display: 'grid', gap: '.02rem', minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '.92rem', color: 'var(--tx)' }}>Report import</h2>
            <div style={{ color: 'var(--mu)', fontSize: '.64rem' }}>
              {report.totals?.files ? `Lotto ${report.batchId || result.batchId || '-'} • ${selectedSocietaName || '-'} • ${formatCount(stagingRowsLength || 0)} righe in working table` : 'Nessun dettaglio disponibile'}
            </div>
            <div style={{ fontSize: '1.28rem', lineHeight: 1, fontWeight: 900, color: 'var(--tx)', marginTop: '.02rem' }}>
              {formatCount(report.localMergeTotalCount || 0)}
            </div>
            <div style={{ fontSize: '.58rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Righe complessive del lotto</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.14rem', alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: '.08rem' }}>
              {[
                ['Totale righe', formatCount(report.localMergeTotalCount || 0)],
                ['Nuove', formatCount(report.localMergeAddedCount ?? 0)],
                ['Già presenti', formatCount(report.localMergeSkippedCount || 0)],
                ['Scartati', formatCount(report.discardedFilesCount || 0)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '.42rem',
                    padding: '.18rem .28rem',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid rgba(96,165,250,.08)',
                  }}
                >
                  <span style={{ color: 'var(--mu)', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
                  <strong style={{ fontSize: '.88rem', color: 'var(--tx)' }}>{value}</strong>
                </div>
              ))}
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: '.42rem', padding: '.18rem .28rem', borderRadius: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)' }}>
                <span style={{ color: '#fecaca', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Errori</span>
                <strong style={{ fontSize: '.88rem', color: '#fecaca' }}>{formatCount(report.totals?.errors || 0)}</strong>
              </div>
            </div>
            <ActionButton
              label={showImportReportDetails ? 'Chiudi dettagli' : 'Apri report completo'}
              onClick={() => {
                const next = !showImportReportDetails
                setShowImportReportDetails(next)
                if (next) setShowAnagraficheDetails(false)
              }}
              kind="ghost"
              emphasis
            />
          </div>
        </div>
      </section>

      <section
        style={{
          order: 2,
          borderRadius: 16,
          border: '1px solid rgba(96,165,250,.16)',
          background: 'linear-gradient(180deg, rgba(21,52,79,.94), rgba(13,34,54,.92))',
          boxShadow: '0 12px 22px rgba(0,0,0,.14)',
          padding: '.42rem .42rem .38rem',
          display: 'grid',
          gap: '.18rem',
          marginTop: 0,
          backdropFilter: 'blur(8px)',
          minHeight: 250,
          height: '100%',
        }}
      >
        <div style={{ display: 'grid', gap: '.12rem' }}>
          <div style={{ display: 'grid', gap: '.02rem', minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '.92rem', color: 'var(--tx)' }}>Anagrafiche da verificare</h2>
            <div style={{ color: 'var(--mu)', fontSize: '.64rem' }}>
              {`Rilevate ${formatCount(anagraficheStats.total)} controparti dal lotto attuale.`}
            </div>
            <div style={{ fontSize: '1.28rem', lineHeight: 1, fontWeight: 900, color: 'var(--tx)', marginTop: '.02rem' }}>
              {formatCount(anagraficheStats.total)}
            </div>
            <div style={{ fontSize: '.58rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Elementi da verificare</div>
          </div>
          <div style={{ display: 'grid', gap: '.12rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '.08rem' }}>
              {[
                ['Conti', formatCount(anagraficheStats.linked)],
                ['Fornitori', formatCount(anagraficheUiRows.filter((row) => row?.rowType === 'fornitore').length)],
                ['Clienti', formatCount(anagraficheUiRows.filter((row) => row?.rowType === 'cliente').length)],
                ['Percipienti', formatCount(anagraficheUiRows.filter((row) => row?.rowType === 'percipiente').length)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'grid', gap: '.02rem', padding: '.18rem .22rem', borderRadius: 12, border: '1px solid rgba(96,165,250,.08)', background: 'rgba(255,255,255,.02)' }}>
                  <span style={{ fontSize: '.56rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
                  <strong style={{ fontSize: '.88rem', color: 'var(--tx)', lineHeight: 1.05 }}>{value}</strong>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '.08rem' }}>
              {[
                ['Pronte', formatCount(anagraficheStats.ready)],
                ['Nuove', formatCount(anagraficheStats.newCount)],
                ['Da scegliere', formatCount(anagraficheStats.choose)],
                ['Incomplete', formatCount(anagraficheStats.incomplete)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'grid', gap: '.02rem', padding: '.16rem .22rem', borderRadius: 12, border: '1px solid rgba(96,165,250,.08)', background: 'rgba(255,255,255,.02)' }}>
                  <span style={{ fontSize: '.56rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
                  <strong style={{ fontSize: '.82rem', color: 'var(--tx)', lineHeight: 1.05 }}>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '.12rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <ActionButton
            label={showAnagraficheDetails ? 'Chiudi dettagli' : 'Apri dettaglio'}
            onClick={() => {
              const next = !showAnagraficheDetails
              setShowAnagraficheDetails(next)
              if (next) setShowImportReportDetails(false)
            }}
            kind="ghost"
            emphasis
          />
          <ActionButton
            label="Conferma completati"
            onClick={() => confirmAnagraficheDecisioni('complete')}
            kind="success"
            small
            disabled={!anagraficheStats.total || anagraficheTipoFiltro === 'percipiente'}
          />
          {ignoredOperationalRowsLength ? (
            <ActionButton
              label="Elimina ignorati"
              onClick={onHideIgnoredAnagrafiche}
              kind="ghost"
              small
              disabled={busy || !ignoredOperationalRowsLength || anagraficheTipoFiltro === 'percipiente'}
            />
          ) : null}
        </div>

        {percipientiLoading ? (
          <MessageBox tone="neutral">Caricamento percipienti in corso: la detection resta disponibile.</MessageBox>
        ) : percipientiError ? (
          <MessageBox tone="warning">Percipienti non caricati: {percipientiError}</MessageBox>
        ) : null}
      </section>

      {showDetails && children ? (
        <div style={{ order: 4, gridColumn: '1 / -1', width: '100%', minWidth: 0 }}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
