import test from 'node:test'
import assert from 'node:assert/strict'

import { writeAdminResetAuditSafe } from './resetAuditRepo.js'
import { runResetImportQueue } from './resetImportQueueService.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createFakeDb(seed = {}) {
  const tables = Object.fromEntries(
    Object.entries(seed).map(([table, rows]) => [table, Array.isArray(rows) ? rows.map((row) => clone(row)) : []])
  )

  class QueryBuilder {
    constructor(table) {
      this.table = table
      this.operation = 'select'
      this.columns = '*'
      this.filters = []
      this.orderBy = null
      this.limitCount = null
      this.patch = null
      this.rowsToInsert = null
    }

    select(columns = '*') {
      this.columns = columns
      return this
    }

    update(patch = {}) {
      this.operation = 'update'
      this.patch = clone(patch)
      return this
    }

    insert(rows = []) {
      this.operation = 'insert'
      this.rowsToInsert = Array.isArray(rows) ? rows.map((row) => clone(row)) : []
      return this
    }

    eq(field, value) {
      this.filters.push((row) => row?.[field] === value)
      return this
    }

    in(field, values = []) {
      const allowed = new Set(values)
      this.filters.push((row) => allowed.has(row?.[field]))
      return this
    }

    order(field, { ascending = true } = {}) {
      this.orderBy = { field, ascending }
      return this
    }

    limit(value) {
      this.limitCount = Number(value)
      return this
    }

    maybeSingle() {
      return Promise.resolve(this.executeSingle())
    }

    then(resolve, reject) {
      return Promise.resolve(this.execute()).then(resolve, reject)
    }

    getRows() {
      if (!Array.isArray(tables[this.table])) tables[this.table] = []
      return tables[this.table]
    }

    applyFilters(rows) {
      let result = rows.filter((row) => this.filters.every((fn) => fn(row)))
      if (this.orderBy?.field) {
        const { field, ascending } = this.orderBy
        result = result.slice().sort((a, b) => {
          const av = a?.[field] ?? null
          const bv = b?.[field] ?? null
          if (av === bv) return 0
          if (av == null) return ascending ? 1 : -1
          if (bv == null) return ascending ? -1 : 1
          return ascending ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
        })
      }
      if (Number.isFinite(this.limitCount) && this.limitCount >= 0) {
        result = result.slice(0, this.limitCount)
      }
      return result
    }

    execute() {
      const rows = this.getRows()
      if (this.operation === 'insert') {
        const inserted = this.rowsToInsert.map((row, index) => ({
          ...row,
          id: row.id || `${this.table}-${rows.length + index + 1}`,
        }))
        rows.push(...inserted)
        return { data: inserted.map((row) => clone(row)), error: null }
      }

      if (this.operation === 'update') {
        const updated = []
        for (const row of rows) {
          if (!this.filters.every((fn) => fn(row))) continue
          Object.assign(row, this.patch)
          updated.push(clone(row))
        }
        return { data: updated, error: null }
      }

      return { data: this.applyFilters(rows).map((row) => clone(row)), error: null }
    }

    executeSingle() {
      const result = this.execute()
      return {
        data: Array.isArray(result.data) ? (result.data[0] || null) : result.data || null,
        error: result.error,
      }
    }
  }

  return {
    tables,
    from(table) {
      return new QueryBuilder(table)
    },
  }
}

test('pending dirty record is conservatively reset', async () => {
  const db = createFakeDb({
    documenti_import: [
      {
        id: 'imp-1',
        societa_destinazione_id: 'soc-1',
        filename: 'fattura-1.xml',
        stato: 'pending',
        processato_at: '2026-04-14T10:00:00.000Z',
        modulo_destinazione: 'contabilita',
        cliente_id: null,
        cliente_match_type: 'manuale',
        ai_raw_response: { xml_content: '<xml />' },
        created_at: '2026-04-14T09:00:00.000Z',
      },
    ],
    documenti_contabilita: [],
    prima_nota: [],
  })

  const result = await runResetImportQueue({ db, dryRun: false, societaId: 'soc-1' })

  assert.equal(result.status, 'completed')
  assert.equal(result.touchedCount, 1)
  assert.equal(result.blockedCount, 0)
  assert.equal(result.skippedCount, 0)
  assert.equal(db.tables.documenti_import[0].stato, 'pending')
  assert.equal(db.tables.documenti_import[0].processato_at, null)
  assert.equal(db.tables.documenti_import[0].modulo_destinazione, null)
  assert.equal(db.tables.documenti_import[0].cliente_match_type, null)
})

test('classified record without ai payload is normalized to pending', async () => {
  const db = createFakeDb({
    documenti_import: [
      {
        id: 'imp-2',
        societa_destinazione_id: 'soc-1',
        filename: 'fattura-2.xml',
        stato: 'classified',
        processato_at: null,
        modulo_destinazione: null,
        cliente_id: null,
        cliente_match_type: null,
        ai_raw_response: null,
        created_at: '2026-04-14T09:00:00.000Z',
      },
    ],
    documenti_contabilita: [],
    prima_nota: [],
  })

  const result = await runResetImportQueue({ db, dryRun: false, societaId: 'soc-1' })

  assert.equal(result.touchedCount, 1)
  assert.equal(result.items[0].reason, 'classified_without_ai_payload')
  assert.equal(db.tables.documenti_import[0].stato, 'pending')
})

test('linked document alone does not block automatically when not finalized', async () => {
  const db = createFakeDb({
    documenti_import: [
      {
        id: 'imp-3',
        societa_destinazione_id: 'soc-1',
        filename: 'fattura-3.xml',
        stato: 'pending',
        processato_at: '2026-04-14T10:00:00.000Z',
        modulo_destinazione: 'contabilita',
        cliente_id: null,
        cliente_match_type: 'manuale',
        ai_raw_response: { ok: true },
        created_at: '2026-04-14T09:00:00.000Z',
      },
    ],
    documenti_contabilita: [
      {
        id: 'doc-1',
        societa_id: 'soc-1',
        source_document_id: 'imp-3',
        validation_status: 'pending',
        workflow_status: 'pending',
        prima_nota_id: null,
        registered_at: null,
      },
    ],
    prima_nota: [],
  })

  const result = await runResetImportQueue({ db, dryRun: false, societaId: 'soc-1' })

  assert.equal(result.touchedCount, 1)
  assert.equal(result.blockedCount, 0)
  assert.equal(db.tables.documenti_import[0].processato_at, null)
  assert.equal(db.tables.documenti_import[0].modulo_destinazione, null)
})

test('finalized import-linked output is blocked and untouched', async () => {
  const db = createFakeDb({
    documenti_import: [
      {
        id: 'imp-3b',
        societa_destinazione_id: 'soc-1',
        filename: 'fattura-3b.xml',
        stato: 'pending',
        processato_at: '2026-04-14T10:00:00.000Z',
        modulo_destinazione: 'contabilita',
        cliente_id: null,
        cliente_match_type: 'manuale',
        ai_raw_response: { ok: true },
        created_at: '2026-04-14T09:00:00.000Z',
      },
    ],
    documenti_contabilita: [
      {
        id: 'doc-1b',
        societa_id: 'soc-1',
        source_document_id: 'imp-3b',
        validation_status: 'confirmed',
        workflow_status: 'registered',
        prima_nota_id: null,
        registered_at: null,
      },
    ],
    prima_nota: [],
  })

  const result = await runResetImportQueue({ db, dryRun: false, societaId: 'soc-1' })

  assert.equal(result.touchedCount, 0)
  assert.equal(result.blockedCount, 1)
  assert.equal(db.tables.documenti_import[0].processato_at, '2026-04-14T10:00:00.000Z')
  assert.equal(db.tables.documenti_import[0].modulo_destinazione, 'contabilita')
})

test('error state without final output is normalized to pending', async () => {
  const db = createFakeDb({
    documenti_import: [
      {
        id: 'imp-4',
        societa_destinazione_id: 'soc-1',
        filename: 'fattura-4.xml',
        stato: 'error',
        processato_at: null,
        modulo_destinazione: null,
        cliente_id: null,
        cliente_match_type: null,
        ai_raw_response: null,
        created_at: '2026-04-14T09:00:00.000Z',
      },
    ],
    documenti_contabilita: [],
    prima_nota: [],
  })

  const result = await runResetImportQueue({ db, dryRun: false, societaId: 'soc-1' })

  assert.equal(result.touchedCount, 1)
  assert.equal(result.skippedCount, 0)
  assert.equal(result.items[0].reason, 'error_without_final_output')
  assert.equal(db.tables.documenti_import[0].stato, 'pending')
})

test('classified record with minimal payload is normalized to pending', async () => {
  const db = createFakeDb({
    documenti_import: [
      {
        id: 'imp-5',
        societa_destinazione_id: 'soc-1',
        filename: 'fattura-5.xml',
        stato: 'classified',
        processato_at: null,
        modulo_destinazione: null,
        cliente_id: null,
        cliente_match_type: null,
        ai_raw_response: { foo: 'bar' },
        created_at: '2026-04-14T09:00:00.000Z',
      },
    ],
    documenti_contabilita: [],
    prima_nota: [],
  })

  const result = await runResetImportQueue({ db, dryRun: false, societaId: 'soc-1' })

  assert.equal(result.touchedCount, 1)
  assert.equal(result.items[0].reason, 'classified_without_ai_payload')
  assert.equal(db.tables.documenti_import[0].stato, 'pending')
})

test('classified record with substantial payload is skipped as coherent', async () => {
  const db = createFakeDb({
    documenti_import: [
      {
        id: 'imp-6',
        societa_destinazione_id: 'soc-1',
        filename: 'fattura-6.xml',
        stato: 'classified',
        processato_at: null,
        modulo_destinazione: null,
        cliente_id: null,
        cliente_match_type: null,
        ai_raw_response: { xml_content: '<xml />' },
        created_at: '2026-04-14T09:00:00.000Z',
      },
    ],
    documenti_contabilita: [],
    prima_nota: [],
  })

  const result = await runResetImportQueue({ db, dryRun: false, societaId: 'soc-1' })

  assert.equal(result.touchedCount, 0)
  assert.equal(result.skippedCount, 1)
  assert.equal(result.items[0].reason, 'already_coherent_queue')
  assert.equal(db.tables.documenti_import[0].stato, 'classified')
})

test('unknown status without final output is normalized to pending', async () => {
  const db = createFakeDb({
    documenti_import: [
      {
        id: 'imp-7',
        societa_destinazione_id: 'soc-1',
        filename: 'fattura-7.xml',
        stato: 'draft',
        processato_at: null,
        modulo_destinazione: null,
        cliente_id: null,
        cliente_match_type: null,
        ai_raw_response: null,
        created_at: '2026-04-14T09:00:00.000Z',
      },
    ],
    documenti_contabilita: [],
    prima_nota: [],
  })

  const result = await runResetImportQueue({ db, dryRun: false, societaId: 'soc-1' })

  assert.equal(result.touchedCount, 1)
  assert.equal(result.skippedCount, 0)
  assert.equal(result.items[0].reason, 'queue_dirty_flags')
  assert.equal(db.tables.documenti_import[0].stato, 'pending')
})

test('empty status is normalized to pending', async () => {
  const db = createFakeDb({
    documenti_import: [
      {
        id: 'imp-8',
        societa_destinazione_id: 'soc-1',
        filename: 'fattura-8.xml',
        stato: '',
        processato_at: null,
        modulo_destinazione: null,
        cliente_id: null,
        cliente_match_type: null,
        ai_raw_response: null,
        created_at: '2026-04-14T09:00:00.000Z',
      },
    ],
    documenti_contabilita: [],
    prima_nota: [],
  })

  const result = await runResetImportQueue({ db, dryRun: false, societaId: 'soc-1' })

  assert.equal(result.touchedCount, 1)
  assert.equal(result.items[0].reason, 'nonfinal_incoherent_status')
  assert.equal(db.tables.documenti_import[0].stato, 'pending')
})

test('audit record is written with import queue result counts', async () => {
  const db = createFakeDb({
    admin_reset_operations: [],
  })

  const result = {
    status: 'completed',
    touchedCount: 2,
    blockedCount: 1,
    skippedCount: 3,
    summary: 'Reset coda import eseguito.',
  }

  const auditRes = await writeAdminResetAuditSafe(db, {
    action: 'reset_import_queue',
    auth: { profile: { id: 'profile-1', ruolo: 'owner' } },
    societaId: 'soc-1',
    scopeType: 'company',
    scopeId: 'soc-1',
    dryRun: false,
    status: result.status,
    touchedCount: result.touchedCount,
    blockedCount: result.blockedCount,
    skippedCount: result.skippedCount,
    resultSummary: result.summary,
    payload: { request: { action: 'reset_import_queue' }, result },
  })

  assert.equal(auditRes.error, null)
  assert.equal(db.tables.admin_reset_operations.length, 1)
  assert.equal(db.tables.admin_reset_operations[0].action, 'reset_import_queue')
  assert.equal(db.tables.admin_reset_operations[0].touched_count, 2)
  assert.equal(db.tables.admin_reset_operations[0].blocked_count, 1)
  assert.equal(db.tables.admin_reset_operations[0].skipped_count, 3)
  assert.equal(db.tables.admin_reset_operations[0].dry_run, false)
})
