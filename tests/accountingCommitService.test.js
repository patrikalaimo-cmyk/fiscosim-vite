import test from 'node:test'
import assert from 'node:assert/strict'
import { planSingleInvoiceCommitFromImport } from '../services/accountingCommitService.js'

function buildPayload(status = 'warning') {
  return {
    validation: { status },
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

test('service returns ready with complete plan for warning payload', async () => {
  const result = await planSingleInvoiceCommitFromImport(buildPayload('warning'), { operatorId: 'op-1', now: '2026-04-30' })
  assert.equal(result.status, 'ready')
  assert.ok(result.plan)
  assert.ok(result.plan.documentiContabilita)
  assert.ok(result.plan.primaNota)
  assert.ok(Array.isArray(result.plan.primaNotaRighe))
  assert.ok(Array.isArray(result.plan.registriIva))
  assert.ok(result.plan.partitario)
  assert.ok(result.plan.finalization)
  assert.equal(result.plan.finalization.targetTable, 'documenti_contabilita')
  assert.equal(result.plan.finalization.targetStatus, 'registered')
  assert.equal(result.plan.finalization.workflowStatus, 'registered')
  assert.equal(result.plan.finalization.validationStatus, 'validated')
  assert.equal(result.plan.finalization.primaNotaIdField, 'prima_nota_id')
  assert.equal(result.plan.finalization.primaNotaIdPlaceholder, '__PRIMA_NOTA_ID__')
  assert.equal(result.plan.finalization.registeredBy, 'op-1')
  assert.equal(result.plan.finalization.registeredAt, '2026-04-30')
  assert.equal(result.plan.finalization.sourceModule, 'import_contabilita')
  assert.equal(result.plan.finalization.executable, true)
  assert.deepEqual(result.plan.finalization.stateTransition, {
    from: ['draft', 'validated'],
    inFlight: 'registering',
    success: 'registered',
    failure: 'failed',
    compensationFallback: 'validated',
  })
  assert.ok(Array.isArray(result.plannedCalls))
  assert.ok(Array.isArray(result.rollbackOrder))
})

test('service returns blocked when payload is blocked', async () => {
  const result = await planSingleInvoiceCommitFromImport(buildPayload('blocked'))
  assert.equal(result.status, 'blocked')
  assert.equal(result.plan, null)
  assert.deepEqual(result.plannedCalls, [])
  assert.deepEqual(result.rollbackOrder, [])
})

test('service includes required plannedCalls and rollbackOrder', async () => {
  const result = await planSingleInvoiceCommitFromImport(buildPayload('warning'))
  assert.deepEqual(result.plannedCalls, [
    'create documenti_contabilita',
    'createPrimaNotaCompleta',
    'insert registri_iva direct',
    'insert partitario direct',
    'finalize documenti_contabilita',
  ])
  assert.deepEqual(result.rollbackOrder, [
    'partitario',
    'registri_iva',
    'prima_nota_righe',
    'prima_nota',
    'documenti_contabilita',
  ])
})

test('service result JSON does not expose legacy fields', async () => {
  const result = await planSingleInvoiceCommitFromImport(buildPayload('warning'))
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes('"documenti_import"'))
  assert.ok(!serialized.includes('"accounting_entries"'))
  assert.ok(!serialized.includes('"partitari"'))
  assert.ok(!serialized.includes('"sourceTable"'))
  assert.ok(!serialized.includes('"updateDocumentiImport"'))
})

test('service does not expose executable finalization for blocked payload', async () => {
  const result = await planSingleInvoiceCommitFromImport(buildPayload('blocked'))
  assert.equal(result.plan, null)
})
