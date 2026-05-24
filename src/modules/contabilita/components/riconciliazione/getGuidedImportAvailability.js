/**
 * getGuidedImportAvailability
 *
 * Determina se e con quale priorità mostrare il pulsante "Guida FiscoSim" reale.
 *
 * - 'primary'  → pulsante prominente; import non certificato/bassa confidenza.
 * - 'secondary' → pulsante secondario; import già perfetto ma operatore può comunque usarla.
 * - false       → import non presente o non processato, non mostrare.
 */

const LOW_CONFIDENCE_STATUSES = new Set([
  'parsed_with_review',
  'parsed_unbalanced',
  'needs_review',
  'failed_parse',
  'failed',
  'needs_ocr',
  'blocked',
  'unknown',
])

const NON_CERTIFIED_LEVELS = new Set([
  'high_confidence',
  'needs_review',
  'needs_ocr',
  'blocked',
])

export function getGuidedImportAvailability(bankStatement) {
  if (!bankStatement) return false

  const movements = bankStatement.movements
  const hasMovements = Array.isArray(movements) && movements.length > 0

  const parseStatus = String(bankStatement.parseStatus || '').toLowerCase()
  const parseReliabilityLevel = String(bankStatement.parseReliabilityLevel || '').toLowerCase()
  const auditSummary = bankStatement.guidedImportAudit?.summary || bankStatement.guidedImportAuditSummary || null
  const blockers = Array.isArray(auditSummary?.blockers) ? auditSummary.blockers : []
  const warnings = Array.isArray(auditSummary?.warnings) ? auditSummary.warnings : []
  const templateDecision = auditSummary?.templateDecision || bankStatement.guidedImportAudit?.templateDecision || ''
  const finalDecision = auditSummary?.finalDecision || bankStatement.guidedImportAudit?.finalDecision || ''

  const isLowConfidenceStatus = LOW_CONFIDENCE_STATUSES.has(parseStatus) || parseStatus === ''
  const isNonCertified = NON_CERTIFIED_LEVELS.has(parseReliabilityLevel) || parseReliabilityLevel === ''
  const hasCertified = parseReliabilityLevel === 'certified_balanced'
  const hasBlockers = blockers.length > 0
  const hasWarnings = warnings.length > 0
  const isTemplateNotSavable = templateDecision === 'template_not_savable'
  const isReviewDecision = finalDecision.includes('review')
  const isImportFailed = parseStatus === 'failed' || parseStatus === 'blocked' || parseStatus === 'failed_parse'

  // Condizioni per primary (pulsante prominente)
  if (
    isLowConfidenceStatus ||
    isNonCertified ||
    hasBlockers ||
    hasWarnings ||
    isTemplateNotSavable ||
    isReviewDecision ||
    !hasMovements
  ) {
    return 'primary'
  }

  // Condizioni per secondary (import buono ma guida disponibile)
  if (hasCertified || hasMovements) {
    return 'secondary'
  }

  // Non abbastanza info, mostra comunque come secondary se c'è un bankStatement
  if (isImportFailed) return 'primary'

  return 'secondary'
}

export default getGuidedImportAvailability
