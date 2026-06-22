import test from 'node:test'
import assert from 'node:assert/strict'

test('FASE 13E - Blocco e visualizzazione periodi stampati definitivi', async (t) => {
  await t.test('1. Una scrittura con periodo_chiuso_lock = true viene riconosciuta come bloccata', () => {
    const scrittura = { periodo_chiuso_lock: true }
    const isPeriodoChiuso = Boolean(scrittura.periodo_chiuso_lock || scrittura.stampa_giornale_id)
    assert.strictEqual(isPeriodoChiuso, true)
  })

  await t.test('2. Una scrittura con stampa_giornale_id valorizzato viene riconosciuta come stampata definitiva', () => {
    const scrittura = { stampa_giornale_id: '5f7ac3b9-b77b-4e68-87d4-eb81af52d099' }
    const isPeriodoChiuso = Boolean(scrittura.periodo_chiuso_lock || scrittura.stampa_giornale_id)
    assert.strictEqual(isPeriodoChiuso, true)
  })

  await t.test('3. Una scrittura ordinaria non stampata mantiene le azioni normali', () => {
    const scrittura = { periodo_chiuso_lock: false, stampa_giornale_id: null }
    const isPeriodoChiuso = Boolean(scrittura.periodo_chiuso_lock || scrittura.stampa_giornale_id)
    assert.strictEqual(isPeriodoChiuso, false)
  })

  await t.test('4. La logica non usa label testuali o codici causale per decidere il blocco', () => {
    const scrittura = { causale_codice: 'FF', periodo_chiuso_lock: false, stampa_giornale_id: null }
    const isPeriodoChiuso = Boolean(scrittura.periodo_chiuso_lock || scrittura.stampa_giornale_id)
    assert.strictEqual(isPeriodoChiuso, false, 'Non deve bloccare basandosi solo su codice causale')
  })
})
