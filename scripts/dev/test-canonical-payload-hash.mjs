import assert from 'node:assert/strict'
import { buildCanonicalPayloadHash, normalizeCanonicalPayloadForHash } from '../../src/modules/contabilita/canonical/canonicalPayloadHash.js'
import { buildCanonicalPayloadHashFixtures } from '../../src/modules/contabilita/canonical/testCanonicalPayloadHashFixtures.js'

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

function createMockIdempotencyStore() {
  const store = new Map()

  return {
    commit(payload, { dryRun = false, blocked = false } = {}) {
      const payloadHash = buildCanonicalPayloadHash(payload)
      const idempotencyKey = payload.idempotencyKey || payload.source?.sourceDocumentId || payload.sourceDocumentId || 'default'

      if (blocked) {
        return { ok: false, status: 'blocked', idempotencyKey, payloadHash, persisted: false }
      }

      if (dryRun) {
        return { ok: true, status: 'dry_run', idempotencyKey, payloadHash, persisted: false }
      }

      if (!store.has(idempotencyKey)) {
        store.set(idempotencyKey, payloadHash)
        return { ok: true, status: 'committed', idempotencyKey, payloadHash, persisted: true, replay: false, conflict: false }
      }

      const existingHash = store.get(idempotencyKey)
      if (existingHash === payloadHash) {
        return { ok: true, status: 'replay', idempotencyKey, payloadHash, persisted: true, replay: true, conflict: false }
      }

      return {
        ok: false,
        status: 'conflict',
        idempotencyKey,
        payloadHash,
        existingHash,
        persisted: true,
        replay: false,
        conflict: true,
      }
    },
    size() {
      return store.size
    },
  }
}

function shuffleAuditKeys(payload) {
  const clonePayload = clone(payload)
  const audit = clonePayload.audit

  clonePayload.audit = {
    sourceAction: audit.sourceAction,
    createdBy: audit.createdBy,
    importBatch: audit.importBatch,
    sourceModule: audit.sourceModule,
    warnings: audit.warnings,
    overrides: audit.overrides,
    reasons: audit.reasons,
    operatorDecisions: audit.operatorDecisions,
    createdAt: audit.createdAt,
  }

  return clonePayload
}

function run() {
  const fixtures = buildCanonicalPayloadHashFixtures()
  const rows = []

  const record = (name, fn) => {
    try {
      fn()
      rows.push({ case: name, status: 'PASS', detail: '' })
    } catch (error) {
      rows.push({ case: name, status: 'FAIL', detail: error?.message || String(error) })
      throw error
    }
  }

  const importHash = buildCanonicalPayloadHash(fixtures.importPayload)
  const manualHash = buildCanonicalPayloadHash(fixtures.manualPayload)
  const reconciliationHash = buildCanonicalPayloadHash(fixtures.reconciliation)

  record('1 same payload same hash', () => {
    assert.equal(buildCanonicalPayloadHash(fixtures.importPayload), importHash)
  })

  record('2 object key order stable', () => {
    const shuffled = shuffleAuditKeys(fixtures.importPayload)
    assert.equal(buildCanonicalPayloadHash(shuffled), importHash)
  })

  record('3 transient fields ignored', () => {
    const variant = clone(fixtures.manualPayload)
    variant.audit.createdAt = '2026-04-14T00:00:00Z'
    variant.audit.requestId = 'req-999'
    assert.equal(buildCanonicalPayloadHash(variant), manualHash)
  })

  record('4 numeric strings normalized', () => {
    const variant = clone(fixtures.importPayload)
    variant.document.totals.taxable = 1234.5
    variant.document.totals.vat = 271.59
    variant.accounting.rows[0].debit = 0
    variant.accounting.rows[0].credit = 1506.09
    variant.accounting.rows[1].debit = 1506.09
    variant.accounting.rows[1].credit = 0

    const stringVariant = clone(fixtures.importPayload)
    assert.equal(buildCanonicalPayloadHash(stringVariant), buildCanonicalPayloadHash(variant))
  })

  record('5 document number preserved', () => {
    const normalized = normalizeCanonicalPayloadForHash(fixtures.importPayload)
    assert.equal(normalized.document.numeroDocumento, '001')
  })

  record('6 ordered rows keep order semantics', () => {
    const reversed = clone(fixtures.importPayload)
    reversed.accounting.rows = [...reversed.accounting.rows].reverse()
    assert.notEqual(buildCanonicalPayloadHash(reversed), importHash)
  })

  record('7 reconciliation payload hashes', () => {
    assert.equal(typeof reconciliationHash, 'string')
    assert.equal(reconciliationHash.length, 64)
  })

  record('8 explicit unordered array same hash', () => {
    const unordered = fixtures.unorderedVariant
    const reversed = clone(unordered)
    reversed.subjects = [...reversed.subjects].reverse()
    reversed.subjects.__unordered = true
    assert.equal(buildCanonicalPayloadHash(reversed), buildCanonicalPayloadHash(unordered))
  })

  record('9 replay returns replay', () => {
    const store = createMockIdempotencyStore()
    const first = store.commit(fixtures.manualPayload)
    const second = store.commit(clone(fixtures.manualPayload))
    assert.equal(first.status, 'committed')
    assert.equal(second.status, 'replay')
    assert.equal(store.size(), 1)
  })

  record('10 conflict returns conflict', () => {
    const store = createMockIdempotencyStore()
    store.commit(fixtures.manualPayload)
    const variant = clone(fixtures.manualPayload)
    variant.accounting.rows[0].description = 'different description'
    const result = store.commit(variant)
    assert.equal(result.status, 'conflict')
    assert.equal(result.conflict, true)
  })

  record('11 dry run does not persist', () => {
    const store = createMockIdempotencyStore()
    const result = store.commit(fixtures.importPayload, { dryRun: true })
    assert.equal(result.status, 'dry_run')
    assert.equal(store.size(), 0)
    const committed = store.commit(fixtures.importPayload)
    assert.equal(committed.status, 'committed')
    assert.equal(store.size(), 1)
  })

  record('12 blocked commit stays blocked', () => {
    const store = createMockIdempotencyStore()
    const result = store.commit(fixtures.reconciliation, { blocked: true })
    assert.equal(result.status, 'blocked')
    assert.equal(store.size(), 0)
  })

  printTable(rows)
  console.log(`\nCanonical payload hash checks passed: ${rows.length}`)
}

try {
  run()
} catch {
  process.exitCode = 1
}
