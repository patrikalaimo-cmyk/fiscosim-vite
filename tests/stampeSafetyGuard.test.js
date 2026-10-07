import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = async (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('non si visualizzano fac-simile come stampe contabili reali', async () => {
  const source = await read('../src/modules/contabilita/views/StampeView.jsx')
  const start = source.indexOf('export default function StampeView(')
  const end = source.indexOf('const partitariMockData', start)
  assert.ok(start >= 0 && end > start)
  const entrypoint = source.slice(start, end)
  assert.match(entrypoint, /if \(\['partitari', 'mastrini', 'bilancio'\]\.includes\(contTab\)\)/)
  assert.match(entrypoint, /Nessun dato di esempio è disponibile/)
  const guardPos = entrypoint.indexOf("if (['partitari', 'mastrini', 'bilancio'].includes(contTab))")
  const detailPos = entrypoint.search(/return\s*\(\s*<StampeDetailView/)
  assert.ok(guardPos >= 0 && detailPos >= 0 && guardPos < detailPos)
})

test('gli arricchimenti dei registri IVA sono tenant scoped e falliscono in modo esplicito', async () => {
  const source = await read('../src/modules/contabilita/data/contabilitaRepo.js')
  const start = source.indexOf('export async function getRegistriIvaPerStampa')
  const end = source.indexOf('export async function getLibroGiornalePerStampa', start)
  assert.ok(start >= 0 && end > start)
  const body = source.slice(start, end)
  assert.match(body, /\.from\('registri_iva'\)/)
  assert.match(body, /\.from\('causali_iva'\)[\s\S]*?\.eq\('societa_id', societaId\)/)
  assert.match(body, /\.from\('prima_nota'\)[\s\S]*?\.eq\('societa_id', societaId\)/)
  assert.match(body, /if \(error\) throw error/)
  assert.match(body, /return \{ data: \[\], error \}/)
  assert.match(body, /collegamento Prima Nota mancante/)
})

test('periodi grandi non generano export troncati in silenzio', async () => {
  const source = await read('../src/modules/contabilita/data/contabilitaRepo.js')
  const vat = source.slice(source.indexOf('export async function getRegistriIvaPerStampa'), source.indexOf('export async function getLibroGiornalePerStampa'))
  const journal = source.slice(source.indexOf('export async function getLibroGiornalePerStampa'), source.indexOf('export async function getStampeDefinitiveValide'))
  assert.match(vat, /fetchAllStampeRows\(/)
  assert.match(journal, /fetchAllStampeRows\(/)
  assert.match(journal, /chunkStampeIds\(/)
  assert.doesNotMatch(vat, /rows\.length >= 1000/)
  assert.doesNotMatch(journal, /headers\.length >= 1000/)
})

test('la stampa provvisoria non dichiara falsamente una singola pagina', async () => {
  const source = await read('../src/modules/contabilita/application/stampe/exportStampeProvvisorie.js')
  assert.equal(source.includes('Pagina 1 di 1'), false)
  assert.match(source, /Paginazione del browser - non definitiva/)
})
