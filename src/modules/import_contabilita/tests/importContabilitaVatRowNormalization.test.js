import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isEmptyImportVatRow,
  normalizeImportVatRows,
  hasImportVatRowFiscalSignificance,
} from '../domain/importContabilitaVatRowNormalization.js'
import { assessWorkingViewIvaDraftRows } from '../domain/importContabilitaDemoCausaliIva.js'
import {
  mapWorkingViewIvaDraftToCommitRows,
  buildDemoWorkingViewCommitConfirmMessage,
  evaluateDemo24EWorkingViewCommitGuards,
} from '../domain/importContabilitaDemoWorkingViewCommit.js'
import {
  evaluateRealImportStagingIdGuard,
  isDocumentiImportStagingUuid,
  resolveImportCommitFlowKind,
  REAL_IMPORT_STAGING_ID_BLOCKER,
} from '../domain/importContabilitaCommitFlow.js'
import { runCommitWorkflow } from '../application/importContabilitaWorkflow.js'
import { MockDbClient, makeValidCommitPayload } from './importContabilitaWorkflow.test.js'
import { buildImportContabilitaCommitPayload } from '../domain/buildImportContabilitaCommitPayload.js'

const REAL_UUID = '9539bde9-b325-4246-a20d-6c1b9408b48e'
const DEMO_SOCIETA = { id: 'demo-1', codice: '__TEST__FISCOSIM_DEMO', denominazione: 'FiscoSim Demo Test Lab SRL' }
const REAL_SOCIETA = { id: 'real-1', codice: 'STUDIO_REALE', denominazione: 'Studio Reale SRL' }

test('25A-FIX-4 — riga IVA 0/0 senza causale/natura è placeholder e viene prunata', () => {
  const row = { aliquota: 0, imponibile: 0, imposta: 0, causaleIvaId: '' }
  assert.equal(isEmptyImportVatRow(row), true)
  assert.equal(normalizeImportVatRows([row]).length, 0)
  const assessment = assessWorkingViewIvaDraftRows([row], { documentVatTotal: 0 })
  assert.equal(assessment.status, 'ok')
  assert.equal(mapWorkingViewIvaDraftToCommitRows([row]).length, 0)
})

test('25A-FIX-4 — riga IVA 0/0 con natura fiscalmente reale non viene prunata e blocca se incompleta', () => {
  const row = { aliquota: 0, imponibile: 0, imposta: 0, natura: 'N4', causaleIvaId: '' }
  assert.equal(hasImportVatRowFiscalSignificance(row), true)
  assert.equal(isEmptyImportVatRow(row), false)
  const assessment = assessWorkingViewIvaDraftRows([row], { documentVatTotal: 0 })
  assert.equal(assessment.status, 'blocked')
  assert.match(assessment.blockingIssues[0], /Causale IVA mancante/)
})

test('25A-FIX-4 — riga IVA 0/0 con causale reale non viene prunata', () => {
  const row = { aliquota: 0, imponibile: 0, imposta: 0, natura: 'N4', causaleIvaId: 'ci-esente' }
  const assessment = assessWorkingViewIvaDraftRows([row], { documentVatTotal: 0 })
  assert.equal(assessment.status, 'ok')
})

test('25A-FIX-4 — caso Vergnano multi-aliquota ignora placeholder 0%', () => {
  const rows = [
    { aliquota: 22, imponibile: 300, imposta: 66, causaleIvaId: 'ci-22' },
    { aliquota: 10, imponibile: 50, imposta: 5, causaleIvaId: 'ci-10' },
    { aliquota: 0, imponibile: 0, imposta: 0, causaleIvaId: '' },
  ]
  const pruned = normalizeImportVatRows(rows)
  assert.equal(pruned.length, 2)
  const assessment = assessWorkingViewIvaDraftRows(rows, { documentVatTotal: 71 })
  assert.equal(assessment.status, 'ok')
  const commitRows = mapWorkingViewIvaDraftToCommitRows(rows)
  assert.equal(commitRows.length, 2)
  assert.equal(commitRows[0].taxable + commitRows[1].taxable, 350)
  assert.equal(commitRows[0].tax + commitRows[1].tax, 71)
})

test('25A-FIX-4 — payload commit esclude righe IVA placeholder', () => {
  const payload = buildImportContabilitaCommitPayload({
    societaId: 'soc-1',
    operatorId: 'op-1',
    sourceRow: { id: '9539bde9-b325-4246-a20d-6c1b9408b48e', filename: 'vergnano.xml', tipo_documento: 'fattura_passiva' },
    sourceRowKey: '9539bde9-b325-4246-a20d-6c1b9408b48e',
    parsedDocument: {
      numeroDocumento: 'V-1',
      dataDocumento: '2026-07-07',
      imponibile: 350,
      iva: 71,
      totale: 421,
      rawXml: '<xml />',
      flags: { reverseCharge: false, hasRitenuta: false, isForeign: false },
    },
    registrationDate: '2026-07-07',
    counterpartyAccount: { id: 'forn-1', codice: '2.04.01' },
    costRevenueAccount: { id: 'cost-1', codice: '6.01.01' },
    causaleContabile: { id: 'caus-ff', codice: 'FF' },
    primaNotaDraftRows: [
      { accountId: 'cost-1', debit: 350, credit: 0 },
      { accountId: 'iva-1', debit: 71, credit: 0 },
      { accountId: 'forn-1', debit: 0, credit: 421 },
    ],
    ivaDraftRows: [
      { aliquota: 22, imponibile: 300, imposta: 66, causaleIvaId: 'ci-22' },
      { aliquota: 10, imponibile: 50, imposta: 5, causaleIvaId: 'ci-10' },
      { aliquota: 0, imponibile: 0, imposta: 0, causaleIvaId: '' },
    ],
  })
  assert.equal(payload.validation.blockers.length, 0)
  assert.equal(payload.payload.vat.rows.length, 2)
})

test('25A-FIX-4 — commit reale con UUID aggiorna staging', async () => {
  const db = new MockDbClient()
  db.responses.documenti_import = { id: REAL_UUID, stato: 'pending', metadata: {} }

  const commitPayload = makeValidCommitPayload()
  commitPayload.societa = REAL_SOCIETA
  commitPayload.sourceRow = { id: REAL_UUID, parsedDocument: { numeroDocumento: 'VERG-01' } }
  commitPayload.payload.handoff.sourceRowKey = REAL_UUID

  const res = await runCommitWorkflow(commitPayload, { db })
  assert.equal(res.success, true)
  const hasUpdate = db.log.some((entry) => entry.table === 'documenti_import' && entry.action === 'update')
  assert.equal(hasUpdate, true)
})

test('25A-FIX-4 — commit reale con ID sintetico bloccato prima del persist', async () => {
  const db = new MockDbClient()
  const commitPayload = makeValidCommitPayload()
  commitPayload.societa = REAL_SOCIETA
  commitPayload.sourceRow = { id: 'ic-1751890000000', parsedDocument: { numeroDocumento: 'VERG-01' } }
  commitPayload.payload.handoff.sourceRowKey = 'ic-1751890000000'

  const res = await runCommitWorkflow(commitPayload, { db })
  assert.equal(res.success, false)
  assert.ok(res.blockingReasons.some((reason) => reason.includes('ID staging valido')))
  const hasPnInsert = db.log.some((entry) => entry.table === 'prima_nota' && entry.action === 'insert')
  assert.equal(hasPnInsert, false)
})

test('25A-FIX-4 — commit Test Lab con ID sintetico consentito e staging saltato', async () => {
  const db = new MockDbClient()
  const commitPayload = makeValidCommitPayload()
  commitPayload.societa = DEMO_SOCIETA
  commitPayload.sourceRow = { id: 'test_lab_24f_20260707_TL-ACQ-03' }
  commitPayload.payload.handoff.sourceRowKey = 'test_lab_24f_20260707_TL-ACQ-03'
  commitPayload.payload.document.number = 'TL-ACQ-03'

  const res = await runCommitWorkflow(commitPayload, { db })
  assert.equal(res.success, true)
  assert.ok(res.warnings.some((warning) => /Test Lab|demo/i.test(warning)))
  const hasUpdate = db.log.some((entry) => entry.table === 'documenti_import' && entry.action === 'update')
  assert.equal(hasUpdate, false)
})

test('25A-FIX-4 — popup e guardia distinguono flusso reale vs Test Lab', () => {
  const model = {
    parsedDocument: { numeroDocumento: 'TL-ACQ-03' },
    fornitoreCliente: 'Fornitore Demo',
    imponibile: 1000,
    iva: 220,
    totale: 1220,
  }
  const demoMsg = buildDemoWorkingViewCommitConfirmMessage(model, [{ causaleIvaLabel: 'TESTLAB22' }], { isDemoSocieta: true })
  const realMsg = buildDemoWorkingViewCommitConfirmMessage(model, [{ causaleIvaLabel: 'IVA 22%' }], { isDemoSocieta: false })
  assert.match(demoMsg, /Test Lab\/demo/)
  assert.doesNotMatch(demoMsg, /contabilizzazione REALE del documento import/)
  assert.match(realMsg, /contabilizzazione REALE del documento import/)
  assert.doesNotMatch(realMsg, /documento demo selezionato/)

  assert.equal(resolveImportCommitFlowKind({ societa: DEMO_SOCIETA, documentId: 'row-1' }), 'test_lab')
  assert.equal(resolveImportCommitFlowKind({ societa: REAL_SOCIETA, documentId: REAL_UUID }), 'real_import')
  assert.equal(isDocumentiImportStagingUuid(REAL_UUID), true)
  assert.equal(isDocumentiImportStagingUuid('ic-123'), false)

  const stagingGuard = evaluateRealImportStagingIdGuard({ societa: REAL_SOCIETA, documentId: 'ic-123' })
  assert.equal(stagingGuard.allowed, false)
  assert.equal(stagingGuard.blockingIssue, REAL_IMPORT_STAGING_ID_BLOCKER)
})

test('25A-FIX-4 — regressione 25A-FIX-3: causale IVA reale mancante blocca ancora', () => {
  const model = {
    totale: 1220,
    iva: 220,
    costRevenueAccount: { id: 'cost' },
    counterpartyAccount: { id: 'forn' },
    causale: { id: 'caus-ff' },
    parsedDocument: { numeroDocumento: '123' },
    row: { id: REAL_UUID },
    rowKey: REAL_UUID,
    readiness: { ready: true },
  }
  const guard = evaluateDemo24EWorkingViewCommitGuards({
    societa: REAL_SOCIETA,
    activeWorkingViewModel: model,
    baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
    pnDraftRows: [
      { accountId: 'cost', dare: 1000 },
      { accountId: 'iva', dare: 220 },
      { accountId: 'forn', avere: 1220 },
    ],
    ivaDraftRows: [{ imponibile: 1000, imposta: 220, causaleIvaId: '' }],
    pianoConti: [{ id: 'iva', is_iva: true }],
  })
  assert.equal(guard.allowed, false)
  assert.ok(guard.blockingIssues.some((item) => /Causale IVA mancante/i.test(item)))
})
