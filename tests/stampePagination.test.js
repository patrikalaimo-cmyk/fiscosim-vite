import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllStampeRows, chunkStampeIds } from '../src/modules/contabilita/application/stampe/fetchAllStampeRows.js'
import { readFile } from 'node:fs/promises'

function fakeQuery(rows, { failPage = -1, overlapPage = -1, pageSize = 500 } = {}) {
  const calls = []
  const buildQuery = () => ({
    async range(from, to) {
      calls.push({ from, to })
      const page = Math.floor(from / pageSize)
      if (page === failPage) return { data: null, error: new Error('page_read_failed') }
      const data = rows.slice(from, to + 1)
      if (page === overlapPage && data.length) data[0] = rows[0]
      return { data, error: null }
    },
  })
  return { buildQuery, calls }
}

test('registro oltre 1000 righe: lettura completa, ordinate e nessuna perdita', async () => {
  const rows = Array.from({ length: 1234 }, (_, i) => ({ id: `vat-${i + 1}`, order: i }))
  const { buildQuery, calls } = fakeQuery(rows)
  const result = await fetchAllStampeRows(buildQuery)
  assert.equal(result.length, 1234)
  assert.deepEqual(result.map((row) => row.id), rows.map((row) => row.id))
  assert.deepEqual(calls.map((row) => row.from), [0, 500, 1000])
})

test('multiplo esatto di pageSize: una pagina finale vuota non duplica righe', async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `pn-${i}` }))
  const { buildQuery, calls } = fakeQuery(rows)
  const result = await fetchAllStampeRows(buildQuery)
  assert.equal(result.length, 1000)
  assert.equal(calls.length, 3)
})

test('pagina con errore: export fallisce senza restituire dataset parziale', async () => {
  const rows = Array.from({ length: 1002 }, (_, i) => ({ id: `row-${i}` }))
  const { buildQuery } = fakeQuery(rows, { failPage: 1 })
  await assert.rejects(fetchAllStampeRows(buildQuery), /page_read_failed/)
})

test('pagina duplicata o ID mancante: fail closed', async () => {
  const rows = Array.from({ length: 1002 }, (_, i) => ({ id: `row-${i}` }))
  await assert.rejects(fetchAllStampeRows(fakeQuery(rows, { overlapPage: 1 }).buildQuery), /record duplicato/)
  await assert.rejects(fetchAllStampeRows(fakeQuery([{ value: 1 }]).buildQuery), /riga priva di ID/)
})

test('paginazione senza termine: stop esplicito, mai ciclo infinito', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `row-${i}` }))
  await assert.rejects(fetchAllStampeRows(fakeQuery(rows).buildQuery, { maxPages: 2 }), /limite paginazione/)
})

test('identificativi per join partitario e PN raggruppati in batch deduplicati', () => {
  const ids = ['a', 'b', 'a', 'c', 'd', 'e']
  assert.deepEqual(chunkStampeIds(ids, 2), [['a', 'b'], ['c', 'd'], ['e']])
  assert.deepEqual(chunkStampeIds([], 2), [])
})

test('repository stampe usa paginazione completa e nessun limite 999', async () => {
  const source = await readFile(new URL('../src/modules/contabilita/data/contabilitaRepo.js', import.meta.url), 'utf8')
  const start = source.indexOf('export async function getRegistriIvaPerStampa')
  const stop = source.indexOf('export async function getStampeDefinitiveValide', start)
  const block = source.slice(start, stop)
  assert.match(block, /fetchAllStampeRows\(/)
  assert.match(block, /chunkStampeIds\(/)
  assert.doesNotMatch(block, /1000 o più|rows\.length >= 1000|headers\.length >= 1000/)
})
