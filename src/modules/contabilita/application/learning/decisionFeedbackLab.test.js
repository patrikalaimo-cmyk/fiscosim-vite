import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDecisionFeedbackEvent } from './buildDecisionFeedbackEvent.js'
import {
  appendDecisionFeedbackEvents,
  loadDecisionFeedbackEvents,
} from './decisionFeedbackLabStore.js'
import { buildImportDecisionFeedbackEvents } from './buildImportDecisionFeedbackEvents.js'
import { buildBankDecisionFeedbackEvents } from './buildBankDecisionFeedbackEvents.js'
import {
  applyBankMatchMemoryBoost,
  lookupBankMatchMemory,
} from './lookupBankMatchMemory.js'

function memoryStorage() {
  const map = new Map()
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null },
    setItem(key, value) { map.set(key, String(value)) },
    removeItem(key) { map.delete(key) },
  }
}

test('SG-L2 — buildDecisionFeedbackEvent rifiuta dry-run e eventi senza anchor', () => {
  assert.equal(buildDecisionFeedbackEvent({
    societaId: 'soc-1',
    sourceModule: 'import_contabilita',
    field: 'account',
    finalValue: 'acc-1',
    dryRun: true,
    requestId: 'req-1',
  }), null)

  assert.equal(buildDecisionFeedbackEvent({
    societaId: 'soc-1',
    sourceModule: 'import_contabilita',
    field: 'account',
    finalValue: 'acc-1',
  }), null)

  const ok = buildDecisionFeedbackEvent({
    societaId: 'soc-1',
    sourceModule: 'import_contabilita',
    field: 'account',
    finalValue: 'acc-1',
    proposedValue: 'acc-2',
    requestId: 'req-1',
    committed: true,
  })
  assert.equal(ok.wasOverridden, true)
  assert.equal(ok.storageKind, 'lab_localstorage')
})

test('SG-L2 — store append-only con dedup su societa+anchor+field', () => {
  const storage = memoryStorage()
  const first = appendDecisionFeedbackEvents('soc-1', [{
    societaId: 'soc-1',
    sourceModule: 'import_contabilita',
    field: 'account',
    finalValue: 'acc-1',
    requestId: 'req-1',
    committed: true,
  }], storage)
  assert.equal(first.length, 1)

  const second = appendDecisionFeedbackEvents('soc-1', [{
    societaId: 'soc-1',
    sourceModule: 'import_contabilita',
    field: 'account',
    finalValue: 'acc-9',
    requestId: 'req-1',
    committed: true,
  }], storage)
  assert.equal(second.length, 1)
  assert.equal(second[0].finalValue, 'acc-1')

  const third = appendDecisionFeedbackEvents('soc-1', [{
    societaId: 'soc-1',
    sourceModule: 'import_contabilita',
    field: 'causale',
    finalValue: 'cau-1',
    requestId: 'req-1',
    committed: true,
  }], storage)
  assert.equal(third.length, 2)
  assert.equal(loadDecisionFeedbackEvents('soc-1', storage).length, 2)
})

test('SG-L2 — import builder crea eventi account/causale/iva post-commit', () => {
  const events = buildImportDecisionFeedbackEvents({
    societaId: 'soc-1',
    commitResult: { success: true, primaNotaId: 'pn-1', requestId: 'req-imp' },
    workingViewModel: {
      account: { id: 'acc-final' },
      causale: { id: 'cau-final' },
      counterpartyAccount: { partitaIva: '999' },
    },
    proposedAccount: { id: 'acc-hist', _importHistorySuggested: true },
    proposedCausale: { id: 'cau-hist', _importHistorySuggested: true },
    ivaDraftRows: [{
      causaleIvaId: 'iva-std',
      standardCausaleIvaId: 'iva-std',
      historicalCausaleIvaId: 'iva-hist',
      causaleIvaSuggestionSource: 'standard',
      aliquota: 22,
    }],
  })
  assert.equal(events.length, 3)
  assert.ok(events.every((row) => row.sourceModule === 'import_contabilita'))
  assert.ok(events.some((row) => row.field === 'causale_iva' && row.finalValue === 'iva-std'))
})

test('SG-L2 — import builder non apprende su dry-run', () => {
  const events = buildImportDecisionFeedbackEvents({
    societaId: 'soc-1',
    commitResult: { success: true, primaNotaId: 'pn-1' },
    workingViewModel: { account: { id: 'acc-1' } },
    dryRun: true,
  })
  assert.deepEqual(events, [])
})

test('SG-L5 — bank memory boosta candidati partita già confermati', () => {
  const storage = memoryStorage()
  const events = buildBankDecisionFeedbackEvents({
    societaId: 'soc-bank',
    decision: { selectedPartitaId: 'part-77' },
    movement: {
      movementId: 'mov-1',
      amount: 122,
      counterpartyName: 'Cliente Rossi',
      direction: 'in',
    },
    decisionProposal: {
      selectedCandidate: { partitaId: 'part-77', soggettoNome: 'Cliente Rossi', matchType: 'exact_amount' },
    },
  })
  appendDecisionFeedbackEvents('soc-bank', events, storage)

  const memory = lookupBankMatchMemory({
    societaId: 'soc-bank',
    movement: { amount: 122, counterpartyName: 'Cliente Rossi Srl', direction: 'in' },
    storage,
  })
  assert.ok(memory.partitaIds.has('part-77'))

  const boosted = applyBankMatchMemoryBoost([
    { partitaId: 'part-77', confidence: 0.7, reasons: ['importo_esatto'] },
    { partitaId: 'part-other', confidence: 0.75, reasons: [] },
  ], memory)
  assert.equal(boosted[0].matchMemoryHit, true)
  assert.ok(boosted[0].confidence > 0.7)
  assert.ok(boosted[0].reasons.includes('match_memory_confirmed'))
  assert.equal(boosted[1].matchMemoryHit, undefined)
})
