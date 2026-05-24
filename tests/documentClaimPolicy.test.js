import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentClaimPlan } from '../domain/documentClaimPolicy.js'

test('claim plan contains registering registered confirmed contract', () => {
  const claimPlan = buildDocumentClaimPlan({})
  assert.deepEqual(claimPlan, {
    targetTable: 'documenti_contabilita',
    claimStatus: 'registering',
    successStatus: 'registered',
    failureFallbackStatus: 'confirmed',
    lockFields: ['locked_by', 'locked_at'],
    status: 'not_executed',
  })
})