import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRegistrationNumberRequest } from '../domain/registrationNumberPolicy.js'

function buildPlan() {
  return {
    documentiContabilita: { societa_id: 'soc-1' },
    primaNota: { societa_id: 'soc-1', esercizio: 2026 },
  }
}

test('registration number request requires societaId and esercizio', () => {
  const result = buildRegistrationNumberRequest(buildPlan())
  assert.equal(result.required, true)
  assert.equal(result.scope.societaId, 'soc-1')
  assert.equal(result.scope.esercizio, 2026)
  assert.equal(result.status, 'not_executed')
  assert.deepEqual(result.blockers, [])
})

test('registration number request does not calculate next number', () => {
  const result = buildRegistrationNumberRequest(buildPlan())
  const serialized = JSON.stringify(result)
  assert.equal(result.strategy, 'server_side_sequential_allocation')
  assert.equal(serialized.includes('nextNumber'), false)
  assert.equal(serialized.includes('prossimoNumero'), false)
})

test('registration number request blocks when scope is missing', () => {
  const result = buildRegistrationNumberRequest({ primaNota: {} })
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((b) => b.code === 'P7_MISSING_SOCIETA'))
  assert.ok(result.blockers.some((b) => b.code === 'P7_MISSING_ESERCIZIO'))
})