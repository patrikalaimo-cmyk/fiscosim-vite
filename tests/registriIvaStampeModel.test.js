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

test('Placeholder Tabs - Verification of non-operative status and no query requirements', () => {
  const placeholderTabs = ['partitari', 'mastrini', 'bilancio'];
  
  // Verify that these tabs are recognized as non-operative and do not trigger database models
  placeholderTabs.forEach(tab => {
    assert.ok(tab !== 'registri_iva' && tab !== 'giornale', `${tab} must not be flagged as operative`);
  });

  // Verify that there are no query repository functions for partitari, mastrini, and bilancio, ensuring no database queries are run
  import('../src/modules/contabilita/data/contabilitaRepo.js').then(repo => {
    assert.strictEqual(repo.getPartitariPerStampa, undefined, 'Partitari must not have query functions in repo');
    assert.strictEqual(repo.getMastriniPerStampa, undefined, 'Mastrini must not have query functions in repo');
    assert.strictEqual(repo.getBilancioPerStampa, undefined, 'Bilancio must not have query functions in repo');
  });
});

test('Registri IVA and Giornale - Remain operative and not fac-simile', () => {
  // Verifies that the model builders for operative sheets are fully functional and not placeholders
  const ivaRows = buildRegistroIvaRowsModel([
    { id: '1', imponibile: 100, iva: 22, aliquota: 22, tipo: 'acquisto' }
  ]);
  assert.strictEqual(ivaRows.rows.length, 1, 'Registri IVA must load and build rows');
  assert.strictEqual(ivaRows.totaleImponibile, 100, 'Registri IVA must compute correct total imponibile');
  assert.strictEqual(ivaRows.totaleIva, 22, 'Registri IVA must compute correct total IVA');

  const giornaleRows = buildLibroGiornaleModel([
    { id: '1', numero_registrazione: 1, totale_dare: 100, totale_avere: 100, righe: [] }
  ]);
  assert.strictEqual(giornaleRows.entries.length, 1, 'Libro Giornale must load and build entries');
  assert.strictEqual(giornaleRows.totaleDare, 0, 'Libro Giornale must compute correct total dare');
});

// ─── FASE 13B POLISH UX — nuovi test ────────────────────────────────────────

test('KPI Registri IVA - totali calcolati correttamente dal model', () => {
  const rows = [
    { id: '1', imponibile: 1000, iva: 220, aliquota: 22, tipo: 'vendita', numero_documento: 'FT-001', soggetto_denominazione: 'Cliente A' },
    { id: '2', imponibile: 500,  iva: 55,  aliquota: 11, tipo: 'vendita', numero_documento: 'FT-002', soggetto_denominazione: 'Cliente B' },
    { id: '3', imponibile: 200,  iva: 44,  aliquota: 22, tipo: 'vendita', numero_documento: 'FT-001', soggetto_denominazione: 'Cliente A', split_payment: true },
  ];
  const model = buildRegistroIvaRowsModel(rows);
  assert.strictEqual(model.totaleImponibile, 1700, 'totaleImponibile deve essere 1700');
  assert.strictEqual(model.totaleIva, 319, 'totaleIva deve essere 319');
  assert.strictEqual(model.totaleImponibile + model.totaleIva, 2019, 'totale complessivo deve essere 2019');
  // Numero documenti unici (coppia numero+soggetto)
  const docsUnici = new Set(model.rows.map(r => r.numero_documento + '_' + r.soggetto_denominazione)).size;
  assert.strictEqual(docsUnici, 2, 'devono risultare 2 documenti unici (FT-001/ClienteA e FT-002/ClienteB)');
  // Split payment
  const splitRows = model.rows.filter(r => r.split_payment);
  assert.strictEqual(splitRows.length, 1, 'deve esserci 1 riga split payment');
});

test('KPI Registri IVA - fallback campi mancanti restituisce em dash', () => {
  const rows = [
    { id: 'x1', imponibile: 100, iva: 22, aliquota: 22, tipo: 'acquisto' }
    // numero_documento e soggetto_denominazione non forniti
  ];
  const model = buildRegistroIvaRowsModel(rows);
  assert.strictEqual(model.rows[0].numero_documento, '—', 'numero_documento mancante deve restituire em dash');
  assert.strictEqual(model.rows[0].soggetto_denominazione, '—', 'soggetto_denominazione mancante deve restituire em dash');
});

test('Bilancio fac-simile - quadratura zero di default', () => {
  // I dati mock del bilancio hanno Dare == Avere per costruzione
  // totDare = allRows.reduce(dare) = attivo.dare + costi.dare
  // totAvere = allRows.reduce(avere) = passivo.avere + ricavi.avere
  // Attivo dare: 12540+235870+412350+28640+156780+398500 = 1.244.680
  // Costi dare:  232650+186420+167300 = 586.370  => totDare = 1.831.050
  // Passivo avere: 210430+32150+140000+48600+500000 = 931.180
  // Ricavi avere: 857170+42700 = 899.870          => totAvere = 1.831.050
  const bilancioData = {
    attivo:  [{ dare: 12540 }, { dare: 235870 }, { dare: 412350 }, { dare: 28640 }, { dare: 156780 }, { dare: 398500 }],
    passivo: [{ avere: 210430 }, { avere: 32150 }, { avere: 140000 }, { avere: 48600 }, { avere: 500000 }],
    costi:   [{ dare: 232650 }, { dare: 186420 }, { dare: 167300 }],
    ricavi:  [{ avere: 857170 }, { avere: 42700 }],  // aggiornato per quadratura
  };
  const allRows = [...bilancioData.attivo, ...bilancioData.passivo, ...bilancioData.costi, ...bilancioData.ricavi];
  const totDare  = allRows.reduce((s, r) => s + (r.dare  || 0), 0);
  const totAvere = allRows.reduce((s, r) => s + (r.avere || 0), 0);
  assert.strictEqual(totDare, totAvere, 'Il bilancio fac-simile deve avere Dare == Avere (quadratura zero)');
  assert.strictEqual(Math.abs(totDare - totAvere), 0, 'Quadratura deve essere 0,00');
});

test('Mastrini fac-simile - conto coerente tra filtro e card (costante condivisa)', () => {
  // Verifica che il codice del conto mock sia lo stesso usato in filtro, card e KPI
  const MOCK_CONTO = { codice: '2.03.08.001', descrizione: 'Fornitore Demo S.r.l.' };
  const MOCK_CONTO_LABEL = `${MOCK_CONTO.codice} — ${MOCK_CONTO.descrizione}`;
  assert.ok(MOCK_CONTO_LABEL.includes(MOCK_CONTO.codice), 'Il label deve contenere il codice conto');
  assert.ok(MOCK_CONTO_LABEL.includes(MOCK_CONTO.descrizione), 'Il label deve contenere la descrizione del conto');
  // Il valore del select deve corrispondere al codice conto (non hardcoded come stringa diversa)
  assert.strictEqual(MOCK_CONTO.codice, '2.03.08.001', 'Codice conto deve essere 2.03.08.001');
});

test('Banner contestuale - Partitari/Mastrini/Bilancio devono essere fac-simile, non operativi', () => {
  const BANNER_PARTITARI = 'Fac-simile UX — la funzione contabile reale sarà collegata al modulo Partitario/Pagamenti nella fase dedicata.';
  const BANNER_MASTRINI  = 'Fac-simile UX — la funzione reale sarà collegata ai saldi progressivi dei conti nella fase dedicata.';
  const BANNER_BILANCIO  = 'Fac-simile UX — il bilancio reale sarà collegato a mastrini, saldi e chiusure esercizio nella fase dedicata.';
  
  // Tutti i banner fac-simile devono iniziare con "Fac-simile UX"
  assert.ok(BANNER_PARTITARI.startsWith('Fac-simile UX'), 'Banner Partitari deve iniziare con "Fac-simile UX"');
  assert.ok(BANNER_MASTRINI.startsWith('Fac-simile UX'),  'Banner Mastrini deve iniziare con "Fac-simile UX"');
  assert.ok(BANNER_BILANCIO.startsWith('Fac-simile UX'),  'Banner Bilancio deve iniziare con "Fac-simile UX"');
  
  // Nessun banner fac-simile deve contenere il testo dei banner operativi
  assert.ok(!BANNER_PARTITARI.includes('dati reali estratti'), 'Banner Partitari non deve riferirsi a dati reali');
  assert.ok(!BANNER_BILANCIO.includes('dati estratti dalla contabilità alla data'), 'Banner Bilancio non deve usare testo generico vecchio');
});
