import { createEmptyCanonicalAccountingPayload } from './canonicalAccountingPayload.defaults.js'
import { getRiconciliazioneMatchingFixtures } from '../components/riconciliazione/riconciliazioneMatchingFixtures.js'
import { runRiconciliazioneMatchForMovement } from '../components/riconciliazione/runRiconciliazioneMatchForMovement.js'
import { buildReconciliationDecisionFromProposal } from '../components/riconciliazione/buildReconciliationDecisionFromProposal.js'
import { applyReconciliationDecisionAction } from '../components/riconciliazione/applyReconciliationDecisionAction.js'
import { RECONCILIATION_DECISION_OPERATOR_ACTION } from '../components/riconciliazione/reconciliationDecisionTypes.js'
import { mapReconciliationDecisionToCanonicalPayload } from '../components/riconciliazione/mapReconciliationDecisionToCanonicalPayload.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function buildBaseReconciliationPayload() {
  const fixtures = getRiconciliazioneMatchingFixtures()
  const movement = fixtures.movements.find((item) => item.movementId === 'm-001') || fixtures.movements[0]
  const proposal = runRiconciliazioneMatchForMovement({ movement, partiteAperte: fixtures.partiteAperte })
  const baseDecision = buildReconciliationDecisionFromProposal(proposal, { movementId: movement?.movementId || movement?.id || null })
  const accepted = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.ACCEPT_PROPOSAL, { operatorNotes: 'canonical hash fixture' })
  const decision = accepted.ok ? accepted.decision : baseDecision

  return mapReconciliationDecisionToCanonicalPayload(decision, {
    societaId: 'soc-001',
    esercizioId: '2026',
    bankStatementId: movement?.sourceStatementId || 'stmt-001',
    bankAccountId: movement?.bankAccountId || 'bank-acc-001',
    bankAccountCode: movement?.bankAccountCode || '1.01.01.001',
    bankAccountDescription: 'Banca c/c ordinario',
    operationDate: movement?.operationDate || '2026-04-13',
    registrationDate: movement?.operationDate || '2026-04-13',
  })
}

function buildBaseImportPayload() {
  const payload = createEmptyCanonicalAccountingPayload()
  payload.schemaVersion = '1.0.0'
  payload.idempotencyKey = 'imp-001'
  payload.source.module = 'import_contabilita'
  payload.source.sourceDocumentId = 'doc-imp-001'
  payload.source.sourceBatchId = 'batch-imp-001'
  payload.source.sourceMeta = {
    contractVersion: '1.0',
    importedAt: '2026-04-13T10:00:00Z',
  }
  payload.company.societaId = 'soc-001'
  payload.company.esercizioId = '2026'
  payload.company.periodoIva = '2026-04'
  payload.company.regime = 'ordinario'
  payload.fiscalContext.dataRegistrazione = '2026-04-13'
  payload.fiscalContext.dataDocumento = '2026-04-10'
  payload.fiscalContext.periodoIva = '2026-04'
  payload.header.causaleContabile = 'fattura-acquisto'
  payload.header.descrizione = 'Fattura acquisto componenti'
  payload.header.numeroRegistrazione = '001'
  payload.header.stato = 'bozza'
  payload.header.currency = 'EUR'
  payload.document.numeroDocumento = '001'
  payload.document.dataDocumento = '2026-04-10'
  payload.document.tipoDocumento = 'TD01'
  payload.document.totals = {
    taxable: '1.234,50',
    vat: '271,59',
    gross: '1.506,09',
    netPayable: '1.506,09',
    withholding: '0',
    socialSecurity: '0',
    stampDuty: '0',
    rounding: '0',
    excluded: '0',
    currency: 'EUR',
  }
  payload.accounting.rows = [
    {
      rowNumber: 2,
      accountId: 'conto-costo-001',
      accountCode: '6.02.01',
      accountDescription: 'Costi per servizi',
      description: 'Avere fornitore',
      debit: '0',
      credit: '1506,09',
      amount: '1506,09',
      createdAt: '2026-04-13T10:00:01Z',
    },
    {
      rowNumber: 1,
      accountId: 'conto-fornitore-001',
      accountCode: '2.01.01',
      accountDescription: 'Fornitori c/fatture da ricevere',
      description: 'Dare fornitore',
      debit: '1506,09',
      credit: '0',
      amount: '1506,09',
      createdAt: '2026-04-13T10:00:02Z',
    },
  ]
  payload.vat.enabled = true
  payload.vat.rows = [
    {
      rowNumber: 1,
      registerType: 'acquisti',
      sezionale: 'A',
      protocolNumber: '12',
      competencePeriod: '2026-04',
      causaleIvaId: 'causale-iva-001',
      causaleIva: 'IVA 22%',
      imponibile: '1234.50',
      imposta: '271.59',
      aliquota: '22',
      natura: '',
      detraibilitaPercent: '100',
      indetraibileAmount: '0',
      splitPayment: false,
      reverseCharge: false,
      ivaPerCassa: false,
      proRata: '100',
    },
  ]
  payload.audit.sourceModule = 'import_contabilita'
  payload.audit.createdBy = 'user-001'
  payload.audit.createdAt = '2026-04-13T10:00:00Z'
  payload.audit.sourceAction = 'import'
  payload.audit.importBatch = 'batch-imp-001'
  payload.validation.readiness = 'ready'
  payload.validation.blocking = []
  payload.validation.errors = []
  payload.validation.warnings = []
  payload.postCommitTargets.shouldCreateDocumentiContabilita = true
  payload.postCommitTargets.shouldCreatePrimaNota = true
  payload.postCommitTargets.shouldCreateIva = true
  payload.postCommitTargets.shouldUpdateAuditTrail = true
  return payload
}

function buildBaseManualPayload() {
  const payload = createEmptyCanonicalAccountingPayload()
  payload.schemaVersion = '1.0.0'
  payload.idempotencyKey = 'man-001'
  payload.source.module = 'registrazione_manuale'
  payload.source.sourceDocumentId = 'doc-man-001'
  payload.source.sourceBatchId = 'batch-man-001'
  payload.company.societaId = 'soc-001'
  payload.company.esercizioId = '2026'
  payload.company.periodoIva = '2026-04'
  payload.company.regime = 'ordinario'
  payload.fiscalContext.dataRegistrazione = '2026-04-13'
  payload.fiscalContext.dataDocumento = '2026-04-11'
  payload.fiscalContext.periodoIva = '2026-04'
  payload.header.causaleContabile = 'registrazione-manuale'
  payload.header.descrizione = 'Scrittura manuale di prova'
  payload.header.numeroRegistrazione = 'M-001'
  payload.header.stato = 'bozza'
  payload.header.currency = 'EUR'
  payload.document.numeroDocumento = '001'
  payload.document.dataDocumento = '2026-04-11'
  payload.document.tipoDocumento = 'NA'
  payload.document.totals = {
    taxable: 0,
    vat: 0,
    gross: 0,
    netPayable: 0,
    withholding: 0,
    socialSecurity: 0,
    stampDuty: 0,
    rounding: 0,
    excluded: 0,
    currency: 'EUR',
  }
  payload.subjects = [
    {
      id: 'subject-001',
      role: 'primary',
      tipoSoggetto: 'controparte',
      anagraficaId: 'an-001',
      pianoContiIdPatrimoniale: 'pc-001',
      denominazione: 'Fornitore Alfa',
    },
    {
      id: 'subject-002',
      role: 'counterparty',
      tipoSoggetto: 'controparte',
      anagraficaId: 'an-002',
      pianoContiIdPatrimoniale: 'pc-002',
      denominazione: 'Cliente Beta',
    },
  ]
  payload.accounting.rows = [
    {
      rowNumber: 1,
      accountId: 'conto-man-001',
      accountCode: '7.01.01',
      accountDescription: 'Ricavi diversi',
      description: 'Prima riga manuale',
      debit: '100,00',
      credit: '0',
      amount: '100,00',
    },
    {
      rowNumber: 2,
      accountId: 'conto-man-002',
      accountCode: '4.01.01',
      accountDescription: 'Banca c/c',
      description: 'Seconda riga manuale',
      debit: '0',
      credit: '100,00',
      amount: '100,00',
    },
  ]
  payload.audit.sourceModule = 'registrazione_manuale'
  payload.audit.createdBy = 'user-001'
  payload.audit.createdAt = '2026-04-13T10:05:00Z'
  payload.audit.sourceAction = 'manual_save'
  payload.audit.importBatch = 'batch-man-001'
  payload.validation.readiness = 'ready'
  payload.validation.blocking = []
  payload.validation.errors = []
  payload.validation.warnings = []
  payload.postCommitTargets.shouldCreateDocumentiContabilita = true
  payload.postCommitTargets.shouldCreatePrimaNota = true
  payload.postCommitTargets.shouldUpdateAuditTrail = true
  return payload
}

export function buildCanonicalPayloadHashFixtures() {
  const reconciliation = buildBaseReconciliationPayload()
  const importPayload = buildBaseImportPayload()
  const manualPayload = buildBaseManualPayload()

  return {
    reconciliation,
    importPayload,
    manualPayload,
    unorderedVariant: (() => {
      const payload = clone(manualPayload)
      payload.subjects = [clone(payload.subjects?.[1]), clone(payload.subjects?.[0])]
      payload.subjects.__unordered = true
      return payload
    })(),
  }
}
