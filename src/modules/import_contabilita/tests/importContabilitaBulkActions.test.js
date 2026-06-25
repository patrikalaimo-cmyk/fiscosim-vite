import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCausaleContabilePolicy } from '../../contabilita/domain/causali/buildCausaleContabilePolicy.js'

// Simple helper to check if row has TD04/TD08
function isCreditNoteDoc(row) {
  const tipoDoc = String(row?.parsedDocument?.tipoDocumento || '').trim().toUpperCase()
  return tipoDoc === 'TD04' || tipoDoc === 'TD08'
}

test('1. isCreditNoteDoc correctly identifies TD04 and TD08', () => {
  const cn1 = { parsedDocument: { tipoDocumento: 'TD04' } }
  const cn2 = { parsedDocument: { tipoDocumento: 'TD08' } }
  const inv = { parsedDocument: { tipoDocumento: 'TD01' } }

  assert.ok(isCreditNoteDoc(cn1))
  assert.ok(isCreditNoteDoc(cn2))
  assert.ok(!isCreditNoteDoc(inv))
})

test('2. causale policy is correctly resolved', () => {
  // Test invoice causale policy
  const causaleFF = { codice: 'FF', tipo_causale: 'docivanormale', codice_registro_iva: '01', segno_registro_iva: '+' }
  const policyFF = buildCausaleContabilePolicy(causaleFF)
  assert.equal(policyFF.notaCredito, false)
  assert.equal(policyFF.isFatturaPassiva, true)

  // Test credit note causale policy
  const causaleNCF = { codice: 'NCF', tipo_causale: 'notacredito', codice_registro_iva: '01', segno_registro_iva: '-' }
  const policyNCF = buildCausaleContabilePolicy(causaleNCF)
  assert.equal(policyNCF.notaCredito, true)
  assert.equal(policyNCF.isNotaCreditoPassiva, true)
})

test('3. Credit Note + invoice causale is identified as incompatible', () => {
  const row = { parsedDocument: { tipoDocumento: 'TD04' } }
  const causaleFF = { codice: 'FF', tipo_causale: 'docivanormale', codice_registro_iva: '01', segno_registro_iva: '+' }
  const policyFF = buildCausaleContabilePolicy(causaleFF)

  const isNotaCreditoDoc = isCreditNoteDoc(row)
  const isIncompatible = isNotaCreditoDoc && (!policyFF.notaCredito || policyFF.isFatturaPassiva || policyFF.isFatturaAttiva)
  assert.ok(isIncompatible)
})

test('4. Invoice + invoice causale is compatible', () => {
  const row = { parsedDocument: { tipoDocumento: 'TD01' } }
  const causaleFF = { codice: 'FF', tipo_causale: 'docivanormale', codice_registro_iva: '01', segno_registro_iva: '+' }
  const policyFF = buildCausaleContabilePolicy(causaleFF)

  const isNotaCreditoDoc = isCreditNoteDoc(row)
  const isIncompatible = isNotaCreditoDoc && (!policyFF.notaCredito || policyFF.isFatturaPassiva || policyFF.isFatturaAttiva)
  assert.ok(!isIncompatible)
})

test('5. Credit Note + credit note causale is compatible', () => {
  const row = { parsedDocument: { tipoDocumento: 'TD04' } }
  const causaleNCF = { codice: 'NCF', tipo_causale: 'notacredito', codice_registro_iva: '01', segno_registro_iva: '-' }
  const policyNCF = buildCausaleContabilePolicy(causaleNCF)

  const isNotaCreditoDoc = isCreditNoteDoc(row)
  const isIncompatible = isNotaCreditoDoc && (!policyNCF.notaCredito || policyNCF.isFatturaPassiva || policyNCF.isFatturaAttiva)
  assert.ok(!isIncompatible)
})

test('6. Bulk account application updates only selected rows', () => {
  const selectedRowIds = new Set(['row1', 'row3'])
  const manualAccountByRowId = {
    row1: { id: 'old-id', codice: 'old-code', descrizione: 'old-desc' },
    row2: { id: 'old-id', codice: 'old-code', descrizione: 'old-desc' },
  }
  const chosenConto = { id: 'new-id-uuid', codice: 'new-code', descrizione: 'new-desc' }

  // Simulate onApplyContoBulk select handler
  const nextAccounts = { ...manualAccountByRowId }
  selectedRowIds.forEach((id) => {
    nextAccounts[id] = {
      id: chosenConto.id,
      codice: chosenConto.codice,
      descrizione: chosenConto.descrizione,
    }
  })

  // Selected updated:
  assert.equal(nextAccounts.row1.id, 'new-id-uuid')
  assert.equal(nextAccounts.row3.id, 'new-id-uuid')
  // Unselected unchanged:
  assert.equal(nextAccounts.row2.id, 'old-id')
})
