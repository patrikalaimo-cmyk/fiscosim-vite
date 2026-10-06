import { createEmptyCanonicalAccountingPayload } from './canonicalAccountingPayload.defaults.js'
import { buildCanonicalPayloadHashFixtures } from './testCanonicalPayloadHashFixtures.js'
import { getRiconciliazioneMatchingFixtures } from '../components/riconciliazione/riconciliazioneMatchingFixtures.js'
import { runRiconciliazioneMatchForMovement } from '../components/riconciliazione/runRiconciliazioneMatchForMovement.js'
import { buildReconciliationDecisionFromProposal } from '../components/riconciliazione/buildReconciliationDecisionFromProposal.js'
import { applyReconciliationDecisionAction } from '../components/riconciliazione/applyReconciliationDecisionAction.js'
import { RECONCILIATION_DECISION_OPERATOR_ACTION } from '../components/riconciliazione/reconciliationDecisionTypes.js'
import { mapReconciliationDecisionToCanonicalPayload } from '../components/riconciliazione/mapReconciliationDecisionToCanonicalPayload.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function buildAcceptedReconciliationPayload() {
  const fixtures = getRiconciliazioneMatchingFixtures()
  const movement = fixtures.movements.find((item) => item.movementId === 'm-001') || fixtures.movements[0]
  const proposal = runRiconciliazioneMatchForMovement({ movement, partiteAperte: fixtures.partiteAperte })
  const baseDecision = buildReconciliationDecisionFromProposal(proposal, { movementId: movement?.movementId || movement?.id || null })
  const accepted = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.ACCEPT_PROPOSAL, {
    operatorNotes: 'mock commit adapter fixture',
  })
  const decision = accepted.ok ? accepted.decision : baseDecision

  return mapReconciliationDecisionToCanonicalPayload(decision, {
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    bankStatementId: movement?.sourceStatementId || 'stmt-001',
    bankAccountId: movement?.bankAccountId || 'bank-acc-001',
    bankAccountCode: movement?.bankAccountCode || '1.01.01.001',
    bankAccountDescription: movement?.bankAccountCode === '1.01.01.002' ? 'Banca spese e commissioni' : 'Banca c/c ordinario',
    operationDate: movement?.operationDate || '2026-04-13',
    registrationDate: movement?.operationDate || '2026-04-13',
  })
}

function buildIgnoredReconciliationPayload() {
  const fixtures = getRiconciliazioneMatchingFixtures()
  const movement = fixtures.movements.find((item) => item.movementId === 'm-001') || fixtures.movements[0]
  const proposal = runRiconciliazioneMatchForMovement({ movement, partiteAperte: fixtures.partiteAperte })
  const baseDecision = buildReconciliationDecisionFromProposal(proposal, { movementId: movement?.movementId || movement?.id || null })
  const ignored = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.IGNORE_MOVEMENT, {
    operatorNotes: 'mock ignore fixture',
  })
  const decision = ignored.ok ? ignored.decision : baseDecision

  return mapReconciliationDecisionToCanonicalPayload(decision, {
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    bankStatementId: movement?.sourceStatementId || 'stmt-001',
    bankAccountId: movement?.bankAccountId || 'bank-acc-001',
    bankAccountCode: movement?.bankAccountCode || '1.01.01.001',
    bankAccountDescription: movement?.bankAccountCode === '1.01.01.002' ? 'Banca spese e commissioni' : 'Banca c/c ordinario',
    operationDate: movement?.operationDate || '2026-04-13',
    registrationDate: movement?.operationDate || '2026-04-13',
  })
}

function buildBaseImportPayload() {
  const fixtures = buildCanonicalPayloadHashFixtures()
  const payload = clone(fixtures.importPayload)
  payload.source.module = 'import_contabilita'
  payload.source.sourceDocumentId = 'doc-import-001'
  payload.source.sourceBatchId = 'batch-import-001'
  payload.source.sourceMeta = { contractVersion: '1.0', source: 'fixture-import' }
  payload.document.direction = 'vendita'
  payload.document.numeroDocumento = 'IMP-001'
  payload.document.tipoDocumento = 'TD01'
  payload.company.societaId = 'soc-001'
  payload.company.esercizioId = '2026'
  payload.idempotencyKey = 'imp-001'
  payload.payloadId = 'imp-001'
  payload.postCommitTargets.shouldCreateDocumentiContabilita = true
  payload.postCommitTargets.shouldCreatePrimaNota = true
  payload.postCommitTargets.shouldCreateIva = true
  payload.postCommitTargets.shouldUpdateAuditTrail = true
  payload.validation.blocking = []
  payload.validation.readiness = 'ready'
  return payload
}

function buildBaseManualPayload() {
  const fixtures = buildCanonicalPayloadHashFixtures()
  const payload = clone(fixtures.manualPayload)
  payload.source.module = 'registrazione_manual'
  payload.source.sourceDocumentId = 'doc-manual-001'
  payload.source.sourceBatchId = 'batch-manual-001'
  payload.company.societaId = 'soc-001'
  payload.company.esercizioId = '2026'
  payload.idempotencyKey = 'man-001'
  payload.payloadId = 'man-001'
  payload.postCommitTargets.shouldCreateDocumentiContabilita = false
  payload.postCommitTargets.shouldCreatePrimaNota = true
  payload.postCommitTargets.shouldCreateIva = false
  payload.postCommitTargets.shouldCreateLedger = false
  payload.postCommitTargets.shouldCreateWithholding = false
  payload.postCommitTargets.shouldUpdateAuditTrail = true
  payload.validation.blocking = []
  payload.validation.readiness = 'ready'
  payload.ledger.enabled = false
  payload.vat.enabled = false
  payload.withholding.enabled = false
  payload.withholding.rows = []
  return payload
}

function buildManualInvoicePayload() {
  const payload = buildBaseManualPayload()
  payload.source.sourceDocumentId = 'doc-manual-invoice-001'
  payload.idempotencyKey = 'man-inv-001'
  payload.payloadId = 'man-inv-001'
  payload.document.direction = 'vendita'
  payload.document.numeroDocumento = 'MAN-INV-001'
  payload.document.tipoDocumento = 'TD01'
  payload.ledger.enabled = true
  payload.ledger.mode = 'open'
  payload.ledger.rows = [
    {
      action: 'open',
      documentRef: 'MAN-INV-001',
      amount: 122,
      dueDate: '2026-05-13',
    },
  ]
  payload.vat.enabled = true
  payload.vat.rows = [
    {
      rowNumber: 1,
      taxable: 100,
      tax: 22,
      rate: 22,
      causaleIvaId: 'iva-22',
      causaleIva: 'IVA 22%',
    },
  ]
  payload.postCommitTargets.shouldCreateIva = true
  payload.postCommitTargets.shouldCreateLedger = true
  return payload
}

function buildLegacyPayload() {
  const payload = buildBaseImportPayload()
  payload.accounting.legacyTarget = 'accounting_entries'
  return payload
}

function buildCrossCompanyPayload() {
  const payload = buildBaseImportPayload()
  payload.company.societaId = 'soc-other'
  return payload
}

function buildUnsupportedPayload() {
  const payload = buildBaseManualPayload()
  payload.mockCase = 'f24'
  payload.flags = { cumulativo: true }
  payload.validation.blocking = ['unsupported_case_for_atomic_commit']
  return payload
}

function buildConflictPayload() {
  const payload = buildBaseImportPayload()
  payload.document.totals.gross = 999
  payload.document.totals.netPayable = 999
  payload.accounting.rows[0].credit = 999
  return payload
}

function buildFailurePayload() {
  const payload = buildBaseImportPayload()
  payload.idempotencyKey = 'failure-001'
  payload.payloadId = 'failure-001'
  return payload
}

export function buildCanonicalCommitAdapterFixtures() {
  const importCliente = buildBaseImportPayload()
  importCliente.document.direction = 'vendita'
  importCliente.sourceDocumentId = 'doc-import-cliente-001'
  importCliente.idempotencyKey = 'imp-client-001'
  importCliente.payloadId = 'imp-client-001'

  const importFornitore = buildBaseImportPayload()
  importFornitore.document.direction = 'acquisto'
  importFornitore.sourceDocumentId = 'doc-import-fornitore-001'
  importFornitore.idempotencyKey = 'imp-supplier-001'
  importFornitore.payloadId = 'imp-supplier-001'

  const manualSimple = buildBaseManualPayload()
  const manualInvoice = buildManualInvoicePayload()
  const reconciliationAccepted = buildAcceptedReconciliationPayload()
  const reconciliationIgnored = buildIgnoredReconciliationPayload()
  const legacy = buildLegacyPayload()
  const crossCompany = buildCrossCompanyPayload()
  const unsupported = buildUnsupportedPayload()
  const conflictBase = buildBaseImportPayload()
  const conflictVariant = buildConflictPayload()
  const failure = buildFailurePayload()

  return {
    importCliente,
    importFornitore,
    manualSimple,
    manualInvoice,
    reconciliationAccepted,
    reconciliationIgnored,
    legacy,
    crossCompany,
    unsupported,
    conflictBase,
    conflictVariant,
    failure,
  }
}
