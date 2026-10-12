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

test('scrittura bancaria reale resta gated LAB; default dry-run', async () => {
  const source = await readFile(new URL('../src/modules/contabilita/components/riconciliazione/commitReconciliationCanonicalPayload.js', import.meta.url), 'utf8')
  assert.match(source, /isBankFiscalCommitLabEnabled/)
  assert.match(source, /commitBankReconciliationFiscalLab/)
  assert.match(source, /dryRun:\s*true/)
  assert.match(source, /allowRealCommit:\s*false/)
  assert.match(source, /auditWriteEnabled:\s*false/)
  // Must not hardcode unconditional real commit outside LAB gate.
  assert.doesNotMatch(source, /allowRealCommit:\s*true(?!\s*,?\s*\/\/)/)
})


test('commit Bank identifica il movimento, non il file di estratto conto', async () => {
  const { buildReconciliationCommitInput } = await import('../src/modules/contabilita/canonical/buildReconciliationCommitInput.js')
  const payload = {
    ...ignoredPayload,
    movementId: 'mov-banca-101',
    decisionId: 'decisione-77',
    bankStatementId: 'estratto-2026',
    valid: true,
  }
  const input = buildReconciliationCommitInput({
    canonicalPayload: payload,
    context: {
      societaId: payload.societaId,
      esercizioId: payload.esercizioId,
      bankAccountId: payload.bankAccountId,
      bankStatementId: 'estratto-2026',
      utenteId: 'operatore-test',
    },
  })
  assert.equal(input.sourceDocumentId, 'mov-banca-101')
  assert.equal(input.idempotencyKey, 'reconciliation:soc-test-001:2026:mov-banca-101:decisione-77')
})

test('commit Bank blocca identificativi mancanti senza inventare chiavi', async () => {
  const { validateReconciliationCommitPayload } = await import('../src/modules/contabilita/components/riconciliazione/validateReconciliationCommitPayload.js')
  const payload = { ...ignoredPayload, valid: true, movementId: '', decisionId: '' }
  const result = validateReconciliationCommitPayload(payload, { allowRealCommit: false })
  assert.equal(result.valid, false)
  assert.ok(result.blockers.includes('movement_or_decision_id_missing'))
})

test('commit Bank blocca incongruenze societa, esercizio e conto bancario', async () => {
  const { validateReconciliationCommitPayload } = await import('../src/modules/contabilita/components/riconciliazione/validateReconciliationCommitPayload.js')
  const payload = { ...ignoredPayload, valid: true, movementId: 'mov-01', decisionId: 'dec-01' }
  for (const overrides of [{ societaId: 'soc-diversa' }, { esercizioId: '2025' }, { bankAccountId: 'conto-diverso' }]) {
    const result = validateReconciliationCommitPayload(payload, { ...overrides, allowRealCommit: false })
    assert.equal(result.valid, false)
    assert.ok(result.blockers.includes('reconciliation_context_mismatch'))
  }
})

test('demo mock movement ids non collidono con fixture bm-*', async () => {
  const { RICONCILIAZIONE_MOCK_DATA } = await import('../src/modules/contabilita/components/riconciliazione/mockRiconciliazioneData.js')
  const { getRiconciliazioneMatchingFixtures } = await import('../src/modules/contabilita/components/riconciliazione/riconciliazioneMatchingFixtures.js')
  const mockIds = (RICONCILIAZIONE_MOCK_DATA.movements || []).map((row) => row.id)
  assert.ok(mockIds.length > 0)
  for (const id of mockIds) {
    assert.match(String(id), /^demo-bm-/)
  }
  const fixtureIds = new Set(getRiconciliazioneMatchingFixtures().movements.map((row) => row.movementId))
  for (const id of mockIds) {
    assert.equal(fixtureIds.has(id), false)
  }
})

test('Bank view wirea matcher su partitario live (source markers)', async () => {
  const source = await readFile(new URL('../src/modules/contabilita/views/RiconciliazioneBancariaView.jsx', import.meta.url), 'utf8')
  assert.match(source, /mapPartitarioRowsToMatchCandidates/)
  assert.match(source, /getPartitarioAperto/)
  assert.match(source, /live_partitario/)
  assert.match(source, /buildMatcherMovementFromWorkingRow/)
  const banking = await readFile(new URL('../src/modules/contabilita/views/BankingView.jsx', import.meta.url), 'utf8')
  assert.match(banking, /societaId=\{societaAttiva\?\.id/)
})

test('Bank matcher applica memoria DecisionFeedback LAB', async () => {
  const source = await readFile(new URL('../src/modules/contabilita/components/riconciliazione/runRiconciliazioneMatchForMovement.js', import.meta.url), 'utf8')
  assert.match(source, /lookupBankMatchMemory/)
  assert.match(source, /applyBankMatchMemoryBoost/)
  const commit = await readFile(new URL('../src/modules/contabilita/components/riconciliazione/commitReconciliationCanonicalPayload.js', import.meta.url), 'utf8')
  assert.match(commit, /appendDecisionFeedbackEvents/)
  const working = await readFile(new URL('../src/modules/contabilita/components/riconciliazione/RiconciliazioneMovementWorkingView.jsx', import.meta.url), 'utf8')
  assert.match(working, /buildBankDecisionFeedbackEvents/)
})

test('commit Bank non accetta una riga PN con sezione ignota', async () => {
  const { validateReconciliationCommitPayload } = await import('../src/modules/contabilita/components/riconciliazione/validateReconciliationCommitPayload.js')
  const payload = {
    ...ignoredPayload,
    valid: true,
    movementId: 'mov-02',
    decisionId: 'dec-02',
    sourceDecisionStatus: 'accepted',
    decisionType: 'spesa_bancaria',
    primaNota: { dataRegistrazione: '2026-10-08' },
    primaNotaRighe: [
      { sezione: 'dare', importo: 100, sourceRole: 'conto_imputazione' },
      { sezione: 'avere', importo: 100, sourceRole: 'conto_banca' },
      { sezione: 'non_valida', importo: 10, sourceRole: 'conto_imputazione' },
    ],
  }
  const result = validateReconciliationCommitPayload(payload, { allowRealCommit: false })
  assert.equal(result.valid, false)
  assert.ok(result.blockers.includes('prima_nota_righe_sezione_non_valida'))
})
