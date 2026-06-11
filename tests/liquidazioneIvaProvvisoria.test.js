import test from 'node:test'
import assert from 'node:assert/strict'

import { buildLiquidazioneIvaProvvisoria } from '../src/modules/contabilita/application/iva/buildLiquidazioneIvaProvvisoria.js'

const SOCIETA = 'soc-provvisoria'
const OPTIONS = {
  societaId: SOCIETA,
  periodoInizio: '2026-06-01',
  periodoFine: '2026-06-30',
  periodicita: 'mensile',
}

function row(overrides = {}) {
  return {
    societa_id: SOCIETA,
    data: '2026-06-11',
    esigibilita: 'immediata',
    ...overrides,
  }
}

test('liquidazione ordinaria espone debito, credito, saldo e breakdown', () => {
  const result = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', imponibile: 1000, iva: 220 }),
    row({ tipo: 'acquisto', imponibile: 500, iva: 110, iva_detraibile: 110 }),
  ], OPTIONS)

  assert.equal(result.stato, 'provvisorio')
  assert.equal(result.ivaVenditeLordo, 220)
  assert.equal(result.ivaAcquistiCredito, 110)
  assert.equal(result.saldoPeriodo, 110)
  assert.equal(result.saldoADebito, 110)
  assert.equal(result.saldoACredito, 0)
  assert.equal(result.breakdownRegistri.vendite.imponibile, 1000)
  assert.equal(result.breakdownRegistri.acquisti.imponibile, 500)
})

test('nota credito attiva riduce IVA vendite e debito', () => {
  const result = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', iva: 220 }),
    row({ tipo: 'vendita', iva: -22 }),
  ], OPTIONS)

  assert.equal(result.ivaVenditeLordo, 198)
  assert.equal(result.ivaDebitoEffettivo, 198)
})

test('nota credito passiva riduce IVA acquisti e credito', () => {
  const result = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'acquisto', iva_detraibile: 110 }),
    row({ tipo: 'acquisto', iva_detraibile: -11 }),
  ], OPTIONS)

  assert.equal(result.ivaAcquistiCredito, 99)
  assert.equal(result.saldoPeriodo, -99)
})

test('split payment resta nel lordo ed e sottratto dal debito effettivo', () => {
  const result = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', iva: 220 }),
    row({ tipo: 'vendita', iva: 44, split_payment: true }),
  ], OPTIONS)

  assert.equal(result.ivaVenditeLordo, 264)
  assert.equal(result.ivaSplitPayment, 44)
  assert.equal(result.ivaDebitoEffettivo, 220)
  assert.equal(result.breakdownRegistri.vendite.ivaDebitoEffettivo, 220)
})

test('IVA per cassa differita non rilasciata resta esclusa', () => {
  const result = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', iva: 220, esigibilita: 'differita' }),
    row({ tipo: 'acquisto', iva_detraibile: 110, esigibilita: 'differita' }),
  ], OPTIONS)

  assert.equal(result.saldoPeriodo, 0)
  assert.equal(result.righeIncluseCount, 0)
  assert.equal(result.righeEscluseCount, 2)
  assert.ok(result.warnings.includes('Righe escluse per esigibilita_differita: 2'))
})

test('rilascio IVA per cassa entra nel periodo', () => {
  const result = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', iva: 55, esigibilita: 'rilascio' }),
    row({ tipo: 'acquisto', iva_detraibile: 5, esigibilita: 'rilascio' }),
  ], OPTIONS)

  assert.equal(result.ivaDebitoEffettivo, 55)
  assert.equal(result.ivaAcquistiCredito, 5)
  assert.equal(result.saldoPeriodo, 50)
})

test('reverse o autofattura a doppio registro ha effetto netto coerente', () => {
  const result = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', imponibile: 100, iva: 22 }),
    row({ tipo: 'acquisto', imponibile: 100, iva: 22, iva_detraibile: 22 }),
  ], OPTIONS)

  assert.equal(result.ivaDebitoEffettivo, 22)
  assert.equal(result.ivaAcquistiCredito, 22)
  assert.equal(result.saldoPeriodo, 0)
})

test('isolamento societa esclude righe estranee', () => {
  const result = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', iva: 22 }),
    row({ societa_id: 'soc-estranea', tipo: 'vendita', iva: 99 }),
  ], OPTIONS)

  assert.equal(result.ivaDebitoEffettivo, 22)
  assert.equal(result.righeEscluseCount, 1)
  assert.ok(result.warnings.includes('Righe escluse per societa: 1'))
})

test('righe non IVA e ritenute sono escluse senza effetti', () => {
  const result = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'ritenuta', iva: 200 }),
    row({ importo_ritenuta: 200 }),
  ], OPTIONS)

  assert.equal(result.saldoPeriodo, 0)
  assert.equal(result.righeIncluseCount, 0)
  assert.equal(result.righeEscluseCount, 2)
  assert.ok(result.warnings.includes('Righe escluse per tipo_non_iva: 2'))
})

test('saldo a debito e a credito sono stabili e mai entrambi positivi', () => {
  const debit = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', iva: 50 }),
    row({ tipo: 'acquisto', iva_detraibile: 20 }),
  ], OPTIONS)
  const credit = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', iva: 20 }),
    row({ tipo: 'acquisto', iva_detraibile: 50 }),
  ], OPTIONS)
  const zero = buildLiquidazioneIvaProvvisoria([
    row({ tipo: 'vendita', iva: 20 }),
    row({ tipo: 'acquisto', iva_detraibile: 20 }),
  ], OPTIONS)

  assert.deepEqual([debit.saldoADebito, debit.saldoACredito], [30, 0])
  assert.deepEqual([credit.saldoADebito, credit.saldoACredito], [0, 30])
  assert.deepEqual([zero.saldoADebito, zero.saldoACredito], [0, 0])
  for (const result of [debit, credit, zero]) {
    assert.equal(result.saldoADebito > 0 && result.saldoACredito > 0, false)
  }
})
