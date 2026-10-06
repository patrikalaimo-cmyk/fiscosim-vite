function safeJsonParse(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function readParcellaWorkflowState(documentRow) {
  const dati = safeJsonParse(documentRow?.dati_estratti)
  return dati?.parcella_workflow && typeof dati.parcella_workflow === 'object'
    ? dati.parcella_workflow
    : null
}

export function buildRegistrationWorkflowState(documentRow) {
  const dati = safeJsonParse(documentRow?.dati_estratti)
  const confirmation = dati?.parcella_confirmation && typeof dati.parcella_confirmation === 'object'
    ? dati.parcella_confirmation
    : null
  const finalValues = confirmation?.finalValues || {}
  const registrationCausale = String(finalValues.registrationCausale || confirmation?.proposal?.registrationCausale || '').trim().toUpperCase()
  const paymentCausale = String(finalValues.paymentCausale || confirmation?.proposal?.paymentCausale || '').trim().toUpperCase()
  const imponibileCompenso = round2(toNumber(finalValues.imponibileCompenso, documentRow?.imponibile ?? documentRow?.totale ?? 0))
  const withholdingTotal = round2(toNumber(finalValues.withholdingAmount, 0))
  const nonSubjectTotal = round2(toNumber(finalValues.quotaNonSoggetta, 0))
  const payableTotal = round2(Math.max(0, toNumber(documentRow?.totale, 0) - withholdingTotal))
  const isForfettario = registrationCausale === 'FF' || String(finalValues.codiceSommeNonSoggette || '') === '24'
  const downstream = finalValues.downstream || confirmation?.proposal?.downstream || {}

  return {
    registrationCausale,
    paymentCausale,
    fiscalEffectiveOnPayment: true,
    excludedFromWithholdingWorkflow: isForfettario,
    excludedFromCu770Schedule: isForfettario,
    accountingPayableTotal: payableTotal,
    accountingPayableClosed: 0,
    accountingPayableOpen: payableTotal,
    withholdingPayableTotal: isForfettario ? 0 : withholdingTotal,
    withholdingPayableClosed: 0,
    withholdingPayableOpen: isForfettario ? 0 : withholdingTotal,
    taxableBaseTotal: imponibileCompenso,
    taxableBasePaid: 0,
    taxableBaseOpen: imponibileCompenso,
    nonSubjectTotal,
    nonSubjectPaid: 0,
    nonSubjectOpen: nonSubjectTotal,
    cuRelevantTotal: downstream.updateCu ? imponibileCompenso : 0,
    cuRelevantPaid: 0,
    tax770RelevantTotal: downstream.update770 ? imponibileCompenso : 0,
    tax770RelevantPaid: 0,
    withholdingScheduleTotal: downstream.updateWithholdingSchedule ? withholdingTotal : 0,
    withholdingSchedulePaid: 0,
    payments: [],
    status: 'open',
  }
}

export function applyPaymentToParcellaWorkflow(workflowState, paymentInput) {
  const state = workflowState ? { ...workflowState } : null
  if (!state) return null

  const payableOpenBefore = round2(toNumber(state.accountingPayableOpen, 0))
  const withholdingOpenBefore = round2(toNumber(state.withholdingPayableOpen, 0))
  const taxableOpenBefore = round2(toNumber(state.taxableBaseOpen, 0))
  const nonSubjectOpenBefore = round2(toNumber(state.nonSubjectOpen, 0))
  const taxableTotal = round2(toNumber(state.taxableBaseTotal, taxableOpenBefore))

  const taxablePaid = round2(Math.min(taxableOpenBefore, Math.max(0, toNumber(paymentInput?.taxableBasePaid, 0))))
  const grossRatio = taxableTotal > 0 ? Math.min(1, taxablePaid / taxableTotal) : 0
  const nonSubjectPaid = round2(Math.min(nonSubjectOpenBefore, toNumber(state.nonSubjectTotal, 0) * grossRatio))

  const withholdingPaid = state.excludedFromWithholdingWorkflow
    ? 0
    : round2(Math.min(withholdingOpenBefore, Math.max(0, toNumber(paymentInput?.withholdingPaid, 0))))
  const accountingPaid = round2(Math.min(payableOpenBefore, Math.max(0, toNumber(paymentInput?.accountingPaid, 0))))

  state.accountingPayableClosed = round2(toNumber(state.accountingPayableClosed, 0) + accountingPaid)
  state.accountingPayableOpen = round2(Math.max(0, payableOpenBefore - accountingPaid))
  state.withholdingPayableClosed = round2(toNumber(state.withholdingPayableClosed, 0) + withholdingPaid)
  state.withholdingPayableOpen = round2(Math.max(0, withholdingOpenBefore - withholdingPaid))
  state.taxableBasePaid = round2(toNumber(state.taxableBasePaid, 0) + taxablePaid)
  state.taxableBaseOpen = round2(Math.max(0, taxableOpenBefore - taxablePaid))
  state.nonSubjectPaid = round2(toNumber(state.nonSubjectPaid, 0) + nonSubjectPaid)
  state.nonSubjectOpen = round2(Math.max(0, nonSubjectOpenBefore - nonSubjectPaid))

  const cuRelevantIncrement = round2(toNumber(state.cuRelevantTotal, 0) * grossRatio)
  const tax770RelevantIncrement = round2(toNumber(state.tax770RelevantTotal, 0) * grossRatio)
  const withholdingScheduleIncrement = round2(toNumber(state.withholdingScheduleTotal, 0) * grossRatio)

  state.cuRelevantPaid = round2(Math.min(toNumber(state.cuRelevantTotal, 0), toNumber(state.cuRelevantPaid, 0) + cuRelevantIncrement))
  state.tax770RelevantPaid = round2(Math.min(toNumber(state.tax770RelevantTotal, 0), toNumber(state.tax770RelevantPaid, 0) + tax770RelevantIncrement))
  state.withholdingSchedulePaid = round2(Math.min(toNumber(state.withholdingScheduleTotal, 0), toNumber(state.withholdingSchedulePaid, 0) + withholdingScheduleIncrement))

  state.payments = [
    ...(Array.isArray(state.payments) ? state.payments : []),
    {
      paymentId: paymentInput?.paymentId || null,
      paymentDate: paymentInput?.paymentDate || null,
      paymentCausale: paymentInput?.paymentCausale || null,
      taxableBasePaid: taxablePaid,
      nonSubjectPaid,
      accountingPaid,
      withholdingPaid,
      ratio: grossRatio,
    },
  ]

  if (state.accountingPayableOpen <= 0.009 && state.withholdingPayableOpen <= 0.009) state.status = 'closed'
  else if (state.accountingPayableClosed > 0 || state.withholdingPayableClosed > 0) state.status = 'partial'
  else state.status = 'open'

  return state
}
