import test from 'node:test'
import assert from 'node:assert/strict'

// Simulazione della logica di isPeriodoStampaDefinita implementata in RegistrazioneManualeView
function evaluatePeriodoStampaDefinita(dataRegistrazione, stampeDefinitive) {
  if (!dataRegistrazione || !stampeDefinitive || !stampeDefinitive.length) return false
  const currentRegDate = new Date(dataRegistrazione)
  if (isNaN(currentRegDate.getTime())) return false

  return stampeDefinitive.some((stampa) => {
    if (stampa.stato !== 'valida') return false
    if (!['libro_giornale', 'registro_iva_acquisti', 'registro_iva_vendite', 'liquidazione_iva_periodica'].includes(stampa.tipo_stampa)) {
      return false
    }
    const start = new Date(stampa.periodo_inizio)
    const end = new Date(stampa.periodo_fine)
    return currentRegDate >= start && currentRegDate <= end
  })
}

test('FASE 13F - Blocco nuove registrazioni su periodi stampati definitivi', async (t) => {
  const stampeDefinitiveMock = [
    {
      id: '5f7ac3b9-b77b-4e68-87d4-eb81af52d099',
      tipo_stampa: 'libro_giornale',
      periodo_inizio: '2026-05-01',
      periodo_fine: '2026-06-30',
      stato: 'valida',
      societa_id: 'societa-1'
    },
    {
      id: 'registro-iva-vendite-id',
      tipo_stampa: 'registro_iva_vendite',
      periodo_inizio: '2026-07-01',
      periodo_fine: '2026-07-31',
      stato: 'valida',
      societa_id: 'societa-1'
    },
    {
      id: 'annullata-id',
      tipo_stampa: 'libro_giornale',
      periodo_inizio: '2026-08-01',
      periodo_fine: '2026-08-31',
      stato: 'annullata',
      societa_id: 'societa-1'
    }
  ]

  await t.test('1. Data dentro periodo Libro Giornale stampato definitivo con stato valida -> BLOCCATO', () => {
    const isBlocked = evaluatePeriodoStampaDefinita('2026-05-21', stampeDefinitiveMock)
    assert.strictEqual(isBlocked, true)
  })

  await t.test('2. Data fuori periodo stampato definitivo -> CONSENTITO', () => {
    const isBlocked = evaluatePeriodoStampaDefinita('2026-04-30', stampeDefinitiveMock)
    assert.strictEqual(isBlocked, false)
  })

  await t.test('3. Data dentro periodo con stato non valido (annullata/riaperto) -> CONSENTITO', () => {
    const isBlocked = evaluatePeriodoStampaDefinita('2026-08-15', stampeDefinitiveMock)
    assert.strictEqual(isBlocked, false)
  })

  await t.test('4. Data dentro periodo Registro IVA Vendite stampato definitivo -> BLOCCATO', () => {
    const isBlocked = evaluatePeriodoStampaDefinita('2026-07-15', stampeDefinitiveMock)
    assert.strictEqual(isBlocked, true)
  })

  await t.test('5. Blocco basato su date e stato, no causale o label', () => {
    // Si verifica che la funzione evaluatePeriodoStampaDefinita riceva solo la data e l'array, senza dipendere da causali
    const isBlocked = evaluatePeriodoStampaDefinita('2026-05-21', stampeDefinitiveMock)
    assert.strictEqual(isBlocked, true)
  })
})
