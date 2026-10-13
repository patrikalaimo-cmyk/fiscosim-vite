import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { matchesStudioRoute } from '../lib/devStudioHttp.js'
import { parseDecisionFeedbackListQuery } from '../api/studio/decision-feedback.js'
import { isDecisionFeedbackDbLabEnabled } from '../src/modules/contabilita/application/learning/isDecisionFeedbackDbLabEnabled.js'
import { mergeDecisionFeedbackEventLists } from '../src/modules/contabilita/application/learning/decisionFeedbackDbClient.js'

const root = process.cwd()

test('decision-feedback route is registered', () => {
  assert.equal(matchesStudioRoute('/api/studio/decision-feedback'), true)
})

test('decision-feedback handler is LAB-gated', () => {
  const src = readFileSync(join(root, 'api/studio/decision-feedback.js'), 'utf8')
  assert.match(src, /FISCOSIM_DECISION_FEEDBACK_DB_LAB_ENABLED/)
  assert.match(src, /SOCIETA_NON_AUTORIZZATA/)
  assert.match(src, /contabile_decision_feedback/)
})

test('parseDecisionFeedbackListQuery validates societa UUID', () => {
  assert.equal(parseDecisionFeedbackListQuery({ societa_id: 'nope' }), null)
  const ok = parseDecisionFeedbackListQuery({
    societa_id: '72000000-0000-4000-8000-000000000001',
    source_module: 'import_contabilita',
    limit: 10,
  })
  assert.equal(ok.societa_id, '72000000-0000-4000-8000-000000000001')
  assert.equal(ok.source_module, 'import_contabilita')
  assert.equal(ok.limit, 10)
})

test('isDecisionFeedbackDbLabEnabled respects override', () => {
  assert.equal(isDecisionFeedbackDbLabEnabled(true), true)
  assert.equal(isDecisionFeedbackDbLabEnabled(false), false)
})

test('mergeDecisionFeedbackEventLists dedups by societa+anchor+field', () => {
  const merged = mergeDecisionFeedbackEventLists(
    [{
      societaId: 'soc-1',
      sourceModule: 'import_contabilita',
      field: 'account',
      finalValue: 'local',
      requestId: 'req-1',
      committed: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    [{
      societaId: 'soc-1',
      sourceModule: 'import_contabilita',
      field: 'account',
      finalValue: 'remote',
      requestId: 'req-1',
      committed: true,
      createdAt: '2026-01-02T00:00:00.000Z',
      storageKind: 'lab_db',
    }],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].finalValue, 'remote')
  assert.equal(merged[0].storageKind, 'lab_db')
})
