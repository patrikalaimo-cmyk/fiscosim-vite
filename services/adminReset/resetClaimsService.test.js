import test from 'node:test'
import assert from 'node:assert/strict'

import { buildResetDocumentClaimsPlan } from './resetClaimsService.js'

test('claim reset plan restores zombie registering rows to coherent workflow state', () => {
  const rows = [{
    id: 'doc-1',
    societa_id: 'soc-1',
    numero_documento: 'FT-1',
    workflow_status: 'registering',
    validation_status: '',
    validated_at: '2026-04-14T09:00:00.000Z',
    locked_by: 'user-1',
    locked_at: '2026-04-14T10:00:00.000Z',
    prima_nota_id: null,
    registered_at: null,
  }]

  const plan = buildResetDocumentClaimsPlan(rows, {
    nowMs: Date.parse('2026-04-14T12:00:00.000Z'),
  })

  assert.equal(plan[0].decision, 'touch')
  assert.deepEqual(plan[0].patch, {
    workflow_status: 'confirmed',
    locked_by: null,
    locked_at: null,
  })
  assert.equal(plan[0].zombie_lock, true)
  assert.match(plan[0].message, /soglia registrazione/i)
})

test('claim reset plan clears only locks for finalized documents', () => {
  const rows = [{
    id: 'doc-2',
    societa_id: 'soc-1',
    workflow_status: 'registering',
    validation_status: 'confirmed',
    locked_by: 'user-2',
    locked_at: '2026-04-14T11:00:00.000Z',
    prima_nota_id: 'pn-2',
    registered_at: '2026-04-14T10:55:00.000Z',
  }]

  const plan = buildResetDocumentClaimsPlan(rows, {
    nowMs: Date.parse('2026-04-14T12:00:00.000Z'),
  })

  assert.equal(plan[0].decision, 'touch')
  assert.deepEqual(plan[0].patch, {
    locked_by: null,
    locked_at: null,
  })
})

test('claim reset plan skips healthy rows', () => {
  const rows = [{
    id: 'doc-3',
    societa_id: 'soc-1',
    workflow_status: 'confirmed',
    validation_status: 'confirmed',
    locked_by: null,
    locked_at: null,
    prima_nota_id: null,
    registered_at: null,
  }]

  const plan = buildResetDocumentClaimsPlan(rows)
  assert.equal(plan[0].decision, 'skip')
  assert.equal(plan[0].patch, null)
})

test('claim reset plan explains locked_at without locked_by as zombie lock only', () => {
  const rows = [{
    id: 'doc-4',
    societa_id: 'soc-1',
    workflow_status: 'confirmed',
    validation_status: 'confirmed',
    locked_by: '',
    locked_at: '2026-04-14T11:55:00.000Z',
    prima_nota_id: null,
    registered_at: null,
  }]

  const plan = buildResetDocumentClaimsPlan(rows, {
    nowMs: Date.parse('2026-04-14T12:00:00.000Z'),
  })

  assert.equal(plan[0].decision, 'touch')
  assert.equal(plan[0].zombie_reason, 'locked_at_without_locked_by')
  assert.deepEqual(plan[0].patch, {
    locked_by: null,
    locked_at: null,
  })
})

test('claim reset plan allows explicit document-scope reset for active registering claim', () => {
  const rows = [{
    id: 'doc-5',
    societa_id: 'soc-1',
    workflow_status: 'registering',
    validation_status: 'confirmed',
    validated_at: '2026-04-14T11:00:00.000Z',
    locked_by: 'user-1',
    locked_at: '2026-04-14T11:55:00.000Z',
    prima_nota_id: null,
    registered_at: null,
  }]

  const plan = buildResetDocumentClaimsPlan(rows, {
    nowMs: Date.parse('2026-04-14T12:00:00.000Z'),
    scopeType: 'document',
  })

  assert.equal(plan[0].decision, 'touch')
  assert.equal(plan[0].reason, 'manual_registering_claim_reset')
  assert.deepEqual(plan[0].patch, {
    workflow_status: 'confirmed',
    locked_by: null,
    locked_at: null,
  })
})

test('claim reset plan allows company-scope reset for active registering claim in test phase', () => {
  const rows = [{
    id: 'doc-6',
    societa_id: 'soc-1',
    workflow_status: 'registering',
    validation_status: 'confirmed',
    validated_at: '2026-04-14T11:00:00.000Z',
    locked_by: 'user-1',
    locked_at: '2026-04-14T11:55:00.000Z',
    prima_nota_id: null,
    registered_at: null,
  }]

  const plan = buildResetDocumentClaimsPlan(rows, {
    nowMs: Date.parse('2026-04-14T12:00:00.000Z'),
    scopeType: 'company',
  })

  assert.equal(plan[0].decision, 'touch')
  assert.equal(plan[0].reason, 'test_registering_claim_reset')
  assert.deepEqual(plan[0].patch, {
    workflow_status: 'confirmed',
    locked_by: null,
    locked_at: null,
  })
})

test('claim reset plan recommends workflow reset for non-finalized workflow error without lock anomalies', () => {
  const rows = [{
    id: 'doc-7',
    societa_id: 'soc-1',
    workflow_status: 'error',
    validation_status: 'confirmed',
    locked_by: null,
    locked_at: null,
    prima_nota_id: null,
    registered_at: null,
  }]

  const plan = buildResetDocumentClaimsPlan(rows, {
    nowMs: Date.parse('2026-04-14T12:00:00.000Z'),
    scopeType: 'document',
  })

  assert.equal(plan[0].decision, 'skip')
  assert.equal(plan[0].reason, 'workflow_reset_recommended')
  assert.equal(plan[0].recommended_action, 'reset_document_workflow')
})
