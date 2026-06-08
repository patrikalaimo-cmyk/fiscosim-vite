import test from 'node:test'
import assert from 'node:assert/strict'

import { aggregateRegistriIvaRows } from '../src/modules/contabilita/application/liquidazioneIvaClient.js'

test('1. Liquidazione solo IVA ordinaria mantiene il vecchio shape e il saldo corretto', () => {
  const agg = aggregateRegistriIvaRows([
    { tipo: 'vendita', iva: 1500, esigibilita: 'rilascio' },
    { tipo: 'acquisto', iva_detraibile: 100, esigibilita: 'rilascio' },
  ])

  assert.equal(agg.iva_debito_registrata, 1500)
  assert.equal(agg.iva_split_payment, 0)
  assert.equal(agg.iva_debito_effettiva, 1500)
  assert.equal(agg.iva_debito, 1500)
  assert.equal(agg.iva_credito, 100)
  assert.equal(agg.iva_dovuta, 1400)
  assert.equal(agg.saldo, 1400)
})

test('2. Liquidazione IVA ordinaria + split separa quota lorda, split e debito effettivo', () => {
  const agg = aggregateRegistriIvaRows([
    { tipo: 'vendita', iva: 1500, esigibilita: 'rilascio' },
    { tipo: 'vendita', iva: 200, esigibilita: 'rilascio', split_payment: true },
    { tipo: 'acquisto', iva_detraibile: 100, esigibilita: 'rilascio' },
  ])

  assert.equal(agg.iva_debito_registrata, 1700)
  assert.equal(agg.iva_split_payment, 200)
  assert.equal(agg.iva_debito_effettiva, 1500)
  assert.equal(agg.iva_debito, 1500)
  assert.equal(agg.iva_credito, 100)
  assert.equal(agg.iva_dovuta, 1400)
  assert.equal(agg.saldo, 1400)
})

test('3. Solo split + credito restituisce debito effettivo zero e saldo coerente', () => {
  const agg = aggregateRegistriIvaRows([
    { tipo: 'vendita', iva: 200, esigibilita: 'rilascio', split_payment: true },
    { tipo: 'acquisto', iva_detraibile: 100, esigibilita: 'rilascio' },
  ])

  assert.equal(agg.iva_debito_registrata, 200)
  assert.equal(agg.iva_split_payment, 200)
  assert.equal(agg.iva_debito_effettiva, 0)
  assert.equal(agg.iva_debito, 0)
  assert.equal(agg.iva_credito, 100)
  assert.equal(agg.iva_dovuta, -100)
  assert.equal(agg.saldo, -100)
})

test('4. Vecchio shape resta disponibile per i consumer legacy', () => {
  const agg = aggregateRegistriIvaRows([
    { tipo: 'vendita', iva: 1500, esigibilita: 'rilascio' },
    { tipo: 'acquisto', iva_detraibile: 100, esigibilita: 'rilascio' },
  ])

  assert.ok(Object.hasOwn(agg, 'iva_debito'))
  assert.ok(Object.hasOwn(agg, 'iva_credito'))
  assert.ok(Object.hasOwn(agg, 'saldo'))
})
