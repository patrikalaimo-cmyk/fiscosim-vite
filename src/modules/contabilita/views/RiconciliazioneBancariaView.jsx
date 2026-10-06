import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtCurrency } from '../ui/formatters.js'
import { RICONCILIAZIONE_MOCK_DATA } from '../components/riconciliazione/mockRiconciliazioneData.js'
import RiconciliazioneHeader from '../components/riconciliazione/RiconciliazioneHeader.jsx'
import RiconciliazioneKpiStrip from '../components/riconciliazione/RiconciliazioneKpiStrip.jsx'
import RiconciliazioneSummaryCards from '../components/riconciliazione/RiconciliazioneSummaryCards.jsx'
import RiconciliazioneFilters from '../components/riconciliazione/RiconciliazioneFilters.jsx'
import RiconciliazioneWorkingTable from '../components/riconciliazione/RiconciliazioneWorkingTable.jsx'
import RiconciliazioneDetailPanel from '../components/riconciliazione/RiconciliazioneDetailPanel.jsx'
import RiconciliazioneAuditBanner from '../components/riconciliazione/RiconciliazioneAuditBanner.jsx'
import RiconciliazioneGuidedImportDemo from '../components/riconciliazione/RiconciliazioneGuidedImportDemo.jsx'
import RiconciliazioneGuidedImportFlow from '../components/riconciliazione/RiconciliazioneGuidedImportFlow.jsx'
import { getGuidedImportAvailability } from '../components/riconciliazione/getGuidedImportAvailability.js'
import { matchGuidedImportTemplate } from '../components/riconciliazione/matchGuidedImportTemplate.js'
import { applyGuidedImportTemplateToStatement } from '../components/riconciliazione/applyGuidedImportTemplateToStatement.js'
import RiconciliazioneDocumentModal from '../components/riconciliazione/RiconciliazioneDocumentModal.jsx'
import RiconciliazioneTableJumpControls from '../components/riconciliazione/RiconciliazioneTableJumpControls.jsx'
import { getRiconciliazioneMatchingFixtures } from '../components/riconciliazione/riconciliazioneMatchingFixtures.js'
import { runRiconciliazioneMatchForMovement } from '../components/riconciliazione/runRiconciliazioneMatchForMovement.js'
import { mapBankStatementMovementToWorkingRow } from '../components/riconciliazione/mapBankStatementMovementToWorkingRow.js'
import { applyBankMovementCorrection } from '../components/riconciliazione/applyBankMovementCorrection.js'
import { buildReconciliationStorageKey } from '../components/riconciliazione/buildReconciliationStorageKey.js'
import {
  DEFAULT_RECONCILIATION_FILTERS,
  DEFAULT_RECONCILIATION_SUMMARY_COLLAPSED,
  buildReconciliationDraftSnapshot,
  getActiveReconciliationDraftKey,
  loadReconciliationDraft,
  removeReconciliationDraft,
  reviveReconciliationDraft,
  saveReconciliationDraft,
} from '../components/riconciliazione/reconciliationLocalStore.js'
import {
  buildMockFooter,
  buildMockKpis,
  buildMockSelectableIds,
  filterMockMovements,
  isMovementSelectableForMassActions,
} from '../components/riconciliazione/riconciliazioneMockSelectors.js'
import { buildBankStatementImportDraft } from '../components/riconciliazione/buildBankStatementImportDraft.js'
import { createGuidedImportAuditFromStatement } from '../components/riconciliazione/createGuidedImportAuditFromStatement.js'
import {
  buildDocumentPreviewState,
  buildReviewStats,
  buildReviewWorkItems,
  reviewStatusTone,
} from '../components/riconciliazione/buildDocumentPreviewLinks.js'

const MOCK_STORAGE_CONTEXT = {
  societaId: 'societa-demo',
  bankAccountId: RICONCILIAZIONE_MOCK_DATA.bankAccountCode,
  period: RICONCILIAZIONE_MOCK_DATA.statementPeriod,
}

function getReliabilityLabel(level) {
  if (level === 'certified_balanced') return 'Import certificato da saldo'
  if (level === 'high_confidence') return 'Import ad alta affidabilita, ma senza saldo ufficiale'
  if (level === 'needs_review') return 'Import non affidabile: review obbligatoria'
  if (level === 'needs_ocr') return 'Da OCR / elaborazione'
  if (level === 'blocked') return 'Bloccato'
  return 'Demo'
}

function formatRawSnippet(value, limit = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return '-'
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function formatShortTimestamp(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parsed)
}

function buildImportIdentifier({ file, importDraft }) {
  const draftHash = String(importDraft?.sourceFileHash || '').trim()
  if (draftHash) return draftHash
  const fileName = String(file?.name || '').trim() || 'statement'
  const fileSize = Number(file?.size || 0)
  const lastModified = Number(file?.lastModified || Date.now())
  return `${fileName}-${fileSize}-${lastModified}`
}

export default function RiconciliazioneBancariaView() {
  const [mode, setMode] = useState('demo')
  const [selectedId, setSelectedId] = useState(RICONCILIAZIONE_MOCK_DATA.movements[0]?.id)
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [summaryCollapsed, setSummaryCollapsed] = useState({ ...DEFAULT_RECONCILIATION_SUMMARY_COLLAPSED })
  const [selectedIds, setSelectedIds] = useState(() => buildMockSelectableIds(RICONCILIAZIONE_MOCK_DATA.movements.slice(0, 3)))
  const [filters, setFilters] = useState({ ...DEFAULT_RECONCILIATION_FILTERS })
  const [actionNote, setActionNote] = useState('')
  const [bankStatement, setBankStatement] = useState(null)
  const [reviewStateById, setReviewStateById] = useState({})
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState('')
  const [documentPreviewPage, setDocumentPreviewPage] = useState(1)
  const [documentPreviewZoom, setDocumentPreviewZoom] = useState('fit')
  const [documentModalOpen, setDocumentModalOpen] = useState(false)
  const [stagingStatus, setStagingStatus] = useState({
    lastSavedAt: '',
    notice: '',
    warning: '',
    hasStoredDraft: false,
  })
  const [pipelineTrace, setPipelineTrace] = useState([])
  const [guidedDemoOpen, setGuidedDemoOpen] = useState(false)
    const [guidedFlowOpen, setGuidedFlowOpen] = useState(false)
  const [guidedFlowTemplateMatch, setGuidedFlowTemplateMatch] = useState(null)
  const [reconciliationContext, setReconciliationContext] = useState(MOCK_STORAGE_CONTEXT)
  const [lastTableScrollPosition, setLastTableScrollPosition] = useState(null)
  const fileInputRef = useRef(null)
  const tableViewportRef = useRef(null)
  const suppressTableScrollTrackingRef = useRef(false)
  const previousTableScrollTopRef = useRef(null)
  const hydratedStorageRef = useRef(false)
  const saveTimerRef = useRef(null)

  const appendPipelineTrace = (step, details = {}) => {
    setPipelineTrace((prev) => {
      const next = [
        ...prev,
        {
          step,
          ...details,
          at: new Date().toISOString(),
        },
      ]
      return next.slice(-12)
    })
  }

  const hasImportedStatement = Boolean(bankStatement)
  const isDemoMode = mode === 'demo'
  const isImportedFileMode = mode === 'imported_file'
  const isImportFailedMode = mode === 'import_failed'
  const isNeedsOcrMode = mode === 'needs_ocr'

  const baseMovements = hasImportedStatement
    ? bankStatement.movements.map((movement, index) => mapBankStatementMovementToWorkingRow(movement, index))
    : RICONCILIAZIONE_MOCK_DATA.movements

  const reviewItems = useMemo(() => buildReviewWorkItems(bankStatement, reviewStateById), [bankStatement, reviewStateById])
  const reviewStats = useMemo(() => buildReviewStats(reviewItems), [reviewItems])
  const reviewLookupByMovementId = useMemo(() => {
    const lookup = new Map()
    reviewItems.forEach((item) => {
      if (item.movementId) lookup.set(item.movementId, item)
    })
    return lookup
  }, [reviewItems])

  const sourceMovements = useMemo(
    () =>
      baseMovements.map((movement) => {
        const reviewItem = reviewLookupByMovementId.get(movement.id)
        if (!reviewItem) return movement
        return {
          ...movement,
          reviewStatus: reviewItem.currentStatus,
          reviewLabel: reviewItem.reviewLabel,
          reviewTone: reviewItem.severity,
          reviewReason: reviewItem.reason || '',
          reviewKey: reviewItem.reviewKey,
        }
      }),
    [baseMovements, reviewLookupByMovementId]
  )

  const filteredMovements = useMemo(
    () => filterMockMovements(sourceMovements, filters),
    [filters, sourceMovements]
  )
  const filteredKpis = useMemo(() => buildMockKpis(filteredMovements), [filteredMovements])
  const footer = useMemo(() => buildMockFooter(filteredMovements), [filteredMovements])

  const selectedMovement = useMemo(() => {
    if (!sourceMovements.length) return null
    return (
      sourceMovements.find((movement) => movement.id === selectedId) ||
      filteredMovements[0] ||
      sourceMovements[0] ||
      null
    )
  }, [filteredMovements, selectedId, sourceMovements])

  const workingContext = useMemo(() => {
    const fixtures = getRiconciliazioneMatchingFixtures()
    const selectedMovementId = selectedMovement?.movementId || selectedMovement?.id || ''
    const fixtureMovement = fixtures.movements.find((item) => item.movementId === selectedMovementId) || null
    if (!fixtureMovement) {
      return {
        fixtures,
        available: false,
        source: 'fallback',
        message: 'Decisione non disponibile - movimento reale non presente nel dataset mock',
        movement: selectedMovement,
        fixtureMovement: null,
        fixtureCase: null,
        decisionProposal: null,
      }
    }
    const decisionProposal = runRiconciliazioneMatchForMovement({ movement: fixtureMovement, partiteAperte: fixtures.partiteAperte })
    const fixtureCase = fixtures.expectedCases.find((item) => item.movementId === fixtureMovement.movementId) || null
    return {
      fixtures,
      available: true,
      source: 'fixture',
      message: 'Movimento presente nel dataset mock R7A',
      movement: selectedMovement,
      fixtureMovement,
      fixtureCase,
      decisionProposal,
    }
  }, [selectedMovement])

  const visibleSelectableIds = useMemo(
    () => filteredMovements.filter(isMovementSelectableForMassActions).map((movement) => movement.id),
    [filteredMovements]
  )
  const allVisibleSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.includes(id))
  const someVisibleSelected = visibleSelectableIds.some((id) => selectedIds.includes(id))
  const selectedMovements = useMemo(
    () => sourceMovements.filter((movement) => selectedIds.includes(movement.id)),
    [selectedIds, sourceMovements]
  )
  const confirmableSelectedCount = selectedMovements.filter(isMovementSelectableForMassActions).length
  const effectiveDetailCollapsed = detailCollapsed || filteredMovements.length === 0
  const activeSourceFileName = bankStatement?.sourceFileName || ''
  const activeSourceFileType = bankStatement?.sourceFileType || ''
  const activeParseStatus = bankStatement?.parseStatus || 'mock'
  const activeStatementStatus = bankStatement?.status || 'mock'
  const activeReliabilityLevel = bankStatement?.parseReliabilityLevel || 'mock'
  const ignoredSummary = bankStatement?.ignoredReasonSummary || {}
  const deltaDiagnostics = bankStatement?.deltaDiagnostics || bankStatement?.audit?.deltaDiagnostics || null
  const movementAmountAudit = deltaDiagnostics?.movementAmountAudit || bankStatement?.audit?.movementAmountAudit || null
  const guidedImportAudit = bankStatement?.guidedImportAudit || bankStatement?.audit?.guidedImportAudit || null
  const guidedImportAuditSummary =
    guidedImportAudit?.summary ||
    bankStatement?.guidedImportAuditSummary ||
    bankStatement?.audit?.guidedImportAuditSummary ||
    null
  const guidedImportAuditEvents =
    guidedImportAudit?.events ||
    bankStatement?.guidedImportAuditEvents ||
    bankStatement?.audit?.guidedImportAuditEvents ||
    []
  const documentMeta = bankStatement?.documentMeta || {}
  const selectedAccountMeta = bankStatement?.selectedAccountMeta || {}
  const statementAudit = bankStatement?.audit || null
  const statementAllowsConfirm = !bankStatement || ['certified_balanced', 'high_confidence'].includes(activeReliabilityLevel)
  const confirmBlockReason = bankStatement && !statementAllowsConfirm
    ? bankStatement.confirmationBlockedReason || 'Affidabilita insufficiente per conferma massiva'
    : ''
  const activeStatementPeriod =
    bankStatement?.pdfSummary?.periodLabel ||
    (bankStatement?.periodStart && bankStatement?.periodEnd ? `${bankStatement.periodStart} - ${bankStatement.periodEnd}` : '') ||
    RICONCILIAZIONE_MOCK_DATA.statementPeriod
  const activeReconciliationContext = useMemo(
    () => ({
      societaId: bankStatement?.companyId || reconciliationContext.societaId || MOCK_STORAGE_CONTEXT.societaId,
      bankAccountId: bankStatement?.bankAccountId || reconciliationContext.bankAccountId || MOCK_STORAGE_CONTEXT.bankAccountId,
      period: bankStatement?.periodLabel || activeStatementPeriod || reconciliationContext.period || MOCK_STORAGE_CONTEXT.period,
    }),
    [
      activeStatementPeriod,
      bankStatement?.bankAccountId,
      bankStatement?.companyId,
      bankStatement?.periodLabel,
      reconciliationContext.bankAccountId,
      reconciliationContext.period,
      reconciliationContext.societaId,
    ]
  )
  const reconciliationStorageKey = useMemo(
    () => buildReconciliationStorageKey(activeReconciliationContext),
    [activeReconciliationContext]
  )

  const auditReviewPreview = reviewItems.slice(0, 10)
  const auditTopSuspects = (movementAmountAudit?.topSuspects910 || deltaDiagnostics?.topSuspects910 || deltaDiagnostics?.topSuspects || []).slice(0, 10)

  const ignoredSummaryLabel = Object.entries(ignoredSummary)
    .slice(0, 4)
    .map(([key, value]) => `${key.replace(/_/g, ' ')} ${value}`)
    .join(' | ')

  const formatDeltaItem = (item) => {
    const amountLabel = item.amount != null ? fmtCurrency(item.amount) : '-'
    const pageLabel = item.pageNumber ? `p.${item.pageNumber}` : 'p.-'
    const deltaLabel = item.contributesToDelta910 ? 'yes' : 'no'
    const candidateLabel = item.candidateAmount != null ? fmtCurrency(item.candidateAmount) : '-'
    return `${item.operationDate || '-'} | ${amountLabel} -> ${candidateLabel} | ${item.currentDirection || '-'} | ${item.detectedColumn || '-'} | ${pageLabel} | ${item.reason || '-'} | delta910 ${deltaLabel} | ${formatRawSnippet(item.rawText)}`
  }

  useEffect(() => {
    if (!bankStatement?.sourceFile) {
      setDocumentPreviewUrl('')
      return undefined
    }

    const nextUrl = URL.createObjectURL(bankStatement.sourceFile)
    setDocumentPreviewUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [bankStatement?.sourceFile])

  useEffect(() => {
    if (!selectedMovement) return
    const previewPage = Number(
      selectedMovement?.sourceMeta?.pageNumber ||
      selectedMovement?.pageNumber ||
      selectedMovement?.detail?.audit?.pageNumber ||
      1
    ) || 1
    setDocumentPreviewPage(previewPage)
  }, [selectedMovement?.id])

  useEffect(() => {
    if (!bankStatement) {
      setReviewStateById({})
    }
  }, [bankStatement])

  useEffect(() => {
    hydratedStorageRef.current = false

    const activeDraftKey = getActiveReconciliationDraftKey()
    appendPipelineTrace('restore_start', { storageKey: reconciliationStorageKey, activeDraftKey })
    const { draft, error } = loadReconciliationDraft(activeDraftKey || reconciliationStorageKey)
    if (error) {
      appendPipelineTrace('restore_error', { error })
      setStagingStatus((prev) => ({
        ...prev,
        warning: 'Impossibile leggere lo staging locale. Evita refresh prima di completare.',
      }))
      hydratedStorageRef.current = true
      return
    }

    if (draft) {
      const restored = reviveReconciliationDraft(draft)
      appendPipelineTrace('restore_success', {
        mode: restored?.mode || 'imported_file',
        movements: restored?.bankStatement?.movements?.length || 0,
        profile: restored?.bankStatement?.profileLabel || restored?.bankStatement?.profile || '-',
      })
      if (restored?.context) {
        setReconciliationContext({
          societaId: restored.context.societaId || MOCK_STORAGE_CONTEXT.societaId,
          bankAccountId: restored.context.bankAccountId || MOCK_STORAGE_CONTEXT.bankAccountId,
          period: restored.context.period || MOCK_STORAGE_CONTEXT.period,
        })
      }
      if (restored?.bankStatement) {
        // Template match su restore: usa registry locale corrente
        const restoredStatement = restored.bankStatement
        const tplMatch = matchGuidedImportTemplate(restoredStatement)
        setBankStatement(
          tplMatch.matched
            ? applyGuidedImportTemplateToStatement(restoredStatement, tplMatch)
            : restoredStatement
        )
      }
      setMode(restored?.mode || 'imported_file')
      setSelectedId(restored?.selectedId ?? restored?.bankStatement?.movements?.[0]?.id ?? RICONCILIAZIONE_MOCK_DATA.movements[0]?.id)
      setSelectedIds(
        Array.isArray(restored?.selectedIds) && restored.selectedIds.length
          ? restored.selectedIds
          : buildMockSelectableIds((restored?.bankStatement?.movements || []).slice(0, 3))
      )
      setFilters({ ...DEFAULT_RECONCILIATION_FILTERS, ...(restored?.filters || {}) })
      setSummaryCollapsed({ ...DEFAULT_RECONCILIATION_SUMMARY_COLLAPSED, ...(restored?.summaryCollapsed || {}) })
      setAdvancedFiltersOpen(Boolean(restored?.advancedFiltersOpen))
      setDetailCollapsed(Boolean(restored?.detailCollapsed))
      setDocumentPreviewPage(restored?.documentPreviewPage || 1)
      setDocumentPreviewZoom(restored?.documentPreviewZoom || 'fit')
      setReviewStateById(restored?.reviewStateById || {})
      setDocumentModalOpen(Boolean(restored?.documentModalOpen))
      setActionNote(restored?.actionNote || 'Staging riconciliazione ripristinato.')
      setStagingStatus({
        lastSavedAt: formatShortTimestamp(restored?.savedAt),
        notice: 'Staging ripristinato',
        warning: '',
        hasStoredDraft: true,
      })
      hydratedStorageRef.current = true
      return
    }

    setStagingStatus((prev) => ({
      ...prev,
      hasStoredDraft: false,
      notice: '',
      warning: error ? 'Impossibile leggere lo staging locale. Evita refresh prima di completare.' : '',
    }))
    hydratedStorageRef.current = true
  }, [])

  const documentPreviewState = useMemo(
    () =>
      buildDocumentPreviewState({
        bankStatement,
        selectedMovement,
        previewUrl: documentPreviewUrl,
        previewPage: documentPreviewPage,
        zoom: documentPreviewZoom,
      }),
    [bankStatement, selectedMovement, documentPreviewUrl, documentPreviewPage, documentPreviewZoom]
  )

  const summaryData = useMemo(() => {
    if (!hasImportedStatement) {
      return RICONCILIAZIONE_MOCK_DATA.summaryCards
    }

    const reviewPendingCount = reviewStats.total > 0 ? reviewStats.pending : (bankStatement.auditReviewRows ?? bankStatement.needsReviewRows ?? 0)

    return {
      importStatus: [
        ['File', activeSourceFileName || '—'],
        ['Tipo file', activeSourceFileType || '—'],
        ['Stato parsing', activeParseStatus],
        ['Affidabilita', getReliabilityLabel(activeReliabilityLevel)],
        ['Movimenti validi', bankStatement.parsedMovements ?? bankStatement.movements?.length ?? 0],
        ['Righe raw', bankStatement.totalRawRows ?? 0],
        ['Righe ignorate', bankStatement.ignoredRows ?? 0],
        ['Righe scartate', (bankStatement.rejectedRows ?? 0) + (bankStatement.blockedRows ?? 0)],
        ['Righe da review', reviewPendingCount],
      ],
      matchProps: [
        ['Abbinati', 0],
        ['Proposte forti', bankStatement?.movements?.filter((movement) => Number(movement.parseConfidence || 0) >= 85).length || 0],
        ['Proposte deboli', reviewPendingCount],
        ['Senza match', 0],
        ['Duplicati sospetti', bankStatement?.movements?.filter((movement) => movement.duplicateStatus !== 'unique').length || 0],
        ['Match con PN esistente', 0],
        ['Match con partitario', 0],
        ['Giroconti candidati', 0],
      ],
      accountingProps: [
        ['PN pronte', 0],
        ['Partite da chiudere', 0],
        ['IVA per cassa da sbloccare', 0],
        ['Ritenute da generare', 0],
        ['F24 rilevati / da dettagliare', 0],
        ['Giroconti da abbinare', 0],
        ['Movimenti sospesi', bankStatement?.blockedRows ?? 0],
      ],
    }
  }, [
    hasImportedStatement,
    bankStatement,
    activeParseStatus,
    activeSourceFileName,
    activeSourceFileType,
    activeReliabilityLevel,
    reviewStats.pending,
    reviewStats.total,
  ])

  const updateFilters = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  const updateReviewState = (item, status, correction = null) => {
    if (!item?.reviewKey) return
    setReviewStateById((prev) => ({
      ...prev,
      [item.reviewKey]: {
        status,
        severity: reviewStatusTone(status),
        correction,
      },
    }))
    setActionNote(`Review ${status.replace(/_/g, ' ')} su ${item.pageNumber ? `p.${item.pageNumber}` : item.reviewKey}`)
  }

  const applyMovementCorrection = ({ movementId, changes, reason, reviewStatus = 'corrected' }) => {
    const isVerified = reviewStatus === 'verified'
    const nextReviewStats = {
      ...reviewStats,
      pending: Math.max(Number(reviewStats.pending || 0) - 1, 0),
      corrected: Number(reviewStats.corrected || 0) + (isVerified ? 0 : 1),
      verified: Number(reviewStats.verified || 0) + (isVerified ? 1 : 0),
      total: Number(reviewStats.total || 0),
    }
    const result = applyBankMovementCorrection({
      bankStatement,
      movementId,
      changes,
      reason,
      createdAt: new Date().toISOString(),
      reviewStats: nextReviewStats,
      reviewStatus,
    })

    if (!result?.ok) {
      setActionNote(result?.error === 'no_effective_change' ? 'Nessuna modifica effettiva' : 'Correzione staging non applicata')
      return result
    }

    const correctedStatement = {
      ...result.bankStatement,
      sourceFile: bankStatement?.sourceFile || result.bankStatement?.sourceFile || null,
    }

    setBankStatement(correctedStatement)
    setReviewStateById((prev) => {
      const current = prev[movementId] || {}
      return {
        ...prev,
        [movementId]: {
          ...current,
          status: reviewStatus,
          severity: reviewStatus === 'verified' || reviewStatus === 'corrected' ? 'green' : 'amber',
          correction: result.auditEntry,
        },
      }
    })
    setSelectedId(movementId)
    setMode(correctedStatement?.movements?.length ? 'imported_file' : 'import_failed')
    setActionNote(`Correzione staging applicata a ${movementId}`)
    setStagingStatus((prev) => ({
      ...prev,
      notice: 'Correzione salvata',
      warning: '',
      hasStoredDraft: true,
    }))
    return result
  }

  const handleOpenReviewDocument = (item) => {
    if (item?.pageNumber) {
      setDocumentPreviewPage(Number(item.pageNumber) || 1)
    }
    setDocumentModalOpen(false)
    setActionNote(`Documento aperto su ${item?.pageNumber ? `p.${item.pageNumber}` : 'riga sospetta'}`)
  }

  const handleSelectReviewMovement = (item) => {
    if (!item?.linkedMovementId) return
    setSelectedId(item.linkedMovementId)
    setDetailCollapsed(false)
    setActionNote(`Selezionato movimento collegato ${item.linkedMovementId}`)
  }

  const handleOpenDocumentModal = () => {
    setDocumentModalOpen(true)
  }

  const handleCloseDocumentModal = () => {
    setDocumentModalOpen(false)
  }

  const syncTableScrollPosition = () => {
    if (suppressTableScrollTrackingRef.current) return
    const container = tableViewportRef.current
    if (container) {
      setLastTableScrollPosition(container.scrollTop)
    }
  }

  const scrollTableTo = (top) => {
    const container = tableViewportRef.current
    if (!container) return
    suppressTableScrollTrackingRef.current = true
    container.scrollTo({ top, behavior: 'smooth' })
    window.setTimeout(() => {
      suppressTableScrollTrackingRef.current = false
    }, 240)
  }

  const jumpTableToStart = () => {
    const container = tableViewportRef.current
    if (!container) return
    previousTableScrollTopRef.current = container.scrollTop
    setLastTableScrollPosition(container.scrollTop)
    scrollTableTo(0)
  }

  const jumpTableToEnd = () => {
    const container = tableViewportRef.current
    if (!container) return
    previousTableScrollTopRef.current = container.scrollTop
    setLastTableScrollPosition(container.scrollTop)
    scrollTableTo(container.scrollHeight)
  }

  const jumpTableToPrevious = () => {
    const container = tableViewportRef.current
    const savedTop = previousTableScrollTopRef.current
    if (!container || !Number.isFinite(Number(savedTop))) return
    suppressTableScrollTrackingRef.current = true
    container.scrollTo({ top: Number(savedTop), behavior: 'smooth' })
    window.setTimeout(() => {
      suppressTableScrollTrackingRef.current = false
    }, 240)
  }

  const triggerLoadStatement = () => {
    fileInputRef.current?.click()
  }

  const toggleMovementSelection = (movementId) => {
    setSelectedIds((prev) => (prev.includes(movementId) ? prev.filter((id) => id !== movementId) : [...prev, movementId]))
  }

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const set = new Set(prev)
      if (allVisibleSelected) {
        visibleSelectableIds.forEach((id) => set.delete(id))
      } else {
        visibleSelectableIds.forEach((id) => set.add(id))
      }
      return Array.from(set)
    })
  }

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      direction: 'all',
      confidence: 'all',
      kind: 'all',
      ivaCassa: false,
      withholding: false,
      f24: false,
      giroconti: false,
      onlyReady: false,
      onlyBlocked: false,
      onlyWithoutMatch: false,
    })
    setActionNote('Filtri puliti')
  }

  const resetDemoSessionState = (nextNote = 'Demo ripristinata') => {
    setBankStatement(null)
    setMode('demo')
    setActionNote(nextNote)
    setSelectedIds(buildMockSelectableIds(RICONCILIAZIONE_MOCK_DATA.movements.slice(0, 3)))
    setSelectedId(RICONCILIAZIONE_MOCK_DATA.movements[0]?.id)
    setReviewStateById({})
    setDocumentPreviewUrl('')
    setDocumentPreviewPage(1)
    setDocumentPreviewZoom('fit')
    setDocumentModalOpen(false)
    setDetailCollapsed(false)
    setAdvancedFiltersOpen(false)
    setFilters({ ...DEFAULT_RECONCILIATION_FILTERS })
    setSummaryCollapsed({ ...DEFAULT_RECONCILIATION_SUMMARY_COLLAPSED })
    setReconciliationContext(MOCK_STORAGE_CONTEXT)
  }

  const restoreDemoData = () => {
    if (stagingStatus.hasStoredDraft && !window.confirm('Ripristinare la demo? Lo staging locale resterà disponibile.')) {
      return
    }
    resetDemoSessionState('Demo ripristinata')
    setStagingStatus((prev) => ({
      ...prev,
      notice: 'Demo attiva',
      warning: '',
    }))
  }

  const clearStoredDraft = () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const storageKey = getActiveReconciliationDraftKey() || reconciliationStorageKey
    const removal = removeReconciliationDraft(storageKey)
    if (!removal.ok) {
      setStagingStatus((prev) => ({
        ...prev,
        warning: 'Impossibile cancellare lo staging locale. Evita refresh prima di completare.',
      }))
      return removal
    }
    resetDemoSessionState('Staging cancellato')
    setStagingStatus({
      lastSavedAt: '',
      notice: 'Staging cancellato',
      warning: '',
      hasStoredDraft: false,
    })
    setActionNote('Staging locale cancellato')
    return removal
  }

  const cancelImport = () => {
    if (!window.confirm('Annullare l import e cancellare lo staging locale?')) return
    const removal = clearStoredDraft()
    if (!removal?.ok) return
    setActionNote('Import annullato e staging locale cancellato')
  }

  const handleClearStaging = () => {
    if (!window.confirm('Cancellare lo staging locale salvato?')) return
    const removal = clearStoredDraft()
    if (!removal?.ok) return
    setActionNote('Staging locale cancellato')
  }

  const autoMatch = () => {
    setActionNote(`Mock: auto-match rieseguito su ${filteredMovements.length} movimenti filtrati`)
  }

  const rianalizzaSelected = () => {
    setActionNote(`Mock: rianalisi avviata su ${selectedIds.length} selezionati`)
  }

  const confirmSelected = () => {
    if (!confirmableSelectedCount) return
    if (!statementAllowsConfirm) {
      setActionNote(bankStatement?.confirmationBlockedReason || 'Audit non quadrato: conferma bloccata')
      return
    }
    setActionNote(`Mock: conferma simulata su ${confirmableSelectedCount} movimenti pronti`)
  }

  const handleStatementFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if ((bankStatement || stagingStatus.hasStoredDraft) && !window.confirm('Esiste uno staging salvato. Il nuovo file lo sostituirà. Continuare?')) {
      return
    }

    const activeStorageKey = getActiveReconciliationDraftKey() || reconciliationStorageKey
    const removal = removeReconciliationDraft(activeStorageKey)
    if (activeStorageKey !== reconciliationStorageKey) {
      removeReconciliationDraft(reconciliationStorageKey)
    }
    setPipelineTrace([])
    setBankStatement(null)
    setReviewStateById({})
    setSelectedIds([])
    setSelectedId(null)
    appendPipelineTrace('file_selected', {
      fileName: file.name,
      fileType: file.type || 'unknown',
      storageKey: reconciliationStorageKey,
      removedPreviousDraft: Boolean(removal?.ok),
    })

    let importDraft
    try {
      importDraft = await buildBankStatementImportDraft(file, {
        companyId: reconciliationContext.societaId || MOCK_STORAGE_CONTEXT.societaId,
        bankAccountId: reconciliationContext.bankAccountId || MOCK_STORAGE_CONTEXT.bankAccountId,
        bankName: RICONCILIAZIONE_MOCK_DATA.bankName,
        iban: RICONCILIAZIONE_MOCK_DATA.iban,
        accountCode: RICONCILIAZIONE_MOCK_DATA.bankAccountCode,
        periodStart: '2025-12-01',
        periodEnd: '2025-12-31',
        openingBalance: RICONCILIAZIONE_MOCK_DATA.saldoIniziale,
        closingBalance: RICONCILIAZIONE_MOCK_DATA.saldoFinaleEstratto,
        balanceDifference: RICONCILIAZIONE_MOCK_DATA.saldoDifference,
        currency: 'EUR',
        importedBy: 'Operatore demo',
      })
    } catch (error) {
      const failedStatement = {
        sourceFileName: file.name || '',
        sourceFileType: file.type || 'unknown',
        sourceFileSize: Number(file.size || 0),
        sourceFileHash: buildImportIdentifier({ file, importDraft: null }),
        profile: 'unknown',
        profileLabel: 'Sconosciuto',
        parseStatus: 'failed',
        parseReliabilityLevel: 'blocked',
        movements: [],
        parsedMovements: 0,
        rejectedRows: 0,
        ignoredRows: 0,
        auditReviewRows: 0,
        audit: {
          totalIn: 0,
          totalOut: 0,
          calculatedClosingBalance: null,
          differences: { balance: null },
        },
      }
      const failedGuidedImportAudit = createGuidedImportAuditFromStatement({
        statement: failedStatement,
        importId: failedStatement.sourceFileHash,
        sourceFileName: failedStatement.sourceFileName,
        profileCandidate: failedStatement.profile,
        operatorId: 'operatore_demo',
      })

      const failedDraft = {
        ...failedStatement,
        guidedImportAudit: failedGuidedImportAudit,
        guidedImportAuditSummary: failedGuidedImportAudit.summary,
        guidedImportAuditEvents: failedGuidedImportAudit.events,
      }

      appendPipelineTrace('parser_error', {
        fileName: file.name,
        error: error?.message || 'parse_failed',
      })
      setBankStatement(failedDraft)
      setMode('import_failed')
      setSelectedIds([])
      setSelectedId(null)
      setReviewStateById({})
      setDocumentPreviewPage(1)
      setDocumentPreviewZoom('fit')
      setActionNote(`Import fallito: ${file.name}. ${error?.message || 'Errore in parsing file'}`)
      return
    }

    const importId = buildImportIdentifier({ file, importDraft })
    const guidedImportAudit = createGuidedImportAuditFromStatement({
      statement: importDraft,
      importId,
      sourceFileName: importDraft.sourceFileName || file.name || '',
      profileCandidate: importDraft.profile || '',
      operatorId: 'operatore_demo',
    })

    const importDraftWithGuidedAudit = {
      ...importDraft,
      guidedImportAudit,
      guidedImportAuditSummary: guidedImportAudit.summary,
      guidedImportAuditEvents: guidedImportAudit.events,
    }

    appendPipelineTrace('parser_result', {
      profile: importDraftWithGuidedAudit.profileLabel || importDraftWithGuidedAudit.profile || '-',
      movements: importDraftWithGuidedAudit.movements?.length || 0,
      parseStatus: importDraftWithGuidedAudit.parseStatus || '-',
      reliability: importDraftWithGuidedAudit.parseReliabilityLevel || '-',
      guidedImportEvents: guidedImportAudit.events.length,
    })

    // Template match su nuovo import: cerca regola locale compatibile
    const newImportTplMatch = matchGuidedImportTemplate(importDraftWithGuidedAudit)
    const finalImportStatement = newImportTplMatch.matched
      ? applyGuidedImportTemplateToStatement(importDraftWithGuidedAudit, newImportTplMatch)
      : importDraftWithGuidedAudit

    setBankStatement(finalImportStatement)
    setMode(
      importDraftWithGuidedAudit.parseStatus === 'needs_ocr'
        ? 'needs_ocr'
      : importDraftWithGuidedAudit.movements.length
          ? 'imported_file'
          : 'import_failed'
    )
    setReconciliationContext({
      societaId: importDraftWithGuidedAudit.companyId || reconciliationContext.societaId || MOCK_STORAGE_CONTEXT.societaId,
      bankAccountId: importDraftWithGuidedAudit.bankAccountId || reconciliationContext.bankAccountId || MOCK_STORAGE_CONTEXT.bankAccountId,
      period: importDraftWithGuidedAudit.pdfSummary?.periodLabel || importDraftWithGuidedAudit.period || `${importDraftWithGuidedAudit.periodStart || ''} - ${importDraftWithGuidedAudit.periodEnd || ''}` || reconciliationContext.period || MOCK_STORAGE_CONTEXT.period,
    })
    setSelectedIds(buildMockSelectableIds(importDraftWithGuidedAudit.movements.slice(0, 3)))
    setSelectedId(importDraftWithGuidedAudit.movements[0]?.id || null)
    setReviewStateById({})
    setDocumentPreviewPage(1)
    setDocumentPreviewZoom('fit')
    setActionNote(
      importDraftWithGuidedAudit.movements.length
        ? `File caricato: ${file.name} con ${importDraftWithGuidedAudit.movements.length} movimenti estratti | audit ${importDraftWithGuidedAudit.parseStatus}`
        : `File caricato: ${file.name}. ${importDraftWithGuidedAudit.warnings?.[0] || 'Da elaborare con OCR/AI o mapping manuale'}`
    )
    appendPipelineTrace('state_committed', {
      mode: importDraftWithGuidedAudit.parseStatus === 'needs_ocr' ? 'needs_ocr' : importDraftWithGuidedAudit.movements.length ? 'imported_file' : 'import_failed',
      tableRowsCount: importDraftWithGuidedAudit.movements?.length || 0,
      activeRowsSource: importDraftWithGuidedAudit.movements?.length ? 'imported' : 'demo',
    })
  }

  useEffect(() => {
    if (!hydratedStorageRef.current) return
    if (mode === 'demo' && !bankStatement) return

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      const snapshot = buildReconciliationDraftSnapshot({
        mode,
        bankStatement,
        selectedId,
        selectedIds,
        filters,
        summaryCollapsed,
        advancedFiltersOpen,
        detailCollapsed,
        documentPreviewPage,
        documentPreviewZoom,
        reviewStateById,
        documentModalOpen,
        actionNote,
        reconciliationContext,
        selectedMovementIds: selectedIds,
      })
      const result = saveReconciliationDraft(reconciliationStorageKey, snapshot)
      if (result.ok) {
        appendPipelineTrace('storage_saved', {
          storageKey: reconciliationStorageKey,
          savedAt: result.updatedAt,
          ok: true,
        })
        setStagingStatus({
          lastSavedAt: formatShortTimestamp(result.updatedAt),
          notice: 'Staging salvato',
          warning: '',
          hasStoredDraft: true,
        })
        return
      }

      setStagingStatus((prev) => ({
        ...prev,
        warning: 'Impossibile salvare localmente lo staging. Evita refresh prima di completare.',
      }))
      appendPipelineTrace('storage_save_failed', {
        storageKey: reconciliationStorageKey,
        ok: false,
      })
    }, 250)

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [
    actionNote,
    advancedFiltersOpen,
    bankStatement,
    detailCollapsed,
    documentModalOpen,
    documentPreviewPage,
    documentPreviewZoom,
    filters,
    mode,
    reconciliationContext,
    reconciliationStorageKey,
    reviewStateById,
    selectedId,
    selectedIds,
    summaryCollapsed,
  ])

  return (
    <div style={{ display: 'grid', gap: '.28rem', color: '#eef6ff' }}>
      <RiconciliazioneHeader
        companyName={RICONCILIAZIONE_MOCK_DATA.company}
        bankName={bankStatement?.bankName || RICONCILIAZIONE_MOCK_DATA.bankName}
        iban={bankStatement?.iban || RICONCILIAZIONE_MOCK_DATA.iban}
        period={activeStatementPeriod}
        selectedCount={selectedIds.length}
        canConfirm={confirmableSelectedCount > 0 && statementAllowsConfirm}
        confirmBlockReason={confirmBlockReason}
        onLoadStatement={triggerLoadStatement}
        onAutoMatch={autoMatch}
        onRianalizzaSelected={rianalizzaSelected}
        onConfirmSelected={confirmSelected}
        actionNote={actionNote}
        onRestoreDemo={restoreDemoData}
        onCancelImport={cancelImport}
        onClearStaging={handleClearStaging}
        stagingBadge={bankStatement ? 'Staging salvato' : stagingStatus.hasStoredDraft ? 'Staging locale presente' : ''}
        stagingSavedAt={stagingStatus.lastSavedAt}
        stagingNotice={stagingStatus.notice}
        stagingWarning={stagingStatus.warning}
      />

      <RiconciliazioneKpiStrip kpis={filteredKpis} />

      <RiconciliazioneSummaryCards
        data={summaryData}
        collapsed={summaryCollapsed}
        onToggle={(title) => setSummaryCollapsed((prev) => ({ ...prev, [title]: !prev[title] }))}
      />

      {!bankStatement ? (
        <div className="card" style={{ padding: '.45rem .55rem', borderRadius: 14, background: 'rgba(8, 18, 31, 0.92)', border: '1px solid rgba(157, 185, 213, 0.16)', display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.74rem', fontWeight: 800, color: '#9fd0ff' }}>Guida FiscoSim demo</div>
            <div style={{ fontSize: '.62rem', color: 'rgba(211, 224, 238, 0.82)' }}>Demo - non modifica lo staging reale</div>
          </div>
          <button className="btn-sec" type="button" onClick={() => setGuidedDemoOpen(true)} style={{ minHeight: 24, fontSize: '.64rem' }}>
            Apri demo Guida FiscoSim
          </button>
        </div>
      ) : null}

      {bankStatement ? (
        <RiconciliazioneAuditBanner
          bankStatement={bankStatement}
          statementAudit={statementAudit}
          movementAmountAudit={movementAmountAudit}
          guidedImportAudit={guidedImportAudit}
          guidedImportAuditSummary={guidedImportAuditSummary}
          guidedImportAuditEvents={guidedImportAuditEvents}
          deltaDiagnostics={deltaDiagnostics}
          selectedAccountMeta={selectedAccountMeta}
          auditReviewPreview={auditReviewPreview}
          auditTopSuspects={auditTopSuspects}
          ignoredSummaryLabel={ignoredSummaryLabel}
          reviewStats={reviewStats}
          formatDeltaItem={formatDeltaItem}
          formatRawSnippet={formatRawSnippet}
          pipelineTrace={pipelineTrace}
          onOpenGuidedImportDemo={() => setGuidedDemoOpen(true)}
        />
      ) : null}

      {/* ─── Template match badge ─── */}
      {bankStatement?.guidedTemplateMatch ? (() => {
        const tpl = bankStatement.guidedTemplateMatch
        const isCertified = tpl.certificationMode === 'certified_balanced'
        const scoreColor = tpl.scoreLevel === 'high' ? '#8ee7b6' : '#ffd38c'
        return (
          <div className="card" style={{ padding: '.42rem .55rem', borderRadius: 13, background: 'rgba(8, 18, 31, 0.88)', border: `1px solid ${isCertified ? 'rgba(142,231,182,0.28)' : 'rgba(255,211,140,0.28)'}`, display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: scoreColor }}>
                Regola import trovata: {tpl.templateLabel}
              </div>
              <div style={{ fontSize: '.6rem', color: 'rgba(211, 224, 238, 0.82)', marginTop: '.04rem' }}>
                Score {tpl.scoreLevel} ({tpl.score}) · {tpl.certificationMode} · Affidabilità {tpl.reliability} · Usata {tpl.usageCount || 1} volte
                {tpl.reasons?.length ? ` · Match: ${tpl.reasons.join(', ')}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              <button
                className="btn-sec"
                type="button"
                onClick={() => {
                  const fullTemplateMatch = matchGuidedImportTemplate(bankStatement)
                  setGuidedFlowTemplateMatch(fullTemplateMatch?.matched ? fullTemplateMatch : null)
                  setBankStatement((prev) => {
                    if (!prev?.guidedTemplateMatch) return prev
                    return {
                      ...prev,
                      guidedTemplateMatch: {
                        ...prev.guidedTemplateMatch,
                        usageCount: (prev.guidedTemplateMatch.usageCount || 1) + 1,
                        lastUsedAt: new Date().toISOString(),
                      },
                    }
                  })
                  setGuidedFlowOpen(true)
                }}
                style={{ minHeight: 22, fontSize: '.62rem', borderColor: 'rgba(142,231,182,0.38)', color: '#8ee7b6' }}
              >
                Apri Guida con template
              </button>
            </div>
          </div>
        )
      })() : null}

        {bankStatement ? (() => {
          const guidedAvailability = getGuidedImportAvailability(bankStatement)
          if (!guidedAvailability) return null
          const isPrimary = guidedAvailability === 'primary'
          return (
            <div className="card" style={{ padding: '.44rem .55rem', borderRadius: 14, background: isPrimary ? 'rgba(255, 195, 80, 0.07)' : 'rgba(8, 18, 31, 0.85)', border: isPrimary ? '1px solid rgba(255, 211, 140, 0.32)' : '1px solid rgba(157, 185, 213, 0.16)', display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '.74rem', fontWeight: 800, color: isPrimary ? '#ffd38c' : '#9fd0ff' }}>Guida FiscoSim{isPrimary ? ' — import non certificato' : ' — verifica mapping'}</div>
                <div style={{ fontSize: '.62rem', color: 'rgba(211, 224, 238, 0.82)' }}>Lavora sullo staging corrente · non modifica movimenti senza conferma</div>
              </div>
              <button
                className="btn-sec"
                type="button"
                onClick={() => { setGuidedFlowTemplateMatch(null); setGuidedFlowOpen(true) }}
                style={{ minHeight: 24, fontSize: '.64rem', borderColor: isPrimary ? 'rgba(255, 211, 140, 0.45)' : undefined, color: isPrimary ? '#ffd38c' : undefined }}
              >
                Guida FiscoSim
              </button>
            </div>
          )
        })() : null}

      <RiconciliazioneFilters
        filters={filters}
        onChange={updateFilters}
        advancedOpen={advancedFiltersOpen}
        onToggleAdvanced={() => setAdvancedFiltersOpen((prev) => !prev)}
        onClearFilters={clearFilters}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: effectiveDetailCollapsed ? 'minmax(0, 1fr) 60px' : 'minmax(0, 1fr) 320px',
          gap: '.65rem',
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0, display: 'grid', gap: '.5rem' }}>
          <div className="card" style={{ padding: '.32rem .55rem', borderRadius: 14, background: 'rgba(8, 18, 31, 0.92)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#eef6ff', fontSize: '.78rem' }}>Working table movimenti</div>
                <div style={{ fontSize: '.62rem', color: 'rgba(211, 224, 238, 0.78)' }}>
                  Tabella dominante con {hasImportedStatement ? (filteredMovements.length || 0) : RICONCILIAZIONE_MOCK_DATA.movements.length} movimenti e priorita operativa
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '.64rem', color: 'rgba(223, 236, 248, 0.82)' }}>
                  Saldo calcolato:{' '}
                  <strong style={{ color: '#8ee7b6' }}>
                    {hasImportedStatement ? (statementAudit?.calculatedClosingBalance == null ? '—' : fmtCurrency(statementAudit.calculatedClosingBalance)) : fmtCurrency(RICONCILIAZIONE_MOCK_DATA.saldoCalcolato)}
                  </strong>
                </div>
                <RiconciliazioneTableJumpControls
                  onJumpStart={jumpTableToStart}
                  onJumpPrevious={jumpTableToPrevious}
                  onJumpEnd={jumpTableToEnd}
                  canJumpPrevious={lastTableScrollPosition != null}
                />
              </div>
            </div>
          </div>

          <div
            ref={tableViewportRef}
            onScroll={syncTableScrollPosition}
            style={{
              minHeight: 500,
              maxHeight: 'calc(100vh - 390px)',
              overflowY: 'auto',
              borderRadius: 18,
              scrollBehavior: 'smooth',
            }}
          >
            <RiconciliazioneWorkingTable
              movements={filteredMovements}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectRow={setSelectedId}
              onToggleMovement={toggleMovementSelection}
              onToggleAllVisible={toggleAllVisible}
              allVisibleSelected={allVisibleSelected}
              someVisibleSelected={someVisibleSelected}
              onClearFilters={clearFilters}
              footer={footer}
              hasImportedStatement={hasImportedStatement}
              importParseStatus={activeParseStatus}
              importStatementStatus={activeStatementStatus}
              onRestoreDemo={restoreDemoData}
              onLoadStatement={triggerLoadStatement}
              sourceFileName={activeSourceFileName}
              sourceFileType={activeSourceFileType}
            />
          </div>
        </div>

        <RiconciliazioneDetailPanel
          movement={hasImportedStatement && !filteredMovements.length ? null : selectedMovement}
          collapsed={effectiveDetailCollapsed}
          onToggleCollapsed={() => setDetailCollapsed((prev) => !prev)}
          bankStatement={bankStatement}
          workingContext={workingContext}
          preview={documentPreviewState}
          reviewItems={reviewItems}
          reviewStats={reviewStats}
          onPreviewPageChange={setDocumentPreviewPage}
          onPreviewZoomChange={setDocumentPreviewZoom}
          onMarkVerified={(item) => updateReviewState(item, 'verified')}
          onMarkIgnored={(item) => updateReviewState(item, 'ignored_as_non_movement')}
          onMarkManualMapping={(item) => updateReviewState(item, 'needs_manual_mapping')}
          onOpenDocument={handleOpenReviewDocument}
          onSelectMovement={handleSelectReviewMovement}
          onOpenDocumentModal={handleOpenDocumentModal}
          onApplyCorrection={applyMovementCorrection}
          onRestoreOriginalMovement={(item) =>
            item?.correctionBaseline
              ? applyMovementCorrection({
                  movementId: item.id,
                  changes: {
                    amount: item.correctionBaseline.amount,
                    direction: item.correctionBaseline.direction,
                    operationDate: item.correctionBaseline.operationDate,
                    valueDate: item.correctionBaseline.valueDate,
                    descriptionRaw: item.correctionBaseline.descriptionRaw,
                    counterpartyName: item.correctionBaseline.counterpartyName,
                  },
                  reason: 'Ripristino valore originale',
                  reviewStatus: 'verified',
                })
              : { ok: false, error: 'missing_baseline' }
          }
        />
      </div>

      <RiconciliazioneDocumentModal
        open={documentModalOpen}
        preview={documentPreviewState}
        onClose={handleCloseDocumentModal}
        onPrevPage={() => setDocumentPreviewPage((prev) => Math.max(1, Number(prev || 1) - 1))}
        onNextPage={() => setDocumentPreviewPage((prev) => Number(prev || 1) + 1)}
        onZoomOut={() => setDocumentPreviewZoom((prev) => (prev === 'fit' ? 0.9 : Math.max(0.75, Number(prev || 1) - 0.1)))}
        onZoomIn={() => setDocumentPreviewZoom((prev) => (prev === 'fit' ? 1.1 : Math.min(2, Number(prev || 1) + 0.1)))}
        onFitWidth={() => setDocumentPreviewZoom('fit')}
        onResetZoom={() => setDocumentPreviewZoom(1)}
      />

      <RiconciliazioneGuidedImportDemo
        open={guidedDemoOpen}
        onClose={() => setGuidedDemoOpen(false)}
      />

        <RiconciliazioneGuidedImportFlow
          open={guidedFlowOpen}
          onClose={() => { setGuidedFlowOpen(false); setGuidedFlowTemplateMatch(null) }}
          bankStatement={bankStatement}
          onUpdateStatement={setBankStatement}
          templateMatch={guidedFlowTemplateMatch}
        />

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xls,.xlsx"
        hidden
        onChange={handleStatementFile}
      />
    </div>
  )
}
