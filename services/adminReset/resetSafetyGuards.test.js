import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getZombieLockAnalysis,
  hasValidImportGeneratedOutput,
  hasBlockingRegisteredState,
  hasValidPrimaNota,
  isDocumentAccountingFinalized,
  isImportQueueResettable,
  isWorkflowResettable,
  isZombieLock,
} from './resetSafetyGuards.js'
import { getAdminResetLockThresholds, pickDocumentResetBaseWorkflow } from './resetUtils.js'

test('hasValidPrimaNota and accounting finalized detect linked accounting', () => {
  const row = { prima_nota_id: 'pn-1', registered_at: '2026-04-14T10:00:00.000Z' }
  assert.equal(hasValidPrimaNota(row), true)
  assert.equal(isDocumentAccountingFinalized(row), true)
  assert.equal(hasBlockingRegisteredState(row), true)
})

test('isZombieLock detects stale and incomplete locks', () => {
  const nowMs = Date.parse('2026-04-14T12:00:00.000Z')
  assert.equal(
    isZombieLock(
      { locked_by: 'user-1', locked_at: '2026-04-14T11:30:00.000Z' },
      { nowMs, staleMs: 10 * 60 * 1000 }
    ),
    true
  )
  assert.equal(
    isZombieLock(
      { workflow_status: 'registering', locked_by: '', locked_at: null },
      { nowMs, staleMs: 10 * 60 * 1000 }
    ),
    true
  )
})

test('getZombieLockAnalysis explains anomalous lock combinations', () => {
  const nowMs = Date.parse('2026-04-14T12:00:00.000Z')
  const missingLockedAt = getZombieLockAnalysis(
    { locked_by: 'user-1', locked_at: null, workflow_status: 'confirmed' },
    { nowMs }
  )
  assert.equal(missingLockedAt.isZombie, true)
  assert.equal(missingLockedAt.reason, 'locked_by_without_locked_at')

  const missingLockedBy = getZombieLockAnalysis(
    { locked_by: '', locked_at: '2026-04-14T11:45:00.000Z', workflow_status: 'confirmed' },
    { nowMs }
  )
  assert.equal(missingLockedBy.isZombie, true)
  assert.equal(missingLockedBy.reason, 'locked_at_without_locked_by')
})

test('getAdminResetLockThresholds supports env overrides and separate defaults', () => {
  const prevEdit = process.env.ADMIN_RESET_EDIT_ZOMBIE_LOCK_MS
  const prevReg = process.env.ADMIN_RESET_REGISTRATION_ZOMBIE_LOCK_MS
  process.env.ADMIN_RESET_EDIT_ZOMBIE_LOCK_MS = '120000'
  process.env.ADMIN_RESET_REGISTRATION_ZOMBIE_LOCK_MS = '240000'
  try {
    const thresholds = getAdminResetLockThresholds()
    assert.equal(thresholds.editingMs, 120000)
    assert.equal(thresholds.registrationMs, 240000)
  } finally {
    if (prevEdit == null) delete process.env.ADMIN_RESET_EDIT_ZOMBIE_LOCK_MS
    else process.env.ADMIN_RESET_EDIT_ZOMBIE_LOCK_MS = prevEdit
    if (prevReg == null) delete process.env.ADMIN_RESET_REGISTRATION_ZOMBIE_LOCK_MS
    else process.env.ADMIN_RESET_REGISTRATION_ZOMBIE_LOCK_MS = prevReg
  }
})

test('import and workflow guards stay conservative', () => {
  assert.equal(isImportQueueResettable({ stato: 'classified' }), true)
  assert.equal(isImportQueueResettable({ stato: 'processed' }), false)
  assert.equal(hasValidImportGeneratedOutput({ linkedDocument: { id: 'doc-1' } }), false)
  assert.equal(hasValidImportGeneratedOutput({ linkedDocument: { workflow_status: 'registered' } }), true)
  assert.equal(hasValidImportGeneratedOutput({ linkedDocument: null, linkedPrimaNota: null }), false)
  assert.equal(isWorkflowResettable({ workflow_status: 'confirmed', prima_nota_id: null, registered_at: null }), true)
  assert.equal(isWorkflowResettable({ workflow_status: 'registered', prima_nota_id: 'pn-1' }), false)
})

test('pickDocumentResetBaseWorkflow prefers coherent workflow and validated signals', () => {
  assert.equal(
    pickDocumentResetBaseWorkflow({ workflow_status: 'confirmed', validation_status: '', validated_at: null }),
    'confirmed'
  )
  assert.equal(
    pickDocumentResetBaseWorkflow({ workflow_status: 'registering', validation_status: '', validated_at: '2026-04-14T10:00:00.000Z' }),
    'confirmed'
  )
  assert.equal(
    pickDocumentResetBaseWorkflow({ workflow_status: 'registering', validation_status: 'error', validated_at: null }),
    'error'
  )
})
