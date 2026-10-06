import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCausaleContabilePolicy } from '../src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js'
import { resolveIvaDocumentPostingDirection } from '../src/modules/contabilita/domain/causali/resolveIvaDocumentPostingDirection.js'

test('1. Policy vendite + Somma produce direzione corretta', () => {
  const causale = {
    codice: 'GENERIC_VENDITE_SOMMA',
    tipo_causale: 'docivanormale',
    codice_registro_iva: '02', // vendite
    segno_registro_iva: '+',  // somma
  }
  const policy = buildCausaleContabilePolicy(causale)
  const direction = resolveIvaDocumentPostingDirection(policy)

  assert.equal(direction.registroKind, 'vendite')
  assert.equal(direction.segnoRegistro, 'somma')
  assert.equal(direction.subjectSide, 'dare')
  assert.equal(direction.vatSide, 'avere')
  assert.equal(direction.imputationSide, 'avere')
})

test('2. Policy vendite + Sottrae produce direzione corretta', () => {
  const causale = {
    codice: 'GENERIC_VENDITE_SOTTRAE',
    tipo_causale: 'docivanormale',
    codice_registro_iva: '02', // vendite
    segno_registro_iva: '-',  // sottrae
  }
  const policy = buildCausaleContabilePolicy(causale)
  const direction = resolveIvaDocumentPostingDirection(policy)

  assert.equal(direction.registroKind, 'vendite')
  assert.equal(direction.segnoRegistro, 'sottrae')
  assert.equal(direction.subjectSide, 'avere')
  assert.equal(direction.vatSide, 'dare')
  assert.equal(direction.imputationSide, 'dare')
})

test('3. Policy acquisti + Somma produce direzione corretta', () => {
  const causale = {
    codice: 'GENERIC_ACQUISTI_SOMMA',
    tipo_causale: 'docivanormale',
    codice_registro_iva: '01', // acquisti
    segno_registro_iva: '+',  // somma
  }
  const policy = buildCausaleContabilePolicy(causale)
  const direction = resolveIvaDocumentPostingDirection(policy)

  assert.equal(direction.registroKind, 'acquisti')
  assert.equal(direction.segnoRegistro, 'somma')
  assert.equal(direction.subjectSide, 'avere')
  assert.equal(direction.vatSide, 'dare')
  assert.equal(direction.imputationSide, 'dare')
})

test('4. Policy acquisti + Sottrae produce direzione corretta', () => {
  const causale = {
    codice: 'GENERIC_ACQUISTI_SOTTRAE',
    tipo_causale: 'docivanormale',
    codice_registro_iva: '01', // acquisti
    segno_registro_iva: '-',  // sottrae
  }
  const policy = buildCausaleContabilePolicy(causale)
  const direction = resolveIvaDocumentPostingDirection(policy)

  assert.equal(direction.registroKind, 'acquisti')
  assert.equal(direction.segnoRegistro, 'sottrae')
  assert.equal(direction.subjectSide, 'dare')
  assert.equal(direction.vatSide, 'avere')
  assert.equal(direction.imputationSide, 'avere')
})

test('5. Codice causale generico ZZZ + impostazioni vendite/sottrae produce comunque nota credito vendita corretta', () => {
  const causale = {
    codice: 'ZZZ',
    tipo_causale: 'notacredito',
    codice_registro_iva: '02',
    segno_registro_iva: '-',
  }
  const policy = buildCausaleContabilePolicy(causale)
  
  // Verifica che la causale sia vista come nota di credito attiva
  assert.equal(policy.isNotaCreditoAttiva, true)
  assert.equal(policy.isNotaCreditoPassiva, false)

  const direction = resolveIvaDocumentPostingDirection(policy)
  assert.equal(direction.registroKind, 'vendite')
  assert.equal(direction.segnoRegistro, 'sottrae')
  assert.equal(direction.subjectSide, 'avere')
  assert.equal(direction.vatSide, 'dare')
  assert.equal(direction.imputationSide, 'dare')
})

test('6. Codice causale generico YYY + impostazioni acquisti/sottrae produce comunque nota credito acquisto corretta', () => {
  const causale = {
    codice: 'YYY',
    tipo_causale: 'notacredito',
    codice_registro_iva: '01',
    segno_registro_iva: '-',
  }
  const policy = buildCausaleContabilePolicy(causale)

  // Verifica che la causale sia vista come nota di credito passiva
  assert.equal(policy.isNotaCreditoPassiva, true)
  assert.equal(policy.isNotaCreditoAttiva, false)

  const direction = resolveIvaDocumentPostingDirection(policy)
  assert.equal(direction.registroKind, 'acquisti')
  assert.equal(direction.segnoRegistro, 'sottrae')
  assert.equal(direction.subjectSide, 'dare')
  assert.equal(direction.vatSide, 'avere')
  assert.equal(direction.imputationSide, 'avere')
})

test('7. Se mancano metadati, fallback da codice causale residuale interviene', () => {
  // Test fallback per codice NCF (nota di credito passiva)
  const causaleNCF = {
    codice: 'NCF',
  }
  const policyNCF = buildCausaleContabilePolicy(causaleNCF)
  assert.equal(policyNCF.isNotaCreditoPassiva, true)

  const dirNCF = resolveIvaDocumentPostingDirection(policyNCF)
  assert.equal(dirNCF.registroKind, 'acquisti')
  assert.equal(dirNCF.segnoRegistro, 'sottrae')
  assert.equal(dirNCF.subjectSide, 'dare')

  // Test fallback per codice FF (fattura passiva)
  const causaleFF = {
    codice: 'FF',
    tipo_causale: 'docivanormale',
  }
  const policyFF = buildCausaleContabilePolicy(causaleFF)
  assert.equal(policyFF.isFatturaPassiva, true)

  const dirFF = resolveIvaDocumentPostingDirection(policyFF)
  assert.equal(dirFF.registroKind, 'acquisti')
  assert.equal(dirFF.segnoRegistro, 'somma')
  assert.equal(dirFF.subjectSide, 'avere')
})

test('8. PD/GEN non attivano IVA/partitario se policy non lo prevede', () => {
  const causalePD = {
    codice: 'PD',
    tipo_causale: 'generale',
  }
  const policyPD = buildCausaleContabilePolicy(causalePD)

  assert.equal(policyPD.isDocumentoIva, false)
  assert.equal(policyPD.gestionePartitario, 'nessuno')
  assert.equal(policyPD.richiedeDataDocumento, false)
  assert.equal(policyPD.richiedeNumeroDocumento, false)
})

test('9. FF/FC/NC/NCF reali producono impostazioni coerenti', () => {
  const ff = buildCausaleContabilePolicy({ codice: 'FF', tipo_causale: 'docivanormale', codice_registro_iva: '01', segno_registro_iva: '+' })
  assert.equal(ff.isDocumentoIva, true)
  assert.equal(ff.isFatturaPassiva, true)

  const fc = buildCausaleContabilePolicy({ codice: 'FC', tipo_causale: 'docivanormale', codice_registro_iva: '02', segno_registro_iva: '+' })
  assert.equal(fc.isDocumentoIva, true)
  assert.equal(fc.isFatturaAttiva, true)

  const nc = buildCausaleContabilePolicy({ codice: 'NC', tipo_causale: 'notacredito', codice_registro_iva: '02', segno_registro_iva: '-' })
  assert.equal(nc.isDocumentoIva, true)
  assert.equal(nc.isNotaCreditoAttiva, true)

  const ncf = buildCausaleContabilePolicy({ codice: 'NCF', tipo_causale: 'notacredito', codice_registro_iva: '01', segno_registro_iva: '-' })
  assert.equal(ncf.isDocumentoIva, true)
  assert.equal(ncf.isNotaCreditoPassiva, true)
})
