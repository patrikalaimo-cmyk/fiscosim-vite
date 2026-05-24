import test from 'node:test'
import assert from 'node:assert/strict'
import { planSingleInvoiceCommitFromImport } from '../services/accountingCommitService.js'
import { persistAccountingPlan } from '../services/accountingPersistenceAdapter.js'

class FakeQuery {
  constructor(tableName, rows, tracker) {
    this.tableName = tableName
    this.rows = Array.isArray(rows) ? rows : []
    this.tracker = tracker
    this.filters = []
    this.sort = null
    this.limitValue = null
    this.pendingInsert = null
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
    const payload = arguments[0]
    this.tracker.insert += 1
    this.tracker.insertTables.push(this.tableName)
    this.tracker.insertPayloads.push({ table: this.tableName, payload })
    this.pendingInsert = payload
    return this
  }

  update() {
    this.tracker.update += 1
    throw new Error('update not allowed')
  }

  delete() {
    this.tracker.delete += 1
    throw new Error('delete not allowed')
  }

  single() {
    return Promise.resolve(this.executeSingle())
  }

  executeSingle() {
    const result = this.execute()
    if (this.pendingInsert) {
      const behavior = this.tracker.insertBehaviors[this.tableName] || { data: { id: `${this.tableName}-new-id` }, error: null }
      return behavior
    }
    return { data: result.data[0] || null, error: null }
  }

  execute() {
    if (this.pendingInsert) {
      const behavior = this.tracker.insertBehaviors[this.tableName] || { data: { id: `${this.tableName}-new-id` }, error: null }
      return behavior
    }
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
  constructor(tables = {}, insertBehaviors = {}) {
    this.tables = tables
    this.tracker = {
      select: 0,
      insert: 0,
      update: 0,
      delete: 0,
      insertTables: [],
      insertPayloads: [],
      insertBehaviors,
    }
  }

  from(tableName) {
    return new FakeQuery(tableName, this.tables[tableName] || [], this.tracker)
  }
}

function buildPayload() {
  return {
    validation: { status: 'warning' },
    handoff: { sourceFileName: 'fattura-passiva-001.xml' },
    company: { societaId: 'soc-1' },
    document: {
      id: 'doc-1',
      type: 'fattura_passiva',
      registrationDate: '2026-04-30',
      documentDate: '2026-04-29',
      number: 'F-100',
      counterparty: { accountId: 'acc-1', accountCode: '2.01', name: 'Fornitore' },
      totals: { taxable: 100, vat: 22, total: 122 },
      description: 'Acquisto merci',
    },
    accounting: {
      causaleContabile: { id: 'caus-1', code: 'FF' },
      isBalanced: true,
      rows: [
        { lineNumber: 1, accountId: 'costo-1', accountCode: '4.01', description: 'Costo', debit: 122, credit: 0 },
        { lineNumber: 2, accountId: 'forn-1', accountCode: '2.01', description: 'Fornitore', debit: 0, credit: 122 },
      ],
    },
    vat: {
      rows: [{ index: 0, taxable: 100, vat: 22, causaleIvaId: 'iva-22' }],
    },
    withholding: { enabled: false },
  }
}

async function buildReadyPlan() {
  const result = await planSingleInvoiceCommitFromImport(buildPayload(), { operatorId: 'op-1', now: '2026-04-30', registrationNumber: 42 })
  assert.equal(result.status, 'ready')
  return result.plan
}

test('dry-run returns 3 ordered operations', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan)
  assert.equal(result.status, 'dry_run')
  assert.equal(result.executed, false)
  assert.deepEqual(result.operations.map((operation) => operation.step), [
    'create_documenti_contabilita',
    'create_prima_nota',
    'create_prima_nota_righe',
  ])
  assert.equal(result.operations[0].table, 'documenti_contabilita')
  assert.equal(result.operations[1].table, 'prima_nota')
  assert.equal(result.operations[2].table, 'prima_nota_righe')
  assert.equal(result.simulatedResult.documentiContabilitaId, '__DOCUMENTI_CONTABILITA_ID__')
  assert.equal(result.simulatedResult.primaNotaId, '__PRIMA_NOTA_ID__')
  assert.equal(result.readyForWrite, true)
  assert.deepEqual(result.blockers, [])
})

test('dry-run simulates one id per prima_nota_riga', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan)
  assert.equal(result.simulatedResult.primaNotaRigheIds.length, plan.primaNotaRighe.length)
  assert.deepEqual(result.simulatedResult.primaNotaRigheIds, [
    '__PRIMA_NOTA_RIGA_1_ID__',
    '__PRIMA_NOTA_RIGA_2_ID__',
  ])
})

test('dry-run finalization propagates target and prima nota placeholders', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan)
  assert.deepEqual(result.simulatedResult.finalization, {
    targetTable: 'documenti_contabilita',
    targetId: '__DOCUMENTI_CONTABILITA_ID__',
    primaNotaId: '__PRIMA_NOTA_ID__',
    targetStatus: 'registered',
  })
})

test('dry-run rollback refs contain all placeholder ids', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan)
  assert.deepEqual(result.rollbackRefs, {
    documentiContabilitaId: '__DOCUMENTI_CONTABILITA_ID__',
    primaNotaId: '__PRIMA_NOTA_ID__',
    primaNotaRigheIds: [
      '__PRIMA_NOTA_RIGA_1_ID__',
      '__PRIMA_NOTA_RIGA_2_ID__',
    ],
  })
})

test('execute true blocks when db client is missing', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan, { execute: true })
  assert.equal(result.status, 'blocked')
  assert.equal(result.executed, false)
  assert.equal(result.blockers[0].code, 'P7_DB_CLIENT_REQUIRED')
})

test('execute true blocks when preflight finds registered duplicate', async () => {
  const plan = await buildReadyPlan()
  const db = new FakeDb({
    documenti_contabilita: [{
      societa_id: 'soc-1',
      numero_documento: 'F-100',
      data_documento: '2026-04-29',
      totale: 122,
      soggetto_piva: null,
      soggetto_cf: null,
      soggetto_denominazione: 'Fornitore',
      workflow_status: 'registered',
      prima_nota_id: null,
      registered_at: null,
    }],
    prima_nota: [{ societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 12 }],
  })
  const result = await persistAccountingPlan(plan, { execute: true, db })
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((b) => b.code === 'P7_DOCUMENT_REGISTERED'))
})

test('execute true with clear preflight returns not implemented after preflight', async () => {
  const plan = await buildReadyPlan()
  const db = new FakeDb({
    documenti_contabilita: [],
    prima_nota: [{ societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 12 }],
  })
  const result = await persistAccountingPlan(plan, { execute: true, db })
  assert.equal(result.status, 'blocked')
  assert.equal(result.executed, false)
  assert.equal(result.blockers[0].code, 'P7_WRITE_NOT_IMPLEMENTED_AFTER_PREFLIGHT')
  assert.equal(result.executionContext.registrationNumber, 13)
  assert.equal(result.preflight.status, 'ready')
  assert.equal(result.preflight.dedupe.status, 'clear')
})

test('execute true with writeScope document_only inserts only documenti_contabilita', async () => {
  const plan = await buildReadyPlan()
  const db = new FakeDb({
    documenti_contabilita: [],
    prima_nota: [{ societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 12 }],
  })
  const result = await persistAccountingPlan(plan, {
    execute: true,
    writeScope: 'document_only',
    db,
    operatorId: 'op-1',
    now: '2026-04-30T10:00:00.000Z',
  })
  assert.equal(result.status, 'partial_written')
  assert.equal(result.executed, true)
  assert.equal(result.writeScope, 'document_only')
  assert.equal(result.documentiContabilitaId, 'documenti_contabilita-new-id')
  assert.equal(result.nextAction, 'create_prima_nota')
  assert.deepEqual(db.tracker.insertTables, ['documenti_contabilita'])
  const insertPayload = db.tracker.insertPayloads[0].payload[0]
  assert.equal(insertPayload.workflow_status, 'registering')
  assert.equal(insertPayload.validation_status, 'validated')
  assert.equal(insertPayload.locked_by, 'op-1')
  assert.equal(insertPayload.locked_at, '2026-04-30T10:00:00.000Z')
})

test('execute true document_only does not insert prima_nota or prima_nota_righe', async () => {
  const plan = await buildReadyPlan()
  const db = new FakeDb({
    documenti_contabilita: [],
    prima_nota: [{ societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 12 }],
  })
  await persistAccountingPlan(plan, {
    execute: true,
    writeScope: 'document_only',
    db,
    now: '2026-04-30T10:00:00.000Z',
  })
  assert.equal(db.tracker.insertTables.includes('prima_nota'), false)
  assert.equal(db.tracker.insertTables.includes('prima_nota_righe'), false)
})

test('execute true document_only returns blocked if document insert fails', async () => {
  const plan = await buildReadyPlan()
  const db = new FakeDb(
    {
      documenti_contabilita: [],
      prima_nota: [{ societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 12 }],
    },
    {
      documenti_contabilita: { data: null, error: { message: 'insert failed' } },
    }
  )
  const result = await persistAccountingPlan(plan, {
    execute: true,
    writeScope: 'document_only',
    db,
    now: '2026-04-30T10:00:00.000Z',
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers[0].code, 'P7_DOCUMENTI_CONTABILITA_INSERT_FAILED')
})

test('execute true uses only read operations on fake db', async () => {
  const plan = await buildReadyPlan()
  const db = new FakeDb({
    documenti_contabilita: [],
    prima_nota: [{ societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 7 }],
  })
  await persistAccountingPlan(plan, { execute: true, db })
  assert.ok(db.tracker.select > 0)
  assert.equal(db.tracker.insert, 0)
  assert.equal(db.tracker.update, 0)
  assert.equal(db.tracker.delete, 0)
})

test('execute true document_only never uses update or delete or extra writes', async () => {
  const plan = await buildReadyPlan()
  const db = new FakeDb({
    documenti_contabilita: [],
    prima_nota: [{ societa_id: 'soc-1', esercizio: 2026, numero_registrazione: 8 }],
  })
  await persistAccountingPlan(plan, {
    execute: true,
    writeScope: 'document_only',
    db,
    now: '2026-04-30T10:00:00.000Z',
  })
  assert.equal(db.tracker.update, 0)
  assert.equal(db.tracker.delete, 0)
  assert.deepEqual(db.tracker.insertTables, ['documenti_contabilita'])
})

test('adapter reports missing registration number as readiness blocker', async () => {
  const plan = await buildReadyPlan()
  plan.primaNota.numero_registrazione = null
  const result = await persistAccountingPlan(plan)
  assert.equal(result.status, 'dry_run')
  assert.equal(result.readyForWrite, false)
  assert.ok(result.blockers.some((blocker) => blocker.code === 'P7_MISSING_REGISTRATION_NUMBER'))
})

test('missing plan is blocked', async () => {
  const result = await persistAccountingPlan(null)
  assert.equal(result.status, 'blocked')
  assert.equal(result.executed, false)
  assert.equal(result.blockers[0].code, 'P7_PLAN_MISSING')
})

test('legacy fields in plan are blocked', async () => {
  const plan = await buildReadyPlan()
  plan.documenti_import = { id: 'legacy-1' }
  const result = await persistAccountingPlan(plan)
  assert.equal(result.status, 'blocked')
  assert.equal(result.executed, false)
  assert.equal(result.blockers[0].code, 'P7_FORBIDDEN_LEGACY_REFERENCE')
})

test('write1 adapter excludes registri iva and partitario operations', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan)
  const serialized = JSON.stringify(result.operations)
  assert.ok(!serialized.includes('registri_iva'))
  assert.ok(!serialized.includes('partitario'))
})

test('dry-run includes dedupe check contract', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan)
  assert.equal(result.dedupeCheck.required, true)
  assert.equal(result.dedupeCheck.strategy, 'documenti_contabilita_functional_key')
  assert.equal(result.dedupeCheck.status, 'not_executed')
  assert.deepEqual(result.dedupeCheck.blockIf, [
    'workflow_status=registered',
    'prima_nota_id not null',
    'registered_at not null',
    'workflow_status=registering',
  ])
})

test('dry-run includes claim contract', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan)
  assert.deepEqual(result.claimContract, {
    targetTable: 'documenti_contabilita',
    claimStatus: 'registering',
    successStatus: 'registered',
    failureFallbackStatus: 'confirmed',
    lockFields: ['locked_by', 'locked_at'],
    status: 'not_executed',
  })
})

test('dry-run includes registration number request and rollback plan contracts', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan)
  assert.equal(result.registrationNumberRequest.required, true)
  assert.equal(result.registrationNumberRequest.strategy, 'server_side_sequential_allocation')
  assert.equal(result.registrationNumberRequest.status, 'not_executed')
  assert.deepEqual(result.registrationNumberRequest.uniqueConstraint, [
    'societa_id',
    'esercizio',
    'numero_registrazione',
  ])
  assert.deepEqual(result.rollbackPlan, [
    'delete_prima_nota_righe',
    'delete_prima_nota',
    'release_documenti_contabilita_claim',
    'delete_documenti_contabilita_if_created_by_this_commit',
  ])
})

test('dry-run result JSON excludes legacy references', async () => {
  const plan = await buildReadyPlan()
  const result = await persistAccountingPlan(plan)
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes('"documenti_import"'))
  assert.ok(!serialized.includes('"accounting_entries"'))
  assert.ok(!serialized.includes('"partitari"'))
})