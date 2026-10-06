import { RECONCILIATION_DECISION_READYNESS, RECONCILIATION_DECISION_STATUS } from './reconciliationDecisionTypes.js'

function sumRows(rows = [], section) {
  return rows.reduce((total, row) => {
    if (String(row?.sezione || '').toLowerCase() !== section) return total
    return total + Math.abs(Number(row?.importo || 0))
  }, 0)
}

function hasDebitCreditRows(proposal) {
  const rows = Array.isArray(proposal?.righe) ? proposal.righe : []
  const hasDebit = rows.some((row) => String(row?.sezione || '').toLowerCase() === 'dare')
  const hasCredit = rows.some((row) => String(row?.sezione || '').toLowerCase() === 'avere')
  return hasDebit && hasCredit
}

export function validateReconciliationDecision(decision = {}) {
  const warnings = []
  const blockers = Array.isArray(decision.blockers) ? [...decision.blockers] : []
  let readiness = decision.readiness || RECONCILIATION_DECISION_READYNESS.NEEDS_OPERATOR_CHOICE
  let valid = true

  if (!decision.movementId) {
    valid = false
    blockers.push('movementId_missing')
  }
  if (!decision.decisionType) {
    valid = false
    blockers.push('decisionType_missing')
  }
  if (!decision.movementType) {
    valid = false
    blockers.push('movementType_missing')
  }

  if (['match_partita', 'match_parziale'].includes(decision.decisionType)) {
    if (!decision.selectedMatch) {
      valid = false
      blockers.push('selectedMatch_missing')
    } else if (
      !decision.selectedMatch.partitaId &&
      decision.selectedMatch.matchType !== 'not_required' &&
      !(decision.cashVatImpact?.applies && decision.selectedMatch.matchType === 'exact_amount')
    ) {
      valid = false
      blockers.push('selectedMatch_partitaId_missing')
    }
  }

  if (decision.accountingProposal) {
    const rows = Array.isArray(decision.accountingProposal.righe) ? decision.accountingProposal.righe : []
    if (!hasDebitCreditRows(decision.accountingProposal)) {
      valid = false
      blockers.push('accountingProposal_rows_missing')
    }
    const debit = sumRows(rows, 'dare')
    const credit = sumRows(rows, 'avere')
    if (Math.abs(debit - credit) > 0.01) {
      valid = false
      blockers.push('accountingProposal_not_balanced')
    }
  }

  if (decision.blockers?.length && decision.status === RECONCILIATION_DECISION_STATUS.ACCEPTED) {
    valid = false
    blockers.push('accepted_with_blockers')
  }

  if (decision.decisionType === 'f24' && decision.blockers?.includes('tributi_mancanti')) {
    if (![RECONCILIATION_DECISION_STATUS.BLOCKED, RECONCILIATION_DECISION_STATUS.NEEDS_REVIEW].includes(decision.status)) {
      valid = false
      blockers.push('f24_requires_blocked_or_review')
    }
  }

  if (decision.status === RECONCILIATION_DECISION_STATUS.IGNORED) {
    readiness = RECONCILIATION_DECISION_READYNESS.IGNORED
  }

  if (decision.cashVatImpact?.applies) {
    if (!decision.cashVatImpact.documentId || decision.cashVatImpact.proportion == null || (decision.cashVatImpact.amount == null && decision.cashVatImpact.taxableAmountReleased == null)) {
      warnings.push('cash_vat_incomplete')
      valid = false
    }
  }

  if (decision.withholdingPaymentProposal?.applies) {
    if (!decision.withholdingPaymentProposal.percipienteId || !decision.withholdingPaymentProposal.ritenutaId || decision.withholdingPaymentProposal.amount == null) {
      warnings.push('withholding_incomplete')
      valid = false
    }
  }

  return {
    valid,
    warnings,
    blockers,
    readiness,
  }
}
