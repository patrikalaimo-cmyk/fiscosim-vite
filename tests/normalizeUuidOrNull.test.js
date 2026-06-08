import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeUuidOrNull } from '../src/modules/contabilita/data/contabilitaRepo.js'

test('normalizeUuidOrNull converte placeholder vuoti in null e lascia invariati gli UUID', () => {
  assert.equal(normalizeUuidOrNull(''), null)
  assert.equal(normalizeUuidOrNull(undefined), null)
  assert.equal(normalizeUuidOrNull(null), null)
  assert.equal(normalizeUuidOrNull('null'), null)
  assert.equal(normalizeUuidOrNull('__none__'), null)
  assert.equal(normalizeUuidOrNull('undefined'), null)
  assert.equal(normalizeUuidOrNull('  '), null)
  assert.equal(normalizeUuidOrNull('b90e51d6-afd3-40de-8c2b-300464a7a41e'), 'b90e51d6-afd3-40de-8c2b-300464a7a41e')
})
