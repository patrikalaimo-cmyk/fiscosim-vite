import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAgingInsolutiModel,
  checkAgingMastriniCoherence,
  AGING_BUCKET_KEYS,
} from '../src/modules/contabilita/application/stampe/buildAgingInsolutiModel.js'
import { buildPartitariStampaModel, isStampaOperativa } from '../src/modules/contabilita/application/stampe/buildPartitariStampaModel.js'

test('aging is operative stampa type for Stampe tab wiring', () => {
  assert.equal(isStampaOperativa('aging'), true)
})
import { buildMovimentiPerContoModel } from '../src/modules/contabilita/application/stampe/buildMovimentiPerContoModel.js'

const societaId = 'soc-p307'
const CONTO_CLI = 'conto-cli-1'
const CONTO_FORN = 'conto-forn-1'
const asOf = '2026-07-15'

const partite = [
  {
    id: 'p-cur', societa_id: societaId, tipo: 'cliente',
    controparte_nome: 'Cliente Current', numero_documento: 'FA-C',
    data_documento: '2026-07-01', data_scadenza: '2026-07-20',
    importo_originale: 100, importo_pagato: 0, importo_residuo: 100,
    stato: 'aperta', conto_id: CONTO_CLI, conto_codice: '1.01',
    prima_nota_id: 'pn-c',
  },
  {
    id: 'p-30', societa_id: societaId, tipo: 'cliente',
    controparte_nome: 'Cliente 30', numero_documento: 'FA-30',
    data_documento: '2026-05-01', data_scadenza: '2026-06-20',
    importo_originale: 200, importo_pagato: 50, importo_residuo: 150,
    stato: 'parziale', conto_id: CONTO_CLI, conto_codice: '1.01',
    prima_nota_id: 'pn-30',
  },
  {
    id: 'p-90', societa_id: societaId, tipo: 'fornitore',
    controparte_nome: 'Fornitore 90', numero_documento: 'FP-90',
    data_documento: '2026-01-10', data_scadenza: '2026-02-01',
    importo_originale: 500, importo_pagato: 0, importo_residuo: 500,
    stato: 'aperta', conto_id: CONTO_FORN, conto_codice: '2.01',
    prima_nota_id: 'pn-90',
  },
  {
    id: 'p-closed', societa_id: societaId, tipo: 'cliente',
    controparte_nome: 'Cliente Closed', numero_documento: 'FA-X',
    data_documento: '2026-01-01', data_scadenza: '2026-01-31',
    importo_originale: 80, importo_pagato: 80, importo_residuo: 0,
    stato: 'chiusa', conto_id: CONTO_CLI, conto_codice: '1.01',
    prima_nota_id: 'pn-x',
  },
]

test('buildAgingInsolutiModel buckets open residuals by days overdue', () => {
  const model = buildAgingInsolutiModel(partite, { societaId, asOf, tipo: 'tutti' })
  assert.equal(model.valid, true, model.blockers.join(', '))
  assert.equal(model.kind, 'aging_insoluti')
  assert.equal(model.basis, 'partitario_da_prima_nota')
  assert.equal(model.definitive, false)
  assert.equal(model.rows.length, 3)
  assert.equal(model.totali.count, 3)
  assert.equal(model.totali.residuoComplessivo, 750)

  const byId = Object.fromEntries(model.rows.map((r) => [r.id, r]))
  assert.equal(byId['p-cur'].bucket, 'current')
  assert.equal(byId['p-30'].bucket, 'd1_30')
  assert.ok(byId['p-30'].daysOverdue >= 1 && byId['p-30'].daysOverdue <= 30)
  assert.equal(byId['p-90'].bucket, 'd90_plus')
  assert.ok(byId['p-90'].daysOverdue > 90)

  assert.equal(model.totali.byBucket.current, 100)
  assert.equal(model.totali.byBucket.d1_30, 150)
  assert.equal(model.totali.byBucket.d90_plus, 500)
  assert.ok(AGING_BUCKET_KEYS.includes('d61_90'))
})

test('buildAgingInsolutiModel blockers for societa/asOf and tipo filter', () => {
  const missing = buildAgingInsolutiModel(partite, { societaId: '', asOf })
  assert.ok(missing.blockers.includes('societa_id_mancante'))
  const badAsOf = buildAgingInsolutiModel(partite, { societaId, asOf: '15/07/2026' })
  assert.ok(badAsOf.blockers.includes('as_of_non_valido'))
  const clienti = buildAgingInsolutiModel(partite, { societaId, asOf, tipo: 'clienti' })
  assert.equal(clienti.valid, true)
  assert.equal(clienti.rows.length, 2)
  assert.equal(clienti.totali.residuoComplessivo, 250)
})

test('checkAgingMastriniCoherence partitario mode: open totals + opening PN in mastrini', () => {
  const aging = buildAgingInsolutiModel(partite, { societaId, asOf })
  const entries = [
    {
      id: 'pn-c', societa_id: societaId, stato: 'confermata',
      numero_registrazione: 1, data_registrazione: '2026-07-01',
      totale_dare: 100, totale_avere: 100,
      righe: [
        { id: 'r1', riga_numero: 1, conto_id: CONTO_CLI, conto_codice: '1.01', importo_dare: 100, importo_avere: 0 },
        { id: 'r2', riga_numero: 2, conto_id: 'ric', conto_codice: '4.01', importo_dare: 0, importo_avere: 100 },
      ],
    },
    {
      id: 'pn-30', societa_id: societaId, stato: 'confermata',
      numero_registrazione: 2, data_registrazione: '2026-05-01',
      totale_dare: 200, totale_avere: 200,
      righe: [
        { id: 'r3', riga_numero: 1, conto_id: CONTO_CLI, conto_codice: '1.01', importo_dare: 200, importo_avere: 0 },
        { id: 'r4', riga_numero: 2, conto_id: 'ric', conto_codice: '4.01', importo_dare: 0, importo_avere: 200 },
      ],
    },
    {
      id: 'pn-30-pay', societa_id: societaId, stato: 'confermata',
      numero_registrazione: 3, data_registrazione: '2026-06-01',
      totale_dare: 50, totale_avere: 50,
      righe: [
        { id: 'r5', riga_numero: 1, conto_id: 'ban', conto_codice: '1.10', importo_dare: 50, importo_avere: 0 },
        { id: 'r6', riga_numero: 2, conto_id: CONTO_CLI, conto_codice: '1.01', importo_dare: 0, importo_avere: 50 },
      ],
    },
    {
      id: 'pn-90', societa_id: societaId, stato: 'confermata',
      numero_registrazione: 4, data_registrazione: '2026-01-10',
      totale_dare: 500, totale_avere: 500,
      righe: [
        { id: 'r7', riga_numero: 1, conto_id: 'cos', conto_codice: '5.01', importo_dare: 500, importo_avere: 0 },
        { id: 'r8', riga_numero: 2, conto_id: CONTO_FORN, conto_codice: '2.01', importo_dare: 0, importo_avere: 500 },
      ],
    },
  ]
  const mastrini = buildMovimentiPerContoModel(entries, {
    societaId,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  })
  assert.equal(mastrini.valid, true, mastrini.blockers.join(', '))

  const partitari = buildPartitariStampaModel(partite, {
    societaId,
    stato: 'tutti',
  })
  const check = checkAgingMastriniCoherence(aging, mastrini, {
    mode: 'partitario',
    partitariModel: partitari,
  })
  assert.equal(check.coherent, true, JSON.stringify(check.mismatches))
  assert.equal(check.partitariEquivalence, true)
  assert.ok(check.compared.some((c) => c.primaNotaId === 'pn-c' && c.mastriniDare === 100))
  assert.ok(check.compared.some((c) => c.primaNotaId === 'pn-90' && c.mastriniAvere === 500))

  const ledger = checkAgingMastriniCoherence(aging, mastrini, {
    mode: 'ledger',
    partitariModel: partitari,
  })
  assert.equal(ledger.coherent, true, JSON.stringify(ledger.mismatches))
  assert.ok(ledger.compared.some((c) => c.contoId === CONTO_CLI && c.agingResidual === 250))
  assert.ok(ledger.compared.some((c) => c.contoId === CONTO_FORN && c.agingResidual === 500))
})

test('isStampaOperativa include aging', () => {
  assert.equal(isStampaOperativa('aging'), true)
})
