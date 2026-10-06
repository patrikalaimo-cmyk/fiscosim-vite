import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getDefaultMastrinoForTipo,
  getAllowedMastriniForTipo,
  isAllowedMastrinoForTipo,
  getAllowedExistingAccounts,
  validateAnagraficaDecision,
} from '../domain/anagraficaValidation.js'

test('1. fornitore con default mastrino Italia', () => {
  const mastrino = getDefaultMastrinoForTipo('fornitore')
  assert.equal(mastrino, '2.03.08')
})

test('2. cliente con default mastrino Italia', () => {
  const mastrino = getDefaultMastrinoForTipo('cliente')
  assert.equal(mastrino, '1.02.20')
})

test('3. fornitore con mastrino consentito Estero/Professionisti', () => {
  const allowed = getAllowedMastriniForTipo('fornitore').map(m => m.codice)
  assert.ok(allowed.includes('2.03.09')) // Estero
  assert.ok(allowed.includes('2.03.10')) // Professionisti
})

test('4. cliente non può vedere mastrino Professionisti', () => {
  const allowed = getAllowedMastriniForTipo('cliente').map(m => m.codice)
  assert.ok(!allowed.includes('2.03.10')) // Professionisti is forbidden for cliente
  assert.ok(allowed.includes('1.02.21')) // Estero is allowed
})

test('5. conto esistente mostra solo conti coerenti con tipo controparte/mastrino', () => {
  const mockPianoConti = [
    { id: '1', codice: '2.03.08.001', descrizione: 'Fornitore Italia 1' },
    { id: '2', codice: '2.03.09.001', descrizione: 'Fornitore Estero 1' },
    { id: '3', codice: '1.02.20.001', descrizione: 'Cliente Italia 1' },
    { id: '4', codice: '4.01.01.001', descrizione: 'Costo Generico' }, // Banca/Costo ecc.
  ]

  // For supplier, mastrino Italia:
  const supplierItalia = getAllowedExistingAccounts('fornitore', mockPianoConti, '', '2.03.08')
  assert.equal(supplierItalia.length, 1)
  assert.equal(supplierItalia[0].id, '1')

  // For customer, mastrino Italia:
  const customerItalia = getAllowedExistingAccounts('cliente', mockPianoConti, '', '1.02.20')
  assert.equal(customerItalia.length, 1)
  assert.equal(customerItalia[0].id, '3')
})

test('6. conto_id non può essere valorizzato con label o codice', () => {
  const mockPianoConti = [
    { id: 'acc-uuid-12345', codice: '2.03.08.001', descrizione: 'Fornitore Italia 1' }
  ]
  const row = { denominazione: 'Fornitore Srl', partitaIva: '12345678901' }

  // Caso A: conto_id valido (UUID)
  const decisionValid = {
    tipo: 'fornitore',
    accountMode: 'existing',
    mastrino: '2.03.08',
    existingAccountId: 'acc-uuid-12345',
    existingAccountCode: '2.03.08.001'
  }
  const resultValid = validateAnagraficaDecision(row, decisionValid, mockPianoConti)
  assert.equal(resultValid.status, 'linked')

  // Caso B: conto_id è il codice (che non corrisponde ad alcun conto nel piano dei conti)
  const decisionInvalidCode = {
    tipo: 'fornitore',
    accountMode: 'existing',
    mastrino: '2.03.08',
    existingAccountId: '2.03.08.099',
    existingAccountCode: '2.03.08.099'
  }
  const resultInvalidCode = validateAnagraficaDecision(row, decisionInvalidCode, mockPianoConti)
  assert.equal(resultInvalidCode.status, 'invalid')
  assert.ok(resultInvalidCode.blockingReasons.includes('conto_id non può contenere codice o label'))

  // Caso C: conto_id è la label
  const decisionInvalidLabel = {
    tipo: 'fornitore',
    accountMode: 'existing',
    mastrino: '2.03.08',
    existingAccountId: '2.03.08.099 - Fornitore Italia 99',
    existingAccountCode: '2.03.08.099'
  }
  const resultInvalidLabel = validateAnagraficaDecision(row, decisionInvalidLabel, mockPianoConti)
  assert.equal(resultInvalidLabel.status, 'invalid')
  assert.ok(resultInvalidLabel.blockingReasons.includes('conto_id non può contenere codice o label'))
})
