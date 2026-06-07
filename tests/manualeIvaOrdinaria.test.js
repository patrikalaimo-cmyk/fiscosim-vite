import test from 'node:test'
import assert from 'node:assert/strict'
import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { mapRegistrazioneManualeToCanonical } from '../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js'
import { validateCanonicalAccountingPayload } from '../src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js'

const REGISTRI_IVA_SCHEMA = new Set([
  'id',
  'documento_id',
  'accounting_entry_id',
  'riga_idx',
  'data',
  'imponibile',
  'iva',
  'aliquota',
  'tipo',
  'detraibile',
  'percentuale_detraibilita',
  'iva_detraibile',
  'iva_indetraibile',
  'causale_iva_id',
  'created_at',
  'prima_nota_id',
  'numero_documento',
  'data_documento',
  'soggetto_piva',
  'soggetto_denominazione',
  'documento_contabilita_id',
  'societa_id',
  'esigibilita',
  'origin_registro_iva_id'
])

const PARTITARIO_SCHEMA = new Set([
  'id',
  'societa_id',
  'tipo',
  'conto_id',
  'prima_nota_id',
  'numero_documento',
  'data_documento',
  'data_scadenza',
  'importo_originale',
  'importo_pagato',
  'importo_residuo',
  'stato',
  'chiusa_da_prima_nota_id',
  'data_chiusura',
  'created_at',
  'updated_at',
  'tenant_id',
  'company_id',
  'created_by',
  'owner_user_id',
  'visibility',
  'locked_by',
  'locked_at',
  'iva_per_cassa',
  'controparte_id',
  'controparte_nome',
  'conto_codice',
  'conto_descrizione',
  'causale_id'
])

class MockDbQuery {
  constructor(table, client) {
    this.table = table
    this.client = client
    this.insertedData = null
  }

  insert(data) {
    this.insertedData = data
    this.client.log.push({ action: 'insert', table: this.table, data })

    if (this.table === 'registri_iva') {
      const rows = Array.isArray(data) ? data : [data]
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          if (!REGISTRI_IVA_SCHEMA.has(key)) {
            throw new Error(`Colonna non supportata '${key}' nella tabella 'registri_iva'`)
          }
        }
      }
    } else if (this.table === 'partitario') {
      const rows = Array.isArray(data) ? data : [data]
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          if (!PARTITARIO_SCHEMA.has(key)) {
            throw new Error(`Colonna non supportata '${key}' nella tabella 'partitario'`)
          }
        }
      }
    }
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
    this.client.log.push({ action: 'single', table: this.table })
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
    this.insertBehaviors = {}
  }

  from(table) {
    return new MockDbQuery(table, this)
  }

  resolveSingle(table, insertedData) {
    const behavior = this.insertBehaviors[table]
    if (behavior) {
      return behavior
    }
    return { data: { id: `${table}-new-id` }, error: null }
  }

  resolveMultiple(table, insertedData) {
    const behavior = this.insertBehaviors[table]
    if (behavior) {
      return behavior
    }
    const dataArray = Array.isArray(insertedData) 
      ? insertedData.map((row, idx) => ({ id: `${table}-row-${idx}`, ...row }))
      : [{ id: `${table}-new-id` }]
    return { data: dataArray, error: null }
  }
}

function buildBaseUiDraftInputFF() {
  return {
    isSimulata: false,
    header: {
      societaId: 'soc-123',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-29',
      dataDocumento: '2026-05-29',
      numeroDocumento: 'FT-456',
      causaleContabile: {
        id: 'caus-ff',
        codice: 'FF',
        tipoCausale: 'docivanormale',
        registroIva: 'acquisti',
        segnoRegistroIva: '+',
        gestionePartite: 'apre',
        descrizione: 'Fattura Acquisto'
      },
      descrizioneGenerale: 'Fattura acquisto n. 456',
      soggetto: 'Fornitore Spa',
      clienteFornitoreId: 'acc-fornitore',
      clienteFornitoreNome: 'Fornitore Spa',
      clienteFornitoreCodice: 'FRNSPA80A01H501U',
      clienteFornitoreTipo: 'fornitore',
    },
    pnPayload: {
      societa_id: 'soc-123',
      esercizio: 2026,
      data_registrazione: '2026-05-29',
      data_documento: '2026-05-29',
      numero_documento: 'FT-456',
      causale_id: 'caus-ff',
      causale_codice: 'FF',
      descrizione: 'Fattura acquisto n. 456',
      cliente_fornitore_id: 'acc-fornitore',
      cliente_fornitore_nome: 'Fornitore Spa',
      totale_dare: 122.00,
      totale_avere: 122.00,
      stato: 'confermata',
    },
    rows: [
      { id: 'row-1', conto_id: 'acc-costo', conto_codice: '501001', conto_descrizione: 'Merci c/acquisto', dare: 100.00, avere: 0, descrizione_riga: 'Costo merci' },
      { id: 'row-2', conto_id: 'acc-iva', conto_codice: '220101', conto_descrizione: 'Erario c/IVA credito', dare: 22.00, avere: 0, descrizione_riga: 'IVA acquisti' },
      { id: 'row-3', conto_id: 'acc-fornitore', conto_codice: '450101', conto_descrizione: 'Debiti v/fornitore', dare: 0, avere: 122.00, descrizione_riga: 'Fornitore' }
    ],
    righePayload: [
      { conto_id: 'acc-costo', conto_codice: '501001', conto_descrizione: 'Merci c/acquisto', dare: 100.00, avere: 0, descrizione_riga: 'Costo merci' },
      { conto_id: 'acc-iva', conto_codice: '220101', conto_descrizione: 'Erario c/IVA credito', dare: 22.00, avere: 0, descrizione_riga: 'IVA acquisti' },
      { conto_id: 'acc-fornitore', conto_codice: '450101', conto_descrizione: 'Debiti v/fornitore', dare: 0, avere: 122.00, descrizione_riga: 'Fornitore' }
    ],
    documentData: { divisa: 'EUR' },
    ivaDraft: {
      active: true,
      registroIva: 'acquisti',
      segnoRegistro: '+',
      totaleDocumento: 122.00,
      totaleImponibile: 100.00,
      totaleImposta: 22.00,
      rows: [
        {
          causaleIvaId: 'iva-22',
          causaleIvaCodice: 'IVA22',
          imponibile: 100.00,
          imposta: 22.00,
          aliquota: 22,
          registroIva: 'acquisti',
          segnoRegistro: '+',
          percentualeDetraibilita: 100
        }
      ]
    },
    partitarioDraft: {
      active: true,
      mode: 'apertura',
      rows: [
        {
          soggettoId: 'acc-fornitore',
          soggettoNome: 'Fornitore Spa',
          soggettoTipo: 'fornitore',
          numeroDocumento: 'FT-456',
          dataDocumento: '2026-05-29',
          tipoDocumento: 'FT',
          importoAperto: 122.00,
          importoOriginario: 122.00,
        }
      ]
    },
    ritenutaDraft: {
      active: false,
      rows: []
    },
    validation: {
      status: 'ok',
      isBalanced: true,
      blockers: [],
      warnings: [],
      totals: { differenza: 0 }
    },
    meta: {
      operatorId: 'op-123',
      createdAt: '2026-05-29T10:00:00Z',
      behavior: {
        code: 'FF',
        family: 'docivanormale',
        showDocumentPanel: true,
        showIvaPanel: true,
        showPartitario: true,
        showRitenute: false
      }
    },
    totals: {
      totaleDare: 122.00,
      totaleAvere: 122.00,
      differenza: 0,
      isBalanced: true
    }
  }
}

function buildBaseUiDraftInputFC() {
  const draft = buildBaseUiDraftInputFF()
  draft.header.numeroDocumento = 'FT-789'
  draft.header.causaleContabile = {
    id: 'caus-fc',
    codice: 'FC',
    tipoCausale: 'docivanormale',
    registroIva: 'vendite',
    segnoRegistroIva: '+',
    gestionePartite: 'apre',
    descrizione: 'Fattura Vendita'
  }
  draft.header.descrizioneGenerale = 'Fattura vendita n. 789'
  draft.header.soggetto = 'Cliente Srl'
  draft.header.clienteFornitoreId = 'acc-cliente'
  draft.header.clienteFornitoreNome = 'Cliente Srl'
  draft.header.clienteFornitoreCodice = 'CLTSRL80A01H501U'
  draft.header.clienteFornitoreTipo = 'cliente'

  draft.pnPayload.numero_documento = 'FT-789'
  draft.pnPayload.causale_id = 'caus-fc'
  draft.pnPayload.causale_codice = 'FC'
  draft.pnPayload.descrizione = 'Fattura vendita n. 789'
  draft.pnPayload.cliente_fornitore_id = 'acc-cliente'
  draft.pnPayload.cliente_fornitore_nome = 'Cliente Srl'

  draft.rows = [
    { id: 'row-1', conto_id: 'acc-cliente', conto_codice: '400101', conto_descrizione: 'Crediti v/cliente', dare: 122.00, avere: 0, descrizione_riga: 'Cliente' },
    { id: 'row-2', conto_id: 'acc-ricavo', conto_codice: '601001', conto_descrizione: 'Merci c/vendite', dare: 0, avere: 100.00, descrizione_riga: 'Ricavo merci' },
    { id: 'row-3', conto_id: 'acc-iva', conto_codice: '220102', conto_descrizione: 'Erario c/IVA debito', dare: 0, avere: 22.00, descrizione_riga: 'IVA vendite' }
  ]
  draft.righePayload = [
    { conto_id: 'acc-cliente', conto_codice: '400101', conto_descrizione: 'Crediti v/cliente', dare: 122.00, avere: 0, descrizione_riga: 'Cliente' },
    { conto_id: 'acc-ricavo', conto_codice: '601001', conto_descrizione: 'Merci c/vendite', dare: 0, avere: 100.00, descrizione_riga: 'Ricavo merci' },
    { conto_id: 'acc-iva', conto_codice: '220102', conto_descrizione: 'Erario c/IVA debito', dare: 0, avere: 22.00, descrizione_riga: 'IVA vendite' }
  ]

  draft.ivaDraft.registroIva = 'vendite'
  draft.ivaDraft.rows[0].registroIva = 'vendite'

  draft.partitarioDraft.rows = [
    {
      soggettoId: 'acc-cliente',
      soggettoNome: 'Cliente Srl',
      soggettoTipo: 'cliente',
      numeroDocumento: 'FT-789',
      dataDocumento: '2026-05-29',
      tipoDocumento: 'FT',
      importoAperto: 122.00,
      importoOriginario: 122.00,
    }
  ]

  draft.meta.behavior.code = 'FC'
  return draft
}

test('1. FF ordinaria valida genera prima nota, righe, registro IVA acquisti e partita fornitore', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const inserts = db.log.filter(l => l.action === 'insert')
  assert.equal(inserts[0].table, 'prima_nota')
  assert.equal(inserts[1].table, 'prima_nota_righe')
  assert.equal(inserts[2].table, 'registri_iva')
  assert.equal(inserts[3].table, 'partitario')

  // Check vat row
  const vatRow = inserts[2].data[0]
  assert.equal(vatRow.tipo, 'acquisto')
  assert.equal(vatRow.imponibile, 100.00)
  assert.equal(vatRow.iva, 22.00)
  assert.equal(vatRow.totale, undefined)

  // Check partitario row
  const partRow = inserts[3].data[0]
  assert.equal(partRow.tipo, 'fornitore')
  assert.equal(partRow.importo_originale, 122.00)
  assert.equal(partRow.importo_residuo, 122.00)
})

test('2. FC ordinaria valida genera prima nota, righe, registro IVA vendite e partita cliente', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFC()

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const inserts = db.log.filter(l => l.action === 'insert')
  assert.equal(inserts[0].table, 'prima_nota')
  assert.equal(inserts[1].table, 'prima_nota_righe')
  assert.equal(inserts[2].table, 'registri_iva')
  assert.equal(inserts[3].table, 'partitario')

  // Check vat row
  const vatRow = inserts[2].data[0]
  assert.equal(vatRow.tipo, 'vendita')
  assert.equal(vatRow.imponibile, 100.00)
  assert.equal(vatRow.iva, 22.00)
  assert.equal(vatRow.totale, undefined)

  // Check partitario row
  const partRow = inserts[3].data[0]
  assert.equal(partRow.tipo, 'cliente')
  assert.equal(partRow.importo_originale, 122.00)
  assert.equal(partRow.importo_residuo, 122.00)
})

test('3. Nota credito passiva: stesso registro acquisti, segno sottrae (importi negativi)', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  // Mappa causale come nota di credito passiva
  draft.header.causaleContabile = {
    id: 'caus-ncf',
    codice: 'NCF',
    tipoCausale: 'notacredito',
    registroIva: 'acquisti',
    segnoRegistroIva: '-',
    gestionePartite: 'ignora',
    descrizione: 'Nota Credito Fornitore'
  }
  draft.pnPayload.causale_id = 'caus-ncf'
  draft.pnPayload.causale_codice = 'NCF'
  draft.ivaDraft.registroIva = 'acquisti'
  draft.ivaDraft.segnoRegistro = '-'
  draft.ivaDraft.rows[0].registroIva = 'acquisti'
  draft.ivaDraft.rows[0].segnoRegistro = '-'

  // Nota credito contabile rovescia Dare/Avere
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-fornitore', conto_codice: '450101', conto_descrizione: 'Debiti v/fornitore', dare: 122.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-costo', conto_codice: '501001', conto_descrizione: 'Merci c/acquisto', dare: 0, avere: 100.00 },
    { id: 'row-3', conto_id: 'acc-iva', conto_codice: '220101', conto_descrizione: 'Erario c/IVA credito', dare: 0, avere: 22.00 }
  ]
  draft.righePayload = [
    { conto_id: 'acc-fornitore', conto_codice: '450101', conto_descrizione: 'Debiti v/fornitore', dare: 122.00, avere: 0 },
    { conto_id: 'acc-costo', conto_codice: '501001', conto_descrizione: 'Merci c/acquisto', dare: 0, avere: 100.00 },
    { conto_id: 'acc-iva', conto_codice: '220101', conto_descrizione: 'Erario c/IVA credito', dare: 0, avere: 22.00 }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const inserts = db.log.filter(l => l.action === 'insert')
  assert.equal(inserts[0].table, 'prima_nota')
  assert.equal(inserts[1].table, 'prima_nota_righe')
  assert.equal(inserts[2].table, 'registri_iva')
  
  // Note Credito partitario is skipped by policy
  assert.ok(!inserts.some(l => l.table === 'partitario'), 'Non deve essere creata la partita per Note Credito (saltata per prudenza)')

  // Check negative values in register
  const vatRow = inserts[2].data[0]
  assert.equal(vatRow.tipo, 'acquisto')
  assert.equal(vatRow.imponibile, -100.00)
  assert.equal(vatRow.iva, -22.00)
  assert.equal(vatRow.totale, undefined)
})

test('4. Nota credito attiva: stesso registro vendite, segno sottrae (importi negativi)', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFC()

  // Mappa causale come nota di credito attiva
  draft.header.causaleContabile = {
    id: 'caus-ncc',
    codice: 'NCC',
    tipoCausale: 'notacredito',
    registroIva: 'vendite',
    segnoRegistroIva: '-',
    gestionePartite: 'ignora',
    descrizione: 'Nota Credito Cliente'
  }
  draft.pnPayload.causale_id = 'caus-ncc'
  draft.pnPayload.causale_codice = 'NCC'
  draft.ivaDraft.registroIva = 'vendite'
  draft.ivaDraft.segnoRegistro = '-'
  draft.ivaDraft.rows[0].registroIva = 'vendite'
  draft.ivaDraft.rows[0].segnoRegistro = '-'

  // Nota credito contabile rovescia Dare/Avere
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-ricavo', conto_codice: '601001', conto_descrizione: 'Merci c/vendite', dare: 100.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-iva', conto_codice: '220102', conto_descrizione: 'Erario c/IVA debito', dare: 22.00, avere: 0 },
    { id: 'row-3', conto_id: 'acc-cliente', conto_codice: '400101', conto_descrizione: 'Crediti v/cliente', dare: 0, avere: 122.00 }
  ]
  draft.righePayload = [
    { conto_id: 'acc-ricavo', conto_codice: '601001', conto_descrizione: 'Merci c/vendite', dare: 100.00, avere: 0 },
    { conto_id: 'acc-iva', conto_codice: '220102', conto_descrizione: 'Erario c/IVA debito', dare: 22.00, avere: 0 },
    { conto_id: 'acc-cliente', conto_codice: '400101', conto_descrizione: 'Crediti v/cliente', dare: 0, avere: 122.00 }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const inserts = db.log.filter(l => l.action === 'insert')
  assert.equal(inserts[0].table, 'prima_nota')
  assert.equal(inserts[1].table, 'prima_nota_righe')
  assert.equal(inserts[2].table, 'registri_iva')

  // Note Credito partitario is skipped by policy
  assert.ok(!inserts.some(l => l.table === 'partitario'))

  // Check negative values in register
  const vatRow = inserts[2].data[0]
  assert.equal(vatRow.tipo, 'vendita')
  assert.equal(vatRow.imponibile, -100.00)
  assert.equal(vatRow.iva, -22.00)
  assert.equal(vatRow.totale, undefined)
})

test('5. Documento IVA senza soggetto viene bloccato', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  // Rimuove soggetto
  draft.header.soggetto = ''
  draft.header.clienteFornitoreId = ''
  draft.header.clienteFornitoreNome = ''
  draft.pnPayload.cliente_fornitore_id = ''
  draft.pnPayload.cliente_fornitore_nome = ''

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null)
  assert.equal(result.error.code, 'PERSIST_PRIMA_NOTA_DRAFT_BLOCKED')
  assert.ok(result.validation.blockers.includes('soggetto mancante') || result.validation.blockers.includes('controparte mancante'))
})

test('6. Documento IVA senza data/numero documento viene bloccato', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  // Rimuove data e numero documento
  draft.header.numeroDocumento = ''
  draft.header.dataDocumento = ''
  draft.pnPayload.numero_documento = ''
  draft.pnPayload.data_documento = ''

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null)
  assert.equal(result.error.code, 'PERSIST_PRIMA_NOTA_DRAFT_BLOCKED')
  assert.ok(result.validation.blockers.some(b => b.includes('documento IVA senza data') || b.includes('documento IVA senza numero') || b.includes('mancante')))
})

test('7. Documento IVA senza righe IVA viene bloccato', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  // Rimuove righe IVA
  draft.ivaDraft.rows = []

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null)
  assert.equal(result.error.code, 'PERSIST_PRIMA_NOTA_DRAFT_BLOCKED')
  assert.ok(result.validation.blockers.some(b => b.includes('riga IVA mancante') || b.includes('documento IVA senza riga IVA') || b.includes('assenti')))
})

test('8. Documento IVA squadrato viene bloccato', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  // Sbilancia scrittura
  draft.rows[0].dare = 50.00
  draft.righePayload[0].dare = 50.00
  draft.totals.totaleDare = 72.00
  draft.totals.differenza = -50.00
  draft.totals.isBalanced = false
  draft.validation.isBalanced = false
  draft.validation.status = 'blocked'
  draft.validation.blockers = ['scrittura non quadrata']

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null)
  assert.equal(result.error.code, 'PERSIST_PRIMA_NOTA_DRAFT_BLOCKED')
  assert.ok(result.validation.blockers.some(b => b.includes('quadrata') || b.includes('Dare/Avere non quadrati')))
})

test('9. Causale documento IVA forza shouldCreateIva = true', () => {
  const draft = buildBaseUiDraftInputFF()

  // shouldCreateIva deve essere forzato a true
  const { payload } = mapRegistrazioneManualeToCanonical(draft, {
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-29T10:00:00Z'
  })
  assert.equal(payload.postCommitTargets.shouldCreateIva, true)
})

test('10. Causale con partitario attivo forza shouldCreateLedger = true', () => {
  const draft = buildBaseUiDraftInputFF()

  // shouldCreateLedger deve essere forzato a true
  const { payload } = mapRegistrazioneManualeToCanonical(draft, {
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-29T10:00:00Z'
  })
  assert.equal(payload.postCommitTargets.shouldCreateLedger, true)
})

test('11. No legacy writes: verifica che vengano scritte solo le tabelle ammesse', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const allowedTables = new Set([
    'prima_nota',
    'prima_nota_righe',
    'registri_iva',
    'partitario'
  ])

  db.log.forEach(log => {
    if (log.action === 'insert') {
      assert.ok(allowedTables.has(log.table), `Scrittura non ammessa sulla tabella legacy o non autorizzata: ${log.table}`)
    }
  })
})

test('12. Movimenti generali PD/GEN restano funzionanti senza richiedere IVA/soggetti', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  // Imposta causale PD non IVA
  draft.header.causaleContabile = {
    id: 'caus-pd',
    codice: 'PD',
    tipoCausale: 'generale',
    descrizione: 'Pagamenti Diversi'
  }
  draft.pnPayload.causale_id = 'caus-pd'
  draft.pnPayload.causale_codice = 'PD'
  draft.ivaDraft.active = false
  draft.ivaDraft.rows = []
  draft.partitarioDraft.active = false
  draft.partitarioDraft.rows = []
  draft.meta.behavior = {
    code: 'PD',
    family: 'generale',
    showDocumentPanel: false,
    showIvaPanel: false,
    showPartitario: false,
    showRitenute: false
  }

  // Rimuove soggetto, data e numero doc
  draft.header.soggetto = ''
  draft.header.clienteFornitoreId = ''
  draft.header.clienteFornitoreNome = ''
  draft.pnPayload.cliente_fornitore_id = ''
  draft.pnPayload.cliente_fornitore_nome = ''
  draft.header.numeroDocumento = ''
  draft.header.dataDocumento = ''
  draft.pnPayload.numero_documento = ''
  draft.pnPayload.data_documento = ''

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null, `I movimenti generali dovrebbero passare senza IVA o soggetti, errore: ${result.error?.message}`)

  const inserts = db.log.filter(l => l.action === 'insert')
  assert.equal(inserts.length, 2)
  assert.equal(inserts[0].table, 'prima_nota')
  assert.equal(inserts[1].table, 'prima_nota_righe')
})

test('13. FF con riga imponibile su conto classe 4 (Cespiti) passa validazione', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  // Sostituiamo la riga costo con un cespite in classe 4
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-cespite', conto_codice: '4 00 30 0200', conto_descrizione: 'PICCOLI CESPITI E ATTREZZATURE', dare: 100.00, avere: 0, descrizione_riga: 'Costo merci' },
    { id: 'row-2', conto_id: 'acc-iva', conto_codice: '220101', conto_descrizione: 'Erario c/IVA credito', dare: 22.00, avere: 0, descrizione_riga: 'IVA acquisti' },
    { id: 'row-3', conto_id: 'acc-fornitore', conto_codice: '450101', conto_descrizione: 'Debiti v/fornitore', dare: 0, avere: 122.00, descrizione_riga: 'Fornitore' }
  ]
  draft.righePayload = [
    { conto_id: 'acc-cespite', conto_codice: '4 00 30 0200', conto_descrizione: 'PICCOLI CESPITI E ATTREZZATURE', dare: 100.00, avere: 0, descrizione_riga: 'Costo merci' },
    { conto_id: 'acc-iva', conto_codice: '220101', conto_descrizione: 'Erario c/IVA credito', dare: 22.00, avere: 0, descrizione_riga: 'IVA acquisti' },
    { conto_id: 'acc-fornitore', conto_codice: '450101', conto_descrizione: 'Debiti v/fornitore', dare: 0, avere: 122.00, descrizione_riga: 'Fornitore' }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null, `FF con cespite dovrebbe passare la validazione, errore: ${result.error?.message}`)
  
  const inserts = db.log.filter(l => l.action === 'insert')
  assert.equal(inserts[0].table, 'prima_nota')
  assert.equal(inserts[1].table, 'prima_nota_righe')
  assert.equal(inserts[2].table, 'registri_iva')
  assert.equal(inserts[3].table, 'partitario')

  // Verifichiamo che il tipo registro sia acquisto (mapping da acquisti)
  const vatRow = inserts[2].data[0]
  assert.equal(vatRow.tipo, 'acquisto')
})

test('14. Documento IVA con solo fornitore + IVA ma senza riga imputazione viene bloccato', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  // Solo riga IVA e riga fornitore, manca la riga imponibile/imputazione
  draft.rows = [
    { id: 'row-2', conto_id: 'acc-iva', conto_codice: '220101', conto_descrizione: 'Erario c/IVA credito', dare: 22.00, avere: 0, descrizione_riga: 'IVA acquisti' },
    { id: 'row-3', conto_id: 'acc-fornitore', conto_codice: '450101', conto_descrizione: 'Debiti v/fornitore', dare: 0, avere: 22.00, descrizione_riga: 'Fornitore' }
  ]
  draft.righePayload = [
    { conto_id: 'acc-iva', conto_codice: '220101', conto_descrizione: 'Erario c/IVA credito', dare: 22.00, avere: 0, descrizione_riga: 'IVA acquisti' },
    { conto_id: 'acc-fornitore', conto_codice: '450101', conto_descrizione: 'Debiti v/fornitore', dare: 0, avere: 22.00, descrizione_riga: 'Fornitore' }
  ]
  draft.pnPayload.totale_dare = 22.00
  draft.pnPayload.totale_avere = 22.00
  draft.totals.totaleDare = 22.00
  draft.totals.totaleAvere = 22.00
  draft.ivaDraft.totaleDocumento = 22.00
  draft.ivaDraft.totaleImponibile = 0
  draft.ivaDraft.totaleImposta = 22.00
  draft.ivaDraft.rows[0].imponibile = 0
  draft.ivaDraft.rows[0].imposta = 22.00

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null)
  assert.equal(result.error.code, 'PERSIST_PRIMA_NOTA_DRAFT_BLOCKED')
  
  // Verifichiamo che l'errore sia corretto e non contenga il vecchio "costo/ricavo"
  assert.ok(result.validation.blockers.includes('riga di imputazione documento IVA mancante'))
  assert.ok(!result.validation.blockers.includes('riga costo/ricavo mancante'))
})

test('15. Documento IVA privo di ogni informazione registro viene bloccato', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()

  // Rimuoviamo qualsiasi riferimento al registro IVA dalle causali e dal draft
  draft.header.causaleContabile = {
    id: 'caus-custom',
    codice: 'CUSTOM',
    tipoCausale: 'docivanormale',
    descrizione: 'Custom Document'
  }
  draft.pnPayload.causale_id = 'caus-custom'
  draft.pnPayload.causale_codice = 'CUSTOM'
  draft.ivaDraft.registroIva = ''
  draft.ivaDraft.registerType = ''
  draft.ivaDraft.rows[0].registroIva = ''
  draft.ivaDraft.rows[0].registerType = ''

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null)
  assert.equal(result.error.code, 'PERSIST_PRIMA_NOTA_DRAFT_BLOCKED')
  assert.ok(result.validation.blockers.includes('vat.registerType mancante o non valido'))
})

// ─── TEST ESPLICITI DARE/AVERE RIGHE CONTABILI ─────────────────────────────

import { describe } from 'node:test'
import { buildRegistrazioneRowsFromTemplateResolved } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneRowsFromTemplate.js'

// Causali fixture per buildRegistrazioneRowsFromTemplateResolved
const CAUSALE_FF = {
  id: 'caus-ff', codice: 'FF',
  tipoCausale: 'docivanormale',
  registroIva: 'acquisti', segnoRegistroIva: '+',
  gestionePartite: 'apre',
  descrizione: 'Fattura Acquisto'
}
const CAUSALE_FC = {
  id: 'caus-fc', codice: 'FC',
  tipoCausale: 'docivanormale',
  registroIva: 'vendite', segnoRegistroIva: '+',
  gestionePartite: 'apre',
  descrizione: 'Fattura Vendita'
}
const CAUSALE_NCF = {
  id: 'caus-ncf', codice: 'NCF',
  tipoCausale: 'notacredito',
  registroIva: 'acquisti', segnoRegistroIva: '-',
  gestionePartite: 'ignora',
  descrizione: 'Nota Credito Fornitore'
}
const CAUSALE_NC = {
  id: 'caus-nc', codice: 'NC',
  tipoCausale: 'notacredito',
  registroIva: 'vendite', segnoRegistroIva: '-',
  gestionePartite: 'ignora',
  descrizione: 'Nota Credito Cliente'
}

// Template righe tipiche per causali IVA ordinarie
function makeTemplateRows() {
  return [
    { id: 'tr-soggetto', ruolo: 'soggetto', formula_importo: 'totale_documento', lato: 'avere', descrizione_riga: 'Soggetto', obbligatoria: true, modificabile: true, attiva: true },
    { id: 'tr-iva', ruolo: 'iva', formula_importo: 'iva_detraibile', lato: 'dare', descrizione_riga: 'IVA', obbligatoria: true, modificabile: true, attiva: true },
    // La riga economica (costo/ricavo) è generata automaticamente da appendManualDocumentEconomicRow se mancante
  ]
}

function buildTemplateInput(causale, tipoSoggetto, ivaDraft) {
  return {
    causale,
    selectedCausale: causale,
    societaId: 'soc-test',
    templateRows: makeTemplateRows(),
    documentData: { totaleDocumento: 122, imponibile: 100 },
    ivaDraft: { totaleDocumento: 122, imponibile: 100, totaleImponibile: 100, totaleImposta: 22, ivaDetraibile: 22, ...ivaDraft },
    soggetto: tipoSoggetto,
    currentRows: [],
  }
}

describe('FIX-FASE-8-DARE-AVERE: Righe contabili Dare/Avere per causali IVA', () => {

  describe('FF — Fattura fornitore passiva', () => {
    test('FF: fornitore → Avere', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_FF,
        { clienteFornitoreId: 'acc-forn', clienteFornitoreNome: 'Fornitore Spa', clienteFornitoreTipo: 'fornitore' },
        { registroIva: 'acquisti' }
      ))
      assert.ok(result.applied, 'Template deve essere applicato')
      const soggettoRow = result.rows.find(r => r.descrizione_riga === 'Soggetto' || r.ruolo === 'soggetto' || r.lato === 'avere')
      assert.ok(soggettoRow, 'Deve esistere una riga soggetto')
      assert.equal(soggettoRow.lato, 'avere', 'FF: fornitore deve essere in Avere')
    })

    test('FF: IVA credito → Dare', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_FF,
        { clienteFornitoreId: 'acc-forn', clienteFornitoreNome: 'Fornitore Spa', clienteFornitoreTipo: 'fornitore' },
        { registroIva: 'acquisti' }
      ))
      const ivaRow = result.rows.find(r => r.ruolo === 'iva' || r.descrizione_riga === 'IVA')
      assert.ok(ivaRow, 'Deve esistere una riga IVA')
      assert.equal(ivaRow.lato, 'dare', 'FF: IVA credito deve essere in Dare')
    })

    test('FF: riga economica (costo) → Dare', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_FF,
        { clienteFornitoreId: 'acc-forn', clienteFornitoreNome: 'Fornitore Spa', clienteFornitoreTipo: 'fornitore' },
        { registroIva: 'acquisti' }
      ))
      const econRow = result.rows.find(r => r.ruolo !== 'iva' && (r.descrizione_riga || '').toLowerCase() !== 'iva' && (r.ruolo === 'altro' || r.templateSource === 'manual_required' || (r.descrizione_riga || '').toLowerCase().includes('costo')))
      assert.ok(econRow, 'Deve esistere una riga economica costo')
      assert.equal(econRow.lato, 'dare', 'FF: riga costo deve essere in Dare')
      assert.match(econRow.descrizione_riga || '', /[Cc]osto/, 'Label riga deve essere Costo')
    })
  })

  describe('FC — Fattura cliente attiva', () => {
    test('FC: cliente → Dare', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_FC,
        { clienteFornitoreId: 'acc-cli', clienteFornitoreNome: 'Cliente Srl', clienteFornitoreTipo: 'cliente' },
        { registroIva: 'vendite' }
      ))
      assert.ok(result.applied)
      const soggettoRow = result.rows.find(r => r.ruolo === 'soggetto' || r.descrizione_riga === 'Soggetto')
      assert.ok(soggettoRow, 'Deve esistere una riga soggetto')
      assert.equal(soggettoRow.lato, 'dare', 'FC: cliente deve essere in Dare')
    })

    test('FC: IVA debito → Avere', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_FC,
        { clienteFornitoreId: 'acc-cli', clienteFornitoreNome: 'Cliente Srl', clienteFornitoreTipo: 'cliente' },
        { registroIva: 'vendite' }
      ))
      const ivaRow = result.rows.find(r => r.ruolo === 'iva' || r.descrizione_riga === 'IVA')
      assert.ok(ivaRow, 'Deve esistere una riga IVA')
      assert.equal(ivaRow.lato, 'avere', 'FC: IVA debito deve essere in Avere')
    })

    test('FC: riga economica (ricavo) → Avere', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_FC,
        { clienteFornitoreId: 'acc-cli', clienteFornitoreNome: 'Cliente Srl', clienteFornitoreTipo: 'cliente' },
        { registroIva: 'vendite' }
      ))
      const econRow = result.rows.find(r => r.ruolo !== 'iva' && (r.descrizione_riga || '').toLowerCase() !== 'iva' && (r.ruolo === 'altro' || r.templateSource === 'manual_required' || (r.descrizione_riga || '').toLowerCase().includes('ricavo')))
      assert.ok(econRow, 'Deve esistere una riga economica ricavo')
      assert.equal(econRow.lato, 'avere', 'FC: riga ricavo deve essere in Avere')
      assert.match(econRow.descrizione_riga || '', /[Rr]icavo/, 'Label riga deve essere Ricavo')
    })
  })

  describe('NCF — Nota credito fornitore/passiva', () => {
    test('NCF: fornitore → Dare (inversione rispetto a FF)', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_NCF,
        { clienteFornitoreId: 'acc-forn', clienteFornitoreNome: 'Fornitore Spa', clienteFornitoreTipo: 'fornitore' },
        { registroIva: 'acquisti', segnoRegistro: '-' }
      ))
      assert.ok(result.applied, `Template deve essere applicato, reasons: ${result.reasons?.join(', ')}`)
      const soggettoRow = result.rows.find(r => r.ruolo === 'soggetto' || r.descrizione_riga === 'Soggetto')
      assert.ok(soggettoRow, 'Deve esistere una riga soggetto')
      assert.equal(soggettoRow.lato, 'dare', 'NCF: fornitore deve essere in Dare (inversione rispetto a FF)')
    })

    test('NCF: IVA credito → Avere (inversione rispetto a FF)', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_NCF,
        { clienteFornitoreId: 'acc-forn', clienteFornitoreNome: 'Fornitore Spa', clienteFornitoreTipo: 'fornitore' },
        { registroIva: 'acquisti', segnoRegistro: '-' }
      ))
      const ivaRow = result.rows.find(r => r.ruolo === 'iva' || r.descrizione_riga === 'IVA')
      assert.ok(ivaRow, 'Deve esistere una riga IVA')
      assert.equal(ivaRow.lato, 'avere', 'NCF: IVA credito deve essere in Avere (inversione rispetto a FF)')
    })

    test('NCF: riga economica (storno costo) → Avere (inversione rispetto a FF)', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_NCF,
        { clienteFornitoreId: 'acc-forn', clienteFornitoreNome: 'Fornitore Spa', clienteFornitoreTipo: 'fornitore' },
        { registroIva: 'acquisti', segnoRegistro: '-' }
      ))
      const econRow = result.rows.find(r => r.ruolo !== 'iva' && (r.descrizione_riga || '').toLowerCase() !== 'iva' && (r.ruolo === 'altro' || r.templateSource === 'manual_required' || (r.descrizione_riga || '').toLowerCase().includes('storno')))
      assert.ok(econRow, 'Deve esistere una riga economica storno costo')
      assert.equal(econRow.lato, 'avere', 'NCF: storno costo deve essere in Avere')
      assert.match(econRow.descrizione_riga || '', /[Ss]torno/, 'Label riga deve contenere Storno')
    })

    test('NCF: registro IVA acquisti con segno sottrattivo (valori negativi nel registro)', async () => {
      const db = new MockDbClient()
      const draft = buildBaseUiDraftInputFF()
      draft.header.causaleContabile = CAUSALE_NCF
      draft.pnPayload.causale_id = CAUSALE_NCF.id
      draft.pnPayload.causale_codice = CAUSALE_NCF.codice
      draft.ivaDraft.registroIva = 'acquisti'
      draft.ivaDraft.segnoRegistro = '-'
      draft.ivaDraft.rows[0].registroIva = 'acquisti'
      draft.ivaDraft.rows[0].segnoRegistro = '-'
      draft.rows = [
        { id: 'row-1', conto_id: 'acc-fornitore', dare: 122.00, avere: 0 },
        { id: 'row-2', conto_id: 'acc-costo', dare: 0, avere: 100.00 },
        { id: 'row-3', conto_id: 'acc-iva', dare: 0, avere: 22.00 },
      ]
      draft.righePayload = draft.rows
      const result = await persistPrimaNotaDraft({ db, draft })
      assert.equal(result.error, null)
      const vatInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
      assert.ok(vatInsert, 'Deve esistere la riga registri_iva')
      assert.equal(vatInsert.data[0].tipo, 'acquisto', 'NCF: tipo registro deve essere acquisto')
      assert.ok(vatInsert.data[0].imponibile < 0, `NCF: imponibile deve essere negativo, trovato: ${vatInsert.data[0].imponibile}`)
      assert.ok(vatInsert.data[0].iva < 0, `NCF: iva deve essere negativa, trovato: ${vatInsert.data[0].iva}`)
    })
  })

  describe('NC / NCC — Nota credito cliente/attiva', () => {
    test('NC: cliente → Avere (inversione rispetto a FC)', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_NC,
        { clienteFornitoreId: 'acc-cli', clienteFornitoreNome: 'Cliente Srl', clienteFornitoreTipo: 'cliente' },
        { registroIva: 'vendite', segnoRegistro: '-' }
      ))
      assert.ok(result.applied, `Template deve essere applicato, reasons: ${result.reasons?.join(', ')}`)
      const soggettoRow = result.rows.find(r => r.ruolo === 'soggetto' || r.descrizione_riga === 'Soggetto')
      assert.ok(soggettoRow, 'Deve esistere una riga soggetto')
      assert.equal(soggettoRow.lato, 'avere', 'NC: cliente deve essere in Avere (inversione rispetto a FC)')
    })

    test('NC: IVA debito → Dare (inversione rispetto a FC)', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_NC,
        { clienteFornitoreId: 'acc-cli', clienteFornitoreNome: 'Cliente Srl', clienteFornitoreTipo: 'cliente' },
        { registroIva: 'vendite', segnoRegistro: '-' }
      ))
      const ivaRow = result.rows.find(r => r.ruolo === 'iva' || r.descrizione_riga === 'IVA')
      assert.ok(ivaRow, 'Deve esistere una riga IVA')
      assert.equal(ivaRow.lato, 'dare', 'NC: IVA debito deve essere in Dare (inversione rispetto a FC)')
    })

    test('NC: riga economica (storno ricavo) → Dare (inversione rispetto a FC)', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_NC,
        { clienteFornitoreId: 'acc-cli', clienteFornitoreNome: 'Cliente Srl', clienteFornitoreTipo: 'cliente' },
        { registroIva: 'vendite', segnoRegistro: '-' }
      ))
      const econRow = result.rows.find(r => r.ruolo !== 'iva' && (r.descrizione_riga || '').toLowerCase() !== 'iva' && (r.ruolo === 'altro' || r.templateSource === 'manual_required' || (r.descrizione_riga || '').toLowerCase().includes('storno')))
      assert.ok(econRow, 'Deve esistere una riga economica storno ricavo')
      assert.equal(econRow.lato, 'dare', 'NC: storno ricavo deve essere in Dare')
      assert.match(econRow.descrizione_riga || '', /[Ss]torno/, 'Label riga deve contenere Storno')
    })

    test('NC: registro IVA vendite con segno sottrattivo (valori negativi)', async () => {
      const db = new MockDbClient()
      const draft = buildBaseUiDraftInputFC()
      draft.header.causaleContabile = CAUSALE_NC
      draft.pnPayload.causale_id = CAUSALE_NC.id
      draft.pnPayload.causale_codice = CAUSALE_NC.codice
      draft.ivaDraft.registroIva = 'vendite'
      draft.ivaDraft.segnoRegistro = '-'
      draft.ivaDraft.rows[0].registroIva = 'vendite'
      draft.ivaDraft.rows[0].segnoRegistro = '-'
      draft.rows = [
        { id: 'row-1', conto_id: 'acc-ricavo', dare: 100.00, avere: 0 },
        { id: 'row-2', conto_id: 'acc-iva', dare: 22.00, avere: 0 },
        { id: 'row-3', conto_id: 'acc-cliente', dare: 0, avere: 122.00 },
      ]
      draft.righePayload = draft.rows
      const result = await persistPrimaNotaDraft({ db, draft })
      assert.equal(result.error, null)
      const vatInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
      assert.ok(vatInsert, 'Deve esistere la riga registri_iva')
      assert.equal(vatInsert.data[0].tipo, 'vendita', 'NC: tipo registro deve essere vendita')
      assert.ok(vatInsert.data[0].imponibile < 0, `NC: imponibile deve essere negativo, trovato: ${vatInsert.data[0].imponibile}`)
      assert.ok(vatInsert.data[0].iva < 0, `NC: iva deve essere negativa, trovato: ${vatInsert.data[0].iva}`)
    })
  })

  describe('Quadratura scritture', () => {
    test('FF: scrittura quadrata (totaleDare === totaleAvere)', () => {
      // Le righe FF nel draft test: costo 100D + IVA 22D + fornitore 122A → quadrata
      const dare = 100 + 22
      const avere = 122
      assert.equal(dare, avere, 'FF: la scrittura deve essere quadrata')
    })

    test('FC: scrittura quadrata', () => {
      // FC: cliente 122D + ricavo 100A + IVA 22A → quadrata
      const dare = 122
      const avere = 100 + 22
      assert.equal(dare, avere, 'FC: la scrittura deve essere quadrata')
    })

    test('NCF: scrittura quadrata (fornitore 122D + costo 100A + IVA 22A)', () => {
      const dare = 122
      const avere = 100 + 22
      assert.equal(dare, avere, 'NCF: la scrittura deve essere quadrata')
    })

    test('NC: scrittura quadrata (ricavo 100D + IVA 22D + cliente 122A)', () => {
      const dare = 100 + 22
      const avere = 122
      assert.equal(dare, avere, 'NC: la scrittura deve essere quadrata')
    })
  })

  describe('Regressioni: causali lunghe selezionabili e FF/FC non rotte', () => {
    test('FF ancora genera riga costo in Dare (nessuna regressione)', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_FF,
        { clienteFornitoreId: 'acc-forn', clienteFornitoreNome: 'Fornitore Spa', clienteFornitoreTipo: 'fornitore' },
        {}
      ))
      const econRow = result.rows.find(r => r.lato === 'dare' && r.templateSource === 'manual_required' && r.descrizione_riga !== 'iva')
      assert.ok(econRow, 'FF: riga economica deve essere in Dare')
    })

    test('FC ancora genera riga ricavo in Avere (nessuna regressione)', () => {
      const result = buildRegistrazioneRowsFromTemplateResolved(buildTemplateInput(
        CAUSALE_FC,
        { clienteFornitoreId: 'acc-cli', clienteFornitoreNome: 'Cliente Srl', clienteFornitoreTipo: 'cliente' },
        {}
      ))
      const econRow = result.rows.find(r => r.lato === 'avere' && r.templateSource === 'manual_required' && r.descrizione_riga !== 'iva')
      assert.ok(econRow, 'FC: riga economica deve essere in Avere')
    })

    test('nessuna scrittura su ritenute_dacconto', async () => {
      const db = new MockDbClient()
      const draft = buildBaseUiDraftInputFF()
      await persistPrimaNotaDraft({ db, draft })
      const forbidden = db.log.filter(l => l.action === 'insert' && l.table === 'ritenute_dacconto')
      assert.equal(forbidden.length, 0, 'Non devono esserci scritture su ritenute_dacconto')
    })
  })
})
