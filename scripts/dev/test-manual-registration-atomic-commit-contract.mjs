import assert from 'node:assert/strict'
import {
  buildManualRegistrationCanonicalPayloadFromState,
  buildManualRegistrationCommitInput,
} from '../../src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js'
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

function makeManualState(overrides = {}) {
  return {
    societaId: 'soc-001',
    esercizioId: '2026',
    header: {
      data_registrazione: '2026-04-13',
      causale_id: 'causale-man-001',
      cliente_fornitore_id: 'cf-001',
      cliente_fornitore_nome: 'Fornitore Alfa',
      numero_registrazione: 'M-001',
      ...overrides.header,
    },
    rows: overrides.rows || [
      { id: 'r1', conto_id: 'conto-man-001', descrizione: 'Prima riga manuale', dare: '100,00', avere: '' },
      { id: 'r2', conto_id: 'conto-man-002', descrizione: 'Seconda riga manuale', dare: '', avere: '100,00' },
    ],
    progressivo: overrides.progressivo ?? 42,
    partitarioClosedMap: overrides.partitarioClosedMap || { 'doc-part-001': 100 },
    defaultDataRegistrazione: '2026-04-13',
    sourceDoc: overrides.sourceDoc || {
      id: 'manual-doc-001',
      numero_documento: 'M-001',
      data_documento: '2026-04-11',
      tipo_documento: 'manuale',
      soggetto_denominazione: 'Fornitore Alfa',
      cliente_fornitore_id: 'cf-001',
    },
    utente: overrides.utente || { id: 'user-001' },
    draftId: overrides.draftId || 'draft-man-001',
    payloadId: overrides.payloadId || 'payload-man-001',
    sourceDocumentId: overrides.sourceDocumentId || 'manual-doc-001',
    validation: overrides.validation || { blocking: [], errors: [], warnings: [] },
    postCommitTargets: overrides.postCommitTargets || {
      shouldCreatePrimaNota: true,
      shouldCreateDocumentiContabilita: true,
      shouldCreateIva: false,
      shouldUpdateAuditTrail: true,
    },
  }
}

function createPreviewStore() {
  return {
    auditRecords: [],
    auditsByKey: new Map(),
    createdRecords: {
      primaNota: [],
      primaNotaRighe: [],
      registriIva: [],
      partitario: [],
      movimentiBancari: [],
      documentiContabilita: [],
    },
  }
}

function createPreviewRepo(store) {
  return {
    canWriteAudit: () => false,
    canRunAtomicCommit: () => false,
    async findCommitByIdempotencyKey(idempotencyKey) {
      const key = String(idempotencyKey || '').trim()
      return { data: key ? clone(store.auditsByKey.get(key) || null) : null, error: null }
    },
  }
}

function rememberPreview(store, commitInput, result) {
  if (!result || !commitInput?.idempotencyKey) return
  if (!['dry_run', 'replayed'].includes(result.status)) return
  const audit = {
    id: result.auditId || `preview-${store.auditRecords.length + 1}`,
    idempotency_key: commitInput.idempotencyKey,
    payload_hash: result.payloadHash || buildCanonicalPayloadHash(commitInput.canonicalPayload),
    mode: result.mode || 'dry_run',
    status: result.status,
    created_ids: clone(result.createdIds || {}),
    warnings: clone(result.warnings || []),
    blockers: clone(result.blockers || []),
    result_snapshot: clone(result.resultSnapshot || result.auditPreview || {}),
  }
  const existingIndex = store.auditRecords.findIndex((entry) => entry.idempotency_key === commitInput.idempotencyKey)
  if (existingIndex >= 0) {
    store.auditRecords[existingIndex] = audit
  } else {
    store.auditRecords.push(audit)
  }
  store.auditsByKey.set(commitInput.idempotencyKey, audit)
}

function buildManualInput(stateOverrides = {}, helperOverrides = {}, options = {}) {
  const state = makeManualState(stateOverrides)
  const canonicalPayload = buildManualRegistrationCanonicalPayloadFromState(state)
  const commitInput = buildManualRegistrationCommitInput({
    canonicalPayload,
    context: {
      societaId: state.societaId,
      esercizioId: state.esercizioId,
      utenteId: state.utente.id,
      sourceDocumentId: state.sourceDocumentId,
      draftId: state.draftId,
      payloadId: state.payloadId,
      ...helperOverrides,
    },
    options,
  })
  return { state, canonicalPayload, commitInput }
}

async function runGatedCommit(commitInput, store, options = {}) {
  const result = await commitCanonicalAccountingPayload(commitInput, {
    repo: createPreviewRepo(store),
    dryRun: options.dryRun !== false,
    allowRealCommit: false,
    auditWriteEnabled: false,
    expectedPayloadVersion: options.expectedPayloadVersion || commitInput?.canonicalPayload?.schemaVersion || '1.0.0',
  })
  rememberPreview(store, commitInput, result)
  return result
}

function counts(store) {
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

function assertReplayShape(firstResult, secondResult) {
  assert.equal(secondResult.status, 'replayed')
  assert.equal(secondResult.reusedExistingCommit, true)
  assert.deepEqual(secondResult.createdIds, firstResult.createdIds)
}

async function runCase(name, fn) {
  try {
    await fn()
    return { case: name, status: 'PASS', detail: '' }
  } catch (error) {
    return { case: name, status: 'FAIL', detail: error?.message || String(error) }
  }
}

const rows = []

rows.push(await runCase('1 helper builds manual commit input', async () => {
  const { canonicalPayload, commitInput } = buildManualInput()
  assert.equal(commitInput.sourceModule, 'registrazione_manual')
  assert.equal(commitInput.societaId, 'soc-001')
  assert.equal(commitInput.esercizioId, '2026')
  assert.equal(commitInput.utenteId, 'user-001')
  assert.ok(commitInput.sourceDocumentId)
  assert.ok(commitInput.idempotencyKey.startsWith('manual:soc-001:2026:'))
  assert.equal(commitInput.canonicalPayload.sourceModule, 'registrazione_manual')
  assert.equal(commitInput.canonicalPayload.sourceDocumentId, commitInput.sourceDocumentId)
  assert.equal(buildCanonicalPayloadHash(canonicalPayload), buildCanonicalPayloadHash(commitInput.canonicalPayload))
}))

rows.push(await runCase('2 helper idempotency stable', async () => {
  const first = buildManualInput()
  const second = buildManualInput()
  assert.equal(first.commitInput.idempotencyKey, second.commitInput.idempotencyKey)
  assert.equal(first.commitInput.sourceDocumentId, second.commitInput.sourceDocumentId)
}))

rows.push(await runCase('3 dry run no final records', async () => {
  const store = createPreviewStore()
  const { commitInput } = buildManualInput({}, {}, { dryRun: true, allowRealCommit: false, requestId: 'manual-dry-001' })
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'dry_run')
  assert.equal(result.success, true)
  assert.equal(result.noDbWriteInDryRun, true)
  assert.equal(counts(store).primaNota, 0)
  assert.equal(counts(store).audit, 1)
  assert.ok(result.auditPreview)
}))

rows.push(await runCase('4 allowRealCommit false blocca write finale', async () => {
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'registrazione_manual',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'manual:soc-001:2026:source-doc-001',
    canonicalPayload: buildManualInput().canonicalPayload,
  }, {
    dryRun: false,
    allowRealCommit: false,
    auditWriteEnabled: false,
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('real_commit_disabled'), true)
}))

rows.push(await runCase('5 replay same key same payload', async () => {
  const store = createPreviewStore()
  const { commitInput } = buildManualInput({}, {}, { dryRun: true, allowRealCommit: false, requestId: 'manual-replay-001' })
  const first = await runGatedCommit(commitInput, store, { dryRun: true })
  const second = await runGatedCommit(clone(commitInput), store, { dryRun: true })
  assert.equal(first.status, 'dry_run')
  assertReplayShape(first, second)
  assert.equal(counts(store).audit, 1)
}))

rows.push(await runCase('6 same key different payload conflicts', async () => {
  const store = createPreviewStore()
  const { commitInput } = buildManualInput({}, {}, { dryRun: true, allowRealCommit: false, requestId: 'manual-conflict-001' })
  const first = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(first.status, 'dry_run')
  const conflicted = clone(commitInput)
  conflicted.canonicalPayload.accounting.rows[0].debit = '111.00'
  conflicted.canonicalPayload.primaNotaRighe[0].dare = 111
  const second = await runGatedCommit(conflicted, store, { dryRun: true })
  assert.equal(second.status, 'blocked')
  assert.equal(second.blockers.includes('idempotency_conflict'), true)
}))

rows.push(await runCase('7 legacy reference blocked', async () => {
  const store = createPreviewStore()
  const { commitInput } = buildManualInput({}, {}, { dryRun: true, allowRealCommit: false, requestId: 'manual-legacy-001' })
  commitInput.canonicalPayload.legacyReference = 'createScritturaContabile'
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('legacy_reference_detected'), true)
  assert.equal(counts(store).primaNota, 0)
}))

rows.push(await runCase('8 tenant mismatch blocked', async () => {
  const store = createPreviewStore()
  const { commitInput } = buildManualInput({}, {}, { dryRun: true, allowRealCommit: false, requestId: 'manual-tenant-001' })
  commitInput.canonicalPayload.company.societaId = 'soc-other'
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('tenant_scope_mismatch'), true)
}))

rows.push(await runCase('9 missing idempotencyKey blocked', async () => {
  const store = createPreviewStore()
  const { commitInput } = buildManualInput({}, {}, { dryRun: true, allowRealCommit: false, requestId: 'manual-missing-idem-001' })
  commitInput.idempotencyKey = ''
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('idempotencyKey_missing'), true)
}))

rows.push(await runCase('10 output compatibile con UI manuale', async () => {
  const store = createPreviewStore()
  const { commitInput } = buildManualInput({}, {}, { dryRun: true, allowRealCommit: false, requestId: 'manual-ui-001' })
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'dry_run')
  assert.equal(result.mode, 'dry_run')
  assert.equal(result.idempotencyKey, commitInput.idempotencyKey)
  assert.equal(result.payloadHash, buildCanonicalPayloadHash(commitInput.canonicalPayload))
  assert.ok(result.auditPreview)
  assert.ok(Array.isArray(result.warnings))
  assert.equal(result.noDbWriteInDryRun, true)
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
  console.log('All manual registration atomic commit contract checks passed.')
}
