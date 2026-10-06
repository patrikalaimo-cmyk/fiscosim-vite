import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  WORKING_TABLE_PAGE_SIZE,
  buildCausaliIvaLookupIndexes,
  buildPianoContiLookup,
  classifyCounterparty,
  createCounterpartyClassificationResolver,
  getAnagraficaDecisionKeyFromCounterparty,
  paginateWorkingTableRows,
} from '../domain/importContabilitaPerformanceIndexes.js'
import {
  TEST_VERGNANO_FIXTURE,
} from './fixtures/vergnanoSyntheticFixture.js'

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
  {
    ...TEST_VERGNANO_FIXTURE.accounts.counterparty,
    partitaIva: TEST_VERGNANO_FIXTURE.supplier.partitaIva,
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

test('25A-PERF-1 — cache matching: stessa chiave fornitore riusa lo stesso risultato', () => {
  const pianoLookup = buildPianoContiLookup(mockPianoConti)
  const resolve = createCounterpartyClassificationResolver({ societaId: 'soc-1', pianoLookup })
  const counterparty = { denominazione: 'Fornitore Pool 0 Srl', partitaIva: '10000000000' }

  const first = resolve(counterparty)
  const second = resolve({ ...counterparty })
  const results = Array.from({ length: 200 }, () => resolve({ ...counterparty }))

  assert.equal(first, second)
  assert.ok(results.every((item) => item === first))
  assert.equal(first.rank, 3)
  assert.equal(first.matchedPianoConto?.id, 'acc-1')
  assert.equal(getAnagraficaDecisionKeyFromCounterparty(counterparty), 'piva:10000000000')
})

test('25A-PERF-1 — match forte P.IVA coerente con piano conti', () => {
  const pianoLookup = buildPianoContiLookup(mockPianoConti)
  const result = classifyCounterparty({ partitaIva: '10000000001', denominazione: 'Altro nome' }, pianoLookup)
  assert.equal(result.rank, 3)
  assert.equal(result.matchedPianoConto?.id, 'acc-2')
})

test('TEST-BASELINE-1 — fornitore fixture noto con P.IVA forte non diventa nuova anagrafica', () => {
  const pianoLookup = buildPianoContiLookup(mockPianoConti)
  const result = classifyCounterparty(TEST_VERGNANO_FIXTURE.supplier, pianoLookup)

  assert.equal(result.rank, 3)
  assert.equal(result.status, 'già presente')
  assert.equal(result.matchedPianoConto?.id, TEST_VERGNANO_FIXTURE.accounts.counterparty.id)
})

test('25A-PERF-1 — fornitore nuovo resta rank 1', () => {
  const pianoLookup = buildPianoContiLookup(mockPianoConti)
  const result = classifyCounterparty({ partitaIva: '77777777777', denominazione: 'Nuovo Fornitore' }, pianoLookup)
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

test('TEST-BASELINE-1 — filtri, paginazione e selezione pagina non mutano il dataset globale da 500 documenti', () => {
  const rows = buildSyntheticStagingRows(500, 12)
  const originalIds = rows.map((row) => row.id)
  const filtered = rows.filter((row) => row.parsedDocument.fornitore.denominazione === 'Fornitore Pool 0 Srl')
  const page = paginateWorkingTableRows(filtered, 1, WORKING_TABLE_PAGE_SIZE)
  const selectedPageIds = new Set(page.rows.map((row) => row.id))

  assert.ok(filtered.length > 0)
  assert.ok(selectedPageIds.size <= WORKING_TABLE_PAGE_SIZE)
  assert.equal(rows.length, 500)
  assert.deepEqual(rows.map((row) => row.id), originalIds)
})

test('TEST-BASELINE-1 — production path memoizza indici e readiness batch prima dei consumer', async () => {
  const source = await readFile(new URL('../index.jsx', import.meta.url), 'utf8')

  assert.match(
    source,
    /const pianoLookup = useMemo\(\s*\(\) => buildPianoContiLookup\(/,
    'piano conti deve essere indicizzato via useMemo nel production path',
  )
  assert.match(
    source,
    /createCounterpartyClassificationResolver\(\{ societaId: selectedSocietaId, pianoLookup \}\)/,
    'matching fornitore deve usare resolver con cache condivisa',
  )
  assert.match(
    source,
    /const workingTableReadinessByRowId = useMemo\(\(\) => \{/,
    'readiness deve essere calcolata in una mappa memoizzata per batch',
  )
  assert.match(
    source,
    /readinessByRowId: workingTableReadinessByRowId/,
    'filtri devono consumare la mappa readiness invece di ricalcolare ogni documento',
  )
  assert.match(
    source,
    /workingTableReadinessByRowId=\{workingTableReadinessByRowId\}/,
    'Working Table deve ricevere la stessa cache readiness',
  )
})
