import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkDocumentDedupe,
  previewNextRegistrationNumber,
  runAccountingWritePreflight,
} from '../services/accountingPreflightService.js'

class FakeQuery {
  constructor(tableName, rows, tracker) {
    this.tableName = tableName
    this.rows = Array.isArray(rows) ? rows : []
    this.tracker = tracker
    this.filters = []
    this.sort = null
    this.limitValue = null
  }

  select() {
    this.tracker.select += 1
    return this
  }

  eq(field, value) {
    this.filters.push({ field, value })
    return this
  }

  order(field, options = {}) {
    this.sort = { field, ascending: options.ascending !== false }
    return this
  }

  limit(value) {
    this.limitValue = value
    return this
  }

  insert() {
    this.tracker.insert += 1
    throw new Error('insert not allowed in read-only preflight')
  }

  update() {
    this.tracker.update += 1
    throw new Error('update not allowed in read-only preflight')
  }

  delete() {
    this.tracker.delete += 1
    throw new Error('delete not allowed in read-only preflight')
  }

  execute() {
    let out = [...this.rows]
    for (const filter of this.filters) {
      out = out.filter((row) => String(row?.[filter.field] ?? '') === String(filter.value ?? ''))
    }
    if (this.sort) {
      const { field, ascending } = this.sort
      out.sort((a, b) => {
        const av = Number(a?.[field] ?? 0)
        const bv = Number(b?.[field] ?? 0)
        return ascending ? av - bv : bv - av
      })
    }
    if (Number.isInteger(this.limitValue) && this.limitValue >= 0) {
      out = out.slice(0, this.limitValue)
    }
    return { data: out, error: null }
  }

  then(resolve, reject) {
    try {
      resolve(this.execute())
    } catch (error) {
      if (reject) reject(error)
    }
  }
}

class FakeDb {
  constructor(tables = {}) {
    this.tables = tables
    this.tracker = { select: 0, insert: 0, update: 0, delete: 0 }
  }

  from(tableName) {
    return new FakeQuery(tableName, this.tables[tableName] || [], this.tracker)
  }
}

function buildDedupeRequest(overrides = {}) {
  return {
    required: true,
    strategy: 'documenti_contabilita_functional_key',
    key: {
      societaId: 'soc-1',
      numeroDocumento: 'F-100',
      dataDocumento: '2026-04-29',
      soggettoPiva: 'IT12345678901',
      soggettoCf: null,
      soggettoDenominazione: 'Fornitore Spa',
      totale: 122,
    },
    blockIf: [
      'workflow_status=registered',
      'prima_nota_id not null',
      'registered_at not null',
      'workflow_status=registering',
    ],
    status: 'not_executed',
    blockers: [],
    ...overrides,
  }
}

function buildRegistrationRequest(overrides = {}) {
  return {
    required: true,
    scope: {
      societaId: 'soc-1',
      esercizio: 2026,
    },
    strategy: 'server_side_sequential_allocation',
    uniqueConstraint: ['societa_id', 'esercizio', 'numero_registrazione'],
    status: 'not_executed',
    blockers: [],
    ...overrides,
  }
}

function buildPlan() {
  return {
    documentiContabilita: {
      societa_id: 'soc-1',
      numero_documento: 'F-100',
      data_documento: '2026-04-29',
      soggetto_piva: 'IT12345678901',
      soggetto_cf: null,
      soggetto_denominazione: 'Fornitore Spa',
      totale: 122,
    },
    primaNota: {
      societa_id: 'soc-1',
      esercizio: 2026,
    },
  }
}

test('dedupe clear when no matches are found', async () => {
  const db = new FakeDb({ documenti_contabilita: [] })
  const result = await checkDocumentDedupe(db, buildDedupeRequest())
  assert.equal(result.status, 'clear')
  assert.deepEqual(result.matches, [])
  assert.deepEqual(result.blockers, [])
})

test('dedupe duplicate when match is registered', async () => {
  const db = new FakeDb({
    documenti_contabilita: [{
      id: 'd1',
      societa_id: 'soc-1',
      numero_documento: 'F-100',
      data_documento: '2026-04-29',
      totale: 122,
      soggetto_piva: 'IT12345678901',
      workflow_status: 'registered',
      prima_nota_id: null,
      registered_at: null,
    }],
  })
  const result = await checkDocumentDedupe(db, buildDedupeRequest())
  assert.equal(result.status, 'duplicate')
  assert.ok(result.blockers.some((b) => b.code === 'P7_DOCUMENT_REGISTERED'))
})

test('dedupe blocked when match is registering', async () => {
  const db = new FakeDb({
    documenti_contabilita: [{
      id: 'd2',
      societa_id: 'soc-1',
      numero_documento: 'F-100',
      data_documento: '2026-04-29',
      totale: 122,
      soggetto_piva: 'IT12345678901',
      workflow_status: 'registering',
      prima_nota_id: null,
      registered_at: null,
    }],
  })
  const result = await checkDocumentDedupe(db, buildDedupeRequest())
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((b) => b.code === 'P7_DOCUMENT_REGISTERING'))
})

test('preview next registration number from max 12 returns 13', async () => {
  const db = new FakeDb({
    prima_nota: [
      { societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 12 },
      { societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 9 },
    ],
  })
  const result = await previewNextRegistrationNumber(db, buildRegistrationRequest())
  assert.equal(result.status, 'ready')
  assert.equal(result.currentMax, 12)
  assert.equal(result.nextNumber, 13)
})

test('preview warns that number is not reserved', async () => {
  const db = new FakeDb({ prima_nota: [] })
  const result = await previewNextRegistrationNumber(db, buildRegistrationRequest())
  assert.ok(result.warnings.some((w) => w.code === 'number_not_reserved'))
})

test('run preflight combines dedupe and registration number preview', async () => {
  const db = new FakeDb({
    documenti_contabilita: [],
    prima_nota: [{ societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 4 }],
  })
  const result = await runAccountingWritePreflight(db, buildPlan())
  assert.equal(result.status, 'ready')
  assert.equal(result.dedupe.status, 'clear')
  assert.equal(result.registrationNumber.nextNumber, 5)
})

test('fake db confirms no insert update delete are called', async () => {
  const db = new FakeDb({ documenti_contabilita: [], prima_nota: [] })
  await checkDocumentDedupe(db, buildDedupeRequest())
  await previewNextRegistrationNumber(db, buildRegistrationRequest())
  await runAccountingWritePreflight(db, buildPlan())
  assert.equal(db.tracker.insert, 0)
  assert.equal(db.tracker.update, 0)
  assert.equal(db.tracker.delete, 0)
  assert.ok(db.tracker.select > 0)
})