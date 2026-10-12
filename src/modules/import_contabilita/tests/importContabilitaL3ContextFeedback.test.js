import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildImportSuggestionContextKey,
  extractImportDescriptionToken,
  scoreImportContextKeyMatch,
} from '../application/suggestion/buildImportSuggestionContextKey.js'
import { lookupImportDecisionFeedback } from '../application/suggestion/lookupImportDecisionFeedback.js'
import { resolveImportContabilitaStagingAccountingHistorySuggestions } from '../application/suggestion/importContabilitaL1SuggestionResolver.js'
import { appendDecisionFeedbackEvents } from '../../contabilita/application/learning/decisionFeedbackLabStore.js'
import { buildImportDecisionFeedbackEvents } from '../../contabilita/application/learning/buildImportDecisionFeedbackEvents.js'

function memoryStorage() {
  const map = new Map()
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null },
    setItem(key, value) { map.set(key, String(value)) },
    removeItem(key) { map.delete(key) },
  }
}

test('SG-L3 — description token distingue prodotto A vs B', () => {
  const caffe = extractImportDescriptionToken({
    righe: [{ descrizione: 'Acquisto caffè Arabica 1kg' }],
  })
  const toner = extractImportDescriptionToken({
    righe: [{ descrizione: 'Toner stampante laser nero' }],
  })
  assert.ok(caffe)
  assert.ok(toner)
  assert.notEqual(caffe, toner)

  const keyA = buildImportSuggestionContextKey({
    counterpartyPiva: '99999999999',
    direction: 'acquisto',
    parsedDocument: { righe: [{ descrizione: 'Acquisto caffè Arabica 1kg' }] },
  })
  const keyB = buildImportSuggestionContextKey({
    counterpartyPiva: '99999999999',
    direction: 'acquisto',
    parsedDocument: { righe: [{ descrizione: 'Toner stampante laser nero' }] },
  })
  assert.notEqual(keyA, keyB)
  assert.equal(scoreImportContextKeyMatch(keyA, keyA), 100)
  assert.ok(scoreImportContextKeyMatch(keyA, keyB) < 100)
  assert.ok(scoreImportContextKeyMatch(keyA, keyB) >= 40)
})

test('SG-L3 — feedback contestuale propone conti diversi per stesso fornitore', () => {
  const storage = memoryStorage()
  const societaId = 'soc-l3'

  const eventsA = buildImportDecisionFeedbackEvents({
    societaId,
    commitResult: { success: true, primaNotaId: 'pn-a', requestId: 'req-a' },
    workingViewModel: {
      account: { id: 'costo-caffe' },
      causale: { id: 'ff' },
      counterpartyAccount: { partitaIva: '99999999999', descrizione: 'Fornitore Mix' },
      parsedDocument: { righe: [{ descrizione: 'Caffe macinato premium' }] },
    },
    contextKey: buildImportSuggestionContextKey({
      counterpartyPiva: '99999999999',
      counterpartyName: 'Fornitore Mix',
      direction: 'acquisto',
      parsedDocument: { righe: [{ descrizione: 'Caffe macinato premium' }] },
    }),
    direction: 'acquisto',
  })
  const eventsB = buildImportDecisionFeedbackEvents({
    societaId,
    commitResult: { success: true, primaNotaId: 'pn-b', requestId: 'req-b' },
    workingViewModel: {
      account: { id: 'costo-toner' },
      causale: { id: 'ff' },
      counterpartyAccount: { partitaIva: '99999999999', descrizione: 'Fornitore Mix' },
      parsedDocument: { righe: [{ descrizione: 'Toner stampante nero' }] },
    },
    contextKey: buildImportSuggestionContextKey({
      counterpartyPiva: '99999999999',
      counterpartyName: 'Fornitore Mix',
      direction: 'acquisto',
      parsedDocument: { righe: [{ descrizione: 'Toner stampante nero' }] },
    }),
    direction: 'acquisto',
  })
  appendDecisionFeedbackEvents(societaId, [...eventsA, ...eventsB], storage)

  const hitA = lookupImportDecisionFeedback({
    societaId,
    direction: 'acquisto',
    counterpartyAccount: { partitaIva: '99999999999', descrizione: 'Fornitore Mix' },
    parsedDocument: { righe: [{ descrizione: 'Caffe macinato premium' }] },
    storage,
  })
  const hitB = lookupImportDecisionFeedback({
    societaId,
    direction: 'acquisto',
    counterpartyAccount: { partitaIva: '99999999999', descrizione: 'Fornitore Mix' },
    parsedDocument: { righe: [{ descrizione: 'Toner stampante nero' }] },
    storage,
  })
  assert.equal(hitA.account?.valueId, 'costo-caffe')
  assert.equal(hitB.account?.valueId, 'costo-toner')
  assert.notEqual(hitA.account?.valueId, hitB.account?.valueId)
})

test('SG-L3/L1 — staging preferisce feedback contestuale allo storico mode', () => {
  const storage = memoryStorage()
  const societaId = 'soc-l3-stage'
  const pianoContiById = new Map([
    ['costo-caffe', { id: 'costo-caffe', codice: '6.01.01.001', descrizione: 'Caffe' }],
    ['costo-generico', { id: 'costo-generico', codice: '6.01.01.999', descrizione: 'Generico' }],
  ])
  const causaliContabiliById = new Map([
    ['ff', { id: 'ff', codice: 'FF', descrizione: 'Fattura' }],
  ])

  appendDecisionFeedbackEvents(societaId, buildImportDecisionFeedbackEvents({
    societaId,
    commitResult: { success: true, primaNotaId: 'pn-1', requestId: 'req-1' },
    workingViewModel: {
      account: { id: 'costo-caffe' },
      causale: { id: 'ff' },
      counterpartyAccount: { partitaIva: '12345678901', descrizione: 'Fornitore X' },
      parsedDocument: { righe: [{ descrizione: 'Caffe specialty bag' }] },
    },
    contextKey: buildImportSuggestionContextKey({
      counterpartyPiva: '12345678901',
      direction: 'acquisto',
      parsedDocument: { righe: [{ descrizione: 'Caffe specialty bag' }] },
    }),
    direction: 'acquisto',
  }), storage)

  const historyIndex = new Map([
    ['piva:12345678901|acquisto', {
      sampleCount: 5,
      costRevenueAccountId: 'costo-generico',
      accountSampleCount: 5,
      causaleContabileId: 'ff',
      causaleSampleCount: 5,
      lastSeenAt: '2026-01-01T00:00:00Z',
    }],
  ])

  // Monkey-patch resolve uses real history adapter keys — inject via feedback only path:
  // We call L1 with empty history and feedback via societaId+storage.
  const resolved = resolveImportContabilitaStagingAccountingHistorySuggestions({
    historyIndex,
    parsedDocument: {
      fornitore: { partitaIva: '12345678901', denominazione: 'Fornitore X' },
      righe: [{ descrizione: 'Caffe specialty bag' }],
    },
    counterpartyAccount: { partitaIva: '12345678901', descrizione: 'Fornitore X', isFornitore: true },
    direction: 'acquisto',
    pianoContiById,
    causaliContabiliById,
    hasManualAccount: false,
    hasManualCausale: false,
    societaId,
    storage,
  })

  assert.ok(resolved?.account)
  assert.equal(resolved.account.value.id, 'costo-caffe')
  assert.equal(resolved.account.explanation.source, 'feedback')
  assert.ok(resolved.account.explanation.conflicts.some((c) => c.kind === 'feedback_vs_history'))
})
