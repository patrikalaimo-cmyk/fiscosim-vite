const REVIEW_STATUS_LABELS = {
  pending_review: 'Da verificare',
  verified: 'Verificata',
  corrected: 'Corretto',
  ignored_as_non_movement: 'Non movimento',
  needs_manual_mapping: 'Mapping manuale',
}

function deriveReviewSeverity(item = {}) {
  const reason = String(item.reason || '').toLowerCase()
  if (/blocked|mismatch|unknown_unparsed|missing_amount|missing_date|unresolved|delta|direction/i.test(reason)) {
    return 'red'
  }
  if (/probable|review|ambiguous|candidate|near_amount|raw_amount/i.test(reason)) {
    return 'amber'
  }
  return 'green'
}

function getBankStatementSource(bankStatement) {
  if (!bankStatement) return null
  const sourceFile = bankStatement.sourceFile || null
  const sourceFileType = String(bankStatement.sourceFileType || '').toLowerCase()
  const mimeType = String(sourceFile?.type || '').toLowerCase()
  const kind = mimeType.startsWith('image/')
    ? 'image'
    : sourceFileType.startsWith('image')
      ? 'image'
      : 'pdf'
  return {
    kind,
    file: sourceFile,
    fileName: bankStatement.sourceFileName || sourceFile?.name || '',
    sourceFileType: bankStatement.sourceFileType || mimeType || 'unknown',
  }
}

export function buildDocumentPreviewState({ bankStatement, selectedMovement, previewUrl, previewPage, zoom }) {
  const source = getBankStatementSource(bankStatement)
  const pageFromMovement = Number(
    selectedMovement?.sourceMeta?.pageNumber ||
    selectedMovement?.pageNumber ||
    selectedMovement?.detail?.audit?.pageNumber ||
    0
  )

  return {
    kind: source?.kind || 'pdf',
    url: previewUrl || '',
    fileName: source?.fileName || '',
    sourceFileType: source?.sourceFileType || 'unknown',
    page: Number(previewPage || pageFromMovement || 1) || 1,
    pageHint: pageFromMovement || 0,
    zoom: zoom || 'fit',
    rawText: selectedMovement?.sourceMeta?.rawText || selectedMovement?.detail?.audit?.rawText || '',
    movementId: selectedMovement?.id || '',
    rawRowId: selectedMovement?.sourceMeta?.rawRowId ?? '',
    confidence: Number(selectedMovement?.confidence || selectedMovement?.parseConfidence || 0),
    reviewLabel: selectedMovement?.reviewLabel || selectedMovement?.reviewStatus || 'Da verificare',
  }
}

export function buildReviewWorkItems(bankStatement, reviewStateById = {}) {
  const deltaDiagnostics = bankStatement?.deltaDiagnostics || bankStatement?.audit?.deltaDiagnostics || {}
  const movementAmountAudit = deltaDiagnostics?.movementAmountAudit || bankStatement?.audit?.movementAmountAudit || {}
  const isBalancedCertified =
    bankStatement?.parseStatus === 'parsed_balanced' &&
    bankStatement?.parseReliabilityLevel === 'certified_balanced'
  const hasNoDocumentIssues = Boolean(
    isBalancedCertified &&
    Math.abs(Number(bankStatement?.audit?.differences?.balance || 0)) <= 0.01
  )

  const sourceItems = [
    ...(deltaDiagnostics?.reviewItems || []),
    ...(deltaDiagnostics?.topSuspects910 || []),
    ...(movementAmountAudit?.possibleWrongAmountMovements || []),
    ...(movementAmountAudit?.possibleWrongDirectionMovements || []),
    ...(movementAmountAudit?.possibleExcludedOutMovements || []),
    ...(movementAmountAudit?.rawAmountPool || []),
    ...(deltaDiagnostics?.rawRowsWithAmountButNoMovement || []),
  ]

  const seen = new Set()
  const items = []

  sourceItems.forEach((item) => {
    if (!item) return
    const reviewKey = String(item.movementId || item.rawRowId || `${item.pageNumber || ''}-${item.reason || ''}-${item.rawText || ''}`)
    const dedupeKey = `${reviewKey}|${item.pageNumber || 0}|${item.reason || ''}|${String(item.rawText || '').slice(0, 80)}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    const reviewState = reviewStateById[reviewKey] || null
    const currentStatus = reviewState?.status || item.reviewStatus || 'pending_review'
    if (hasNoDocumentIssues && !reviewState && currentStatus === 'pending_review') {
      return
    }
    items.push({
      ...item,
      reviewKey,
      currentStatus,
      reviewLabel: REVIEW_STATUS_LABELS[currentStatus] || REVIEW_STATUS_LABELS.pending_review,
      severity: reviewState?.severity || item.severity || deriveReviewSeverity(item),
      linkedMovementId: item.movementId || '',
      movementId: item.movementId || '',
      correction: reviewState?.correction || null,
      rawRowId: item.rawRowId ?? '',
      pageNumber: item.pageNumber || 0,
      amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : item.amount ?? null,
    })
  })

  return items
}

export function buildReviewStats(reviewItems = []) {
  return reviewItems.reduce(
    (acc, item) => {
      acc.total += 1
      if (item.currentStatus === 'verified') acc.verified += 1
      else if (item.currentStatus === 'corrected') acc.corrected += 1
      else if (item.currentStatus === 'ignored_as_non_movement') acc.ignored += 1
      else if (item.currentStatus === 'needs_manual_mapping') acc.manual += 1
      else acc.pending += 1
      return acc
    },
    { total: 0, pending: 0, verified: 0, corrected: 0, ignored: 0, manual: 0 }
  )
}

export function reviewStatusTone(status = '') {
  if (status === 'verified' || status === 'corrected') return 'green'
  if (status === 'ignored_as_non_movement') return 'blue'
  if (status === 'needs_manual_mapping') return 'amber'
  return 'red'
}
