import test from 'node:test'
import assert from 'node:assert/strict'
import { mapImportContabilitaCommitPayloadToCanonical, resolveImportCommitPrimaNotaStato } from '../../contabilita/canonical/mappers/mapImportContabilitaCommitPayloadToCanonical.js'
import {
  buildWorkingViewPrimaNotaDraftRowsFromModel,
  evaluateDemo24EWorkingViewCommitGuards,
  buildDemoWorkingViewCommitBundle,
  formatDemoWorkingViewCommitReport,
  buildDemoWorkingViewCommitConfirmMessage,
} from '../domain/importContabilitaDemoWorkingViewCommit.js'

const DEMO_SOCIETA = { id: 'demo-1', codice: '__TEST__FISCOSIM_DEMO', denominazione: 'FiscoSim Demo Test Lab SRL' }

const TL_ACQ_MODEL = {
  rowKey: 'row-1',
  row: { id: 'row-1', filename: 'test_lab_acq_01.xml', state: 'ready' },
  readiness: { ready: true },
  parsedDocument: {
    numeroDocumento: 'TL-ACQ-01',
    dataDocumento: '2026-04-15',
    imponibile: 1000,
    iva: 220,
    totale: 1220,
    fornitore: { denominazione: 'Demo 22 S.r.l.' },
  },
  registrationDate: '2026-04-15',
  fornitoreCliente: 'Demo 22 S.r.l.',
  imponibile: 1000,
  iva: 220,
  totale: 1220,
  costRevenueAccount: { id: 'acc-cost', codice: '6 01 001' },
  counterpartyAccount: { id: 'acc-forn', codice: '2 04 02 0001' },
  causale: { id: 'caus-ff', codice: 'FF' },
}

const PIANO_CONTI = [
  { id: 'acc-cost', codice: '6 01 001' },
  { id: 'acc-iva', codice: '1 02 40 0001', is_iva: true },
  { id: 'acc-forn', codice: '2 04 02 0001' },
]

test('24E — commit bloccato se più di 1 riga selezionata', () => {
  const guard = evaluateDemo24EWorkingViewCommitGuards({
    societa: DEMO_SOCIETA,
    selectedRowIds: new Set(['a', 'b']),
    workingViewOpen: true,
    workingViewRowId: 'row-1',
    activeWorkingViewModel: TL_ACQ_MODEL,
    baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
    ivaDraftRows: [{ imponibile: 1000, imposta: 220, causaleIvaId: 'tl22' }],
    pianoConti: PIANO_CONTI,
  })
  assert.equal(guard.allowed, false)
  assert.ok(guard.blockingIssues.some((item) => /esattamente 1 riga/i.test(item)))
})

test('24E — commit bloccato se causale IVA mancante', () => {
  const guard = evaluateDemo24EWorkingViewCommitGuards({
    societa: DEMO_SOCIETA,
    selectedRowIds: new Set(['row-1']),
    workingViewOpen: true,
    workingViewRowId: 'row-1',
    activeWorkingViewModel: TL_ACQ_MODEL,
    baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
    ivaDraftRows: [{ imponibile: 1000, imposta: 220, causaleIvaId: '' }],
    pianoConti: PIANO_CONTI,
  })
  assert.equal(guard.allowed, false)
  assert.ok(guard.blockingIssues.some((item) => /Causale IVA mancante/i.test(item)))
})

test('24E — commit bloccato su società reale', () => {
  const guard = evaluateDemo24EWorkingViewCommitGuards({
    societa: { id: 'real', codice: 'SIRIA', denominazione: 'Demo fake name' },
    selectedRowIds: new Set(['row-1']),
    workingViewOpen: true,
    workingViewRowId: 'row-1',
    activeWorkingViewModel: TL_ACQ_MODEL,
    baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
    ivaDraftRows: [{ imponibile: 1000, imposta: 220, causaleIvaId: 'tl22' }],
    pianoConti: PIANO_CONTI,
  })
  assert.equal(guard.allowed, false)
})

test('24E — payload TL-ACQ-01 PN quadrata da working view model', () => {
  const pnRows = buildWorkingViewPrimaNotaDraftRowsFromModel(TL_ACQ_MODEL, PIANO_CONTI[1])
  const dare = pnRows.reduce((sum, row) => sum + Number(row.debit || 0), 0)
  const avere = pnRows.reduce((sum, row) => sum + Number(row.credit || 0), 0)
  assert.equal(dare, 1220)
  assert.equal(avere, 1220)
})

test('24E — bundle commit usa draft working view non working table grezza', () => {
  const bundle = buildDemoWorkingViewCommitBundle({
    societaId: 'demo-1',
    activeWorkingViewModel: TL_ACQ_MODEL,
    ivaDraftRows: [{ aliquota: 22, imponibile: 1000, imposta: 220, causaleIvaId: 'tl22' }],
    pianoConti: PIANO_CONTI,
    guardParams: {
      societa: DEMO_SOCIETA,
      selectedRowIds: new Set(['row-1']),
      workingViewOpen: true,
      workingViewRowId: 'row-1',
      activeWorkingViewModel: TL_ACQ_MODEL,
      baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
      ivaDraftRows: [{ aliquota: 22, imponibile: 1000, imposta: 220, causaleIvaId: 'tl22' }],
      pianoConti: PIANO_CONTI,
    },
    pianoConti: PIANO_CONTI,
  })
  assert.equal(bundle.guard.allowed, true)
  assert.equal(bundle.builderInput.primaNotaDraftRows.length, 3)
  assert.equal(bundle.builderInput.ivaDraftRows[0].causaleIvaId, 'tl22')
  assert.equal(bundle.directValidation.blockers.length, 0)
  const mapped = mapImportContabilitaCommitPayloadToCanonical(bundle.commitEnvelope)
  assert.equal(mapped.payload.header.stato, 'confermata')
  assert.notEqual(mapped.payload.header.stato, 'committed')
})

test('24E — commit bloccato se partitario mancante', () => {
  const modelNoPartitario = { ...TL_ACQ_MODEL, counterpartyAccount: null }
  const guard = evaluateDemo24EWorkingViewCommitGuards({
    societa: DEMO_SOCIETA,
    selectedRowIds: new Set(['row-1']),
    workingViewOpen: true,
    workingViewRowId: 'row-1',
    activeWorkingViewModel: modelNoPartitario,
    baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
    ivaDraftRows: [{ imponibile: 1000, imposta: 220, causaleIvaId: 'tl22' }],
    pianoConti: PIANO_CONTI,
  })
  assert.equal(guard.allowed, false)
  assert.ok(guard.blockingIssues.some((item) => /Partitario/i.test(item) || /controparte/i.test(item)))
})

test('24E — onStartAccounting non invoca runCommitWorkflow', async () => {
  const importSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../index.jsx', import.meta.url), 'utf8')
  )
  assert.doesNotMatch(importSource, /onStartAccounting[\s\S]{0,1200}runCommitWorkflow/)
  assert.match(importSource, /handleDemoWorkingViewCommit/)
  assert.match(importSource, /runCommitWorkflow\(bundle\.commitEnvelope/)
})

test('24E — formatDemoWorkingViewCommitReport include primaNotaId su successo', () => {
  const mockResult = {
    success: true,
    primaNotaId: 'pn-999',
    numeroRighe: 3,
    numeroRigheIva: 1,
    partitaFornitoreCount: 1,
    totaleDare: 1220,
    totaleAvere: 1220,
    status: 'processed',
  }
  const report = formatDemoWorkingViewCommitReport(mockResult, { numeroDocumento: 'TL-ACQ-01', unselectedCount: 9 })
  assert.match(report, /pn-999/)
  assert.match(report, /TL-ACQ-01/)
  assert.match(report, /9 escluse/)
})

test('24E — formatDemoWorkingViewCommitReport riporta errore su fallimento', () => {
  const mockResult = {
    success: false,
    blockingReasons: ['Conto IVA split payment non configurato'],
  }
  const report = formatDemoWorkingViewCommitReport(mockResult)
  assert.match(report, /fallito/)
  assert.match(report, /Conto IVA split payment non configurato/)
})

test('24E — confirm message contiene dettagli essenziali', () => {
  const msg = buildDemoWorkingViewCommitConfirmMessage(TL_ACQ_MODEL, [{ aliquota: 22, imponibile: 1000, imposta: 220, causaleIvaLabel: 'TESTLAB22 · 22%' }])
  assert.match(msg, /TL-ACQ-01/)
  assert.match(msg, /Demo 22 S.r.l./)
  assert.match(msg, /1000.00/)
  assert.match(msg, /TESTLAB22/)
})

test('24E — evaluateDemo24EWorkingViewCommitGuards blocca se mancano parametri', () => {
  const modelNoCosto = { ...TL_ACQ_MODEL, costRevenueAccount: null }
  const guard = evaluateDemo24EWorkingViewCommitGuards({
    societa: DEMO_SOCIETA,
    selectedRowIds: new Set(['row-1']),
    workingViewOpen: true,
    workingViewRowId: 'row-1',
    activeWorkingViewModel: modelNoCosto,
    baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
    ivaDraftRows: [{ imponibile: 1000, imposta: 220, causaleIvaId: 'tl22' }],
    pianoConti: PIANO_CONTI,
  })
  assert.equal(guard.allowed, false)
  assert.ok(guard.blockingIssues.some((item) => /costo/i.test(item)))
})

test('24E-FIX-2 — resolveImportCommitPrimaNotaStato normalizza correttamente lo stato', () => {
  assert.equal(resolveImportCommitPrimaNotaStato('ready'), 'confermata')
  assert.equal(resolveImportCommitPrimaNotaStato('ready_for_accounting'), 'confermata')
  assert.equal(resolveImportCommitPrimaNotaStato('confermata'), 'confermata')
  assert.equal(resolveImportCommitPrimaNotaStato('committed'), 'confermata')
  assert.equal(resolveImportCommitPrimaNotaStato('processed'), 'confermata')
  assert.equal(resolveImportCommitPrimaNotaStato('blocked'), 'da_verificare')
  assert.equal(resolveImportCommitPrimaNotaStato('incomplete'), 'da_verificare')
  assert.equal(resolveImportCommitPrimaNotaStato('bozza'), 'bozza')
  assert.equal(resolveImportCommitPrimaNotaStato('simulata'), 'simulata')
  assert.equal(resolveImportCommitPrimaNotaStato('qualcosa_a_caso'), 'confermata')
})
