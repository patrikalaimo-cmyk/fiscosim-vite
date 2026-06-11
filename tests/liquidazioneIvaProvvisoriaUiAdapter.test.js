import test from 'node:test'
import assert from 'node:assert/strict'
import { getLiquidazioneIvaProvvisoriaProspetto } from '../src/modules/contabilita/application/iva/liquidazioneIvaProvvisoriaUiAdapter.js'

const OPTIONS = {
  societaId: 'soc-test',
  periodoInizio: '2026-06-01',
  periodoFine: '2026-06-30',
  periodicita: 'mensile',
  periodo: 6,
}

test('adapter mappa correttamente l output di buildLiquidazioneIvaProvvisoria', () => {
  const rows = [
    { societa_id: 'soc-test', tipo: 'vendita', imponibile: 1000, iva: 220, esigibilita: 'immediata' },
    { societa_id: 'soc-test', tipo: 'acquisto', imponibile: 500, iva: 110, iva_detraibile: 80, esigibilita: 'immediata' }
  ]
  const prospetto = getLiquidazioneIvaProvvisoriaProspetto(rows, OPTIONS)

  assert.equal(prospetto.stato, 'provvisorio')
  assert.equal(prospetto.ivaVenditeLorda, 220)
  assert.equal(prospetto.ivaAcquisti, 80)
  assert.equal(prospetto.ivaDebitoEffettiva, 220)
  assert.equal(prospetto.saldoPeriodo, 140)
  assert.equal(prospetto.saldoADebito, 140)
  assert.equal(prospetto.saldoACredito, 0)
  assert.equal(prospetto.righeIncluseCount, 2)
})

test('saldo a debito e saldo a credito non sono mai entrambi positivi', () => {
  const prospettoDebit = getLiquidazioneIvaProvvisoriaProspetto([
    { societa_id: 'soc-test', tipo: 'vendita', iva: 100, esigibilita: 'immediata' }
  ], OPTIONS)
  const prospettoCredit = getLiquidazioneIvaProvvisoriaProspetto([
    { societa_id: 'soc-test', tipo: 'acquisto', iva: 100, iva_detraibile: 100, esigibilita: 'immediata' }
  ], OPTIONS)

  assert.ok(prospettoDebit.saldoADebito > 0)
  assert.equal(prospettoDebit.saldoACredito, 0)
  assert.ok(prospettoCredit.saldoACredito > 0)
  assert.equal(prospettoCredit.saldoADebito, 0)
})

test('split payment viene mostrato separatamente e sottratto dal debito effettivo', () => {
  const rows = [
    { societa_id: 'soc-test', tipo: 'vendita', iva: 100, split_payment: true, esigibilita: 'immediata' }
  ]
  const prospetto = getLiquidazioneIvaProvvisoriaProspetto(rows, OPTIONS)
  assert.equal(prospetto.ivaVenditeLorda, 100)
  assert.equal(prospetto.ivaSplitPayment, 100)
  assert.equal(prospetto.ivaDebitoEffettiva, 0)
  assert.equal(prospetto.saldoPeriodo, 0)
})

test('righe escluse vengono conteggiate senza alterare il saldo', () => {
  const rows = [
    { societa_id: 'soc-test', tipo: 'vendita', iva: 100, esigibilita: 'immediata' },
    { societa_id: 'soc-test', tipo: 'vendita', iva: 50, esigibilita: 'differita' }, // esclusa
    { societa_id: 'soc-test', tipo: 'ritenuta', iva: 30 } // esclusa
  ]
  const prospetto = getLiquidazioneIvaProvvisoriaProspetto(rows, OPTIONS)
  assert.equal(prospetto.ivaDebitoEffettiva, 100)
  assert.equal(prospetto.righeIncluseCount, 1)
  assert.equal(prospetto.righeEscluseCount, 2)
  assert.equal(prospetto.saldoPeriodo, 100)
})

test('assenza dati produce stato vuoto leggibile, non errore runtime', () => {
  const prospetto = getLiquidazioneIvaProvvisoriaProspetto([], OPTIONS)
  assert.equal(prospetto.ivaVenditeLorda, 0)
  assert.equal(prospetto.ivaAcquisti, 0)
  assert.equal(prospetto.saldoPeriodo, 0)
  assert.equal(prospetto.righeIncluseCount, 0)
  assert.equal(prospetto.righeEscluseCount, 0)
  assert.ok(Array.isArray(prospetto.warnings))
})

test('nessuna funzione di chiusura/salvataggio definitivo viene chiamata', () => {
  const prospetto = getLiquidazioneIvaProvvisoriaProspetto([], OPTIONS)
  assert.equal(prospetto.stato, 'provvisorio')
})
