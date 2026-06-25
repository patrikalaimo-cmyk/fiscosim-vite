import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isDemoCompany,
  assertDemoCompanyForTestLab,
  TEST_LAB_PHASE_24A,
  TEST_LAB_PHASE_24B,
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
    assert.equal(meta.phase, '24B')
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
  assert.match(CICLO_COMPLETO_DISABLED_REASON, /24B/)
  assert.match(CICLO_COMPLETO_DISABLED_REASON, /preparazione\/staging/)
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
