import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRitenutaPartialMaturation } from '../src/modules/contabilita/domain/ritenute/calculateRitenutaPartialMaturation.js'

test('integrale returns full matured and zero residual', () => {
  const split = calculateRitenutaPartialMaturation({
    importoPagamento: 1068.8,
    importoResiduoPartita: 1068.8,
    importoRitenuta: 200,
    imponibileRitenuta: 1000,
    compensoLordo: 1000,
  })
  assert.equal(split.kind, 'integrale')
  assert.equal(split.matured.importo_ritenuta, 200)
  assert.equal(split.residual.importo_ritenuta, 0)
})

test('parziale 50% splits ritenuta with residual absorbing rounding', () => {
  const split = calculateRitenutaPartialMaturation({
    importoPagamento: 534.4,
    importoResiduoPartita: 1068.8,
    importoRitenuta: 200,
    imponibileRitenuta: 1000,
    compensoLordo: 1000,
  })
  assert.equal(split.kind, 'parziale')
  assert.equal(split.matured.importo_ritenuta, 100)
  assert.equal(split.residual.importo_ritenuta, 100)
  assert.equal(split.matured.imponibile_ritenuta, 500)
  assert.equal(split.residual.imponibile_ritenuta, 500)
})

test('parziale Manuale 600/1268.8 yields 94.58 matured', () => {
  const split = calculateRitenutaPartialMaturation({
    importoPagamento: 600,
    importoResiduoPartita: 1268.8,
    importoRitenuta: 200,
    imponibileRitenuta: 1000,
    compensoLordo: 1000,
  })
  assert.equal(split.kind, 'parziale')
  assert.equal(split.matured.importo_ritenuta, 94.58)
  assert.equal(split.residual.importo_ritenuta, 105.42)
  assert.equal(split.matured.importo_ritenuta + split.residual.importo_ritenuta, 200)
})
