/**
 * DecisionFeedback from confirmed bank reconciliation decisions (LAB local).
 */

import { buildDecisionFeedbackEvent } from './buildDecisionFeedbackEvent.js'

function text(value) {
  return String(value ?? '').trim()
}

function money(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/**
 * Record confirmed partita match after operator accept (or fiscal commit).
 */
export function buildBankDecisionFeedbackEvents({
  societaId = '',
  decision = null,
  movement = null,
  decisionProposal = null,
  commitResult = null,
  dryRun = false,
} = {}) {
  if (dryRun) return []
  const movementId = text(
    movement?.movementId
      || movement?.id
      || decision?.movementId
      || commitResult?.createdIds?.sourceDocumentId
      || '',
  )
  const partitaId = text(
    decision?.selectedPartitaId
      || decision?.partitaId
      || decisionProposal?.selectedCandidate?.partitaId
      || '',
  )
  if (!societaId || !movementId || !partitaId) return []

  const requestId = text(commitResult?.requestId || commitResult?.audit?.requestId || '')
  const primaNotaId = text(
    commitResult?.primaNotaId
      || commitResult?.createdIds?.primaNotaId
      || '',
  )

  // Accept without fiscal commit still learns locally (forced), tagged lab-local.
  const event = buildDecisionFeedbackEvent({
    societaId,
    sourceModule: 'riconciliazione_bancaria',
    movementId,
    requestId: requestId || `bank-accept:${movementId}`,
    primaNotaId: primaNotaId || null,
    field: 'partita',
    proposedValue: text(decisionProposal?.selectedCandidate?.partitaId) || partitaId,
    proposedSource: text(decisionProposal?.selectedCandidate?.matchType) || 'matcher',
    finalValue: partitaId,
    outcome: 'confirmed',
    committed: true,
    dryRun: false,
    amount: money(movement?.amount ?? decisionProposal?.movement?.amount),
    counterpartyKey: text(
      movement?.counterpartyName
        || movement?.counterparty
        || decisionProposal?.selectedCandidate?.soggettoNome
        || '',
    ).toLowerCase(),
    contextKey: [
      text(movement?.direction || ''),
      money(movement?.amount ?? 0),
      text(decisionProposal?.selectedCandidate?.soggettoId || ''),
    ].filter(Boolean).join('|'),
  })

  return event ? [event] : []
}
