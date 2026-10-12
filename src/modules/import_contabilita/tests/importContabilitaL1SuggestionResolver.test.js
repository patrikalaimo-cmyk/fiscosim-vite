import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildImportContabilitaL1HistoryIndexes,
  resolveImportContabilitaStagingAccountingHistorySuggestions,
  resolveImportContabilitaWorkingViewVatRowSuggestion,
} from '../application/suggestion/importContabilitaL1SuggestionResolver.js'

const PIANO_CONTI = [
  {
    id: 'fornitore-1',
    codice: '2.03.08.001',
    descrizione: 'Fornitore Caffe Test Srl',
    partitaIva: '99999999999',
    isFornitore: true,
    tipo: 'patrimoniale',
  },
  {
    id: 'costo-caffe',
    codice: '6.01.01.001',
    descrizione: 'Acquisti caffe',
    tipo: 'economico',
    natura: 'costo',
  },
  {
    id: 'iva-acquisti',
    codice: '1.02.40.001',
    descrizione: 'IVA acquisti',
    isIva: true,
    tipo: 'patrimoniale',
  },
]

const CAUSALI = [
  { id: 'ff', codice: 'FF', descrizione: 'Fattura acquisto' },
]

const ACCOUNTING_BUNDLE = {
  documents: [
    {
      id: 'doc-1',
      tipo_documento: 'Fattura passiva',
      soggetto_piva: '99999999999',
      soggetto_denominazione: 'Fornitore Caffe Test Srl',
      prima_nota_id: 'pn-1',
      registered_at: '2026-09-01T10:00:00Z',
    },
    {
      id: 'doc-2',
      tipo_documento: 'Fattura passiva',
      soggetto_piva: '99999999999',
      soggetto_denominazione: 'Fornitore Caffe Test Srl',
      prima_nota_id: 'pn-2',
      registered_at: '2026-09-20T10:00:00Z',
    },
  ],
  headers: [
    { id: 'pn-1', causale_id: 'ff', causale_codice: 'FF', cliente_fornitore_id: 'fornitore-1' },
    { id: 'pn-2', causale_id: 'ff', causale_codice: 'FF', cliente_fornitore_id: 'fornitore-1' },
  ],
  rows: [
    { prima_nota_id: 'pn-1', riga_numero: 1, conto_id: 'costo-caffe', importo_dare: 100, importo_avere: 0 },
    { prima_nota_id: 'pn-1', riga_numero: 2, conto_id: 'iva-acquisti', importo_dare: 22, importo_avere: 0 },
    { prima_nota_id: 'pn-1', riga_numero: 3, conto_id: 'fornitore-1', importo_dare: 0, importo_avere: 122 },
    { prima_nota_id: 'pn-2', riga_numero: 1, conto_id: 'costo-caffe', importo_dare: 200, importo_avere: 0 },
    { prima_nota_id: 'pn-2', riga_numero: 2, conto_id: 'iva-acquisti', importo_dare: 44, importo_avere: 0 },
    { prima_nota_id: 'pn-2', riga_numero: 3, conto_id: 'fornitore-1', importo_dare: 0, importo_avere: 244 },
  ],
}

const VAT_HISTORY_ROWS = [
  {
    id: 'h1',
    tipo: 'acquisto',
    soggetto_piva: '99999999999',
    soggetto_denominazione: 'Fornitore Caffe Test Srl',
    aliquota: 22,
    iva: 22,
    iva_detraibile: 13.2,
    iva_indetraibile: 8.8,
    causale_iva_id: 'hist-22',
    created_at: '2026-09-01T10:00:00Z',
  },
]

test('SG-L1 — history indexes facade builds vat + accounting maps', () => {
  const { vatHistoryIndex, accountingHistoryIndex } = buildImportContabilitaL1HistoryIndexes({
    vatHistoryRows: VAT_HISTORY_ROWS,
    accountingHistoryBundle: ACCOUNTING_BUNDLE,
    pianoConti: PIANO_CONTI,
    causaliContabili: CAUSALI,
  })
  assert.ok(vatHistoryIndex instanceof Map)
  assert.ok(accountingHistoryIndex instanceof Map)
  assert.ok(vatHistoryIndex.size >= 1)
  assert.ok(accountingHistoryIndex.size >= 1)
})

test('SG-L1 — staging resolver propone conto/causale e non sovrascrive manuali', () => {
  const { accountingHistoryIndex } = buildImportContabilitaL1HistoryIndexes({
    accountingHistoryBundle: ACCOUNTING_BUNDLE,
    pianoConti: PIANO_CONTI,
    causaliContabili: CAUSALI,
  })
  const pianoContiById = new Map(PIANO_CONTI.map((row) => [row.id, row]))
  const causaliContabiliById = new Map(CAUSALI.map((row) => [row.id, row]))

  const open = resolveImportContabilitaStagingAccountingHistorySuggestions({
    historyIndex: accountingHistoryIndex,
    parsedDocument: {
      fornitore: {
        denominazione: 'Fornitore Caffe Test Srl',
        partitaIva: '99999999999',
      },
    },
    counterpartyAccount: PIANO_CONTI[0],
    direction: 'acquisto',
    pianoContiById,
    causaliContabiliById,
    hasManualAccount: false,
    hasManualCausale: false,
  })
  assert.ok(open)
  assert.equal(open.account?.value?.id, 'costo-caffe')
  assert.equal(open.causale?.value?.id, 'ff')
  assert.equal(open.account?.explanation?.source, 'history')

  const locked = resolveImportContabilitaStagingAccountingHistorySuggestions({
    historyIndex: accountingHistoryIndex,
    parsedDocument: {
      fornitore: {
        denominazione: 'Fornitore Caffe Test Srl',
        partitaIva: '99999999999',
      },
    },
    counterpartyAccount: PIANO_CONTI[0],
    direction: 'acquisto',
    pianoContiById,
    causaliContabiliById,
    hasManualAccount: true,
    hasManualCausale: true,
  })
  assert.equal(locked, null)
})

test('SG-L1 — IVA Working View preferisce standard e espone conflict DTO vs storico', () => {
  const { vatHistoryIndex } = buildImportContabilitaL1HistoryIndexes({
    vatHistoryRows: VAT_HISTORY_ROWS,
  })
  const result = resolveImportContabilitaWorkingViewVatRowSuggestion({
    vatHistoryIndex,
    source: { aliquota: 22, imponibile: 100, imposta: 22 },
    counterpartyAccount: {
      id: 'fornitore-1',
      partitaIva: '99999999999',
      denominazione: 'Fornitore Caffe Test Srl',
    },
    parsedDocument: {
      tipoDocumento: 'Fattura passiva',
      cedente: { partitaIva: '99999999999' },
    },
    causaliIva: [
      {
        id: 'std-22',
        codice: 'IVA22',
        descrizione: 'IVA 22 standard',
        aliquota: 22,
        is_default_per_aliquota: true,
      },
      { id: 'hist-22', codice: 'H22', descrizione: 'IVA 22 storico', aliquota: 22 },
    ],
    isDemoSocieta: true,
  })
  assert.ok(result.explanation)
  assert.ok(Array.isArray(result.explanation.conflicts))
  if (result.standardCausaleIvaId && result.historicalCausaleIvaId
    && result.standardCausaleIvaId !== result.historicalCausaleIvaId) {
    assert.equal(result.causaleIvaId, result.standardCausaleIvaId)
    assert.ok(result.explanation.conflicts.some((c) => c.kind === 'standard_vs_history'))
  }
})
