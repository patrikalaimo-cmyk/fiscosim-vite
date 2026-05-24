import assert from 'node:assert/strict'
import { buildCanonicalPayloadHash } from '../../src/modules/contabilita/canonical/canonicalPayloadHash.js'
import {
  commitCanonicalAccountingPayloadMock,
  createEmptyMockCanonicalCommitStore,
} from '../../src/modules/contabilita/canonical/mockCanonicalCommitAdapter.js'
import { buildCanonicalCommitAdapterFixtures } from '../../src/modules/contabilita/canonical/testCanonicalCommitAdapterFixtures.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function printTable(rows) {
  const headers = ['case', 'status', 'detail']
  const widths = Object.fromEntries(headers.map((header) => [header, header.length]))
  for (const row of rows) {
    for (const header of headers) {
      widths[header] = Math.max(widths[header], String(row[header] ?? '').length)
    }
  }
  console.log(headers.map((header) => header.padEnd(widths[header])).join(' | '))
  console.log(headers.map((header) => '-'.repeat(widths[header])).join('-+-'))
  for (const row of rows) {
    console.log(headers.map((header) => String(row[header] ?? '').padEnd(widths[header])).join(' | '))
  }
}

function makeInput(payload, overrides = {}) {
  return {
    societaId: overrides.societaId || 'soc-001',
    esercizioId: overrides.esercizioId || '2026',
    utenteId: overrides.utenteId || 'user-001',
    sourceModule: overrides.sourceModule || payload.source?.module || payload.sourceModule || 'import_contabilita',
    sourceDocumentId: overrides.sourceDocumentId || payload.source?.sourceDocumentId || payload.sourceDocumentId || 'doc-001',
    idempotencyKey: overrides.idempotencyKey || payload.idempotencyKey || 'idem-001',
    canonicalPayload: payload,
    options: {
      dryRun: Boolean(overrides.dryRun),
      allowRealCommit: overrides.allowRealCommit === true,
      expectedPayloadVersion: overrides.expectedPayloadVersion || '1.0.0',
      requestId: overrides.requestId || 'req-001',
      simulateFailureAt: overrides.simulateFailureAt || '',
    },
  }
}

function getCounts(store) {
  return {
    primaNota: store.createdRecords.primaNota.length,
    primaNotaRighe: store.createdRecords.primaNotaRighe.length,
    registriIva: store.createdRecords.registriIva.length,
    partitario: store.createdRecords.partitario.length,
    movimentiBancari: store.createdRecords.movimentiBancari.length,
    documentiContabilita: store.createdRecords.documentiContabilita.length,
    audit: store.auditRecords.length,
  }
}

function runCase(name, fn) {
  try {
    fn()
    return { case: name, status: 'PASS', detail: '' }
  } catch (error) {
    return { case: name, status: 'FAIL', detail: error?.message || String(error) }
  }
}

function assertAuditHasPayloadHash(audit, payloadHash) {
  assert.equal(audit.payloadHash, payloadHash)
  assert.ok(audit.resultSnapshot)
}

const fixtures = buildCanonicalCommitAdapterFixtures()
const rows = []

rows.push(runCase('1 dry run no final records', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const input = makeInput(fixtures.importCliente, { dryRun: true, allowRealCommit: false })
  const result = commitCanonicalAccountingPayloadMock(input, store)
  assert.equal(result.status, 'dry_run')
  assert.equal(result.success, true)
  assert.equal(result.noDbWriteInDryRun, true)
  assert.equal(getCounts(store).primaNota, 0)
  assert.equal(getCounts(store).audit, 1)
  assert.equal(store.auditRecords[0].status, 'dry_run')
}))

rows.push(runCase('2 import cliente commit mock', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const input = makeInput(fixtures.importCliente, { allowRealCommit: true })
  const result = commitCanonicalAccountingPayloadMock(input, store)
  assert.equal(result.status, 'committed_mock')
  assert.ok(result.createdIds.primaNotaId)
  assert.ok(result.createdIds.primaNotaRigheIds.length > 0)
  assert.ok(result.createdIds.documentiContabilitaId)
  assert.equal(getCounts(store).primaNota, 1)
  assert.equal(getCounts(store).primaNotaRighe > 0, true)
  assert.equal(getCounts(store).documentiContabilita, 1)
  assert.equal(store.auditRecords[0].status, 'committed_mock')
}))

rows.push(runCase('3 manual movement simple commit mock', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const input = makeInput(fixtures.manualSimple, { sourceModule: 'registrazione_manual', sourceDocumentId: 'doc-man-001', idempotencyKey: 'man-001', allowRealCommit: true })
  const result = commitCanonicalAccountingPayloadMock(input, store)
  assert.equal(result.status, 'committed_mock')
  assert.ok(result.createdIds.primaNotaId)
  assert.ok(result.createdIds.primaNotaRigheIds.length > 0)
  assert.equal(result.createdIds.documentiContabilitaId, null)
  assert.equal(result.createdIds.movimentiBancariId, null)
  assert.equal(getCounts(store).primaNota, 1)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('4 reconciliation incasso commit mock', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const input = makeInput(fixtures.reconciliationAccepted, { sourceModule: 'riconciliazione_bancaria', sourceDocumentId: 'mov-001', idempotencyKey: 'rec-001', allowRealCommit: true })
  const result = commitCanonicalAccountingPayloadMock(input, store)
  assert.equal(result.status, 'committed_mock')
  assert.ok(result.createdIds.primaNotaId)
  assert.ok(result.createdIds.partitarioIds.length > 0)
  assert.ok(result.createdIds.movimentiBancariId)
  assert.equal(getCounts(store).movimentiBancari, 1)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('5 ignored reconciliation mock', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const input = makeInput(fixtures.reconciliationIgnored, { sourceModule: 'riconciliazione_bancaria', sourceDocumentId: 'mov-ignored', idempotencyKey: 'rec-ignored', allowRealCommit: true })
  const result = commitCanonicalAccountingPayloadMock(input, store)
  assert.equal(result.status, 'committed_mock')
  assert.equal(result.createdIds.primaNotaId, null)
  assert.ok(result.createdIds.movimentiBancariId)
  assert.equal(getCounts(store).primaNota, 0)
  assert.equal(getCounts(store).movimentiBancari, 1)
  assert.equal(store.auditRecords[0].resultSnapshot.sourceDecisionStatus, 'ignored')
}))

rows.push(runCase('6 replay same key same payload', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const input = makeInput(fixtures.importFornitore, { allowRealCommit: true, idempotencyKey: 'replay-001', sourceDocumentId: 'doc-replay-001' })
  const first = commitCanonicalAccountingPayloadMock(input, store)
  const second = commitCanonicalAccountingPayloadMock(clone(input), store)
  assert.equal(first.status, 'committed_mock')
  assert.equal(second.status, 'replayed')
  assert.equal(second.reusedExistingCommit, true)
  assert.deepEqual(second.createdIds, first.createdIds)
  assert.equal(getCounts(store).audit, 2)
}))

rows.push(runCase('7 idempotency conflict blocked', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const input = makeInput(fixtures.conflictBase, { allowRealCommit: true, idempotencyKey: 'conflict-001', sourceDocumentId: 'doc-conflict-001' })
  const first = commitCanonicalAccountingPayloadMock(input, store)
  assert.equal(first.status, 'committed_mock')
  const conflicted = clone(fixtures.conflictVariant)
  const second = commitCanonicalAccountingPayloadMock(makeInput(conflicted, { allowRealCommit: true, idempotencyKey: 'conflict-001', sourceDocumentId: 'doc-conflict-001' }), store)
  assert.equal(second.status, 'blocked')
  assert.equal(second.blockers.includes('idempotency_conflict'), true)
  assert.equal(getCounts(store).audit, 2)
}))

rows.push(runCase('8 legacy reference blocked', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const result = commitCanonicalAccountingPayloadMock(makeInput(fixtures.legacy, { allowRealCommit: true, idempotencyKey: 'legacy-001', sourceDocumentId: 'doc-legacy-001' }), store)
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('legacy_reference_detected'), true)
  assert.equal(getCounts(store).primaNota, 0)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('9 cross-company blocked', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const result = commitCanonicalAccountingPayloadMock(makeInput(fixtures.crossCompany, { allowRealCommit: true, idempotencyKey: 'cross-001', sourceDocumentId: 'doc-cross-001' }), store)
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('tenant_scope_mismatch'), true)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('10 source module not allowed blocked', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const input = makeInput(fixtures.importCliente, { sourceModule: 'other_module', allowRealCommit: true, idempotencyKey: 'bad-source-001', sourceDocumentId: 'doc-bad-source-001' })
  const result = commitCanonicalAccountingPayloadMock(input, store)
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('source_module_not_allowed'), true)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('11 missing idempotency key blocked', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const result = commitCanonicalAccountingPayloadMock({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'import_contabilita',
    sourceDocumentId: 'doc-missing-001',
    idempotencyKey: '',
    canonicalPayload: fixtures.importCliente,
    options: { dryRun: false, allowRealCommit: true },
  }, store)
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('idempotencyKey_missing'), true)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('12 simulateFailureAt primaNotaRighe rollback primaNota', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const result = commitCanonicalAccountingPayloadMock(makeInput(fixtures.importCliente, { allowRealCommit: true, idempotencyKey: 'fail-righe-001', sourceDocumentId: 'doc-fail-righe-001', simulateFailureAt: 'primaNotaRighe' }), store)
  assert.equal(result.status, 'failed_rollback')
  assert.equal(getCounts(store).primaNota, 0)
  assert.equal(getCounts(store).primaNotaRighe, 0)
  assert.equal(getCounts(store).documentiContabilita, 0)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('13 simulateFailureAt partitario rollback contabili', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const result = commitCanonicalAccountingPayloadMock(makeInput(fixtures.manualInvoice, { allowRealCommit: true, idempotencyKey: 'fail-part-001', sourceDocumentId: 'doc-fail-part-001', simulateFailureAt: 'partitario' }), store)
  assert.equal(result.status, 'failed_rollback')
  assert.equal(getCounts(store).primaNota, 0)
  assert.equal(getCounts(store).primaNotaRighe, 0)
  assert.equal(getCounts(store).partitario, 0)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('14 simulateFailureAt sourceStatusUpdate rollback records', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const result = commitCanonicalAccountingPayloadMock(makeInput(fixtures.reconciliationAccepted, { allowRealCommit: true, idempotencyKey: 'fail-status-001', sourceDocumentId: 'mov-fail-status-001', simulateFailureAt: 'sourceStatusUpdate' }), store)
  assert.equal(result.status, 'failed_rollback')
  assert.equal(getCounts(store).primaNota, 0)
  assert.equal(getCounts(store).primaNotaRighe, 0)
  assert.equal(getCounts(store).partitario, 0)
  assert.equal(getCounts(store).movimentiBancari, 0)
  assert.equal(getCounts(store).documentiContabilita, 0)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('15 createdRecords empty after rollback', () => {
  const store = createEmptyMockCanonicalCommitStore()
  commitCanonicalAccountingPayloadMock(makeInput(fixtures.importCliente, { allowRealCommit: true, idempotencyKey: 'cleanup-001', sourceDocumentId: 'doc-cleanup-001', simulateFailureAt: 'auditCommit' }), store)
  assert.equal(getCounts(store).primaNota, 0)
  assert.equal(getCounts(store).primaNotaRighe, 0)
  assert.equal(getCounts(store).registriIva, 0)
  assert.equal(getCounts(store).partitario, 0)
  assert.equal(getCounts(store).movimentiBancari, 0)
  assert.equal(getCounts(store).documentiContabilita, 0)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('16 audit traces coherent', () => {
  const store = createEmptyMockCanonicalCommitStore()
  commitCanonicalAccountingPayloadMock(makeInput(fixtures.importCliente, { dryRun: true, allowRealCommit: false, idempotencyKey: 'audit-dry-001', sourceDocumentId: 'doc-audit-dry-001' }), store)
  commitCanonicalAccountingPayloadMock(makeInput(fixtures.importCliente, { allowRealCommit: true, idempotencyKey: 'audit-commit-001', sourceDocumentId: 'doc-audit-commit-001' }), store)
  commitCanonicalAccountingPayloadMock(makeInput(fixtures.importCliente, { allowRealCommit: true, idempotencyKey: 'audit-commit-001', sourceDocumentId: 'doc-audit-commit-001' }), store)
  commitCanonicalAccountingPayloadMock(makeInput(fixtures.legacy, { allowRealCommit: true, idempotencyKey: 'audit-block-001', sourceDocumentId: 'doc-audit-block-001' }), store)
  const statuses = store.auditRecords.map((item) => item.status)
  assert.equal(statuses.includes('dry_run'), true)
  assert.equal(statuses.includes('committed_mock'), true)
  assert.equal(statuses.includes('replayed'), true)
  assert.equal(statuses.includes('blocked'), true)
}))

rows.push(runCase('17 payload hash stable in audit', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const input = makeInput(fixtures.importCliente, { allowRealCommit: true, idempotencyKey: 'hash-audit-001', sourceDocumentId: 'doc-hash-audit-001' })
  const result = commitCanonicalAccountingPayloadMock(input, store)
  assert.equal(result.status, 'committed_mock')
  const expectedHash = buildCanonicalPayloadHash(fixtures.importCliente)
  assertAuditHasPayloadHash(store.auditRecords[0], expectedHash)
  assert.equal(result.payloadHash, expectedHash)
}))

rows.push(runCase('18 dry run noDbWriteInDryRun true', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const result = commitCanonicalAccountingPayloadMock(makeInput(fixtures.manualSimple, { dryRun: true, allowRealCommit: false, idempotencyKey: 'dry-001', sourceDocumentId: 'doc-dry-001' }), store)
  assert.equal(result.noDbWriteInDryRun, true)
  assert.equal(result.status, 'dry_run')
  assert.equal(getCounts(store).primaNota, 0)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('19 unsupported complex case blocked', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const complexPayload = clone(fixtures.unsupported)
  complexPayload.mockCase = 'f24'
  complexPayload.flags = { cumulativo: true }
  const result = commitCanonicalAccountingPayloadMock(makeInput(complexPayload, { allowRealCommit: true, idempotencyKey: 'unsupported-001', sourceDocumentId: 'doc-unsupported-001' }), store)
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('unsupported_case_for_atomic_commit'), true)
  assert.equal(getCounts(store).audit, 1)
}))

rows.push(runCase('20 invalid payload version blocked', () => {
  const store = createEmptyMockCanonicalCommitStore()
  const result = commitCanonicalAccountingPayloadMock(makeInput(fixtures.importCliente, { allowRealCommit: true, expectedPayloadVersion: '9.9.9', idempotencyKey: 'version-001', sourceDocumentId: 'doc-version-001' }), store)
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('payload_version_incompatible'), true)
}))

printTable(rows)

const failures = rows.filter((row) => row.status !== 'PASS')
console.log('')
console.log(`Totale casi: ${rows.length}`)
console.log(`PASS: ${rows.length - failures.length}`)
console.log(`FAIL: ${failures.length}`)

if (failures.length > 0) {
  console.log('')
  console.log('Elenco fail:')
  for (const failure of failures) {
    console.log(`- ${failure.case}: ${failure.detail}`)
  }
  process.exitCode = 1
} else {
  console.log('All canonical commit adapter fixture checks passed.')
}
