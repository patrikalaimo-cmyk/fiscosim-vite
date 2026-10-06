import test from 'node:test'
import assert from 'node:assert/strict'
import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { mapRegistrazioneManualeToCanonical } from '../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js'
import { aggregateRegistriIvaRows } from '../src/modules/contabilita/application/liquidazioneIvaClient.js'
import { buildRegistrazioneIvaDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneIvaDraft.js'
import { buildRegistrazioneIvaRows } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneIvaRows.js'
import { buildRegistrazionePartitarioDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazionePartitarioDraft.js'
import {
  calculateIvaPerCassaReleaseRatio,
  sumAlreadyReleasedVatRows,
  capIvaPerCassaReleaseAmounts,
  buildIvaPerCassaReleaseRows
} from '../src/modules/contabilita/application/registrazioneOperations/ivaPerCassaRelease.js'

// Simple DB mock client supporting filters
class MockDbQuery {
  constructor(table, client) {
    this.table = table
    this.client = client
    this.filters = {}
    this.insertedData = null
  }

  insert(data) {
    this.insertedData = data
    this.client.log.push({ action: 'insert', table: this.table, data })
    return this
  }

  delete() {
    this.client.log.push({ action: 'delete', table: this.table })
    return this
  }

  update(data) {
    this.client.log.push({ action: 'update', table: this.table, data })
    return this
  }

  eq(field, value) {
    this.filters[field] = value
    this.client.log.push({ action: 'eq', table: this.table, field, value })
    return this
  }

  like(field, value) {
    this.filters[field] = value
    this.client.log.push({ action: 'like', table: this.table, field, value })
    return this
  }

  select(fields = '*') {
    this.client.log.push({ action: 'select', table: this.table, fields })
    return this
  }

  maybeSingle() {
    return Promise.resolve(this.client.resolveSingle(this.table, this.filters))
  }

  single() {
    return Promise.resolve(this.client.resolveSingle(this.table, this.filters))
  }

  then(resolve, reject) {
    const isDelete = this.client.log.some(l => l.table === this.table && l.action === 'delete')
    if (isDelete) {
      resolve({ data: [], error: null })
      return
    }
    const data = this.client.resolveMultiple(this.table, this.filters)
    resolve(data)
  }
}

class MockDbClient {
  constructor() {
    this.log = []
    this.tables = {
      partitario: [],
      registri_iva: [],
    }
  }

  from(table) {
    return new MockDbQuery(table, this)
  }

  resolveSingle(table, filters) {
    const rows = this.tables[table] || []
    const found = rows.find(r => {
      for (const [k, v] of Object.entries(filters)) {
        if (r[k] !== v) return false
      }
      return true
    })
    if (found) {
      return { data: found, error: null }
    }
    return { data: { id: `${table}-new-id` }, error: null }
  }

  resolveMultiple(table, filters) {
    const rows = this.tables[table] || []
    const filtered = rows.filter(r => {
      for (const [k, v] of Object.entries(filters)) {
        if (r[k] !== v) return false
      }
      return true
    })
    return { data: filtered, error: null }
  }
}

// Helper to construct UI draft representing payment/incasso
function buildUiPaymentDraft(causaleConfig, selectedPartitaId, importoChiusura) {
  return {
    isSimulata: false,
    header: {
      societaId: 'soc-123',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-05',
      dataDocumento: '2026-06-05',
      numeroDocumento: 'PAG-TEST-1',
      causaleContabile: causaleConfig,
      descrizioneGenerale: 'Registrazione pagamento/incasso',
      soggetto: 'Controparte Spa',
      clienteFornitoreId: 'acc-controparte',
      clienteFornitoreNome: 'Controparte Spa',
      clienteFornitoreCodice: 'CTRSPA80A01H501U',
      clienteFornitoreTipo: causaleConfig.registroIva === 'acquisti' ? 'fornitore' : 'cliente',
    },
    pnPayload: {
      societa_id: 'soc-123',
      esercizio: 2026,
      data_registrazione: '2026-06-05',
      data_documento: '2026-06-05',
      numero_documento: 'PAG-TEST-1',
      causale_id: causaleConfig.id,
      causale_codice: causaleConfig.codice,
      descrizione: 'Registrazione pagamento/incasso',
      cliente_fornitore_id: 'acc-controparte',
      cliente_fornitore_nome: 'Controparte Spa',
      totale_dare: Math.abs(importoChiusura),
      totale_avere: Math.abs(importoChiusura),
      stato: 'confermata',
    },
    rows: [
      { id: 'row-1', conto_id: 'acc-controparte', conto_codice: '450101', conto_descrizione: 'Debiti/Crediti', dare: causaleConfig.registroIva === 'acquisti' ? Math.abs(importoChiusura) : 0, avere: causaleConfig.registroIva === 'acquisti' ? 0 : Math.abs(importoChiusura) },
      { id: 'row-2', conto_id: 'acc-banca', conto_codice: '101001', conto_descrizione: 'Banca C/C', dare: causaleConfig.registroIva === 'acquisti' ? 0 : Math.abs(importoChiusura), avere: causaleConfig.registroIva === 'acquisti' ? Math.abs(importoChiusura) : 0 }
    ],
    validation: {
      status: 'ok',
      isBalanced: true,
      totals: { differenza: 0, totaleDare: Math.abs(importoChiusura), totaleAvere: Math.abs(importoChiusura) },
      blockers: [],
      warnings: [],
    },
    readiness: {
      status: 'pronto'
    },
    totals: {
      totaleDare: Math.abs(importoChiusura),
      totaleAvere: Math.abs(importoChiusura),
      differenza: 0,
      isBalanced: true
    },
    meta: {
      operatorId: 'op-123',
      createdAt: '2026-06-05T12:00:00Z',
      behavior: {
        code: causaleConfig.codice,
        family: 'chiusurapartite',
        showDocumentPanel: false,
        showIvaPanel: false,
        showPartitario: true,
        showRitenute: false
      }
    },
    partitarioDraft: {
      active: true,
      mode: 'chiusura',
      selectedPartitaId: selectedPartitaId,
      selectedPartitaIds: [selectedPartitaId],
      importoChiusura: Math.abs(importoChiusura),
      rows: [
        {
          id: selectedPartitaId,
          soggettoId: 'acc-controparte',
          soggettoNome: 'Controparte Spa',
          soggettoTipo: causaleConfig.registroIva === 'acquisti' ? 'fornitore' : 'cliente',
          numeroDocumento: 'FT-ORIG-1',
          dataDocumento: '2026-06-05',
          importoOriginario: Math.abs(importoChiusura),
          importoChiusura: Math.abs(importoChiusura),
          selected: true
        }
      ]
    }
  }
}

// -------------------------------------------------------------
// TEST CASES
// -------------------------------------------------------------

test('1. Calcolo ratio proporzionale e capping pure functions', () => {
  // calculateIvaPerCassaReleaseRatio
  assert.equal(calculateIvaPerCassaReleaseRatio(50, 100), 0.5)
  assert.equal(calculateIvaPerCassaReleaseRatio(100, 100), 1)
  assert.equal(calculateIvaPerCassaReleaseRatio(100.001, 100), 1)
  assert.equal(calculateIvaPerCassaReleaseRatio(0, 100), 0)

  // sumAlreadyReleasedVatRows
  const released = [
    { imponibile: 10, iva: 2, iva_detraibile: 2, iva_indetraibile: 0 },
    { imponibile: 20, iva: 4, iva_detraibile: 3, iva_indetraibile: 1 }
  ]
  const sum = sumAlreadyReleasedVatRows(released)
  assert.deepEqual(sum, { imponibile: 30, iva: 6, iva_detraibile: 5, iva_indetraibile: 1 })

  // capIvaPerCassaReleaseAmounts
  const original = { imponibile: 100, iva: 22, iva_detraibile: 20, iva_indetraibile: 2 }
  const alreadyReleased = { imponibile: 30, iva: 6, iva_detraibile: 5, iva_indetraibile: 1 }
  
  // parziale (50%)
  const partialResult = capIvaPerCassaReleaseAmounts(original, alreadyReleased, 0.5, false)
  assert.deepEqual(partialResult, { imponibile: 50, iva: 11, iva_detraibile: 10, iva_indetraibile: 1 })

  // finale
  const finalResult = capIvaPerCassaReleaseAmounts(original, alreadyReleased, 0.5, true)
  assert.deepEqual(finalResult, { imponibile: 70, iva: 16, iva_detraibile: 15, iva_indetraibile: 1 })
})

test('2. Pagamento totale su partita IVA per cassa rilascia il 100% dell IVA differita', async () => {
  const db = new MockDbClient()
  
  // Setup original partita
  db.tables.partitario.push({
    id: 'partita-cassa-1',
    societa_id: 'soc-123',
    tipo: 'cliente',
    conto_id: 'acc-controparte',
    prima_nota_id: 'pn-invoice-1',
    numero_documento: 'FT-ORIG-1',
    data_documento: '2026-06-05',
    importo_originale: 122.00,
    importo_pagato: 0,
    importo_residuo: 122.00,
    stato: 'aperta',
    iva_per_cassa: true
  })

  // Setup original deferred VAT rows
  db.tables.registri_iva.push({
    id: 'vat-row-orig-1',
    prima_nota_id: 'pn-invoice-1',
    esigibilita: 'differita',
    imponibile: 100.00,
    iva: 22.00,
    iva_detraibile: 22.00,
    iva_indetraibile: 0.00,
    aliquota: 22,
    tipo: 'vendita',
    origin_registro_iva_id: null,
    societa_id: 'soc-123'
  })

  const causaleIC = {
    id: 'caus-ic',
    codice: 'IC',
    tipoCausale: 'chiusurapartite',
    registroIva: 'vendite',
    gestionePartite: 'chiude',
    descrizione: 'Incasso Cliente'
  }

  const draft = buildUiPaymentDraft(causaleIC, 'partita-cassa-1', 122.00)

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInsert)
  const rows = Array.isArray(ivaInsert.data) ? ivaInsert.data : [ivaInsert.data]
  assert.equal(rows.length, 1)
  assert.equal(rows[0].esigibilita, 'rilascio')
  assert.equal(rows[0].origin_registro_iva_id, 'vat-row-orig-1')
  assert.equal(rows[0].imponibile, 100.00)
  assert.equal(rows[0].iva, 22.00)
})

test('3. Pagamento parziale genera rilascio proporzionale', async () => {
  const db = new MockDbClient()
  
  db.tables.partitario.push({
    id: 'partita-cassa-2',
    societa_id: 'soc-123',
    tipo: 'cliente',
    conto_id: 'acc-controparte',
    prima_nota_id: 'pn-invoice-2',
    numero_documento: 'FT-ORIG-2',
    data_documento: '2026-06-05',
    importo_originale: 122.00,
    importo_pagato: 0,
    importo_residuo: 122.00,
    stato: 'aperta',
    iva_per_cassa: true
  })

  db.tables.registri_iva.push({
    id: 'vat-row-orig-2',
    prima_nota_id: 'pn-invoice-2',
    esigibilita: 'differita',
    imponibile: 100.00,
    iva: 22.00,
    iva_detraibile: 22.00,
    iva_indetraibile: 0.00,
    aliquota: 22,
    tipo: 'vendita',
    origin_registro_iva_id: null,
    societa_id: 'soc-123'
  })

  const causaleIC = {
    id: 'caus-ic',
    codice: 'IC',
    tipoCausale: 'chiusurapartite',
    registroIva: 'vendite',
    gestionePartite: 'chiude',
    descrizione: 'Incasso Cliente'
  }

  const draft = buildUiPaymentDraft(causaleIC, 'partita-cassa-2', 61.00) // 50%

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInsert)
  const rows = Array.isArray(ivaInsert.data) ? ivaInsert.data : [ivaInsert.data]
  assert.equal(rows.length, 1)
  assert.equal(rows[0].esigibilita, 'rilascio')
  assert.equal(rows[0].imponibile, 50.00)
  assert.equal(rows[0].iva, 11.00)
})

test('4. Secondo pagamento parziale rilascia il residuo e cappa per arrotondamento', async () => {
  const db = new MockDbClient()
  
  db.tables.partitario.push({
    id: 'partita-cassa-3',
    societa_id: 'soc-123',
    tipo: 'cliente',
    conto_id: 'acc-controparte',
    prima_nota_id: 'pn-invoice-3',
    numero_documento: 'FT-ORIG-3',
    data_documento: '2026-06-05',
    importo_originale: 122.00,
    importo_pagato: 61.00, // 50% gia pagato
    importo_residuo: 61.00,
    stato: 'aperta',
    iva_per_cassa: true
  })

  db.tables.registri_iva.push({
    id: 'vat-row-orig-3',
    prima_nota_id: 'pn-invoice-3',
    esigibilita: 'differita',
    imponibile: 100.00,
    iva: 22.00,
    iva_detraibile: 22.00,
    iva_indetraibile: 0.00,
    aliquota: 22,
    tipo: 'vendita',
    origin_registro_iva_id: null,
    societa_id: 'soc-123'
  })

  // Setup already released row (e.g. 50% with rounding difference: released 50.01 instead of 50)
  db.tables.registri_iva.push({
    id: 'vat-row-released-3',
    prima_nota_id: 'pn-payment-1',
    esigibilita: 'rilascio',
    imponibile: 50.01,
    iva: 11.01,
    iva_detraibile: 11.01,
    iva_indetraibile: 0.00,
    aliquota: 22,
    tipo: 'vendita',
    origin_registro_iva_id: 'vat-row-orig-3',
    societa_id: 'soc-123'
  })

  const causaleIC = {
    id: 'caus-ic',
    codice: 'IC',
    tipoCausale: 'chiusurapartite',
    registroIva: 'vendite',
    gestionePartite: 'chiude',
    descrizione: 'Incasso Cliente'
  }

  // Second payment closing the remaining 61.00 (residuo becomes 0)
  const draft = buildUiPaymentDraft(causaleIC, 'partita-cassa-3', 61.00)

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInsert)
  const rows = Array.isArray(ivaInsert.data) ? ivaInsert.data : [ivaInsert.data]
  assert.equal(rows.length, 1)
  assert.equal(rows[0].esigibilita, 'rilascio')
  // Should release exactly original (100, 22) minus already released (50.01, 11.01) -> (49.99, 10.99)
  assert.equal(rows[0].imponibile, 49.99)
  assert.equal(rows[0].iva, 10.99)
})

test('5. Anti doppio rilascio: se gia rilasciata tutta non rilascia piu nulla', async () => {
  const db = new MockDbClient()
  
  db.tables.partitario.push({
    id: 'partita-cassa-4',
    societa_id: 'soc-123',
    tipo: 'cliente',
    conto_id: 'acc-controparte',
    prima_nota_id: 'pn-invoice-4',
    numero_documento: 'FT-ORIG-4',
    data_documento: '2026-06-05',
    importo_originale: 122.00,
    importo_pagato: 100.00,
    importo_residuo: 22.00,
    stato: 'aperta',
    iva_per_cassa: true
  })

  db.tables.registri_iva.push({
    id: 'vat-row-orig-4',
    prima_nota_id: 'pn-invoice-4',
    esigibilita: 'differita',
    imponibile: 100.00,
    iva: 22.00,
    iva_detraibile: 22.00,
    iva_indetraibile: 0.00,
    aliquota: 22,
    tipo: 'vendita',
    origin_registro_iva_id: null,
    societa_id: 'soc-123'
  })

  // Already released 100% of VAT in previous payments
  db.tables.registri_iva.push({
    id: 'vat-row-released-4',
    prima_nota_id: 'pn-payment-1',
    esigibilita: 'rilascio',
    imponibile: 100.00,
    iva: 22.00,
    iva_detraibile: 22.00,
    iva_indetraibile: 0.00,
    aliquota: 22,
    tipo: 'vendita',
    origin_registro_iva_id: 'vat-row-orig-4',
    societa_id: 'soc-123'
  })

  const causaleIC = {
    id: 'caus-ic',
    codice: 'IC',
    tipoCausale: 'chiusurapartite',
    registroIva: 'vendite',
    gestionePartite: 'chiude',
    descrizione: 'Incasso Cliente'
  }

  const draft = buildUiPaymentDraft(causaleIC, 'partita-cassa-4', 22.00)

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  // No registers IVA row inserted because no unreleased VAT remains
  assert.equal(ivaInsert, undefined)
})

test('6. Multi-aliquota rilascia proporzionalmente ciascuna riga originaria', async () => {
  const db = new MockDbClient()
  
  db.tables.partitario.push({
    id: 'partita-cassa-5',
    societa_id: 'soc-123',
    tipo: 'cliente',
    conto_id: 'acc-controparte',
    prima_nota_id: 'pn-invoice-5',
    numero_documento: 'FT-ORIG-5',
    data_documento: '2026-06-05',
    importo_originale: 244.00,
    importo_pagato: 0,
    importo_residuo: 244.00,
    stato: 'aperta',
    iva_per_cassa: true
  })

  // Two deferred VAT rows (e.g. multi-aliquota)
  db.tables.registri_iva.push({
    id: 'vat-row-orig-5-a',
    prima_nota_id: 'pn-invoice-5',
    esigibilita: 'differita',
    imponibile: 100.00,
    iva: 22.00,
    iva_detraibile: 22.00,
    iva_indetraibile: 0.00,
    aliquota: 22,
    tipo: 'vendita',
    origin_registro_iva_id: null,
    societa_id: 'soc-123'
  })

  db.tables.registri_iva.push({
    id: 'vat-row-orig-5-b',
    prima_nota_id: 'pn-invoice-5',
    esigibilita: 'differita',
    imponibile: 100.00,
    iva: 22.00,
    iva_detraibile: 22.00,
    iva_indetraibile: 0.00,
    aliquota: 22,
    tipo: 'vendita',
    origin_registro_iva_id: null,
    societa_id: 'soc-123'
  })

  const causaleIC = {
    id: 'caus-ic',
    codice: 'IC',
    tipoCausale: 'chiusurapartite',
    registroIva: 'vendite',
    gestionePartite: 'chiude',
    descrizione: 'Incasso Cliente'
  }

  const draft = buildUiPaymentDraft(causaleIC, 'partita-cassa-5', 122.00) // 50% payment

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInsert)
  const rows = Array.isArray(ivaInsert.data) ? ivaInsert.data : [ivaInsert.data]
  assert.equal(rows.length, 2)
  assert.equal(rows[0].origin_registro_iva_id, 'vat-row-orig-5-a')
  assert.equal(rows[0].imponibile, 50.00)
  assert.equal(rows[0].iva, 11.00)
  assert.equal(rows[1].origin_registro_iva_id, 'vat-row-orig-5-b')
  assert.equal(rows[1].imponibile, 50.00)
  assert.equal(rows[1].iva, 11.00)
})

test('7. Partita ordinaria (iva_per_cassa = false) non genera alcun rilascio', async () => {
  const db = new MockDbClient()
  
  db.tables.partitario.push({
    id: 'partita-ordinaria-1',
    societa_id: 'soc-123',
    tipo: 'cliente',
    conto_id: 'acc-controparte',
    prima_nota_id: 'pn-invoice-6',
    numero_documento: 'FT-ORIG-6',
    data_documento: '2026-06-05',
    importo_originale: 122.00,
    importo_pagato: 0,
    importo_residuo: 122.00,
    stato: 'aperta',
    iva_per_cassa: false
  })

  db.tables.registri_iva.push({
    id: 'vat-row-orig-6',
    prima_nota_id: 'pn-invoice-6',
    esigibilita: 'immediata', // ordinary
    imponibile: 100.00,
    iva: 22.00,
    iva_detraibile: 22.00,
    iva_indetraibile: 0.00,
    aliquota: 22,
    tipo: 'vendita',
    origin_registro_iva_id: null,
    societa_id: 'soc-123'
  })

  const causaleIC = {
    id: 'caus-ic',
    codice: 'IC',
    tipoCausale: 'chiusurapartite',
    registroIva: 'vendite',
    gestionePartite: 'chiude',
    descrizione: 'Incasso Cliente'
  }

  const draft = buildUiPaymentDraft(causaleIC, 'partita-ordinaria-1', 122.00)

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.equal(ivaInsert, undefined) // no rows generated
})

test('8. Liquidazione include rilascio ed esclude differita', () => {
  const rows = [
    { tipo: 'vendita', iva: 22.00, esigibilita: 'rilascio' },
    { tipo: 'acquisto', iva_detraibile: 10.00, esigibilita: 'rilascio' },
    { tipo: 'vendita', iva: 44.00, esigibilita: 'differita' }, // excluded
    { tipo: 'acquisto', iva_detraibile: 20.00, esigibilita: 'differita' } // excluded
  ]
  const agg = aggregateRegistriIvaRows(rows)
  assert.equal(agg.iva_debito, 22.00)
  assert.equal(agg.iva_credito, 10.00)
  assert.equal(agg.saldo, 12.00)
  assert.equal(agg.righe_considerate, 2)
})

test('9. Regressione IVA ordinaria ed inserimento partitario standard invariati', async () => {
  const db = new MockDbClient()
  const causaleOrdinaria = {
    id: 'caus-ff-ord',
    codice: 'FF',
    tipoCausale: 'docivanormale',
    registroIva: 'acquisti',
    segnoRegistroIva: '+',
    gestionePartite: 'apre',
    descrizione: 'Fattura Acquisto Ordinaria',
    ivaPerCassa: false
  }

  const draft = {
    isSimulata: false,
    header: {
      societaId: 'soc-123',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-05',
      dataDocumento: '2026-06-05',
      numeroDocumento: 'FT-TEST-REGRESSION',
      causaleContabile: causaleOrdinaria,
      descrizioneGenerale: 'Test regression',
      soggetto: 'Controparte Spa',
      clienteFornitoreId: 'acc-controparte',
      clienteFornitoreNome: 'Controparte Spa',
      clienteFornitoreCodice: 'CTRSPA80A01H501U',
      clienteFornitoreTipo: 'fornitore',
    },
    pnPayload: {
      societa_id: 'soc-123',
      esercizio: 2026,
      data_registrazione: '2026-06-05',
      data_documento: '2026-06-05',
      numero_documento: 'FT-TEST-REGRESSION',
      causale_id: 'caus-ff-ord',
      causale_codice: 'FF',
      descrizione: 'Test regression',
      cliente_fornitore_id: 'acc-controparte',
      cliente_fornitore_nome: 'Controparte Spa',
      totale_dare: 122.00,
      totale_avere: 122.00,
      stato: 'confermata',
    },
    rows: [
      { id: 'row-1', conto_id: 'acc-costo-ricavo', dare: 100.00, avere: 0 },
      { id: 'row-2', conto_id: 'acc-iva', dare: 22.00, avere: 0 },
      { id: 'row-3', conto_id: 'acc-controparte', dare: 0, avere: 122.00 }
    ],
    validation: {
      status: 'ok',
      isBalanced: true,
      totals: { differenza: 0, totaleDare: 122.00, totaleAvere: 122.00 },
      blockers: [],
      warnings: [],
    },
    readiness: {
      status: 'pronto'
    },
    totals: {
      totaleDare: 122.00,
      totaleAvere: 122.00,
      differenza: 0,
      isBalanced: true
    },
    meta: {
      operatorId: 'op-123',
      createdAt: '2026-06-05T12:00:00Z',
      behavior: {
        code: 'FF',
        family: 'docivanormale',
        showDocumentPanel: true,
        showIvaPanel: true,
        showPartitario: true,
        showRitenute: false
      }
    },
    ivaDraft: {
      active: true,
      registroIva: 'acquisti',
      rows: [
        { riga: 1, aliquota: 22, imponibile: 100.00, imposta: 22.00, causaleIvaId: '22' }
      ]
    },
    partitarioDraft: {
      active: true,
      mode: 'apertura',
      rows: [
        {
          riga: 1,
          soggettoId: 'acc-controparte',
          soggettoNome: 'Controparte Spa',
          soggettoTipo: 'fornitore',
          numeroDocumento: 'FT-TEST-REGRESSION',
          dataDocumento: '2026-06-05',
          importoOriginario: 122.00,
          importoAperto: 122.00
        }
      ]
    }
  }

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInsert)
  const ivaRow = Array.isArray(ivaInsert.data) ? ivaInsert.data[0] : ivaInsert.data
  assert.equal(ivaRow.esigibilita, 'immediata')
  assert.equal(ivaRow.origin_registro_iva_id, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert)
  const partRow = Array.isArray(partInsert.data) ? partInsert.data[0] : partInsert.data
  assert.equal(partRow.iva_per_cassa, false)
})
