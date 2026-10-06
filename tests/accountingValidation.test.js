import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCommitInput } from '../domain/accountingValidation.js'

function buildValidPayload() {
  return {
    validation: { status: 'warning' },
    company: { societaId: 'soc-1' },
    document: {
      id: 'doc-1',
      type: 'fattura_passiva',
      registrationDate: '2026-04-30',
      documentDate: '2026-04-29',
      number: 'F-100',
      counterparty: { accountId: 'acc-1', accountCode: '2 03 08 0639', name: 'Fornitore Spa' },
      totals: { taxable: 100, vat: 22, total: 122 },
    },
    accounting: {
      causaleContabile: { id: 'caus-1', code: 'FF' },
      isBalanced: true,
      rows: [
        { lineNumber: 1, accountId: 'costo-1', debit: 122, credit: 0 },
        { lineNumber: 2, accountId: 'forn-1', debit: 0, credit: 122 },
      ],
    },
    vat: {
      rows: [{ index: 0, taxable: 100, vat: 22, causaleIvaId: 'iva-1' }],
    },
    withholding: { enabled: false },
  }
}

test('validation blocks payload status blocked', () => {
  const payload = buildValidPayload()
  payload.validation.status = 'blocked'
  const result = validateCommitInput(payload)
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((b) => b.code === 'P7_PAYLOAD_BLOCKED'))
})

test('validation blocks documenti_import legacy reference', () => {
  const payload = buildValidPayload()
  payload.note = 'legacy documenti_import reference'
  const result = validateCommitInput(payload)
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((b) => b.code === 'P7_FORBIDDEN_LEGACY_REFERENCE'))
})

test('validation blocks accounting_entries legacy reference', () => {
  const payload = buildValidPayload()
  payload.meta = { source: 'accounting_entries' }
  const result = validateCommitInput(payload)
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((b) => b.code === 'P7_FORBIDDEN_LEGACY_REFERENCE'))
})

test('validation blocks partitari legacy reference', () => {
  const payload = buildValidPayload()
  payload.tags = ['partitari']
  const result = validateCommitInput(payload)
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((b) => b.code === 'P7_FORBIDDEN_LEGACY_REFERENCE'))
})

test('validation blocks withholding and reverse and missing VAT causale', () => {
  const payload = buildValidPayload()
  payload.withholding.enabled = true
  payload.reverse = true
  payload.vat.rows = [{ taxable: 10, vat: 2.2 }]
  const result = validateCommitInput(payload)
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((b) => b.code === 'P7_WITHHOLDING_NOT_SUPPORTED'))
  assert.ok(result.blockers.some((b) => b.code === 'P7_REVERSE_NOT_SUPPORTED'))
  assert.ok(result.blockers.some((b) => b.code === 'P7_MISSING_VAT_CAUSALE'))
})
