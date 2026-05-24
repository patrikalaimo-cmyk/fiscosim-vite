import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mapCommitPayloadToDocumentoContabilita,
  mapCommitPayloadToFinalization,
  mapCommitPayloadToPrimaNota,
  mapCommitPayloadToPrimaNotaRighe,
} from '../domain/accountingCommitPayload.js'

function normalizedFixture() {
  return {
    company: { societaId: 'soc-1' },
    raw: {
      handoff: {
        sourceFileName: 'fattura-passiva-001.xml',
      },
    },
    document: {
      id: 'doc-1',
      type: 'fattura_passiva',
      registrationDate: '2026-04-30',
      documentDate: '2026-04-29',
      number: 'F-100',
      counterparty: { accountId: 'acc-1', accountCode: 'CF001', name: 'Fornitore' },
      totals: { taxable: 100, vat: 22, total: 122 },
      description: 'Acquisto merci',
    },
    accounting: { causaleContabile: { id: 'caus-1', code: 'FF' } },
    accountingRows: [
      { lineNumber: 1, accountId: 'costo', accountCode: '4.01', description: 'Costo', debit: 122, credit: 0 },
      { lineNumber: 2, accountId: 'forn', accountCode: '2.01', description: 'Fornitore', debit: 0, credit: 122 },
    ],
  }
}

test('documenti_contabilita mapper avoids legacy fields', () => {
  const mapped = mapCommitPayloadToDocumentoContabilita(normalizedFixture(), { operatorId: 'op-1', now: '2026-04-30' })
  const serialized = JSON.stringify(mapped)
  assert.ok(!serialized.includes('documento_import_id'))
  assert.ok(!serialized.includes('accounting_entries'))
  assert.ok(!serialized.includes('partitari'))
  assert.equal(mapped.societa_id, 'soc-1')
  assert.equal(mapped.filename, 'fattura-passiva-001.xml')
})

test('prima_nota and righe mapping generate expected drafts', () => {
  const normalized = normalizedFixture()
  const pn = mapCommitPayloadToPrimaNota(normalized, { operatorId: 'op-1' })
  const righe = mapCommitPayloadToPrimaNotaRighe(normalized)
  assert.equal(pn.causale_codice, 'FF')
  assert.equal(pn.esercizio, 2026)
  assert.equal(pn.conto_cliente_fornitore_id, 'acc-1')
  assert.equal(pn.tipo_registrazione, 'import_contabilita')
  assert.equal(pn.documento_id, '__DOCUMENTI_CONTABILITA_ID__')
  assert.ok(!('cliente_fornitore_id' in pn))
  assert.equal(righe.length, 2)
  assert.equal(righe[0].riga_numero, 1)
  assert.deepEqual(Object.keys(righe[0]), [
    'riga_numero',
    'conto_id',
    'conto_codice',
    'conto_descrizione',
    'descrizione_riga',
    'importo_dare',
    'importo_avere',
  ])
})

test('mappers use totals.gross when totals.total is missing', () => {
  const normalized = normalizedFixture()
  normalized.document.totals = { taxable: 100, vat: 22, gross: 122 }
  const doc = mapCommitPayloadToDocumentoContabilita(normalized)
  const pn = mapCommitPayloadToPrimaNota(normalized)
  assert.equal(doc.totale, 122)
  assert.equal(pn.totale_dare, 122)
  assert.equal(pn.totale_avere, 122)
})

test('prima_nota uses ctx registration number when provided', () => {
  const pn = mapCommitPayloadToPrimaNota(normalizedFixture(), { registrationNumber: 57 })
  assert.equal(pn.numero_registrazione, 57)
})

test('documenti_contabilita mapper reads counterparty vatNumber and taxCode fallback', () => {
  const normalized = normalizedFixture()
  normalized.document.counterparty = {
    accountId: 'acc-1',
    accountCode: 'CF001',
    name: 'Fornitore',
    vatNumber: 'IT12345678901',
    taxCode: 'ABCDEF12G34H567I',
  }
  const doc = mapCommitPayloadToDocumentoContabilita(normalized)
  assert.equal(doc.soggetto_piva, 'IT12345678901')
  assert.equal(doc.soggetto_cf, 'ABCDEF12G34H567I')
})

test('finalization mapper defines document finalization contract without legacy fields', () => {
  const finalization = mapCommitPayloadToFinalization(normalizedFixture(), { operatorId: 'op-1', now: '2026-04-30' })
  const serialized = JSON.stringify(finalization)
  assert.equal(finalization.targetTable, 'documenti_contabilita')
  assert.equal(finalization.targetStatus, 'registered')
  assert.equal(finalization.workflowStatus, 'registered')
  assert.equal(finalization.validationStatus, 'validated')
  assert.equal(finalization.primaNotaIdField, 'prima_nota_id')
  assert.equal(finalization.primaNotaIdPlaceholder, '__PRIMA_NOTA_ID__')
  assert.equal(finalization.registeredBy, 'op-1')
  assert.equal(finalization.registeredAt, '2026-04-30')
  assert.equal(finalization.sourceModule, 'import_contabilita')
  assert.deepEqual(finalization.stateTransition, {
    from: ['draft', 'validated'],
    inFlight: 'registering',
    success: 'registered',
    failure: 'failed',
    compensationFallback: 'validated',
  })
  assert.ok(!serialized.includes('"documenti_import"'))
  assert.ok(!serialized.includes('"updateDocumentiImport"'))
  assert.ok(!serialized.includes('"accounting_entries"'))
  assert.ok(!serialized.includes('"partitari"'))
  assert.ok(!serialized.includes('"primaNotaId":"'))
})

test('finalization mapper reads source metadata from handoff', () => {
  const normalized = normalizedFixture()
  normalized.raw = {
    handoff: {
      sourceBatchId: 'batch-77',
      sourceRowKey: 'row-22',
    },
  }
  const finalization = mapCommitPayloadToFinalization(normalized, { operatorId: 'op-1' })
  assert.equal(finalization.sourceBatchId, 'batch-77')
  assert.equal(finalization.sourceRowKey, 'row-22')
})
