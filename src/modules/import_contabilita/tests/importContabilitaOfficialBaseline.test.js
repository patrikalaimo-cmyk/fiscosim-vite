import test from 'node:test'
import assert from 'node:assert/strict'

import { assessWorkingViewIvaDraftRows } from '../domain/importContabilitaDemoCausaliIva.js'
import { mapWorkingViewIvaDraftToCommitRows } from '../domain/importContabilitaDemoWorkingViewCommit.js'
import {
  rebuildImportWorkingViewIvaDraftRows,
  getEffectiveImportWorkingViewIvaDraftRows,
} from '../domain/importContabilitaWorkingViewIvaDraft.js'
import {
  buildContabilitaPayloadFromImportRow,
  buildImportContabilitaCommitPayload,
} from '../domain/buildImportContabilitaCommitPayload.js'
import {
  runCommitWorkflow,
  runImportWorkflow,
} from '../application/importContabilitaWorkflow.js'
import {
  TEST_VERGNANO_CAUSALI_IVA,
  TEST_VERGNANO_DOCUMENT_ID,
  TEST_VERGNANO_FIXTURE,
  TEST_VERGNANO_XML,
  buildTestVergnanoCausaliIvaById,
  buildTestVergnanoCommitInput,
} from './fixtures/vergnanoSyntheticFixture.js'

function buildWorkingRows(previousRows = []) {
  return rebuildImportWorkingViewIvaDraftRows({
    parsedDocument: TEST_VERGNANO_FIXTURE.parsedDocument,
    previousRows,
    causaliIva: TEST_VERGNANO_CAUSALI_IVA,
    causaliIvaById: buildTestVergnanoCausaliIvaById(),
    isDemoSocieta: false,
    createRowId: (() => {
      let id = 0
      return () => `test-iva-row-${++id}`
    })(),
  })
}

test('TEST-BASELINE-1 — Working View usa solo IVA 22/10, assegna standard e ignora placeholder 0/0', () => {
  const rows = buildWorkingRows()
  const effectiveRows = getEffectiveImportWorkingViewIvaDraftRows(rows)

  assert.equal(effectiveRows.length, 2)
  assert.deepEqual(effectiveRows.map((row) => row.aliquota), [22, 10])
  assert.deepEqual(
    effectiveRows.map((row) => row.causaleIvaId),
    ['test-iva-22-standard', 'test-iva-10-standard'],
  )

  const assessment = assessWorkingViewIvaDraftRows(
    [
      ...effectiveRows,
      { aliquota: 0, imponibile: 0, imposta: 0, causaleIvaId: '' },
    ],
    { documentVatTotal: 71 },
  )
  assert.equal(assessment.status, 'ok')
})

test('TEST-BASELINE-1 — override manuale causale IVA prevale e resta preservato al rebuild', () => {
  const firstBuild = buildWorkingRows()
  const manualRows = firstBuild.map((row) => (
    row.aliquota === 22
      ? {
          ...row,
          causaleIvaId: 'test-iva-22-manual',
          causaleIvaManual: true,
        }
      : row
  ))

  const rebuilt = buildWorkingRows(manualRows)
  const row22 = rebuilt.find((row) => row.aliquota === 22)

  assert.ok(row22)
  assert.equal(row22.causaleIvaId, 'test-iva-22-manual')
  assert.equal(row22.causaleIvaManual, true)
})

test('TEST-BASELINE-1 — commit payload contiene 2 righe IVA effettive, dati fiscali conservati e PN bilanciata', () => {
  const workingRows = buildWorkingRows()
  const commitRows = mapWorkingViewIvaDraftToCommitRows(workingRows)
  const input = buildTestVergnanoCommitInput([
    ...commitRows,
    { aliquota: 0, imponibile: 0, imposta: 0, causaleIvaId: '' },
  ])

  const result = buildImportContabilitaCommitPayload(input)

  assert.equal(result.validation.blockers.length, 0)
  assert.equal(result.payload.accounting.isBalanced, true)
  assert.equal(result.payload.accounting.totals.debit, 421)
  assert.equal(result.payload.accounting.totals.credit, 421)
  assert.equal(result.payload.vat.rows.length, 2)
  assert.deepEqual(
    result.payload.vat.rows.map((row) => ({
      aliquota: row.rate,
      imponibile: row.taxable,
      imposta: row.tax,
      causaleIvaId: row.causaleIvaId,
    })),
    [
      {
        aliquota: 22,
        imponibile: 300,
        imposta: 66,
        causaleIvaId: 'test-iva-22-standard',
      },
      {
        aliquota: 10,
        imponibile: 50,
        imposta: 5,
        causaleIvaId: 'test-iva-10-standard',
      },
    ],
  )
})

test('TEST-BASELINE-1 — readiness pronta con conti/causali valorizzati e placeholder 0/0 non bloccante', () => {
  const workingRows = buildWorkingRows()
  const result = buildContabilitaPayloadFromImportRow(
    buildTestVergnanoCommitInput([
      ...mapWorkingViewIvaDraftToCommitRows(workingRows),
      { aliquota: 0, imponibile: 0, imposta: 0, causaleIvaId: '' },
    ]),
  )

  assert.equal(result.validation.status, 'ok')
  assert.equal(result.readiness.status, 'pronto_per_contabilita')
  assert.equal(result.payload.vat.rows.length, 2)
})

test('TEST-BASELINE-1 — readiness blocca una riga IVA fiscalmente significativa priva di causale', () => {
  const workingRows = buildWorkingRows()
  const commitRows = mapWorkingViewIvaDraftToCommitRows(workingRows)
  const incompleteRows = commitRows.map((row) => (
    row.rate === 10 || row.aliquota === 10
      ? { ...row, causaleIvaId: '' }
      : row
  ))

  const result = buildContabilitaPayloadFromImportRow(
    buildTestVergnanoCommitInput(incompleteRows),
  )

  assert.equal(result.validation.status, 'blocked')
  assert.equal(result.readiness.status, 'incompleto')
  assert.ok(result.validation.blockers.includes('causale IVA mancante su riga IVA'))
})

test('TEST-BASELINE-1 — documento già registrato è escluso dalle viste operative di import', async () => {
  const result = await runImportWorkflow(
    [{ name: TEST_VERGNANO_FIXTURE.sourceRow.filename, text: async () => TEST_VERGNANO_XML }],
    {
      batchId: 'batch-test-registered-dedup',
      dedupCandidates: {
        stagingRows: [],
        accountingRows: [
          {
            id: 'documento-contabilita-test',
            numero_documento: TEST_VERGNANO_FIXTURE.parsedDocument.numeroDocumento,
            data_documento: TEST_VERGNANO_FIXTURE.parsedDocument.dataDocumento,
            tipo_documento: TEST_VERGNANO_FIXTURE.parsedDocument.tipoDocumento,
            soggetto_denominazione: TEST_VERGNANO_FIXTURE.supplier.denominazione,
            soggetto_piva: TEST_VERGNANO_FIXTURE.supplier.partitaIva,
            soggetto_cf: TEST_VERGNANO_FIXTURE.supplier.codiceFiscale,
            validation_status: 'registered',
            workflow_status: 'registered',
            totale: TEST_VERGNANO_FIXTURE.parsedDocument.totale,
            registered_at: '2026-10-01T08:00:00.000Z',
            prima_nota_id: 'prima-nota-test',
          },
        ],
      },
    },
  )

  assert.equal(result.ok, true)
  assert.equal(result.stagingRows.length, 0)
  assert.equal(result.report.duplicateInAccountingCount, 1)
  assert.equal(result.report.duplicateInAccountingRows[0].classification, 'duplicateInAccounting')
})

test('TEST-BASELINE-1 — secondo commit dello stesso documento già processed/committed viene bloccato prima del persist', async () => {
  const db = {
    from(table) {
      assert.equal(table, 'documenti_import')
      const chain = {
        select() {
          return chain
        },
        eq(field, value) {
          assert.equal(field, 'id')
          assert.equal(value, TEST_VERGNANO_DOCUMENT_ID)
          return chain
        },
        async maybeSingle() {
          return { data: { stato: 'processed' }, error: null }
        },
      }
      return chain
    },
  }

  const result = await runCommitWorkflow(
    {
      societaId: TEST_VERGNANO_FIXTURE.societaId,
      registrationDate: TEST_VERGNANO_FIXTURE.registrationDate,
      societa: {
        id: TEST_VERGNANO_FIXTURE.societaId,
        codice: 'SOCIETA_TEST_BASELINE',
        denominazione: 'Societa Test Baseline Srl',
      },
      sourceRow: { ...TEST_VERGNANO_FIXTURE.sourceRow },
    },
    { db },
  )

  assert.equal(result.success, false)
  assert.ok(result.blockingReasons.includes('Documento già contabilizzato.'))
})
