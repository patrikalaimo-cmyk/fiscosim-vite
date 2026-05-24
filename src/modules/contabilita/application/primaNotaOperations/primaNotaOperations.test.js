import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPrimaNotaListViewModel } from './buildPrimaNotaListViewModel.js'
import { buildPrimaNotaDetailViewModel } from './buildPrimaNotaDetailViewModel.js'
import { buildMastrinoViewModel } from './buildMastrinoViewModel.js'

test('buildPrimaNotaListViewModel normalizza la lista scritture', () => {
  const result = buildPrimaNotaListViewModel([
    {
      id: 'pn-1',
      prima_nota_id: 'pn-1',
      societa_id: 'soc-1',
      numero_registrazione: 10,
      data_registrazione: '2026-04-30',
      data_documento: '2026-04-30',
      numero_documento: 'A-100',
      causale_codice: 'FF',
      descrizione: 'Fornitore Demo',
      cliente_fornitore_id: 'acc-counterparty',
      cliente_fornitore_nome: 'Fornitore Demo',
      totale_dare: 122,
      totale_avere: 122,
      stato: 'quadrata',
      stato_quadratura: 'quadrata',
      saldo: 0,
      created_at: '2026-04-30T10:00:00.000Z',
    },
  ], {
    pianoConti: [
      { id: 'acc-counterparty', codice: '2.01.001', descrizione: 'Fornitore Demo' },
    ],
  })

  assert.equal(result.count, 1)
  assert.equal(result.rows[0].clienteFornitoreCodice, '2.01.001')
  assert.equal(result.rows[0].clienteFornitoreNome, 'Fornitore Demo')
  assert.equal(result.rows[0].statoQuadratura, 'quadrata')
  assert.equal(result.totals.dare, 122)
  assert.equal(result.totals.avere, 122)
  assert.equal(result.hasLimitWarning, false)
})

test('buildPrimaNotaDetailViewModel normalizza testata e righe', () => {
  const result = buildPrimaNotaDetailViewModel({
    scrittura: {
      id: 'pn-1',
      societa_id: 'soc-1',
      numero_registrazione: 10,
      data_registrazione: '2026-04-30',
      data_documento: '2026-04-30',
      numero_documento: 'A-100',
      causale_codice: 'FF',
      descrizione: 'Fornitore Demo',
      cliente_fornitore_id: 'acc-counterparty',
      cliente_fornitore_nome: 'Fornitore Demo',
      totale_dare: 122,
      totale_avere: 122,
      stato: 'quadrata',
    },
    righe: [
      { id: 'r-1', riga_numero: 1, conto_id: 'acc-cost', conto_codice: '6.01', conto_descrizione: 'Costo', descrizione_riga: 'Costo', importo_dare: 100, importo_avere: 0 },
      { id: 'r-2', riga_numero: 2, conto_id: 'acc-iva', conto_codice: '7.01', conto_descrizione: 'IVA', descrizione_riga: 'IVA', importo_dare: 22, importo_avere: 0 },
      { id: 'r-3', riga_numero: 3, conto_id: 'acc-counterparty', conto_codice: '2.01.001', conto_descrizione: 'Fornitore Demo', descrizione_riga: 'Fornitore', importo_dare: 0, importo_avere: 122 },
    ],
  })

  assert.equal(result.scrittura.statoQuadratura, 'quadrata')
  assert.equal(result.righe.length, 3)
  assert.equal(result.righe[0].conto_codice, '6.01')
  assert.equal(result.totals.dare, 122)
  assert.equal(result.totals.avere, 122)
  assert.equal(result.totals.isBalanced, true)
})

test('buildMastrinoViewModel costruisce saldo progressivo', () => {
  const result = buildMastrinoViewModel([
    {
      id: 'r-1',
      conto_id: 'acc-cost',
      descrizione_riga: 'Costo',
      importo_dare: 100,
      importo_avere: 0,
      prima_nota: {
        id: 'pn-1',
        data_registrazione: '2026-04-30',
        numero_registrazione: 10,
        numero_documento: 'A-100',
        causale_codice: 'FF',
      },
    },
    {
      id: 'r-2',
      conto_id: 'acc-cost',
      descrizione_riga: 'IVA',
      importo_dare: 22,
      importo_avere: 0,
      prima_nota: {
        id: 'pn-1',
        data_registrazione: '2026-04-30',
        numero_registrazione: 10,
        numero_documento: 'A-100',
        causale_codice: 'FF',
      },
    },
  ], {
    contoId: 'acc-cost',
    contoDescrizione: 'Costo',
    contoCodice: '6.01',
  })

  assert.equal(result.entries.length, 2)
  assert.equal(result.entries[0].saldoProgressivo, 100)
  assert.equal(result.entries[1].saldoProgressivo, 122)
  assert.equal(result.totals.dare, 122)
  assert.equal(result.totals.avere, 0)
  assert.equal(result.isBalanced, false)
})
