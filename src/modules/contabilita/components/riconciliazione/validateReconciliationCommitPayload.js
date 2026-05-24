import {
  R9A_NON_IDEMPOTENT_BLOCKER,
  R9A_NON_TRANSACTIONAL_BLOCKER,
  R9A_UNSUPPORTED_BLOCKER,
  buildReconciliationCommitPlan,
} from './reconciliationCommitPlanning.js'

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function sumSection(rows = [], section) {
  return asArray(rows).reduce((total, row) => {
    if (lower(row?.sezione) !== section) return total
    return total + (Number(row?.importo) || 0)
  }, 0)
}

export function validateReconciliationCommitPayload(payload = {}, context = {}) {
  const plan = buildReconciliationCommitPlan(payload, context)
  const blockers = [...plan.blockers]
  const warnings = [...plan.warnings]
  const status = lower(payload?.sourceDecisionStatus)
  const supportedCase = plan.supportedCase
  const allowRealCommit = Boolean(context?.allowRealCommit)
  const adapterTransactional = context?.adapterTransactional === true
  const adapterSupportsIdempotency = context?.adapterSupportsIdempotency === true
  const rows = asArray(payload?.primaNotaRighe)

  if (payload?.valid !== true) {
    blockers.push('payload_not_valid')
  }

  if (payload?.source !== 'riconciliazione_bancaria') {
    blockers.push('source_non_supportato')
  }

  if (!['accepted', 'ignored'].includes(status)) {
    blockers.push('sourceDecisionStatus deve essere accepted o ignored')
  }

  if (!payload?.societaId || !payload?.esercizioId || !payload?.bankAccountId) {
    blockers.push('context_missing')
  }

  if (payload?.valid !== true && asArray(payload?.blockers).length > 0) {
    blockers.push(...asArray(payload?.blockers))
  }

  if (supportedCase !== 'ignored') {
    if (!payload?.primaNota || !rows.length) {
      blockers.push('prima_nota_mancante')
    }
    if (rows.some((row) => (Number(row?.importo) || 0) <= 0)) {
      blockers.push('prima_nota_righe_importi_non_validi')
    }
    const dare = sumSection(rows, 'dare')
    const avere = sumSection(rows, 'avere')
    if (rows.length > 0 && Math.abs(dare - avere) > 0.01) {
      blockers.push('prima_nota_righe_non_quadrate')
    }
  } else if (rows.length > 0 || asArray(payload?.partitarioMovements).length > 0 || asArray(payload?.cashVatMovements).length > 0 || asArray(payload?.withholdingMovements).length > 0) {
    blockers.push('ignored_payload_contains_accounting')
  }

  if (asArray(payload?.cashVatMovements).length > 0) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if (asArray(payload?.withholdingMovements).length > 0) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if (['f24', 'giroconto', 'pagamento_parcella'].includes(lower(payload?.decisionType))) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  const partitarioMovements = asArray(payload?.partitarioMovements)
  if (partitarioMovements.some((movement) => lower(movement?.action) === 'chiusura_multipla' || asArray(movement?.partitaIds).length > 1)) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if (supportedCase === 'spesa_bancaria' && partitarioMovements.length > 0) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if ((supportedCase === 'incasso_cliente' || supportedCase === 'pagamento_fornitore') && partitarioMovements.length > 1) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if (allowRealCommit) {
    if (!adapterTransactional) {
      blockers.push(R9A_NON_TRANSACTIONAL_BLOCKER)
    }
    if (!adapterSupportsIdempotency) {
      blockers.push(R9A_NON_IDEMPOTENT_BLOCKER)
    }
  }

  return {
    valid: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    supportedCase,
    idempotencyKey: plan.idempotencyKey,
    reason: supportedCase === 'ignored' ? 'ignored movement' : blockers.length ? blockers[0] : 'commit candidate ready',
    checks: {
      payloadValid: payload?.valid === true,
      sourceOk: payload?.source === 'riconciliazione_bancaria',
      statusOk: ['accepted', 'ignored'].includes(status),
      contextOk: Boolean(payload?.societaId && payload?.esercizioId && payload?.bankAccountId),
      allowRealCommit,
      adapterTransactional,
      adapterSupportsIdempotency,
    },
  }
}