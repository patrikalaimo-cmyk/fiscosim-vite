import test from 'node:test'
import assert from 'node:assert/strict'
import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { buildCausaleContabilePolicy } from '../src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js'

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
  'societa_id'
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
  'locked_at'
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

function buildBaseDraft(causale = {}, subject = {}) {
  const isAcq = ['01', 'acquisti'].includes(String(causale.registroIva || causale.codice_registro_iva || '').toLowerCase())
  return {
    isSimulata: false,
    header: {
      societaId: 'soc-123',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-29',
      dataDocumento: '2026-05-29',
      numeroDocumento: 'FT-456',
      causaleContabile: causale,
      descrizioneGenerale: 'Registrazione documento',
      soggetto: subject.nome || '',
      clienteFornitoreId: subject.id || '',
      clienteFornitoreNome: subject.nome || '',
      clienteFornitoreCodice: subject.codice || '',
      clienteFornitoreTipo: subject.tipo || '',
    },
    pnPayload: {
      societa_id: 'soc-123',
      esercizio: 2026,
      data_registrazione: '2026-05-29',
      data_documento: '2026-05-29',
      numero_documento: 'FT-456',
      causale_id: causale.id || 'caus-test',
      causale_codice: causale.codice || 'TEST',
      descrizione: 'Registrazione documento',
      cliente_fornitore_id: subject.id || '',
      cliente_fornitore_nome: subject.nome || '',
      totale_dare: 122.00,
      totale_avere: 122.00,
      stato: 'confermata',
    },
    rows: isAcq ? [
      { id: 'row-1', conto_id: 'acc-costo', dare: 100.00, avere: 0, descrizione_riga: 'Costo' },
      { id: 'row-2', conto_id: 'acc-iva', dare: 22.00, avere: 0, descrizione_riga: 'IVA' },
      { id: 'row-3', conto_id: 'acc-forn', dare: 0, avere: 122.00, descrizione_riga: 'Soggetto' }
    ] : [
      { id: 'row-1', conto_id: 'acc-cli', dare: 122.00, avere: 0, descrizione_riga: 'Soggetto' },
      { id: 'row-2', conto_id: 'acc-ricavo', dare: 0, avere: 100.00, descrizione_riga: 'Ricavo' },
      { id: 'row-3', conto_id: 'acc-iva', dare: 0, avere: 22.00, descrizione_riga: 'IVA' }
    ],
    righePayload: isAcq ? [
      { conto_id: 'acc-costo', dare: 100.00, avere: 0, descrizione_riga: 'Costo' },
      { conto_id: 'acc-iva', dare: 22.00, avere: 0, descrizione_riga: 'IVA' },
      { conto_id: 'acc-forn', dare: 0, avere: 122.00, descrizione_riga: 'Soggetto' }
    ] : [
      { conto_id: 'acc-cli', dare: 122.00, avere: 0, descrizione_riga: 'Soggetto' },
      { conto_id: 'acc-ricavo', dare: 0, avere: 100.00, descrizione_riga: 'Ricavo' },
      { conto_id: 'acc-iva', dare: 0, avere: 22.00, descrizione_riga: 'IVA' }
    ],
    documentData: { divisa: 'EUR' },
    ivaDraft: {
      active: true,
      registroIva: isAcq ? 'acquisti' : 'vendite',
      segnoRegistro: causale.segnoRegistroIva === '-' ? '-' : '+',
      totaleDocumento: 122.00,
      totaleImponibile: 100.00,
      totaleImposta: 22.00,
      rows: [
        {
          causaleIvaId: 'iva-22',
          imponibile: 100.00,
          imposta: 22.00,
          aliquota: 22,
          registroIva: isAcq ? 'acquisti' : 'vendite',
          segnoRegistro: causale.segnoRegistroIva === '-' ? '-' : '+',
          percentualeDetraibilita: 100
        }
      ]
    },
    partitarioDraft: {
      active: true,
      mode: 'apertura',
      rows: [
        {
          soggettoId: subject.id || '',
          soggettoNome: subject.nome || '',
          soggettoTipo: subject.tipo || '',
          numeroDocumento: 'FT-456',
          dataDocumento: '2026-05-29',
          tipoDocumento: 'FT',
          importoAperto: 122.00,
          importoOriginario: 122.00,
        }
      ]
    },
    meta: {
      operatorId: 'op-123',
      createdAt: '2026-05-29T10:00:00Z',
      behavior: {
        code: causale.codice || 'TEST',
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

// 1. Operazione gestita = Fattura attiva + vendite + Somma + Apre → partita cliente positiva.
test('1. Fattura attiva con registro vendite, Somma e Apre genera partita cliente positiva', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-fc',
    codice: 'FC',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura attiva',
    registroIva: 'vendite',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Uno', tipo: 'cliente' })
  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert, 'Deve inserire nel partitario')
  const partRow = partInsert.data[0]
  assert.equal(partRow.tipo, 'cliente')
  assert.equal(partRow.importo_originale, 122.00)
  assert.equal(partRow.importo_residuo, 122.00)
  assert.equal(partRow.importo_pagato, 0)
  assert.equal(partRow.stato, 'aperta')
})

// 2. Operazione gestita = Nota credito attiva + vendite + Sottrae + Apre → partita cliente negativa.
test('2. Nota credito attiva con registro vendite, Sottrae e Apre genera partita cliente negativa', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-nc',
    codice: 'NC',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito attiva',
    registroIva: 'vendite',
    segno_registro_iva: '-',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Uno', tipo: 'cliente' })
  // Invertiamo dare/avere contabile per quadratura NC attiva (cliente in avere)
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-ricavo', dare: 100.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-iva', dare: 22.00, avere: 0 },
    { id: 'row-3', conto_id: 'acc-cli', dare: 0, avere: 122.00 }
  ]
  draft.righePayload = draft.rows

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert, 'Deve inserire nel partitario')
  const partRow = partInsert.data[0]
  assert.equal(partRow.tipo, 'cliente')
  assert.equal(partRow.importo_originale, -122.00)
  assert.equal(partRow.importo_residuo, -122.00)
  assert.equal(partRow.importo_pagato, 0)
  assert.equal(partRow.stato, 'aperta')
})

// 3. Operazione gestita = Fattura passiva + acquisti + Somma + Apre → partita fornitore positiva.
test('3. Fattura passiva con registro acquisti, Somma e Apre genera partita fornitore positiva', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ff',
    codice: 'FF',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura passiva',
    registroIva: 'acquisti',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert, 'Deve inserire nel partitario')
  const partRow = partInsert.data[0]
  assert.equal(partRow.tipo, 'fornitore')
  assert.equal(partRow.importo_originale, 122.00)
  assert.equal(partRow.importo_residuo, 122.00)
})

// 4. Operazione gestita = Nota credito passiva + acquisti + Sottrae + Apre → partita fornitore negativa.
test('4. Nota credito passiva con registro acquisti, Sottrae e Apre genera partita fornitore negativa', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ncf',
    codice: 'NCF',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito passiva',
    registroIva: 'acquisti',
    segno_registro_iva: '-',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  // Invertiamo dare/avere contabile per quadratura NC passiva (fornitore in dare)
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-forn', dare: 122.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-costo', dare: 0, avere: 100.00 },
    { id: 'row-3', conto_id: 'acc-iva', dare: 0, avere: 22.00 }
  ]
  draft.righePayload = draft.rows

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert, 'Deve inserire nel partitario')
  const partRow = partInsert.data[0]
  assert.equal(partRow.tipo, 'fornitore')
  assert.equal(partRow.importo_originale, -122.00)
  assert.equal(partRow.importo_residuo, -122.00)
})

// 5. TD non valorizzato: la nota credito deve funzionare comunque se Operazione gestita = Nota credito attiva/passiva.
test('5. TD non valorizzato ma operazione gestita = Nota credito passiva genera partita negativa', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ncf-no-td',
    codice: 'NCF_NO_TD',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito passiva',
    registroIva: 'acquisti',
    segno_registro_iva: '-',
    gestione_partite: 'apre'
    // nessun td_comunicazione_fatture
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-forn', dare: 122.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-costo', dare: 0, avere: 100.00 },
    { id: 'row-3', conto_id: 'acc-iva', dare: 0, avere: 22.00 }
  ]
  draft.righePayload = draft.rows

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert)
  assert.equal(partInsert.data[0].importo_originale, -122.00)
})

// 6. Codice causale generico + impostazioni corrette deve generare il comportamento corretto.
test('6. Codice causale generico ZZZ con operazione nota credito attiva genera partita cliente negativa', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-zzz',
    codice: 'ZZZ', // generico
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito attiva',
    registroIva: 'vendite',
    segno_registro_iva: '-',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Uno', tipo: 'cliente' })
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-ricavo', dare: 100.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-iva', dare: 22.00, avere: 0 },
    { id: 'row-3', conto_id: 'acc-cli', dare: 0, avere: 122.00 }
  ]
  draft.righePayload = draft.rows

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert)
  assert.equal(partInsert.data[0].tipo, 'cliente')
  assert.equal(partInsert.data[0].importo_originale, -122.00)
})

// 7. Nessuna compensazione automatica (non fa update o delete a DB su partitario).
test('7. Nessuna compensazione automatica (solo log di insert sul partitario, no delete o update)', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-nc',
    codice: 'NC',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito attiva',
    registroIva: 'vendite',
    segno_registro_iva: '-',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Uno', tipo: 'cliente' })
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-ricavo', dare: 100.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-iva', dare: 22.00, avere: 0 },
    { id: 'row-3', conto_id: 'acc-cli', dare: 0, avere: 122.00 }
  ]
  draft.righePayload = draft.rows

  await persistPrimaNotaDraft({ db, draft })

  const matchesModifications = db.log.filter(l => l.table === 'partitario' && (l.action === 'update' || l.action === 'delete'))
  assert.equal(matchesModifications.length, 0, 'Non deve effettuare modifiche o eliminazioni su partite esistenti')
})

// 8. Nessun update su partite esistenti.
test('8. Nessun update eseguito su partite esistenti a database', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ff',
    codice: 'FF',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura passiva',
    registroIva: 'acquisti',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  await persistPrimaNotaDraft({ db, draft })

  const updates = db.log.filter(l => l.action === 'update')
  assert.equal(updates.length, 0)
})

// 9. importo_originale, importo_residuo, importo_pagato coerenti.
test('9. importo_originale e importo_residuo sono identici all\'importo calcolato e importo_pagato e\' 0', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ff',
    codice: 'FF',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura passiva',
    registroIva: 'acquisti',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  await persistPrimaNotaDraft({ db, draft })

  const partRow = db.log.find(l => l.action === 'insert' && l.table === 'partitario').data[0]
  assert.equal(partRow.importo_originale, 122.00)
  assert.equal(partRow.importo_residuo, 122.00)
  assert.equal(partRow.importo_pagato, 0)
})

// 10. Documento senza soggetto con partitario attivo bloccato.
test('10. Documento senza soggetto con partitario attivo viene bloccato', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ff',
    codice: 'FF',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura passiva',
    registroIva: 'acquisti',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  // Rimuoviamo il soggetto
  const draft = buildBaseDraft(causale, {})
  draft.header.soggetto = ''
  draft.header.clienteFornitoreId = ''
  draft.header.clienteFornitoreNome = ''
  draft.pnPayload.cliente_fornitore_id = ''
  draft.pnPayload.cliente_fornitore_nome = ''
  draft.partitarioDraft.rows[0].soggettoId = ''
  draft.partitarioDraft.rows[0].soggettoNome = ''

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null)
  assert.equal(result.error.code, 'PERSIST_PRIMA_NOTA_DRAFT_BLOCKED')
  assert.ok(result.validation.blockers.includes('controparte mancante'))
})

// 11. PD/GEN non generano partitario se policy non lo prevede.
test('11. PD con gestione_partite assente/ignora non genera partitario', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-pd',
    codice: 'PD',
    tipo_causale: 'generale',
    descrizione: 'Pagamenti Diversi'
  }
  const draft = buildBaseDraft(causale, { id: 'sogg-01', nome: 'Soggetto', tipo: 'soggetto' })
  draft.partitarioDraft.active = false
  draft.partitarioDraft.rows = []
  
  // Per PD non-IVA non si richiede soggetto o doc per forza, ma lo passiamo per verificare che non generi partitario
  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partRow = db.log.find(l => l.table === 'partitario')
  assert.ok(!partRow, 'Non deve generare partitario')
})

// 12. Registri IVA note credito restano corretti.
test('12. Registri IVA note credito hanno imponibile e imposta negativi', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-nc',
    codice: 'NC',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito attiva',
    registroIva: 'vendite',
    segno_registro_iva: '-',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Uno', tipo: 'cliente' })
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-ricavo', dare: 100.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-iva', dare: 22.00, avere: 0 },
    { id: 'row-3', conto_id: 'acc-cli', dare: 0, avere: 122.00 }
  ]
  draft.righePayload = draft.rows

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const vatRow = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva').data[0]
  assert.equal(vatRow.imponibile, -100.00)
  assert.equal(vatRow.iva, -22.00)
})

// 13. Nessun write su tabelle legacy.
test('13. Nessuna scrittura su tabelle legacy non consentite', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ff',
    codice: 'FF',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura passiva',
    registroIva: 'acquisti',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  await persistPrimaNotaDraft({ db, draft })

  const allowed = new Set(['prima_nota', 'prima_nota_righe', 'registri_iva', 'partitario'])
  db.log.filter(l => l.action === 'insert').forEach(l => {
    assert.ok(allowed.has(l.table), `Tabella non ammessa: ${l.table}`)
  })
})

// 14. Nessuna scrittura su ritenute_dacconto.
test('14. Nessuna scrittura su ritenute_dacconto', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ff',
    codice: 'FF',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura passiva',
    registroIva: 'acquisti',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  await persistPrimaNotaDraft({ db, draft })

  const ritRows = db.log.filter(l => l.table === 'ritenute_dacconto')
  assert.equal(ritRows.length, 0)
})

// 15. Incoerenza impostazioni.
test('15. Nota credito attiva con registro acquisti viene bloccata', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-incoerente-1',
    codice: 'INCO1',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito attiva',
    registroIva: 'acquisti', // incoerente con attiva
    segno_registro_iva: '-',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente', tipo: 'cliente' })
  const result = await persistPrimaNotaDraft({ db, draft })
  
  assert.notEqual(result.error, null)
  assert.ok(result.validation.blockers.some(b => b.includes('Nota credito attiva configurata su registro acquisti incoerente')))
})

test('16. Nota credito passiva con registro vendite viene bloccata', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-incoerente-2',
    codice: 'INCO2',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito passiva',
    registroIva: 'vendite', // incoerente con passiva
    segno_registro_iva: '-',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore', tipo: 'fornitore' })
  const result = await persistPrimaNotaDraft({ db, draft })
  
  assert.notEqual(result.error, null)
  assert.ok(result.validation.blockers.some(b => b.includes('Nota credito passiva configurata su registro vendite incoerente')))
})

test('17. Nota credito con segno Somma viene bloccata', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-incoerente-3',
    codice: 'INCO3',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito attiva',
    registroIva: 'vendite',
    segno_registro_iva: '+', // incoerente con nota credito
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente', tipo: 'cliente' })
  const result = await persistPrimaNotaDraft({ db, draft })
  
  assert.notEqual(result.error, null)
  assert.ok(result.validation.blockers.some(b => b.includes('Nota credito configurata con segno registro Somma incoerente')))
})

test('18. Fattura con segno Sottrae viene bloccata', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-incoerente-4',
    codice: 'INCO4',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura attiva',
    registroIva: 'vendite',
    segno_registro_iva: '-', // incoerente con fattura ordinaria
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente', tipo: 'cliente' })
  const result = await persistPrimaNotaDraft({ db, draft })
  
  assert.notEqual(result.error, null)
  assert.ok(result.validation.blockers.some(b => b.includes('Operazione gestita di tipo fattura con segno registro Sottrae incoerente')))
})

import { mapRegistrazioneManualeToCanonical } from '../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js'

test('19. Caso Reale FC: registri_iva.tipo = vendita, partitario.tipo = cliente, importo_originale > 0, synthesized rows when draft.partitarioDraft is missing/none', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-fc',
    codice: 'FC',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura attiva',
    registroIva: '02',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Reale', tipo: 'cliente' })
  draft.partitarioDraft = {
    active: false,
    mode: 'none',
    tipoMovimento: 'none',
    rows: []
  }

  const mapped = mapRegistrazioneManualeToCanonical(draft)
  assert.equal(mapped.payload.postCommitTargets.shouldCreateLedger, true, 'shouldCreateLedger deve essere true')
  assert.equal(mapped.payload.ledger.enabled, true, 'ledger deve essere abilitato')
  assert.equal(mapped.payload.ledger.rows.length, 1, 'ledger.rows non deve essere vuoto')
  assert.equal(mapped.payload.ledger.rows[0].soggettoTipo, 'cliente')
  assert.equal(mapped.payload.ledger.rows[0].amount, 122.00)

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const vatInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(vatInsert, 'Deve inserire nel registro IVA')
  assert.equal(vatInsert.data[0].tipo, 'vendita', 'tipo registro deve essere vendita')
  assert.equal(vatInsert.data[0].imponibile, 100.00, 'imponibile positivo')
  assert.equal(vatInsert.data[0].iva, 22.00, 'iva positiva')

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert, 'Deve inserire nel partitario')
  assert.equal(partInsert.data[0].tipo, 'cliente', 'tipo soggetto deve essere cliente')
  assert.equal(partInsert.data[0].importo_originale, 122.00, 'importo originale positivo')
  assert.equal(partInsert.data[0].importo_residuo, 122.00)
  assert.equal(partInsert.data[0].importo_pagato, 0)
  assert.equal(partInsert.data[0].stato, 'aperta')
})

test('20. Caso Reale NC: registri_iva.tipo = vendita, partitario.tipo = cliente, importo_originale < 0, importi registro negativi', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-nc',
    codice: 'NC',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito attiva',
    registroIva: '02',
    segno_registro_iva: '-',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Reale', tipo: 'cliente' })
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-ricavo', dare: 100.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-iva', dare: 22.00, avere: 0 },
    { id: 'row-3', conto_id: 'acc-cli', dare: 0, avere: 122.00 }
  ]
  draft.righePayload = draft.rows
  draft.partitarioDraft = {
    active: false,
    mode: 'none',
    tipoMovimento: 'none',
    rows: []
  }

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const vatInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(vatInsert)
  assert.equal(vatInsert.data[0].tipo, 'vendita', 'NC deve essere vendite')
  assert.equal(vatInsert.data[0].imponibile, -100.00, 'imponibile negativo')
  assert.equal(vatInsert.data[0].iva, -22.00, 'iva negativa')

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert)
  assert.equal(partInsert.data[0].tipo, 'cliente')
  assert.equal(partInsert.data[0].importo_originale, -122.00)
  assert.equal(partInsert.data[0].importo_residuo, -122.00)
  assert.equal(partInsert.data[0].stato, 'aperta')
})

test('21. Caso Reale FF: registri_iva.tipo = acquisto, partitario.tipo = fornitore, importo_originale > 0', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ff',
    codice: 'FF',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura passiva',
    registroIva: '01',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Reale', tipo: 'fornitore' })
  draft.partitarioDraft = {
    active: false,
    mode: 'none',
    tipoMovimento: 'none',
    rows: []
  }

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const vatInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(vatInsert)
  assert.equal(vatInsert.data[0].tipo, 'acquisto')
  assert.equal(vatInsert.data[0].imponibile, 100.00)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert)
  assert.equal(partInsert.data[0].tipo, 'fornitore')
  assert.equal(partInsert.data[0].importo_originale, 122.00)
})

test('22. Caso Reale NCF: registri_iva.tipo = acquisto, partitario.tipo = fornitore, importo_originale < 0', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-ncf',
    codice: 'NCF',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Nota credito passiva',
    registroIva: '01',
    segno_registro_iva: '-',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Reale', tipo: 'fornitore' })
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-forn', dare: 122.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-costo', dare: 0, avere: 100.00 },
    { id: 'row-3', conto_id: 'acc-iva', dare: 0, avere: 22.00 }
  ]
  draft.righePayload = draft.rows
  draft.partitarioDraft = {
    active: false,
    mode: 'none',
    tipoMovimento: 'none',
    rows: []
  }

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const vatInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(vatInsert)
  assert.equal(vatInsert.data[0].tipo, 'acquisto')
  assert.equal(vatInsert.data[0].imponibile, -100.00)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert)
  assert.equal(partInsert.data[0].tipo, 'fornitore')
  assert.equal(partInsert.data[0].importo_originale, -122.00)
})

test('23. Test di rafforzamento: verifica fallimenti su condizioni e errori di persistenza partitario', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-fc',
    codice: 'FC',
    tipo_causale: 'docivanormale',
    tipo_documento: 'Fattura attiva',
    registroIva: '02',
    segno_registro_iva: '+',
    gestione_partite: 'apre'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Reale', tipo: 'cliente' })
  draft.partitarioDraft = {
    active: false,
    mode: 'none',
    tipoMovimento: 'none',
    rows: []
  }

  // 1. Verifica mapping targets.shouldCreateLedger e ledger.rows
  const mapped = mapRegistrazioneManualeToCanonical(draft)
  assert.equal(mapped.payload.postCommitTargets.shouldCreateLedger, true, 'shouldCreateLedger deve essere true')
  assert.ok(mapped.payload.ledger.rows.length > 0, 'ledger.rows non deve essere vuoto')

  // 2. Verifica che l\'insert fallisca se Supabase restituisce errore e l\'errore blocca il salvataggio
  db.insertBehaviors['partitario'] = { data: null, error: { code: 'DB_ERR_TEST', message: 'Errore inserimento partitario' } }
  
  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null, 'Il salvataggio deve fallire se l\'insert su partitario fallisce')
  assert.equal(result.error.code, 'DB_ERR_TEST')

  // Ripristina db
  const db2 = new MockDbClient()
  const result2 = await persistPrimaNotaDraft({ db: db2, draft })
  assert.equal(result2.error, null)

  // 3. Verifica che il mock DB registri un insert nella tabella partitario
  const partInsert = db2.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert, 'Deve esserci una chiamata insert sulla tabella partitario')

  // 4. Verifica che NON vengano fatti update/delete su partite esistenti per aperture
  const modifications = db2.log.filter(l => l.table === 'partitario' && (l.action === 'update' || l.action === 'delete'))
  assert.equal(modifications.length, 0, 'Non devono esserci modifiche o cancellazioni su partitario per aperture')
})

