import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isDemoCompany,
  assertDemoCompanyForTestLab,
  TEST_LAB_PHASE_24A,
  TEST_LAB_PHASE_24B,
  TEST_LAB_PHASE_24C,
  TEST_LAB_PHASE_24D,
  TEST_LAB_PHASE_24E,
  evaluateDemoCompanyForImport,
  resolveSocietaFromImportOptions,
  buildImportDemoGuardBlockMessage,
} from '../src/modules/test_mode/demoCompanyGuard.js'
import { generateScenarioDocuments } from '../src/modules/test_mode/TestLabGenerators.js'
import {
  generateOrdinariaAcquisto10Cases,
  buildOrdinariaAcquisto10CaseDefinitions,
  TEST_LAB_SOURCE,
  TEST_LAB_SCENARIO_ORDINARIA_ACQUISTO,
} from '../src/modules/test_mode/testLabOrdinariaAcquistoCases.js'
import {
  runTestLabPreparaOrdinariaAcquisto,
  CICLO_COMPLETO_DISABLED_REASON,
} from '../src/modules/test_mode/testLabPreparaWorkflow.js'
import {
  ensureTestLabDemoCompany,
  isAdminOrOwnerForTestLab,
  buildTestLabDemoCompanyPayload,
  TEST_LAB_DEMO_COMPANY_CODE,
} from '../src/modules/test_mode/demoCompanyProvision.js'
import {
  SOCIETA_TEST_LAB_LIST_SELECT,
  SOCIETA_TEST_LAB_PROVISION_SELECT,
  SOCIETA_FORBIDDEN_COLUMNS,
  SOCIETA_LIVE_KNOWN_COLUMNS,
} from '../src/modules/test_mode/societaTestLabSchema.js'

const REAL_COMPANY = {
  id: '1',
  codice: 'REAL_01',
  denominazione: 'Studio Rossi Srl',
  ragione_sociale: 'Studio Rossi Srl',
}

const DEMO_BY_CODE = {
  id: '2',
  codice: '__TEST__01',
  denominazione: 'Beta Srl',
  ragione_sociale: 'Beta Srl',
  partita_iva: '99999999999',
}

const FALSE_POSITIVE_NAME = {
  id: '3',
  codice: 'BETA_99',
  denominazione: 'TEST SRL',
  ragione_sociale: 'TEST SRL',
}

test('24A/24B — società reale bloccata da isDemoCompany', () => {
  assert.equal(isDemoCompany(REAL_COMPANY), false)
  assert.equal(isDemoCompany(null), false)
})

test('24B — società demo accettata solo da codice __TEST__ o test_', () => {
  assert.equal(isDemoCompany(DEMO_BY_CODE), true)
  assert.equal(isDemoCompany({ codice: 'test_company', denominazione: 'Delta Srl' }), true)
  assert.equal(isDemoCompany(FALSE_POSITIVE_NAME), false)
})

test('24B — assertDemoCompanyForTestLab blocca società reale', () => {
  assert.throws(() => assertDemoCompanyForTestLab(REAL_COMPANY), /non è qualificata come DEMO/)
})

test('24B — fase 24B consente prepare ma non commit', () => {
  assert.equal(TEST_LAB_PHASE_24B.allowPrepare, true)
  assert.equal(TEST_LAB_PHASE_24B.allowCommit, false)
  assert.equal(TEST_LAB_PHASE_24B.allowFullCycle, false)
})

test('24B — scenario fattura ordinaria acquisto genera esattamente 10 casi', () => {
  const cases = generateOrdinariaAcquisto10Cases(DEMO_BY_CODE)
  assert.equal(cases.length, 10)
  const defs = buildOrdinariaAcquisto10CaseDefinitions(DEMO_BY_CODE)
  assert.equal(defs.length, 10)
})

test('24B — tutti i casi hanno marker test_lab/source/scenario', () => {
  const cases = generateOrdinariaAcquisto10Cases(DEMO_BY_CODE)
  for (const c of cases) {
    assert.ok(c.name.startsWith('test_lab_'), `filename test_lab: ${c.name}`)
    assert.equal(c.source, TEST_LAB_SOURCE)
    assert.equal(c.scenario, TEST_LAB_SCENARIO_ORDINARIA_ACQUISTO)
    assert.ok(c.caseId, 'caseId obbligatorio')
    assert.ok(c.meta?.fornitore, 'fornitore obbligatorio')
    assert.ok(c.meta?.partitaIva, 'P.IVA obbligatoria')
    assert.ok(c.meta?.numeroDocumento, 'numero documento obbligatorio')
    assert.ok(c.meta?.causaleSuggerita, 'causale suggerita obbligatoria')
    assert.ok(c.meta?.contoSuggerito, 'conto suggerito obbligatorio')
  }
})

test('24B — casi obbligatori coperti (01-10)', () => {
  const cases = generateOrdinariaAcquisto10Cases(DEMO_BY_CODE)
  const ids = cases.map((c) => c.caseId).sort()
  assert.deepEqual(ids, [
    'acq_01', 'acq_02', 'acq_03', 'acq_04', 'acq_05',
    'acq_06', 'acq_07', 'acq_08', 'acq_09', 'acq_10',
  ])
  const case09 = cases.find((c) => c.caseId === 'acq_09')
  const case10 = cases.find((c) => c.caseId === 'acq_10')
  assert.equal(case09.meta.fornitoreEsistente, true)
  assert.equal(case10.meta.anagraficaDaVerificare, true)
})

test('24B — generateOrdinariaAcquisto10Cases bloccato su società reale', () => {
  assert.throws(() => generateOrdinariaAcquisto10Cases(REAL_COMPANY), /non è qualificata come DEMO/)
})

test('24B — Prepara test usa runImportWorkflow senza commit/persistenza', async () => {
  const result = await runTestLabPreparaOrdinariaAcquisto({
    societa: DEMO_BY_CODE,
    societaId: DEMO_BY_CODE.id,
  })

  assert.ok(result.report)
  assert.equal(result.report.casiPrevisti, 10)
  assert.equal(result.report.documentiContabilizzati, 0)
  assert.equal(result.report.primeNoteCreate, 0)
  assert.equal(result.report.registriIvaCreati, 0)
  assert.equal(result.report.partitarioCreato, 0)
  assert.ok(result.report.casiPreparati >= 1, 'almeno un caso parsato in staging')
  assert.ok(result.importResult?.ok)
  assert.ok(Array.isArray(result.importResult.stagingRows))
})

test('24B — automationMetaByRowId traccia test_lab per riga staging', async () => {
  const { automationMetaByRowId, importResult } = await runTestLabPreparaOrdinariaAcquisto({
    societa: DEMO_BY_CODE,
    societaId: DEMO_BY_CODE.id,
  })
  const rowIds = Object.keys(automationMetaByRowId)
  assert.ok(rowIds.length > 0)
  for (const id of rowIds) {
    const meta = automationMetaByRowId[id]
    assert.equal(meta.source, TEST_LAB_SOURCE)
    assert.equal(meta.scenario, TEST_LAB_SCENARIO_ORDINARIA_ACQUISTO)
    assert.equal(meta.phase, '24E')
    assert.ok(meta.caseId?.startsWith('acq_'))
  }
  assert.equal(importResult.stagingRows.length, rowIds.length)
})

test('24B — Prepara test bloccato su società reale', async () => {
  await assert.rejects(
    () => runTestLabPreparaOrdinariaAcquisto({ societa: REAL_COMPANY, societaId: '1' }),
    /non è qualificata come DEMO/
  )
})

test('24B — Prepara test non invoca runCommitWorkflow né persistPrimaNotaDraft', async () => {
  const panelSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/test_mode/TestLabPanel.jsx', import.meta.url), 'utf8')
  )
  const preparaSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/test_mode/testLabPreparaWorkflow.js', import.meta.url), 'utf8')
  )
  assert.doesNotMatch(panelSource, /import\s*\{[^}]*runCommitWorkflow/)
  assert.doesNotMatch(panelSource, /await\s+runCommitWorkflow/)
  assert.doesNotMatch(panelSource, /persistPrimaNotaDraft/)
  assert.doesNotMatch(preparaSource, /import\s*\{[^}]*runCommitWorkflow/)
  assert.doesNotMatch(preparaSource, /await\s+runCommitWorkflow/)
  assert.doesNotMatch(preparaSource, /import\s*\{[^}]*persistPrimaNotaDraft/)
  assert.doesNotMatch(preparaSource, /await\s+persistPrimaNotaDraft/)
  assert.doesNotMatch(panelSource, /\.delete\(/)
})

test('24B — ciclo completo disabilitato con motivo esplicito', () => {
  assert.match(CICLO_COMPLETO_DISABLED_REASON, /24E/)
  assert.match(CICLO_COMPLETO_DISABLED_REASON, /working view/)
})

test('24B — Riconciliazione resta bloccata (gate)', () => {
  assert.equal(TEST_LAB_PHASE_24B.allowCommit, false)
  assert.equal(TEST_LAB_PHASE_24A.allowCommit, false)
})

test('24A legacy — cespiti placeholder non operativo', () => {
  const docs = generateScenarioDocuments('cespiti', DEMO_BY_CODE)
  assert.equal(docs.length, 0)
})

test('24B-FIX — __TEST__FISCOSIM_DEMO riconosciuta come demo', () => {
  const demo = {
    id: 'demo-fix',
    codice: TEST_LAB_DEMO_COMPANY_CODE,
    denominazione: 'FiscoSim Demo Test Lab SRL',
  }
  assert.equal(isDemoCompany(demo), true)
  assert.equal(isDemoCompany(REAL_COMPANY), false)
})

test('24B-FIX — payload demo ha codice e denominazione canonici', () => {
  const payload = buildTestLabDemoCompanyPayload()
  assert.equal(payload.codice, TEST_LAB_DEMO_COMPANY_CODE)
  assert.equal(payload.denominazione, 'FiscoSim Demo Test Lab SRL')
  assert.match(payload.note, /TEST_LAB/)
  assert.equal('ragione_sociale' in payload, false)
})

test('24B-FIX-2 — payload demo usa solo colonne reali societa', () => {
  const payload = buildTestLabDemoCompanyPayload()
  for (const key of Object.keys(payload)) {
    assert.ok(
      SOCIETA_LIVE_KNOWN_COLUMNS.includes(key),
      `colonna payload non presente nello schema live: ${key}`
    )
  }
  for (const forbidden of SOCIETA_FORBIDDEN_COLUMNS) {
    assert.equal(forbidden in payload, false, `colonna vietata nel payload: ${forbidden}`)
  }
})

test('24B-FIX-2 — select Test Lab societa non include ragione_sociale', () => {
  assert.doesNotMatch(SOCIETA_TEST_LAB_LIST_SELECT, /ragione_sociale/)
  assert.doesNotMatch(SOCIETA_TEST_LAB_PROVISION_SELECT, /ragione_sociale/)
})

test('24B-FIX-2 — demoCompanyProvision non usa ragione_sociale su societa', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/test_mode/demoCompanyProvision.js', import.meta.url), 'utf8')
  )
  assert.doesNotMatch(source, /\.select\([^)]*ragione_sociale/)
  assert.doesNotMatch(source, /ragione_sociale\s*:/)
})

test('24B-FIX — creazione idempotente non duplica se esiste', async () => {
  const existing = {
    id: 'existing-demo',
    codice: TEST_LAB_DEMO_COMPANY_CODE,
    denominazione: 'FiscoSim Demo Test Lab SRL',
    attiva: true,
  }
  let insertCalls = 0
  const db = {
    from(table) {
      assert.equal(table, 'societa')
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: existing, error: null }),
              }
            },
          }
        },
        insert() {
          insertCalls += 1
          return {
            select() {
              return { single: async () => ({ data: null, error: { message: 'should not insert' } }) }
            },
          }
        },
      }
    },
  }
  const result = await ensureTestLabDemoCompany({ db, utente: { ruolo: 'owner' } })
  assert.equal(result.created, false)
  assert.equal(result.attached, true)
  assert.equal(result.societa.id, existing.id)
  assert.equal(insertCalls, 0)
})

test('24B-FIX — creazione bloccata per collaboratore', async () => {
  await assert.rejects(
    () => ensureTestLabDemoCompany({ db: { from: () => ({}) }, utente: { ruolo: 'collaboratore' } }),
    /Solo Admin\/Owner/
  )
})

test('24B-FIX — isAdminOrOwnerForTestLab', () => {
  assert.equal(isAdminOrOwnerForTestLab({ ruolo: 'owner' }), true)
  assert.equal(isAdminOrOwnerForTestLab({ ruolo: 'admin' }), true)
  assert.equal(isAdminOrOwnerForTestLab({ ruolo: 'collaboratore' }), false)
})

test('24B-FIX — provision non genera fatture/contabilizzazione/pulizia', async () => {
  const panelSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/test_mode/TestLabPanel.jsx', import.meta.url), 'utf8')
  )
  const provisionSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/test_mode/demoCompanyProvision.js', import.meta.url), 'utf8')
  )
  assert.doesNotMatch(provisionSource, /runCommitWorkflow|persistPrimaNotaDraft|runImportWorkflow/)
  assert.doesNotMatch(provisionSource, /\.delete\(/)
  assert.doesNotMatch(panelSource, /handlePrepara\(\).*handleEnsureDemoCompany/s)
  assert.match(panelSource, /Crea società demo FiscoSim/)
  assert.match(panelSource, /Nessun test parte automaticamente/)
})

import {
  ensureTestLabDemoAccountingSetup,
  DEMO_CAUSALE_FF_CODICE,
  DEMO_PIANO_CODICE,
} from '../src/modules/test_mode/testLabDemoAccountingSeed.js'
import {
  buildDemoPianoContiSeedDefs,
  buildDemoCausaleFfPayload,
  buildDemoCausaliIvaSeedDefs,
  toDbPianoCodice,
  PIANO_CONTI_LIVE_COLUMNS,
} from '../src/modules/test_mode/testLabAccountingSchema.js'

const DEMO_SOCIETA = {
  id: 'demo-seed-1',
  codice: '__TEST__FISCOSIM_DEMO',
  denominazione: 'FiscoSim Demo Test Lab SRL',
}

function createMockAccountingDb(initial = {}) {
  const store = {
    piano_conti: [...(initial.piano_conti || [])],
    causali_contabili: [...(initial.causali_contabili || [])],
    causali_iva: [...(initial.causali_iva || [])],
  }
  let insertCalls = 0

  const db = {
    from(table) {
      return {
        select(cols) {
          const api = {
            eq(field, value) {
              const filters = [{ field, value }]
              const chain = {
                eq(field2, value2) {
                  filters.push({ field: field2, value: value2 })
                  return chain
                },
                maybeSingle: async () => {
                  const row = store[table]?.find((r) => filters.every((f) => r[f.field] === f.value)) || null
                  return { data: row, error: null }
                },
                single: async () => chain.maybeSingle(),
              }
              return chain
            },
          }
          return api
        },
        insert(rows) {
          insertCalls += 1
          const payload = Array.isArray(rows) ? rows[0] : rows
          const row = { id: `${table}-${store[table].length + 1}`, ...payload }
          store[table].push(row)
          return {
            select() {
              return {
                single: async () => ({ data: row, error: null }),
              }
            },
          }
        },
      }
    },
    _store: store,
    _insertCalls: () => insertCalls,
  }
  return db
}

test('24B-FIX-3 — seed bloccato su società reale', async () => {
  await assert.rejects(
    () => ensureTestLabDemoAccountingSetup({
      db: createMockAccountingDb(),
      utente: { ruolo: 'owner' },
      societa: REAL_COMPANY,
      societaId: REAL_COMPANY.id,
    }),
    /non è qualificata come DEMO/
  )
})

test('24B-FIX-3 — seed abilitato solo su società demo', async () => {
  const db = createMockAccountingDb()
  const result = await ensureTestLabDemoAccountingSetup({
    db,
    utente: { ruolo: 'owner' },
    societa: DEMO_SOCIETA,
    societaId: DEMO_SOCIETA.id,
  })
  assert.equal(result.ok, true)
  assert.ok(result.report.pianoConti.created >= 1)
  assert.equal(result.report.fattureGenerate, 0)
  assert.equal(result.report.primeNoteCreate, 0)
  assert.equal(result.report.documentiContabilizzati, 0)
})

test('24B-FIX-3 — seed idempotente non duplica', async () => {
  const db = createMockAccountingDb()
  const first = await ensureTestLabDemoAccountingSetup({
    db, utente: { ruolo: 'admin' }, societa: DEMO_SOCIETA, societaId: DEMO_SOCIETA.id,
  })
  const second = await ensureTestLabDemoAccountingSetup({
    db, utente: { ruolo: 'admin' }, societa: DEMO_SOCIETA, societaId: DEMO_SOCIETA.id,
  })
  assert.ok(first.report.pianoConti.created >= 1)
  assert.equal(second.report.pianoConti.created, 0)
  assert.ok(second.report.pianoConti.existing >= first.report.pianoConti.created)
  assert.equal(second.report.causaliContabili.created, 0)
  assert.equal(second.report.causaliIva.created, 0)
})

test('24B-FIX-3 — payload piano conti usa colonne reali', () => {
  for (const def of buildDemoPianoContiSeedDefs()) {
    const { key, ...payload } = def
    for (const col of Object.keys(payload)) {
      assert.ok(PIANO_CONTI_LIVE_COLUMNS.includes(col) || col === 'societa_id', `colonna non valida ${col} in ${key}`)
    }
  }
  assert.equal(toDbPianoCodice('6.01.001'), DEMO_PIANO_CODICE.costoOrdinario)
})

test('24B-FIX-3 — crea causale FF e IVA 22/10/4', async () => {
  const db = createMockAccountingDb()
  await ensureTestLabDemoAccountingSetup({
    db, utente: { ruolo: 'owner' }, societa: DEMO_SOCIETA, societaId: DEMO_SOCIETA.id,
  })
  const ff = db._store.causali_contabili.find((r) => r.codice === DEMO_CAUSALE_FF_CODICE)
  assert.ok(ff)
  assert.equal(ff.codice_registro_iva, '01')
  assert.match(ff.descrizione, /TEST_LAB/)
  const ivas = db._store.causali_iva.filter((r) => r.societa_id === DEMO_SOCIETA.id)
  assert.equal(ivas.length, 3)
  assert.deepEqual(ivas.map((r) => Number(r.aliquota)).sort((a, b) => a - b), [4, 10, 22])
})

test('24B-FIX-3 — buildDemoCausaleFfPayload senza contabilizzazione', () => {
  const payload = buildDemoCausaleFfPayload('demo-id')
  assert.equal(payload.codice, 'FF')
  assert.equal(payload.codice_registro_iva, '01')
  assert.equal(payload.documento_direzione, 'passiva')
  assert.ok(Array.isArray(payload.righe_prima_nota_template))
})

test('24B-FIX-3 — seed module non usa delete/commit/persist', async () => {
  const seedSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/test_mode/testLabDemoAccountingSeed.js', import.meta.url), 'utf8')
  )
  const panelSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/test_mode/TestLabPanel.jsx', import.meta.url), 'utf8')
  )
  assert.doesNotMatch(seedSource, /runCommitWorkflow|persistPrimaNotaDraft|\.delete\(/)
  assert.match(panelSource, /Prepara dati contabili demo/)
  assert.match(panelSource, /CICLO_COMPLETO_DISABLED_REASON/)
})

test('24B-FIX-3 — buildDemoCausaliIvaSeedDefs produce 3 aliquote', () => {
  const defs = buildDemoCausaliIvaSeedDefs('demo-id')
  assert.equal(defs.length, 3)
  assert.deepEqual(defs.map((d) => d.aliquota).sort((a, b) => a - b), [4, 10, 22])
})

test('24E — fase 24E consente prepare/import e commit singolo da working view', () => {
  assert.equal(TEST_LAB_PHASE_24E.allowPrepare, true)
  assert.equal(TEST_LAB_PHASE_24E.allowImport, true)
  assert.equal(TEST_LAB_PHASE_24E.allowCommit, true)
  assert.equal(TEST_LAB_PHASE_24E.allowSingleDocumentCommit, true)
  assert.equal(TEST_LAB_PHASE_24E.allowFullCycle, true)
})

test('24E — testLabPreparaWorkflow genera metadati con fase 24E', async () => {
  const testLabWorkflow = await import('../src/modules/test_mode/testLabPreparaWorkflow.js')
  assert.equal(testLabWorkflow.CICLO_COMPLETO_DISABLED_REASON.includes('24E'), true)
})

test('24D — fase 24D resta senza commit (storico)', () => {
  assert.equal(TEST_LAB_PHASE_24D.allowPrepare, true)
  assert.equal(TEST_LAB_PHASE_24D.allowImport, true)
  assert.equal(TEST_LAB_PHASE_24D.allowCommit, false)
  assert.equal(TEST_LAB_PHASE_24D.allowFullCycle, false)
})

test('24D-FIX-1 — guardia demo accetta codice __TEST__FISCOSIM_DEMO', () => {
  const societa = {
    id: 'demo-1',
    codice: '__TEST__FISCOSIM_DEMO',
    denominazione: 'FiscoSim Demo Test Lab SRL',
  }
  const result = evaluateDemoCompanyForImport(societa)
  assert.equal(result.allowed, true)
  assert.equal(isDemoCompany(societa), true)
})

test('24D-FIX-1 — guardia blocca società reale anche se denominazione contiene demo', () => {
  const societa = {
    id: 'real-1',
    codice: 'SIRIA',
    denominazione: 'FiscoSim Demo Test Lab SRL',
  }
  const result = evaluateDemoCompanyForImport(societa)
  assert.equal(result.allowed, false)
  assert.equal(isDemoCompany(societa), false)
  assert.match(result.reason, /Test Lab/)
})

test('24D-FIX-1 — codice mancante produce errore diagnostico controllato', () => {
  const societa = { id: 'demo-1', denominazione: 'FiscoSim Demo Test Lab SRL' }
  const result = evaluateDemoCompanyForImport(societa)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /Codice società non disponibile nel flusso Import/)
  const message = buildImportDemoGuardBlockMessage(result)
  assert.match(message, /id=demo-1/)
  assert.match(message, /codice=mancante/)
})

test('24D-FIX-1 — resolveSocietaFromImportOptions passa codice dalla tendina', () => {
  const options = [
    { id: 'a', codice: '__TEST__FISCOSIM_DEMO', denominazione: 'FiscoSim Demo Test Lab SRL' },
    { id: 'b', codice: 'SIRIA', denominazione: 'Siria SRL' },
  ]
  const resolved = resolveSocietaFromImportOptions(options, 'a', '')
  assert.equal(resolved.codice, '__TEST__FISCOSIM_DEMO')
  assert.equal(evaluateDemoCompanyForImport(resolved).allowed, true)
})

test('24D-FIX-1 — loadSocietaAttive select include codice', async () => {
  const repoSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/import_contabilita/data/importContabilitaRepo.js', import.meta.url), 'utf8')
  )
  assert.match(repoSource, /select\('id,denominazione,codice'\)/)
})

test('24D-FIX-1 — onStartAccounting Import usa guardia con codice, non commit', async () => {
  const importSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/import_contabilita/index.jsx', import.meta.url), 'utf8')
  )
  assert.match(importSource, /evaluateDemoCompanyForImport/)
  assert.match(importSource, /resolveSocietaFromImportOptions/)
  assert.match(importSource, /setWorkingViewOpen\(true\)/)
  assert.doesNotMatch(importSource, /onStartAccounting[\s\S]{0,800}runCommitWorkflow/)
})

test('24F-FIX — scenario Test Lab ri-eseguibile con runId differenti', async () => {
  const { runTestLabPreparaOrdinariaAcquisto } = await import('../src/modules/test_mode/testLabPreparaWorkflow.js')
  const { evaluateDemo24EWorkingViewCommitGuards } = await import('../src/modules/import_contabilita/domain/importContabilitaDemoWorkingViewCommit.js')

  const societaDemo = {
    id: 'demo-societa',
    codice: '__TEST__FISCOSIM_DEMO',
    denominazione: 'FiscoSim Demo Test Lab SRL',
    partita_iva: '99999999999',
  }

  // 1. First preparation run
  const run1 = await runTestLabPreparaOrdinariaAcquisto({ societa: societaDemo, societaId: 'demo-societa' })
  assert.ok(run1.runId)
  assert.equal(run1.cases.length, 10)

  // Find TL-ACQ-02 in run 1
  const doc1 = run1.importResult.stagingRows.find(r => r.parsedDocument.numeroDocumento === 'TL-ACQ-02')
  assert.ok(doc1)
  // Verify it contains the runId in its technical ID
  assert.ok(doc1.id.includes(run1.runId))
  assert.ok(doc1.id.includes('TL-ACQ-02'))

  // Verify fiscal amounts remain exact
  assert.equal(doc1.parsedDocument.imponibile, 500)
  assert.equal(doc1.parsedDocument.iva, 50)
  assert.equal(doc1.parsedDocument.totale, 550)

  // 2. Simulare TL-ACQ-02 processed nella prima run (state = committed/processed)
  doc1.state = 'committed'

  // 3. Second preparation run
  const run2 = await runTestLabPreparaOrdinariaAcquisto({ societa: societaDemo, societaId: 'demo-societa' })
  assert.ok(run2.runId)
  assert.notEqual(run1.runId, run2.runId)

  // Find TL-ACQ-02 in run 2
  const doc2 = run2.importResult.stagingRows.find(r => r.parsedDocument.numeroDocumento === 'TL-ACQ-02')
  assert.ok(doc2)
  assert.ok(doc2.id.includes(run2.runId))
  assert.notEqual(doc1.id, doc2.id) // unique ID per run

  // 4. Verify the new one is importable (state is ready/pending, not committed)
  assert.notEqual(doc2.state, 'committed')

  // Verify evaluateDemo24EWorkingViewCommitGuards blocks real company but allows demo
  const pianoContiMock = [
    { id: 'acc-cost', codice: '6 01 001' },
    { id: 'acc-iva', codice: '1 02 40 0001', is_iva: true },
    { id: 'acc-forn', codice: '2 04 02 0001' },
  ]
  const activeModel = {
    rowKey: doc2.id,
    row: doc2,
    readiness: { ready: true },
    parsedDocument: doc2.parsedDocument,
    costRevenueAccount: { id: 'acc-cost', codice: '6 01 001' },
    counterpartyAccount: { id: 'acc-forn', codice: '2 04 02 0001' },
    causale: { id: 'caus-ff', codice: 'FF' },
    totale: 550,
    imponibile: 500,
    iva: 50,
  }

  const guardDemo = evaluateDemo24EWorkingViewCommitGuards({
    societa: societaDemo,
    selectedRowIds: new Set([doc2.id]),
    workingViewOpen: true,
    workingViewRowId: doc2.id,
    activeWorkingViewModel: activeModel,
    baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
    ivaDraftRows: [{ imponibile: 500, imposta: 50, causaleIvaId: 'tl10' }],
    pianoConti: pianoContiMock,
  })
  assert.equal(guardDemo.allowed, true) // Allowed on demo!

  const guardReal = evaluateDemo24EWorkingViewCommitGuards({
    societa: { id: 'real', codice: 'REAL_CO', denominazione: 'Real Company' },
    selectedRowIds: new Set([doc2.id]),
    workingViewOpen: true,
    workingViewRowId: doc2.id,
    activeWorkingViewModel: activeModel,
    baseWorkingViewChecks: { status: 'ok', blockingIssues: [], warnings: [], checks: [] },
    ivaDraftRows: [{ imponibile: 500, imposta: 50, causaleIvaId: 'tl10' }],
    pianoConti: pianoContiMock,
  })
  assert.equal(guardReal.allowed, false) // Blocked on real!
})

test('24F-FIX-2 — TestLabPanel importa tutti gli hook React usati', async () => {
  const panelSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/test_mode/TestLabPanel.jsx', import.meta.url), 'utf8')
  )
  const importMatch = panelSource.match(/import\s*\{([^}]+)\}\s*from\s*['"]react['"]/)
  assert.ok(importMatch, 'import React hooks mancante')
  const imported = importMatch[1].split(',').map((s) => s.trim())
  for (const hook of ['useState', 'useCallback', 'useEffect']) {
    assert.ok(imported.includes(hook), `hook ${hook} usato ma non importato`)
    assert.match(panelSource, new RegExp(`\\b${hook}\\(`))
  }
  assert.doesNotMatch(panelSource, /\buseMemo\s*\(/)
  assert.doesNotMatch(panelSource, /\buseRef\s*\(/)
})

test('24F-FIX-3 — UUID precheck guard su documenti_import e docName corretto nei log', async () => {
  // Mock db to check if select/eq were bypassed for non-UUID
  let calledSelect = false
  const mockDb = {
    from: (table) => {
      if (table === 'documenti_import') {
        return {
          select: (fields) => {
            calledSelect = true
            return {
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null })
              })
            }
          }
        }
      }
      // Return chainable dummy for other tables (e.g. stampe_definitive, prima_nota, etc)
      const chain = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = async () => ({ data: { id: 'mock-id' }, error: null })
      chain.single = async () => ({ data: { id: 'mock-id' }, error: null })
      chain.order = () => chain
      chain.range = async () => ({ data: [], error: null })
      chain.insert = () => chain
      chain.then = (fn) => Promise.resolve({ data: [], error: null }).then(fn)
      return chain
    }
  }

  // Create commit payload with synthetic non-UUID sourceRow.id and valid canonical structure
  const payloadNonUuid = {
    societaId: 'demo-1',
    registrationDate: '2026-07-02',
    sourceRow: {
      id: 'test_lab_24f_123456789_TL-ACQ-09',
      parsedDocument: {
        numeroDocumento: 'TL-ACQ-09'
      }
    },
    payload: {
      handoff: {
        contractVersion: '1.0.0',
        sourceFileName: 'test.xml',
        sourceRowKey: 'test_lab_24f_123456789_TL-ACQ-09',
        sourceBatchId: 'batch-1',
        operatorId: 'test-user',
        createdAt: '2026-07-07T00:00:00Z'
      },
      company: {
        societaId: 'demo-1',
        esercizioId: '2026'
      },
      document: {
        number: 'TL-ACQ-09',
        documentDate: '2026-07-02',
        registrationDate: '2026-07-02',
        totals: {
          taxable: 100,
          vat: 22,
          gross: 122
        },
        counterparty: {
          name: 'Supplier',
          accountId: 'acc-forn'
        }
      },
      accounting: {
        causaleContabile: { id: 'caus-ff', codice: 'FF', tipo_causale: 'documentoiva', registro_iva: 'acquisti', segno_registro_iva: '+' },
        description: 'Fattura acquisto',
        totals: { debit: 122, credit: 122 },
        isBalanced: true,
        rows: [
          { dare: 100, credit: 0, accountId: 'acc-cost' },
          { dare: 22, credit: 0, accountId: 'acc-iva' },
          { dare: 0, credit: 122, accountId: 'acc-forn' }
        ]
      },
      vat: {
        enabled: true,
        registerType: 'acquisti',
        rows: [
          { imponibile: 100, imposta: 22, aliquota: 22, causaleIvaId: '00000000-0000-0000-0000-000000000000' }
        ]
      },
      ledger: {
        enabled: true,
        accountId: 'acc-forn'
      }
    }
  }

  // Intercept console.log to inspect [TEST_LAB_COMMIT_PRECHECK_SKIPPED] and [TEST_LAB_COMMIT_STAGING_UPDATE_PLAN]
  const logs = []
  const originalLog = console.log
  console.log = (...args) => {
    logs.push(args.join(' '))
  }

  try {
    const { runCommitWorkflow } = await import('../src/modules/import_contabilita/application/importContabilitaWorkflow.js')
    
    // We run it with our mockDb
    const res = await runCommitWorkflow(payloadNonUuid, { db: mockDb })

    // 1. Verify db query for documents_import was bypassed (calledSelect is false)
    assert.equal(calledSelect, false, 'Dovrebbe bypassare la query documenti_import per ID non UUID')

    // 2. Verify precheck skipped log
    assert.ok(logs.some(l => l.includes('[TEST_LAB_COMMIT_PRECHECK_SKIPPED]')), 'Dovrebbe loggare skipping precheck')
    assert.ok(logs.some(l => l.includes('documento=TL-ACQ-09')), 'Dovrebbe contenere il nome corretto del documento (TL-ACQ-09) nel log')
    assert.ok(!logs.some(l => l.includes('documento=TL-ACQ-01')), 'Non dovrebbe mostrare la causale di fallback TL-ACQ-01 per TL-ACQ-09')

  } finally {
    console.log = originalLog
  }
})

test('24F-FIX-4 — import multi-selezione pronte e sessione working view multi-documento', async () => {
  const indexSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/import_contabilita/index.jsx', import.meta.url), 'utf8')
  )

  // 1. Verify selectedRowIds size check logic inside onStartAccounting
  assert.match(indexSource, /selectedRowIds\.size === 0/, 'Dovrebbe controllare selezione vuota')
  assert.match(indexSource, /selectedRowIds\.size === 1/, 'Dovrebbe controllare selezione singola')
  assert.match(indexSource, /\/\/ B\. Multi-selection/, 'Dovrebbe gestire selezione multipla')

  // 2. Verify queue setup in index.jsx
  assert.match(indexSource, /setWorkingViewRowIds\(eligibleKeys\)/, 'Dovrebbe inizializzare coda di sessione con eligibleKeys')
  assert.match(indexSource, /setWorkingViewRowId\(eligibleKeys\[0\]\)/, 'Dovrebbe impostare primo documento come attivo')

  // 3. Verify next document transition after commit
  assert.match(indexSource, /getNextActiveIdInQueue/, 'Dovrebbe definire helper per trovare documento successivo nella coda')
  assert.match(indexSource, /setWorkingViewRowId\(nextActiveId\)/, 'Dovrebbe passare al prossimo ID attivo in sessione')
  assert.match(indexSource, /Sessione completata\. Tutti i documenti selezionati sono stati gestiti/, 'Dovrebbe mostrare messaggio di fine sessione')

  // 4. Verify keyboard shortcut hooks inside WorkingView
  const workingViewSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/import_contabilita/components/working_view/ImportContabilitaWorkingView.jsx', import.meta.url), 'utf8')
  )
  assert.match(workingViewSource, /e\.altKey && e\.key === 'ArrowLeft'/, 'Dovrebbe intercettare Alt+ArrowLeft')
  assert.match(workingViewSource, /e\.altKey && e\.key === 'ArrowRight'/, 'Dovrebbe intercettare Alt+ArrowRight')
  assert.match(workingViewSource, /onGoToPreviousWorkingViewRow\(\)/, 'Dovrebbe attivare trigger precedente')
  assert.match(workingViewSource, /onGoToNextWorkingViewRow\(\)/, 'Dovrebbe attivare trigger successivo')
})

test('25A — Import reale: static analysis and domain validations', async () => {
  const indexSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/import_contabilita/index.jsx', import.meta.url), 'utf8')
  )

  // 1. Verify resolveImportDocumentReadiness definition and non-blocking conto/causale
  assert.match(indexSource, /function resolveImportDocumentReadiness/, 'Dovrebbe definire resolveImportDocumentReadiness')
  assert.match(indexSource, /requiresCausaleBeforeStart = false/, 'La causale non deve essere bloccante all\'avvio')
  assert.match(indexSource, /requiresContoBeforeStart = false/, 'Il conto non deve essere bloccante all\'avvio')

  // 2. Verify buildAnagraficheDaVerificare excludes matched subjects with complete data
  assert.match(indexSource, /group\.stato === 'già presente' && group\.rank >= 3/, 'Dovrebbe identificare i soggetti già presenti')
  assert.match(indexSource, /return false/, 'Dovrebbe escludere il soggetto dalle anagrafiche da confermare')

  // 3. Verify matchesViewMode excludes processed rows from standard views
  assert.match(indexSource, /const isProcessed = state === 'registered' || state === 'committed'/, 'Dovrebbe identificare i documenti contabilizzati')
  assert.match(indexSource, /if \(isProcessed\) return false/, 'Dovrebbe nascondere i documenti contabilizzati dalla vista operativa')

  // 4. Verify getConfirmedCounterpartyAccountForRow fallback
  assert.match(indexSource, /classification\.rank >= 3 && classification\.matchedPianoConto/, 'Dovrebbe proporre match automatico per soggetti certi')

  // 5. Run concrete domain tests using evaluateDemo24EWorkingViewCommitGuards
  const { evaluateDemo24EWorkingViewCommitGuards } = await import('../src/modules/import_contabilita/domain/importContabilitaDemoWorkingViewCommit.js')
  
  const modelNoAccount = {
    totale: 100,
    costRevenueAccount: null,
    causale: { id: 'caus-ff' },
    readiness: { ready: true }
  }
  const guardNoAccount = evaluateDemo24EWorkingViewCommitGuards({
    societa: { codice: '__TEST__FISCOSIM_DEMO' },
    selectedRowIds: new Set(['row1']),
    workingViewOpen: true,
    workingViewRowId: 'row1',
    activeWorkingViewModel: modelNoAccount,
    baseWorkingViewChecks: { status: 'ok' },
    pianoConti: [{ id: 'conto-iva', is_iva: true, codice: '2.03.04.001' }]
  })
  assert.equal(guardNoAccount.allowed, false)
  assert.ok(guardNoAccount.blockingIssues.includes('Conto costo/ricavo mancante'), 'Commit deve essere bloccato se il conto è vuoto')
})

test('25A-FIX-1 — prevent working table crash on optional fields', async () => {
  const tableSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/import_contabilita/components/ImportContabilitaWorkingTable.jsx', import.meta.url), 'utf8')
  )

  // 1. Verify safe missing details check in table header/rows prep
  assert.match(tableSource, /const readinessMissing = Array\.isArray\(readiness\.missing\) \? readiness\.missing : \[\]/, 'Dovrebbe definire readinessMissing in modo sicuro')
  assert.match(tableSource, /readinessMissing\.length/, 'Dovrebbe usare la lunghezza sicura di missing')

  // 2. Verify registered/committed without PN ID format
  assert.match(tableSource, /row\.primaNotaId \? `PN: \${row\.primaNotaId}` : 'PN non disponibile'/, 'Dovrebbe gestire PN ID vuoto per righe registrate')

  // 3. Verify safe checks in preview drawer
  const drawerSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/import_contabilita/components/invoice_preview/ImportContabilitaPreviewDrawerContent.jsx', import.meta.url), 'utf8')
  )
  assert.match(drawerSource, /Array\.isArray\(readiness\?\.missing\) && readiness\.missing\.length/, 'Il cassetto anteprima dovrebbe accedere in modo sicuro a readiness.missing')
})





