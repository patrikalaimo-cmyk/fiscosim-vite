import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateMassConfirmEligibility,
  normalizeMatchConfidence,
  partitionMassConfirmCandidates,
  MASS_CONFIRM_MIN_CONFIDENCE,
} from './massConfirmEligibility.js'

test('mass confirm — normalizza confidence percent e ratio', () => {
  assert.equal(normalizeMatchConfidence(98), 0.98)
  assert.equal(normalizeMatchConfidence(0.91), 0.91)
  assert.equal(normalizeMatchConfidence(-1), 0)
})

test('mass confirm — blocca ambiguous / low confidence / non ready', () => {
  assert.equal(evaluateMassConfirmEligibility({ ready: true, status: 'Pronta', confidence: 98 }).eligible, true)
  assert.equal(evaluateMassConfirmEligibility({ ready: true, status: 'Pronta', confidence: 70 }).eligible, false)
  assert.equal(evaluateMassConfirmEligibility({
    ready: true,
    status: 'Pronta',
    confidence: 99,
    matchType: 'ambiguous',
  }).eligible, false)
  assert.equal(evaluateMassConfirmEligibility({ ready: false, status: 'Pronta', confidence: 99 }).eligible, false)
  assert.equal(evaluateMassConfirmEligibility({
    ready: true,
    status: 'Bloccata',
    confidence: 99,
  }).eligible, false)
})

test('mass confirm — partition tiene solo high-confidence', () => {
  const { eligible, skipped } = partitionMassConfirmCandidates([
    { id: 'a', ready: true, status: 'Pronta', confidence: 96, matchType: 'exact_amount' },
    { id: 'b', ready: true, status: 'Pronta', confidence: 60, matchType: 'exact_amount' },
    { id: 'c', ready: true, status: 'Pronta', confidence: 99, matchType: 'ambiguous' },
  ], { minConfidence: MASS_CONFIRM_MIN_CONFIDENCE })
  assert.equal(eligible.length, 1)
  assert.equal(eligible[0].movement.id, 'a')
  assert.equal(skipped.length, 2)
})
