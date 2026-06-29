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

