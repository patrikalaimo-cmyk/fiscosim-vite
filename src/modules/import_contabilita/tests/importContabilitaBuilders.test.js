import test from 'node:test'
import assert from 'node:assert/strict'

import { buildBatchReport, buildReportItem, buildStagingRow } from '../application/importContabilitaBuilders.js'
import { STAGING_STATES } from '../domain/stagingContract.js'
import { REPORT_OUTCOMES } from '../domain/reportContract.js'
import { createEmptyParsedDocument } from '../domain/parserContract.js'

function makeParsed(overrides = {}) {
  return {
    ...createEmptyParsedDocument(),
    filename: 'demo.xml',
    sourceHash: 'hash-demo',
    tipoDocumento: 'TD01',
    dataDocumento: '2026-04-24',
    numeroDocumento: 'A/1',
    fornitore: { denominazione: 'Fornitore', partitaIva: 'IT1', codiceFiscale: '' },
    cliente: { denominazione: 'Cliente', partitaIva: 'IT2', codiceFiscale: '' },
    imponibile: 100,
    iva: 22,
    totale: 122,
    ivaRows: [{ aliquota: 22, natura: '', imponibile: 100, imposta: 22 }],
    flags: { reverseCharge: false, splitPayment: false, hasRitenuta: false, isProfessional: false },
    warnings: [],
    errors: [],
    rawXml: '<FatturaElettronica />',
    lineeDocumento: [{ numeroLinea: 1, descrizione: 'Riga 1', quantita: 1, prezzoUnitario: 100, prezzoTotale: 100 }],
    ...overrides,
  }
}

test('parsed pulito -> staging imported', () => {
  const staging = buildStagingRow(makeParsed(), { batchId: 'batch-1', id: 'row-1' })
  assert.equal(staging.id, 'row-1')
  assert.equal(staging.batchId, 'batch-1')
  assert.equal(staging.filename, 'demo.xml')
  assert.equal(staging.state, STAGING_STATES.imported)
  assert.deepEqual(staging.blockingErrors, [])
  assert.deepEqual(staging.warnings, [])
  assert.equal(staging.parsedDocument.rawXml, '<FatturaElettronica />')
})

test('parsed con warning -> review_pending', () => {
  const staging = buildStagingRow(makeParsed({ warnings: [{ code: 'warn-1', message: 'x' }] }), {
    batchId: 'batch-1',
    id: 'row-2',
  })
  assert.equal(staging.state, STAGING_STATES.review_pending)
  assert.equal(staging.warnings.length, 1)
})

test('parsed con error -> error', () => {
  const staging = buildStagingRow(makeParsed({ errors: [{ code: 'err-1', message: 'x' }] }), {
    batchId: 'batch-1',
    id: 'row-3',
  })
  assert.equal(staging.state, STAGING_STATES.error)
  assert.equal(staging.blockingErrors.length, 1)
})

test('parsed pulito -> report imported', () => {
  const reportItem = buildReportItem(makeParsed(), { id: 'row-1' })
  assert.equal(reportItem.outcome, REPORT_OUTCOMES.imported)
  assert.equal(reportItem.severity, 'info')
  assert.equal(reportItem.reasonCode, 'imported')
})

test('parsed con warning -> warning_reimport', () => {
  const reportItem = buildReportItem(makeParsed({ warnings: [{ code: 'warn-1', message: 'x' }] }), { id: 'row-2' })
  assert.equal(reportItem.outcome, REPORT_OUTCOMES.warning_reimport)
  assert.equal(reportItem.severity, 'warning')
  assert.equal(reportItem.reasonCode, 'warn-1')
})

test('parsed con error -> parse_error', () => {
  const reportItem = buildReportItem(makeParsed({ errors: [{ code: 'err-1', message: 'x' }] }), { id: 'row-3' })
  assert.equal(reportItem.outcome, REPORT_OUTCOMES.parse_error)
  assert.equal(reportItem.severity, 'error')
  assert.equal(reportItem.reasonCode, 'err-1')
  assert.equal(reportItem.errorsCount, 1)
})

test('batch report totals coerenti', () => {
  const batch = buildBatchReport(
    [
      makeParsed(),
      makeParsed({ warnings: [{ code: 'warn-1', message: 'x' }] }),
      makeParsed({ errors: [{ code: 'err-1', message: 'x' }] }),
    ],
    { batchId: 'batch-x', startedAt: '2026-04-24T10:00:00.000Z', finishedAt: '2026-04-24T10:00:01.000Z' },
  )

  assert.equal(batch.batchId, 'batch-x')
  assert.equal(batch.items.length, 3)
  assert.equal(batch.totals.files, 3)
  assert.equal(batch.totals.imported, 1)
  assert.equal(batch.totals.warnings, 1)
  assert.equal(batch.totals.errors, 1)
  assert.equal(batch.totals.blocked, 0)
})
