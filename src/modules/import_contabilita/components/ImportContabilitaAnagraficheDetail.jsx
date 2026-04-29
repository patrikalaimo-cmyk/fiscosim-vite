export function ImportContabilitaAnagraficheDetail({
  anagraficheData,
  anagraficheHelpers,
}) {
  const {
    anagraficheVisibleRows,
    anagraficheUiRows,
    anagraficheVisibleCount,
    setAnagraficheVisibleCount,
    anagraficheStats,
    anagraficheDecisioniByKey,
    pianoConti,
    percipienti,
    busy,
    percipientiLoading,
    anagraficheTipoFiltro,
    anagraficaAllowedAccountsIndex,
    anagraficaAccountUpdateBusyKey,
    percipienteActionBusyKey,
    anagraficaActionBusyKey,
    previewRowId,
    setPreviewTab,
    setPreviewRowId,
    isInteractiveRowTarget,
  } = anagraficheData

  const {
    ActionButton,
    MessageBox,
    Th,
    Td,
    formatCount,
    normalizeText,
    getAnagraficaRowKey,
    normalizeAnagraficaDecisionKey,
    mergeAnagraficaDecision,
    validateAnagraficaDecision,
    getAnagraficaDecisionStateTone,
    buildPercipienteStatusForAnagraficaRow,
    getAllowedMastriniForTipo,
    getIndexedAllowedAccounts,
    resolveIndexedAllowedAccount,
    formatAnagraficaAccountOption,
    formatAnagraficaIdentifiers,
    getAnagraficaDetectionNote,
    setAnagraficaTipoForRow,
    setAnagraficaMastrinoForRow,
    setAnagraficaAzioneForRow,
    getAnagraficaTipoOptions,
    getAnagraficaDecisionActionOptions,
    getDefaultMastrinoForTipo,
    buildMissingAccountUpdates,
    onConfirmExistingPercipienteForRow,
    onCreatePercipienteForRow,
    onSelectExistingAnagraficaAccount,
    onUpdateExistingAnagraficaAccount,
    AnagraficaExistingAccountPicker,
  } = anagraficheHelpers

  if (!anagraficheStats?.total) return null

  return (
    <div style={{ maxHeight: 440, overflow: 'auto', borderTop: '1px solid rgba(124, 157, 202, .08)', paddingTop: '.14rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.35rem', marginBottom: '.24rem', fontSize: '.6rem', color: 'var(--mu)' }}>
        <span>Mostrate {anagraficheVisibleRows.length} di {anagraficheUiRows.length} anagrafiche</span>
        <div style={{ display: 'inline-flex', gap: '.22rem', flexWrap: 'wrap' }}>
          {anagraficheVisibleCount < anagraficheUiRows.length ? (
            <button
              type="button"
              onClick={() => setAnagraficheVisibleCount((current) => Math.min(current + 25, anagraficheUiRows.length))}
              style={{ border: '1px solid rgba(124,157,202,.18)', borderRadius: 999, padding: '.12rem .28rem', background: 'rgba(255,255,255,.02)', color: 'var(--tx)', fontSize: '.58rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Mostra altre 25
            </button>
          ) : null}
          {anagraficheVisibleCount > 25 ? (
            <button
              type="button"
              onClick={() => setAnagraficheVisibleCount(25)}
              style={{ border: '1px solid rgba(124,157,202,.18)', borderRadius: 999, padding: '.12rem .28rem', background: 'rgba(255,255,255,.02)', color: 'var(--tx)', fontSize: '.58rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Mostra meno
            </button>
          ) : null}
        </div>
      </div>
      <table style={{ width: '100%', minWidth: 1080, borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            <Th style={{ width: 88 }}>Tipo</Th>
            <Th style={{ width: 248 }}>Denominazione</Th>
            <Th style={{ width: 128 }}>Stato</Th>
            <Th style={{ width: 146 }}>Mastrino suggerito</Th>
            <Th style={{ width: 146 }}>Azione</Th>
            <Th style={{ width: 210 }}>Conto collegato</Th>
            <Th align="right" style={{ width: 84 }}>Fatture</Th>
            <Th align="center" style={{ width: 102 }}>Anteprima</Th>
          </tr>
        </thead>
        <tbody>
          {anagraficheVisibleRows.map((row, index) => {
            const rowKey = normalizeAnagraficaDecisionKey(row?.decisionKey || getAnagraficaRowKey(row, index))
            const storedDecision = rowKey ? anagraficheDecisioniByKey[rowKey] || null : null
            const decision = row?.decision || mergeAnagraficaDecision(row, storedDecision, pianoConti)
            const validation = row?.validation || validateAnagraficaDecision(row, decision, pianoConti)
            const decisionTone = getAnagraficaDecisionStateTone(row, decision, pianoConti)
            const decisionLabel = validation.label || 'Incompleta'
            const rowType = row?.rowType || (decision?.hiddenFromAnagrafiche && buildPercipienteStatusForAnagraficaRow(row, decision, percipienti).status !== 'not_relevant' ? 'percipiente' : '')
            const isPercipienteRow = rowType === 'percipiente'
            const tipoValue = decision.tipo === 'cliente' ? 'cliente' : 'fornitore'
            const allowedMastrini = isPercipienteRow ? [] : getAllowedMastriniForTipo(tipoValue)
            const allowedExistingAccounts = !isPercipienteRow && decision.accountMode === 'existing'
              ? getIndexedAllowedAccounts(anagraficaAllowedAccountsIndex, tipoValue, decision.mastrino)
              : []
            const selectedExistingAccount = !isPercipienteRow && decision.accountMode === 'existing'
              ? resolveIndexedAllowedAccount(anagraficaAllowedAccountsIndex, tipoValue, decision)
              : null
            const selectedExistingAccountLabel = selectedExistingAccount ? formatAnagraficaAccountOption(selectedExistingAccount) : normalizeText(decision.existingAccountCode || '')
            const hasIdentifiers = Boolean(normalizeText(row?.partitaIva) || normalizeText(row?.codiceFiscale))
            const subjectFallback = tipoValue === 'cliente'
              ? 'Denominazione cliente mancante'
              : 'Denominazione fornitore mancante'
            const displayName = normalizeText(row?.denominazione) || (hasIdentifiers ? subjectFallback : 'Soggetto mancante')
            const blockingReason = validation?.blockingReasons?.[0] || ''
            const rowNote = blockingReason || getAnagraficaDetectionNote(row)
            const accountUpdateInfo = decision.accountMode === 'existing' && validation.status === 'linked'
              ? buildMissingAccountUpdates(row, decision, pianoConti)
              : { hasUpdates: false, labels: [], warnings: [], account: null }
            const accountUpdateSummary = [
              ...(((accountUpdateInfo.labels || [])).slice ? (accountUpdateInfo.labels || []).slice(0, 3) : []),
              ...(((accountUpdateInfo.warnings || [])).slice ? (accountUpdateInfo.warnings || []).slice(0, 2) : []),
            ].filter(Boolean).join(' · ')
            const percipienteState = buildPercipienteStatusForAnagraficaRow(row, decision, percipienti)
            const previewTargetRowKey = normalizeText(row?.previewRowKey || '')
            const identifierText = formatAnagraficaIdentifiers(row)
            const isActivePreviewRow = Boolean(previewTargetRowKey && previewRowId === previewTargetRowKey)

            return (
              <tr
                key={rowKey}
                onClick={(event) => {
                  if (!previewTargetRowKey || isInteractiveRowTarget(event.target)) return
                  setPreviewTab('fattura')
                  setPreviewRowId(previewTargetRowKey)
                }}
                style={{
                  cursor: previewTargetRowKey ? 'pointer' : 'default',
                  background: isActivePreviewRow ? 'rgba(59,130,246,.08)' : 'transparent',
                  boxShadow: isActivePreviewRow ? 'inset 0 0 0 1px rgba(96,165,250,.34)' : 'none',
                }}
              >
                <Td>
                  {isPercipienteRow ? (
                    <div style={{ display: 'grid', gap: '.03rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '.12rem .3rem', borderRadius: 999, border: '1px solid rgba(255,193,7,.22)', background: 'rgba(255,193,7,.08)', color: '#ffe9a8', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        Percipiente
                      </span>
                      <div style={{ color: 'var(--mu)', fontSize: '.55rem' }}>
                        {percipienteState?.label || 'CF da verificare'}
                      </div>
                    </div>
                  ) : (
                    <select
                      value={tipoValue}
                      onChange={(event) => setAnagraficaTipoForRow(row, event.target.value)}
                      style={{ width: '100%', border: '1px solid rgba(124,157,202,.18)', borderRadius: 8, background: 'rgba(255,255,255,.03)', color: 'var(--tx)', padding: '.14rem .22rem', fontSize: '.66rem', fontWeight: 700 }}
                    >
                      {getAnagraficaTipoOptions().map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  )}
                </Td>
                <Td>
                  <div style={{ display: 'grid', gap: '.03rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '.74rem', lineHeight: 1.12 }}>{displayName}</div>
                    <div style={{ display: 'grid', gap: '.02rem' }}>
                      <div style={{ color: row?.matchedPianoContoCode ? 'var(--mu)' : '#bcd7ff', fontSize: '.61rem', lineHeight: 1.1 }}>
                        {rowNote}
                      </div>
                      {identifierText ? (
                        <div style={{ color: 'var(--mu)', fontSize: '.55rem', lineHeight: 1.08 }}>
                          {identifierText}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Td>
                <Td>
                  <div style={{ display: 'grid', gap: '.04rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '.12rem .3rem', borderRadius: 999, border: decisionTone === 'success' ? '1px solid rgba(40,167,69,.22)' : decisionTone === 'warning' ? '1px solid rgba(255,193,7,.22)' : decisionTone === 'danger' ? '1px solid rgba(221,91,91,.22)' : '1px solid rgba(124,157,202,.18)', background: decisionTone === 'success' ? 'rgba(40,167,69,.1)' : decisionTone === 'warning' ? 'rgba(255,193,7,.08)' : decisionTone === 'danger' ? 'rgba(221,91,91,.1)' : 'rgba(124,157,202,.08)', color: decisionTone === 'success' ? '#baf3c5' : decisionTone === 'warning' ? '#ffe9a8' : decisionTone === 'danger' ? '#ffc5c5' : 'var(--tx)', fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{decisionLabel}</span>
                    {validation?.blockingReasons?.length ? (
                      <div style={{ color: '#ffc5c5', fontSize: '.56rem', lineHeight: 1.12 }}>
                        {validation.blockingReasons[0]}
                      </div>
                    ) : null}
                    {percipienteState?.status && percipienteState.status !== 'not_relevant' ? (
                      <div style={{ display: 'grid', gap: '.04rem', marginTop: '.03rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '.1rem .28rem', borderRadius: 999, border: percipienteState.tone === 'success' ? '1px solid rgba(40,167,69,.22)' : percipienteState.tone === 'danger' ? '1px solid rgba(221,91,91,.22)' : '1px solid rgba(255,193,7,.22)', background: percipienteState.tone === 'success' ? 'rgba(40,167,69,.1)' : percipienteState.tone === 'danger' ? 'rgba(221,91,91,.1)' : 'rgba(255,193,7,.08)', color: percipienteState.tone === 'success' ? '#baf3c5' : percipienteState.tone === 'danger' ? '#ffc5c5' : '#ffe9a8', fontSize: '.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                          Percipiente: {percipienteState.label}
                        </span>
                        {percipienteState.codiceFiscale || percipienteState.denominazione ? (
                          <div style={{ color: 'var(--mu)', fontSize: '.54rem', lineHeight: 1.12 }}>
                            {[percipienteState.codiceFiscale ? `CF ${percipienteState.codiceFiscale}` : null, percipienteState.denominazione || null].filter(Boolean).join(' · ')}
                          </div>
                        ) : null}
                        {Array.isArray(percipienteState.reasons) && percipienteState.reasons.length ? (
                          <div style={{ color: percipienteState.tone === 'danger' ? '#ffc5c5' : 'var(--mu)', fontSize: '.52rem', lineHeight: 1.08 }}>
                            {percipienteState.reasons[0]}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Td>
                <Td>
                  <div style={{ display: 'grid', gap: '.03rem' }}>
                    {isPercipienteRow ? (
                      <>
                        <div style={{ color: 'var(--tx)', fontSize: '.66rem', fontWeight: 700 }}>
                          {decision.mastrino || getDefaultMastrinoForTipo(tipoValue)}
                        </div>
                        <div style={{ color: 'var(--mu)', fontSize: '.56rem' }}>Solo detection percipiente</div>
                      </>
                    ) : (
                      <>
                        <select
                          value={decision.mastrino || getDefaultMastrinoForTipo(tipoValue)}
                          onChange={(event) => setAnagraficaMastrinoForRow(row, event.target.value)}
                          style={{ width: '100%', border: '1px solid rgba(124,157,202,.18)', borderRadius: 8, background: 'rgba(255,255,255,.03)', color: 'var(--tx)', padding: '.14rem .22rem', fontSize: '.66rem', fontWeight: 700 }}
                        >
                          {allowedMastrini.map((item) => (
                            <option key={item.codice} value={item.codice}>{item.codice} - {item.label}</option>
                          ))}
                        </select>
                        {row?.matchedPianoContoCode ? (
                          <div style={{ color: 'var(--mu)', fontSize: '.56rem' }}>Codice piano conti: {row.matchedPianoContoCode}</div>
                        ) : null}
                      </>
                    )}
                  </div>
                </Td>
                <Td>
                  {isPercipienteRow ? (
                    <div style={{ display: 'grid', gap: '.08rem' }}>
                      {percipienteState.status === 'missing_cf' ? (
                        <div style={{ color: '#ffc5c5', fontSize: '.62rem', lineHeight: 1.18 }}>
                          CF obbligatorio per percipiente
                        </div>
                      ) : percipienteState.status === 'unknown' ? (
                        <div style={{ color: 'var(--mu)', fontSize: '.62rem', lineHeight: 1.18 }}>
                          Percipienti non caricati
                        </div>
                      ) : percipienteState.status === 'existing' ? (
                        <ActionButton
                          label={percipienteActionBusyKey === rowKey ? 'Verifica...' : 'Conferma percipiente esistente'}
                          onClick={() => onConfirmExistingPercipienteForRow(row)}
                          kind="primary"
                          small
                          disabled={busy || percipienteActionBusyKey === rowKey || percipientiLoading}
                        />
                      ) : percipienteState.status === 'candidate' ? (
                        <ActionButton
                          label={percipienteActionBusyKey === rowKey ? 'Creazione...' : 'Crea percipiente'}
                          onClick={() => onCreatePercipienteForRow(row)}
                          kind="success"
                          small
                          disabled={busy || percipienteActionBusyKey === rowKey || percipientiLoading}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <select
                      value={decision.accountMode}
                      onChange={(event) => setAnagraficaAzioneForRow(row, event.target.value)}
                      style={{ width: '100%', border: '1px solid rgba(124,157,202,.18)', borderRadius: 8, background: 'rgba(255,255,255,.03)', color: 'var(--tx)', padding: '.14rem .22rem', fontSize: '.66rem', fontWeight: 700 }}
                    >
                      {getAnagraficaDecisionActionOptions().map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  )}
                </Td>
                <Td>
                  {isPercipienteRow ? (
                    <div style={{ display: 'grid', gap: '.04rem' }}>
                      <div style={{ color: 'var(--tx)', fontSize: '.62rem', fontWeight: 700 }}>
                        {percipienteState.codiceFiscale || 'CF mancante'}
                      </div>
                      {percipienteState.denominazione ? (
                        <div style={{ color: 'var(--mu)', fontSize: '.54rem', lineHeight: 1.12 }}>
                          {percipienteState.denominazione}
                        </div>
                      ) : null}
                      <div style={{ color: 'var(--mu)', fontSize: '.52rem', lineHeight: 1.08 }}>
                        Solo detection percipiente
                      </div>
                    </div>
                  ) : decision.accountMode === 'existing' ? (
                    <div style={{ display: 'grid', gap: '.12rem' }}>
                      <AnagraficaExistingAccountPicker
                        rowKey={rowKey}
                        tipo={tipoValue}
                        valueId={decision.existingAccountId}
                        valueCode={decision.existingAccountCode}
                        selectedLabel={selectedExistingAccountLabel}
                        allowedAccounts={allowedExistingAccounts}
                        onSelect={(conto) => onSelectExistingAnagraficaAccount(rowKey, conto, row, tipoValue)}
                      />
                      {(accountUpdateInfo.hasUpdates || accountUpdateInfo.warnings?.length) ? (
                        <div style={{ display: 'grid', gap: '.08rem', padding: '.16rem .2rem', borderRadius: 8, border: '1px solid rgba(124,157,202,.14)', background: 'rgba(124,157,202,.04)' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.2rem', flexWrap: 'wrap' }}>
                            <span style={{ padding: '.08rem .24rem', borderRadius: 999, background: 'rgba(124,157,202,.12)', color: 'var(--tx)', fontSize: '.54rem', fontWeight: 800 }}>
                              {accountUpdateInfo.hasUpdates ? 'Dati conto da aggiornare' : 'Dato diverso da verificare'}
                            </span>
                          </div>
                          {accountUpdateSummary ? (
                            <div style={{ color: 'var(--mu)', fontSize: '.55rem', lineHeight: 1.16 }}>
                              {accountUpdateSummary}
                            </div>
                          ) : null}
                          {accountUpdateInfo.hasUpdates ? (
                            <ActionButton
                              label={anagraficaAccountUpdateBusyKey === rowKey ? 'Aggiornamento...' : 'Aggiorna dati conto'}
                              onClick={() => onUpdateExistingAnagraficaAccount(row, decision)}
                              kind="primary"
                              small
                              disabled={busy || anagraficaAccountUpdateBusyKey === rowKey}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ fontSize: '.62rem', color: 'var(--mu)' }}>
                      {decision.accountMode === 'choose'
                        ? 'Da scegliere'
                        : decision.accountMode === 'none'
                          ? 'Nessuna azione'
                          : decision.accountMode === 'new'
                            ? 'Crea nuovo conto'
                            : 'Conto esistente'}
                    </div>
                  )}
                </Td>
                <Td align="right">{formatCount(row?.fattureCount)}</Td>
                <Td align="center">
                  <ActionButton
                    label={previewTargetRowKey ? 'Anteprima' : 'N/D'}
                    onClick={() => {
                      if (!previewTargetRowKey) return
                      setPreviewTab('fattura')
                      setPreviewRowId(previewTargetRowKey)
                    }}
                    kind="ghost"
                    small
                    disabled={!previewTargetRowKey}
                  />
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}


