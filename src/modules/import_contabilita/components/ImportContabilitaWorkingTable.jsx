import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

function getWorkingTableAutomationFieldLabels(fields = []) {
  const labelsByField = {
    account: 'Conto',
    causale: 'Causale',
    date: 'Data',
    iva: 'IVA',
  }
  if (!Array.isArray(fields)) return []
  return fields
    .map((field) => labelsByField[field] || '')
    .filter(Boolean)
}

export function ImportContabilitaWorkingTable({
  visibleRows,
  stagingRows,
  busy,
  allVisibleSelected,
  headerCheckboxRef,
  onToggleVisibleSelection,
  workingTableColumnFilters,
  columnFilters,
  columnSort,
  openColumnFilter,
  columnFilterMenuRef,
  onToggleMenu,
  onCloseMenu,
  onUpdateFilter,
  onClearFilter,
  onSetSort,
  Th,
  Td,
  ActionButton,
  WorkingTableColumnHeader,
  EmptyState,
  MessageBox,
  BadgePlaceholder,
  formatDateOnly,
  formatMoney,
  formatManualAccount,
  formatManualCausale,
  getCounterpartyDisplayInfo,
  getWorkingTableRowReadiness,
  describePianoContoFlags,
  selectedRowIds,
  updateSelectedRows,
  manualAccountByRowId,
  manualCausaleByRowId,
  manualRegistrationDateByRowId,
  automationMetaByRowId,
  counterpartyAccountByRowId,
  accountEditorRowId,
  causaleEditorRowId,
  accountSearchTerm,
  causaleSearchTerm,
  accountSearchInputRef,
  causaleSearchInputRef,
  setAccountEditorRowId,
  setCausaleEditorRowId,
  setAccountSearchTerm,
  setCausaleSearchTerm,
  updateManualAccountForRow,
  updateManualCausaleForRow,
  filteredPianoConti,
  pianoContiLoading,
  pianoContiError,
  filteredCausaliContabili,
  causaliContabiliLoading,
  causaliContabiliError,
  isPreviewPanelOpen,
  onStagingRowClick,
  previewRowId,
  setPreviewRowId,
  getRowKey,
}) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    const activeKey = accountEditorRowId || causaleEditorRowId
    const type = accountEditorRowId ? 'conto' : 'causale'
    if (activeKey) {
      const btn = document.getElementById(`btn-${type}-${activeKey}`)
      if (btn) {
        const updateCoords = () => {
          const rect = btn.getBoundingClientRect()
          setCoords({
            top: rect.bottom,
            left: rect.left,
            width: rect.width,
          })
        }
        updateCoords()
        window.addEventListener('resize', updateCoords)
        window.addEventListener('scroll', updateCoords, true)
        return () => {
          window.removeEventListener('resize', updateCoords)
          window.removeEventListener('scroll', updateCoords, true)
        }
      }
    }
    return undefined
  }, [accountEditorRowId, causaleEditorRowId])

  return (
    <>
      {visibleRows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 .12rem', minWidth: 1450 }}>
            <thead>
              <tr>
                <Th align="center" style={{ width: 34, background: 'rgba(0,0,0,.14)' }}>
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={onToggleVisibleSelection}
                    disabled={!visibleRows.length || busy}
                  />
                </Th>
                <WorkingTableColumnHeader
                  columnKey="supplier"
                  label={workingTableColumnFilters.supplier.label}
                  type={workingTableColumnFilters.supplier.type}
                  columnFilters={columnFilters}
                  columnSort={columnSort}
                  openColumnFilter={openColumnFilter}
                  menuRef={columnFilterMenuRef}
                  onToggleMenu={onToggleMenu}
                  onCloseMenu={onCloseMenu}
                  onUpdateFilter={onUpdateFilter}
                  onClearFilter={onClearFilter}
                  onSetSort={onSetSort}
                />
                <Th style={{ width: 88, minWidth: 88 }}>Data reg.</Th>
                <WorkingTableColumnHeader
                  columnKey="dataDocumento"
                  label={workingTableColumnFilters.dataDocumento.label}
                  type={workingTableColumnFilters.dataDocumento.type}
                  width={92}
                  align="center"
                  columnFilters={columnFilters}
                  columnSort={columnSort}
                  openColumnFilter={openColumnFilter}
                  menuRef={columnFilterMenuRef}
                  onToggleMenu={onToggleMenu}
                  onCloseMenu={onCloseMenu}
                  onUpdateFilter={onUpdateFilter}
                  onClearFilter={onClearFilter}
                  onSetSort={onSetSort}
                />
                <WorkingTableColumnHeader
                  columnKey="numeroDocumento"
                  label={workingTableColumnFilters.numeroDocumento.label}
                  type={workingTableColumnFilters.numeroDocumento.type}
                  width={96}
                  columnFilters={columnFilters}
                  columnSort={columnSort}
                  openColumnFilter={openColumnFilter}
                  menuRef={columnFilterMenuRef}
                  onToggleMenu={onToggleMenu}
                  onCloseMenu={onCloseMenu}
                  onUpdateFilter={onUpdateFilter}
                  onClearFilter={onClearFilter}
                  onSetSort={onSetSort}
                />
                <WorkingTableColumnHeader
                  columnKey="imponibile"
                  label={workingTableColumnFilters.imponibile.label}
                  type={workingTableColumnFilters.imponibile.type}
                  width={78}
                  align="right"
                  columnFilters={columnFilters}
                  columnSort={columnSort}
                  openColumnFilter={openColumnFilter}
                  menuRef={columnFilterMenuRef}
                  onToggleMenu={onToggleMenu}
                  onCloseMenu={onCloseMenu}
                  onUpdateFilter={onUpdateFilter}
                  onClearFilter={onClearFilter}
                  onSetSort={onSetSort}
                />
                <WorkingTableColumnHeader
                  columnKey="iva"
                  label={workingTableColumnFilters.iva.label}
                  type={workingTableColumnFilters.iva.type}
                  width={78}
                  align="right"
                  columnFilters={columnFilters}
                  columnSort={columnSort}
                  openColumnFilter={openColumnFilter}
                  menuRef={columnFilterMenuRef}
                  onToggleMenu={onToggleMenu}
                  onCloseMenu={onCloseMenu}
                  onUpdateFilter={onUpdateFilter}
                  onClearFilter={onClearFilter}
                  onSetSort={onSetSort}
                />
                <WorkingTableColumnHeader
                  columnKey="totale"
                  label={workingTableColumnFilters.totale.label}
                  type={workingTableColumnFilters.totale.type}
                  width={78}
                  align="right"
                  columnFilters={columnFilters}
                  columnSort={columnSort}
                  openColumnFilter={openColumnFilter}
                  menuRef={columnFilterMenuRef}
                  onToggleMenu={onToggleMenu}
                  onCloseMenu={onCloseMenu}
                  onUpdateFilter={onUpdateFilter}
                  onClearFilter={onClearFilter}
                  onSetSort={onSetSort}
                />
                <WorkingTableColumnHeader
                  columnKey="conto"
                  label={workingTableColumnFilters.conto.label}
                  type={workingTableColumnFilters.conto.type}
                  columnFilters={columnFilters}
                  columnSort={columnSort}
                  openColumnFilter={openColumnFilter}
                  menuRef={columnFilterMenuRef}
                  onToggleMenu={onToggleMenu}
                  onCloseMenu={onCloseMenu}
                  onUpdateFilter={onUpdateFilter}
                  onClearFilter={onClearFilter}
                  onSetSort={onSetSort}
                />
                <WorkingTableColumnHeader
                  columnKey="causale"
                  label={workingTableColumnFilters.causale.label}
                  type={workingTableColumnFilters.causale.type}
                  columnFilters={columnFilters}
                  columnSort={columnSort}
                  openColumnFilter={openColumnFilter}
                  menuRef={columnFilterMenuRef}
                  onToggleMenu={onToggleMenu}
                  onCloseMenu={onCloseMenu}
                  onUpdateFilter={onUpdateFilter}
                  onClearFilter={onClearFilter}
                  onSetSort={onSetSort}
                />
                <Th>Esito</Th>
                <Th>Azioni</Th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const key = getRowKey(row)
                const checked = selectedRowIds.has(key)
                const manualAccount = manualAccountByRowId[key] || null
                const isAccountEditorOpen = accountEditorRowId === key
                const manualCausale = manualCausaleByRowId[key] || null
                const isCausaleEditorOpen = causaleEditorRowId === key
                const manualRegistrationDate = manualRegistrationDateByRowId[key] || ''
                const automationMeta = automationMetaByRowId?.[key] || null
                const automationFieldLabels = getWorkingTableAutomationFieldLabels(automationMeta?.fields)
                const registrationDateDisplay = formatDateOnly(
                  manualRegistrationDate
                    || row?.registrazioneData
                    || row?.dataRegistrazione
                    || row?.registrationDate
                    || row?.dataRegistrazioneApplicata
                    || row?.parsedDocument?.dataRegistrazione
                    || row?.parsedDocument?.registrationDate
                    || row?.contabilizzazioneData
                    || row?.contabilizedAt
                    || row?.registeredAt,
                )
                const readiness = getWorkingTableRowReadiness(row, manualAccount, manualCausale, counterpartyAccountByRowId[key] || null)
                const readinessTitle = readiness.missing.length ? readiness.missing.join(', ') : readiness.label

                return (
                  <tr
                    key={key}
                    style={{
                      background: checked ? 'rgba(59,130,246,.08)' : 'rgba(15,37,60,.66)',
                      boxShadow: previewRowId === key ? 'inset 0 0 0 1px rgba(96,165,250,.22)' : 'inset 0 0 0 1px rgba(96,165,250,.05)',
                      transition: 'background .12s ease, box-shadow .12s ease, transform .12s ease',
                      cursor: isPreviewPanelOpen ? 'pointer' : 'default',
                      borderRadius: 12,
                    }}
                    onMouseEnter={(event) => {
                      if (!checked) event.currentTarget.style.background = 'rgba(19,48,75,.82)'
                    }}
                    onMouseLeave={(event) => {
                      if (!checked) event.currentTarget.style.background = 'rgba(15,37,60,.66)'
                    }}
                    onClick={(event) => onStagingRowClick(row, event)}
                  >
                    <Td align="center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const next = new Set(selectedRowIds)
                          if (event.target.checked) next.add(key)
                          else next.delete(key)
                          updateSelectedRows(next)
                        }}
                        disabled={busy}
                      />
                    </Td>
                    <Td>
                      <div style={{ display: 'grid', gap: '.04rem' }}>
                        {(() => {
                          const fornitoreDisplay = getCounterpartyDisplayInfo(row?.parsedDocument?.fornitore, 'fornitore')
                          const counterpartyAccount = counterpartyAccountByRowId[key] || null
                          const counterpartyAccountLabel = counterpartyAccount
                            ? [counterpartyAccount.codice || '', counterpartyAccount.descrizione || '']
                              .filter(Boolean)
                              .join(' - ')
                            : 'Non collegato'
                          return (
                            <>
                              <strong style={{ fontSize: '.74rem', color: 'var(--tx)', lineHeight: 1.12 }}>{fornitoreDisplay.title}</strong>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  width: 'fit-content',
                                  alignItems: 'center',
                                  padding: '.08rem .24rem',
                                  borderRadius: 999,
                                  border: counterpartyAccount ? '1px solid rgba(96,165,250,.12)' : '1px solid rgba(245,158,11,.18)',
                                  background: counterpartyAccount ? 'rgba(59,130,246,.06)' : 'rgba(245,158,11,.06)',
                                  color: counterpartyAccount ? '#c7d7ea' : '#ffe2a8',
                                  fontSize: '.58rem',
                                  fontWeight: counterpartyAccount ? 600 : 800,
                                }}
                              >
                                {counterpartyAccountLabel || '-'}
                              </span>
                            </>
                          )
                        })()}
                      </div>
                    </Td>
                    <Td style={{ whiteSpace: 'nowrap', fontSize: '.66rem' }}>
                      {registrationDateDisplay && registrationDateDisplay !== '—' ? (
                        registrationDateDisplay
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '.08rem .24rem', borderRadius: 999, border: '1px solid rgba(245,158,11,.16)', background: 'rgba(245,158,11,.06)', color: '#ffe2a8', fontSize: '.58rem', fontWeight: 800 }}>
                          Da impostare
                        </span>
                      )}
                    </Td>
                    <Td style={{ whiteSpace: 'nowrap', fontSize: '.66rem' }}>{formatDateOnly(row.parsedDocument?.dataDocumento)}</Td>
                    <Td>
                      <div style={{ maxWidth: 96, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.08 }}>
                        {row.parsedDocument?.numeroDocumento || '-'}
                      </div>
                    </Td>
                    <Td align="right">{formatMoney(row.parsedDocument?.imponibile)}</Td>
                    <Td align="right">{formatMoney(row.parsedDocument?.iva)}</Td>
                    <Td align="right">{formatMoney(row.parsedDocument?.totale)}</Td>
                    <Td>
                      <div style={{ position: 'relative', minHeight: 24 }}>
                        <button
                          id={`btn-conto-${key}`}
                          type="button"
                          onClick={() => {
                            setAccountEditorRowId(isAccountEditorOpen ? '' : key)
                            setAccountSearchTerm('')
                          }}
                          style={{
                            width: '100%',
                            border: '1px solid rgba(96,165,250,.12)',
                            background: 'linear-gradient(180deg, rgba(16,42,68,.82), rgba(10,26,43,.94))',
                            color: manualAccount ? '#dbeafe' : '#93a8bf',
                            borderRadius: 10,
                            padding: '.16rem .28rem',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '.7rem',
                            lineHeight: 1.18,
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.02)',
                          }}
                          title="Apri editor conto"
                        >
                          {formatManualAccount(manualAccount)}
                        </button>

                        {isAccountEditorOpen ? createPortal(
                          <div
                            style={{
                              position: 'fixed',
                              top: coords.top + 4,
                              left: coords.left,
                              width: 360,
                              maxWidth: 'min(360px, 95vw)',
                              zIndex: 9999,
                              border: '1px solid rgba(148,163,184,.14)',
                              borderRadius: 12,
                              background: 'rgba(8,24,40,.98)',
                              boxShadow: '0 18px 40px rgba(0,0,0,.22)',
                              padding: '.34rem .38rem',
                              display: 'grid',
                              gap: '.3rem',
                            }}
                          >
                            <div style={{ fontSize: '.64rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                              Cerca conto...
                            </div>
                            <input
                              ref={accountSearchInputRef}
                              value={accountSearchTerm}
                              onChange={(event) => setAccountSearchTerm(event.target.value)}
                              placeholder="Codice, descrizione, P.IVA, CF"
                              style={{
                                width: '100%',
                                border: '1px solid rgba(148,163,184,.14)',
                                borderRadius: 8,
                                background: 'rgba(255,255,255,.02)',
                                color: '#dbeafe',
                                padding: '.18rem .28rem',
                                fontSize: '.74rem',
                                outline: 'none',
                              }}
                            />

                            {pianoContiLoading ? (
                              <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>Caricamento piano conti...</div>
                            ) : pianoContiError ? (
                              <MessageBox tone="error">{pianoContiError}</MessageBox>
                            ) : filteredPianoConti.length ? (
                              <div style={{ display: 'grid', gap: '.18rem', maxHeight: 240, overflow: 'auto' }}>
                                {filteredPianoConti.map((conto) => (
                                  <button
                                    key={conto.id}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      updateManualAccountForRow(key, {
                                        id: conto.id,
                                        codice: conto.codice,
                                        descrizione: conto.descrizione,
                                      })
                                      setAccountEditorRowId('')
                                      setAccountSearchTerm('')
                                    }}
                                    style={{
                                      width: '100%',
                                      border: '1px solid rgba(148,163,184,.14)',
                                      borderRadius: 8,
                                      background: 'rgba(255,255,255,.015)',
                                      color: '#dbeafe',
                                      padding: '.2rem .28rem',
                                      cursor: 'pointer',
                                      display: 'grid',
                                      gridTemplateColumns: '84px 1fr auto',
                                      gap: '.28rem',
                                      alignItems: 'center',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <strong style={{ fontSize: '.7rem' }}>{conto.codice || '—'}</strong>
                                    <span
                                      style={{
                                        fontSize: '.68rem',
                                        color: 'var(--tx)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {conto.descrizione || '—'}
                                    </span>
                                    <span style={{ fontSize: '.58rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                      {describePianoContoFlags(conto)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>Nessun conto trovato</div>
                            )}
                          </div>,
                          document.body
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <div style={{ position: 'relative', minHeight: 24 }}>
                        <button
                          id={`btn-causale-${key}`}
                          type="button"
                          onClick={() => {
                            setCausaleEditorRowId(isCausaleEditorOpen ? '' : key)
                            setCausaleSearchTerm('')
                          }}
                          style={{
                            width: '100%',
                            border: '1px solid rgba(96,165,250,.12)',
                            background: 'linear-gradient(180deg, rgba(16,42,68,.82), rgba(10,26,43,.94))',
                            color: manualCausale ? '#dbeafe' : '#93a8bf',
                            borderRadius: 10,
                            padding: '.16rem .28rem',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '.7rem',
                            lineHeight: 1.18,
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.02)',
                          }}
                          title="Apri editor causale"
                        >
                          {formatManualCausale(manualCausale)}
                        </button>

                        {isCausaleEditorOpen ? createPortal(
                          <div
                            style={{
                              position: 'fixed',
                              top: coords.top + 4,
                              left: coords.left,
                              width: 360,
                              maxWidth: 'min(360px, 88vw)',
                              zIndex: 9999,
                              border: '1px solid rgba(148,163,184,.14)',
                              borderRadius: 12,
                              background: 'rgba(8,24,40,.98)',
                              boxShadow: '0 18px 40px rgba(0,0,0,.22)',
                              padding: '.34rem .38rem',
                              display: 'grid',
                              gap: '.3rem',
                            }}
                          >
                            <div style={{ fontSize: '.64rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                              Cerca causale...
                            </div>
                            <input
                              ref={causaleSearchInputRef}
                              value={causaleSearchTerm}
                              onChange={(event) => setCausaleSearchTerm(event.target.value)}
                              placeholder="Codice, descrizione"
                              style={{
                                width: '100%',
                                border: '1px solid rgba(148,163,184,.14)',
                                borderRadius: 8,
                                background: 'rgba(255,255,255,.02)',
                                color: '#dbeafe',
                                padding: '.18rem .28rem',
                                fontSize: '.74rem',
                                outline: 'none',
                              }}
                            />

                            {causaliContabiliLoading ? (
                              <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>Caricamento causali contabili...</div>
                            ) : causaliContabiliError ? (
                              <MessageBox tone="error">{causaliContabiliError}</MessageBox>
                            ) : filteredCausaliContabili.length ? (
                              <div style={{ display: 'grid', gap: '.18rem', maxHeight: 240, overflow: 'auto' }}>
                                {filteredCausaliContabili.map((causale) => (
                                  <button
                                    key={causale.id}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      updateManualCausaleForRow(key, {
                                        id: causale.id,
                                        codice: causale.codice,
                                        descrizione: causale.descrizione,
                                      })
                                      setCausaleEditorRowId('')
                                      setCausaleSearchTerm('')
                                    }}
                                    style={{
                                      width: '100%',
                                      border: '1px solid rgba(148,163,184,.14)',
                                      borderRadius: 8,
                                      background: 'rgba(255,255,255,.015)',
                                      color: '#dbeafe',
                                      padding: '.2rem .28rem',
                                      cursor: 'pointer',
                                      display: 'grid',
                                      gridTemplateColumns: '84px 1fr',
                                      gap: '.28rem',
                                      alignItems: 'center',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <strong style={{ fontSize: '.7rem' }}>{causale.codice || '—'}</strong>
                                    <span
                                      style={{
                                        fontSize: '.68rem',
                                        color: 'var(--tx)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {causale.descrizione || '—'}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>Nessuna causale trovata</div>
                            )}
                          </div>,
                          document.body
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <div style={{ display: 'grid', gap: '.04rem', minWidth: 0 }}>
                        <span
                          title={readinessTitle}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            width: 'fit-content',
                            padding: '.1rem .26rem',
                            borderRadius: 999,
                            border: readiness.label === 'Pronta'
                              ? '1px solid rgba(34,197,94,.16)'
                              : readiness.label === 'Da completare'
                                ? '1px solid rgba(245,158,11,.18)'
                                : '1px solid rgba(239,68,68,.18)',
                            background: readiness.label === 'Pronta'
                              ? 'rgba(34,197,94,.08)'
                              : readiness.label === 'Da completare'
                                ? 'rgba(245,158,11,.08)'
                                : 'rgba(239,68,68,.08)',
                            color: readiness.label === 'Pronta'
                              ? '#a7f3d0'
                              : readiness.label === 'Da completare'
                                ? '#ffe2a8'
                                : '#ffb9be',
                            fontSize: '.58rem',
                            fontWeight: 800,
                            letterSpacing: '.02em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {readiness.label}
                        </span>
                        {readiness.missing.length ? (
                          <div style={{ color: '#93a8bf', fontSize: '.52rem', lineHeight: 1.08, maxWidth: 132, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {readiness.missing[0]}
                          </div>
                        ) : null}
                        {automationFieldLabels.length ? (
                          <span
                            title={`Automazione applicata: ${automationFieldLabels.join(', ')}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              width: 'fit-content',
                              padding: '.08rem .22rem',
                              borderRadius: 999,
                              border: '1px solid rgba(245,158,11,.28)',
                              background: 'rgba(245,158,11,.1)',
                              color: '#ffe2a8',
                              fontSize: '.54rem',
                              fontWeight: 800,
                              letterSpacing: '.02em',
                              textTransform: 'uppercase',
                            }}
                          >
                            Auto
                          </span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <ActionButton label="Anteprima" onClick={() => setPreviewRowId(key)} kind="ghost" small />
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={stagingRows.length ? 'Nessuna riga corrisponde ai filtri' : 'Nessun dato staging disponibile'}
          description={
            stagingRows.length
              ? 'Prova a modificare la ricerca o rimuovere i filtri attivi.'
              : "Carica un file XML, P7M o ZIP per avviare l'analisi."
          }
        />
      )}
    </>
  )
}
