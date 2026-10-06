import test from 'node:test'
import assert from 'node:assert/strict'

import { aggregateVatRegisterEntries } from '../src/modules/contabilita/application/iva/aggregateVatRegisterEntries.js'
import { aggregateRegistriIvaRows } from '../src/modules/contabilita/application/liquidazioneIvaClient.js'
import { aggregateRegistriIvaPeriodo } from '../services/liquidazioneIvaService.js'

const SOCIETA = 'soc-1'

test('aggregatore copre ordinario e note credito rispettando il segno persistito', () => {
  const result = aggregateVatRegisterEntries([
    { societa_id: SOCIETA, tipo: 'vendita', iva: 220, esigibilita: 'immediata' },
    { societa_id: SOCIETA, tipo: 'acquisto', iva_detraibile: 110, esigibilita: 'immediata' },
    { societa_id: SOCIETA, tipo: 'vendita', iva: -22, esigibilita: 'immediata' },
    { societa_id: SOCIETA, tipo: 'acquisto', iva_detraibile: -11, esigibilita: 'immediata' },
  ], { societaId: SOCIETA })

  assert.equal(result.ivaDebitoLordo, 198)
  assert.equal(result.ivaCredito, 99)
  assert.equal(result.ivaDebitoEffettiva, 198)
  assert.equal(result.saldoIva, 99)
})

test('split payment resta nel lordo ma viene sottratto dal debito effettivo', () => {
  const result = aggregateVatRegisterEntries([
    { societa_id: SOCIETA, tipo: 'vendita', iva: 220, esigibilita: 'immediata' },
    { societa_id: SOCIETA, tipo: 'vendita', iva: 44, esigibilita: 'immediata', split_payment: true },
  ], { societaId: SOCIETA })

  assert.equal(result.ivaDebitoLordo, 264)
  assert.equal(result.ivaSplitPayment, 44)
  assert.equal(result.ivaDebitoEffettiva, 220)
})

test('IVA per cassa esclude il differito e include il rilascio', () => {
  const result = aggregateVatRegisterEntries([
    { societa_id: SOCIETA, tipo: 'vendita', iva: 220, esigibilita: 'differita' },
    { societa_id: SOCIETA, tipo: 'vendita', iva: 55, esigibilita: 'rilascio' },
    { societa_id: SOCIETA, tipo: 'acquisto', iva_detraibile: 20, esigibilita: 'differita' },
    { societa_id: SOCIETA, tipo: 'acquisto', iva_detraibile: 5, esigibilita: 'rilascio' },
  ], { societaId: SOCIETA })

  assert.equal(result.ivaDebitoEffettiva, 55)
  assert.equal(result.ivaCredito, 5)
  assert.equal(result.righeIncluseCount, 2)
  assert.equal(result.righeEscluseCount, 2)
})

test('reverse/autofattura a doppio registro produce effetto netto zero', () => {
  const result = aggregateVatRegisterEntries([
    { societa_id: SOCIETA, tipo: 'vendita', iva: 22, esigibilita: 'immediata' },
    { societa_id: SOCIETA, tipo: 'acquisto', iva_detraibile: 22, esigibilita: 'immediata' },
  ], { societaId: SOCIETA })

  assert.equal(result.ivaDebitoEffettiva, 22)
  assert.equal(result.ivaCredito, 22)
  assert.equal(result.saldoIva, 0)
})

test('filtro societa e periodo esclude righe estranee', () => {
  const result = aggregateVatRegisterEntries([
    { societa_id: SOCIETA, data: '2026-03-10', tipo: 'vendita', iva: 22 },
    { societa_id: 'soc-2', data: '2026-03-10', tipo: 'vendita', iva: 44 },
    { societa_id: SOCIETA, data: '2026-04-01', tipo: 'vendita', iva: 66 },
  ], {
    societaId: SOCIETA,
    periodoInizio: '2026-03-01',
    periodoFine: '2026-03-31',
  })

  assert.equal(result.ivaDebitoEffettiva, 22)
  assert.equal(result.righeIncluseCount, 1)
  assert.deepEqual(result.righeEscluse.map((entry) => entry.motivo), ['societa', 'periodo'])
})

test('righe non IVA, incluse eventuali ritenute, non entrano nella liquidazione', () => {
  const result = aggregateVatRegisterEntries([
    { societa_id: SOCIETA, tipo: 'ritenuta', iva: 200 },
    { societa_id: SOCIETA, importo_ritenuta: 200 },
  ], { societaId: SOCIETA })

  assert.equal(result.saldoIva, 0)
  assert.equal(result.righeIncluseCount, 0)
  assert.equal(result.righeEscluseCount, 2)
})

test('adapter UI e funzione pura restituiscono lo stesso risultato', () => {
  const rows = [
    { societa_id: SOCIETA, tipo: 'vendita', iva: 100, split_payment: true },
    { societa_id: SOCIETA, tipo: 'acquisto', iva_detraibile: 40 },
  ]
  const options = { societaId: SOCIETA }

  assert.deepEqual(aggregateRegistriIvaRows(rows, options), aggregateVatRegisterEntries(rows, options))
})

test('service applica scope societa e usa lo stesso aggregatore', async () => {
  const rows = [
    { societa_id: SOCIETA, data: '2026-03-10', tipo: 'vendita', iva: 100, esigibilita: 'immediata', split_payment: true },
    { societa_id: SOCIETA, data: '2026-03-11', tipo: 'acquisto', iva_detraibile: 40, esigibilita: 'immediata' },
  ]
  const calls = []
  const query = {
    select(columns) { calls.push(['select', columns]); return this },
    gte(column, value) { calls.push(['gte', column, value]); return this },
    lte(column, value) { calls.push(['lte', column, value]); return this },
    eq(column, value) { calls.push(['eq', column, value]); return this },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve) },
  }
  const db = {
    from(table) {
      calls.push(['from', table])
      return query
    },
  }

  const options = {
    societaId: SOCIETA,
    periodo_inizio: '2026-03-01',
    periodo_fine: '2026-03-31',
  }
  const result = await aggregateRegistriIvaPeriodo({ db, ...options })

  assert.equal(result.ivaDebitoLordo, 100)
  assert.equal(result.ivaDebitoEffettiva, 0)
  assert.equal(result.ivaCredito, 40)
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'societa_id' && call[2] === SOCIETA))
  assert.deepEqual(result, aggregateVatRegisterEntries(rows, {
    societaId: SOCIETA,
    periodoInizio: options.periodo_inizio,
    periodoFine: options.periodo_fine,
  }))
})
