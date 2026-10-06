import test from 'node:test'
import assert from 'node:assert/strict'

import { createEmptyReport } from '../domain/reportContract.js'

test('report contract espone nota audit e liste dedup', () => {
  const report = createEmptyReport()

  assert.equal(typeof report.deletedDetectionNote, 'string')
  assert.ok(report.deletedDetectionNote.length > 0)
  assert.deepEqual(report.duplicateInStagingRows, [])
  assert.deepEqual(report.duplicateInAccountingRows, [])
  assert.deepEqual(report.deletedInStagingRows, [])
  assert.deepEqual(report.deletedInAccountingRows, [])
})
