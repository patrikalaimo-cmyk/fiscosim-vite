import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRitenuteScadenzarioRows } from '../src/modules/contabilita/application/ritenute/ritenuteScadenzarioService.js'

const maturata = {
  id: 'rit-1',
  societa_id: 'soc-1',
  percipiente_id: 'perc-1',
  percipiente_denominazione: 'Studio Rossi',
  percipiente_cf: 'RSSMRA80A01H501U',
  numero_documento: 'PAR-12',
  data_pagamento: '2026-06-30',
  data_scadenza: '2026-07-16',
  imponibile_ritenuta: 1000,
  importo_ritenuta: 200,
  codice_tributo: '1040',
  periodo_riferimento: '06',
  anno_riferimento: 2026,
  stato: 'da_versare',
  prima_nota_id: 'pn-parcella',
  prima_nota_pagamento_id: 'pn-pagamento',
  partitario_id: 'partita-1',
}

test('espone la ritenuta maturata nello scadenzario senza generare F24 o prima nota', () => {
  const source = structuredClone(maturata)
  const rows = buildRitenuteScadenzarioRows({
    ritenute: [source],
    year: 2026,
    today: '2026-07-10',
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].stato, 'da_versare')
  assert.equal(rows[0].paymentDate, '2026-06-30')
  assert.equal(rows[0].dueDate, '2026-07-16')
  assert.equal(rows[0].withholdingAmount, 200)
  assert.equal(rows[0].codiceTributo, '1040')
  assert.equal(rows[0].primaNotaParcellaId, 'pn-parcella')
  assert.equal(rows[0].primaNotaPagamentoId, 'pn-pagamento')
  assert.equal(rows[0].futureF24.automated, false)
  assert.equal(Object.hasOwn(rows[0], 'primaNotaF24'), false)
  assert.deepEqual(source, maturata)
})

test('predispone i dati CU/770 dal pagamento parcella maturato', () => {
  const [row] = buildRitenuteScadenzarioRows({
    ritenute: [maturata],
    year: 2026,
  })

  assert.deepEqual(row.cu770, {
    ready: true,
    percipienteId: 'perc-1',
    imponibileRitenuta: 1000,
    importoRitenuta: 200,
    dataPagamento: '2026-06-30',
    codiceTributo: '1040',
    annoFiscale: 2026,
  })
})

test('esclude ritenute predisposte e non duplica i record maturati', () => {
  const rows = buildRitenuteScadenzarioRows({
    ritenute: [
      maturata,
      { ...maturata, id: 'rit-predisposta', stato: 'predisposta', data_pagamento: null },
    ],
    year: 2026,
  })

  assert.deepEqual(rows.map((row) => row.id), ['rit-1'])
})

test('ricava il giorno 16 del mese successivo se la scadenza persistita manca', () => {
  const [row] = buildRitenuteScadenzarioRows({
    ritenute: [{ ...maturata, data_scadenza: null }],
    year: 2026,
    today: '2026-07-17',
  })

  assert.equal(row.dueDate, '2026-07-16')
  assert.equal(row.operationalStatus, 'scaduta')
})
