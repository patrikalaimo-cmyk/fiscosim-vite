export function ImportContabilitaWorkingTableToolbar({
  ActionButton,
  MetaPill,
  SearchField,
  ViewToggle,
  BUTTON_BASE,
  busy,
  visibleRows,
  selectedCount,
  allVisibleSelected,
  onToggleVisibleSelection,
  viewMode,
  VIEW_MODES,
  onSelectViewMode,
  quickFilter,
  QUICK_FILTERS,
  onSelectQuickFilter,
  onPlaceholderAction,
  searchTerm,
  setSearchTerm,
  showToolsMenu,
  setShowToolsMenu,
  handleToolsSelection,
  registrationDateDraft,
  setRegistrationDateDraft,
  registrationDateInputRef,
  onApplyRegistrationDate,
  workingTableReadyCount,
  onSelectAllVisible,
  onDeselectAll,
  onDeleteSelectedRows,
  onStartAccounting,
  hasActiveWorkingTableColumnFilters,
  activeWorkingTableColumnFilters,
  clearAllWorkingTableColumnFilters,
}) {
  return (
    <>
      <div style={{ padding: '.24rem .3rem .1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.35rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '.92rem', color: 'var(--tx)' }}>Documenti importati</h2>
          <div style={{ marginTop: '.04rem', color: 'var(--mu)', fontSize: '.64rem' }}>
            {visibleRows.length ? `${visibleRows.length} righe visibili, ${selectedCount} selezionate` : 'Nessuna riga corrispondente ai filtri correnti.'}
          </div>
        </div>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '.3rem',
            padding: '.1rem .24rem',
            borderRadius: 999,
            border: '1px solid rgba(96,165,250,.12)',
            background: 'rgba(16,42,68,.76)',
            fontSize: '.62rem',
            color: 'var(--mu)',
          }}
        >
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={onToggleVisibleSelection}
            disabled={!visibleRows.length || busy}
          />
          Seleziona righe visibili
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          gap: '.18rem',
          padding: '.06rem .2rem .12rem',
          borderTop: '1px solid rgba(96,165,250,.08)',
          background: 'rgba(8,24,40,.36)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.28rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.12rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '.66rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Vista</div>
            <ViewToggle label="Tutte" active={viewMode === VIEW_MODES.all} onClick={() => onSelectViewMode(VIEW_MODES.all)} />
            <ViewToggle label="Pronte" active={viewMode === VIEW_MODES.ready} onClick={() => onSelectViewMode(VIEW_MODES.ready)} />
            <ViewToggle label="Registrate" active={viewMode === VIEW_MODES.registered} onClick={() => onSelectViewMode(VIEW_MODES.registered)} />
          </div>
          <div style={{ display: 'flex', gap: '.08rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
            <SearchField value={searchTerm} onChange={setSearchTerm} compact />
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <ActionButton
                label={showToolsMenu ? 'Strumenti ▴' : 'Strumenti ▾'}
                onClick={() => setShowToolsMenu((current) => !current)}
                kind="ghost"
                small
              />
              {showToolsMenu ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    zIndex: 30,
                    minWidth: 156,
                    borderRadius: 12,
                    border: '1px solid rgba(96,165,250,.18)',
                    background: 'rgba(8,24,40,.98)',
                    boxShadow: '0 18px 40px rgba(0,0,0,.34)',
                    padding: '.18rem',
                    display: 'grid',
                    gap: '.12rem',
                  }}
                >
                  <button type="button" onClick={() => handleToolsSelection('columns')} style={{ ...BUTTON_BASE, width: '100%', padding: '.16rem .26rem', fontSize: '.62rem', textAlign: 'left' }}>
                    Colonne
                  </button>
                  <button type="button" onClick={() => handleToolsSelection('csv')} style={{ ...BUTTON_BASE, width: '100%', padding: '.16rem .26rem', fontSize: '.62rem', textAlign: 'left' }}>
                    Export CSV
                  </button>
                  <button type="button" onClick={() => handleToolsSelection('excel')} style={{ ...BUTTON_BASE, width: '100%', padding: '.16rem .26rem', fontSize: '.62rem', textAlign: 'left' }}>
                    Export Excel
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.08rem .22rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.16rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '.66rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em', marginRight: '.04rem' }}>Filtri rapidi</div>
            <ActionButton
              label="Complete"
              onClick={() => onSelectQuickFilter(QUICK_FILTERS.complete)}
              kind={quickFilter === QUICK_FILTERS.complete ? 'primary' : 'ghost'}
              small
            />
            <ActionButton
              label="Incomplete"
              onClick={() => onSelectQuickFilter(QUICK_FILTERS.incomplete)}
              kind={quickFilter === QUICK_FILTERS.incomplete ? 'primary' : 'ghost'}
              small
            />
            <ActionButton
              label="Tutto"
              onClick={() => onSelectQuickFilter(QUICK_FILTERS.all)}
              kind={quickFilter === QUICK_FILTERS.all ? 'primary' : 'ghost'}
              small
            />
            <ActionButton
              label="Selezionate"
              onClick={() => onSelectQuickFilter(QUICK_FILTERS.selected)}
              kind={quickFilter === QUICK_FILTERS.selected ? 'primary' : 'ghost'}
              small
            />
            <ActionButton
              label="Stesso fornitore"
              onClick={() => onSelectQuickFilter(QUICK_FILTERS.sameSupplier)}
              disabled={!selectedCount}
              kind={quickFilter === QUICK_FILTERS.sameSupplier ? 'primary' : 'ghost'}
              small
            />
            <ActionButton
              label="Stesso conto"
              onClick={() => onPlaceholderAction('Filtri rapidi')}
              disabled
              kind="ghost"
              small
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.1rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.08rem', padding: '.08rem .14rem', borderRadius: 12, border: '1px solid rgba(96,165,250,.14)', background: 'rgba(16,42,68,.72)' }}>
              <div style={{ display: 'grid', gap: '.02rem' }}>
                <div style={{ fontSize: '.5rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Data reg.</div>
                <input
                  ref={registrationDateInputRef}
                  type="date"
                  value={registrationDateDraft}
                  onChange={(event) => setRegistrationDateDraft(event.target.value)}
                  style={{
                    ...BUTTON_BASE,
                    width: 108,
                    padding: '.12rem .22rem',
                    borderRadius: 10,
                    border: '1px solid rgba(96,165,250,.16)',
                    background: 'rgba(10,26,43,.94)',
                    color: 'var(--tx)',
                    fontSize: '.68rem',
                    cursor: 'pointer',
                  }}
                />
              </div>
              <ActionButton
                label="Applica data"
                onClick={onApplyRegistrationDate}
                kind="primary"
                small
                disabled={busy || !selectedCount || !registrationDateDraft}
              />
            </div>
            <MetaPill label="Selezionate" value={selectedCount} />
            <ActionButton label="Seleziona tutto" onClick={onSelectAllVisible} disabled={!visibleRows.length || busy} small />
            <ActionButton label="Deseleziona" onClick={onDeselectAll} disabled={!selectedCount || busy} small />
            <ActionButton label="Elimina selezionate" onClick={onDeleteSelectedRows} disabled={busy} kind="danger" small />
            <ActionButton label="Avvia contabilizzazione" onClick={onStartAccounting} disabled={busy} kind="warning" emphasis />
          </div>
        </div>
      </div>

      {hasActiveWorkingTableColumnFilters ? (
        <div style={{ padding: '0 .3rem .08rem', display: 'flex', alignItems: 'center', gap: '.22rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Filtri colonne:</span>
          {activeWorkingTableColumnFilters.map((item) => (
            <span
              key={item.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.2rem',
                padding: '.12rem .28rem',
                borderRadius: 999,
                border: '1px solid rgba(84,141,212,.26)',
                background: 'rgba(84,141,212,.12)',
                color: 'var(--tx)',
                fontSize: '.58rem',
                fontWeight: 700,
              }}
            >
              {item.label}
            </span>
          ))}
                  <button
                    type="button"
                    onClick={clearAllWorkingTableColumnFilters}
                    style={{ ...BUTTON_BASE, padding: '.12rem .26rem', fontSize: '.58rem' }}
                  >
            Pulisci filtri colonne
          </button>
        </div>
      ) : null}
    </>
  )
}
