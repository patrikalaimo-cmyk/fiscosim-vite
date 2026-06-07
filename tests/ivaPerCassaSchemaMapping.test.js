import test from 'node:test'
import assert from 'node:assert/strict'
import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { mapRegistrazioneManualeToCanonical } from '../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js'

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
      dataRegistrazione: '2026-06-05',
      dataDocumento: '2026-06-05',
      numeroDocumento: 'FT-IVA-CASSA-1',
      causaleContabile: {
        id: 'caus-ff',
        codice: 'FF',
        tipoCausale: 'docivanormale',
        registroIva: 'acquisti',
        segnoRegistroIva: '+',
        gestionePartite: 'apre',
        descrizione: 'Fattura Acquisto',
        ivaPerCassa: true
      },
      descrizioneGenerale: 'Fattura passiva con IVA per cassa',
      soggetto: 'Fornitore Spa',
      clienteFornitoreId: 'acc-fornitore',
      clienteFornitoreNome: 'Fornitore Spa',
      clienteFornitoreCodice: 'FRNSPA80A01H501U',
      clienteFornitoreTipo: 'fornitore',
    },
    pnPayload: {
      societa_id: 'soc-123',
      esercizio: 2026,
      data_registrazione: '2026-06-05',
      data_documento: '2026-06-05',
      numero_documento: 'FT-IVA-CASSA-1',
      causale_id: 'caus-ff',
      causale_codice: 'FF',
      descrizione: 'Fattura passiva con IVA per cassa',
      cliente_fornitore_id: 'acc-fornitore',
      cliente_fornitore_nome: 'Fornitore Spa',
      totale_dare: 122.00,
      totale_avere: 122.00,
      stato: 'confermata',
    },
    rows: [
      { id: 'row-1', conto_id: 'acc-costo', conto_codice: '501001', conto_descrizione: 'Merci c/acquisto', dare: 100.00, avere: 0, descrizione_riga: 'Costo merci' },
      { id: 'row-2', conto_id: 'acc-iva-diff', conto_codice: '220102', conto_descrizione: 'Erario c/IVA differita', dare: 22.00, avere: 0, descrizione_riga: 'IVA acquisti differita' },
      { id: 'row-3', conto_id: 'acc-fornitore', conto_codice: '450101', conto_descrizione: 'Debiti v/fornitore', dare: 0, avere: 122.00, descrizione_riga: 'Fornitore' }
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
          soggettoId: 'acc-fornitore',
          soggettoNome: 'Fornitore Spa',
          soggettoTipo: 'fornitore',
          numeroDocumento: 'FT-IVA-CASSA-1',
          dataDocumento: '2026-06-05',
          dataScadenza: '2026-07-05',
          importoOriginario: 122.00,
          importoAperto: 122.00
        }
      ]
    }
  }
}

test('1. Riga IVA ordinaria senza esigibilita nel draft viene mappata come immediata', () => {
  const draft = buildBaseUiDraftInputFF()
  delete draft.ivaDraft.esigibilita
  delete draft.ivaDraft.rows[0].esigibilita

  const { payload } = mapRegistrazioneManualeToCanonical(draft, { validate: false })
  assert.equal(payload.vat.rows[0].esigibilita, 'immediata', 'L\'esigibilita deve defaultare a immediata se assente')
})

test('2. Riga IVA con esigibilita = differita viene mantenuta nel mapping canonico', () => {
  const draft = buildBaseUiDraftInputFF()
  draft.ivaDraft.esigibilita = 'differita'
  draft.ivaDraft.rows[0].esigibilita = 'differita'

  const { payload } = mapRegistrazioneManualeToCanonical(draft, { validate: false })
  assert.equal(payload.vat.rows[0].esigibilita, 'differita', 'L\'esigibilita differita deve essere mantenuta')
})

test('3. Riga IVA con esigibilita = rilascio e origin_registro_iva_id viene mantenuta nel mapping canonico', () => {
  const draft = buildBaseUiDraftInputFF()
  draft.ivaDraft.esigibilita = 'rilascio'
  draft.ivaDraft.rows[0].esigibilita = 'rilascio'
  draft.ivaDraft.rows[0].origin_registro_iva_id = 'c12c5b3b-8d63-455b-97e3-bfef58c7075c'

  const { payload } = mapRegistrazioneManualeToCanonical(draft, { validate: false })
  assert.equal(payload.vat.rows[0].esigibilita, 'rilascio')
  assert.equal(payload.vat.rows[0].origin_registro_iva_id, 'c12c5b3b-8d63-455b-97e3-bfef58c7075c')
})

test('4. Riga IVA con esigibilita non valida viene normalizzata come immediata', () => {
  const draft = buildBaseUiDraftInputFF()
  draft.ivaDraft.esigibilita = 'INVALIDA'
  draft.ivaDraft.rows[0].esigibilita = 'INVALIDA'

  const { payload } = mapRegistrazioneManualeToCanonical(draft, { validate: false })
  assert.equal(payload.vat.rows[0].esigibilita, 'immediata', 'Valori di esigibilita non validi devono fallback a immediata')
})

test('5. Riga partitario senza flag iva_per_cassa viene mappata con iva_per_cassa = false', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()
  
  // Rimuoviamo il flag sia dalla causale sia dalla riga partitario
  draft.header.causaleContabile.ivaPerCassa = false
  delete draft.partitarioDraft.rows[0].ivaPerCassa
  delete draft.partitarioDraft.rows[0].iva_per_cassa

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert, 'Dovrebbe esserci un inserimento sul partitario')
  const partRow = Array.isArray(partInsert.data) ? partInsert.data[0] : partInsert.data
  assert.equal(partRow.iva_per_cassa, false, 'iva_per_cassa deve essere false se non specificato')
})

test('6. Riga partitario con iva_per_cassa = true viene mantenuta nel salvataggio del partitario', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()
  
  draft.header.causaleContabile.ivaPerCassa = true
  draft.partitarioDraft.rows[0].ivaPerCassa = true

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partInsert)
  const partRow = Array.isArray(partInsert.data) ? partInsert.data[0] : partInsert.data
  assert.equal(partRow.iva_per_cassa, true, 'iva_per_cassa deve essere true')
})

test('7. Regressione: il salvataggio di una riga IVA con esigibilita e origin_registro_iva_id funziona a DB', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()
  
  draft.ivaDraft.esigibilita = 'differita'
  draft.ivaDraft.rows[0].esigibilita = 'differita'
  draft.ivaDraft.rows[0].originRegistroIvaId = 'c12c5b3b-8d63-455b-97e3-bfef58c7075c'

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivainsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivainsert)
  const ivaRow = Array.isArray(ivainsert.data) ? ivainsert.data[0] : ivainsert.data
  assert.equal(ivaRow.esigibilita, 'differita')
  assert.equal(ivaRow.origin_registro_iva_id, 'c12c5b3b-8d63-455b-97e3-bfef58c7075c')
})

test('8. Regressione: IVA ordinaria FF continua a passare e a salvare con esigibilita = immediata di default', async () => {
  const db = new MockDbClient()
  const draft = buildBaseUiDraftInputFF()
  
  // Configura causale standard ordinaria (non iva per cassa)
  draft.header.causaleContabile.ivaPerCassa = false
  delete draft.ivaDraft.esigibilita
  delete draft.ivaDraft.rows[0].esigibilita

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivainsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivainsert)
  const ivaRow = Array.isArray(ivainsert.data) ? ivainsert.data[0] : ivainsert.data
  assert.equal(ivaRow.esigibilita, 'immediata', 'L\'esigibilita per IVA ordinaria deve essere immediata')
  assert.equal(ivaRow.origin_registro_iva_id, null)
})
