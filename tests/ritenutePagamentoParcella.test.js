import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRegistrazioneDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js'
import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'

const percipiente = {
  id: 'percipiente-1',
  ragione_sociale: 'Studio Professionista',
  codice_fiscale: 'RSSMRA80A01H501U',
  aliquota_ritenuta: 20,
  causale_prevalente: 'A',
  codice_tributo: '1040',
  attivo: true,
}

const partita = {
  id: 'partita-parcella-1',
  conto_id: 'fornitore-1',
  controparte_nome: 'Studio Professionista',
  numero_documento: 'PAR-1',
  data_documento: '2026-06-09',
  tipo_documento: 'FT',
  importo_originale: 1268.8,
  importo_pagato: 0,
  importo_residuo: 1268.8,
  stato: 'aperta',
  prima_nota_id: 'prima-nota-parcella-1',
}

const posizioneRitenuta = {
  id: 'ritenuta-1',
  partitario_id: partita.id,
  prima_nota_id: partita.prima_nota_id,
  percipiente_id: percipiente.id,
  percipiente_cf: percipiente.codice_fiscale,
  percipiente_denominazione: percipiente.ragione_sociale,
  compenso_lordo: 1000,
  imponibile_ritenuta: 1000,
  aliquota_ritenuta: 20,
  importo_ritenuta: 200,
  ritenuta: 200,
  compenso_netto: 1068.8,
  causale_prestazione: 'A',
  codice_tributo: '1040',
  stato: 'aperta',
  inclusa_cu: false,
}

function buildPayment({ erario = true, importoChiusura = 1268.8 } = {}) {
  const causale = {
    id: 'causale-pagamento-ritenuta',
    codice: 'FIXTURE-PAG-RIT',
    tipo_causale: 'Movimento di generale',
    tipo_documento: 'Pagamento fornitore',
    operazione_partite: 'Chiude',
    op_ritenute: 'Pagamento',
    righe_prima_nota_template: erario
      ? [{
          ordine: 3,
          ruolo: 'erario_ritenute',
          lato: 'avere',
          formula_importo: 'ritenuta',
          conto_id: 'erario-1',
          conto_codice: '2401',
          conto_descrizione: 'Debiti v/Erario ritenute',
          hierarchyType: 'sottoconto',
        }]
      : [],
  }
  const amountText = Number(importoChiusura).toFixed(2)
  const input = {
    header: {
      societaId: 'soc-1',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-30',
      causaleContabile: causale,
      clienteFornitoreId: 'fornitore-1',
      clienteFornitoreNome: 'Studio Professionista',
      clienteFornitoreTipo: 'fornitore',
      bancaCassaId: 'banca-1',
    },
    rows: [
      {
        id: 'row-fornitore',
        ruolo: 'soggetto',
        conto_id: 'fornitore-1',
        conto_codice: '2001',
        conto_descrizione: 'Studio Professionista',
        conto_resolved_finale: true,
        hierarchyType: 'sottoconto',
        lato: 'dare',
        dare: amountText,
        avere: '',
      },
      {
        id: 'row-banca',
        ruolo: 'altro',
        conto_id: 'banca-1',
        conto_codice: '1001',
        conto_descrizione: 'Banca',
        conto_resolved_finale: true,
        hierarchyType: 'sottoconto',
        lato: 'avere',
        dare: '',
        avere: amountText,
      },
    ],
    documentData: {},
    ivaData: {},
    partitarioData: {
      selectedPartitaId: partita.id,
      selectedPartitaIds: [partita.id],
      importiChiusura: { [partita.id]: importoChiusura },
      importoChiusura,
    },
    ritenutaData: {},
  }
  const options = {
    selectedCausale: causale,
    causaleContabile: causale,
    behavior: {
      showDocumentPanel: false,
      showIvaPanel: false,
      showPartitario: true,
      partitarioMode: 'chiusura',
      showRitenute: true,
      ritenuteMode: 'pagamento',
    },
    partite: [partita],
    ritenute: [posizioneRitenuta],
    percipienti: [percipiente],
    pianoConti: [
      { id: 'fornitore-1', codice: '2001', descrizione: 'Studio Professionista', is_fornitore: true, hierarchyType: 'sottoconto' },
      { id: 'banca-1', codice: '1001', descrizione: 'Banca', hierarchyType: 'sottoconto' },
      { id: 'erario-1', codice: '2401', descrizione: 'Debiti v/Erario ritenute', hierarchyType: 'sottoconto' },
    ],
  }
  return buildRegistrazioneDraft(input, options)
}

class MockQuery {
  constructor(table, db) {
    this.table = table
    this.db = db
    this.payload = null
    this.action = 'select'
    this.filters = {}
  }

  insert(payload) {
    this.action = 'insert'
    this.payload = payload
    this.db.log.push({ action: 'insert', table: this.table, data: payload })
    return this
  }

  update(payload) {
    this.action = 'update'
    this.payload = payload
    this.db.log.push({ action: 'update', table: this.table, data: payload })
    return this
  }

  delete() {
    this.action = 'delete'
    this.db.log.push({ action: 'delete', table: this.table })
    return this
  }

  select(fields = '*') {
    this.fields = fields
    return this
  }

  eq(field, value) {
    this.filters[field] = value
    return this
  }

  maybeSingle() {
    if (this.table === 'partitario') {
      return Promise.resolve({ data: { ...partita }, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  }

  single() {
    return Promise.resolve({
      data: { id: `${this.table}-id`, ...(Array.isArray(this.payload) ? this.payload[0] : this.payload) },
      error: null,
    })
  }

  then(resolve) {
    if (this.action === 'update' && this.table === 'ritenute_dacconto') {
      resolve({ data: [{ ...posizioneRitenuta, ...this.payload, id: posizioneRitenuta.id }], error: null })
      return
    }
    if (this.action === 'update') {
      resolve({ data: null, error: null })
      return
    }
    if (this.action === 'insert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row, index) => ({
        id: `${this.table}-${index + 1}`,
        ...row,
      }))
      resolve({ data: rows, error: null })
      return
    }
    resolve({ data: [], error: null })
  }
}

class MockDb {
  constructor() {
    this.log = []
  }

  from(table) {
    return new MockQuery(table, this)
  }
}

test('pagamento integrale genera fornitore lordo, banca netta e debito ritenuta', () => {
  const result = buildPayment()
  assert.equal(result.validation.status, 'ok')
  assert.equal(result.totals.isBalanced, true)
  assert.equal(result.totals.totaleDare, 1268.8)
  assert.equal(result.totals.totaleAvere, 1268.8)

  const fornitore = result.draft.rows.find((row) => row.ruolo === 'soggetto')
  const banca = result.draft.rows.find((row) => row.conto_id === 'banca-1')
  const erario = result.draft.rows.find((row) => row.ruolo === 'erario_ritenute')
  assert.equal(Number(fornitore.dare), 1268.8)
  assert.equal(Number(banca.avere), 1068.8)
  assert.equal(Number(erario.avere), 200)
  assert.equal(result.partitarioDraft.importoChiusura, 1268.8)
  assert.equal(result.partitarioDraft.rows[0].residuo, 1268.8)
  assert.equal(result.ritenutaDraft.ritenutaId, posizioneRitenuta.id)
  assert.equal(result.ritenutaDraft.dataPagamento, '2026-06-30')
  assert.equal(result.ritenutaDraft.dataScadenza, '2026-07-16')
})

test('pagamento senza conto Erario configurato viene bloccato', () => {
  const result = buildPayment({ erario: false })
  assert.equal(result.validation.status, 'blocked')
  assert.ok(result.validation.blockers.some((item) => item.includes('Debiti v/Erario')))
})

test('pagamento parziale con ritenuta viene bloccato', () => {
  const result = buildPayment({ importoChiusura: 600 })
  assert.equal(result.validation.status, 'blocked')
  assert.ok(result.validation.blockers.includes('pagamento parziale ritenute non ancora supportato'))
})

test('persistenza chiude la partita e matura la ritenuta senza duplicarla', async () => {
  const result = buildPayment()
  const db = new MockDb()
  const persisted = await persistPrimaNotaDraft({ db, draft: result.draft })
  assert.equal(persisted.error, null)

  const partUpdate = db.log.find((entry) => entry.action === 'update' && entry.table === 'partitario')
  assert.ok(partUpdate)
  assert.equal(partUpdate.data.importo_pagato, 1268.8)
  assert.equal(partUpdate.data.importo_residuo, 0)
  assert.equal(partUpdate.data.stato, 'chiusa')

  const ritenutaUpdate = db.log.find((entry) => entry.action === 'update' && entry.table === 'ritenute_dacconto')
  assert.ok(ritenutaUpdate)
  assert.equal(ritenutaUpdate.data.stato, 'da_versare')
  assert.equal(ritenutaUpdate.data.data_pagamento, '2026-06-30')
  assert.equal(ritenutaUpdate.data.data_scadenza, '2026-07-16')
  assert.equal(ritenutaUpdate.data.codice_tributo, '1040')
  assert.equal(ritenutaUpdate.data.inclusa_cu, true)
  assert.equal(ritenutaUpdate.data.prima_nota_pagamento_id, 'prima_nota-id')
  assert.equal(db.log.some((entry) => entry.action === 'insert' && entry.table === 'ritenute_dacconto'), false)
})
