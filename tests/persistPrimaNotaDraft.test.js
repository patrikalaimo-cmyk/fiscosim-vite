import test from 'node:test'
import assert from 'node:assert/strict'
import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { mapRegistrazioneManualeToCanonical } from '../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js'


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

function buildValidSimplePnDraft() {
  return {
    pnPayload: {
      societa_id: 'soc-123',
      esercizio: 2026,
      data_registrazione: '2026-05-28',
      causale_id: 'caus-generale',
      causale_codice: 'GEN',
      descrizione: 'Movimento Generale Semplice',
      stato: 'bozza',
      totale_dare: 150.50,
      totale_avere: 150.50,
      created_by: 'op-123',
      created_at: '2026-05-28T23:34:24Z'
    },
    righePayload: [
      { accountId: 'acc-costo', dare: 150.50, avere: 0, descrizione_riga: 'Riga costo' },
      { accountId: 'acc-cassa', dare: 0, avere: 150.50, descrizione_riga: 'Riga cassa' }
    ],
    validation: {
      status: 'ok',
      isBalanced: true,
      totals: { differenza: 0 },
      blockers: [],
      warnings: [],
    },
    readiness: {
      status: 'pronto'
    },
    header: {
      societaId: 'soc-123',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-28',
      dataDocumento: '2026-05-28',
      causaleContabile: {
        id: 'caus-generale',
        codice: 'GEN',
        tipoCausale: 'generale',
        descrizione: 'Movimento Generale Semplice'
      },
      descrizioneGenerale: 'Registrazione generica semplice',
      clienteFornitoreId: 'acc-cliente',
      clienteFornitoreNome: 'Mario Rossi',
      clienteFornitoreCodice: 'MRORSS80A01H501U',
      clienteFornitorePartitaIva: '01234567890',
    },
    totals: {
      totaleDare: 150.50,
      totaleAvere: 150.50,
      differenza: 0,
      isBalanced: true
    },
    meta: {
      operatorId: 'op-123',
      createdAt: '2026-05-28T23:34:24Z',
      behavior: {
        code: 'GEN',
        family: 'generale',
        showDocumentPanel: false,
        showIvaPanel: false,
        showPartitario: false,
        showRitenute: false
      }
    },
    ivaDraft: {
      active: false,
      rows: []
    },
    partitarioDraft: {
      active: false,
      rows: []
    },
    ritenutaDraft: {
      active: false,
      rows: []
    }
  }
}

test('1. PN semplice valida salva testata + righe', async () => {
  const db = new MockDbClient()
  const draft = buildValidSimplePnDraft()

  let traceCaptured = false
  const originalLog = console.log
  console.log = (...args) => {
    if (args[0] === '[AUDIT_PN_SEMPLICE_TRACE]') {
      traceCaptured = true
    }
    originalLog(...args)
  }

  try {
    const result = await persistPrimaNotaDraft({ db, draft })
    assert.equal(result.error, null)
    assert.equal(result.data.prima_nota_id, 'prima_nota-new-id')
    assert.equal(result.data.numero_righe, 2)

    // Check inserts in DB log
    const inserts = db.log.filter(l => l.action === 'insert')
    assert.equal(inserts.length, 2)
    assert.equal(inserts[0].table, 'prima_nota')
    assert.equal(inserts[1].table, 'prima_nota_righe')
    assert.ok(traceCaptured, 'Il trace tecnico temporaneo dovrebbe essere emesso')
  } finally {
    console.log = originalLog
  }
})

test('2. Fallimento righe attiva cleanup della testata', async () => {
  const db = new MockDbClient()
  const draft = buildValidSimplePnDraft()

  // Configure row insert to fail
  db.insertBehaviors['prima_nota_righe'] = { data: null, error: new Error('Insert righe failed') }

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null)
  assert.ok(result.error.message.includes('Insert righe failed'))

  // Check cleanup deletes in DB log
  const deletes = db.log.filter(l => l.action === 'delete')
  assert.ok(deletes.length > 0, 'Il cleanup dovrebbe essere stato attivato')
  const deletedHeader = db.log.some(l => l.table === 'prima_nota' && l.action === 'delete')
  assert.ok(deletedHeader, 'La testata inserita dovrebbe essere stata cancellata per cleanup')
})

test('3. Payload non valido bloccato prima del write', async () => {
  const db = new MockDbClient()
  const draft = buildValidSimplePnDraft()

  // Make payload invalid: missing societaId
  draft.header.societaId = ''
  draft.pnPayload.societaId = ''

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.notEqual(result.error, null)
  assert.equal(result.error.code, 'PERSIST_PRIMA_NOTA_DRAFT_BLOCKED')

  // Check no database operations occurred
  assert.equal(db.log.length, 0, 'Nessuna operazione sul DB dovrebbe avvenire per payload non valido')
})

test('4. PN semplice non tenta scritture IVA/partitario/ritenute', async () => {
  const db = new MockDbClient()
  const draft = buildValidSimplePnDraft()

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const insertTables = db.log.filter(l => l.action === 'insert').map(l => l.table)
  assert.ok(!insertTables.includes('registri_iva'), 'Non deve esserci inserimento su registri_iva')
  assert.ok(!insertTables.includes('partitario'), 'Non deve esserci inserimento su partitario')
  assert.ok(!insertTables.includes('ritenute_dacconto'), 'Non deve esserci inserimento su ritenute_dacconto')
})

test('5. PN semplice con causale PD non richiede subjects, IVA, partitario o ritenute', async () => {
  const db = new MockDbClient()
  const draft = buildValidSimplePnDraft()

  // Imposta causale PD (Pagamenti Diversi)
  draft.header.causaleContabile = {
    id: 'caus-pd',
    codice: 'PD',
    tipoCausale: 'generale',
    descrizione: 'Pagamenti Diversi'
  }
  draft.pnPayload.causale_id = 'caus-pd'
  draft.pnPayload.causale_codice = 'PD'

  // Rimuove i soggetti dalla testata per verificare che non siano richiesti
  draft.header.clienteFornitoreId = ''
  draft.header.clienteFornitoreNome = ''
  draft.header.clienteFornitoreCodice = ''
  draft.header.clienteFornitorePartitaIva = ''

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null, 'PD non dovrebbe fallire il salvataggio per mancanza soggetti/IVA')

  const inserts = db.log.filter(l => l.action === 'insert').map(l => l.table)
  assert.deepEqual(inserts, ['prima_nota', 'prima_nota_righe'])
})

test('6. PN semplice PD bilanciata supera validazione commit', async () => {
  const db = new MockDbClient()
  const draft = buildValidSimplePnDraft()
  draft.header.causaleContabile = {
    id: 'caus-pd',
    codice: 'PD',
    tipoCausale: 'generale',
    descrizione: 'Pagamenti Diversi'
  }
  draft.pnPayload.causale_id = 'caus-pd'
  draft.pnPayload.causale_codice = 'PD'

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)
  assert.equal(result.data.isBalanced, true)
})

test('7. draft con ritenuta vuota/stale non genera withholding.rows[0] se shouldCreateWithholding = false', () => {
  const draft = buildValidSimplePnDraft()

  // Imposta ritenutaDraft attiva ma priva di righe reali
  draft.ritenutaDraft = {
    active: true,
    rows: []
  }

  const { payload } = mapRegistrazioneManualeToCanonical(draft, { 
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-28T23:34:24Z'
  })
  assert.equal(payload.postCommitTargets.shouldCreateWithholding, false)
  assert.equal(payload.withholding.rows.length, 0)
})

test('8. draft con VAT vuota/stale non richiede vat.registerType se shouldCreateIva = false', () => {
  const draft = buildValidSimplePnDraft()

  // Imposta ivaDraft attiva ma priva di righe reali e senza registerType (stato stale)
  draft.ivaDraft = {
    active: true,
    registroIva: '',
    rows: []
  }

  const { payload, validationResult } = mapRegistrazioneManualeToCanonical(draft, { 
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-28T23:34:24Z'
  })
  assert.equal(payload.postCommitTargets.shouldCreateIva, false)
  assert.equal(payload.vat.rows.length, 0)

  // Deve passare la validazione canonica poiché shouldCreateIva è false
  assert.ok(validationResult.isValid, `La validazione dovrebbe passare, trovati errori: ${validationResult.errors?.join(', ')}`)
})
