import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildImportContabilitaVatHistoryIndex,
  normalizeImportVatHistoryPiva,
  resolveImportContabilitaVatHistorySuggestion,
} from '../domain/importContabilitaVatHistory.js'

const HISTORY_ROWS = [
  {
    id: 'h1',
    tipo: 'acquisto',
    soggetto_piva: 'IT99999999999',
    soggetto_denominazione: 'Fornitore Caffe Test Srl',
    aliquota: 22,
    iva: 22,
    iva_detraibile: 13.2,
    iva_indetraibile: 8.8,
    causale_iva_id: 'hist-22',
    created_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'h2',
    tipo: 'acquisto',
    soggetto_piva: '99999999999',
    soggetto_denominazione: 'Fornitore Caffe Test Srl',
    aliquota: 22,
    iva: 44,
    iva_detraibile: 26.4,
    iva_indetraibile: 17.6,
    causale_iva_id: 'hist-22',
    created_at: '2026-09-20T10:00:00Z',
  },
  {
    id: 'h3',
    tipo: 'acquisto',
    soggetto_piva: '99999999999',
    soggetto_denominazione: 'Fornitore Caffe Test Srl',
    aliquota: 22,
    iva: 22,
    iva_detraibile: 22,
    iva_indetraibile: 0,
    causale_iva_id: 'other-22',
    created_at: '2026-09-30T10:00:00Z',
  },
  {
    id: 'h4',
    tipo: 'vendita',
    soggetto_piva: '99999999999',
    soggetto_denominazione: 'Fornitore Caffe Test Srl',
    aliquota: 22,
    iva: 22,
    iva_detraibile: 22,
    causale_iva_id: 'sales-22',
    created_at: '2026-10-01T10:00:00Z',
  },
]

test('IMPORT-25A-HISTORY-1 — normalizza P.IVA IT e costruisce indice storico per direzione/aliquota', () => {
  assert.equal(normalizeImportVatHistoryPiva('IT 99999999999'), '99999999999')

  const index = buildImportContabilitaVatHistoryIndex(HISTORY_ROWS)
  const suggestion = resolveImportContabilitaVatHistorySuggestion({
    historyIndex: index,
    counterpartyAccount: {
      isFornitore: true,
      partitaIva: '99999999999',
      descrizione: 'Fornitore Caffe Test Srl',
    },
    parsedDocument: {},
    source: { aliquota: 22 },
  })

  assert.ok(suggestion)
  assert.equal(suggestion.direction, 'acquisto')
  assert.equal(suggestion.matchType, 'piva')
  assert.equal(suggestion.sampleCount, 3)
  assert.equal(suggestion.causaleIvaId, 'hist-22')
  assert.equal(suggestion.causaleSampleCount, 2)
  assert.equal(suggestion.detraibilePercent, 60)
  assert.equal(suggestion.detraibileSampleCount, 2)
})

test('IMPORT-25A-HISTORY-1 — non mescola storico acquisti e vendite', () => {
  const index = buildImportContabilitaVatHistoryIndex(HISTORY_ROWS)

  const acquisto = resolveImportContabilitaVatHistorySuggestion({
    historyIndex: index,
    counterpartyAccount: { isFornitore: true, partitaIva: '99999999999' },
    source: { aliquota: 22 },
  })
  const vendita = resolveImportContabilitaVatHistorySuggestion({
    historyIndex: index,
    counterpartyAccount: { isCliente: true, partitaIva: '99999999999' },
    source: { aliquota: 22 },
  })

  assert.equal(acquisto?.causaleIvaId, 'hist-22')
  assert.equal(vendita?.causaleIvaId, 'sales-22')
  assert.equal(vendita?.sampleCount, 1)
})

test('IMPORT-25A-HISTORY-1 — fallback denominazione solo quando manca P.IVA', () => {
  const index = buildImportContabilitaVatHistoryIndex(HISTORY_ROWS)
  const suggestion = resolveImportContabilitaVatHistorySuggestion({
    historyIndex: index,
    counterpartyAccount: {
      isFornitore: true,
      descrizione: 'Fornitore Caffè Test S.r.l.',
    },
    source: { aliquota: 22 },
  })

  assert.ok(suggestion)
  assert.equal(suggestion.matchType, 'name')
  assert.equal(suggestion.causaleIvaId, 'hist-22')
})

test('IMPORT-25A-HISTORY-1 — aliquota diversa non riusa una scelta storica incompatibile', () => {
  const index = buildImportContabilitaVatHistoryIndex(HISTORY_ROWS)
  const suggestion = resolveImportContabilitaVatHistorySuggestion({
    historyIndex: index,
    counterpartyAccount: { isFornitore: true, partitaIva: '99999999999' },
    source: { aliquota: 10 },
  })

  assert.equal(suggestion, null)
})
