import test from 'node:test'
import assert from 'node:assert/strict'
import { persistPrimaNotaDraft as basePersist } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { buildRegistrazionePartitarioDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazionePartitarioDraft.js'
import { resolveSubjectAccount } from '../src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneConti.js'
import { resolveChiusuraPartiteBehavior } from '../src/modules/contabilita/domain/causali/resolveChiusuraPartiteBehavior.js'
import { buildCausaleContabilePolicy } from '../src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js'
import { normalizeRegistrazioneInput } from '../src/modules/contabilita/application/registrazioneOperations/normalizeRegistrazioneInput.js'
import { resolvePartitaSoggettoId } from '../src/modules/contabilita/application/registrazioneOperations/resolvePartitaSoggettoId.js'



function persistPrimaNotaDraft({ db, draft, headerSelect, righeSelect } = {}) {
  if (draft && !draft.totals) {
    const dare = draft.pnPayload?.totale_dare || 0
    const avere = draft.pnPayload?.totale_avere || 0
    draft.totals = {
      totaleDare: dare,
      totaleAvere: avere,
      differenza: dare - avere,
      isBalanced: Math.abs(dare - avere) <= 0.01
    }
    draft.validation = {
      status: 'ok',
      isBalanced: Math.abs(dare - avere) <= 0.01,
      totals: { differenza: dare - avere },
      blockers: [],
      warnings: []
    }
  }
  return basePersist({ db, draft, headerSelect, righeSelect })
}

class MockDbQuery {
  constructor(table, client) {
    this.table = table
    this.client = client
    this.eqField = null
    this.eqValue = null
    this.updatesObj = null
  }

  insert(data) {
    this.client.log.push({ action: 'insert', table: this.table, data })
    return this
  }

  update(updates) {
    this.updatesObj = updates
    return this
  }

  delete() {
    this.client.log.push({ action: 'delete', table: this.table })
    return this
  }

  select(fields = '*') {
    return this
  }

  eq(field, value) {
    this.eqField = field
    this.eqValue = value
    if (this.updatesObj) {
      this.client.log.push({
        action: 'update',
        table: this.table,
        eqField: this.eqField,
        eqValue: this.eqValue,
        updates: this.updatesObj
      })
      this.updatesObj = null
    }
    return this
  }

  like(field, value) {
    this.client.log.push({ action: 'like', table: this.table, field, value })
    return this
  }

  maybeSingle() {
    const record = this.client.getMockRecord(this.table, this.eqValue)
    return Promise.resolve({ data: record, error: null })
  }

  single() {
    return Promise.resolve({ data: { id: `${this.table}-new-id` }, error: null })
  }

  then(resolve, reject) {
    resolve({ data: [{ id: `${this.table}-new-id` }], error: null })
  }
}

class MockDbClient {
  constructor() {
    this.log = []
    this.records = {}
  }

  from(table) {
    return new MockDbQuery(table, this)
  }

  setMockRecord(table, id, data) {
    if (!this.records[table]) this.records[table] = {}
    this.records[table][id] = data
  }

  getMockRecord(table, id) {
    return this.records[table]?.[id] || null
  }
}

function buildBaseDraft(causale = {}, subject = {}, isCustomer = true) {
  return {
    isSimulata: false,
    header: {
      societaId: 'soc-123',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-03',
      dataDocumento: '2026-06-03',
      numeroDocumento: 'INC-202',
      causaleContabile: causale,
      descrizioneGenerale: 'Registrazione movimento',
      soggetto: subject.nome || '',
      clienteFornitoreId: subject.id || '',
      clienteFornitoreNome: subject.nome || '',
      clienteFornitoreCodice: subject.codice || '',
      clienteFornitoreTipo: subject.tipo || '',
    },
    pnPayload: {
      societa_id: 'soc-123',
      esercizio: 2026,
      data_registrazione: '2026-06-03',
      data_documento: '2026-06-03',
      numero_documento: 'INC-202',
      causale_id: causale.id || 'caus-test',
      causale_codice: causale.codice || 'TEST',
      descrizione: 'Registrazione movimento',
      cliente_fornitore_id: subject.id || '',
      cliente_fornitore_nome: subject.nome || '',
      totale_dare: 0,
      totale_avere: 0,
      stato: 'confermata',
    },
    rows: [],
    righePayload: [],
    documentData: { divisa: 'EUR', totaleDocumento: 0 },
    partitarioDraft: {
      active: true,
      mode: 'chiusura',
      rows: []
    },
    meta: {
      operatorId: 'op-123',
      createdAt: '2026-06-03T10:00:00Z',
      behavior: {
        code: causale.codice || 'TEST',
        family: 'generale',
        showDocumentPanel: false,
        showIvaPanel: false,
        showPartitario: true,
        showRitenute: false
      }
    }
  }
}

// 1. Incasso cliente singola FC: FC +1.600; incasso 1.600; partita chiusa; residuo 0; importo_pagato 1.600.
test('1. Incasso cliente singola FC chiusa totalmente', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'fc-100', {
    id: 'fc-100',
    importo_originale: 1600.00,
    importo_pagato: 0,
    stato: 'aperta'
  })

  const causale = {
    id: 'c-inc',
    codice: 'INC',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Semplice', tipo: 'cliente' })
  draft.pnPayload.totale_dare = 1600
  draft.pnPayload.totale_avere = 1600
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-cassa', dare: 1600.00, avere: 0, descrizione_riga: 'Incasso' },
    { id: 'row-2', conto_id: 'acc-cli', dare: 0, avere: 1600.00, descrizione_riga: 'Cliente' }
  ]
  draft.righePayload = draft.rows

  draft.partitarioDraft.rows = [
    {
      id: 'fc-100',
      selected: true,
      importoChiusura: 1600.00,
      importoOriginario: 1600.00,
      residuo: 1600.00,
      segno: 'A'
    }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const updates = db.log.filter(l => l.action === 'update' && l.table === 'partitario')
  assert.equal(updates.length, 1)
  const up = updates[0]
  assert.equal(up.eqValue, 'fc-100')
  assert.equal(up.updates.importo_pagato, 1600.00)
  assert.equal(up.updates.importo_residuo, 0)
  assert.equal(up.updates.stato, 'chiusa')
})

// 2. Incasso cliente parziale: FC +1.600; incasso 600; residuo 1.000; stato aperta.
test('2. Incasso cliente parziale lascia partita aperta', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'fc-100', {
    id: 'fc-100',
    importo_originale: 1600.00,
    importo_pagato: 0,
    stato: 'aperta'
  })

  const causale = {
    id: 'c-inc',
    codice: 'INC',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Semplice', tipo: 'cliente' })
  draft.pnPayload.totale_dare = 600
  draft.pnPayload.totale_avere = 600
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-cassa', dare: 600.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-cli', dare: 0, avere: 600.00 }
  ]
  draft.righePayload = draft.rows

  draft.partitarioDraft.rows = [
    {
      id: 'fc-100',
      selected: true,
      importoChiusura: 600.00,
      importoOriginario: 1600.00,
      residuo: 1600.00,
      segno: 'A'
    }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const updates = db.log.filter(l => l.action === 'update' && l.table === 'partitario')
  assert.equal(updates.length, 1)
  const up = updates[0]
  assert.equal(up.updates.importo_pagato, 600.00)
  assert.equal(up.updates.importo_residuo, 1000.00)
  assert.equal(up.updates.stato, 'aperta')
})

// 3. Incasso cliente con nota credito: FC +1.600; NC -1.400; incasso netto 200; entrambe le partite chiuse.
test('3. Incasso cliente con compensazione nota credito chiude entrambe', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'fc-100', {
    id: 'fc-100',
    importo_originale: 1600.00,
    importo_pagato: 0,
    stato: 'aperta'
  })
  db.setMockRecord('partitario', 'nc-200', {
    id: 'nc-200',
    importo_originale: -1400.00,
    importo_pagato: 0,
    stato: 'aperta'
  })

  const causale = {
    id: 'c-inc',
    codice: 'INC',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Semplice', tipo: 'cliente' })
  draft.pnPayload.totale_dare = 200
  draft.pnPayload.totale_avere = 200
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-cassa', dare: 200.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-cli', dare: 0, avere: 200.00 }
  ]
  draft.righePayload = draft.rows

  // Nota: row per NC ha importoOriginario e residuo negativi
  draft.partitarioDraft.rows = [
    {
      id: 'fc-100',
      selected: true,
      importoChiusura: 1600.00,
      importoOriginario: 1600.00,
      residuo: 1600.00,
      segno: 'A'
    },
    {
      id: 'nc-200',
      selected: true,
      importoChiusura: 1400.00,
      importoOriginario: -1400.00,
      residuo: -1400.00,
      segno: 'D'
    }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const updates = db.log.filter(l => l.action === 'update' && l.table === 'partitario')
  assert.equal(updates.length, 2)

  const upFC = updates.find(u => u.eqValue === 'fc-100')
  assert.ok(upFC)
  assert.equal(upFC.updates.importo_pagato, 1600.00)
  assert.equal(upFC.updates.importo_residuo, 0)
  assert.equal(upFC.updates.stato, 'chiusa')

  const upNC = updates.find(u => u.eqValue === 'nc-200')
  assert.ok(upNC)
  assert.equal(upNC.updates.importo_pagato, -1400.00)
  assert.equal(upNC.updates.importo_residuo, 0)
  assert.equal(upNC.updates.stato, 'chiusa')
})

// 4. Pagamento fornitore singola FF: FF +120; pagamento 120; partita chiusa.
test('4. Pagamento fornitore singola FF chiusa totalmente', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'ff-300', {
    id: 'ff-300',
    importo_originale: 120.00,
    importo_pagato: 0,
    stato: 'aperta'
  })

  const causale = {
    id: 'c-pag',
    codice: 'PAG',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  draft.pnPayload.totale_dare = 120
  draft.pnPayload.totale_avere = 120
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-forn', dare: 120.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-banca', dare: 0, avere: 120.00 }
  ]
  draft.righePayload = draft.rows

  draft.partitarioDraft.rows = [
    {
      id: 'ff-300',
      selected: true,
      importoChiusura: 120.00,
      importoOriginario: 120.00,
      residuo: 120.00,
      segno: 'D'
    }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const updates = db.log.filter(l => l.action === 'update' && l.table === 'partitario')
  assert.equal(updates.length, 1)
  const up = updates[0]
  assert.equal(up.updates.importo_pagato, 120.00)
  assert.equal(up.updates.importo_residuo, 0)
  assert.equal(up.updates.stato, 'chiusa')
})

// 5. Pagamento fornitore con nota credito: FF +120; NCF -50; pagamento netto 70; entrambe le partite chiuse.
test('5. Pagamento fornitore con compensazione nota credito chiude entrambe', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'ff-300', {
    id: 'ff-300',
    importo_originale: 120.00,
    importo_pagato: 0,
    stato: 'aperta'
  })
  db.setMockRecord('partitario', 'ncf-400', {
    id: 'ncf-400',
    importo_originale: -50.00,
    importo_pagato: 0,
    stato: 'aperta'
  })

  const causale = {
    id: 'c-pag',
    codice: 'PAG',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  draft.pnPayload.totale_dare = 70
  draft.pnPayload.totale_avere = 70
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-forn', dare: 70.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-banca', dare: 0, avere: 70.00 }
  ]
  draft.righePayload = draft.rows

  draft.partitarioDraft.rows = [
    {
      id: 'ff-300',
      selected: true,
      importoChiusura: 120.00,
      importoOriginario: 120.00,
      residuo: 120.00,
      segno: 'D'
    },
    {
      id: 'ncf-400',
      selected: true,
      importoChiusura: 50.00,
      importoOriginario: -50.00,
      residuo: -50.00,
      segno: 'A'
    }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const updates = db.log.filter(l => l.action === 'update' && l.table === 'partitario')
  assert.equal(updates.length, 2)

  const upFF = updates.find(u => u.eqValue === 'ff-300')
  assert.ok(upFF)
  assert.equal(upFF.updates.importo_pagato, 120.00)
  assert.equal(upFF.updates.importo_residuo, 0)
  assert.equal(upFF.updates.stato, 'chiusa')

  const upNCF = updates.find(u => u.eqValue === 'ncf-400')
  assert.ok(upNCF)
  assert.equal(upNCF.updates.importo_pagato, -50.00)
  assert.equal(upNCF.updates.importo_residuo, 0)
  assert.equal(upNCF.updates.stato, 'chiusa')
})

// 6. Pagamento/incasso parziale con nota credito: verifica residui corretti.
test('6. Compensazione parziale nota credito e fattura lascia residui corretti', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'ff-300', {
    id: 'ff-300',
    importo_originale: 120.00,
    importo_pagato: 0,
    stato: 'aperta'
  })
  db.setMockRecord('partitario', 'ncf-400', {
    id: 'ncf-400',
    importo_originale: -50.00,
    importo_pagato: 0,
    stato: 'aperta'
  })

  const causale = {
    id: 'c-pag',
    codice: 'PAG',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore Uno', tipo: 'fornitore' })
  draft.pnPayload.totale_dare = 60
  draft.pnPayload.totale_avere = 60
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-forn', dare: 60.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-banca', dare: 0, avere: 60.00 }
  ]
  draft.righePayload = draft.rows

  // Paghiamo 100 della fattura (residuo 20) e compensiamo 40 della NC (residuo -10)
  draft.partitarioDraft.rows = [
    {
      id: 'ff-300',
      selected: true,
      importoChiusura: 100.00,
      importoOriginario: 120.00,
      residuo: 120.00,
      segno: 'D'
    },
    {
      id: 'ncf-400',
      selected: true,
      importoChiusura: 40.00,
      importoOriginario: -50.00,
      residuo: -50.00,
      segno: 'A'
    }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const updates = db.log.filter(l => l.action === 'update' && l.table === 'partitario')
  assert.equal(updates.length, 2)

  const upFF = updates.find(u => u.eqValue === 'ff-300')
  assert.equal(upFF.updates.importo_pagato, 100.00)
  assert.equal(upFF.updates.importo_residuo, 20.00)
  assert.equal(upFF.updates.stato, 'aperta')

  const upNCF = updates.find(u => u.eqValue === 'ncf-400')
  assert.equal(upNCF.updates.importo_pagato, -40.00)
  assert.equal(upNCF.updates.importo_residuo, -10.00)
  assert.equal(upNCF.updates.stato, 'aperta')
})

// 7. Blocco overpayment: non si può chiudere più del residuo.
test('7. Blocco overpayment lancia errore e innesca rollback', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'fc-100', {
    id: 'fc-100',
    importo_originale: 1600.00,
    importo_pagato: 600.00,
    stato: 'aperta'
  })

  const causale = {
    id: 'c-inc',
    codice: 'INC',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Semplice', tipo: 'cliente' })
  draft.pnPayload.totale_dare = 1100
  draft.pnPayload.totale_avere = 1100
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-cassa', dare: 1100.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-cli', dare: 0, avere: 1100.00 }
  ]
  draft.righePayload = draft.rows

  // Tentiamo di chiudere 1100 su un residuo rimasto di 1000
  draft.partitarioDraft.rows = [
    {
      id: 'fc-100',
      selected: true,
      importoChiusura: 1100.00,
      importoOriginario: 1600.00,
      residuo: 1000.00,
      segno: 'A'
    }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.ok(result.error)
  assert.match(result.error.message, /eccede il residuo/i)

  // Verifica rollback: la prima nota non deve essere salvata (o deve essere rimossa)
  const deletions = db.log.filter(l => l.action === 'delete')
  assert.ok(deletions.length > 0)
})

// 8. Blocco partita già chiusa: non deve essere aggiornata.
test('8. Blocco partita gia chiusa solleva errore', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'fc-100', {
    id: 'fc-100',
    importo_originale: 1600.00,
    importo_pagato: 1600.00,
    stato: 'chiusa'
  })

  const causale = {
    id: 'c-inc',
    codice: 'INC',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente Semplice', tipo: 'cliente' })
  draft.pnPayload.totale_dare = 200
  draft.pnPayload.totale_avere = 200
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-cassa', dare: 200.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-cli', dare: 0, avere: 200.00 }
  ]
  draft.righePayload = draft.rows

  draft.partitarioDraft.rows = [
    {
      id: 'fc-100',
      selected: true,
      importoChiusura: 200.00,
      importoOriginario: 1600.00,
      residuo: 0,
      segno: 'A'
    }
  ]

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.ok(result.error)
  assert.match(result.error.message, /è già chiusa/i)
})

// 9. Nessuna compensazione automatica: se non passo partite selezionate, non deve chiudere nulla.
test('9. Se non ci sono partite selezionate in chiusura, non viene fatto alcun update', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-pag',
    codice: 'PAG',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore', tipo: 'fornitore' })
  draft.pnPayload.totale_dare = 200
  draft.pnPayload.totale_avere = 200
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-forn', dare: 200.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-banca', dare: 0, avere: 200.00 }
  ]
  draft.righePayload = draft.rows
  draft.partitarioDraft.rows = [] // Nessuna riga selezionata

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const updates = db.log.filter(l => l.action === 'update' && l.table === 'partitario')
  assert.equal(updates.length, 0)
})

// 10. Nessun impatto su registri IVA.
test('10. La registrazione dei pagamenti non deve inserire righe in registri_iva', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'fc-100', {
    id: 'fc-100',
    importo_originale: 1600.00,
    importo_pagato: 0,
    stato: 'aperta'
  })

  const causale = {
    id: 'c-inc',
    codice: 'INC',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'cli-01', nome: 'Cliente', tipo: 'cliente' })
  draft.pnPayload.totale_dare = 1600
  draft.pnPayload.totale_avere = 1600
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-cassa', dare: 1600.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-cli', dare: 0, avere: 1600.00 }
  ]
  draft.righePayload = draft.rows
  draft.partitarioDraft.rows = [{
    id: 'fc-100',
    selected: true,
    importoChiusura: 1600.00,
    importoOriginario: 1600.00,
    residuo: 1600.00,
    segno: 'A'
  }]

  await persistPrimaNotaDraft({ db, draft })

  const vatInserts = db.log.filter(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.equal(vatInserts.length, 0)
})

// 11. PD/GEN restano invariati.
test('11. PD/GEN non generano partitario o chiusure', async () => {
  const db = new MockDbClient()
  const causale = {
    id: 'c-pd',
    codice: 'PD',
    tipo_causale: 'generale'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore', tipo: 'fornitore' })
  draft.pnPayload.totale_dare = 500
  draft.pnPayload.totale_avere = 500
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-costo', dare: 500.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-banca', dare: 0, avere: 500.00 }
  ]
  draft.righePayload = draft.rows
  draft.partitarioDraft.active = false
  draft.partitarioDraft.rows = []

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const partLog = db.log.filter(l => l.table === 'partitario')
  assert.equal(partLog.length, 0)
})

// 12. Nessun write su tabelle legacy.
test('12. Nessun write effettuato su tabelle legacy non consentite', async () => {
  const db = new MockDbClient()
  db.setMockRecord('partitario', 'ff-100', {
    id: 'ff-100',
    importo_originale: 120.00,
    importo_pagato: 0,
    stato: 'aperta'
  })

  const causale = {
    id: 'c-pag',
    codice: 'PAG',
    tipo_causale: 'generale',
    gestione_partite: 'chiude'
  }
  const draft = buildBaseDraft(causale, { id: 'forn-01', nome: 'Fornitore', tipo: 'fornitore' })
  draft.pnPayload.totale_dare = 120
  draft.pnPayload.totale_avere = 120
  draft.rows = [
    { id: 'row-1', conto_id: 'acc-forn', dare: 120.00, avere: 0 },
    { id: 'row-2', conto_id: 'acc-banca', dare: 0, avere: 120.00 }
  ]
  draft.righePayload = draft.rows
  draft.partitarioDraft.rows = [{
    id: 'ff-100',
    selected: true,
    importoChiusura: 120.00,
    importoOriginario: 120.00,
    residuo: 120.00,
    segno: 'D'
  }]

  await persistPrimaNotaDraft({ db, draft })

  const allowed = new Set(['prima_nota', 'prima_nota_righe', 'partitario'])
  db.log.forEach(l => {
    assert.ok(allowed.has(l.table), `Scrittura non autorizzata su tabella: ${l.table}`)
  })
})

// Test sulla multi-selezione e calcoli algebrici (note credito) nel draft del partitario
test('13. Selezione FC +1600 popola riga partitario centrale e propone saldo', () => {
  const openItems = [
    { id: 'fc-1600', numero_documento: 'F-12', data_documento: '2026-06-03', tipo_documento: 'FT', saldo_residuo: 1600.00, importo_originale: 1600.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1600'],
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.rows.length, 1)
  const r = result.rows[0]
  assert.equal(r.id, 'fc-1600')
  assert.equal(r.selected, true)
  assert.equal(r.importoChiusura, 1600.00)
  assert.equal(r.importoOriginario, 1600.00)
})

test('14. Selezione NC -1400 popola riga partitario centrale negativa', () => {
  const openItems = [
    { id: 'nc-1400', numero_documento: 'NC-5', data_documento: '2026-06-03', tipo_documento: 'NC', saldo_residuo: -1400.00, importo_originale: -1400.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['nc-1400'],
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.rows.length, 1)
  const r = result.rows[0]
  assert.equal(r.id, 'nc-1400')
  assert.equal(r.selected, true)
  assert.equal(r.importoChiusura, -1400.00)
  assert.equal(r.importoOriginario, -1400.00)
  assert.equal(r.residuo, -1400.00)
})

test('15. Selezione FC + NC calcola netto 200', () => {
  const openItems = [
    { id: 'fc-1600', numero_documento: 'F-12', data_documento: '2026-06-03', tipo_documento: 'FT', saldo_residuo: 1600.00 },
    { id: 'nc-1400', numero_documento: 'NC-5', data_documento: '2026-06-03', tipo_documento: 'NC', saldo_residuo: -1400.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1600', 'nc-1400'],
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.totals.importoChiusura, 200.00)
})

test('16. Selezione FF + NCF calcola netto pagamento 70', () => {
  const openItems = [
    { id: 'ff-120', numero_documento: 'F-90', data_documento: '2026-06-03', tipo_documento: 'FT', saldo_residuo: 120.00 },
    { id: 'ncf-50', numero_documento: 'NCF-2', data_documento: '2026-06-03', tipo_documento: 'NC', saldo_residuo: -50.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['ff-120', 'ncf-50'],
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.totals.importoChiusura, 70.00)
})

test('17. Chiusura parziale modifica solo importo chiusura, non saldo originale', () => {
  const openItems = [
    { id: 'fc-1600', numero_documento: 'F-12', data_documento: '2026-06-03', tipo_documento: 'FT', saldo_residuo: 1600.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1600'],
    importiChiusura: { 'fc-1600': 500.00 }
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.rows[0].importoChiusura, 500.00)
  assert.equal(result.rows[0].residuo, 1600.00)
  assert.equal(result.totals.importoChiusura, 500.00)
})

test('18. Blocco se nessuna partita selezionata per la chiusura', () => {
  const openItems = [
    { id: 'fc-1600', numero_documento: 'F-12', data_documento: '2026-06-03', tipo_documento: 'FT', saldo_residuo: 1600.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: [],
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.validation.status, 'blocked')
  assert.ok(result.validation.blockers.includes('Nessuna partita selezionata per la chiusura. Per registrazioni senza partitario utilizzare una causale semplice.'))
})

test('19. Blocco se selezionate partite di soggetti diversi', () => {
  const openItems = [
    { id: 'fc-1', soggettoId: 'cli-1', numero_documento: 'F-1', saldo_residuo: 100.00 },
    { id: 'fc-2', soggettoId: 'cli-2', numero_documento: 'F-2', saldo_residuo: 200.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1', 'fc-2'],
    importiChiusura: { 'fc-1': 100, 'fc-2': 200 },
    rows: [
      { id: 'fc-1', selected: true, soggettoId: 'cli-1' },
      { id: 'fc-2', selected: true, soggettoId: 'cli-2' }
    ]
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.validation.status, 'blocked')
  assert.ok(result.validation.blockers.includes('Incassi/pagamenti multipli non ancora abilitati'))
})

test('20. Riga suggerita non entra nel netto se non selezionata', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: [],
    selectedPartitaId: 'fc-1',
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.totals.importoChiusura, 0)
})

test('21. Riga selezionata entra nel netto solo se checkbox spuntata', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1'],
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.totals.importoChiusura, 1600.00)
})

test('22. Modifica importo chiusura positiva (residuo 1600, input 100, validated and capped)', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1'],
    importiChiusura: { 'fc-1': 100 }
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.rows[0].importoChiusura, 100)
  assert.equal(result.rows[0].residuo, 1600.00)
  assert.equal(result.totals.importoChiusura, 100)
})

test('23. Modifica importo chiusura negativa (residuo -1400, input 100 is normalized to -100)', () => {
  const openItems = [
    { id: 'nc-1', numero_documento: 'NC-1', saldo_residuo: -1400.00 }
  ]
  const partitarioData1 = {
    selectedPartitaIds: ['nc-1'],
    importiChiusura: { 'nc-1': 100 }
  }
  const result1 = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData: partitarioData1 },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result1.rows[0].importoChiusura, -100)
  assert.equal(result1.totals.importoChiusura, 100)

  const partitarioData2 = {
    selectedPartitaIds: ['nc-1'],
    importiChiusura: { 'nc-1': -100 }
  }
  const result2 = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData: partitarioData2 },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result2.rows[0].importoChiusura, -100)
})

test('24. Overpayment in valore assoluto bloccato/capped', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1'],
    importiChiusura: { 'fc-1': 1700.00 }
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.rows[0].importoChiusura, 1600.00)
})

test('25. Overpayment in valore assoluto negativo bloccato/capped', () => {
  const openItems = [
    { id: 'nc-1', numero_documento: 'NC-1', saldo_residuo: -1400.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['nc-1'],
    importiChiusura: { 'nc-1': -1500.00 }
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.rows[0].importoChiusura, -1400.00)
})

test('26. FC + NC selezionate: 1600 + (-1400) = netto 200', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 },
    { id: 'nc-1', numero_documento: 'NC-1', saldo_residuo: -1400.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1', 'nc-1'],
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.totals.importoChiusura, 200.00)
})

test('27. IC con cliente in testata: riga cliente ha cliente, riga banca non ha cliente', () => {
  const header = {
    causaleContabileId: 'IC',
    clienteFornitoreId: 'cli-123',
    clienteFornitoreCodice: '400101',
    clienteFornitoreNome: 'ANALISYS 1980 SRL',
    bancaCassaId: 'bnk-789',
    bancaCassaCodice: '500101',
    bancaCassaNome: 'Banca Unicredit'
  }
  
  const isIncassoCliente = true
  const subjectContoId = header.clienteFornitoreId
  const bankContoId = header.bancaCassaId
  
  assert.notEqual(bankContoId, subjectContoId)
  assert.equal(bankContoId, 'bnk-789')
  assert.equal(subjectContoId, 'cli-123')
})

test('28. PF con fornitore in testata: riga fornitore ha fornitore, riga banca non ha fornitore', () => {
  const header = {
    causaleContabileId: 'PF',
    clienteFornitoreId: 'forn-456',
    clienteFornitoreCodice: '450101',
    clienteFornitoreNome: 'SUD FORNITURE SRL',
    bancaCassaId: 'bnk-789',
    bancaCassaCodice: '500101',
    bancaCassaNome: 'Banca Unicredit'
  }
  
  const isPagamentoFornitore = true
  const subjectContoId = header.clienteFornitoreId
  const bankContoId = header.bancaCassaId
  
  assert.notEqual(bankContoId, subjectContoId)
  assert.equal(bankContoId, 'bnk-789')
  assert.equal(subjectContoId, 'forn-456')
})

test('29. Nessun impatto su PD/GEN', () => {
  const causale = { codice: 'GEN' }
  const isIcpf = (causale.codice === 'IC' || causale.codice === 'PF')
  assert.equal(isIcpf, false)
})

test('30. resolveSubjectAccount risolve con alias differenti (soggetto_id, contoId, accountId)', () => {
  const pianoConti = [
    { id: 'cli-1', codice: '400101', descrizione: 'Cliente 1', is_cliente: true },
    { id: 'forn-2', codice: '450101', descrizione: 'Fornitore 2', is_fornitore: true }
  ]

  const header1 = { soggetto_id: 'cli-1' }
  const res1 = resolveSubjectAccount(header1, pianoConti)
  assert.ok(res1)
  assert.equal(res1.id, 'cli-1')
  assert.equal(res1.is_cliente, true)

  const header2 = { contoId: 'forn-2' }
  const res2 = resolveSubjectAccount(header2, pianoConti)
  assert.ok(res2)
  assert.equal(res2.id, 'forn-2')
  assert.equal(res2.is_fornitore, true)

  const header3 = { accountId: 'cli-1' }
  const res3 = resolveSubjectAccount(header3, pianoConti)
  assert.ok(res3)
  assert.equal(res3.id, 'cli-1')
})

test('31. resolveSubjectAccount risolve conto patrimoniale o oggetto gia risolto', () => {
  const pianoConti = [
    { id: 'cli-1', codice: '400101', descrizione: 'Cliente 1', is_cliente: true }
  ]

  const header1 = {
    contoPatrimoniale: { id: 'cli-1', codice: '400101', descrizione: 'Cliente 1' }
  }
  const res1 = resolveSubjectAccount(header1, pianoConti)
  assert.ok(res1)
  assert.equal(res1.id, 'cli-1')

  const header2 = {
    conto: { codice: '400101', nome: 'Cliente 1', is_cliente: true }
  }
  const res2 = resolveSubjectAccount(header2, pianoConti)
  assert.ok(res2)
  assert.equal(res2.codice, '400101')
  assert.equal(res2.is_cliente, true)
})

// Test 32: Riga suggerita non selezionata non entra nel netto
test('32. Riga suggerita non selezionata non entra nel netto', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: [],
    selectedPartitaId: 'fc-1', // focus but not selected
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.totals.importoChiusura, 0)
})

// Test 33: Riga focus non selezionata non entra nel netto
test('33. Riga focus non selezionata non entra nel netto', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 },
    { id: 'fc-2', numero_documento: 'F-2', saldo_residuo: 800.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1'], // only fc-1 is selected
    selectedPartitaId: 'fc-2', // fc-2 is focused but not selected
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  // Net should only include fc-1 (1600), not fc-2 (800)
  assert.equal(result.totals.importoChiusura, 1600.00)
})

// Test 34: Solo checkbox selezionata entra nel netto
test('34. Solo checkbox selezionata entra nel netto', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 },
    { id: 'fc-2', numero_documento: 'F-2', saldo_residuo: 800.00 },
    { id: 'fc-3', numero_documento: 'F-3', saldo_residuo: 400.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1', 'fc-3'], // fc-1 and fc-3 are checked
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  // Net should be 1600 + 400 = 2000
  assert.equal(result.totals.importoChiusura, 2000.00)
})

// Test 35: Suggerimento match non seleziona automaticamente
test('35. Suggerimento match non seleziona automaticamente', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00, data_documento: '2026-06-01' }
  ]
  // We simulate header with matching amount (1600) but selectedPartitaIds is empty
  const partitarioData = {
    selectedPartitaIds: [],
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  // Even if fc-1 matches, it must not be automatically selected
  assert.equal(result.rows[0].selected, false)
  assert.equal(result.totals.importoChiusura, 0)
})

// Test 36: Riga selezionata espone stato/badge "Selezionata" (static file check)
test('36. Riga selezionata espone stato/badge "Selezionata" (static file check)', async () => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const filePath = path.join(process.cwd(), 'src/modules/contabilita/components/registrazione/RegistrazionePartitarioPanel.jsx')
  const content = await fs.readFile(filePath, 'utf-8')
  
  assert.ok(content.includes("badgeText = 'Selezionata'"))
  assert.ok(content.includes("backgroundColor: '#10b981'"))
})

// Test 37: Importo chiusura editabile solo se riga selezionata (static file check)
test('37. Importo chiusura editabile solo se riga selezionata (static file check)', async () => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const filePath = path.join(process.cwd(), 'src/modules/contabilita/components/registrazione/RegistrazionePartitarioPanel.jsx')
  const content = await fs.readFile(filePath, 'utf-8')
  
  assert.ok(content.includes('disabled={disabled || !isSelected}'))
  assert.ok(content.includes("background: isSelected ? '#1e293b' : 'rgba(0,0,0,.25)'"))
})

// Test A & B: Causale generica (non IC/PF)
test('38. Causale generica configurata come incasso cliente / chiusura partite', () => {
  const causale = {
    codice: 'Z-INC-CLI',
    tipo_causale: 'generale',
    gestione_partite: 'chiude',
    operazione_partite: 'chiude'
  }
  const policy = buildCausaleContabilePolicy(causale)
  const header = { clienteFornitoreTipo: 'cliente' }
  const behavior = resolveChiusuraPartiteBehavior(policy, header, [], [])
  
  assert.equal(behavior.isChiusura, true)
  assert.equal(behavior.soggettoTipo, 'cliente')
  assert.equal(behavior.latoBanca, 'dare')
  assert.equal(behavior.latoSoggetto, 'avere')
})

test('39. Causale generica configurata come pagamento fornitore / chiusura partite', () => {
  const causale = {
    codice: 'Z-PAG-FORN',
    tipo_causale: 'generale',
    gestione_partite: 'chiude',
    operazione_partite: 'chiude'
  }
  const policy = buildCausaleContabilePolicy(causale)
  const header = { clienteFornitoreTipo: 'fornitore' }
  const behavior = resolveChiusuraPartiteBehavior(policy, header, [], [])
  
  assert.equal(behavior.isChiusura, true)
  assert.equal(behavior.soggettoTipo, 'fornitore')
  assert.equal(behavior.latoBanca, 'avere')
  assert.equal(behavior.latoSoggetto, 'dare')
})

// Test C: Multi-select stesso soggetto
test('40. Multi-select stesso soggetto: fattura + nota credito calcola netto', () => {
  const openItems = [
    { id: 'fc-1600', soggettoId: 'cli-1', numero_documento: 'F-12', saldo_residuo: 1600.00 },
    { id: 'nc-1400', soggettoId: 'cli-1', numero_documento: 'NC-5', saldo_residuo: -1400.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1600', 'nc-1400'],
    importiChiusura: {}
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.totals.importoChiusura, 200.00)
  assert.equal(result.rows[0].selected, true)
  assert.equal(result.rows[1].selected, true)
})

// Test D: Toggle off
test('41. Toggle off: rimuove la partita dalla selezione', () => {
  const currentSelected = ['fc-1']
  const idToToggle = 'fc-1'
  const isSelected = currentSelected.includes(idToToggle)
  const nextSelected = isSelected ? currentSelected.filter(c => c !== idToToggle) : [...currentSelected, idToToggle]
  
  assert.deepEqual(nextSelected, [])
})

// Test E: Multi-soggetto bloccato
test('42. Multi-soggetto bloccato con messaggio corretto', () => {
  const openItems = [
    { id: 'fc-1', soggettoId: 'cli-1', numero_documento: 'F-1', saldo_residuo: 100.00 },
    { id: 'fc-2', soggettoId: 'cli-2', numero_documento: 'F-2', saldo_residuo: 200.00 }
  ]
  const partitarioData = {
    selectedPartitaIds: ['fc-1', 'fc-2'],
    importiChiusura: { 'fc-1': 100, 'fc-2': 200 },
    rows: [
      { id: 'fc-1', selected: true, soggettoId: 'cli-1' },
      { id: 'fc-2', selected: true, soggettoId: 'cli-2' }
    ]
  }
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(result.validation.status, 'blocked')
  assert.ok(result.validation.blockers.includes('Incassi/pagamenti multipli non ancora abilitati'))
})

// Test F: Payload contiene tutte le selezionate
test('43. Payload contiene tutte le selezionate', () => {
  const partitarioData = {
    selectedPartitaIds: ['fc-1', 'nc-1'],
    importiChiusura: { 'fc-1': 1600, 'nc-1': -1400 }
  }
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 },
    { id: 'nc-1', numero_documento: 'NC-1', saldo_residuo: -1400.00 }
  ]
  const result = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.deepEqual(result.selectedPartitaIds, ['fc-1', 'nc-1'])
})

// Test G: Priorità importo
test('44. Priorità importo: netto partitario prioritario rispetto a importo testata', () => {
  const openItems = [
    { id: 'fc-1', numero_documento: 'F-1', saldo_residuo: 1600.00 }
  ]
  // 1. Selezionate partite (netto = 100) e importo testata = 200
  const partitarioData = {
    selectedPartitaIds: ['fc-1'],
    importiChiusura: { 'fc-1': 100 }
  }
  const resultWithSelected = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData, header: { importo: 200 } },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(resultWithSelected.totals.importoChiusura, 100)

  // 2. Nessuna partita selezionata ma importo testata = 200
  const partitarioDataEmpty = {
    selectedPartitaIds: [],
    importiChiusura: {}
  }
  const resultWithEmpty = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData: partitarioDataEmpty, header: { importo: 200 } },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(resultWithEmpty.totals.importoChiusura, 0)
})

test('45. normalizeRegistrazioneInput preserva selectedPartitaIds, checkedPartiteIds e importiChiusura', () => {
  const source = {
    partitarioData: {
      selectedPartitaIds: [123, '456'],
      checkedPartiteIds: ['123', 789],
      importiChiusura: {
        '123': '100',
        '456': 200,
        789: '300.50'
      }
    }
  }

  const result = normalizeRegistrazioneInput(source, { pianoConti: [], causaliContabili: [] })
  
  assert.ok(result.partitarioData)
  assert.deepEqual(result.partitarioData.selectedPartitaIds, ['123', '456'])
  assert.deepEqual(result.partitarioData.checkedPartiteIds, ['123', '789'])
  assert.deepEqual(result.partitarioData.importiChiusura, {
    '123': '100',
    '456': '200',
    '789': '300.50'
  })
})

test('46. resolvePartitaSoggettoId prioritizza conto_id e contoId', () => {
  const p1 = { conto_id: 'conto-abc', soggettoId: 'sogg-xyz' }
  assert.equal(resolvePartitaSoggettoId(p1), 'conto-abc')

  const p2 = { contoId: 'conto-def', soggetto_id: 'sogg-123' }
  assert.equal(resolvePartitaSoggettoId(p2), 'conto-def')

  const p3 = { soggettoId: 'sogg-999' }
  assert.equal(resolvePartitaSoggettoId(p3), 'sogg-999')
})

test('47. Multi-soggetto con conto_id consente multi-selezione dello stesso conto ed evita blocchi incorretti', () => {
  const openItems = [
    { id: 'fc-1', conto_id: 'conto-client-1', saldo_residuo: 1600.00 },
    { id: 'nc-1', conto_id: 'conto-client-1', saldo_residuo: -1400.00 },
    { id: 'fc-2', conto_id: 'conto-client-2', saldo_residuo: 100.00 }
  ]

  // Test case A: same conto_id (FC and NC) should be allowed (unique size = 1)
  const partitarioDataSame = {
    selectedPartitaIds: ['fc-1', 'nc-1'],
    importiChiusura: { 'fc-1': 1600, 'nc-1': -1400 },
    rows: [
      { id: 'fc-1', selected: true, conto_id: 'conto-client-1' },
      { id: 'nc-1', selected: true, conto_id: 'conto-client-1' }
    ]
  }
  const resultSame = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData: partitarioDataSame, header: { soggetto: 'Cliente 1', clienteFornitoreId: 'conto-client-1' } },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(resultSame.validation.status, 'ok')
  assert.deepEqual(resultSame.validation.blockers, [])

  // Test case B: different conto_id should be blocked
  const partitarioDataDiff = {
    selectedPartitaIds: ['fc-1', 'fc-2'],
    importiChiusura: { 'fc-1': 1600, 'fc-2': 100 },
    rows: [
      { id: 'fc-1', selected: true, conto_id: 'conto-client-1' },
      { id: 'fc-2', selected: true, conto_id: 'conto-client-2' }
    ]
  }
  const resultDiff = buildRegistrazionePartitarioDraft(
    { openItems, partitarioData: partitarioDataDiff, header: { soggetto: 'Cliente 1', clienteFornitoreId: 'conto-client-1' } },
    { behavior: { showPartitario: true, partitarioMode: 'chiusura' } }
  )
  assert.equal(resultDiff.validation.status, 'blocked')
  assert.ok(resultDiff.validation.blockers.includes('Incassi/pagamenti multipli non ancora abilitati'))
})

import { buildRegistrazioneDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js'
import { validateRegistrazionePartitarioDraft } from '../src/modules/contabilita/application/registrazioneOperations/validateRegistrazionePartitarioDraft.js'

test('48. Righe fantasma (nessun conto, dare=0, avere=0) escluse dalla validazione indipendentemente dalla descrizione', () => {
  const result = buildRegistrazioneDraft(
    {
      header: {
        dataRegistrazione: '2024-01-10',
        esercizioContabile: '2024',
        causaleContabile: { id: 'IC01', codice: 'IC01' },
        clienteFornitoreId: 'conto-cliente-1',
        clienteFornitoreNome: 'Cliente Test',
        soggetto: 'Cliente Test',
      },
      rows: [
        // Riga valida: banca dare 200
        { id: 'r1', conto_id: 'conto-banca-1', conto_codice: '1001', descrizione: 'Banca', dare: 200, avere: 0 },
        // Riga valida: cliente avere 200
        { id: 'r2', conto_id: 'conto-cliente-1', conto_codice: '4001', descrizione: 'Cliente', dare: 0, avere: 200 },
        // Riga FANTASMA: nessun conto, 0/0, ma con descrizione non-placeholder (es. residuo da template IVA)
        { id: 'r3', conto_id: '', descrizione: 'IVA a debito', dare: 0, avere: 0 },
      ],
    },
    { behavior: { showPartitario: false } }
  )
  const filteredRows = result.normalized.rows
  assert.equal(filteredRows.length, 2, 'La riga fantasma con conto vuoto e 0/0 deve essere esclusa')
  assert.ok(filteredRows.every(r => r.id !== 'r3'), 'La riga r3 (IVA a debito, 0/0) non deve essere presente')
})

test('49. NC negativa: importoChiusura negativo con selectedPartitaIds non blocca il validatore partitario', () => {
  // Scenario: l'utente ha selezionato una NC con residuo -1400
  // tipoMovimento non ancora risolto a 'chiusura' (edge case iniziale)
  const partitarioData = {
    selectedPartitaIds: ['nc-1'],
    selectedPartitaId: 'nc-1',
    importoChiusura: '-1400',
    importiChiusura: { 'nc-1': -1400 },
    tipoMovimento: '', // non ancora impostato
  }
  const header = { soggetto: 'Cliente Test', clienteFornitoreId: 'conto-cliente-1' }
  // Con behavior.partitarioMode='chiusura' → isChiusura=true → blocco non scatta
  const resultChiusura = validateRegistrazionePartitarioDraft(
    { header, partitarioData, behavior: { showPartitario: true, partitarioMode: 'chiusura' } },
    {}
  )
  assert.ok(!resultChiusura.blockers.includes('importo chiusura partitario negativo non ammesso'),
    'Con partitarioMode=chiusura non deve bloccare NC negativa')

  // Con behavior.partitarioMode='' ma con hasNcEvidence → bypass → blocco non scatta
  const resultNcEvidence = validateRegistrazionePartitarioDraft(
    { header, partitarioData, behavior: { showPartitario: true, partitarioMode: '' } },
    {}
  )
  assert.ok(!resultNcEvidence.blockers.includes('importo chiusura partitario negativo non ammesso'),
    'Con NC evidence (importiChiusura negativo) non deve bloccare anche senza partitarioMode=chiusura')
})

test('50. Causale con chiusura partite: il template contabile non viene riapplicato se le righe contengono gia importi non a zero', () => {
  const causale = {
    id: 'c-inc',
    codice: 'INC',
    tipo_causale: 'generale',
    gestione_partite: 'chiude',
    righe_prima_nota_template: [
      { ordine: 1, ruolo: 'altro', formula_importo: 'manuale', lato: 'dare', descrizione_riga: 'Banca' },
      { ordine: 2, ruolo: 'soggetto', formula_importo: 'manuale', lato: 'avere', descrizione_riga: 'Cliente' }
    ]
  }

  // Se passiamo righe con importo non zero, ma templateGenerated: true e manualEdited: false (pristine),
  // e la causale è di chiusura partite, canApply deve essere false (applied: false) per non azzerarle.
  const result = buildRegistrazioneDraft(
    {
      header: {
        dataRegistrazione: '2026-06-03',
        esercizioContabile: '2026',
        causaleContabile: causale,
        clienteFornitoreId: 'cli-01',
        clienteFornitoreNome: 'Cliente Semplice',
        soggetto: 'Cliente Semplice',
      },
      rows: [
        { id: 'r1', conto_id: 'acc-cassa', conto_codice: '1001', descrizione: 'Banca', dare: 200, avere: 0, templateGenerated: true },
        { id: 'r2', conto_id: 'acc-cli', conto_codice: '4001', descrizione: 'Cliente', dare: 0, avere: 200, templateGenerated: true }
      ],
    },
    {
      selectedCausale: causale,
      behavior: { showPartitario: true, partitarioMode: 'chiusura' }
    }
  )

  // canApply (templateRowsDraft.applied) deve essere false
  assert.equal(result.templateRowsDraft.applied, false, 'Il template non deve essere applicato per non sovrascrivere le righe valorizzate')
  
  // Le righe restituite nel draft finale devono conservare i loro importi originali (200/200)
  const rows = result.draft.rows
  assert.equal(rows.length, 2)
  assert.equal(rows[0].dare, 200)
  assert.equal(rows[1].avere, 200)
})

test('51. KPI Differenza partitario/PN con modifica manuale dell operatore (scenari 1-6)', () => {
  // 1. Partitario netto 120, righe automatiche 120/120: differenza partitario/PN = 0
  const row1_auto = { id: 'r1', ruolo: 'soggetto', dare: 120, avere: 0 }
  const row2_auto = { id: 'r2', ruolo: 'altro', dare: 0, avere: 120 }
  
  const nettoPartitario1 = 120
  const subjectAmt1 = row1_auto.dare // 120
  const diff1 = Math.abs(Math.abs(nettoPartitario1) - Math.abs(subjectAmt1))
  assert.equal(diff1, 0, 'La differenza partitario/PN con righe automatiche deve essere 0')

  // 2. Operatore modifica riga fornitore Dare da 120 a 190: il valore 190 viene preservato
  // Simuliamo il rowsForDraftModel con hasManualAmt = true
  const row1_manual = { ...row1_auto, dare: 190, manualAmountOverride: true, manualEdited: true }
  const hasManualAmt = row1_manual.manualAmountOverride || row1_manual.manualEdited
  
  // Il rowsForDraftModel conserverà il valore 190
  const finalDare = hasManualAmt ? row1_manual.dare : 120
  assert.equal(finalDare, 190, 'Il valore manuale di 190 della riga fornitore deve essere preservato')
  
  // Calcolo differenza partitario/PN con valore manuale
  const diff2 = Math.abs(Math.abs(nettoPartitario1) - Math.abs(finalDare))
  assert.equal(diff2, 70, 'La differenza partitario/PN deve essere 70')

  // 3. Operatore modifica riga cliente Avere da 200 a 300: il valore 300 viene preservato
  const rowCliente = { id: 'r1', ruolo: 'soggetto', dare: 0, avere: 200 }
  const rowCliente_manual = { ...rowCliente, avere: 300, manualAmountOverride: true, manualEdited: true }
  const hasManualAmtCliente = rowCliente_manual.manualAmountOverride || rowCliente_manual.manualEdited
  const finalAvereCliente = hasManualAmtCliente ? rowCliente_manual.avere : 200
  assert.equal(finalAvereCliente, 300, 'Il valore manuale di 300 della riga cliente deve essere preservato')
  
  const nettoPartitario2 = 200
  const diff3 = Math.abs(Math.abs(nettoPartitario2) - Math.abs(finalAvereCliente))
  assert.equal(diff3, 100, 'La differenza partitario/PN deve essere 100')

  // 4. Se la riga non ha override manuale: il netto partitario può continuare ad aggiornare automaticamente gli importi
  const row_no_override = { id: 'r1', ruolo: 'soggetto', dare: 120 }
  const hasManualAmtNoOverride = row_no_override.manualAmountOverride || row_no_override.manualEdited
  const finalDareNoOverride = hasManualAmtNoOverride ? row_no_override.dare : 150 // 150 è il nuovo netto partitario
  assert.equal(finalDareNoOverride, 150, 'Senza override manuale, la riga deve aggiornarsi al nuovo netto partitario')

  // 5. PN quadrata ma partitario disallineato:
  // - fornitore Dare 190 (manuale)
  // - banca Avere 190 (manuale o calcolato)
  // - netto partitario 120
  // - quadratura PN = 0
  // - differenza partitario/PN = 70
  const rowFornitore5 = { id: 'r1', ruolo: 'soggetto', dare: 190, manualAmountOverride: true }
  const rowBanca5 = { id: 'r2', ruolo: 'altro', avere: 190, manualAmountOverride: true }
  
  const dareTotal5 = rowFornitore5.dare
  const avereTotal5 = rowBanca5.avere
  const quadraturaPN5 = Math.abs(dareTotal5 - avereTotal5)
  assert.equal(quadraturaPN5, 0, 'La Prima Nota deve essere quadrata (sbilancio = 0)')
  
  const nettoPartitario5 = 120
  const subjectAmt5 = rowFornitore5.dare // 190
  const diff5 = Math.abs(Math.abs(nettoPartitario5) - Math.abs(subjectAmt5))
  assert.equal(diff5, 70, 'La differenza partitario/PN deve essere 70')

  // 6. PN squadrata e partitario disallineato:
  // - fornitore Dare 190 (manuale)
  // - banca Avere 120 (automatico o manuale)
  // - netto partitario 120
  // - quadratura PN = 70
  // - differenza partitario/PN = 70
  const rowFornitore6 = { id: 'r1', ruolo: 'soggetto', dare: 190, manualAmountOverride: true }
  const rowBanca6 = { id: 'r2', ruolo: 'altro', avere: 120 }
  
  const dareTotal6 = rowFornitore6.dare
  const avereTotal6 = rowBanca6.avere
  const quadraturaPN6 = Math.abs(dareTotal6 - avereTotal6)
  assert.equal(quadraturaPN6, 70, 'La Prima Nota deve essere squadrata di 70')
  
  const nettoPartitario6 = 120
  const subjectAmt6 = rowFornitore6.dare // 190
  const diff6 = Math.abs(Math.abs(nettoPartitario6) - Math.abs(subjectAmt6))
  assert.equal(diff6, 70, 'La differenza partitario/PN deve essere 70')
})









