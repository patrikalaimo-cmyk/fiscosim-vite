import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isDemoCompany,
  assertDemoCompanyForTestLab,
  TEST_LAB_PHASE_24A,
} from '../src/modules/test_mode/demoCompanyGuard.js'
import { generateScenarioDocuments } from '../src/modules/test_mode/TestLabGenerators.js'

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

test('24A — società reale bloccata da isDemoCompany', () => {
  assert.equal(isDemoCompany(REAL_COMPANY), false)
  assert.equal(isDemoCompany(null), false)
  assert.equal(isDemoCompany({}), false)
})

test('24A — società demo riconosciuta solo da prefisso codice esplicito', () => {
  assert.equal(isDemoCompany(DEMO_BY_CODE), true)
  assert.equal(isDemoCompany({ codice: 'test_company', denominazione: 'Delta Srl' }), true)
  assert.equal(isDemoCompany(FALSE_POSITIVE_NAME), false, 'Denominazione TEST senza codice demo non deve qualificare')
})

test('24A — assertDemoCompanyForTestLab blocca società reale', () => {
  assert.throws(
    () => assertDemoCompanyForTestLab(REAL_COMPANY),
    /non è qualificata come DEMO/
  )
})

test('24A — scenari disabilitati (fase non operativa)', () => {
  assert.equal(TEST_LAB_PHASE_24A.operational, false)
  assert.equal(TEST_LAB_PHASE_24A.scenariosEnabled, false)
  assert.equal(TEST_LAB_PHASE_24A.allowImport, false)
  assert.equal(TEST_LAB_PHASE_24A.allowCommit, false)
  assert.equal(TEST_LAB_PHASE_24A.allowCleanup, false)
  assert.equal(TEST_LAB_PHASE_24A.allowInvoiceGeneration, false)
})

test('24A — generateScenarioDocuments non invocabile su società reale', () => {
  assert.throws(
    () => generateScenarioDocuments('ordinarie_acquisto', REAL_COMPANY),
    /non è qualificata come DEMO/
  )
  assert.throws(
    () => generateScenarioDocuments('ordinarie_acquisto', FALSE_POSITIVE_NAME),
    /non è qualificata come DEMO/
  )
})

test('24A — generatori disponibili solo su società demo (nessuna persistenza)', () => {
  const docs = generateScenarioDocuments('ordinarie_acquisto', DEMO_BY_CODE)
  assert.ok(Array.isArray(docs))
  assert.ok(docs.length >= 10)
  assert.ok(docs[0].name.startsWith('test_lab_'))
})

test('24A — TestLabPanel non importa workflow Import/commit', async () => {
  const panelSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/modules/test_mode/TestLabPanel.jsx', import.meta.url), 'utf8')
  )
  assert.doesNotMatch(panelSource, /runImportWorkflow/)
  assert.doesNotMatch(panelSource, /runCommitWorkflow/)
  assert.doesNotMatch(panelSource, /persistPrimaNotaDraft/)
  assert.doesNotMatch(panelSource, /\.delete\(/)
})

test('24A — Riconciliazione bancaria resta bloccata (gate)', () => {
  assert.equal(TEST_LAB_PHASE_24A.operational, false)
})

test('24A — Cespiti non dichiarati completi (aggancio leggero Fase 16)', () => {
  const docs = generateScenarioDocuments('cespiti', DEMO_BY_CODE)
  assert.equal(docs.length, 0, 'Scenario cespiti placeholder — non operativo')
})
