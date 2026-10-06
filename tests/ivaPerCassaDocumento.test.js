import test from 'node:test'
import assert from 'node:assert/strict'
import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { mapRegistrazioneManualeToCanonical } from '../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js'
import { aggregateRegistriIvaRows } from '../src/modules/contabilita/application/liquidazioneIvaClient.js'
import { buildRegistrazioneIvaDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneIvaDraft.js'
import { buildRegistrazioneIvaRows } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneIvaRows.js'
import { buildRegistrazionePartitarioDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazionePartitarioDraft.js'

// Simple DB mock client matching structural properties
class MockDbQuery {
  constructor(table, client) {
    this.table = table
    this.client = client
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

  eq(field, value) {
    this.client.log.push({ action: 'eq', table: this.table, field, value })
    return this
  }

  like(field, value) {
    this.client.log.push({ action: 'like', table: this.table, field, value })
    return this
  }

  select(fields = '*') {
    this.client.log.push({ action: 'select', table: this.table, fields })
    return this
  }

  single() {
    return Promise.resolve(this.client.resolveSingle(this.table, this.insertedData))
  }

  then(resolve, reject) {
    const isDelete = this.client.log.some(l => l.table === this.table && l.action === 'delete')
    if (isDelete) {
      resolve({ data: [], error: null })
      return
    }
    Promise.resolve(this.client.resolveMultiple(this.table, this.insertedData))
      .then(resolve, reject)
  }
}

class MockDbClient {
  constructor() {
    this.log = []
  }

  from(table) {
    return new MockDbQuery(table, this)
  }

  resolveSingle(table, insertedData) {
    return { data: { id: `${table}-new-id` }, error: null }
  }

  resolveMultiple(table, insertedData) {
    const dataArray = Array.isArray(insertedData) 
      ? insertedData.map((row, idx) => ({ id: `${table}-row-${idx}`, ...row }))
      : [{ id: `${table}-new-id` }]
    return { data: dataArray, error: null }
  }
}

// Helper builder to set up UI draft inputs for testing
function buildUiDraftInput(causaleContabileConfig) {
  return {
    isSimulata: false,
    header: {
      societaId: 'soc-123',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-05',
      dataDocumento: '2026-06-05',
      numeroDocumento: 'FT-TEST-1',
      causaleContabile: causaleContabileConfig,
      descrizioneGenerale: 'Test registration',
      soggetto: 'Controparte Spa',
      clienteFornitoreId: 'acc-controparte',
      clienteFornitoreNome: 'Controparte Spa',
      clienteFornitoreCodice: 'CTRSPA80A01H501U',
      clienteFornitoreTipo: causaleContabileConfig.registroIva === 'acquisti' ? 'fornitore' : 'cliente',
    },
    pnPayload: {
      societa_id: 'soc-123',
      esercizio: 2026,
      data_registrazione: '2026-06-05',
      data_documento: '2026-06-05',
      numero_documento: 'FT-TEST-1',
      causale_id: causaleContabileConfig.id,
      causale_codice: causaleContabileConfig.codice,
      descrizione: 'Test registration',
      cliente_fornitore_id: 'acc-controparte',
      cliente_fornitore_nome: 'Controparte Spa',
      totale_dare: 122.00,
      totale_avere: 122.00,
      stato: 'confermata',
    },
    rows: [
      { id: 'row-1', conto_id: 'acc-costo-ricavo', conto_codice: '501001', conto_descrizione: 'Costo/Ricavo', dare: causaleContabileConfig.registroIva === 'acquisti' ? 100.00 : 0, avere: causaleContabileConfig.registroIva === 'acquisti' ? 0 : 100.00 },
      { id: 'row-2', conto_id: 'acc-iva', conto_codice: '220102', conto_descrizione: 'IVA', dare: causaleContabileConfig.registroIva === 'acquisti' ? 22.00 : 0, avere: causaleContabileConfig.registroIva === 'acquisti' ? 0 : 22.00 },
      { id: 'row-3', conto_id: 'acc-controparte', conto_codice: '450101', conto_descrizione: 'Debiti/Crediti', dare: causaleContabileConfig.registroIva === 'acquisti' ? 0 : 122.00, avere: causaleContabileConfig.registroIva === 'acquisti' ? 122.00 : 0 }
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
        code: causaleContabileConfig.codice,
        family: 'docivanormale',
        showDocumentPanel: true,
        showIvaPanel: true,
        showPartitario: true,
        showRitenute: false
      }
    },
    ivaDraft: {
      active: true,
      registroIva: causaleContabileConfig.registroIva,
      sezionale: '1',
      protocolloProvvisorio: 'PROT-123',
      dataCompetenza: '2026-06-05',
      totaleImponibile: 100.00,
      totaleImposta: 22.00,
      rows: [
        {
          riga: 1,
          aliquota: 22,
          imponibile: 100.00,
          imposta: 22.00,
          causaleIvaId: '22',
          causaleIva: 'Aliquota 22%'
        }
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
          soggettoTipo: causaleContabileConfig.registroIva === 'acquisti' ? 'fornitore' : 'cliente',
          numeroDocumento: 'FT-TEST-1',
          dataDocumento: '2026-06-05',
          dataScadenza: '2026-07-05',
          importoOriginario: 122.00,
          importoAperto: 122.00
        }
      ]
    }
  }
}

// -------------------------------------------------------------
// TEST CASES
// -------------------------------------------------------------

test('1. Documento IVA ordinario genera righe IVA con esigibilita = immediata', async () => {
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

  const rawInput = buildUiDraftInput(causaleOrdinaria)
  
  // Resolve rows using buildRegistrazioneIvaRows to check application-level generation
  const resolvedIvaRows = buildRegistrazioneIvaRows({
    rows: rawInput.ivaDraft.rows,
    documentData: { totaleDocumento: 122.00 },
    causaleContabile: causaleOrdinaria
  })
  assert.equal(resolvedIvaRows.rows[0].esigibilita, 'immediata')

  // Resolve draft using buildRegistrazioneIvaDraft to check draft-level generation
  const resolvedIvaDraft = buildRegistrazioneIvaDraft(
    { header: rawInput.header, documentData: { totaleDocumento: 122.00 }, ivaData: rawInput.ivaDraft },
    { behavior: rawInput.meta.behavior, causaleContabile: causaleOrdinaria }
  )
  assert.equal(resolvedIvaDraft.esigibilita, 'immediata')

  // Mock mapped draft to test persistence
  const draft = buildUiDraftInput(causaleOrdinaria)
  draft.ivaDraft.esigibilita = 'immediata'
  draft.ivaDraft.rows[0].esigibilita = 'immediata'

  // Run mapper
  const { payload } = mapRegistrazioneManualeToCanonical(draft, { validate: false })
  assert.equal(payload.vat.rows[0].esigibilita, 'immediata')

  // Persist to DB and verify DB fields
  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInsert)
  const dbRow = Array.isArray(ivaInsert.data) ? ivaInsert.data[0] : ivaInsert.data
  assert.equal(dbRow.esigibilita, 'immediata')
  assert.equal(dbRow.origin_registro_iva_id, null)
})

test('2. Documento IVA per cassa genera righe IVA con esigibilita = differita e origin_registro_iva_id = null', async () => {
  const db = new MockDbClient()
  const causaleCassa = {
    id: 'caus-ff-cassa',
    codice: 'FFPC',
    tipoCausale: 'docivanormale',
    registroIva: 'acquisti',
    segnoRegistroIva: '+',
    gestionePartite: 'apre',
    descrizione: 'Fattura Acquisto IVA per cassa',
    iva_per_cassa: true // policy matches because of this flag
  }

  const rawInput = buildUiDraftInput(causaleCassa)

  // Check rows generation logic
  const resolvedIvaRows = buildRegistrazioneIvaRows({
    rows: rawInput.ivaDraft.rows,
    documentData: { totaleDocumento: 122.00 },
    causaleContabile: causaleCassa
  })
  assert.equal(resolvedIvaRows.rows[0].esigibilita, 'differita')
  assert.equal(resolvedIvaRows.rows[0].ivaPerCassa, true)

  // Check draft generation logic
  const resolvedIvaDraft = buildRegistrazioneIvaDraft(
    { header: rawInput.header, documentData: { totaleDocumento: 122.00 }, ivaData: rawInput.ivaDraft },
    { behavior: rawInput.meta.behavior, causaleContabile: causaleCassa }
  )
  assert.equal(resolvedIvaDraft.esigibilita, 'differita')
  assert.equal(resolvedIvaDraft.ivaPerCassa, true)

  // Mock mapped draft to test persistence
  const draft = buildUiDraftInput(causaleCassa)
  draft.ivaDraft.esigibilita = 'differita'
  draft.ivaDraft.rows[0].esigibilita = 'differita'
  draft.ivaDraft.rows[0].ivaPerCassa = true

  // Run mapper
  const { payload } = mapRegistrazioneManualeToCanonical(draft, { validate: false })
  assert.equal(payload.vat.rows[0].esigibilita, 'differita')

  // Persist to DB and verify DB fields
  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInsert)
  const dbRow = Array.isArray(ivaInsert.data) ? ivaInsert.data[0] : ivaInsert.data
  assert.equal(dbRow.esigibilita, 'differita')
  assert.equal(dbRow.origin_registro_iva_id, null)
})

test('3. Documento IVA per cassa apre partita con iva_per_cassa = true', async () => {
  const db = new MockDbClient()
  const causaleCassa = {
    id: 'caus-fc-cassa',
    codice: 'FCPC',
    tipoCausale: 'docivanormale',
    registroIva: 'vendite',
    segnoRegistroIva: '+',
    gestionePartite: 'apre',
    descrizione: 'Fattura Vendita IVA per cassa',
    iva_per_cassa: true
  }

  const rawInput = buildUiDraftInput(causaleCassa)

  // Check build partitario draft behavior
  const resolvedPartitario = buildRegistrazionePartitarioDraft({
    header: rawInput.header,
    documentData: { totaleDocumento: 122.00 },
    partitarioDraft: rawInput.partitarioDraft,
  }, {
    selectedCausale: causaleCassa,
    behavior: rawInput.meta.behavior
  })
  assert.equal(resolvedPartitario.iva_per_cassa, true)
  assert.equal(resolvedPartitario.rows[0].iva_per_cassa, true)

  // Mock draft to test persistence
  const draft = buildUiDraftInput(causaleCassa)
  draft.partitarioDraft.iva_per_cassa = true
  draft.partitarioDraft.rows[0].iva_per_cassa = true

  // Persist to DB
  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert)
  const dbRow = Array.isArray(partInsert.data) ? partInsert.data[0] : partInsert.data
  assert.equal(dbRow.iva_per_cassa, true)
})

test('4. Documento IVA ordinario apre partita con iva_per_cassa = false', async () => {
  const db = new MockDbClient()
  const causaleOrdinaria = {
    id: 'caus-fc-ord',
    codice: 'FC',
    tipoCausale: 'docivanormale',
    registroIva: 'vendite',
    segnoRegistroIva: '+',
    gestionePartite: 'apre',
    descrizione: 'Fattura Vendita Ordinaria',
    iva_per_cassa: false
  }

  const rawInput = buildUiDraftInput(causaleOrdinaria)

  // Check build partitario draft behavior
  const resolvedPartitario = buildRegistrazionePartitarioDraft({
    header: rawInput.header,
    documentData: { totaleDocumento: 122.00 },
    partitarioDraft: rawInput.partitarioDraft,
  }, {
    selectedCausale: causaleOrdinaria,
    behavior: rawInput.meta.behavior
  })
  assert.equal(resolvedPartitario.iva_per_cassa, false)
  assert.equal(resolvedPartitario.rows[0].iva_per_cassa, false)

  // Mock draft to test persistence
  const draft = buildUiDraftInput(causaleOrdinaria)
  draft.partitarioDraft.iva_per_cassa = false
  draft.partitarioDraft.rows[0].iva_per_cassa = false

  // Persist to DB
  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert)
  const dbRow = Array.isArray(partInsert.data) ? partInsert.data[0] : partInsert.data
  assert.equal(dbRow.iva_per_cassa, false)
})

test('5. Liquidazione IVA esclude righe differita', () => {
  const rows = [
    { tipo: 'vendita', iva: 22.00, esigibilita: 'differita' },
    { tipo: 'acquisto', iva_detraibile: 10.00, esigibilita: 'differita' }
  ]
  const agg = aggregateRegistriIvaRows(rows)
  assert.equal(agg.iva_debito, 0)
  assert.equal(agg.iva_credito, 0)
  assert.equal(agg.saldo, 0)
  assert.equal(agg.righe_considerate, 0)
})

test('6. Liquidazione IVA include righe immediata', () => {
  const rows = [
    { tipo: 'vendita', iva: 22.00, esigibilita: 'immediata' },
    { tipo: 'acquisto', iva_detraibile: 10.00, esigibilita: 'immediata' }
  ]
  const agg = aggregateRegistriIvaRows(rows)
  assert.equal(agg.iva_debito, 22.00)
  assert.equal(agg.iva_credito, 10.00)
  assert.equal(agg.saldo, 12.00)
  assert.equal(agg.righe_considerate, 2)
})

test('7. Liquidazione IVA include righe rilascio', () => {
  const rows = [
    { tipo: 'vendita', iva: 15.50, esigibilita: 'rilascio' },
    { tipo: 'acquisto', iva_detraibile: 5.00, esigibilita: 'rilascio' }
  ]
  const agg = aggregateRegistriIvaRows(rows)
  assert.equal(agg.iva_debito, 15.50)
  assert.equal(agg.iva_credito, 5.00)
  assert.equal(agg.saldo, 10.50)
  assert.equal(agg.righe_considerate, 2)
})

test('8. Regressione FF/FC/NC/NCF ordinari invariata', async () => {
  const db = new MockDbClient()
  
  // Test NC ordinaria
  const causaleNC = {
    id: 'caus-nc-ord',
    codice: 'NC',
    tipoCausale: 'docivanormale',
    registroIva: 'vendite',
    segnoRegistroIva: '-',
    gestionePartite: 'apre',
    descrizione: 'Nota Credito Ordinaria',
    iva_per_cassa: false
  }

  const draft = buildUiDraftInput(causaleNC)
  draft.ivaDraft.esigibilita = 'immediata'
  draft.ivaDraft.rows[0].esigibilita = 'immediata'
  draft.partitarioDraft.iva_per_cassa = false
  draft.partitarioDraft.rows[0].iva_per_cassa = false

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  
  const ivaRow = Array.isArray(ivaInsert.data) ? ivaInsert.data[0] : ivaInsert.data
  const partRow = Array.isArray(partInsert.data) ? partInsert.data[0] : partInsert.data

  assert.equal(ivaRow.esigibilita, 'immediata')
  assert.equal(partRow.iva_per_cassa, false)
})

test('9. Nessuna logica basata su codice causale (verifica policy arbitrarie)', async () => {
  const db = new MockDbClient()
  
  // Arbitrary causal code "XYZ" but configured with Cash VAT policy settings
  const causaleXYZ = {
    id: 'caus-xyz',
    codice: 'XYZ',
    tipoCausale: 'docivanormale',
    registroIva: 'acquisti',
    segnoRegistroIva: '+',
    gestionePartite: 'apre',
    descrizione: 'Causale con codice arbitrario ma IVA differita',
    conto_iva_esig_differita: 'acc-iva-diff',
    registro_iva_differita: 'acquisti_diff'
  }

  const rawInput = buildUiDraftInput(causaleXYZ)

  // The policy parser buildCausaleContabilePolicy should recognize ivaPerCassa = true
  const resolvedIvaRows = buildRegistrazioneIvaRows({
    rows: rawInput.ivaDraft.rows,
    documentData: { totaleDocumento: 122.00 },
    causaleContabile: causaleXYZ
  })
  assert.equal(resolvedIvaRows.rows[0].esigibilita, 'differita', 'Causale XYZ should resolve to differita because of its settings')

  // Mock draft to test persistence
  const draft = buildUiDraftInput(causaleXYZ)
  draft.ivaDraft.esigibilita = 'differita'
  draft.ivaDraft.rows[0].esigibilita = 'differita'
  draft.partitarioDraft.iva_per_cassa = true
  draft.partitarioDraft.rows[0].iva_per_cassa = true

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')

  const ivaRow = Array.isArray(ivaInsert.data) ? ivaInsert.data[0] : ivaInsert.data
  const partRow = Array.isArray(partInsert.data) ? partInsert.data[0] : partInsert.data

  assert.equal(ivaRow.esigibilita, 'differita')
  assert.equal(partRow.iva_per_cassa, true)
})
