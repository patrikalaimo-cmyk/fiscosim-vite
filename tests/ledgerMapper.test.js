import test from 'node:test'
import assert from 'node:assert/strict'
import { mapCommitPayloadToPartitario } from '../domain/ledgerMapper.js'

function normalizedFixture() {
  return {
    company: { societaId: 'soc-1' },
    document: {
      type: 'fattura_passiva',
      number: 'F-100',
      documentDate: '2026-04-29',
      counterparty: { accountId: 'acc-1', accountCode: '2.01', name: 'Fornitore' },
      totals: { total: 122 },
    },
  }
}

test('ledger mapper produces opening item for partitario', () => {
  const row = mapCommitPayloadToPartitario(normalizedFixture())
  assert.equal(row.societa_id, 'soc-1')
  assert.equal(row.tipo, 'fornitore')
  assert.equal(row.importo_originale, 122)
  assert.equal(row.stato, 'aperta')
})

test('ledger mapper uses totals.gross when totals.total is missing', () => {
  const normalized = normalizedFixture()
  normalized.document.totals = { gross: 333 }
  const row = mapCommitPayloadToPartitario(normalized)
  assert.equal(row.importo_originale, 333)
  assert.equal(row.importo_residuo, 333)
})
