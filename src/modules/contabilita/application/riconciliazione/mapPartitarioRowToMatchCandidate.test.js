import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMatcherMovementFromWorkingRow,
  mapPartitarioRowToMatchCandidate,
  mapPartitarioRowsToMatchCandidates,
} from './mapPartitarioRowToMatchCandidate.js'

test('mapPartitarioRowToMatchCandidate — mappa partita aperta e scarta residuo zero', () => {
  const open = mapPartitarioRowToMatchCandidate({
    id: 'part-1',
    tipo: 'cliente',
    conto_id: 'cli-1',
    controparte_nome: 'Cliente Demo',
    numero_documento: 'FT-10',
    data_documento: '2026-09-01',
    data_scadenza: '2026-10-01',
    importo_originale: 122,
    importo_residuo: 122,
    stato: 'aperta',
  })
  assert.equal(open.partitaId, 'part-1')
  assert.equal(open.soggettoTipo, 'cliente')
  assert.equal(open.importoAperto, 122)
  assert.equal(open.numeroDocumento, 'FT-10')

  assert.equal(mapPartitarioRowToMatchCandidate({
    id: 'part-closed',
    importo_residuo: 0,
  }), null)
})

test('mapPartitarioRowsToMatchCandidates — filtra null', () => {
  const rows = mapPartitarioRowsToMatchCandidates([
    { id: 'a', importo_residuo: 50, tipo: 'fornitore' },
    { id: 'b', importo_residuo: 0 },
    { importo_residuo: 10 },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].partitaId, 'a')
  assert.equal(rows[0].soggettoTipo, 'fornitore')
})

test('buildMatcherMovementFromWorkingRow — direction + amount da working row', () => {
  const movement = buildMatcherMovementFromWorkingRow({
    id: 'mv-1',
    dateOp: '2026-10-01',
    dateVal: '2026-10-02',
    entrata: 122,
    description: 'Bonifico FT-10',
    counterparty: 'Cliente Demo',
  }, { bankAccountId: 'bank-1', sourceFileName: 'estratto.csv' })
  assert.equal(movement.movementId, 'mv-1')
  assert.equal(movement.direction, 'in')
  assert.equal(movement.amount, 122)
  assert.equal(movement.bankAccountId, 'bank-1')
  assert.match(movement.descriptionNormalized, /bonifico/)
})
