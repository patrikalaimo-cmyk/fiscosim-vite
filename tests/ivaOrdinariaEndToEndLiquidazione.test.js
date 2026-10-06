import test from 'node:test'
import assert from 'node:assert/strict'

import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { aggregateVatRegisterEntries } from '../src/modules/contabilita/application/iva/aggregateVatRegisterEntries.js'
import { aggregateRegistriIvaRows } from '../src/modules/contabilita/application/liquidazioneIvaClient.js'
import { aggregateRegistriIvaPeriodo } from '../services/liquidazioneIvaService.js'

const SOCIETA = 'soc-e2e'
const DATA = '2026-06-11'

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
    return Promise.resolve({ data: { id: `${this.table}-id` }, error: null })
  }

  then(resolve, reject) {
    const rows = Array.isArray(this.insertedData)
      ? this.insertedData.map((row, index) => ({ id: `${this.table}-${index}`, ...row }))
      : []
    Promise.resolve({ data: rows, error: null }).then(resolve, reject)
  }
}

class MockDbClient {
  constructor() {
    this.log = []
  }

  from(table) {
    return new MockDbQuery(table, this)
  }
}

function sumVatRows(rows) {
  return rows.reduce((totals, row) => ({
    imponibile: totals.imponibile + Number(row.imponibile || 0),
    iva: totals.iva + Number(row.imposta || 0),
  }), { imponibile: 0, iva: 0 })
}

function buildOrdinaryDraft({
  registerType,
  sign = '+',
  creditNote = false,
  vatRows = [{ imponibile: 100, imposta: 22, aliquota: 22 }],
  numeroDocumento = 'DOC-E2E',
} = {}) {
  const totals = sumVatRows(vatRows)
  const totaleDocumento = totals.imponibile + totals.iva
  const isVendita = registerType === 'vendite'
  const isNegative = sign === '-'
  const subjectId = isVendita ? 'cliente-e2e' : 'fornitore-e2e'
  const subjectName = isVendita ? 'Cliente E2E' : 'Fornitore E2E'

  const accountingRows = isVendita
    ? (isNegative
        ? [
            { conto_id: 'ricavo', dare: totals.imponibile, avere: 0, descrizione_riga: 'Storno ricavo' },
            { conto_id: 'iva-debito', dare: totals.iva, avere: 0, descrizione_riga: 'Storno IVA debito' },
            { conto_id: subjectId, dare: 0, avere: totaleDocumento, descrizione_riga: 'Cliente' },
          ]
        : [
            { conto_id: subjectId, dare: totaleDocumento, avere: 0, descrizione_riga: 'Cliente' },
            { conto_id: 'ricavo', dare: 0, avere: totals.imponibile, descrizione_riga: 'Ricavo' },
            { conto_id: 'iva-debito', dare: 0, avere: totals.iva, descrizione_riga: 'IVA debito' },
          ])
    : (isNegative
        ? [
            { conto_id: subjectId, dare: totaleDocumento, avere: 0, descrizione_riga: 'Fornitore' },
            { conto_id: 'costo', dare: 0, avere: totals.imponibile, descrizione_riga: 'Storno costo' },
            { conto_id: 'iva-credito', dare: 0, avere: totals.iva, descrizione_riga: 'Storno IVA credito' },
          ]
        : [
            { conto_id: 'costo', dare: totals.imponibile, avere: 0, descrizione_riga: 'Costo' },
            { conto_id: 'iva-credito', dare: totals.iva, avere: 0, descrizione_riga: 'IVA credito' },
            { conto_id: subjectId, dare: 0, avere: totaleDocumento, descrizione_riga: 'Fornitore' },
          ])

  return {
    header: {
      societaId: SOCIETA,
      esercizioContabile: '2026',
      dataRegistrazione: DATA,
      dataDocumento: DATA,
      numeroDocumento,
      causaleContabile: {
        id: `causale-${registerType}-${sign}`,
        tipoCausale: creditNote ? 'notacredito' : 'docivanormale',
        registroIva: registerType,
        segnoRegistroIva: sign,
        gestionePartite: 'ignora',
      },
      descrizioneGenerale: 'Documento IVA ordinario E2E',
      soggetto: subjectName,
      clienteFornitoreId: subjectId,
      clienteFornitoreNome: subjectName,
      clienteFornitoreTipo: isVendita ? 'cliente' : 'fornitore',
    },
    pnPayload: {
      societa_id: SOCIETA,
      esercizio: 2026,
      data_registrazione: DATA,
      data_documento: DATA,
      numero_documento: numeroDocumento,
      causale_id: `causale-${registerType}-${sign}`,
      descrizione: 'Documento IVA ordinario E2E',
      cliente_fornitore_id: subjectId,
      cliente_fornitore_nome: subjectName,
      totale_dare: totaleDocumento,
      totale_avere: totaleDocumento,
      stato: 'confermata',
    },
    rows: accountingRows.map((row, index) => ({ id: `row-${index}`, ...row })),
    righePayload: accountingRows,
    ivaDraft: {
      active: true,
      registroIva: registerType,
      segnoRegistro: sign,
      totaleDocumento,
      totaleImponibile: totals.imponibile,
      totaleImposta: totals.iva,
      rows: vatRows.map((row, index) => ({
        causaleIvaId: `iva-${index}`,
        registroIva: registerType,
        segnoRegistro: sign,
        percentualeDetraibilita: 100,
        ...row,
      })),
    },
    partitarioDraft: { active: false, mode: 'none', rows: [] },
    ritenutaDraft: { active: false, rows: [] },
    validation: {
      status: 'ok',
      isBalanced: true,
      blockers: [],
      warnings: [],
      totals: { differenza: 0 },
    },
    meta: {
      operatorId: 'test-e2e',
      createdAt: '2026-06-11T12:00:00Z',
      behavior: {
        family: creditNote ? 'notacredito' : 'docivanormale',
        showDocumentPanel: true,
        showIvaPanel: true,
        showPartitario: false,
        showRitenute: false,
      },
    },
    totals: {
      totaleDare: totaleDocumento,
      totaleAvere: totaleDocumento,
      differenza: 0,
      isBalanced: true,
    },
  }
}

function buildSimplePnDraft() {
  return {
    header: {
      societaId: SOCIETA,
      esercizioContabile: '2026',
      dataRegistrazione: DATA,
      causaleContabile: {
        id: 'causale-generale',
        tipoCausale: 'generale',
        gestionePartite: 'ignora',
      },
      descrizioneGenerale: 'Prima nota semplice E2E',
    },
    pnPayload: {
      societa_id: SOCIETA,
      esercizio: 2026,
      data_registrazione: DATA,
      causale_id: 'causale-generale',
      descrizione: 'Prima nota semplice E2E',
      totale_dare: 50,
      totale_avere: 50,
      stato: 'confermata',
    },
    rows: [
      { id: 'row-1', conto_id: 'costo', dare: 50, avere: 0 },
      { id: 'row-2', conto_id: 'banca', dare: 0, avere: 50 },
    ],
    righePayload: [
      { conto_id: 'costo', dare: 50, avere: 0 },
      { conto_id: 'banca', dare: 0, avere: 50 },
    ],
    ivaDraft: { active: false, rows: [] },
    partitarioDraft: { active: false, mode: 'none', rows: [] },
    ritenutaDraft: { active: false, rows: [] },
    validation: { status: 'ok', isBalanced: true, blockers: [], warnings: [], totals: { differenza: 0 } },
    meta: {
      operatorId: 'test-e2e',
      createdAt: '2026-06-11T12:00:00Z',
      behavior: { family: 'generale', showIvaPanel: false, showPartitario: false, showRitenute: false },
    },
    totals: { totaleDare: 50, totaleAvere: 50, differenza: 0, isBalanced: true },
  }
}

async function persistAndReadVatRows(draft) {
  const db = new MockDbClient()
  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)
  const insert = db.log.find((entry) => entry.action === 'insert' && entry.table === 'registri_iva')
  return insert?.data || []
}

test('fattura attiva persiste vendita e aumenta IVA a debito', async () => {
  const rows = await persistAndReadVatRows(buildOrdinaryDraft({ registerType: 'vendite' }))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].tipo, 'vendita')
  assert.equal(rows[0].iva, 22)

  const liquidazione = aggregateVatRegisterEntries(rows, { societaId: SOCIETA })
  assert.equal(liquidazione.ivaDebitoEffettiva, 22)
  assert.equal(liquidazione.ivaCredito, 0)
})

test('fattura passiva persiste acquisto e aumenta IVA a credito', async () => {
  const rows = await persistAndReadVatRows(buildOrdinaryDraft({ registerType: 'acquisti' }))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].tipo, 'acquisto')
  assert.equal(rows[0].iva_detraibile, 22)

  const liquidazione = aggregateVatRegisterEntries(rows, { societaId: SOCIETA })
  assert.equal(liquidazione.ivaDebitoEffettiva, 0)
  assert.equal(liquidazione.ivaCredito, 22)
  assert.equal(liquidazione.saldoIva, -22)
})

test('nota credito attiva persiste vendita negativa e riduce IVA a debito', async () => {
  const rows = await persistAndReadVatRows(buildOrdinaryDraft({
    registerType: 'vendite',
    sign: '-',
    creditNote: true,
  }))
  assert.equal(rows[0].tipo, 'vendita')
  assert.equal(rows[0].iva, -22)

  const liquidazione = aggregateVatRegisterEntries([
    { societa_id: SOCIETA, tipo: 'vendita', iva: 100 },
    ...rows,
  ], { societaId: SOCIETA })
  assert.equal(liquidazione.ivaDebitoEffettiva, 78)
})

test('nota credito passiva persiste acquisto negativo e riduce IVA a credito', async () => {
  const rows = await persistAndReadVatRows(buildOrdinaryDraft({
    registerType: 'acquisti',
    sign: '-',
    creditNote: true,
  }))
  assert.equal(rows[0].tipo, 'acquisto')
  assert.equal(rows[0].iva_detraibile, -22)

  const liquidazione = aggregateVatRegisterEntries([
    { societa_id: SOCIETA, tipo: 'acquisto', iva_detraibile: 100 },
    ...rows,
  ], { societaId: SOCIETA })
  assert.equal(liquidazione.ivaCredito, 78)
})

test('multi-aliquota persiste due righe e liquida la somma corretta', async () => {
  const rows = await persistAndReadVatRows(buildOrdinaryDraft({
    registerType: 'vendite',
    vatRows: [
      { imponibile: 100, imposta: 22, aliquota: 22 },
      { imponibile: 50, imposta: 5, aliquota: 10 },
    ],
  }))
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((row) => row.aliquota), [22, 10])

  const liquidazione = aggregateVatRegisterEntries(rows, { societaId: SOCIETA })
  assert.equal(liquidazione.ivaDebitoEffettiva, 27)
  assert.equal(rows.reduce((total, row) => total + row.imponibile, 0), 150)
})

test('prima nota semplice non genera registri e non influenza la liquidazione', async () => {
  const rows = await persistAndReadVatRows(buildSimplePnDraft())
  assert.deepEqual(rows, [])
  assert.equal(aggregateVatRegisterEntries(rows, { societaId: SOCIETA }).saldoIva, 0)
})

test('aggregazione end-to-end esclude righe di altra societa', async () => {
  const rows = await persistAndReadVatRows(buildOrdinaryDraft({ registerType: 'vendite' }))
  const liquidazione = aggregateVatRegisterEntries([
    ...rows,
    { ...rows[0], societa_id: 'societa-estranea', iva: 99 },
  ], { societaId: SOCIETA })

  assert.equal(liquidazione.ivaDebitoEffettiva, 22)
  assert.equal(liquidazione.righeEscluseCount, 1)
})

test('client e service aggregano nello stesso modo le righe persistite', async () => {
  const rows = await persistAndReadVatRows(buildOrdinaryDraft({ registerType: 'vendite' }))
  const options = {
    societaId: SOCIETA,
    periodoInizio: '2026-06-01',
    periodoFine: '2026-06-30',
  }
  const clientResult = aggregateRegistriIvaRows(rows, options)
  const query = {
    select() { return this },
    gte() { return this },
    lte() { return this },
    eq() { return this },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve) },
  }
  const db = { from: () => query }
  const serviceResult = await aggregateRegistriIvaPeriodo({
    db,
    societaId: SOCIETA,
    periodo_inizio: options.periodoInizio,
    periodo_fine: options.periodoFine,
  })

  assert.deepEqual(serviceResult, clientResult)
})
