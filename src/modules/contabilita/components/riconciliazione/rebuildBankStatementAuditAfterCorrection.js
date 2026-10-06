function roundToCents(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100) / 100
}

function formatReasonList(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

export function rebuildBankStatementAuditAfterCorrection(bankStatement = {}, opts = {}) {
  const movements = Array.isArray(bankStatement.movements) ? bankStatement.movements : []
  const summary = bankStatement.pdfSummary || {}
  const totalEntrate = movements.reduce((sum, movement) => sum + (movement.direction === 'in' ? Number(movement.amount || 0) : 0), 0)
  const totalUscite = movements.reduce((sum, movement) => sum + (movement.direction === 'out' ? Number(movement.amount || 0) : 0), 0)
  const calculatedClosingBalance = summary.openingBalance == null
    ? null
    : roundToCents(Number(summary.openingBalance) + totalEntrate - totalUscite)
  const entriesDiff = summary.entriesTotal == null ? null : roundToCents(totalEntrate - summary.entriesTotal)
  const exitsDiff = summary.exitsTotal == null ? null : roundToCents(totalUscite - summary.exitsTotal)
  const balanceDiff = summary.closingBalance == null || calculatedClosingBalance == null
    ? null
    : roundToCents(calculatedClosingBalance - summary.closingBalance)
  const reviewStats = opts.reviewStats || { total: 0, pending: 0, verified: 0, corrected: 0, ignored: 0, manual: 0 }
  const hasMismatch = Boolean(bankStatement.accountMismatchWarning)
  const hasOfficialSummary =
    summary.openingBalance != null &&
    summary.entriesTotal != null &&
    summary.exitsTotal != null &&
    summary.closingBalance != null
  const parsedHasCompleteMovements = Boolean(
    movements.length &&
    movements.every((movement) =>
      movement.operationDate &&
      Number.isFinite(Number(movement.amount)) &&
      Number(movement.amount) > 0 &&
      (movement.direction === 'in' || movement.direction === 'out') &&
      String(movement.descriptionRaw || '').trim()
    )
  )
  const hasPendingReview = Number(reviewStats.pending || 0) > 0
  const hasReviewResidue = hasPendingReview || Number(reviewStats.manual || 0) > 0
  const hasRelevantUnknown = Boolean(bankStatement.deltaDiagnostics?.reviewItems?.length)
  const hasDuplicateSuspicious = movements.some((movement) => movement.duplicateStatus && movement.duplicateStatus !== 'unique')
  const meetsHighConfidence = !hasOfficialSummary &&
    parsedHasCompleteMovements &&
    !hasRelevantUnknown &&
    !hasDuplicateSuspicious &&
    !hasReviewResidue
  const balanced = hasOfficialSummary && entriesDiff === 0 && exitsDiff === 0 && balanceDiff === 0
  const parseStatus = !movements.length
    ? 'failed_parse'
    : balanced
      ? 'parsed_balanced'
      : hasOfficialSummary
        ? 'parsed_unbalanced'
        : 'parsed_with_review'
  const parseReliabilityLevel = balanced && !hasMismatch && !hasReviewResidue
    ? 'certified_balanced'
    : balanced
      ? 'blocked'
      : meetsHighConfidence
        ? 'high_confidence'
        : hasReviewResidue || hasRelevantUnknown || hasDuplicateSuspicious
          ? 'blocked'
          : movements.length
            ? 'needs_review'
            : 'blocked'
  const blockingReasons = []

  if (!movements.length) blockingReasons.push('nessun_movimento_valido')
  if (hasOfficialSummary && entriesDiff !== 0) blockingReasons.push('entrate_non_quadrano')
  if (hasOfficialSummary && exitsDiff !== 0) blockingReasons.push('uscite_non_quadrano')
  if (hasOfficialSummary && balanceDiff !== 0) blockingReasons.push('saldo_finale_non_quadra')
  if (hasMismatch) blockingReasons.push('conto_documento_non_coincidente')
  if (hasReviewResidue) blockingReasons.push('righe_da_verificare_presenti')

  const confirmationBlockedReason = parseReliabilityLevel === 'certified_balanced'
    ? ''
    : formatReasonList(blockingReasons).length
      ? `Audit non quadrato: ${formatReasonList(blockingReasons).join(', ')}`
      : 'Audit non quadrato'

  const audit = {
    ...(bankStatement.audit || {}),
    totalEntrate,
    totalUscite,
    calculatedClosingBalance,
    differences: {
      entries: entriesDiff,
      exits: exitsDiff,
      balance: balanceDiff,
    },
    parseStatus,
    parseReliabilityLevel,
    status: parseReliabilityLevel === 'certified_balanced' ? 'parsed' : parseReliabilityLevel === 'blocked' ? 'blocked' : 'needs_review',
    parseConfidence: parseReliabilityLevel === 'certified_balanced' ? 96 : balanced ? 72 : 18,
    blockingReasons: formatReasonList(blockingReasons),
    confirmationBlockedReason,
  }

  return {
    ...bankStatement,
    totalEntrate,
    totalUscite,
    calculatedClosingBalance,
    balanceDifference: balanceDiff,
    parseStatus,
    parseReliabilityLevel,
    status: audit.status,
    audit,
    confirmationBlockedReason,
    auditReviewRows: reviewStats.pending || 0,
    blockedRows: bankStatement.blockedRows || 0,
    needsReviewRows: bankStatement.needsReviewRows || 0,
    correctionSummary: {
      total: Number(reviewStats.total || 0),
      corrected: Number(reviewStats.corrected || 0),
      pending: Number(reviewStats.pending || 0),
    },
    deltaDiagnostics: balanced
      ? {
          ...(bankStatement.deltaDiagnostics || {}),
          residualDeltaAfterDirectionFix: { balance: 0, entries: 0, exits: 0, fixAmount: 0, itemCount: 0 },
          residualDeltaAfterDirectionFix910: 0,
          deltaResidual: 0,
          delta910: {
            residual: 0,
            exactAmountMatches910: [],
            combinationMatches910: [],
            candidateMissingOutflows: [],
            candidateMissingInflows: [],
            rawRowsWithAmountButNoMovement: [],
            suspiciousAmountsNearDelta: [],
          },
          movementAmountAudit: {
            ...(bankStatement.deltaDiagnostics?.movementAmountAudit || {}),
            exactAmount910Rows: [],
            nearAmount910Rows: [],
            possibleWrongAmountMovements: [],
            possibleWrongDirectionMovements: [],
            possibleExcludedOutMovements: [],
            possibleMultipleAmountRows: [],
            suspiciousAmountsNearDelta: [],
            rawAmountPool: [],
            combinationCandidates910: [],
            topSuspects910: [],
          },
          topSuspects910: [],
          reviewItems: [],
          candidateMissingOutflows: [],
          candidateMissingInflows: [],
          rawRowsWithAmountButNoMovement: [],
          suspiciousRawAmounts: [],
          exactAmountMatches910: [],
          combinationMatches910: [],
          suspectItems: [],
          reviewRowsPreview: [],
        }
      : bankStatement.deltaDiagnostics || null,
  }
}
