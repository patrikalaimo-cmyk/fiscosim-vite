import { round2 } from './canonicalReconciliationPayloadUtils.js'

function sumSection(rows = [], section) {
  return rows.reduce((total, row) => {
    if (String(row?.sezione || '').toLowerCase() !== section) return total
    return total + round2(row?.importo)
  }, 0)
}

function isValidPositiveAmount(value) {
  return Number(value) > 0
}

export function validateCanonicalReconciliationPayload(payload = {}) {
  const blockers = Array.isArray(payload.blockers) ? [...payload.blockers] : []
  const warnings = Array.isArray(payload.warnings) ? [...payload.warnings] : []
  const ignored = String(payload?.sourceDecisionStatus || '').toLowerCase() === 'ignored'
  const status = String(payload?.sourceDecisionStatus || '').toLowerCase()
  const validDecisionStatus = ['accepted', 'ignored'].includes(status)
  const primaNotaRighe = Array.isArray(payload.primaNotaRighe) ? payload.primaNotaRighe : []
  const partitarioMovements = Array.isArray(payload.partitarioMovements) ? payload.partitarioMovements : []
  const cashVatMovements = Array.isArray(payload.cashVatMovements) ? payload.cashVatMovements : []
  const withholdingMovements = Array.isArray(payload.withholdingMovements) ? payload.withholdingMovements : []
  let valid = true
  let reason = ''

  if (!payload.societaId || !payload.esercizioId || !payload.bankAccountId) {
    valid = false
    blockers.push('context_missing')
  }

  if (!validDecisionStatus) {
    valid = false
    blockers.push('decision_status_not_accepted_or_ignored')
  }

  if (blockers.length > 0) {
    valid = false
  }

  if (primaNotaRighe.length > 0) {
    const dare = round2(sumSection(primaNotaRighe, 'dare'))
    const avere = round2(sumSection(primaNotaRighe, 'avere'))
    if (primaNotaRighe.some((row) => !isValidPositiveAmount(row?.importo))) {
      valid = false
      blockers.push('prima_nota_righe_importi_non_validi')
    }
    if (Math.abs(dare - avere) > 0.01) {
      valid = false
      blockers.push('prima_nota_righe_non_quadrate')
    }
  }

  if (payload.primaNota && !payload.primaNota.contoBancaId) {
    valid = false
    blockers.push('prima_nota_conto_banca_mancante')
  }

  if (['match_partita', 'match_parziale', 'pagamento_parcella'].includes(String(payload.decisionType || '').toLowerCase()) && partitarioMovements.length === 0) {
    valid = false
    blockers.push('partitario_movement_required')
  }

  for (const movement of cashVatMovements) {
    if (!movement.documentId || movement.taxableAmountReleased == null || movement.vatAmountReleased == null) {
      valid = false
      blockers.push('cash_vat_movement_incomplete')
      break
    }
  }

  for (const movement of withholdingMovements) {
    if (!movement.percipienteId || !movement.ritenutaId || movement.amount == null) {
      valid = false
      blockers.push('withholding_movement_incomplete')
      break
    }
  }

  if (ignored) {
    if (primaNotaRighe.length || partitarioMovements.length || cashVatMovements.length || withholdingMovements.length) {
      valid = false
      reason = 'ignored payload must not contain accounting payload'
      blockers.push('ignored_payload_contains_accounting')
    } else {
      valid = true
      reason = 'no accounting payload required'
    }
  }

  if (!reason && !valid && ignored) {
    reason = 'no accounting payload required'
  }

  return {
    valid,
    ignored,
    reason,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    checks: {
      hasSocietaId: Boolean(payload.societaId),
      hasEsercizioId: Boolean(payload.esercizioId),
      hasBankAccountId: Boolean(payload.bankAccountId),
      primaNotaRigheBalanced: primaNotaRighe.length === 0 ? true : Math.abs(round2(sumSection(primaNotaRighe, 'dare')) - round2(sumSection(primaNotaRighe, 'avere'))) <= 0.01,
      partitarioRequiredSatisfied: partitarioMovements.length > 0 || !['match_partita', 'match_parziale', 'pagamento_parcella'].includes(String(payload.decisionType || '').toLowerCase()),
      cashVatRequiredSatisfied: cashVatMovements.length === 0 || cashVatMovements.every((movement) => movement.documentId && movement.taxableAmountReleased != null && movement.vatAmountReleased != null),
      withholdingRequiredSatisfied: withholdingMovements.length === 0 || withholdingMovements.every((movement) => movement.percipienteId && movement.ritenutaId && movement.amount != null),
    },
  }
}