import test from 'node:test'
import assert from 'node:assert/strict'

import { calcoloLiquidazioneIvaDefinitiva } from '../src/modules/contabilita/domain/iva/calcoloLiquidazioneIvaDefinitiva.js'

const SOCIETA = 'soc-definitiva-test'
const OPTIONS_BASE = {
  societaId: SOCIETA,
  periodoInizio: '2026-06-01',
  periodoFine: '2026-06-30',
  periodicita: 'mensile',
  anno: 2026,
  periodo: 6,
}

function row(overrides = {}) {
  return {
    societa_id: SOCIETA,
    data: '2026-06-15',
    esigibilita: 'immediata',
    ...overrides,
  }
}

// 1. IVA ordinaria mensile a debito
test('1. IVA ordinaria mensile a debito', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', imponibile: 1000, iva: 220 }),
    row({ tipo: 'acquisto', imponibile: 500, iva: 110, iva_detraibile: 110 }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaVenditeLorda, 220)
  assert.equal(result.ivaAcquistiDetraibile, 110)
  assert.equal(result.debitoPeriodo, 110)
  assert.equal(result.debitoDaVersare, 110)
  assert.equal(result.creditoPeriodo, 0)
  assert.equal(result.f24Dovuto, 110)
})

// 2. IVA ordinaria mensile a credito
test('2. IVA ordinaria mensile a credito', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', imponibile: 500, iva: 110 }),
    row({ tipo: 'acquisto', imponibile: 1000, iva: 220, iva_detraibile: 220 }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaVenditeLorda, 110)
  assert.equal(result.ivaAcquistiDetraibile, 220)
  assert.equal(result.debitoPeriodo, 0)
  assert.equal(result.creditoPeriodo, 110)
  assert.equal(result.creditoDaRiportare, 110)
  assert.equal(result.f24Dovuto, 0)
})

// 3. Split payment escluso dal debito
test('3. Split payment escluso dal debito', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', imponibile: 1000, iva: 220 }),
    row({ tipo: 'vendita', imponibile: 200, iva: 44, split_payment: true }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaVenditeLorda, 264)
  assert.equal(result.ivaSplitEsclusa, 44)
  assert.equal(result.ivaDebitoEffettiva, 220)
  assert.equal(result.debitoPeriodo, 220)
})

// 4. IVA per cassa differita non pagata esclusa
test('4. IVA per cassa differita non pagata esclusa', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', iva: 220, esigibilita: 'differita' }),
    row({ tipo: 'acquisto', iva_detraibile: 110, esigibilita: 'differita' }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaVenditeLorda, 0)
  assert.equal(result.ivaAcquistiDetraibile, 0)
  assert.equal(result.ivaPerCassaDifferita, 330)
  assert.equal(result.ivaPerCassaDifferitaVendite, 220)
  assert.equal(result.ivaPerCassaDifferitaAcquisti, 110)
  assert.equal(result.righeIncluseCount, 0)
  assert.equal(result.righeEscluseCount, 2)
})

// 5. IVA per cassa rilasciata inclusa
test('5. IVA per cassa rilasciata inclusa', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', iva: 55, esigibilita: 'rilascio' }),
    row({ tipo: 'acquisto', iva_detraibile: 5, esigibilita: 'rilascio' }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaDebitoEffettiva, 55)
  assert.equal(result.ivaAcquistiDetraibile, 5)
  assert.equal(result.ivaPerCassaRilasciata, 50)
  assert.equal(result.ivaPerCassaRilasciataVendite, 55)
  assert.equal(result.ivaPerCassaRilasciataAcquisti, 5)
  assert.equal(result.debitoPeriodo, 50)
})

// 6. Reverse charge con debito e credito separati
test('6. Reverse charge con debito e credito separati', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', imponibile: 100, iva: 22, reverse_charge: true }),
    row({ tipo: 'acquisto', imponibile: 100, iva: 22, iva_detraibile: 22, reverse_charge: true }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaVenditeLorda, 22)
  assert.equal(result.ivaAcquistiDetraibile, 22)
  assert.equal(result.ivaReverseDebito, 22)
  assert.equal(result.ivaReverseCredito, 22)
  assert.equal(result.debitoPeriodo, 0)
  assert.equal(result.creditoPeriodo, 0)
})

// 7. Nota credito attiva riduce IVA a debito
test('7. Nota credito attiva riduce IVA a debito', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', iva: 220 }),
    row({ tipo: 'vendita', iva: -22 }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaVenditeLorda, 198)
  assert.equal(result.ivaDebitoEffettiva, 198)
})

// 8. Nota credito passiva riduce IVA detraibile
test('8. Nota credito passiva riduce IVA detraibile', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'acquisto', iva_detraibile: 110 }),
    row({ tipo: 'acquisto', iva_detraibile: -11 }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaAcquistiDetraibile, 99)
})

// 9. Credito periodo precedente
test('9. Credito periodo precedente', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', iva: 200 }),
  ], {
    ...OPTIONS_BASE,
    creditoPeriodoPrecedente: 150,
  })

  assert.equal(result.ivaDebitoEffettiva, 200)
  assert.equal(result.creditoPeriodoPrecedente, 150)
  assert.equal(result.debitoPeriodo, 50)
})

// 10. Credito anno precedente e compensazione F24
test('10. Credito anno precedente e compensazione F24', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', iva: 300 }),
  ], {
    ...OPTIONS_BASE,
    creditoAnnoPrecedente: 500,
    creditoCompensatoF24: 200,
  })

  assert.equal(result.creditoAnnoPrecedente, 500)
  assert.equal(result.creditoCompensatoF24, 200)
  assert.equal(result.creditoAnnoPrecedenteNetto, 300)
  assert.equal(result.debitoPeriodo, 0)
  assert.equal(result.creditoPeriodo, 0) // Debito 300 vs Credito Netto 300 = 0
})

// 11. Acconto IVA
test('11. Acconto IVA', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', iva: 1000 }),
  ], {
    ...OPTIONS_BASE,
    accontoIvaVersato: 800,
  })

  assert.equal(result.accontoIvaVersato, 800)
  assert.equal(result.debitoPeriodo, 200)
})

// 12. Trimestrale con interessi 1%
test('12. Trimestrale con interessi 1%', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', iva: 1000 }),
  ], {
    ...OPTIONS_BASE,
    periodicita: 'trimestrale',
    trimestraleOrdinaria: true,
  })

  assert.equal(result.debitoPeriodo, 1000)
  assert.equal(result.interessiTrimestrali, 10)
  assert.equal(result.debitoDaVersare, 1010)
})

// 13. Credito finale da riportare
test('13. Credito finale da riportare', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'acquisto', iva_detraibile: 150 }),
  ], OPTIONS_BASE)

  assert.equal(result.creditoPeriodo, 150)
  assert.equal(result.creditoDaRiportare, 150)
  assert.equal(result.debitoPeriodo, 0)
})

// 14. Arrotondamenti al centesimo
test('14. Arrotondamenti al centesimo', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ tipo: 'vendita', iva: 10.333 }),
    row({ tipo: 'acquisto', iva_detraibile: 5.125 }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaVenditeLorda, 10.33)
  assert.equal(result.ivaAcquistiDetraibile, 5.13)
  assert.equal(result.debitoPeriodo, 5.2)
})

// 15. Periodo senza righe
test('15. Periodo senza righe', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([], OPTIONS_BASE)

  assert.equal(result.ivaVenditeLorda, 0)
  assert.equal(result.ivaAcquistiDetraibile, 0)
  assert.equal(result.saldoPeriodo, 0)
  assert.equal(result.debitoPeriodo, 0)
  assert.equal(result.creditoPeriodo, 0)
  assert.equal(result.righeIncluseCount, 0)
})

// 16. Multi-tenant logico: il domain riceve solo righe già filtrate e non deve mischiare società
test('16. Multi-tenant logico', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([
    row({ societa_id: SOCIETA, tipo: 'vendita', iva: 100 }),
    row({ societa_id: 'altra-societa', tipo: 'vendita', iva: 999 }),
  ], OPTIONS_BASE)

  assert.equal(result.ivaVenditeLorda, 100)
  assert.equal(result.righeIncluseCount, 1)
  assert.equal(result.righeEscluseCount, 1)
  assert.equal(result.righeEscluse[0].motivo, 'societa')
})
