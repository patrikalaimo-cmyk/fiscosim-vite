import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAccountingRollbackPlan } from '../domain/accountingRollbackPolicy.js'

test('rollback plan contains compensation order', () => {
  const rollbackPlan = buildAccountingRollbackPlan({})
  assert.deepEqual(rollbackPlan, [
    'delete_prima_nota_righe',
    'delete_prima_nota',
    'release_documenti_contabilita_claim',
    'delete_documenti_contabilita_if_created_by_this_commit',
  ])
})

test('policy files do not contain DB write APIs', () => {
  const files = [
    'domain/registrationNumberPolicy.js',
    'domain/documentDedupePolicy.js',
    'domain/documentClaimPolicy.js',
    'domain/accountingRollbackPolicy.js',
  ]
  const forbidden = ['supabase', 'db.from', '.insert(', '.update(', '.delete(']

  for (const file of files) {
    const content = readFileSync(file, 'utf8').toLowerCase()
    for (const token of forbidden) {
      assert.equal(content.includes(token), false, `${file} contains forbidden token: ${token}`)
    }
  }
})