import test from 'node:test'
import assert from 'node:assert/strict'
import {
  L6_CORE_PACK_ID,
  L6_CORE_STEPS,
  buildL6LabRegressionSuite,
  parseL6StepResult,
  assertL6LabRegressionSuite,
  buildL6SuiteFingerprint,
} from '../src/modules/contabilita/application/l6/buildL6LabRegressionSuite.js'

test('core pack has unique ids and result keys', () => {
  const suite = buildL6LabRegressionSuite()
  assert.equal(suite.kind, 'l6_lab_regressione')
  assert.equal(suite.packId, L6_CORE_PACK_ID)
  assert.ok(suite.steps.length >= 5)
  assert.equal(suite.requiredCount, suite.steps.length)
  const ids = suite.steps.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  const keys = suite.steps.map((s) => s.resultKey)
  assert.equal(new Set(keys).size, keys.length)
  for (const s of suite.steps) {
    assert.ok(s.script.startsWith('scripts/security_p0/'))
    assert.ok(s.resultKey.endsWith('_RESULT'))
    assert.ok(s.maxMs >= 30_000)
  }
  assert.deepEqual(suite.stepIds, L6_CORE_STEPS.map((s) => s.id))
})

test('parseL6StepResult finds last PASS/FAIL line', () => {
  const out = [
    'noise',
    'P4_01_RESULT=FAIL boom',
    'P4_01_RESULT=PASS',
    'EVIDENCE=/tmp/x.txt',
  ].join('\n')
  assert.deepEqual(parseL6StepResult(out, 'P4_01_RESULT'), {
    status: 'PASS',
    detail: 'P4_01_RESULT=PASS',
  })
  assert.equal(parseL6StepResult('P0_00_RESULT=FAIL nope', 'P0_00_RESULT').status, 'FAIL')
  assert.equal(parseL6StepResult('hello', 'P0_00_RESULT').status, 'MISSING')
})

test('assertL6LabRegressionSuite PASS when all required PASS', () => {
  const suite = buildL6LabRegressionSuite()
  const stepResults = suite.steps.map((s) => ({
    id: s.id,
    status: 'PASS',
    exitCode: 0,
    detail: `${s.resultKey}=PASS`,
    ms: 10,
  }))
  const res = assertL6LabRegressionSuite({ suite, stepResults })
  assert.equal(res.ok, true)
  assert.equal(res.failed.length, 0)
  assert.equal(res.missing.length, 0)
  assert.match(res.fingerprint, /^L6CORE4\|/)
  assert.ok(res.fingerprint.includes('P0_00:PASS'))
  assert.ok(res.fingerprint.includes('P4_03:PASS'))
  assert.ok(res.fingerprint.includes('P1_01:PASS'))
  assert.ok(res.fingerprint.includes('P1_05:PASS'))
  assert.ok(res.fingerprint.includes('P1_06:PASS'))
  assert.ok(res.fingerprint.includes('P3_02:PASS'))
  assert.ok(res.fingerprint.includes('P3_04:PASS'))
  assert.ok(res.fingerprint.includes('P4_01:PASS'))
  assert.ok(res.fingerprint.includes('P2_07:PASS'))
  assert.equal(res.fingerprint, buildL6SuiteFingerprint(res.rows))
  assert.deepEqual(suite.stepIds[0], 'P0_00')
  assert.deepEqual(suite.stepIds[1], 'P4_03')
  assert.ok(suite.stepIds.includes('P1_01'))
  assert.ok(suite.stepIds.includes('P1_06'))
  assert.ok(suite.stepIds.includes('P3_04'))
  assert.deepEqual(suite.stepIds.at(-1), 'P4_01')
})

test('assertL6LabRegressionSuite FAIL on missing or failed step', () => {
  const suite = buildL6LabRegressionSuite()
  const stepResults = suite.steps.slice(1).map((s) => ({
    id: s.id,
    status: 'PASS',
    exitCode: 0,
  }))
  const miss = assertL6LabRegressionSuite({ suite, stepResults })
  assert.equal(miss.ok, false)
  assert.deepEqual(miss.missing, ['P0_00'])

  const withFail = suite.steps.map((s) => ({
    id: s.id,
    status: s.id === 'P3_01' ? 'FAIL' : 'PASS',
    exitCode: s.id === 'P3_01' ? 1 : 0,
  }))
  const fail = assertL6LabRegressionSuite({ suite, stepResults: withFail })
  assert.equal(fail.ok, false)
  assert.deepEqual(fail.failed, ['P3_01'])
})
