import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isFiscalJournalLegacyFallbackEnabled,
  isFiscalJournalPersistEnabled,
} from '../src/modules/contabilita/application/fiscalJournal/isFiscalJournalPersistEnabled.js'

test('cutover persist respects explicit override', () => {
  assert.equal(isFiscalJournalPersistEnabled(true), true)
  assert.equal(isFiscalJournalPersistEnabled(false), false)
})

test('legacy fallback default off', () => {
  const prev = process.env.FISCOSIM_FISCAL_JOURNAL_LEGACY_FALLBACK
  delete process.env.FISCOSIM_FISCAL_JOURNAL_LEGACY_FALLBACK
  assert.equal(isFiscalJournalLegacyFallbackEnabled(), false)
  process.env.FISCOSIM_FISCAL_JOURNAL_LEGACY_FALLBACK = 'true'
  assert.equal(isFiscalJournalLegacyFallbackEnabled(), true)
  if (prev === undefined) delete process.env.FISCOSIM_FISCAL_JOURNAL_LEGACY_FALLBACK
  else process.env.FISCOSIM_FISCAL_JOURNAL_LEGACY_FALLBACK = prev
})

test('persist enabled when FISCOSIM_FISCAL_JOURNAL_PERSIST_ENABLED=true', () => {
  const prev = process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_ENABLED
  const prevLab = process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED
  const prevIso = process.env.FISCOSIM_ISOLATED_LAB_API
  delete process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED
  delete process.env.FISCOSIM_ISOLATED_LAB_API
  process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_ENABLED = 'true'
  assert.equal(isFiscalJournalPersistEnabled(), true)
  if (prev === undefined) delete process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_ENABLED
  else process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_ENABLED = prev
  if (prevLab === undefined) delete process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED
  else process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED = prevLab
  if (prevIso === undefined) delete process.env.FISCOSIM_ISOLATED_LAB_API
  else process.env.FISCOSIM_ISOLATED_LAB_API = prevIso
})
