import { useEffect, useMemo, useRef, useState } from 'react'
import { WorkingViewApplyActionsPopover } from './WorkingViewApplyActionsPopover.jsx'
import { WorkingViewInvoicePreviewTabs } from './WorkingViewInvoicePreviewTabs.jsx'
import { WorkingViewPrimaNotaTable, buildWorkingViewPrimaNotaRows } from './WorkingViewPrimaNotaTable.jsx'
import {
  resolveImportWorkingViewCausaleIvaId,
  assessWorkingViewIvaDraftRows,
  mergeWorkingViewChecksWithIvaDraft,
  extractWorkingViewIvaSourceRows,
} from '../../domain/importContabilitaDemoCausaliIva.js'
import {
  assessWorkingViewPartitarioDraft,
  buildDemoWorkingViewCommitConfirmMessage,
  resolveDemoIvaCreditAccount,
} from '../../domain/importContabilitaDemoWorkingViewCommit.js'

let workingViewIvaDraftSequence = 0

function nextWorkingViewIvaDraftId() {
  workingViewIvaDraftSequence += 1
  return `working-view-iva-${workingViewIvaDraftSequence}`
}

function toDraftNumber(value) {
  if (value === '' || value == null) return ''
  const normalized = Number(String(value).replace(',', '.'))
  return Number.isFinite(normalized) ? normalized : ''
}

function parseWorkingViewPercent(value) {
  if (value == null || value === '') return null
  const match = String(value).trim().match(/(\d+(?:[.,]\d+)?)/)
  if (!match) return null
  const normalized = Number(match[1].replace(',', '.'))
  return Number.isFinite(normalized) ? normalized : null
}

function roundWorkingViewAmount(value) {
  return Math.round((Number(value || 0) || 0) * 100) / 100
}

function isWorkingViewDetraibileFalse(value) {
  if (value === false || value === 0) return true
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n' || normalized === 'off'
}

function normalizeWorkingViewCausaleIvaId(value) {
  return String(value || '').trim()
}

function getWorkingViewDetraibilePercentFromCausale(causale) {
  if (!causale) return null
  if (isWorkingViewDetraibileFalse(causale.detraibile)) return 0
  const detraibile = parseWorkingViewPercent(causale.percentualeDetraibilita)
  if (detraibile != null) return Math.max(0, Math.min(100, detraibile))
  const indetraibile = parseWorkingViewPercent(causale.percentualeIndetraibilita)
  if (indetraibile != null) return Math.max(0, Math.min(100, 100 - indetraibile))
  return 100
}

function getWorkingViewAliquotaFromCausale(causale) {
  const parsed = parseWorkingViewPercent(causale?.aliquota)
  return parsed == null ? null : parsed
}

function getWorkingViewCausaleIvaOptionLabel(causale) {
  if (!causale) return ''
  const aliquota = parseWorkingViewPercent(causale.aliquota)
  const parts = [
    causale.codiceInterno || '',
    causale.codice || '',
    causale.descrizione || '',
    aliquota != null ? `${aliquota}%` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

function getWorkingViewNumericSearchTokens(value, { percent = false } = {}) {
  const raw = String(value ?? '').trim()
  if (!raw) return []

  const tokens = new Set([
    raw,
    raw.replace('.', ','),
    raw.replace(',', '.'),
  ])

  const numericValue = Number(raw.replace(',', '.'))
  if (Number.isFinite(numericValue)) {
    const normalizedValues = [numericValue]
    if (percent && numericValue > 0 && numericValue <= 1) {
      normalizedValues.push(numericValue * 100)
    }

    normalizedValues.forEach((item) => {
      const rounded = Math.round(item * 100) / 100
      tokens.add(String(rounded))
      tokens.add(rounded.toFixed(2))
      tokens.add(rounded.toFixed(2).replace('.', ','))
      tokens.add(String(Math.round(rounded)))
    })
  }

  return Array.from(tokens)
}

function getWorkingViewAutomationFieldLabels(fields = []) {
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

function normalizeWorkingViewCausaleIvaSearchValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[%.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseWorkingViewCausaleIvaSearchNumber(value) {
  const raw = String(value || '').trim()
  if (!raw || !/^\d+(?:[.,]\d+)?$/.test(raw)) return null
  const numericValue = Number(raw.replace(',', '.'))
  return Number.isFinite(numericValue) ? numericValue : null
}

function getWorkingViewCausaleIvaSortLabel(causale) {
  return String(causale?.codiceInterno || causale?.codice || causale?.descrizione || '').toLowerCase()
}

function getWorkingViewCausaleIvaSearchText(causale) {
  if (!causale) return ''
  const rawText = [
    causale.codiceInterno || '',
    causale.codice || '',
    causale.descrizione || '',
    causale.note || '',
    ...getWorkingViewNumericSearchTokens(causale.aliquota, { percent: true }),
    ...getWorkingViewNumericSearchTokens(causale.percentualeDetraibilita, { percent: true }),
    ...getWorkingViewNumericSearchTokens(causale.percentualeIndetraibilita, { percent: true }),
  ].join(' ')
  const normalizedText = normalizeWorkingViewCausaleIvaSearchValue(rawText)
  return `${rawText.toLowerCase()} ${normalizedText}`.trim()
}

function getWorkingViewCausaleIvaNumericSearchRank(causale, queryNumber) {
  const aliquota = getWorkingViewAliquotaFromCausale(causale)
  if (aliquota == null) {
    return {
      distance: Number.POSITIVE_INFINITY,
      aliquota: Number.POSITIVE_INFINITY,
      label: getWorkingViewCausaleIvaSortLabel(causale),
    }
  }

  return {
    distance: Math.abs(aliquota - queryNumber),
    aliquota,
    label: getWorkingViewCausaleIvaSortLabel(causale),
  }
}

function recalculateWorkingViewIvaDraftRow(row, causaliIvaById) {
  const causaleIvaId = normalizeWorkingViewCausaleIvaId(row?.causaleIvaId || row?.causale_iva_id)
  const causale = causaliIvaById.get(causaleIvaId) || null
  const aliquotaFromCausale = getWorkingViewAliquotaFromCausale(causale)
  const aliquota = aliquotaFromCausale != null ? aliquotaFromCausale : Number(toDraftNumber(row?.aliquota ?? 0) || 0) || 0
  const imponibile = Number(toDraftNumber(row?.imponibile ?? 0) || 0) || 0
  const imposta = roundWorkingViewAmount((imponibile * aliquota) / 100)
  const detraibilePercent = causale ? getWorkingViewDetraibilePercentFromCausale(causale) : (aliquota === 0 ? 0 : 100)
  const indetraibilePercent = Math.max(0, Math.min(100, 100 - detraibilePercent))
  const detraibileImposta = roundWorkingViewAmount((imposta * detraibilePercent) / 100)
  const indetraibileImposta = roundWorkingViewAmount(imposta - detraibileImposta)

  return {
    ...row,
    causaleIvaId,
    causaleIvaLabel: getWorkingViewCausaleIvaOptionLabel(causale),
    aliquota,
    imponibile,
    imposta,
    detraibilePercent,
    indetraibilePercent,
    detraibileImposta,
    indetraibileImposta,
  }
}

function getWorkingViewCounterpartyCausaleIvaId(counterpartyAccount) {
  return normalizeWorkingViewCausaleIvaId(
    counterpartyAccount?.causaleIvaId || counterpartyAccount?.causale_iva_id || ''
  )
}

function createWorkingViewIvaDraftRow(source = {}, causaliIvaById = new Map(), options = {}) {
  const defaultCausaleIvaId = normalizeWorkingViewCausaleIvaId(
    options?.resolveDefaultCausaleIvaId ? options.resolveDefaultCausaleIvaId(source) : ''
  )
  const baseRow = {
    id: nextWorkingViewIvaDraftId(),
    aliquota: toDraftNumber(source?.aliquota ?? 0),
    imponibile: toDraftNumber(source?.imponibile ?? 0),
    imposta: toDraftNumber(source?.imposta ?? source?.iva ?? 0),
    esigibilita: String(source?.esigibilita || source?.esigibilitaIVA || 'Immediata').trim() || 'Immediata',
    causaleIvaId: normalizeWorkingViewCausaleIvaId(source?.causaleIvaId || source?.causale_iva_id || defaultCausaleIvaId),
  }

  return recalculateWorkingViewIvaDraftRow(baseRow, causaliIvaById)
}

function buildWorkingViewIvaDraftRows(ivaRows = [], causaliIvaById = new Map(), options = {}) {
  if (Array.isArray(ivaRows) && ivaRows.length) {
    return ivaRows.map((item) => createWorkingViewIvaDraftRow(item, causaliIvaById, options))
  }
  return [createWorkingViewIvaDraftRow({}, causaliIvaById, options)]
}

function formatWorkingViewIvaRate(value) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized)) return '0%'
  return `${normalized.toFixed(2).replace('.', ',')}%`
}

function formatWorkingViewIvaEditableNumber(value) {
  if (value === '' || value == null) return ''
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) return String(value).replace('.', ',')
  return normalized.toFixed(2).replace('.', ',')
}

function getWorkingViewIvaBadgeTone(row) {
  if (row?.natura) {
    if (String(row.natura).toUpperCase().startsWith('N3')) {
      return {
        border: '1px solid rgba(156,102,255,.3)',
        background: 'rgba(156,102,255,.12)',
        color: '#e2c8ff',
      }
    }
    return {
      border: '1px solid rgba(242,190,66,.28)',
      background: 'rgba(242,190,66,.12)',
      color: '#ffe59f',
    }
  }

  const aliquota = Number(row?.aliquota || 0) || 0
  if (aliquota === 0) {
    return {
      border: '1px solid rgba(56,197,92,.26)',
      background: 'rgba(56,197,92,.12)',
      color: '#d7f8df',
    }
  }

  if (aliquota >= 20) {
    return {
      border: '1px solid rgba(82,207,122,.24)',
      background: 'rgba(82,207,122,.12)',
      color: '#cff7da',
    }
  }

  return {
    border: '1px solid rgba(122,184,255,.22)',
    background: 'rgba(122,184,255,.11)',
    color: '#d8ebff',
  }
}

export function ImportContabilitaWorkingView({
  activeWorkingViewModel,
  activeWorkingViewChecks,
  workingViewTab,
  setWorkingViewTab,
  closeWorkingView,
  onGoToPreviousWorkingViewRow,
  onGoToNextWorkingViewRow,
  hasPreviousWorkingViewRow,
  hasNextWorkingViewRow,
  workingViewCurrentIndex,
  workingViewTotal,
  workingTableReadyCount,
  workingTableIncompleteCount,
  selectedCount,
  onStartAccounting,
  ActionButton,
  MessageBox,
  MetaPill,
  BadgePlaceholder,
  PANEL_STYLE,
  formatMoney,
  formatCount,
  pianoConti,
  formatManualAccount,
  formatManualCausale,
  causaliContabili,
  causaliIva,
  isDemoSocieta = false,
  onCommitDemoWorkingView,
  commitBusy = false,
  isCommittingDemoDocument = false,
  demoCommitReport = null,
  getCounterpartyDisplayInfo,
  onPlaceholderAction,
  stagingRows,
  visibleRows,
  selectedRowIds,
  manualAccountByRowId,
  manualCausaleByRowId,
  manualRegistrationDateByRowId,
  onApplyToBatch,
}) {
  const [applyPopoverOpen, setApplyPopoverOpen] = useState(false)
  const [previewTab, setPreviewTab] = useState('fattura_fiscosim')
  const causaliIvaById = new Map((Array.isArray(causaliIva) ? causaliIva : []).map((item) => [String(item?.id || '').trim(), item]))
  const resolveDefaultWorkingViewCausaleIvaId = (sourceRow = {}) => resolveImportWorkingViewCausaleIvaId({
    source: sourceRow,
    counterpartyAccount: activeWorkingViewModel?.counterpartyAccount || null,
    causaliIva,
    isDemoSocieta,
  })
  const [ivaDraftRows, setIvaDraftRows] = useState(() => buildWorkingViewIvaDraftRows(
    extractWorkingViewIvaSourceRows(activeWorkingViewModel?.parsedDocument),
    causaliIvaById,
    { resolveDefaultCausaleIvaId: resolveDefaultWorkingViewCausaleIvaId }
  ))
  const ivaCreditAccount = useMemo(() => resolveDemoIvaCreditAccount(pianoConti), [pianoConti])
  const [pnDraftRows, setPnDraftRows] = useState(() => {
    if (!activeWorkingViewModel) return []
    const baseRows = buildWorkingViewPrimaNotaRows(activeWorkingViewModel, ivaCreditAccount)
    if (baseRows[2]) {
      baseRows[2].note = `Causale: ${formatManualCausale(activeWorkingViewModel?.causale)}`
    }
    return baseRows
  })

  useEffect(() => {
    if (!activeWorkingViewModel) {
      setPnDraftRows([])
      return
    }
    const baseRows = buildWorkingViewPrimaNotaRows(activeWorkingViewModel, ivaCreditAccount)
    if (baseRows[2]) {
      baseRows[2].note = `Causale: ${formatManualCausale(activeWorkingViewModel?.causale)}`
    }
    setPnDraftRows(baseRows)
  }, [activeWorkingViewModel?.rowKey, activeWorkingViewModel?.causale, formatManualCausale, ivaCreditAccount])

  const [selectedIvaDraftRowId, setSelectedIvaDraftRowId] = useState(null)
  const [ivaCausalePickerRowId, setIvaCausalePickerRowId] = useState('')
  const [ivaCausaleSearchTerm, setIvaCausaleSearchTerm] = useState('')
  const ivaCausaleSearchInputRef = useRef(null)
  const ivaDraftChecks = useMemo(
    () => assessWorkingViewIvaDraftRows(ivaDraftRows),
    [ivaDraftRows],
  )
  const partitarioDraftChecks = useMemo(
    () => assessWorkingViewPartitarioDraft(activeWorkingViewModel),
    [activeWorkingViewModel],
  )
  const mergedWorkingViewChecks = useMemo(
    () => mergeWorkingViewChecksWithIvaDraft(
      mergeWorkingViewChecksWithIvaDraft(activeWorkingViewChecks, ivaDraftChecks),
      partitarioDraftChecks,
    ),
    [activeWorkingViewChecks, ivaDraftChecks, partitarioDraftChecks],
  )
  const workingStatusLabel = mergedWorkingViewChecks.status === 'blocked'
    ? 'Contabilizzazione bloccata'
    : mergedWorkingViewChecks.status === 'warning'
      ? 'Bozza da verificare'
      : 'Bozza coerente'
  const workingStatusTone = mergedWorkingViewChecks.status === 'blocked'
    ? {
      border: '1px solid rgba(220,53,69,.34)',
      background: 'rgba(95,27,38,.34)',
      color: '#ffd7dd',
    }
    : mergedWorkingViewChecks.status === 'warning'
      ? {
        border: '1px solid rgba(255,193,7,.3)',
        background: 'rgba(92,64,9,.24)',
        color: '#ffe9a8',
      }
      : {
        border: '1px solid rgba(25,135,84,.32)',
        background: 'rgba(18,76,56,.26)',
        color: '#c8f3df',
      }
  const readinessLabel = activeWorkingViewModel.readiness?.label || 'Incompleta'
  const topIssueLabel = mergedWorkingViewChecks.status === 'blocked'
    ? mergedWorkingViewChecks.blockingIssues?.[0]
    : mergedWorkingViewChecks.status === 'warning'
      ? mergedWorkingViewChecks.warnings?.[0]
      : ''
  const workingDocumentMeta = [
    activeWorkingViewModel.originType || null,
    activeWorkingViewModel.numeroDocumento ? `N. ${activeWorkingViewModel.numeroDocumento}` : null,
    activeWorkingViewModel.dataDocumento ? `Data ${activeWorkingViewModel.dataDocumento}` : null,
  ].filter(Boolean).join(' · ')
  const operationalSuggestion = mergedWorkingViewChecks.status === 'blocked'
    ? topIssueLabel || 'Verifica la quadratura della prima nota rispetto al totale documento.'
    : mergedWorkingViewChecks.status === 'warning'
      ? topIssueLabel || 'Verifica i campi mancanti prima della contabilizzazione.'
      : 'Scrittura coerente: puoi procedere con la contabilizzazione o salvare la bozza locale.'
  const currentAutomationMeta = activeWorkingViewModel?.automationMeta || null
  const currentAutomationLabels = getWorkingViewAutomationFieldLabels(currentAutomationMeta?.fields)
  const hasCurrentAutomationMeta = currentAutomationLabels.length > 0
  const ivaDraftTotals = ivaDraftRows.reduce((accumulator, row) => {
    accumulator.imponibile += Number(row?.imponibile || 0) || 0
    accumulator.imposta += Number(row?.imposta || 0) || 0
    return accumulator
  }, { imponibile: 0, imposta: 0 })
  const ivaDraftDocumentTotal = ivaDraftTotals.imponibile + ivaDraftTotals.imposta
  const workingTabButtonStyle = {
    minHeight: 36,
    padding: '.12rem .18rem',
    borderRadius: 8,
    border: '1px solid rgba(124,157,202,.16)',
    background: 'linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.022))',
    color: '#edf3ff',
    fontSize: '.72rem',
    fontWeight: 700,
  }
  const workingTabDangerButtonStyle = {
    ...workingTabButtonStyle,
    border: '1px solid rgba(220,53,69,.22)',
    background: 'linear-gradient(180deg, rgba(220,53,69,.16), rgba(220,53,69,.08))',
    color: '#ffd8dd',
  }
  const ivaCellInputStyle = {
    width: '100%',
    minHeight: 34,
    borderRadius: 8,
    border: '1px solid rgba(124,157,202,.14)',
    background: 'rgba(9,31,47,.62)',
    color: '#e6eeff',
    fontSize: '.7rem',
    padding: '.08rem .12rem',
  }
  const workingTabSecondaryButtonStyle = {
    ...workingTabButtonStyle,
    minHeight: 34,
    padding: '.1rem .16rem',
    borderRadius: 10,
    background: 'rgba(255,255,255,.03)',
    color: '#dce7f8',
    fontSize: '.68rem',
  }
  const ivaCompactInputStyle = {
    ...ivaCellInputStyle,
    minHeight: 32,
    borderRadius: 10,
    border: '1px solid rgba(124,157,202,.12)',
    background: 'rgba(11,33,51,.72)',
    fontSize: '.68rem',
    padding: '.06rem .1rem',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.02)',
  }
  const ivaDisplayNumberInputStyle = {
    width: '100%',
    minHeight: 30,
    border: 'none',
    background: 'transparent',
    color: '#f3f8ff',
    fontSize: '.94rem',
    fontWeight: 700,
    padding: 0,
    outline: 'none',
  }
  const ivaCompactSelectStyle = {
    ...ivaCompactInputStyle,
    minHeight: 34,
    borderRadius: 8,
    background: 'rgba(13,35,54,.88)',
    fontSize: '.66rem',
    color: '#edf4ff',
  }
  const ivaCompactNoteStyle = {
    ...ivaCompactInputStyle,
    minHeight: 34,
    borderRadius: 8,
    background: 'rgba(13,35,54,.78)',
    fontSize: '.66rem',
  }
  const ivaAmountInputStyle = {
    ...ivaCompactInputStyle,
    minHeight: 36,
    borderRadius: 12,
    fontSize: '.8rem',
    fontWeight: 800,
    color: '#f3f8ff',
    padding: '.08rem .12rem',
  }
  const ivaAmountValueStyle = {
    fontSize: '.82rem',
    fontWeight: 800,
    color: '#f3f8ff',
    lineHeight: 1.15,
  }
  const ivaAmountMetaStyle = {
    fontSize: '.58rem',
    color: 'rgba(188,204,226,.72)',
    lineHeight: 1.15,
  }
  const ivaPickerButtonStyle = {
    width: '100%',
    minHeight: 36,
    borderRadius: 12,
    border: '1px solid rgba(124,157,202,.12)',
    background: 'rgba(11,33,51,.72)',
    color: '#edf4ff',
    fontSize: '.68rem',
    padding: '.08rem .12rem',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '.08rem',
    alignItems: 'center',
    textAlign: 'left',
  }
  const ivaPickerDropdownStyle = {
    borderRadius: 12,
    border: '1px solid rgba(124,157,202,.18)',
    background: 'linear-gradient(180deg, rgba(14,35,54,.98), rgba(10,26,42,.98))',
    boxShadow: '0 14px 32px rgba(0,0,0,.34)',
    padding: '.1rem',
    display: 'grid',
    gap: '.08rem',
  }
  const ivaIconButtonStyle = {
    width: 32,
    minWidth: 32,
    height: 32,
    borderRadius: 10,
    border: '1px solid rgba(220,53,69,.2)',
    background: 'rgba(220,53,69,.08)',
    color: '#ffd6dc',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '.82rem',
    fontWeight: 800,
  }
  const ivaSummaryCardStyle = {
    border: '1px solid rgba(124,157,202,.12)',
    borderRadius: 12,
    padding: '.14rem .16rem',
    background: 'linear-gradient(180deg, rgba(13,40,61,.54), rgba(10,30,46,.5))',
    display: 'grid',
    gridTemplateColumns: '32px minmax(0, 1fr)',
    gap: '.1rem .12rem',
    alignItems: 'center',
  }
  const ivaSummaryIconStyle = {
    width: 28,
    height: 28,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '.7rem',
    fontWeight: 800,
  }

  useEffect(() => {
    setIvaDraftRows(buildWorkingViewIvaDraftRows(
      extractWorkingViewIvaSourceRows(activeWorkingViewModel?.parsedDocument),
      causaliIvaById,
      { resolveDefaultCausaleIvaId: resolveDefaultWorkingViewCausaleIvaId }
    ))
    setSelectedIvaDraftRowId(null)
    setIvaCausalePickerRowId('')
    setIvaCausaleSearchTerm('')
  }, [activeWorkingViewModel?.rowKey, activeWorkingViewModel?.counterpartyAccount?.id, activeWorkingViewModel?.counterpartyAccount?.causaleIvaId, causaliIva, isDemoSocieta])

  useEffect(() => {
    if (!ivaDraftRows.length) {
      setSelectedIvaDraftRowId(null)
      setIvaCausalePickerRowId('')
      return
    }
    if (!selectedIvaDraftRowId || !ivaDraftRows.some((row) => row.id === selectedIvaDraftRowId)) {
      setSelectedIvaDraftRowId(ivaDraftRows[0].id)
    }
    if (ivaCausalePickerRowId && !ivaDraftRows.some((row) => row.id === ivaCausalePickerRowId)) {
      setIvaCausalePickerRowId('')
      setIvaCausaleSearchTerm('')
    }
  }, [ivaDraftRows, selectedIvaDraftRowId, ivaCausalePickerRowId])

  useEffect(() => {
    if (!ivaCausalePickerRowId) return
    ivaCausaleSearchInputRef.current?.focus?.()
    ivaCausaleSearchInputRef.current?.select?.()
  }, [ivaCausalePickerRowId])

  const filteredCausaliIva = (() => {
    const rows = Array.isArray(causaliIva) ? [...causaliIva] : []
    const rawQuery = String(ivaCausaleSearchTerm || '').trim()
    const query = normalizeWorkingViewCausaleIvaSearchValue(rawQuery)
    if (!query) return rows

    const numericQuery = parseWorkingViewCausaleIvaSearchNumber(rawQuery)
    if (numericQuery != null) {
      return rows.sort((left, right) => {
        const leftRank = getWorkingViewCausaleIvaNumericSearchRank(left, numericQuery)
        const rightRank = getWorkingViewCausaleIvaNumericSearchRank(right, numericQuery)
        if (leftRank.distance !== rightRank.distance) return leftRank.distance - rightRank.distance
        if (leftRank.aliquota !== rightRank.aliquota) return leftRank.aliquota - rightRank.aliquota
        return leftRank.label.localeCompare(rightRank.label, 'it')
      })
    }

    return rows.filter((causale) => getWorkingViewCausaleIvaSearchText(causale).includes(query))
  })()

  const updateIvaDraftRow = (rowId, field, value) => {
    setIvaDraftRows((currentRows) => currentRows.map((row) => {
      if (row.id !== rowId) return row
      return recalculateWorkingViewIvaDraftRow({
        ...row,
        [field]: field === 'imponibile'
          ? toDraftNumber(value)
          : value,
      }, causaliIvaById)
    }))
  }

  const addIvaDraftRow = () => {
    const nextRow = createWorkingViewIvaDraftRow({}, causaliIvaById, { resolveDefaultCausaleIvaId: resolveDefaultWorkingViewCausaleIvaId })
    setIvaDraftRows((currentRows) => [...currentRows, nextRow])
    setSelectedIvaDraftRowId(nextRow.id)
  }

  const removeIvaDraftRow = (rowId) => {
    setIvaDraftRows((currentRows) => {
      if (currentRows.length <= 1) return currentRows
      const nextRows = currentRows.filter((row) => row.id !== rowId)
      if (selectedIvaDraftRowId === rowId) {
        setSelectedIvaDraftRowId(nextRows[0]?.id || null)
      }
      return nextRows
    })
  }

  const duplicateSelectedIvaDraftRow = () => {
    if (!selectedIvaDraftRowId) return
    setIvaDraftRows((currentRows) => {
      const rowIndex = currentRows.findIndex((row) => row.id === selectedIvaDraftRowId)
      if (rowIndex === -1) return currentRows
      const duplicatedRow = createWorkingViewIvaDraftRow(currentRows[rowIndex], causaliIvaById, { resolveDefaultCausaleIvaId: resolveDefaultWorkingViewCausaleIvaId })
      const nextRows = [...currentRows]
      nextRows.splice(rowIndex + 1, 0, duplicatedRow)
      setSelectedIvaDraftRowId(duplicatedRow.id)
      return nextRows
    })
  }

  const removeSelectedIvaDraftRow = () => {
    if (!selectedIvaDraftRowId) return
    removeIvaDraftRow(selectedIvaDraftRowId)
  }
  const headerNavButtonStyle = {
    minHeight: 36,
    padding: '.14rem .7rem',
    borderRadius: 12,
    border: '1px solid rgba(124,157,202,.16)',
    background: 'linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.025))',
    color: '#e6eeff',
    fontSize: '.76rem',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '.34rem',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.03)',
  }
  const headerPrimaryButtonStyle = {
    minHeight: 36,
    padding: '.14rem .58rem',
    borderRadius: 12,
    border: '1px solid rgba(84,141,212,.34)',
    background: 'linear-gradient(180deg, rgba(84,141,212,.26), rgba(84,141,212,.14))',
    color: '#f5f9ff',
    fontSize: '.76rem',
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
  }
  const headerDisabledButtonStyle = {
    ...headerNavButtonStyle,
    opacity: 0.45,
    cursor: 'not-allowed',
  }
  const headerMetricCardStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '.34rem',
    minHeight: 32,
    padding: '.1rem .14rem',
    borderRadius: 8,
    border: '1px solid rgba(124,157,202,.14)',
    background: 'linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.018))',
  }
  const headerSuccessActionStyle = {
    minHeight: 36,
    padding: '.14rem .84rem',
    borderRadius: 8,
    border: '1px solid rgba(61,211,110,.34)',
    background: 'linear-gradient(180deg, rgba(56,197,92,.94), rgba(44,171,75,.92))',
    color: '#f6fff8',
    fontSize: '.74rem',
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '.42rem',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14)',
  }
  const headerGhostActionStyle = {
    minHeight: 36,
    padding: '.14rem .8rem',
    borderRadius: 8,
    border: '1px solid rgba(124,157,202,.16)',
    background: 'linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.022))',
    color: '#edf3ff',
    fontSize: '.74rem',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '.42rem',
  }

  return (
    <div style={{ padding: '.24rem .42rem .46rem', maxWidth: 1480, margin: '0 auto', display: 'grid', gap: '.16rem' }}>
      <header
        style={{
          ...PANEL_STYLE,
          borderRadius: 18,
          padding: '.18rem .24rem .2rem',
          display: 'grid',
          gap: '.16rem',
          background: 'radial-gradient(circle at top left, rgba(24,53,84,.42), transparent 38%), linear-gradient(180deg, rgba(13,34,54,.94), rgba(9,24,39,.96))',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.16rem', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '.06rem', minWidth: 0 }}>
            <div style={{ fontSize: '.58rem', color: 'rgba(188,204,226,.78)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>
              Document Hub
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '.42rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.24rem', lineHeight: 1.02 }}>Import Contabilità</h1>
            </div>
            <div style={{ color: 'rgba(203,216,234,.82)', fontSize: '.7rem', lineHeight: 1.24 }}>
              Flussi documentali, raccolta input e lavorazione operativa.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.34rem',
                padding: '.14rem .24rem',
                borderRadius: 999,
                border: '1px solid rgba(124,157,202,.18)',
                background: 'rgba(255,255,255,.045)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.03)',
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 999, background: '#35c759', boxShadow: '0 0 0 3px rgba(53,199,89,.12)' }} />
              <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#e8f1ff' }}>Working view attiva</span>
            </div>
          </div>
        </div>

      </header>

      <section
        style={{
          ...PANEL_STYLE,
          borderRadius: 16,
          padding: '.24rem',
          display: 'grid',
          gap: '.22rem',
          background: 'linear-gradient(180deg, rgba(10,28,43,.88), rgba(8,22,35,.92))',
          minHeight: 'calc(100vh - 180px)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, .66fr) minmax(680px, 1fr)', gap: '.22rem', alignItems: 'stretch', minHeight: 0 }}>
          <section style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: '.14rem', alignContent: 'stretch', minHeight: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.12rem', padding: '.12rem', borderRadius: 14, border: '1px solid rgba(124,157,202,.14)', background: 'linear-gradient(180deg, rgba(16,39,61,.76), rgba(11,30,48,.82))' }}>
              <button
                type="button"
                onClick={hasPreviousWorkingViewRow ? onGoToPreviousWorkingViewRow : undefined}
                disabled={!hasPreviousWorkingViewRow}
                style={hasPreviousWorkingViewRow ? headerNavButtonStyle : headerDisabledButtonStyle}
              >
                ← Prec.
              </button>
              <button
                type="button"
                onClick={hasNextWorkingViewRow ? onGoToNextWorkingViewRow : undefined}
                disabled={!hasNextWorkingViewRow}
                style={hasNextWorkingViewRow ? headerNavButtonStyle : headerDisabledButtonStyle}
              >
                Succ. →
              </button>
              <div style={{ padding: '.14rem .18rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.03)', fontSize: '.76rem', fontWeight: 700, color: '#e6eeff', minWidth: 82, textAlign: 'center' }}>
                {Math.max(workingViewCurrentIndex, 0) + 1} / {workingViewTotal || 1}
              </div>
              <button type="button" onClick={closeWorkingView} style={headerPrimaryButtonStyle}>
                Torna all'elenco
              </button>
            </div>

            <WorkingViewInvoicePreviewTabs
              activeWorkingViewModel={activeWorkingViewModel}
              previewTab={previewTab}
              setPreviewTab={setPreviewTab}
              ActionButton={ActionButton}
              MessageBox={MessageBox}
              formatMoney={formatMoney}
              getCounterpartyDisplayInfo={getCounterpartyDisplayInfo}
              onPlaceholderAction={onPlaceholderAction}
            />
          </section>

          <section style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: '.12rem', alignContent: 'stretch', minHeight: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.1rem', alignItems: 'center', justifyContent: 'space-between', padding: '.12rem', borderRadius: 14, border: '1px solid rgba(124,157,202,.14)', background: 'linear-gradient(180deg, rgba(16,39,61,.76), rgba(11,30,48,.82))' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.1rem', alignItems: 'center' }}>
                <div style={{ ...headerMetricCardStyle, color: '#79e595' }}>
                  <span style={{ fontSize: '.66rem', fontWeight: 700 }}>Pronte</span>
                  <span style={{ fontSize: '.88rem', fontWeight: 800 }}>{formatCount(workingTableReadyCount)}</span>
                </div>
                <div style={{ ...headerMetricCardStyle, color: '#ffca57' }}>
                  <span style={{ fontSize: '.66rem', fontWeight: 700 }}>Incompiute</span>
                  <span style={{ fontSize: '.88rem', fontWeight: 800 }}>{formatCount(workingTableIncompleteCount)}</span>
                </div>
                <div style={{ ...headerMetricCardStyle, color: '#7ab8ff' }}>
                  <span style={{ fontSize: '.66rem', fontWeight: 700 }}>Selezionate</span>
                  <span style={{ fontSize: '.88rem', fontWeight: 800 }}>{formatCount(selectedCount)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.1rem' }}>
                <button
                  type="button"
                  onClick={() => setApplyPopoverOpen(true)}
                  title={hasCurrentAutomationMeta ? `Automazione applicata: ${currentAutomationLabels.join(', ')}` : 'Apri automazione batch'}
                  style={{
                    minHeight: 36,
                    padding: '.12rem .62rem',
                    borderRadius: 8,
                    border: hasCurrentAutomationMeta ? '1px solid rgba(245,158,11,.48)' : '1px solid rgba(124,157,202,.22)',
                    background: hasCurrentAutomationMeta
                      ? 'linear-gradient(180deg, rgba(245,158,11,.32), rgba(194,120,9,.22))'
                      : 'linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.028))',
                    color: hasCurrentAutomationMeta ? '#fff2cf' : '#d4e3f8',
                    fontSize: '.72rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.3rem',
                  }}
                >
                  <span style={{ fontSize: '.68rem' }}>⬡</span>
                  <span>Applica a...</span>
                </button>
                <button
                  type="button"
                  disabled={!isDemoSocieta || commitBusy || isCommittingDemoDocument || mergedWorkingViewChecks.status !== 'ok'}
                  title={isDemoSocieta
                    ? (mergedWorkingViewChecks.status === 'ok'
                      ? 'Contabilizza in DB solo questo documento demo (24E)'
                      : 'Completa PN, IVA e partitario prima del commit')
                    : 'Commit demo disponibile solo su società Test Lab'}
                  onClick={() => {
                    if (!isDemoSocieta || typeof onCommitDemoWorkingView !== 'function') return
                    const message = buildDemoWorkingViewCommitConfirmMessage(activeWorkingViewModel, ivaDraftRows)
                    if (!window.confirm(message)) return
                    onCommitDemoWorkingView({ ivaDraftRows, pnDraftRows })
                  }}
                  style={{
                    ...headerSuccessActionStyle,
                    opacity: (!isDemoSocieta || commitBusy || isCommittingDemoDocument || mergedWorkingViewChecks.status !== 'ok') ? 0.45 : 1,
                    cursor: (!isDemoSocieta || commitBusy || isCommittingDemoDocument || mergedWorkingViewChecks.status !== 'ok') ? 'not-allowed' : 'pointer',
                  }}
                >
                  ⟲
                  <span>{(commitBusy || isCommittingDemoDocument) ? 'Contabilizzazione demo in corso...' : 'Contabilizza documento demo'}</span>
                </button>
                <button type="button" onClick={() => onPlaceholderAction('Salva bozza')} style={headerGhostActionStyle}>
                  <span>◫</span>
                  <span>Salva bozza</span>
                </button>
              </div>
            </div>

            <section style={{ display: 'grid', gridTemplateRows: 'auto auto auto auto auto auto auto', gap: '.14rem', border: '1px solid rgba(124,157,202,.14)', borderRadius: 14, padding: '.18rem', background: 'rgba(255,255,255,.018)', minHeight: '100%' }}>
            <div style={{ display: 'grid', gap: '.04rem' }}>
              <strong style={{ fontSize: '.94rem', color: '#e6eeff' }}>Fattura in lavorazione</strong>
              <div style={{ fontSize: '.92rem', color: '#dbe7fb', fontWeight: 800, lineHeight: 1.22 }}>
                {activeWorkingViewModel.filename || activeWorkingViewModel.fornitoreCliente || 'Documento in lavorazione'}
              </div>
              <div style={{ fontSize: '.68rem', color: 'var(--mu)', lineHeight: 1.26 }}>
                {workingDocumentMeta || 'Metadati documento non disponibili.'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '.2rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.28rem', padding: '.12rem .18rem', borderRadius: 999, ...workingStatusTone }}>
                <span style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>{workingStatusLabel}</span>
              </div>
            </div>

            {demoCommitReport?.text ? (
              <div style={{
                padding: '.18rem .22rem',
                borderRadius: 12,
                border: `1px solid ${demoCommitReport.ok ? 'rgba(25,135,84,.32)' : 'rgba(220,53,69,.34)'}`,
                background: demoCommitReport.ok ? 'rgba(18,76,56,.26)' : 'rgba(95,27,38,.34)',
                fontSize: '.66rem',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.35,
                color: demoCommitReport.ok ? '#c8f3df' : '#ffd7dd',
              }}>
                {demoCommitReport.text}
              </div>
            ) : null}

            {topIssueLabel ? (
              <div
                style={{
                  padding: '.18rem .22rem',
                  borderRadius: 12,
                  border: `1px solid ${mergedWorkingViewChecks.status === 'blocked' ? 'rgba(220,53,69,.34)' : 'rgba(255,193,7,.3)'}`,
                  background: mergedWorkingViewChecks.status === 'blocked' ? 'rgba(95,27,38,.34)' : 'rgba(92,64,9,.24)',
                  display: 'grid',
                  gap: '.06rem',
                }}
              >
                <strong style={{ fontSize: '.78rem', color: mergedWorkingViewChecks.status === 'blocked' ? '#ffe1e6' : '#ffe9a8' }}>
                  {workingStatusLabel} {mergedWorkingViewChecks.status === 'blocked' ? '— controlli non bypassabili' : '— verifica richiesta'}
                </strong>
                <div style={{ fontSize: '.66rem', color: mergedWorkingViewChecks.status === 'blocked' ? '#ffd7dd' : '#fbe2a2', lineHeight: 1.32 }}>
                  {topIssueLabel}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', borderRadius: 10, border: '1px solid rgba(124,157,202,.13)', background: 'rgba(6,22,35,.6)', overflow: 'hidden' }}>
              {[
                ['prima_nota', 'Prima nota'],
                ['iva', 'IVA'],
                ['partitario', 'Partitario'],
                ['suggerimenti', 'Suggerimenti AI'],
              ].map(([tabKey, label]) => {
                const active = workingViewTab === tabKey
                return (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setWorkingViewTab(tabKey)}
                    style={{
                      minHeight: 42,
                      padding: '.12rem .18rem',
                      border: 'none',
                      borderRight: tabKey !== 'suggerimenti' ? '1px solid rgba(124,157,202,.13)' : 'none',
                      borderBottom: active ? '2px solid #f0b90b' : '2px solid transparent',
                      background: active ? 'linear-gradient(180deg, rgba(21,46,72,.78), rgba(14,34,53,.76))' : 'rgba(0,0,0,0)',
                      color: active ? '#f5f9ff' : 'rgba(214,226,243,.84)',
                      fontSize: '.74rem',
                      fontWeight: active ? 800 : 700,
                      textAlign: 'center',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <div style={{ border: '1px solid rgba(124,157,202,.12)', borderRadius: 12, background: 'rgba(9,33,49,.44)', padding: '.16rem', display: 'grid', gap: '.16rem', alignContent: 'start' }}>
              {workingViewTab === 'prima_nota' ? (
                <div style={{ display: 'grid', gap: '.18rem' }}>
                  <WorkingViewPrimaNotaTable
                    activeWorkingViewModel={activeWorkingViewModel}
                    formatMoney={formatMoney}
                    formatManualCausale={formatManualCausale}
                    pianoConti={pianoConti}
                    rows={pnDraftRows}
                    setRows={setPnDraftRows}
                  />
                </div>
              ) : null}

              {workingViewTab === 'iva' ? (
                <div style={{ display: 'grid', gap: '.16rem' }}>
                  <div style={{ display: 'grid', gap: '.04rem' }}>
                    <div style={{ fontSize: '.6rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.06em' }}>IVA</div>
                    <div style={{ fontSize: '.8rem', color: '#e6eeff', fontWeight: 700 }}>Tabella IVA multi-aliquota</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.08rem', fontSize: '.66rem', color: 'var(--mu)', lineHeight: 1.28 }}>
                      <span style={{ width: 16, height: 16, borderRadius: 999, border: '1px solid rgba(88,149,219,.28)', background: 'rgba(88,149,219,.14)', color: '#beddff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.58rem', fontWeight: 800 }}>i</span>
                      <span>Gestisci aliquote multiple e righe esenti/non imponibili per la stessa fattura.</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.12rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '.08rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setIvaDraftRows((currentRows) => currentRows.map((row) => recalculateWorkingViewIvaDraftRow(row, causaliIvaById)))
                        }}
                        style={workingTabSecondaryButtonStyle}
                      >
                        Ricalcola totali
                      </button>
                      <button type="button" onClick={duplicateSelectedIvaDraftRow} disabled={!selectedIvaDraftRowId} style={!selectedIvaDraftRowId ? { ...workingTabSecondaryButtonStyle, opacity: 0.45, cursor: 'not-allowed' } : workingTabSecondaryButtonStyle}>Duplica riga</button>
                    </div>
                  </div>

                  <div style={{ border: '1px solid rgba(124,157,202,.12)', borderRadius: 12, background: 'linear-gradient(180deg, rgba(255,255,255,.026), rgba(255,255,255,.016))', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,.04)' }}>
                          {['Aliquota', 'Imponibile', 'Detraibile', 'IVA indetraibile', 'Esigibilita', 'Causale IVA', 'Azioni'].map((label) => (
                            <th key={label} style={{ padding: '.1rem .12rem', textAlign: 'left', fontSize: '.58rem', color: 'rgba(188,204,226,.78)', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(124,157,202,.12)' }}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ivaDraftRows.map((row) => {
                          const isSelected = row.id === selectedIvaDraftRowId
                          const isPickerOpen = ivaCausalePickerRowId === row.id
                          return (
                          <>
                          <tr key={row.id} onClick={() => setSelectedIvaDraftRowId(row.id)} style={{ background: isSelected ? 'rgba(28,60,90,.32)' : 'rgba(7,24,38,.18)' }}>
                            <td style={{ padding: '.1rem .12rem', width: '10%', borderBottom: '1px solid rgba(124,157,202,.08)', boxShadow: isSelected ? 'inset 2px 0 0 #f0b90b' : 'none' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '.08rem .12rem', borderRadius: 999, fontSize: '.62rem', fontWeight: 800, width: 'fit-content', ...getWorkingViewIvaBadgeTone(row) }}>
                                {formatWorkingViewIvaRate(row.aliquota)}
                              </div>
                            </td>
                            <td style={{ padding: '.1rem', width: '14%', borderBottom: '1px solid rgba(124,157,202,.08)' }}>
                              <div style={{ display: 'grid', gap: '.03rem' }}>
                                <input type="number" step="0.01" value={row.imponibile} onChange={(event) => updateIvaDraftRow(row.id, 'imponibile', event.target.value)} style={ivaAmountInputStyle} />
                                <span style={ivaAmountMetaStyle}>base imponibile</span>
                              </div>
                            </td>
                            <td style={{ padding: '.1rem .12rem', width: '14%', borderBottom: '1px solid rgba(124,157,202,.08)' }}>
                              <div style={{ display: 'grid', gap: '.02rem' }}>
                                <strong style={ivaAmountValueStyle}>{formatMoney(row.detraibileImposta || 0)}</strong>
                                <span style={ivaAmountMetaStyle}>{Math.round(Number(row.detraibilePercent || 0))}% detraibile</span>
                              </div>
                            </td>
                            <td style={{ padding: '.1rem .12rem', width: '14%', borderBottom: '1px solid rgba(124,157,202,.08)' }}>
                              <div style={{ display: 'grid', gap: '.02rem' }}>
                                <strong style={{ ...ivaAmountValueStyle, color: '#ffd7dd' }}>{formatMoney(row.indetraibileImposta || 0)}</strong>
                                <span style={ivaAmountMetaStyle}>{Math.round(Number(row.indetraibilePercent || 0))}% indetraibile</span>
                              </div>
                            </td>
                            <td style={{ padding: '.1rem', width: '14%', borderBottom: '1px solid rgba(124,157,202,.08)' }}>
                              <select value={row.esigibilita} onChange={(event) => updateIvaDraftRow(row.id, 'esigibilita', event.target.value)} style={ivaCompactInputStyle}>
                                <option value="Immediata">Immediata</option>
                                <option value="Differita">Differita</option>
                                <option value="Split payment">Split payment</option>
                              </select>
                            </td>
                            <td style={{ padding: '.1rem', width: '28%', borderBottom: isPickerOpen ? 'none' : '1px solid rgba(124,157,202,.08)' }}>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (ivaCausalePickerRowId === row.id) {
                                    setIvaCausalePickerRowId('')
                                    setIvaCausaleSearchTerm('')
                                    return
                                  }
                                  setIvaCausalePickerRowId(row.id)
                                  setIvaCausaleSearchTerm('')
                                }}
                                style={ivaPickerButtonStyle}
                              >
                                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.causaleIvaLabel || 'Seleziona causale IVA'}</span>
                                <span style={{ fontSize: '.58rem', color: 'rgba(188,204,226,.72)' }}>▾</span>
                              </button>
                            </td>
                            <td style={{ padding: '.1rem', width: '6%', borderBottom: isPickerOpen ? 'none' : '1px solid rgba(124,157,202,.08)' }}>
                              <button
                                type="button"
                                title="Elimina riga IVA"
                                aria-label="Elimina riga IVA"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  removeIvaDraftRow(row.id)
                                }}
                                disabled={ivaDraftRows.length <= 1}
                                style={ivaDraftRows.length > 1 ? ivaIconButtonStyle : { ...ivaIconButtonStyle, opacity: 0.45, cursor: 'not-allowed' }}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                          {isPickerOpen ? (
                            <tr key={`${row.id}-picker`} style={{ background: isSelected ? 'rgba(28,60,90,.24)' : 'rgba(7,24,38,.16)' }}>
                              <td colSpan={7} style={{ padding: '.12rem', borderBottom: '1px solid rgba(124,157,202,.08)' }}>
                                <div style={ivaPickerDropdownStyle} onClick={(event) => event.stopPropagation()}>
                                  <input
                                    ref={ivaCausaleSearchInputRef}
                                    type="text"
                                    value={ivaCausaleSearchTerm}
                                    onChange={(event) => setIvaCausaleSearchTerm(event.target.value)}
                                    placeholder="Cerca causale IVA"
                                    style={{ ...ivaCompactInputStyle, minHeight: 34 }}
                                  />
                                  <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: '.06rem', paddingRight: '.02rem' }}>
                                    {filteredCausaliIva.length ? filteredCausaliIva.map((causale) => {
                                      const selected = row.causaleIvaId === causale.id
                                      return (
                                        <button
                                          key={causale.id}
                                          type="button"
                                          onClick={() => {
                                            updateIvaDraftRow(row.id, 'causaleIvaId', causale.id)
                                            setIvaCausalePickerRowId('')
                                            setIvaCausaleSearchTerm('')
                                          }}
                                          style={{
                                            width: '100%',
                                            borderRadius: 10,
                                            border: selected ? '1px solid rgba(240,185,11,.28)' : '1px solid rgba(124,157,202,.1)',
                                            background: selected ? 'rgba(240,185,11,.08)' : 'rgba(255,255,255,.02)',
                                            color: '#edf4ff',
                                            textAlign: 'left',
                                            padding: '.1rem .12rem',
                                            display: 'grid',
                                            gap: '.02rem',
                                          }}
                                        >
                                          <strong style={{ fontSize: '.66rem', fontWeight: 700 }}>{causale.codice || 'IVA'}</strong>
                                          <span style={{ fontSize: '.62rem', color: 'rgba(188,204,226,.78)', lineHeight: 1.2 }}>{getWorkingViewCausaleIvaOptionLabel(causale)}</span>
                                        </button>
                                      )
                                    }) : (
                                      <div style={{ padding: '.14rem .12rem', fontSize: '.64rem', color: 'rgba(188,204,226,.72)' }}>Nessuna causale IVA trovata.</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                          </>
                        )})}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: '.1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" onClick={addIvaDraftRow} style={{ ...workingTabButtonStyle, border: '1px solid rgba(61,211,110,.3)', background: 'linear-gradient(180deg, rgba(56,197,92,.18), rgba(44,171,75,.12))', color: '#dff9e7' }}>+ Aggiungi riga IVA</button>
                    <button type="button" onClick={removeSelectedIvaDraftRow} disabled={!selectedIvaDraftRowId || ivaDraftRows.length <= 1} style={(!selectedIvaDraftRowId || ivaDraftRows.length <= 1) ? { ...workingTabDangerButtonStyle, opacity: 0.45, cursor: 'not-allowed' } : workingTabDangerButtonStyle}>Elimina riga selezionata</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '.12rem' }}>
                    <div style={ivaSummaryCardStyle}>
                      <span style={{ ...ivaSummaryIconStyle, background: 'rgba(240,185,11,.12)', color: '#ffd86f', border: '1px solid rgba(240,185,11,.18)' }}>B</span>
                      <div style={{ display: 'grid', gap: '.02rem' }}>
                        <span style={{ fontSize: '.58rem', color: 'rgba(188,204,226,.74)' }}>Totale imponibile</span>
                        <strong style={{ fontSize: '.9rem', color: '#e6eeff' }}>{formatMoney(ivaDraftTotals.imponibile)}</strong>
                      </div>
                    </div>
                    <div style={ivaSummaryCardStyle}>
                      <span style={{ ...ivaSummaryIconStyle, background: 'rgba(72,123,255,.12)', color: '#bcd3ff', border: '1px solid rgba(72,123,255,.16)' }}>%</span>
                      <div style={{ display: 'grid', gap: '.02rem' }}>
                        <span style={{ fontSize: '.58rem', color: 'rgba(188,204,226,.74)' }}>Totale IVA</span>
                        <strong style={{ fontSize: '.9rem', color: '#e6eeff' }}>{formatMoney(ivaDraftTotals.imposta)}</strong>
                      </div>
                    </div>
                    <div style={ivaSummaryCardStyle}>
                      <span style={{ ...ivaSummaryIconStyle, background: 'rgba(56,197,92,.14)', color: '#d1f7da', border: '1px solid rgba(56,197,92,.18)' }}>TOT</span>
                      <div style={{ display: 'grid', gap: '.02rem' }}>
                        <span style={{ fontSize: '.58rem', color: 'rgba(188,204,226,.74)' }}>Totale documento</span>
                        <strong style={{ fontSize: '.9rem', color: '#eaf9ef' }}>{formatMoney(ivaDraftDocumentTotal)}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: '1px solid rgba(124,157,202,.12)', borderRadius: 12, padding: '.14rem .16rem', background: 'rgba(8,27,42,.42)', display: 'grid', gap: '.04rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.1rem' }}>
                      <span style={{ width: 20, height: 20, borderRadius: 999, background: 'rgba(72,123,255,.14)', color: '#bcd3ff', border: '1px solid rgba(72,123,255,.18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.64rem', fontWeight: 800 }}>i</span>
                      <strong style={{ fontSize: '.72rem', color: '#e6eeff' }}>Gestione multi-IVA</strong>
                    </div>
                    <div style={{ fontSize: '.66rem', color: 'var(--mu)', lineHeight: 1.3 }}>La causale IVA guida aliquota, quota detraibile e quota indetraibile della riga. Verifica la causale prima di liquidazioni e dichiarazione IVA.</div>
                  </div>
                </div>
              ) : null}

              {workingViewTab === 'partitario' ? (
                <div style={{ display: 'grid', gap: '.16rem' }}>
                  <div style={{ fontSize: '.6rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Partitario</div>
                  <div style={{ display: 'grid', gap: '.08rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.14rem', padding: '.2rem .26rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.02)' }}>
                      <span style={{ fontSize: '.64rem' }}>Controparte</span>
                      <strong style={{ fontSize: '.66rem' }}>{activeWorkingViewModel.fornitoreCliente || '—'}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.14rem', padding: '.2rem .26rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.02)' }}>
                      <span style={{ fontSize: '.64rem' }}>Totale partita</span>
                      <strong style={{ fontSize: '.66rem' }}>{formatMoney(activeWorkingViewModel.totale)}</strong>
                    </div>
                    <div style={{ fontSize: '.64rem', color: 'var(--mu)' }}>Stato: bozza locale</div>
                  </div>
                </div>
              ) : null}

              {workingViewTab === 'suggerimenti' ? (
                <div style={{ display: 'grid', gap: '.16rem' }}>
                  <div style={{ fontSize: '.6rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Suggerimento operativo</div>
                  <MessageBox tone="neutral">Suggerimenti AI non ancora attivi in questa fase.</MessageBox>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '.12rem' }}>
              <div style={{ padding: '.14rem .16rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'linear-gradient(180deg, rgba(13,40,61,.66), rgba(10,30,46,.6))', display: 'grid', gap: '.05rem' }}>
                <div style={{ fontSize: '.54rem', color: 'rgba(188,204,226,.72)' }}>Controparte collegata</div>
                <div style={{ fontSize: '.8rem', color: '#e6eeff', fontWeight: 700, lineHeight: 1.24 }}>{activeWorkingViewModel.fornitoreCliente || 'Non collegata'}</div>
              </div>
              <div style={{ padding: '.14rem .16rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'linear-gradient(180deg, rgba(13,40,61,.66), rgba(10,30,46,.6))', display: 'grid', gap: '.05rem' }}>
                <div style={{ fontSize: '.54rem', color: 'rgba(188,204,226,.72)' }}>Conto costo selezionato</div>
                <div style={{ fontSize: '.8rem', color: '#e6eeff', fontWeight: 700, lineHeight: 1.24 }}>{formatManualAccount(activeWorkingViewModel.costRevenueAccount)}</div>
              </div>
              <div style={{ padding: '.14rem .16rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'linear-gradient(180deg, rgba(13,40,61,.66), rgba(10,30,46,.6))', display: 'grid', gap: '.05rem' }}>
                <div style={{ fontSize: '.54rem', color: 'rgba(188,204,226,.72)' }}>Causale FF</div>
                <div style={{ fontSize: '.8rem', color: '#e6eeff', fontWeight: 700, lineHeight: 1.24 }}>{formatManualCausale(activeWorkingViewModel.causale)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, .92fr)', gap: '.12rem' }}>
              <div style={{ display: 'grid', gap: '.1rem', padding: '.16rem .18rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(8,27,42,.46)' }}>
                <div style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Controlli</div>
                {mergedWorkingViewChecks.status === 'blocked' ? (
                  mergedWorkingViewChecks.blockingIssues.map((issue) => (
                    <div key={issue} style={{ display: 'flex', alignItems: 'flex-start', gap: '.14rem', color: '#ffd8dd', fontSize: '.66rem', lineHeight: 1.28 }}>
                      <span style={{ color: '#ef5b6c' }}>●</span>
                      <span>{issue}</span>
                    </div>
                  ))
                ) : mergedWorkingViewChecks.status === 'warning' ? (
                  mergedWorkingViewChecks.warnings.map((issue) => (
                    <div key={issue} style={{ display: 'flex', alignItems: 'flex-start', gap: '.14rem', color: '#ffe38a', fontSize: '.66rem', lineHeight: 1.28 }}>
                      <span style={{ color: '#f2be42' }}>●</span>
                      <span>{issue}</span>
                    </div>
                  ))
                ) : (
                  mergedWorkingViewChecks.checks
                    .filter((check) => check.status === 'ok' || check.status === 'info')
                    .slice(0, 4)
                    .map((check) => (
                      <div key={check.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '.14rem', color: check.status === 'ok' ? '#d7f5e3' : 'var(--mu)', fontSize: '.66rem', lineHeight: 1.28 }}>
                        <span style={{ color: check.status === 'ok' ? '#52cf7a' : '#84a2c6' }}>●</span>
                        <span>{check.label}{check.detail ? ` (${check.detail})` : ''}</span>
                      </div>
                    ))
                )}
              </div>

              <div style={{ display: 'grid', gap: '.08rem', padding: '.16rem .18rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(8,27,42,.46)' }}>
                <div style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Dati operativi</div>
                <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: '.08rem .14rem', alignItems: 'start', fontSize: '.72rem', lineHeight: 1.24 }}>
                  <span style={{ color: 'var(--mu)' }}>Controparte:</span>
                  <strong style={{ color: '#e6eeff' }}>{activeWorkingViewModel.fornitoreCliente || '—'}</strong>
                  <span style={{ color: 'var(--mu)' }}>Conto costo:</span>
                  <strong style={{ color: '#e6eeff' }}>{formatManualAccount(activeWorkingViewModel.costRevenueAccount)}</strong>
                  <span style={{ color: 'var(--mu)' }}>Causale:</span>
                  <strong style={{ color: '#e6eeff' }}>{formatManualCausale(activeWorkingViewModel.causale)}</strong>
                  <span style={{ color: 'var(--mu)' }}>Partita:</span>
                  <span style={{ display: 'inline-flex', width: 'fit-content', padding: '.06rem .1rem', borderRadius: 8, border: '1px solid rgba(124,157,202,.14)', background: 'rgba(255,255,255,.03)', color: '#dbe7fb' }}>bozza locale</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '.16rem .18rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'linear-gradient(180deg, rgba(15,44,69,.62), rgba(10,31,48,.64))', display: 'grid', gap: '.06rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.14rem' }}>
                <span style={{ width: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(73,142,255,.18)', color: '#7fb5ff', fontSize: '.72rem', fontWeight: 800 }}>i</span>
                <strong style={{ fontSize: '.78rem', color: '#e6eeff' }}>Suggerimento operativo</strong>
              </div>
              <div style={{ fontSize: '.7rem', color: 'rgba(214,226,243,.86)', lineHeight: 1.32 }}>
                {operationalSuggestion}
              </div>
            </div>
            </section>
          </section>
        </div>
      </section>

      {applyPopoverOpen && (
        <WorkingViewApplyActionsPopover
          activeWorkingViewModel={activeWorkingViewModel}
          stagingRows={stagingRows}
          visibleRows={visibleRows}
          selectedRowIds={selectedRowIds}
          manualAccountByRowId={manualAccountByRowId}
          manualCausaleByRowId={manualCausaleByRowId}
          manualRegistrationDateByRowId={manualRegistrationDateByRowId}
          formatManualAccount={formatManualAccount}
          formatManualCausale={formatManualCausale}
          formatMoney={formatMoney}
          causaliContabili={causaliContabili}
          activeIvaDraftRows={ivaDraftRows}
          currentAutomationMeta={currentAutomationMeta}
          onApply={(payload) => {
            setApplyPopoverOpen(false)
            if (typeof onApplyToBatch === 'function') {
              onApplyToBatch(payload)
            }
          }}
          onClose={() => setApplyPopoverOpen(false)}
        />
      )}
    </div>
  )
}
