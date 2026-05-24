import assert from 'node:assert/strict'
import { createCanonicalAccountingCommitRepository } from '../../services/canonicalAccountingCommitRepository.js'
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
  return { case: name, fn }
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

function makeRpcClient(resultFactory) {
  const calls = []
  return {
    calls,
    async rpc(name, params) {
      calls.push({ name, params: clone(params) })
      return resultFactory(name, params)
    },
  }
}

function makeServiceRepo(overrides = {}) {
  const calls = {
    rpc: 0,
    find: 0,
    findArgs: [],
    createPrimaNota: 0,
    createPrimaNotaRighe: 0,
    createRegistriIva: 0,
    createPartitario: 0,
    updateSourceDocumentStatus: 0,
    updateBankMovementStatus: 0,
  }

  return {
    calls,
    canWriteAudit: () => false,
    canRunAtomicCommit: () => false,
    async findCommitByIdempotencyKey(idempotencyKey, mode, sourceModule) {
      calls.find += 1
      calls.findArgs.push({ idempotencyKey, mode, sourceModule })
      return { data: null, error: null }
    },
    async callCommitCanonicalAccountingPayloadRpc(input, options) {
      calls.rpc += 1
      if (typeof overrides.callCommitCanonicalAccountingPayloadRpc === 'function') {
        return overrides.callCommitCanonicalAccountingPayloadRpc(input, options, calls)
      }
      return clone(overrides.rpcResult || {
        success: true,
        status: 'replayed',
        mode: 'commit',
        idempotencyKey: input.idempotencyKey,
        payloadHash: options.payloadHash,
        sourceModule: input.sourceModule,
        sourceDocumentId: input.sourceDocumentId,
        createdIds: { primaNotaId: 'pn-rpc-001' },
        warnings: [],
        blockers: [],
        auditId: 'audit-rpc-001',
        resultSnapshot: { source: 'rpc' },
        reusedExistingCommit: true,
        auditPersisted: true,
      })
    },
    async createPrimaNota() {
      calls.createPrimaNota += 1
      return { data: { id: 'pn-local-001' }, error: null }
    },
    async createPrimaNotaRighe() {
      calls.createPrimaNotaRighe += 1
      return { data: [], error: null }
    },
    async createRegistriIva() {
      calls.createRegistriIva += 1
      return { data: [], error: null }
    },
    async createPartitario() {
      calls.createPartitario += 1
      return { data: [], error: null }
    },
    async updateSourceDocumentStatus() {
      calls.updateSourceDocumentStatus += 1
      return { data: { id: 'source-doc-001' }, error: null }
    },
    async updateBankMovementStatus() {
      calls.updateBankMovementStatus += 1
      return { data: { id: 'movement-001' }, error: null }
    },
    ...overrides,
  }
}

const rows = []

rows.push(runCase('repo default non usa RPC', async () => {
  const repo = createCanonicalAccountingCommitRepository({})
  const result = await repo.callCommitCanonicalAccountingPayloadRpc({ idempotencyKey: 'k-1' }, { useRpc: false })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('rpc_not_enabled'), true)
}))

rows.push(runCase('repo senza client blocca RPC', async () => {
  const repo = createCanonicalAccountingCommitRepository({})
  const result = await repo.callCommitCanonicalAccountingPayloadRpc({ idempotencyKey: 'k-1' }, { useRpc: true })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('rpc_client_unavailable'), true)
}))

rows.push(runCase('repo RPC replay', async () => {
  const rpcClient = makeRpcClient((name, params) => ({
    data: {
      success: true,
      status: 'replayed',
      mode: 'commit',
      idempotencyKey: params.p_idempotency_key,
      payloadHash: params.p_payload_hash,
      sourceModule: params.p_source_module,
      sourceDocumentId: params.p_source_document_id,
      createdIds: { primaNotaId: 'pn-rpc-001' },
      warnings: [],
      blockers: [],
      auditId: 'audit-rpc-001',
      resultSnapshot: { source: 'rpc' },
      reusedExistingCommit: true,
      auditPersisted: true,
    },
    error: null,
  }))
  const repo = createCanonicalAccountingCommitRepository({ db: rpcClient })
  const payload = makeCanonicalPayload()
  const payloadHash = 'hash-rpc-001'
  const result = await repo.callCommitCanonicalAccountingPayloadRpc({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: payload,
    payloadHash,
  }, {
    useRpc: true,
    supabaseClient: rpcClient,
    payloadHash,
    dryRun: false,
    allowRealCommit: true,
  })

  assert.equal(rpcClient.calls.length, 1)
  assert.equal(rpcClient.calls[0].name, 'commit_canonical_accounting_payload')
  assert.equal(result.status, 'replayed')
  assert.equal(result.mode, 'commit')
  assert.equal(result.idempotencyKey, 'manual:soc-001:2026:source-doc-001')
  assert.equal(result.payloadHash, payloadHash)
}))

rows.push(runCase('repo RPC conflict', async () => {
  const rpcClient = makeRpcClient((name, params) => ({
    data: {
      success: false,
      status: 'blocked',
      mode: 'commit',
      idempotencyKey: params.p_idempotency_key,
      payloadHash: params.p_payload_hash,
      sourceModule: params.p_source_module,
      sourceDocumentId: params.p_source_document_id,
      createdIds: {},
      warnings: [],
      blockers: ['idempotency_conflict'],
      auditId: 'audit-rpc-002',
      resultSnapshot: { source: 'rpc' },
      auditPersisted: true,
    },
    error: null,
  }))
  const repo = createCanonicalAccountingCommitRepository({ db: rpcClient })
  const result = await repo.callCommitCanonicalAccountingPayloadRpc({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    useRpc: true,
    supabaseClient: rpcClient,
    payloadHash: 'hash-rpc-002',
    dryRun: false,
    allowRealCommit: true,
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('idempotency_conflict'), true)
}))

rows.push(runCase('repo RPC error mapped safely', async () => {
  const rpcClient = makeRpcClient(() => ({
    data: null,
    error: { message: 'boom', code: 'PGRST999', details: 'details', hint: 'hint' },
  }))
  const repo = createCanonicalAccountingCommitRepository({ db: rpcClient })
  const result = await repo.callCommitCanonicalAccountingPayloadRpc({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    useRpc: true,
    supabaseClient: rpcClient,
    payloadHash: 'hash-rpc-003',
    dryRun: false,
    allowRealCommit: true,
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.success, false)
  assert.equal(result.errorCode, 'PGRST999')
}))

rows.push(runCase('service default non usa RPC', async () => {
  const repo = makeServiceRepo()
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    repo,
    dryRun: false,
    allowRealCommit: true,
    useRpc: false,
  })

  assert.equal(repo.calls.rpc, 0)
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('real_commit_requires_rpc'), true)
}))

rows.push(runCase('service dryRun true non usa RPC', async () => {
  const repo = makeServiceRepo()
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    repo,
    dryRun: true,
    allowRealCommit: true,
    useRpc: true,
  })

  assert.equal(repo.calls.rpc, 0)
  assert.equal(repo.calls.find, 1)
  assert.equal(repo.calls.findArgs[0].mode, 'dry_run')
  assert.equal(result.status, 'dry_run')
}))

rows.push(runCase('service commit lookup usa mode commit', async () => {
  const repo = makeServiceRepo()
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    repo,
    dryRun: false,
    allowRealCommit: false,
    useRpc: false,
  })

  assert.equal(repo.calls.rpc, 0)
  assert.equal(repo.calls.find, 1)
  assert.equal(repo.calls.findArgs[0].mode, 'commit')
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('real_commit_disabled'), true)
}))

rows.push(runCase('service allowRealCommit false non usa RPC', async () => {
  const repo = makeServiceRepo()
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    repo,
    dryRun: false,
    allowRealCommit: false,
    useRpc: true,
  })

  assert.equal(repo.calls.rpc, 0)
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('real_commit_disabled'), true)
}))

rows.push(runCase('service useRpc attivo delega al repo', async () => {
  const repo = makeServiceRepo({
    rpcResult: {
      success: true,
      status: 'replayed',
      mode: 'commit',
      idempotencyKey: 'manual:soc-001:2026:source-doc-001',
      payloadHash: 'hash-service-001',
      sourceModule: 'registrazione_manual',
      sourceDocumentId: 'source-doc-001',
      createdIds: { primaNotaId: 'pn-rpc-001' },
      warnings: ['rpc-path'],
      blockers: [],
      auditId: 'audit-service-rpc-001',
      resultSnapshot: { from: 'rpc' },
      reusedExistingCommit: true,
      auditPersisted: true,
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
  }, {
    repo,
    dryRun: false,
    allowRealCommit: true,
    useRpc: true,
  })

  assert.equal(repo.calls.rpc, 1)
  assert.equal(result.status, 'replayed')
  assert.equal(result.reusedExistingCommit, true)
  assert.equal(result.idempotencyKey, 'manual:soc-001:2026:source-doc-001')
  assert.equal(result.payloadHash, 'hash-service-001')
  assert.equal(result.mode, 'commit')
  assert.equal(result.createdIds.primaNotaId, 'pn-rpc-001')
}))

rows.push(runCase('service replay del repo propagato', async () => {
  const repo = makeServiceRepo({
    rpcResult: {
      success: true,
      status: 'replayed',
      mode: 'commit',
      idempotencyKey: 'manual:soc-001:2026:source-doc-001',
      payloadHash: 'hash-service-002',
      sourceModule: 'registrazione_manual',
      sourceDocumentId: 'source-doc-001',
      createdIds: { primaNotaId: 'pn-rpc-002' },
      warnings: [],
      blockers: [],
      auditId: 'audit-service-rpc-002',
      resultSnapshot: { replayed: true },
      reusedExistingCommit: true,
      auditPersisted: true,
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
  }, {
    repo,
    dryRun: false,
    allowRealCommit: true,
    useRpc: true,
  })

  assert.equal(result.status, 'replayed')
  assert.equal(result.reusedExistingCommit, true)
}))

rows.push(runCase('service conflict del repo propagato', async () => {
  const repo = makeServiceRepo({
    rpcResult: {
      success: false,
      status: 'blocked',
      mode: 'commit',
      idempotencyKey: 'manual:soc-001:2026:source-doc-001',
      payloadHash: 'hash-service-003',
      sourceModule: 'registrazione_manual',
      sourceDocumentId: 'source-doc-001',
      createdIds: {},
      warnings: [],
      blockers: ['idempotency_conflict'],
      auditId: 'audit-service-rpc-003',
      resultSnapshot: { conflict: true },
      auditPersisted: true,
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
  }, {
    repo,
    dryRun: false,
    allowRealCommit: true,
    useRpc: true,
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('idempotency_conflict'), true)
}))

rows.push(runCase('service errore repo gestito in sicurezza', async () => {
  const repo = makeServiceRepo({
    callCommitCanonicalAccountingPayloadRpc: async () => {
      throw new Error('rpc failure')
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
  }, {
    repo,
    dryRun: false,
    allowRealCommit: true,
    useRpc: true,
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('rpc_failed'), true)
}))

rows.push(runCase('service repo senza metodo blocca RPC', async () => {
  const repo = {
    canWriteAudit: () => false,
    canRunAtomicCommit: () => false,
    async findCommitByIdempotencyKey() {
      return { data: null, error: null }
    },
  }
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: makeCanonicalPayload(),
  }, {
    repo,
    dryRun: false,
    allowRealCommit: true,
    useRpc: true,
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('rpc_repository_unavailable'), true)
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
  console.log('Canonical RPC contract checks passed.')
}
