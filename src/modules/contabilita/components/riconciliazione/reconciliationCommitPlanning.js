const COMMIT_VERSION = 'r9a-1'
const R9A_UNSUPPORTED_BLOCKER = 'Caso non ancora supportato in R9A'
const R9A_NON_TRANSACTIONAL_BLOCKER = 'Adapter non transazionale: commit reale non consentito'
const R9A_NON_IDEMPOTENT_BLOCKER = 'Adapter senza controllo idempotenza: commit reale non consentito'

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function unique(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)))
}

function sumSection(rows = [], section) {
  return asArray(rows).reduce((total, row) => {
    if (lower(row?.sezione) !== section) return total
    return total + (Number(row?.importo) || 0)
  }, 0)
}

export function buildIdempotencyKey(payload = {}, context = {}) {
  const explicitKey = text(context?.idempotencyKey) || text(payload?.idempotencyKey)
  if (explicitKey) return explicitKey

  const societaId = text(context?.societaId || payload?.societaId)
  const esercizioId = text(context?.esercizioId || payload?.esercizioId)
  const movementId = text(payload?.movementId) || 'movement'
  const decisionId = text(payload?.decisionId) || 'decision'

  if (societaId && esercizioId) {
    return `reconciliation:${societaId}:${esercizioId}:${movementId}:${decisionId}`
  }

  return `reconciliation:${movementId}:${decisionId}`
}

export function resolveR9ASupportedCase(payload = {}) {
  const status = lower(payload?.sourceDecisionStatus)
  const decisionType = lower(payload?.decisionType)
  const rows = asArray(payload?.primaNotaRighe)
  const partitarioMovements = asArray(payload?.partitarioMovements)
  const cashVatMovements = asArray(payload?.cashVatMovements)
  const withholdingMovements = asArray(payload?.withholdingMovements)
  const blockers = []

  if (status === 'ignored') {
    return {
      supportedCase: 'ignored',
      blockers,
    }
  }

  if (status !== 'accepted') {
    blockers.push('sourceDecisionStatus deve essere accepted o ignored')
    return {
      supportedCase: null,
      blockers,
    }
  }

  if (cashVatMovements.length > 0 || withholdingMovements.length > 0) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if (['f24', 'giroconto', 'pagamento_parcella'].includes(decisionType)) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if (partitarioMovements.some((movement) => lower(movement?.action) === 'chiusura_multipla' || asArray(movement?.partitaIds).length > 1)) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if (!rows.length) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  const bankRows = rows.filter((row) => lower(row?.sourceRole) === 'conto_banca')
  const counterpartRows = rows.filter((row) => lower(row?.sourceRole) !== 'conto_banca')

  if (rows.length !== 2 || bankRows.length !== 1 || counterpartRows.length !== 1) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  const counterpartRole = lower(counterpartRows[0]?.sourceRole)
  let supportedCase = null

  if (counterpartRole === 'conto_patrimoniale_cliente') {
    supportedCase = 'incasso_cliente'
  } else if (counterpartRole === 'conto_patrimoniale_fornitore') {
    supportedCase = 'pagamento_fornitore'
  } else if (counterpartRole === 'conto_imputazione') {
    supportedCase = 'spesa_bancaria'
  } else if (counterpartRole === 'conto_patrimoniale_percipiente' || counterpartRole === 'conto_tributo' || counterpartRole === 'conto_transitorio') {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  } else if (!supportedCase) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if (supportedCase === 'spesa_bancaria' && partitarioMovements.length > 0) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  if ((supportedCase === 'incasso_cliente' || supportedCase === 'pagamento_fornitore') && partitarioMovements.length > 1) {
    blockers.push(R9A_UNSUPPORTED_BLOCKER)
  }

  return {
    supportedCase,
    blockers: unique(blockers),
  }
}

export function buildReconciliationCommitPlan(payload = {}, context = {}) {
  const status = lower(payload?.sourceDecisionStatus)
  const supported = resolveR9ASupportedCase(payload)
  const warnings = unique([...(asArray(payload?.warnings)), ...(asArray(payload?.sourceWarnings))])
  const blockers = unique([
    ...(asArray(payload?.blockers)),
    ...(asArray(payload?.sourceBlockers)),
    ...supported.blockers,
  ])

  const rows = asArray(payload?.primaNotaRighe)
  const partitarioMovements = asArray(payload?.partitarioMovements)

  let operationsPlanned = []
  let bankMovementAction = null
  if (status === 'ignored') {
    operationsPlanned = ['markBankMovementIgnored']
    bankMovementAction = 'markBankMovementIgnored'
  } else if (rows.length > 0) {
    operationsPlanned = ['createPrimaNota', 'createPrimaNotaRighe']
    if (partitarioMovements.length > 0) {
      operationsPlanned.push('createPartitarioMovements')
    }
    operationsPlanned.push('markBankMovementReconciled')
    bankMovementAction = 'markBankMovementReconciled'
  }

  const totalDare = sumSection(rows, 'dare')
  const totalAvere = sumSection(rows, 'avere')

  return {
    commitVersion: COMMIT_VERSION,
    idempotencyKey: buildIdempotencyKey(payload, context),
    supportedCase: supported.supportedCase,
    bankMovementAction,
    operationsPlanned,
    warnings,
    blockers,
    noDbWriteInDryRun: true,
    reason: status === 'ignored' ? 'ignored movement' : blockers.length ? R9A_UNSUPPORTED_BLOCKER : 'commit candidate ready',
    accountingSummary: {
      primaNotaRigheCount: rows.length,
      partitarioMovementsCount: partitarioMovements.length,
      totalDare,
      totalAvere,
      balanced: rows.length ? Math.abs(totalDare - totalAvere) <= 0.01 : true,
    },
    preview: {
      primaNota: clone(payload?.primaNota) || null,
      primaNotaRighe: clone(rows),
      partitarioMovements: clone(partitarioMovements),
      cashVatMovements: clone(asArray(payload?.cashVatMovements)),
      withholdingMovements: clone(asArray(payload?.withholdingMovements)),
      bankMovement: {
        movementId: text(payload?.movementId) || null,
        action: bankMovementAction,
      },
      noDbWriteInDryRun: true,
      message: 'nessuna scrittura eseguita',
      blockers,
      warnings,
    },
  }
}

export { COMMIT_VERSION, R9A_NON_IDEMPOTENT_BLOCKER, R9A_NON_TRANSACTIONAL_BLOCKER, R9A_UNSUPPORTED_BLOCKER }