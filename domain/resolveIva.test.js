import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveIva } from './resolveIva.js'

test('resolveIva: conto causale should not override document aliquota when mismatching', () => {
  const causaliIva = [
    { id: 'c20', aliquota: 20, is_default_per_aliquota: true, codice_interno: 'A20' },
    { id: 'c22', aliquota: 22, is_default_per_aliquota: true, codice_interno: 'A22' },
  ]

  const conto = { causale_iva_id: 'c20' }
  const picked = resolveIva({ conto, aliquota: '22', natura: '', causaliIva })
  assert.equal(picked, 'c22')
})

test('resolveIva: conto causale remains a fallback when document aliquota is missing', () => {
  const causaliIva = [
    { id: 'c20', aliquota: 20, is_default_per_aliquota: true, codice_interno: 'A20' },
    { id: 'c22', aliquota: 22, is_default_per_aliquota: true, codice_interno: 'A22' },
  ]

  const conto = { causale_iva_id: 'c20' }
  const picked = resolveIva({ conto, aliquota: '', natura: '', causaliIva })
  assert.equal(picked, 'c20')
})

