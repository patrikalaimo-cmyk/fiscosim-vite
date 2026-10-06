import test from 'node:test'
import assert from 'node:assert/strict'

import {
  WORKING_TABLE_PAGE_SIZE,
  buildCausaliIvaLookupIndexes,
  buildPianoContiLookup,
  classifyCounterparty,
  createCounterpartyClassificationResolver,
  getAnagraficaDecisionKeyFromCounterparty,
  paginateWorkingTableRows,
} from '../domain/importContabilitaPerformanceIndexes.js'

function buildSyntheticStagingRows(count, supplierPoolSize = 12) {
  const rows = []
  for (let index = 0; index < count; index += 1) {
    const supplierIndex = index % supplierPoolSize
    const piva = `IT${String(10000000000 + supplierIndex).slice(-11)}`
    rows.push({
      id: `doc-${index}`,
      filename: `fattura-${index}.xml`,
      state: 'imported',
      parsedDocument: {
        numeroDocumento: `FT-${index}`,
        dataDocumento: '2026-04-15',
        imponibile: 100 + index,
        iva: 22,
        totale: 122 + index,
        fornitore: {
          denominazione: `Fornitore Pool ${supplierIndex} Srl`,
          partitaIva: piva,
        },
        ivaRows: [{ aliquota: 22, imponibile: 100, imposta: 22 }],
      },
    })
  }
  return rows
}

const mockPianoConti = [
  {
    id: 'acc-1',
    codice: '2.03.08.001',
    descrizione: 'Fornitore Pool 0 Srl',
    partitaIva: '10000000000',
  },
  {
    id: 'acc-2',
    codice: '2.03.08.002',
    descrizione: 'Fornitore Pool 1 Srl',
    partitaIva: '10000000001',
  },
]

test('25A-PERF-1 — paginazione 500 documenti: 5 pagine da 100', () => {
  const rows = buildSyntheticStagingRows(500)
  const page1 = paginateWorkingTableRows(rows, 1, WORKING_TABLE_PAGE_SIZE)
  const page5 = paginateWorkingTableRows(rows, 5, WORKING_TABLE_PAGE_SIZE)

  assert.equal(page1.totalRows, 500)
  assert.equal(page1.totalPages, 5)
  assert.equal(page1.rows.length, 100)
  assert.equal(page5.page, 5)
  assert.equal(page5.rows.length, 100)
  assert.equal(page5.rows[0].id, 'doc-400')
})

test('25A-PERF-1 — cache matching: stesso fornitore su molte fatture produce stesso rank', () => {
  const pianoLookup = buildPianoContiLookup(mockPianoConti)
  const resolve = createCounterpartyClassificationResolver({ societaId: 'soc-1', pianoLookup })
  const counterparty = { denominazione: 'Fornitore Pool 0 Srl', partitaIva: '10000000000' }

  const results = Array.from({ length: 200 }, () => resolve(counterparty))
  assert.ok(results.every((item) => item.rank === 3))
  assert.ok(results.every((item) => item.matchedPianoConto?.id === 'acc-1'))
  assert.equal(getAnagraficaDecisionKeyFromCounterparty(counterparty), 'piva:10000000000')
})

test('25A-PERF-1 — match forte P.IVA coerente con piano conti', () => {
  const pianoLookup = buildPianoContiLookup(mockPianoConti)
  const result = classifyCounterparty({ partitaIva: '10000000001', denominazione: 'Altro nome' }, pianoLookup)
  assert.equal(result.rank, 3)
  assert.equal(result.matchedPianoConto?.id, 'acc-2')
})

test('25A-PERF-1 — fornitore nuovo resta rank 1', () => {
  const pianoLookup = buildPianoContiLookup(mockPianoConti)
  const result = classifyCounterparty({ partitaIva: '99999999999', denominazione: 'Nuovo Fornitore' }, pianoLookup)
  assert.equal(result.rank, 1)
  assert.equal(result.status, 'nuova')
})

test('25A-PERF-1 — indici causali IVA per id/aliquota', () => {
  const indexes = buildCausaliIvaLookupIndexes([
    { id: 'iva-22', aliquota: 22, codice: 'AF22' },
    { id: 'iva-10', aliquota: 10, codice: 'AF10' },
    { id: 'iva-22b', aliquota: 22, codice: 'AF22B' },
  ])
  assert.equal(indexes.byId.get('iva-22')?.codice, 'AF22')
  assert.equal(indexes.byAliquota.get(22)?.length, 2)
})

test('25A-PERF-1 — dataset 500: chiavi decisione fornitore senza duplicati logici eccessivi', () => {
  const rows = buildSyntheticStagingRows(500, 12)
  const keys = new Set()
  rows.forEach((row) => {
    const cp = row.parsedDocument.fornitore
    keys.add(getAnagraficaDecisionKeyFromCounterparty(cp))
  })
  assert.equal(keys.size, 12)
})
