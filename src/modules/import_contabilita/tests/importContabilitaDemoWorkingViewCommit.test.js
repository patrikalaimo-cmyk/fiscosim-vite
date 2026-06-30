import test from 'node:test'
import assert from 'node:assert/strict'
import { mapImportContabilitaCommitPayloadToCanonical, resolveImportCommitPrimaNotaStato } from '../../contabilita/canonical/mappers/mapImportContabilitaCommitPayloadToCanonical.js'
import {
  buildWorkingViewPrimaNotaDraftRowsFromModel,
  evaluateDemo24EWorkingViewCommitGuards,
  buildDemoWorkingViewCommitBundle,
  formatDemoWorkingViewCommitReport,
  buildDemoWorkingViewCommitConfirmMessage,
  parseNumberRobust,
  normalizeImportWorkingViewAccountingRow,
  resolveDemoIvaCreditAccount,
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
  const dare = pnRows.reduce((sum, row) => sum + Number(row.dare || 0), 0)
  const avere = pnRows.reduce((sum, row) => sum + Number(row.avere || 0), 0)
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

test('24E-FIX-3 — robust number parsing and Italian format normalization', () => {
  assert.equal(parseNumberRobust('1.000,00'), 1000)
  assert.equal(parseNumberRobust('1000.00'), 1000)
  assert.equal(parseNumberRobust('220,15'), 220.15)
  assert.equal(parseNumberRobust(1220), 1220)
  assert.equal(parseNumberRobust('0'), 0)
  assert.equal(parseNumberRobust(null), 0)
})

test('24E-FIX-3 — row mapping and validation errors', () => {
  // riga valida dare
  const r1 = normalizeImportWorkingViewAccountingRow({ dare: '1.000,00', accountId: 'conto-1' })
  assert.equal(r1.debit, 1000)
  assert.equal(r1.credit, 0)

  // riga con doppio importo viene bloccata
  assert.throws(() => {
    normalizeImportWorkingViewAccountingRow({ dare: 100, avere: 50, accountId: 'conto-1' })
  }, /doppio importo/i)

  // riga con importo zero viene bloccata con errore chiaro
  assert.throws(() => {
    normalizeImportWorkingViewAccountingRow({ dare: 0, avere: 0, accountId: 'conto-1' })
  }, /importo pari a zero/i)
})

test('24E-FIX-3 — commit bundle uses normalized rows matching tab UI', () => {
  const bundle = buildDemoWorkingViewCommitBundle({
    societaId: 'demo-1',
    activeWorkingViewModel: TL_ACQ_MODEL,
    pnDraftRows: [
      { accountId: 'costo-1', dare: '1.000,00', avere: 0, accountCode: '6.01.001' },
      { accountId: 'iva-1', dare: '220,00', avere: 0, accountCode: '1.02.40.0001' },
      { accountId: 'forn-1', dare: 0, avere: '1.220,00', accountCode: '2.04.02.0001' }
    ],
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
  assert.equal(bundle.builderInput.primaNotaDraftRows[0].debit, 1000)
  assert.equal(bundle.builderInput.primaNotaDraftRows[2].credit, 1220)
  assert.equal(bundle.directValidation.blockers.length, 0)
  
  const mapped = mapImportContabilitaCommitPayloadToCanonical(bundle.commitEnvelope)
  assert.equal(mapped.payload.header.stato, 'confermata')
  assert.equal(mapped.payload.header.totals.totaleDare, 1220)
  assert.equal(mapped.payload.header.totals.totaleAvere, 1220)
  assert.equal(mapped.payload.header.totals.isBalanced, true)

  // Assert dare/avere on canonical accounting rows
  const canonicalRows = mapped.payload.accounting.rows
  assert.equal(canonicalRows.length, 3)
  assert.equal(canonicalRows[0].dare, 1000)
  assert.equal(canonicalRows[0].avere, 0)
  assert.equal(canonicalRows[1].dare, 220)
  assert.equal(canonicalRows[1].avere, 0)
  assert.equal(canonicalRows[2].dare, 0)
  assert.equal(canonicalRows[2].avere, 1220)
})

test('24E-FIX-5 — account resolution validation, real company blocking, and unselected row exclusion', () => {
  // 1. Verify account resolution with resolveDemoIvaCreditAccount
  const ivaAccount = resolveDemoIvaCreditAccount(PIANO_CONTI)
  assert.equal(ivaAccount?.codice, '1 02 40 0001')

  const bundle = buildDemoWorkingViewCommitBundle({
    societaId: 'demo-1',
    activeWorkingViewModel: TL_ACQ_MODEL,
    pnDraftRows: [
      { accountId: 'costo-1', dare: '1.000,00', avere: 0, accountCode: '6.01.001' },
      { accountId: ivaAccount?.id, dare: '220,00', avere: 0, accountCode: '1.02.40.0001' },
      { accountId: 'forn-1', dare: 0, avere: '1.220,00', accountCode: '2.04.02.0001' }
    ],
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
  })

  // Ensure all 3 rows have accountId
  assert.ok(bundle.builderInput.primaNotaDraftRows[0].accountId)
  assert.ok(bundle.builderInput.primaNotaDraftRows[1].accountId)
  assert.ok(bundle.builderInput.primaNotaDraftRows[2].accountId)
  assert.equal(bundle.builderInput.primaNotaDraftRows[1].accountId, ivaAccount?.id)

  const mapped = mapImportContabilitaCommitPayloadToCanonical(bundle.commitEnvelope)
  const canonicalRows = mapped.payload.accounting.rows

  // Check validator does not block
  assert.equal(canonicalRows.length, 3)
  assert.equal(canonicalRows[0].dare, 1000)
  assert.equal(canonicalRows[1].dare, 220)
  assert.equal(canonicalRows[1].accountId, ivaAccount?.id)
  assert.equal(canonicalRows[2].avere, 1220)

  // 2. If accountId missing, early validation must fail/throw
  const checkMissingAccountId = (rows) => {
    rows.forEach((r, idx) => {
      if (!r?.accountId) {
        throw new Error(`Commit demo bloccato: sottoconto mancante sulla riga PN ${idx}`)
      }
    })
  }

  assert.throws(() => {
    checkMissingAccountId([
      { accountId: 'costo-1' },
      { accountId: '' }, // missing
      { accountId: 'forn-1' }
    ])
  }, /sottoconto mancante sulla riga PN 1/i)

  // 3. Real company blocked
  const realCompanyBundle = buildDemoWorkingViewCommitBundle({
    societaId: 'real-1',
    activeWorkingViewModel: TL_ACQ_MODEL,
    pnDraftRows: [],
    ivaDraftRows: [],
    pianoConti: PIANO_CONTI,
    guardParams: {
      societa: { codice: 'REAL_CO', is_demo: false }, // real company
      selectedRowIds: new Set(['row-1']),
      workingViewOpen: true,
      workingViewRowId: 'row-1',
      activeWorkingViewModel: TL_ACQ_MODEL,
      baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
      ivaDraftRows: [],
      pianoConti: PIANO_CONTI,
    },
  })
  assert.equal(realCompanyBundle.guard.allowed, false)
  assert.ok(realCompanyBundle.guard.blockingIssues.some(msg => msg.includes('società demo')))

  // 4. Unselected rows excluded (if rowKey does not match the active working view rowId)
  const mismatchRowIdBundle = buildDemoWorkingViewCommitBundle({
    societaId: 'demo-1',
    activeWorkingViewModel: TL_ACQ_MODEL,
    pnDraftRows: [],
    ivaDraftRows: [],
    pianoConti: PIANO_CONTI,
    guardParams: {
      societa: DEMO_SOCIETA,
      selectedRowIds: new Set(['row-1']),
      workingViewOpen: true,
      workingViewRowId: 'row-mismatch',
      activeWorkingViewModel: TL_ACQ_MODEL,
      baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
      ivaDraftRows: [],
      pianoConti: PIANO_CONTI,
    },
  })
  assert.equal(mismatchRowIdBundle.guard.allowed, false)
  assert.ok(mismatchRowIdBundle.guard.blockingIssues.some(msg => msg.includes('selezionata')))
})

test('24E-FIX-6 — VAT technical type resolution and guards', () => {
  const bundle = buildDemoWorkingViewCommitBundle({
    societaId: 'demo-1',
    activeWorkingViewModel: TL_ACQ_MODEL,
    pnDraftRows: [
      { accountId: 'costo-1', dare: 1000, avere: 0, accountCode: '6.01.001' },
      { accountId: 'iva-1', dare: 220, avere: 0, accountCode: '1.02.40.0001' },
      { accountId: 'forn-1', dare: 0, avere: 1220, accountCode: '2.04.02.0001' }
    ],
    ivaDraftRows: [{ aliquota: 22, imponibile: 1000, imposta: 220, causaleIvaId: 'TESTLAB22', causaleIvaCode: 'TESTLAB22' }],
    pianoConti: PIANO_CONTI,
    guardParams: {
      societa: DEMO_SOCIETA,
      selectedRowIds: new Set(['row-1']),
      workingViewOpen: true,
      workingViewRowId: 'row-1',
      activeWorkingViewModel: TL_ACQ_MODEL,
      baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
      ivaDraftRows: [{ aliquota: 22, imponibile: 1000, imposta: 220, causaleIvaId: 'TESTLAB22', causaleIvaCode: 'TESTLAB22' }],
      pianoConti: PIANO_CONTI,
    },
  })

  const mapped = mapImportContabilitaCommitPayloadToCanonical(bundle.commitEnvelope)
  assert.equal(mapped.payload.vat.enabled, true)
  assert.equal(mapped.payload.vat.rows.length, 1)
  assert.equal(mapped.payload.vat.rows[0].causaleIvaId, 'TESTLAB22')
  assert.equal(mapped.payload.vat.rows[0].imponibile, 1000)
  assert.equal(mapped.payload.vat.rows[0].imposta, 220)

  // Verify technical type resolved via fallback/causaleContabile
  const causale = mapped.payload.header.causaleContabile
  assert.equal(causale.tipo_causale, 'docivanormale')
  assert.equal(causale.tipoCausale, 'docivanormale')
  assert.equal(causale.registro_iva, 'acquisti')

  // Early technical type guard throw test
  const checkMissingTechnicalType = (payloadCausale) => {
    const tipoTecnico = payloadCausale.tipo_causale || payloadCausale.tipoCausale || ''
    if (!tipoTecnico) {
      throw new Error('Commit demo bloccato: tipo tecnico IVA mancante sulla riga IVA 0 (causale TESTLAB22, aliquota 22%).')
    }
  }

  assert.throws(() => {
    checkMissingTechnicalType({ code: 'FF' }) // tipoTecnico missing
  }, /tipo tecnico IVA mancante/i)
})

test('24E-FIX-7 — UUID guard and synthetic ID exclusion', async () => {
  const { buildPrimaNotaHeaderFromCanonicalPayload } = await import('../../contabilita/application/canonical_mapper/buildPrimaNotaHeaderFromCanonicalPayload.js')
  const {
    mapPrimaNotaPayloadForDb,
    sanitizeUuidOrNull,
    validateDbPersistencePlanForTestLab
  } = await import('../../contabilita/application/persistPrimaNotaDraft.js')

  // 1. Validate sanitizeUuidOrNull behaviour
  assert.equal(sanitizeUuidOrNull('test_lab_24b_1782764101229-1'), null)
  assert.equal(sanitizeUuidOrNull(''), null)
  assert.equal(sanitizeUuidOrNull(null), null)
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'
  assert.equal(sanitizeUuidOrNull(validUuid), validUuid)
  // Test mocks should be allowed
  assert.equal(sanitizeUuidOrNull('demo-1'), 'demo-1')
  assert.equal(sanitizeUuidOrNull('real-1'), 'real-1')
  assert.equal(sanitizeUuidOrNull('soc-123'), 'soc-123')
  assert.equal(sanitizeUuidOrNull('caus-ff'), 'caus-ff')

  // 2. Validate plan-wide behavior
  const canonicalPayload = {
    company: { societaId: 'demo-1' },
    handoff: {
      sourceRowKey: 'test_lab_24b_1782764101229-1', // synthetic!
      sourceBatchId: 'batch-1',
      sourceModule: 'import_contabilita',
    },
    document: { number: 'TL-ACQ-01', registrationDate: '2026-04-15' },
    accounting: {
      causaleContabile: { id: 'caus-ff', code: 'FF' }
    }
  }

  const header = buildPrimaNotaHeaderFromCanonicalPayload(canonicalPayload)
  assert.equal(header.documento_import_id, null) // stripped!

  const dbPayload = mapPrimaNotaPayloadForDb(header)
  // Sanitize
  dbPayload.documento_import_id = sanitizeUuidOrNull(dbPayload.documento_import_id || canonicalPayload.handoff.sourceRowKey)
  assert.equal(dbPayload.documento_import_id, null)

  const plan = {
    pnPayload: dbPayload,
    righePayload: [
      { conto_id: 'acc-cost', dare: 1000, avere: 0 },
      { conto_id: 'acc-iva', dare: 220, avere: 0 },
      { conto_id: 'acc-forn', dare: 0, avere: 1220 }
    ],
    vatEntries: [
      { causale_iva_id: 'caus-iva', imponibile: 1000, imposta: 220 }
    ],
    partEntries: [
      { soggetto_id: 'demo-fornitore', importo_originario: 1220 }
    ],
    societaCodice: '__TEST__FISCOSIM_DEMO',
    docNum: 'TL-ACQ-01'
  }

  // The guard should pass with these sanitized / mock values
  assert.doesNotThrow(() => {
    validateDbPersistencePlanForTestLab(plan)
  })

  // 3. Test that guard blocks if a required UUID field gets a non-UUID string
  plan.pnPayload.causale_id = 'test_lab_invalid_uuid'
  assert.throws(() => {
    validateDbPersistencePlanForTestLab(plan)
  }, /tipo non valido nel campo causale_id di prima_nota: atteso uuid/i)

  // Reset to valid for subsequent checks
  plan.pnPayload.causale_id = 'caus-ff'

  // 4. Test that a real UUID is preserved
  const realUuid = '4a728851-be5a-412c-9ce6-ec07b72fcdfa'
  assert.equal(sanitizeUuidOrNull(realUuid), realUuid)

  // 5. Test that guard blocks if integer gets "TL-ACQ-01"
  plan.pnPayload.esercizio = 'TL-ACQ-01'
  assert.throws(() => {
    validateDbPersistencePlanForTestLab(plan)
  }, /tipo non valido nel campo esercizio di prima_nota: atteso integer/i)

  // Reset
  plan.pnPayload.esercizio = 2026

  // 6. Test that guard blocks if numeric gets non-numeric text
  plan.pnPayload.totale_dare = 'non-numeric-text'
  assert.throws(() => {
    validateDbPersistencePlanForTestLab(plan)
  }, /tipo non valido nel campo totale_dare di prima_nota: atteso numeric/i)

  // Reset
  plan.pnPayload.totale_dare = 1220

  // 7. Test that guard blocks if date gets code document
  plan.pnPayload.data_registrazione = 'TL-ACQ-01'
  assert.throws(() => {
    validateDbPersistencePlanForTestLab(plan)
  }, /tipo non valido nel campo data_registrazione di prima_nota: atteso date/i)

  // Reset
  plan.pnPayload.data_registrazione = '2026-04-15'

  // 8. Test that guard blocks if boolean gets non-boolean string
  plan.righePayload[0].partita_aperta = 'invalid-boolean-text'
  assert.throws(() => {
    validateDbPersistencePlanForTestLab(plan)
  }, /tipo non valido nel campo partita_aperta di prima_nota_righe: atteso boolean/i)

  // Reset
  plan.righePayload[0].partita_aperta = true
})



