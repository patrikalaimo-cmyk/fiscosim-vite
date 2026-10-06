import { buildMovementCorrectionAuditEntry } from './buildMovementCorrectionAuditEntry.js'
import { rebuildBankStatementAuditAfterCorrection } from './rebuildBankStatementAuditAfterCorrection.js'

function normalizeDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parts = raw.split(/[\/.-]/).filter(Boolean)
  if (parts.length !== 3) return ''
  const [a, b, c] = parts
  const year = c.length === 2 ? `20${c}` : c
  return `${String(a).padStart(2, '0')}/${String(b).padStart(2, '0')}/${year}`
}

function normalizeDirection(value) {
  const text = String(value || '').toLowerCase().trim()
  if (text === 'in' || text === 'entrata') return 'in'
  if (text === 'out' || text === 'uscita') return 'out'
  return ''
}

function normalizeAmount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.round(Math.abs(numeric) * 100) / 100
}

function createChangedFields(previous = {}, next = {}) {
  const fields = []
  const keys = ['amount', 'direction', 'operationDate', 'valueDate', 'descriptionRaw', 'counterpartyName']
  keys.forEach((field) => {
    const previousValue = field === 'amount' ? normalizeAmount(previous[field]) : previous[field] ?? ''
    const nextValue = field === 'amount' ? normalizeAmount(next[field]) : next[field] ?? ''
    if (String(previousValue ?? '') !== String(nextValue ?? '')) {
      fields.push({ field, previousValue, newValue: nextValue })
    }
  })
  return fields
}

export function applyBankMovementCorrection({
  bankStatement,
  movementId,
  changes = {},
  reason = '',
  operatorId = '',
  createdAt = new Date().toISOString(),
  reviewStats = null,
  reviewStatus = 'corrected',
} = {}) {
  if (!bankStatement || !movementId) {
    return { ok: false, error: 'missing_statement_or_movement' }
  }

  const movements = Array.isArray(bankStatement.movements) ? bankStatement.movements : []
  const movementIndex = movements.findIndex((movement) => movement.movementId === movementId || movement.id === movementId)
  if (movementIndex < 0) {
    return { ok: false, error: 'movement_not_found' }
  }

  const current = movements[movementIndex]
  const nextMovement = {
    ...current,
    amount: normalizeAmount(changes.amount ?? current.amount),
    direction: normalizeDirection(changes.direction ?? current.direction),
    operationDate: normalizeDate(changes.operationDate ?? current.operationDate),
    valueDate: normalizeDate((changes.valueDate ?? current.valueDate) || current.operationDate),
    descriptionRaw: String(changes.descriptionRaw ?? current.descriptionRaw ?? '').trim(),
    counterpartyName: String(changes.counterpartyName ?? current.counterpartyName ?? '').trim(),
  }

  if (!current.correctionBaseline) {
    nextMovement.correctionBaseline = {
      amount: normalizeAmount(current.amount),
      direction: current.direction || '',
      operationDate: current.operationDate || '',
      valueDate: current.valueDate || '',
      descriptionRaw: current.descriptionRaw || '',
      counterpartyName: current.counterpartyName || '',
    }
  } else {
    nextMovement.correctionBaseline = current.correctionBaseline
  }

  const changedFields = createChangedFields(current, nextMovement)
  if (!changedFields.length) {
    return { ok: false, error: 'no_effective_change' }
  }

  if (!nextMovement.amount || nextMovement.amount <= 0) {
    return { ok: false, error: 'invalid_amount' }
  }
  if (nextMovement.direction !== 'in' && nextMovement.direction !== 'out') {
    return { ok: false, error: 'invalid_direction' }
  }
  if (!nextMovement.operationDate) {
    return { ok: false, error: 'invalid_operation_date' }
  }
  if (!String(reason || '').trim()) {
    return { ok: false, error: 'missing_reason' }
  }

  const auditEntry = buildMovementCorrectionAuditEntry({
    movementId: nextMovement.movementId || nextMovement.id || movementId,
    rawRowId: current.sourceMeta?.rawRowId ?? '',
    pageNumber: current.sourceMeta?.pageNumber || 0,
    changedFields,
    reason: String(reason).trim(),
    source: 'operator_review',
    createdAt,
    operatorId,
    rawEvidence: {
      rawText: current.sourceMeta?.rawText || current.descriptionRaw || '',
      sourceFileName: current.sourceMeta?.sourceFile || bankStatement.sourceFileName || '',
    },
  })

  const nextMovements = movements.slice()
  nextMovement.reviewStatus = reviewStatus === 'verified' ? 'verified' : 'corrected'
  nextMovement.reviewLabel = nextMovement.reviewStatus === 'verified' ? 'Verificata' : 'Corretto'
  nextMovement.reviewTone = 'green'
  nextMovement.correctionAuditTrail = [
    ...(Array.isArray(current.correctionAuditTrail) ? current.correctionAuditTrail : []),
    auditEntry,
  ]
  nextMovement.lastCorrection = auditEntry
  nextMovements[movementIndex] = nextMovement

  const nextStatement = {
    ...bankStatement,
    movements: nextMovements,
    correctionAuditTrail: [...(Array.isArray(bankStatement.correctionAuditTrail) ? bankStatement.correctionAuditTrail : []), auditEntry],
    lastUpdatedAt: createdAt,
  }

  const correctedAudit = rebuildBankStatementAuditAfterCorrection(nextStatement, {
    reviewStats: reviewStats || bankStatement.reviewStats || {
      total: bankStatement.needsReviewRows || 0,
      pending: Math.max((bankStatement.needsReviewRows || 0) - 1, 0),
      verified: 0,
      corrected: 1,
      ignored: 0,
      manual: 0,
    },
  })

  return {
    ok: true,
    bankStatement: correctedAudit,
    auditEntry,
  }
}
