import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildImportContabilitaAccountingHistoryIndex,
  decorateImportAccountingHistorySuggestion,
  resolveImportContabilitaAccountingHistorySuggestion,
} from '../domain/importContabilitaAccountingHistory.js'

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
    id: 'cliente-1',
    codice: '1.02.01.001',
    descrizione: 'Cliente Test Srl',
    partitaIva: '88888888888',
    isCliente: true,
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
    id: 'costo-generico',
    codice: '6.01.01.002',
    descrizione: 'Acquisti generici',
    tipo: 'economico',
    natura: 'costo',
  },
  {
    id: 'ricavo-1',
    codice: '7.01.01.001',
    descrizione: 'Ricavi test',
    tipo: 'economico',
    natura: 'ricavo',
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
  { id: 'ff2', codice: 'FF2', descrizione: 'Fattura acquisto alternativa' },
  { id: 'fc', codice: 'FC', descrizione: 'Fattura vendita' },
]

const DOCUMENTS = [
  {
    id: 'doc-1',
    tipo_documento: 'Fattura passiva',
    soggetto_piva: 'IT99999999999',
    soggetto_denominazione: 'Fornitore Caffe Test Srl',
    prima_nota_id: 'pn-1',
    registered_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 'doc-2',
    tipo_documento: 'Fattura passiva',
    soggetto_piva: '99999999999',
    soggetto_denominazione: 'Fornitore Caffe Test Srl',
    prima_nota_id: 'pn-2',
    registered_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'doc-3',
    tipo_documento: 'Fattura passiva',
    soggetto_piva: '99999999999',
    soggetto_denominazione: 'Fornitore Caffe Test Srl',
    prima_nota_id: 'pn-3',
    registered_at: '2026-09-20T10:00:00Z',
  },
  {
    id: 'doc-sale',
    tipo_documento: 'Fattura attiva',
    soggetto_piva: '88888888888',
    soggetto_denominazione: 'Cliente Test Srl',
    prima_nota_id: 'pn-sale',
    registered_at: '2026-09-25T10:00:00Z',
  },
]

const HEADERS = [
  { id: 'pn-1', causale_id: 'ff', causale_codice: 'FF', cliente_fornitore_id: 'fornitore-1' },
  { id: 'pn-2', causale_id: 'ff', causale_codice: 'FF', cliente_fornitore_id: 'fornitore-1' },
  { id: 'pn-3', causale_id: 'ff2', causale_codice: 'FF2', cliente_fornitore_id: 'fornitore-1' },
  { id: 'pn-sale', causale_id: 'fc', causale_codice: 'FC', cliente_fornitore_id: 'cliente-1' },
]

const ROWS = [
  { prima_nota_id: 'pn-1', riga_numero: 1, conto_id: 'costo-caffe', importo_dare: 100, importo_avere: 0 },
  { prima_nota_id: 'pn-1', riga_numero: 2, conto_id: 'iva-acquisti', importo_dare: 22, importo_avere: 0 },
  { prima_nota_id: 'pn-1', riga_numero: 3, conto_id: 'fornitore-1', importo_dare: 0, importo_avere: 122 },

  { prima_nota_id: 'pn-2', riga_numero: 1, conto_id: 'costo-caffe', importo_dare: 200, importo_avere: 0 },
  { prima_nota_id: 'pn-2', riga_numero: 2, conto_id: 'iva-acquisti', importo_dare: 44, importo_avere: 0 },
  { prima_nota_id: 'pn-2', riga_numero: 3, conto_id: 'fornitore-1', importo_dare: 0, importo_avere: 244 },

  { prima_nota_id: 'pn-3', riga_numero: 1, conto_id: 'costo-generico', importo_dare: 90, importo_avere: 0 },
  { prima_nota_id: 'pn-3', riga_numero: 2, conto_id: 'iva-acquisti', importo_dare: 19.8, importo_avere: 0 },
  { prima_nota_id: 'pn-3', riga_numero: 3, conto_id: 'fornitore-1', importo_dare: 0, importo_avere: 109.8 },

  { prima_nota_id: 'pn-sale', riga_numero: 1, conto_id: 'cliente-1', importo_dare: 122, importo_avere: 0 },
  { prima_nota_id: 'pn-sale', riga_numero: 2, conto_id: 'ricavo-1', importo_dare: 0, importo_avere: 100 },
]

function buildIndex() {
  return buildImportContabilitaAccountingHistoryIndex({
    documents: DOCUMENTS,
    headers: HEADERS,
    rows: ROWS,
    pianoConti: PIANO_CONTI,
    causaliContabili: CAUSALI,
  })
}

test('IMPORT-25A-HISTORY-2 — storico fornitore propone conto costo e causale contabile modali', () => {
  const suggestion = resolveImportContabilitaAccountingHistorySuggestion({
    historyIndex: buildIndex(),
    parsedDocument: {
      fornitore: {
        denominazione: 'Fornitore Caffe Test Srl',
        partitaIva: '99999999999',
      },
    },
    direction: 'acquisto',
    pianoContiById: new Map(PIANO_CONTI.map((row) => [row.id, row])),
    causaliContabiliById: new Map(CAUSALI.map((row) => [row.id, row])),
  })

  assert.ok(suggestion)
  assert.equal(suggestion.matchType, 'piva')
  assert.equal(suggestion.sampleCount, 3)
  assert.equal(suggestion.costRevenueAccount?.id, 'costo-caffe')
  assert.equal(suggestion.accountSampleCount, 2)
  assert.equal(suggestion.causaleContabile?.id, 'ff')
  assert.equal(suggestion.causaleSampleCount, 2)
})

test('IMPORT-25A-HISTORY-2 — conto IVA e conto controparte non possono diventare conto costo storico', () => {
  const suggestion = resolveImportContabilitaAccountingHistorySuggestion({
    historyIndex: buildIndex(),
    counterpartyAccount: PIANO_CONTI.find((row) => row.id === 'fornitore-1'),
    direction: 'acquisto',
    pianoContiById: new Map(PIANO_CONTI.map((row) => [row.id, row])),
    causaliContabiliById: new Map(CAUSALI.map((row) => [row.id, row])),
  })

  assert.ok(suggestion)
  assert.notEqual(suggestion.costRevenueAccount?.id, 'iva-acquisti')
  assert.notEqual(suggestion.costRevenueAccount?.id, 'fornitore-1')
})

test('IMPORT-25A-HISTORY-2 — storico acquisti e vendite resta separato', () => {
  const index = buildIndex()
  const purchase = resolveImportContabilitaAccountingHistorySuggestion({
    historyIndex: index,
    counterpartyAccount: PIANO_CONTI.find((row) => row.id === 'fornitore-1'),
    direction: 'acquisto',
    pianoContiById: new Map(PIANO_CONTI.map((row) => [row.id, row])),
    causaliContabiliById: new Map(CAUSALI.map((row) => [row.id, row])),
  })
  const sale = resolveImportContabilitaAccountingHistorySuggestion({
    historyIndex: index,
    counterpartyAccount: PIANO_CONTI.find((row) => row.id === 'cliente-1'),
    direction: 'vendita',
    pianoContiById: new Map(PIANO_CONTI.map((row) => [row.id, row])),
    causaliContabiliById: new Map(CAUSALI.map((row) => [row.id, row])),
  })

  assert.equal(purchase?.causaleContabile?.id, 'ff')
  assert.equal(sale?.causaleContabile?.id, 'fc')
  assert.equal(sale?.costRevenueAccount?.id, 'ricavo-1')
  assert.equal(sale?.sampleCount, 1)
})

test('IMPORT-25A-HISTORY-2 — fallback denominazione funziona senza P.IVA', () => {
  const suggestion = resolveImportContabilitaAccountingHistorySuggestion({
    historyIndex: buildIndex(),
    parsedDocument: {
      fornitore: { denominazione: 'Fornitore Caffè Test S.r.l.' },
    },
    direction: 'acquisto',
    pianoContiById: new Map(PIANO_CONTI.map((row) => [row.id, row])),
    causaliContabiliById: new Map(CAUSALI.map((row) => [row.id, row])),
  })

  assert.ok(suggestion)
  assert.equal(suggestion.matchType, 'name')
  assert.equal(suggestion.costRevenueAccount?.id, 'costo-caffe')
})

test('IMPORT-25A-HISTORY-2 — proposta storica è marcata esplicitamente come assistiva', () => {
  const decorated = decorateImportAccountingHistorySuggestion(
    PIANO_CONTI.find((row) => row.id === 'costo-caffe'),
    { kind: 'account', sampleCount: 2, totalSamples: 3, lastSeenAt: '2026-09-20T10:00:00Z' },
  )

  assert.equal(decorated._importHistorySuggested, true)
  assert.equal(decorated._importHistoryKind, 'account')
  assert.equal(decorated._importHistorySampleCount, 2)
  assert.equal(decorated._importHistoryTotalSamples, 3)
})

test('IMPORT-25A-HISTORY-2 — production path precompila solo chiavi senza override esistente', async () => {
  const source = await readFile(new URL('../index.jsx', import.meta.url), 'utf8')

  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(nextAccounts, rowKey\)/)
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(nextCausali, rowKey\)/)
  assert.match(source, /decorateImportAccountingHistorySuggestion/)
  assert.match(source, /loadImportContabilitaAccountingHistoryBySocieta\(selectedSocietaId\)\.catch/)
})

test('IMPORT-25A-HISTORY-2 — data source storico è read-only su documenti contabilizzati e prima nota', async () => {
  const source = await readFile(new URL('../data/importContabilitaRepo.js', import.meta.url), 'utf8')
  const start = source.indexOf('export async function loadImportContabilitaAccountingHistoryBySocieta')
  const end = source.indexOf('export async function loadStaging', start)
  const block = source.slice(start, end)

  assert.match(block, /from\('prima_nota'\)/)
  assert.match(block, /from\('prima_nota_righe'\)/)
  assert.doesNotMatch(block, /\.insert\(/)
  assert.doesNotMatch(block, /\.update\(/)
  assert.doesNotMatch(block, /\.delete\(/)
})
