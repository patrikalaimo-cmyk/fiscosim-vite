function createLocalId(prefix = 'corr') {
  const time = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${time}-${rand}`
}

export function buildMovementCorrectionAuditEntry({
  movementId,
  rawRowId = '',
  pageNumber = 0,
  changedFields = [],
  reason = '',
  source = 'operator_review',
  createdAt = new Date().toISOString(),
  operatorId = '',
  rawEvidence = {},
} = {}) {
  return {
    correctionId: createLocalId('movement-correction'),
    movementId,
    rawRowId,
    pageNumber,
    changedFields: Array.isArray(changedFields) ? changedFields : [],
    reason,
    source,
    createdAt,
    operatorId,
    rawEvidence: {
      rawText: rawEvidence?.rawText || '',
      sourceFileName: rawEvidence?.sourceFileName || '',
    },
  }
}

