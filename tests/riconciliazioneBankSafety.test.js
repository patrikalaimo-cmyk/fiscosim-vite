import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateCanonicalReconciliationPayload } from '../src/modules/contabilita/components/riconciliazione/validateCanonicalReconciliationPayload.js'
import { runCanonicalReconciliationPayloadFixtureChecks } from '../src/modules/contabilita/components/riconciliazione/testCanonicalReconciliationPayloadFixtures.js'
import { runReconciliationCommitFixtureChecks } from '../src/modules/contabilita/components/riconciliazione/testReconciliationCommitFixtures.js'

const ignoredPayload = {
  source: 'riconciliazione_bancaria',
  societaId: 'soc-test-001',
  esercizioId: '2026',
  bankAccountId: 'conto-test-001',
  sourceDecisionStatus: 'ignored',
  primaNota: null,
  primaNotaRighe: [],
  partitarioMovements: [],
  cashVatMovements: [],
  withholdingMovements: [],
}

test('ignored e valido solo con contesto completo e nessuna scrittura', () => {
  const result = validateCanonicalReconciliationPayload(ignoredPayload)
  assert.equal(result.valid, true)
  assert.equal(result.reason, 'no accounting payload required')
  assert.deepEqual(result.blockers, [])
})

test('ignored non sana contesto societa/esercizio/banca mancante', () => {
  const result = validateCanonicalReconciliationPayload({
    ...ignoredPayload, societaId: '', bankAccountId: '',
  })
  assert.equal(result.valid, false)
  assert.ok(result.blockers.includes('context_missing'))
})

test('ignored non elimina blocker preesistenti', () => {
  const result = validateCanonicalReconciliationPayload({
    ...ignoredPayload, blockers: ['needs_operator_review'],
  })
  assert.equal(result.valid, false)
  assert.ok(result.blockers.includes('needs_operator_review'))
})

test('ignored non consente scritture contabili o movimenti partitario', () => {
  for (const update of [
    { primaNota: { contoBancaId: 'banca-test' } },
    { primaNotaRighe: [{ sezione: 'dare', importo: 100 }] },
    { partitarioMovements: [{ action: 'chiusura_totale' }] },
    { cashVatMovements: [{ documentId: 'doc-test', taxableAmountReleased: 100, vatAmountReleased: 22 }] },
    { withholdingMovements: [{ percipienteId: 'per-test', ritenutaId: 'rit-test', amount: 20 }] },
  ]) {
    const result = validateCanonicalReconciliationPayload({ ...ignoredPayload, ...update })
    assert.equal(result.valid, false, 'ignored cannot carry accounting data')
    assert.ok(result.blockers.includes('ignored_payload_contains_accounting'))
  }
})

test('fixture canoniche bancarie esistenti non regrediscono', () => {
  const result = runCanonicalReconciliationPayloadFixtureChecks()
  assert.equal(result.failures.length, 0, JSON.stringify(result.failures))
  assert.equal(result.rows.length, 16)
})

test('commit bancario fixture resta soltanto dry run + replay', async () => {
  const result = await runReconciliationCommitFixtureChecks()
  assert.equal(result.failures.length, 0, JSON.stringify(result.failures))
  assert.equal(result.rows.length, 16)
})

test('nessuna abilitazione alla scrittura contabile reale dalla UI bancaria', async () => {
  const source = await readFile(new URL('../src/modules/contabilita/components/riconciliazione/commitReconciliationCanonicalPayload.js', import.meta.url), 'utf8')
  assert.match(source, /dryRun:\s*true/)
  assert.match(source, /allowRealCommit:\s*false/)
  assert.match(source, /auditWriteEnabled:\s*false/)
  assert.doesNotMatch(source, /dryRun:\s*false|allowRealCommit:\s*true/)
})
