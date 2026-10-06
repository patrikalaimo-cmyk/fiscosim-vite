import assert from 'node:assert/strict'
import { buildCanonicalPayloadHash } from '../../src/modules/contabilita/canonical/canonicalPayloadHash.js'
import { commitCanonicalAccountingPayload } from '../../services/canonicalAccountingCommitService.js'

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

function runCase(name, fn) {
  try {
    return { case: name, status: 'PASS', detail: '', fn }
  } catch (error) {
    return { case: name, status: 'FAIL', detail: error?.message || String(error), fn }
  }
}

function makeCanonicalPayload(overrides = {}) {
  return {
    schemaVersion: 'core-closure-13-atomic-1',
    payloadId: 'payload-001',
    sourceModule: 'registrazione_manual',
    source: {
      module: 'registrazione_manual',
      sourceDocumentId: 'source-doc-001',
    },
    company: {
      societaId: 'soc-001',
      esercizioId: '2026',
    },
    header: {
      numeroRegistrazione: 'PN-001',
      descrizione: 'Registrazione test',
    },
    document: {
      numeroDocumento: 'DOC-001',
      dataDocumento: '2026-05-08',
    },
    primaNotaRighe: [
      { rigaNumero: 1, contoCodice: '1000', importoDare: 100, importoAvere: 0 },
      { rigaNumero: 2, contoCodice: '2000', importoDare: 0, importoAvere: 100 },
    ],
    registriIva: [],
    partitarioMovements: [],
    validation: {
      blockers: [],
      blocking: [],
      errors: [],
      warnings: [],
    },
    ...overrides,
  }
}

function createStubRepo({ existingCommit = null, canRunAtomicCommit = false, auditWriteEnabled = false } = {}) {
  const calls = {
    find: 0,
    insertAudit: 0,
    updateAudit: 0,
    primaNota: 0,
    righe: 0,
    registriIva: 0,
    partitario: 0,
    sourceDocument: 0,
    movement: 0,
    atomic: 0,
  }

  const repo = {
    calls,
    canWriteAudit: () => auditWriteEnabled,
    canRunAtomicCommit: () => canRunAtomicCommit,
    async findCommitByIdempotencyKey(idempotencyKey) {
      calls.find += 1
      if (existingCommit && existingCommit.idempotency_key === idempotencyKey) {
        return { data: clone(existingCommit), error: null }
      }
      return { data: null, error: null }
    },
    async insertCommitAudit(row) {
      calls.insertAudit += 1
      return { data: { ...clone(row), id: 'audit-001' }, error: null }
    },
    async updateCommitAudit() {
      calls.updateAudit += 1
      return { data: null, error: null }
    },
    async createPrimaNota(payload) {
      calls.primaNota += 1
      return { data: { id: 'pn-001', ...clone(payload) }, error: null }
    },
    async createPrimaNotaRighe(rows) {
      calls.righe += 1
      return { data: (Array.isArray(rows) ? rows : []).map((row, index) => ({ id: `pnr-${index + 1}`, ...clone(row) })), error: null }
    },
    async createRegistriIva(rows) {
      calls.registriIva += 1
      return { data: (Array.isArray(rows) ? rows : []).map((row, index) => ({ id: `iva-${index + 1}`, ...clone(row) })), error: null }
    },
    async createPartitario(rows) {
      calls.partitario += 1
      return { data: (Array.isArray(rows) ? rows : []).map((row, index) => ({ id: `part-${index + 1}`, ...clone(row) })), error: null }
    },
    async updateSourceDocumentStatus() {
      calls.sourceDocument += 1
      return { data: { id: 'source-doc-001' }, error: null }
    },
    async updateBankMovementStatus() {
      calls.movement += 1
      return { data: { id: 'movement-001' }, error: null }
    },
    async runAtomicCommit(work) {
      calls.atomic += 1
      return work(repo)
    },
  }

  return repo
}

const rows = []

rows.push(runCase('1 dry run non scrive tabelle finali', async () => {
  const repo = createStubRepo({ auditWriteEnabled: false })
  const canonicalPayload = makeCanonicalPayload()
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload,
  }, {
    repo,
    dryRun: true,
    allowRealCommit: false,
    auditWriteEnabled: false,
  })

  assert.equal(result.status, 'dry_run')
  assert.equal(result.noDbWriteInDryRun, true)
  assert.equal(result.auditPersisted, false)
  assert.equal(repo.calls.primaNota, 0)
  assert.equal(repo.calls.righe, 0)
  assert.equal(repo.calls.registriIva, 0)
  assert.equal(repo.calls.partitario, 0)
}))

rows.push(runCase('2 allowRealCommit false blocca write finale', async () => {
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    dryRun: false,
    allowRealCommit: false,
    auditWriteEnabled: false,
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('real_commit_disabled'), true)
}))

rows.push(runCase('3 idempotencyKey obbligatoria', async () => {
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: '',
    canonicalPayload: makeCanonicalPayload(),
  }, { dryRun: true, allowRealCommit: false })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('idempotencyKey_missing'), true)
}))

rows.push(runCase('4 payload_hash stabile', async () => {
  const first = makeCanonicalPayload()
  const second = clone(first)
  assert.equal(buildCanonicalPayloadHash(first), buildCanonicalPayloadHash(second))
}))

rows.push(runCase('5 replay stessa chiave stesso payload', async () => {
  const payload = makeCanonicalPayload()
  const payloadHash = buildCanonicalPayloadHash(payload)
  const repo = createStubRepo({
    existingCommit: {
      id: 'audit-existing-001',
      idempotency_key: 'manual:soc-001:2026:source-doc-001',
      payload_hash: payloadHash,
      mode: 'commit',
      status: 'committed',
      created_ids: { primaNotaId: 'pn-001' },
      result_snapshot: { createdIds: { primaNotaId: 'pn-001' } },
    },
  })

  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: payload,
  }, { repo, dryRun: false, allowRealCommit: false })

  assert.equal(result.status, 'replayed')
  assert.equal(result.reusedExistingCommit, true)
  assert.equal(result.auditId, 'audit-existing-001')
}))

rows.push(runCase('6 stessa chiave payload diverso conflict', async () => {
  const repo = createStubRepo({
    existingCommit: {
      id: 'audit-existing-002',
      idempotency_key: 'manual:soc-001:2026:source-doc-001',
      payload_hash: 'different-hash',
      mode: 'commit',
      status: 'committed',
    },
  })

  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, { repo, dryRun: false, allowRealCommit: false })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('idempotency_conflict'), true)
}))

rows.push(runCase('7 legacy reference bloccato', async () => {
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload({ legacyReference: 'createScritturaContabile' }),
  }, { dryRun: true, allowRealCommit: false })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('legacy_reference_detected'), true)
}))

rows.push(runCase('8 tenant mismatch bloccato', async () => {
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload({ company: { societaId: 'soc-other', esercizioId: '2026' } }),
  }, { dryRun: true, allowRealCommit: false })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('tenant_scope_mismatch'), true)
}))

rows.push(runCase('9 sourceModule non ammesso bloccato', async () => {
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'not_allowed',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload({ sourceModule: 'not_allowed', source: { module: 'not_allowed', sourceDocumentId: 'source-doc-001' } }),
  }, { dryRun: true, allowRealCommit: false })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('source_module_not_allowed'), true)
}))

rows.push(runCase('10 audit preview prodotto', async () => {
  const repo = createStubRepo({ auditWriteEnabled: false })
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, { repo, dryRun: true, allowRealCommit: false, auditWriteEnabled: false })

  assert.ok(result.auditPreview)
  assert.equal(result.auditPersisted, false)
  assert.equal(repo.calls.insertAudit, 0)
}))

rows.push(runCase('11 audit write gated', async () => {
  const repo = createStubRepo({ auditWriteEnabled: true })
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, { repo, dryRun: true, allowRealCommit: false, auditWriteEnabled: true })

  assert.equal(result.status, 'dry_run')
  assert.equal(result.auditPersisted, true)
  assert.equal(repo.calls.insertAudit, 1)
}))

rows.push(runCase('12 commit reale bloccato senza transazione', async () => {
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, { dryRun: false, allowRealCommit: true, auditWriteEnabled: false })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('real_commit_requires_rpc'), true)
}))

rows.push(runCase('13 dev local direct resta bloccato senza writer', async () => {
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    dryRun: false,
    allowRealCommit: true,
    devLocalDirect: true,
    supabaseUrl: 'http://127.0.0.1:54321',
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('dev_local_writer_missing'), true)
}))

rows.push(runCase('14 dev local direct usa writer locale finto', async () => {
  let writerCalls = 0
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    dryRun: false,
    allowRealCommit: true,
    devLocalDirect: true,
    supabaseUrl: 'http://127.0.0.1:54321',
    devLocalDirectWriter: async ({ payloadHash, sourceModule, sourceDocumentId, idempotencyKey, commitPlan }) => {
      writerCalls += 1
      return {
        status: 'committed',
        mode: 'commit',
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        createdIds: {
          primaNotaId: 'pn-local-001',
          primaNotaRigheIds: ['pnr-local-001', 'pnr-local-002'],
          registriIvaIds: [],
          partitarioIds: [],
          sourceDocumentId: null,
          bankMovementId: null,
        },
        warnings: ['dev_local_direct_stub'],
        blockers: [],
        auditId: 'audit-local-001',
        auditPersisted: false,
        resultSnapshot: {
          committedVia: 'dev_local_direct',
          planHasPrimaNota: Boolean(commitPlan.primaNota),
        },
      }
    },
  })

  assert.equal(writerCalls, 1)
  assert.equal(result.status, 'committed')
  assert.equal(result.blockers.length, 0)
  assert.equal(result.resultSnapshot.committedVia, 'dev_local_direct')
  assert.equal(result.resultSnapshot.planHasPrimaNota, true)
}))

const resolvedRows = []
for (const row of rows) {
  try {
    await row.fn()
    resolvedRows.push({ case: row.case, status: 'PASS', detail: '' })
  } catch (error) {
    resolvedRows.push({ case: row.case, status: 'FAIL', detail: error?.message || String(error) })
  }
}

printTable(resolvedRows)

const failures = resolvedRows.filter((row) => row.status !== 'PASS')
console.log('')
console.log(`Totale casi: ${resolvedRows.length}`)
console.log(`PASS: ${resolvedRows.length - failures.length}`)
console.log(`FAIL: ${failures.length}`)

if (failures.length > 0) {
  console.log('')
  console.log('Elenco fail:')
  for (const failure of failures) {
    console.log(`- ${failure.case}: ${failure.detail}`)
  }
  process.exitCode = 1
} else {
  console.log('Canonical real commit contract checks passed.')
}
