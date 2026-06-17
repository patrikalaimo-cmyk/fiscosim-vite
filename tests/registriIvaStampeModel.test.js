import { test } from 'node:test'
import assert from 'node:assert'
import { buildRegistroIvaRowsModel } from '../src/modules/contabilita/application/stampe/buildRegistroIvaRowsModel.js'
import { buildLibroGiornaleModel } from '../src/modules/contabilita/application/stampe/buildLibroGiornaleModel.js'
import { generateStampeHandler } from '../services/api/document/stampe.js'

test('VAT Register Model Builder - Ordinary multi-rate billing lines', () => {
  // Scenario: A single registration (prima_nota_id: 'pn-1') has two VAT rows with different aliquote (22% and 10%)
  const rawRows = [
    {
      id: 'row-2',
      data: '2026-06-01',
      data_documento: '2026-05-28',
      numero_documento: 'FT-100',
      soggetto_denominazione: 'Mario Rossi',
      soggetto_piva: '12345678901',
      imponibile: 100.0,
      iva: 10.0,
      aliquota: 10.0,
      tipo: 'vendita',
      esigibilita: 'immediata',
      split_payment: false,
      prima_nota_id: 'pn-1',
      causale_codice: 'A10',
      causale_descrizione: 'IVA 10%'
    },
    {
      id: 'row-1',
      data: '2026-06-01',
      data_documento: '2026-05-28',
      numero_documento: 'FT-100',
      soggetto_denominazione: 'Mario Rossi',
      soggetto_piva: '12345678901',
      imponibile: 500.0,
      iva: 110.0,
      aliquota: 22.0,
      tipo: 'vendita',
      esigibilita: 'immediata',
      split_payment: false,
      prima_nota_id: 'pn-1',
      causale_codice: 'A22',
      causale_descrizione: 'IVA 22%'
    }
  ]

  const result = buildRegistroIvaRowsModel(rawRows)

  // Assertions
  assert.strictEqual(result.rows.length, 2, 'Should preserve both multi-rate VAT lines')
  
  // Checking stable sort order (sorted by id if date and document are identical: row-1 before row-2)
  assert.strictEqual(result.rows[0].id, 'row-1')
  assert.strictEqual(result.rows[1].id, 'row-2')
  
  // Checking dynamic progressive provvisorio
  assert.strictEqual(result.rows[0].progressivoProvvisorio, 1)
  assert.strictEqual(result.rows[1].progressivoProvvisorio, 2)
  
  // Checking total computations
  assert.strictEqual(result.totaleImponibile, 600.0)
  assert.strictEqual(result.totaleIva, 120.0)
  
  // Checking aliquota breakdown list
  assert.strictEqual(result.riepilogo.length, 2)
  const rip10 = result.riepilogo.find(r => r.aliquota === 10)
  const rip22 = result.riepilogo.find(r => r.aliquota === 22)
  assert.ok(rip10)
  assert.ok(rip22)
  assert.strictEqual(rip10.imponibile, 100.0)
  assert.strictEqual(rip22.imponibile, 500.0)
})

test('VAT Register Model Builder - Split payment and esigibilita attributes are preserved', () => {
  const rawRows = [
    {
      id: 'row-split',
      data: '2026-06-02',
      imponibile: 200.0,
      iva: 44.0,
      aliquota: 22.0,
      tipo: 'vendita',
      esigibilita: 'differita',
      split_payment: true,
      prima_nota_id: 'pn-2'
    }
  ]

  const result = buildRegistroIvaRowsModel(rawRows)

  assert.strictEqual(result.rows[0].split_payment, true)
  assert.strictEqual(result.rows[0].esigibilita, 'differita')
})

test('VAT Register Model Builder - Large volume row processing (no 100 limit)', () => {
  const largeRows = []
  for (let i = 0; i < 250; i++) {
    largeRows.push({
      id: `row-${i}`,
      data: '2026-06-03',
      imponibile: 10.0,
      iva: 2.2,
      aliquota: 22.0,
      tipo: 'acquisto',
      iva_detraibile: 2.2,
      iva_indetraibile: 0.0
    })
  }

  const result = buildRegistroIvaRowsModel(largeRows)
  assert.strictEqual(result.rows.length, 250, 'Should load all entries exceeding the legacy 100 limit')
})

test('Libro Giornale Model Builder - Sorts correctly and outputs balanced structures', () => {
  const rawEntries = [
    {
      id: 'pn-2',
      numero_registrazione: 2,
      data_registrazione: '2026-06-02',
      totale_dare: 100,
      totale_avere: 100,
      righe: [
        { id: 'r-3', riga_numero: 1, conto_codice: 'C1', importo_dare: 100, importo_avere: 0 },
        { id: 'r-4', riga_numero: 2, conto_codice: 'C2', importo_dare: 0, importo_avere: 100 }
      ]
    },
    {
      id: 'pn-1',
      numero_registrazione: 1,
      data_registrazione: '2026-06-01',
      totale_dare: 50,
      totale_avere: 50,
      righe: [
        { id: 'r-1', riga_numero: 1, conto_codice: 'C1', importo_dare: 50, importo_avere: 0 },
        { id: 'r-2', riga_numero: 2, conto_codice: 'C3', importo_dare: 0, importo_avere: 50 }
      ]
    }
  ]

  const result = buildLibroGiornaleModel(rawEntries)

  assert.strictEqual(result.entries.length, 2)
  // Sorted chronologically by registration number
  assert.strictEqual(result.entries[0].id, 'pn-1')
  assert.strictEqual(result.entries[1].id, 'pn-2')
  
  // Progressives checks
  assert.strictEqual(result.entries[0].progressivoProvvisorio, 1)
  assert.strictEqual(result.entries[1].progressivoProvvisorio, 2)

  // Sum check
  assert.strictEqual(result.totaleDare, 150)
  assert.strictEqual(result.totaleAvere, 150)
  assert.strictEqual(result.righeCount, 4)
})

test('VAT Register Model Builder - Handles empty input list gracefully', () => {
  const result = buildRegistroIvaRowsModel([])
  assert.strictEqual(result.rows.length, 0)
  assert.strictEqual(result.totaleImponibile, 0)
  assert.strictEqual(result.totaleIva, 0)
  assert.strictEqual(result.riepilogo.length, 0)
})

test('Libro Giornale Model Builder - Handles empty input list gracefully', () => {
  const result = buildLibroGiornaleModel([])
  assert.strictEqual(result.entries.length, 0)
  assert.strictEqual(result.totaleDare, 0)
  assert.strictEqual(result.totaleAvere, 0)
})

test('generateStampeHandler - Valid payload returns 200 and html', async () => {
  const body = {
    tipo: 'registro_iva',
    societa: { id: 'soc-1', denominazione: 'Test Co' },
    dati: { registroTipo: 'acquisti', movimenti: [
      { protocollo: 1, imponibile: 100, imposta: 22 }
    ] },
    periodo: 'Dal 01/01 al 31/12'
  }
  const res = await generateStampeHandler({ body })
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.json.success, true)
  assert.ok(res.json.html.includes('Test Co'))
})

test('generateStampeHandler - Empty dataset returns 200 empty page', async () => {
  const body = {
    tipo: 'registro_iva',
    societa: { id: 'soc-1', denominazione: 'Test Co' },
    dati: { registroTipo: 'acquisti', movimenti: [] },
    periodo: 'Dal 01/01 al 31/12'
  }
  const res = await generateStampeHandler({ body })
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.json.success, true)
  assert.ok(res.json.html.includes('Nessuna riga trovata'))
})

test('generateStampeHandler - Incomplete payload returns 400', async () => {
  const body = {
    tipo: 'registro_iva',
    societa: { id: 'soc-1' }
  }
  const res = await generateStampeHandler({ body })
  assert.strictEqual(res.status, 400)
  assert.ok(res.json.error.includes('mancanti'))
})

test('generateStampeHandler - Invalid tipo returns 400', async () => {
  const body = {
    tipo: 'non_esistente',
    societa: { id: 'soc-1' },
    dati: {}
  }
  const res = await generateStampeHandler({ body })
  assert.strictEqual(res.status, 400)
  assert.ok(res.json.error.includes('non valido'))
})
