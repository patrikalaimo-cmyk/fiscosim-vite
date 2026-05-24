import test from 'node:test'
import assert from 'node:assert/strict'
import { mapCommitPayloadToRegistriIva } from '../domain/vatRegisterMapper.js'

function normalizedFixture() {
  return {
    company: { societaId: 'soc-1' },
    document: {
      id: 'doc-1',
      type: 'fattura_passiva',
      registrationDate: '2026-04-30',
      number: 'F-100',
    },
    vat: {
      rows: [
        { index: 0, taxable: 100, vat: 22, causaleIvaId: 'iva-22', rate: 22 },
      ],
    },
  }
}

test('vat mapper produces registri_iva rows', () => {
  const rows = mapCommitPayloadToRegistriIva(normalizedFixture())
  assert.equal(rows.length, 1)
  assert.equal(rows[0].societa_id, 'soc-1')
  assert.equal(rows[0].causale_iva_id, 'iva-22')
  assert.equal(rows[0].imponibile, 100)
})
