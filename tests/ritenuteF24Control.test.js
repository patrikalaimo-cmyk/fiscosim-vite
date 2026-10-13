import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeF24ControlPeriod,
  resolveRitenutaF24ControlStatus,
} from '../src/modules/contabilita/domain/ritenute/resolveRitenutaF24ControlStatus.js'
import {
  buildRitenuteF24ControlRows,
  summarizeF24ControlStatuses,
} from '../src/modules/contabilita/application/ritenute/buildRitenuteF24ControlRows.js'
import { buildRitenuteScadenzarioRows } from '../src/modules/contabilita/application/ritenute/ritenuteScadenzarioService.js'

test('normalize period from MM/YYYY and payment date', () => {
  assert.equal(normalizeF24ControlPeriod({ periodoRiferimento: '09/2026' }), '09/2026')
  assert.equal(normalizeF24ControlPeriod({ paymentDate: '2026-09-20' }), '09/2026')
})

test('status verde giallo rosso', () => {
  assert.equal(resolveRitenutaF24ControlStatus({
    maturedAmount: 200,
    paidAmount: 200,
    dueDate: '2026-10-16',
    f24PaymentDate: '2026-10-10',
  }), 'verde')
  assert.equal(resolveRitenutaF24ControlStatus({
    maturedAmount: 200,
    paidAmount: 200,
    dueDate: '2026-10-16',
    f24PaymentDate: '2026-10-20',
  }), 'giallo')
  assert.equal(resolveRitenutaF24ControlStatus({
    maturedAmount: 200,
    paidAmount: 100,
    dueDate: '2026-10-16',
    f24PaymentDate: '2026-10-10',
  }), 'rosso')
  assert.equal(resolveRitenutaF24ControlStatus({
    maturedAmount: 200,
    paidAmount: 0,
    dueDate: '2026-10-16',
  }), 'rosso')
})

test('buildRitenuteF24ControlRows assigns verde/giallo/rosso by period pool', () => {
  const scadenzario = buildRitenuteScadenzarioRows({
    ritenute: [
      {
        id: 'rit-verde',
        stato: 'da_versare',
        data_pagamento: '2026-09-20',
        data_scadenza: '2026-10-16',
        periodo_riferimento: '09/2026',
        importo_ritenuta: 200,
        imponibile_ritenuta: 1000,
        codice_tributo: '1040',
        percipiente_id: 'p1',
        percipiente_cf: 'RSSMRA80A01H501U',
        percipiente_denominazione: 'Rossi',
      },
      {
        id: 'rit-giallo',
        stato: 'da_versare',
        data_pagamento: '2026-08-20',
        data_scadenza: '2026-09-16',
        periodo_riferimento: '08/2026',
        importo_ritenuta: 150,
        imponibile_ritenuta: 750,
        codice_tributo: '1040',
        percipiente_id: 'p1',
        percipiente_cf: 'RSSMRA80A01H501U',
        percipiente_denominazione: 'Rossi',
      },
      {
        id: 'rit-rosso',
        stato: 'da_versare',
        data_pagamento: '2026-07-20',
        data_scadenza: '2026-08-16',
        periodo_riferimento: '07/2026',
        importo_ritenuta: 100,
        imponibile_ritenuta: 500,
        codice_tributo: '1040',
        percipiente_id: 'p1',
        percipiente_cf: 'RSSMRA80A01H501U',
        percipiente_denominazione: 'Rossi',
      },
    ],
    year: 2026,
    today: '2026-09-21',
  })

  const controlled = buildRitenuteF24ControlRows({
    scadenzarioRows: scadenzario,
    f24Lines: [
      {
        id: 'f24-1',
        codice_tributo: '1040',
        periodo_riferimento: '09/2026',
        importo: 200,
        data_pagamento: '2026-10-10',
      },
      {
        id: 'f24-2',
        codice_tributo: '1040',
        periodo_riferimento: '08/2026',
        importo: 150,
        data_pagamento: '2026-09-20',
      },
      {
        id: 'f24-3',
        codice_tributo: '1040',
        periodo_riferimento: '07/2026',
        importo: 40,
        data_pagamento: '2026-08-10',
      },
    ],
  })

  const byId = Object.fromEntries(controlled.map((row) => [row.id, row.f24Control.status]))
  assert.equal(byId['rit-verde'], 'verde')
  assert.equal(byId['rit-giallo'], 'giallo')
  assert.equal(byId['rit-rosso'], 'rosso')
  assert.deepEqual(summarizeF24ControlStatuses(controlled), { verde: 1, giallo: 1, rosso: 1 })
})
