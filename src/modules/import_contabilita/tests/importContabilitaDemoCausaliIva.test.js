import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterCausaliIvaForDemoWorkingView,
  resolveDemoCausaleIvaIdByAliquota,
  resolveImportWorkingViewCausaleIvaId,
  assessWorkingViewIvaDraftRows,
  mergeWorkingViewChecksWithIvaDraft,
} from '../domain/importContabilitaDemoCausaliIva.js'

const DEMO_SOCIETA_ID = 'demo-soc-1'

const DEMO_CAUSALI = [
  { id: 'tl22', codice: 'TESTLAB22', aliquota: 22, societaId: DEMO_SOCIETA_ID, descrizione: '[TEST_LAB] IMPONIBILE 22%' },
  { id: 'tl10', codice: 'TESTLAB10', aliquota: 10, societaId: DEMO_SOCIETA_ID, descrizione: '[TEST_LAB] IMPONIBILE 10%' },
  { id: 'tl04', codice: 'TESTLAB04', aliquota: 4, societaId: DEMO_SOCIETA_ID, descrizione: '[TEST_LAB] IMPONIBILE 4%' },
]

const GLOBAL_CAUSALI = [
  { id: 'a1', codice: 'A1', aliquota: 22, societaId: '', descrizione: 'Imponibile ordinario' },
  { id: 'a17', codice: 'A17', aliquota: 22, societaId: '', descrizione: 'Reverse charge intra UE' },
]

test('24D-FIX-2 — filter demo working view mostra solo TESTLAB', () => {
  const filtered = filterCausaliIvaForDemoWorkingView([...GLOBAL_CAUSALI, ...DEMO_CAUSALI], DEMO_SOCIETA_ID)
  assert.equal(filtered.length, 3)
  assert.deepEqual(filtered.map((row) => row.codice).sort(), ['TESTLAB04', 'TESTLAB10', 'TESTLAB22'])
})

test('24D-FIX-2 — autoproposta TESTLAB22 su aliquota 22%', () => {
  const id = resolveDemoCausaleIvaIdByAliquota(DEMO_CAUSALI, 22)
  assert.equal(id, 'tl22')
  const resolved = resolveImportWorkingViewCausaleIvaId({
    source: { aliquota: 22, imponibile: 1000, imposta: 220 },
    causaliIva: DEMO_CAUSALI,
    isDemoSocieta: true,
  })
  assert.equal(resolved, 'tl22')
})

test('24D-FIX-2 — causale IVA mancante blocca bozza', () => {
  const assessment = assessWorkingViewIvaDraftRows([
    { id: 'r1', aliquota: 22, imponibile: 1000, imposta: 220, causaleIvaId: '' },
  ])
  assert.equal(assessment.status, 'blocked')
  assert.match(assessment.blockingIssues[0], /Causale IVA mancante/)
})

test('24D-FIX-2 — bozza IVA completa non blocca', () => {
  const assessment = assessWorkingViewIvaDraftRows([
    { id: 'r1', aliquota: 22, imponibile: 1000, imposta: 220, causaleIvaId: 'tl22', causaleIvaLabel: 'TESTLAB22' },
  ])
  assert.equal(assessment.status, 'ok')
})

test('24D-FIX-2 — merge checks PN ok + IVA mancante => blocked', () => {
  const base = { status: 'ok', blockingIssues: [], warnings: [], checks: [] }
  const iva = assessWorkingViewIvaDraftRows([{ id: 'r1', imponibile: 100, imposta: 22, causaleIvaId: '' }])
  const merged = mergeWorkingViewChecksWithIvaDraft(base, iva)
  assert.equal(merged.status, 'blocked')
})

test('24D-FIX-2 — working view Import non invoca commit in onStartAccounting', async () => {
  const importSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../index.jsx', import.meta.url), 'utf8')
  )
  assert.doesNotMatch(importSource, /onStartAccounting[\s\S]{0,1200}runCommitWorkflow/)
  assert.doesNotMatch(importSource, /onStartAccounting[\s\S]{0,1200}persistPrimaNotaDraft/)
})
