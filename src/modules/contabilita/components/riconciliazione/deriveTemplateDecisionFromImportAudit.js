function asNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asText(value) {
  return String(value || '').trim()
}

export function deriveTemplateDecisionFromImportAudit({
  movementsExtracted,
  difference,
  closingBalanceOfficial,
  parseStatus,
  blockers = [],
}) {
  const parsedMovements = asNumber(movementsExtracted) || 0
  const parsedDifference = asNumber(difference)
  const hasOfficialClosing = asNumber(closingBalanceOfficial) != null
  const status = asText(parseStatus).toLowerCase()
  const hasBlockingFailure = ['failed', 'needs_ocr', 'blocked'].includes(status)
  const hasBlockers = Array.isArray(blockers) && blockers.length > 0

  if (hasBlockingFailure || parsedMovements <= 0 || hasBlockers) {
    return 'template_not_savable'
  }

  if (hasOfficialClosing && parsedDifference != null && Math.abs(parsedDifference) <= 0.01) {
    return 'template_savable'
  }

  if (!hasOfficialClosing && parsedMovements > 0) {
    return 'template_savable_non_certifying'
  }

  if (hasOfficialClosing && parsedDifference != null && Math.abs(parsedDifference) > 0.01) {
    return 'template_not_savable'
  }

  return 'template_savable_non_certifying'
}

export default deriveTemplateDecisionFromImportAudit
