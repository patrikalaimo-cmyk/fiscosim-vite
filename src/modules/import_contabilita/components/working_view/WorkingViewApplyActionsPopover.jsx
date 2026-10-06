import { useEffect, useMemo, useState } from 'react'

const SCOPE_OPTIONS = [
  { value: 'same_counterparty', label: 'Stesso fornitore / cliente', dangerous: false },
  { value: 'selected', label: 'Fatture selezionate', dangerous: false },
  { value: 'visible', label: 'Fatture visibili', dangerous: false },
  { value: 'incomplete', label: 'Tutte incomplete', dangerous: false },
  { value: 'all', label: 'Tutte', dangerous: true },
]

const DEFAULT_CHECKS = {
  account: true,
  causale: true,
  iva: false,
  note: false,
  date: false,
}

function getWvRowKey(row) {
  return String(row?.id || row?.filename || '')
}

function normalizeWvCounterpartyId(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim()
}

function normalizeWvCounterpartyName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase()
    .trim()
}

function normalizeWvCausaleKey(causale) {
  return String(causale?.id || causale?.codice || '').trim()
}

function normalizeWvIvaRate(value) {
  const numeric = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 10000) / 10000
}

function normalizeWvIvaNature(value) {
  return String(value || '').trim().toUpperCase()
}

function getPopoverAutomationFieldLabels(fields = []) {
  const labelsByField = {
    account: 'Conto costo / ricavo',
    causale: 'Causale contabile',
    date: 'Data registrazione',
    iva: 'Trattamento IVA',
  }
  if (!Array.isArray(fields)) return []
  return fields
    .map((field) => labelsByField[field] || '')
    .filter(Boolean)
}

function getWvIvaSignature(row) {
  return `${normalizeWvIvaNature(row?.natura)}::${normalizeWvIvaRate(row?.aliquota)}`
}

function haveCompatibleWvIvaStructure(sourceRows = [], targetRows = []) {
  if (!Array.isArray(sourceRows) || !sourceRows.length) return false
  if (!Array.isArray(targetRows) || targetRows.length !== sourceRows.length) return false

  const countSignatures = (rows) => {
    const counts = new Map()
    rows.forEach((row) => {
      const signature = getWvIvaSignature(row)
      counts.set(signature, (counts.get(signature) || 0) + 1)
    })
    return counts
  }

  const sourceMap = countSignatures(sourceRows)
  const targetMap = countSignatures(targetRows)
  if (sourceMap.size !== targetMap.size) return false
  for (const [signature, count] of sourceMap.entries()) {
    if (targetMap.get(signature) !== count) return false
  }
  return true
}

function getWvPreferredCounterparty(parsedDocument) {
  const fornitore = (parsedDocument?.fornitore && typeof parsedDocument.fornitore === 'object')
    ? parsedDocument.fornitore
    : {}
  const cliente = (parsedDocument?.cliente && typeof parsedDocument.cliente === 'object')
    ? parsedDocument.cliente
    : {}
  const fScore = [fornitore.partitaIva, fornitore.codiceFiscale, fornitore.denominazione].filter(Boolean).length
  const cScore = [cliente.partitaIva, cliente.codiceFiscale, cliente.denominazione].filter(Boolean).length
  return fScore >= cScore ? fornitore : cliente
}

function counterpartyMatchesWv(cp, refPiva, refCf, refName) {
  if (refPiva) {
    const piva = normalizeWvCounterpartyId(cp.partitaIva)
    if (piva && piva === refPiva) return true
  }
  if (refCf) {
    const cf = normalizeWvCounterpartyId(cp.codiceFiscale)
    if (cf && cf === refCf) return true
  }
  if (refName) {
    const name = normalizeWvCounterpartyName(cp.denominazione)
    if (name && name === refName) return true
  }
  return false
}

export function WorkingViewApplyActionsPopover({
  activeWorkingViewModel,
  stagingRows,
  visibleRows,
  selectedRowIds,
  manualAccountByRowId,
  manualCausaleByRowId,
  manualRegistrationDateByRowId,
  formatManualAccount,
  formatManualCausale,
  formatMoney,
  causaliContabili,
  activeIvaDraftRows,
  currentAutomationMeta,
  onApply,
  onClose,
}) {
  const [scope, setScope] = useState('same_counterparty')
  const [checks, setChecks] = useState(DEFAULT_CHECKS)
  const [confirmAll, setConfirmAll] = useState(false)

  const currentRowKey = String(activeWorkingViewModel?.rowKey || '')
  const sourceAccount = activeWorkingViewModel?.costRevenueAccount || null
  const sourceCausale = activeWorkingViewModel?.causale || null
  const sourceRegistrationDate = String(
    manualRegistrationDateByRowId?.[currentRowKey]
    || activeWorkingViewModel?.registrationDate
    || activeWorkingViewModel?.dataDocumento
    || ''
  ).trim()
  const sourceIvaRows = useMemo(
    () => (Array.isArray(activeIvaDraftRows) ? activeIvaDraftRows.filter(Boolean) : []),
    [activeIvaDraftRows],
  )
  const sourceIvaMissingAssignments = sourceIvaRows.filter((row) => !String(row?.causaleIvaId || row?.causale_iva_id || '').trim()).length
  const sourceIvaAvailable = sourceIvaRows.length > 0 && sourceIvaMissingAssignments === 0
  const sourceIvaReason = !sourceIvaRows.length
    ? 'nessuna riga IVA disponibile nella fattura corrente'
    : sourceIvaMissingAssignments
      ? `mancano causali IVA collegate su ${sourceIvaMissingAssignments} rig${sourceIvaMissingAssignments === 1 ? 'a' : 'he'}`
      : ''

  const causaleOptions = Array.isArray(causaliContabili) ? causaliContabili : []
  const causaliByKey = useMemo(
    () => new Map(causaleOptions.map((item) => [normalizeWvCausaleKey(item), item])),
    [causaleOptions],
  )
  const resolveInitialCausaleKey = () => {
    const sourceKey = normalizeWvCausaleKey(sourceCausale)
    if (sourceKey && causaliByKey.has(sourceKey)) return sourceKey
    const sourceCode = String(sourceCausale?.codice || '').trim()
    const byCode = sourceCode
      ? causaleOptions.find((item) => String(item?.codice || '').trim() === sourceCode)
      : null
    return normalizeWvCausaleKey(byCode || sourceCausale)
  }

  const [dateDraft, setDateDraft] = useState(() => sourceRegistrationDate)
  const [causaleDraftKey, setCausaleDraftKey] = useState(() => resolveInitialCausaleKey())
  const currentAutomationLabels = getPopoverAutomationFieldLabels(currentAutomationMeta?.fields)

  useEffect(() => {
    setDateDraft(sourceRegistrationDate)
    setCausaleDraftKey(resolveInitialCausaleKey())
  }, [currentRowKey, sourceRegistrationDate, sourceCausale?.id, sourceCausale?.codice, causaliContabili])

  useEffect(() => {
    if (!sourceIvaAvailable && checks.iva) {
      setChecks((prev) => ({ ...prev, iva: false }))
    }
  }, [sourceIvaAvailable, checks.iva])

  const selectedCausale = causaliByKey.get(causaleDraftKey) || sourceCausale || null
  const currentCp = activeWorkingViewModel?.counterparty || {}
  const refPiva = normalizeWvCounterpartyId(currentCp.partitaIva)
  const refCf = normalizeWvCounterpartyId(currentCp.codiceFiscale)
  const refName = normalizeWvCounterpartyName(currentCp.denominazione)
  const allRows = Array.isArray(stagingRows) ? stagingRows : []

  const visibleRowKeySet = useMemo(
    () => new Set((Array.isArray(visibleRows) ? visibleRows : []).map(getWvRowKey)),
    [visibleRows],
  )

  const selectedRowKeySet = useMemo(() => {
    if (selectedRowIds instanceof Set) return selectedRowIds
    if (Array.isArray(selectedRowIds)) return new Set(selectedRowIds)
    return new Set()
  }, [selectedRowIds])

  const { targetCount, excludedLocked, excludedManual, excludedIvaIncompatible } = useMemo(() => {
    let nextTargetCount = 0
    let nextExcludedLocked = 0
    let nextExcludedManual = 0
    let nextExcludedIvaIncompatible = 0

    for (const row of allRows) {
      const key = getWvRowKey(row)
      if (key === currentRowKey) continue

      if (row.state === 'registered' || row.state === 'locked') {
        nextExcludedLocked += 1
        continue
      }

      let inScope = false
      if (scope === 'same_counterparty') {
        const cp = getWvPreferredCounterparty(row.parsedDocument || {})
        inScope = counterpartyMatchesWv(cp, refPiva, refCf, refName)
      } else if (scope === 'selected') {
        inScope = selectedRowKeySet.has(key)
      } else if (scope === 'visible') {
        inScope = visibleRowKeySet.has(key)
      } else if (scope === 'incomplete') {
        const hasAccount = Boolean(manualAccountByRowId?.[key])
        const hasCausale = Boolean(manualCausaleByRowId?.[key])
        inScope = !hasAccount || !hasCausale
      } else if (scope === 'all') {
        inScope = true
      }

      if (!inScope) continue

      const willSkipAccount = checks.account && sourceAccount && Boolean(manualAccountByRowId?.[key])
      const willSkipCausale = checks.causale && selectedCausale && Boolean(manualCausaleByRowId?.[key])
      if (willSkipAccount || willSkipCausale) {
        nextExcludedManual += 1
        continue
      }

      if (checks.iva && sourceIvaAvailable) {
        const targetIvaRows = Array.isArray(row?.parsedDocument?.ivaRows) ? row.parsedDocument.ivaRows : []
        if (!haveCompatibleWvIvaStructure(sourceIvaRows, targetIvaRows)) {
          nextExcludedIvaIncompatible += 1
          continue
        }
      }

      nextTargetCount += 1
    }

    return {
      targetCount: nextTargetCount,
      excludedLocked: nextExcludedLocked,
      excludedManual: nextExcludedManual,
      excludedIvaIncompatible: nextExcludedIvaIncompatible,
    }
  }, [
    allRows,
    currentRowKey,
    scope,
    refPiva,
    refCf,
    refName,
    selectedRowKeySet,
    visibleRowKeySet,
    manualAccountByRowId,
    manualCausaleByRowId,
    checks,
    sourceAccount,
    selectedCausale,
    sourceIvaAvailable,
    sourceIvaRows,
  ])

  const excludedTotal = excludedLocked + excludedManual + excludedIvaIncompatible
  const selectedFieldsCount = Number(Boolean(checks.account && sourceAccount))
    + Number(Boolean(checks.causale && selectedCausale))
    + Number(Boolean(checks.date && dateDraft))
    + Number(Boolean(checks.iva && sourceIvaAvailable))
  const canApply = targetCount > 0 && selectedFieldsCount > 0 && (scope !== 'all' || confirmAll)

  const toggleCheck = (field) => {
    setChecks((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  const handleApply = () => {
    if (!canApply) return
    onApply({
      scope,
      fields: { ...checks },
      values: {
        account: checks.account ? sourceAccount : null,
        causale: checks.causale ? selectedCausale : null,
        date: checks.date ? dateDraft : null,
        ivaRows: checks.iva ? sourceIvaRows : [],
      },
    })
  }

  const sectionLabelStyle = {
    fontSize: '.56rem',
    fontWeight: 800,
    color: 'rgba(188,204,226,.68)',
    textTransform: 'uppercase',
    letterSpacing: '.07em',
    padding: '.04rem 0 .02rem',
  }

  const valuePillStyle = {
    padding: '.1rem .14rem',
    borderRadius: 8,
    border: '1px solid rgba(124,157,202,.13)',
    background: 'rgba(255,255,255,.025)',
    display: 'grid',
    gap: '.04rem',
  }

  const radioRowStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '.16rem',
    padding: '.1rem .12rem',
    borderRadius: 8,
    cursor: 'pointer',
    userSelect: 'none',
    background: active ? 'rgba(84,141,212,.1)' : 'transparent',
    border: active ? '1px solid rgba(84,141,212,.2)' : '1px solid transparent',
  })

  const formatPopoverMoney = (value) => {
    if (typeof formatMoney === 'function') return formatMoney(value || 0)
    return String(value || 0)
  }

  return (
    <>
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 8999, background: 'rgba(4,10,18,.52)' }}
        onClick={onClose}
      />

      <div
        style={{
          position: 'fixed',
          top: '3.5rem',
          right: '1.2rem',
          zIndex: 9000,
          width: 440,
          maxHeight: 'calc(100vh - 5rem)',
          overflowY: 'auto',
          borderRadius: 18,
          border: '1px solid rgba(124,157,202,.22)',
          background: 'linear-gradient(180deg, rgba(14,36,58,.98), rgba(9,24,40,.99))',
          boxShadow: '0 20px 48px rgba(0,0,0,.44)',
          padding: '.28rem',
          display: 'grid',
          gap: '.16rem',
          scrollbarWidth: 'thin',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.12rem', padding: '.04rem .04rem .06rem' }}>
          <div>
            <div style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.68)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>
              Automazione batch
            </div>
            <div style={{ fontSize: '.88rem', fontWeight: 800, color: '#edf4ff', lineHeight: 1.1 }}>
              Applica scelte della fattura corrente
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 28, height: 28, minWidth: 28, borderRadius: 8, border: '1px solid rgba(124,157,202,.16)', background: 'rgba(255,255,255,.03)', color: 'rgba(188,204,226,.78)', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            x
          </button>
        </div>

        <div style={{ height: '1px', background: 'rgba(124,157,202,.12)' }} />

        {currentAutomationLabels.length ? (
          <div
            style={{
              display: 'grid',
              gap: '.04rem',
              padding: '.1rem .14rem',
              borderRadius: 10,
              border: '1px solid rgba(245,158,11,.34)',
              background: 'rgba(245,158,11,.12)',
            }}
          >
            <div style={{ fontSize: '.56rem', color: 'rgba(255,233,181,.9)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>
              Automazione applicata su questa fattura
            </div>
            <div style={{ fontSize: '.66rem', color: '#fff2cf', lineHeight: 1.28 }}>
              {currentAutomationLabels.join(', ')}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: '.08rem' }}>
          <div style={sectionLabelStyle}>Valori della fattura corrente</div>
          <div style={valuePillStyle}>
            <span style={{ fontSize: '.52rem', color: 'rgba(188,204,226,.62)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Conto costo / ricavo</span>
            <strong style={{ fontSize: '.7rem', color: sourceAccount ? '#dbeafe' : 'rgba(188,204,226,.46)' }}>
              {sourceAccount ? formatManualAccount(sourceAccount) : 'Non impostato'}
            </strong>
          </div>
          <div style={valuePillStyle}>
            <span style={{ fontSize: '.52rem', color: 'rgba(188,204,226,.62)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Causale contabile</span>
            {causaleOptions.length ? (
              <select
                value={causaleDraftKey}
                onChange={(event) => setCausaleDraftKey(event.target.value)}
                style={{ border: '1px solid rgba(124,157,202,.22)', borderRadius: 6, background: 'rgba(9,31,47,.8)', color: '#edf4ff', fontSize: '.7rem', padding: '.08rem .1rem', outline: 'none', marginTop: '.04rem' }}
              >
                <option value="">Seleziona causale contabile</option>
                {causaleOptions.map((causale) => {
                  const optionKey = normalizeWvCausaleKey(causale)
                  return (
                    <option key={optionKey} value={optionKey}>
                      {formatManualCausale(causale)}
                    </option>
                  )
                })}
              </select>
            ) : (
              <strong style={{ fontSize: '.7rem', color: sourceCausale ? '#dbeafe' : 'rgba(188,204,226,.46)' }}>
                {sourceCausale ? formatManualCausale(sourceCausale) : 'Non impostata'}
              </strong>
            )}
          </div>
          <div style={valuePillStyle}>
            <span style={{ fontSize: '.52rem', color: 'rgba(188,204,226,.62)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Data registrazione</span>
            <input
              type="date"
              value={dateDraft}
              onChange={(event) => setDateDraft(event.target.value)}
              style={{ border: '1px solid rgba(124,157,202,.22)', borderRadius: 6, background: 'rgba(9,31,47,.8)', color: '#edf4ff', fontSize: '.7rem', padding: '.06rem .1rem', outline: 'none', marginTop: '.04rem' }}
            />
            <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.52)' }}>
              Valore iniziale: {sourceRegistrationDate || 'non disponibile'}
            </span>
          </div>
          <div style={valuePillStyle}>
            <span style={{ fontSize: '.52rem', color: 'rgba(188,204,226,.62)', textTransform: 'uppercase', letterSpacing: '.04em' }}>IVA corrente</span>
            {sourceIvaRows.length ? (
              <div style={{ display: 'grid', gap: '.06rem', marginTop: '.02rem' }}>
                {sourceIvaRows.map((row, index) => (
                  <div key={row.id || `${getWvIvaSignature(row)}-${index}`} style={{ display: 'grid', gap: '.02rem', padding: '.08rem .1rem', borderRadius: 8, border: '1px solid rgba(124,157,202,.11)', background: 'rgba(255,255,255,.018)' }}>
                    <strong style={{ fontSize: '.66rem', color: '#dbeafe' }}>
                      {row?.natura ? row.natura : `${normalizeWvIvaRate(row?.aliquota)}%`} | Imponibile {formatPopoverMoney(row?.imponibile || 0)} | IVA {formatPopoverMoney(row?.imposta || row?.iva || 0)}
                    </strong>
                    <span style={{ fontSize: '.58rem', color: String(row?.causaleIvaId || row?.causale_iva_id || '').trim() ? '#bfe7cb' : '#ffca57' }}>
                      {row?.causaleIvaLabel || (String(row?.causaleIvaId || row?.causale_iva_id || '').trim() ? `Causale IVA ${row?.causaleIvaId || row?.causale_iva_id}` : 'Causale IVA mancante')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <strong style={{ fontSize: '.7rem', color: 'rgba(188,204,226,.46)' }}>Nessuna riga IVA disponibile</strong>
            )}
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(124,157,202,.1)' }} />

        <div style={{ display: 'grid', gap: '.04rem' }}>
          <div style={sectionLabelStyle}>Cosa applicare</div>
          {[
            { field: 'account', label: 'Conto costo / ricavo', available: Boolean(sourceAccount) },
            { field: 'causale', label: 'Causale contabile', available: Boolean(selectedCausale || sourceCausale || causaleOptions.length), note: causaleOptions.length ? '' : 'lista causali non disponibile' },
            { field: 'date', label: 'Data registrazione', available: true },
            { field: 'iva', label: 'Trattamento IVA', available: sourceIvaAvailable, note: sourceIvaAvailable ? 'propaga causali IVA e esigibilita su strutture compatibili' : sourceIvaReason },
            { field: 'note', label: 'Note operative', available: false, note: 'non disponibile in questa versione' },
          ].map(({ field, label, available, note }) => (
            <label
              key={field}
              style={{ display: 'flex', alignItems: 'center', gap: '.16rem', padding: '.08rem .1rem', borderRadius: 7, cursor: available ? 'pointer' : 'default', userSelect: 'none', opacity: available ? 1 : 0.4 }}
            >
              <input
                type="checkbox"
                checked={checks[field]}
                disabled={!available}
                onChange={() => available && toggleCheck(field)}
                style={{ accentColor: '#5b9ef8', cursor: available ? 'pointer' : 'default' }}
              />
              <span style={{ fontSize: '.7rem', color: '#d4e3f8' }}>{label}</span>
              {note ? (
                <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.48)', fontStyle: 'italic', marginLeft: '.04rem' }}>
                  - {note}
                </span>
              ) : null}
            </label>
          ))}
        </div>

        <div style={{ height: '1px', background: 'rgba(124,157,202,.1)' }} />

        <div style={{ display: 'grid', gap: '.04rem' }}>
          <div style={sectionLabelStyle}>Dove applicare</div>
          {SCOPE_OPTIONS.map(({ value, label, dangerous }) => (
            <label key={value} style={radioRowStyle(scope === value)}>
              <input
                type="radio"
                name="wv-apply-scope"
                value={value}
                checked={scope === value}
                onChange={() => {
                  setScope(value)
                  if (value !== 'all') setConfirmAll(false)
                }}
                style={{ accentColor: '#5b9ef8', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '.7rem', color: dangerous ? '#ffd0d6' : '#d4e3f8' }}>{label}</span>
              {dangerous ? (
                <span style={{ fontSize: '.58rem', color: '#ffb3bd', marginLeft: 'auto', fontWeight: 700 }}>! avanzata</span>
              ) : null}
            </label>
          ))}
          {scope === 'all' ? (
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '.14rem', padding: '.1rem .14rem', borderRadius: 8, border: '1px solid rgba(220,53,69,.28)', background: 'rgba(220,53,69,.08)', marginTop: '.04rem', cursor: 'pointer', userSelect: 'none' }}
            >
              <input
                type="checkbox"
                checked={confirmAll}
                onChange={() => setConfirmAll((value) => !value)}
                style={{ accentColor: '#f87171', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '.66rem', color: '#ffd0d6', fontWeight: 700 }}>
                Confermo: applicare a tutte le fatture non contabilizzate
              </span>
            </label>
          ) : null}
        </div>

        <div style={{ height: '1px', background: 'rgba(124,157,202,.1)' }} />

        <div style={{ display: 'grid', gap: '.06rem' }}>
          <div style={sectionLabelStyle}>Anteprima impatto</div>
          <div
            style={{
              padding: '.12rem .14rem',
              borderRadius: 10,
              border: `1px solid ${targetCount > 0 ? 'rgba(61,211,110,.22)' : 'rgba(124,157,202,.13)'}`,
              background: targetCount > 0 ? 'rgba(23,68,55,.3)' : 'rgba(255,255,255,.018)',
              display: 'grid',
              gap: '.04rem',
            }}
          >
            <div style={{ fontSize: '.7rem', color: targetCount > 0 ? '#c7f5d4' : 'rgba(188,204,226,.66)', fontWeight: 700 }}>
              {targetCount > 0
                ? `Saranno aggiornate ${targetCount} fattur${targetCount === 1 ? 'a' : 'e'}.`
                : 'Nessuna fattura aggiornabile con i criteri selezionati.'}
            </div>
            {excludedTotal > 0 ? (
              <div style={{ fontSize: '.62rem', color: 'rgba(188,204,226,.56)', lineHeight: 1.3 }}>
                Escluse {excludedTotal}
                {excludedLocked > 0 ? `: ${excludedLocked} gia contabilizzate` : ''}
                {excludedManual > 0 ? `${excludedLocked > 0 ? ', ' : ': '}${excludedManual} con modifiche manuali esistenti` : ''}
                {excludedIvaIncompatible > 0 ? `${excludedLocked > 0 || excludedManual > 0 ? ', ' : ': '}${excludedIvaIncompatible} per IVA non compatibile` : ''}.
              </div>
            ) : null}
          </div>
          {!sourceAccount && !selectedCausale ? (
            <div style={{ fontSize: '.62rem', color: '#ffca57', padding: '.06rem .08rem' }}>
              Attenzione: conto e causale non sono impostati sulla fattura corrente.
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: '.1rem', justifyContent: 'flex-end', paddingTop: '.04rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: 36, padding: '.1rem .68rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.16)', background: 'rgba(255,255,255,.03)', color: '#d4e3f8', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            style={{
              minHeight: 36,
              padding: '.1rem .84rem',
              borderRadius: 10,
              border: `1px solid ${canApply ? 'rgba(61,211,110,.36)' : 'rgba(124,157,202,.13)'}`,
              background: canApply
                ? 'linear-gradient(180deg, rgba(56,197,92,.92), rgba(44,171,75,.88))'
                : 'rgba(255,255,255,.03)',
              color: canApply ? '#f6fff8' : 'rgba(188,204,226,.38)',
              fontSize: '.72rem',
              fontWeight: 800,
              cursor: canApply ? 'pointer' : 'not-allowed',
            }}
          >
            Applica
          </button>
        </div>
      </div>
    </>
  )
}
