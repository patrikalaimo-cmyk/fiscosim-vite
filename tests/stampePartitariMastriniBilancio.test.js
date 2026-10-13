import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPartitariStampaModel,
  isStampaOperativa,
  STAMPE_OPERATIVE_TYPES,
} from '../src/modules/contabilita/application/stampe/buildPartitariStampaModel.js'
import { buildMovimentiPerContoModel } from '../src/modules/contabilita/application/stampe/buildMovimentiPerContoModel.js'
import { buildSaldiPerContoEsercizioModel } from '../src/modules/contabilita/application/stampe/buildSaldiPerContoEsercizioModel.js'

const societaId = 'soc-p303'

const partite = [
  {
    id: 'p1', societa_id: societaId, tipo: 'cliente',
    controparte_nome: 'Cliente Alfa', numero_documento: 'FA-1',
    data_documento: '2026-04-10', data_scadenza: '2026-05-10',
    importo_originale: 1220, importo_pagato: 0, importo_residuo: 1220,
    stato: 'aperta', prima_nota_id: 'pn-open',
  },
  {
    id: 'p2', societa_id: societaId, tipo: 'fornitore',
    conto_descrizione: 'Fornitore Beta', numero_documento: 'FP-2',
    data_documento: '2026-04-12', data_scadenza: '2026-05-12',
    importo_originale: 500, importo_pagato: 200, importo_residuo: 300,
    stato: 'parziale', prima_nota_id: 'pn-fp',
  },
  {
    id: 'p3', societa_id: societaId, tipo: 'cliente',
    controparte_nome: 'Cliente Gamma', numero_documento: 'FA-3',
    data_documento: '2025-12-01', data_scadenza: '2025-12-31',
    importo_originale: 100, importo_pagato: 100, importo_residuo: 0,
    stato: 'chiusa', prima_nota_id: 'pn-old',
  },
]

test('buildPartitariStampaModel normalizza righe e filtra periodo/tipo', () => {
  const model = buildPartitariStampaModel(partite, {
    societaId,
    tipo: 'clienti',
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  })
  assert.equal(model.valid, true, model.blockers.join(', '))
  assert.equal(model.kind, 'partitari_clienti_fornitori')
  assert.equal(model.basis, 'partitario_da_prima_nota')
  assert.equal(model.definitive, false)
  assert.equal(model.rows.length, 1)
  assert.equal(model.rows[0].subject, 'Cliente Alfa')
  assert.equal(model.rows[0].type, 'clienti')
  assert.equal(model.rows[0].residual, 1220)
  assert.equal(model.totali.count, 1)
  assert.equal(model.partiteEscluse >= 1, true)
})

test('buildPartitariStampaModel blocca societa mancante e importi incoerenti', () => {
  const missing = buildPartitariStampaModel(partite, { societaId: '' })
  assert.ok(missing.blockers.includes('societa_id_mancante'))
  const bad = buildPartitariStampaModel([{
    ...partite[0], importo_originale: 100, importo_pagato: 10, importo_residuo: 50,
  }], { societaId })
  assert.equal(bad.valid, true)
  assert.equal(bad.rows.length, 0)
  assert.equal(bad.partiteEscluse, 1)
})

test('isOperativo include partitari, mastrini, bilancio', () => {
  for (const t of ['partitari', 'mastrini', 'bilancio', 'registri_iva', 'giornale', 'liquidazione_iva_periodica']) {
    assert.equal(isStampaOperativa(t), true, t)
  }
  assert.ok(STAMPE_OPERATIVE_TYPES.includes('partitari'))
  assert.ok(STAMPE_OPERATIVE_TYPES.includes('mastrini'))
  assert.ok(STAMPE_OPERATIVE_TYPES.includes('bilancio'))
  assert.equal(isStampaOperativa('fascicolo'), true)
})

test('mastrini e bilancio models restano interrogabili da PN (no mock amounts)', () => {
  const entries = [{
    id: 'pn-1', societa_id: societaId, stato: 'confermata',
    numero_registrazione: 1, data_registrazione: '2026-04-10',
    totale_dare: 1220, totale_avere: 1220,
    righe: [
      { id: 'r1', riga_numero: 1, conto_id: 'cli', conto_codice: '1.01', conto_descrizione: 'Cliente', importo_dare: 1220, importo_avere: 0 },
      { id: 'r2', riga_numero: 2, conto_id: 'ric', conto_codice: '4.01', conto_descrizione: 'Ricavi', importo_dare: 0, importo_avere: 1000 },
      { id: 'r3', riga_numero: 3, conto_id: 'iva', conto_codice: '2.01', conto_descrizione: 'IVA', importo_dare: 0, importo_avere: 220 },
    ],
  }]
  const chart = [
    { id: 'cli', societa_id: societaId, codice: '1.01', descrizione: 'Cliente', tipo: 'patrimoniale', natura: 'attivo' },
    { id: 'iva', societa_id: societaId, codice: '2.01', descrizione: 'IVA', tipo: 'patrimoniale', natura: 'passivo' },
    { id: 'ric', societa_id: societaId, codice: '4.01', descrizione: 'Ricavi', tipo: 'economico', natura: 'ricavo' },
  ]
  const mastrini = buildMovimentiPerContoModel(entries, {
    societaId, periodoInizio: '2026-01-01', periodoFine: '2026-12-31',
  })
  assert.equal(mastrini.valid, true, mastrini.blockers.join(', '))
  assert.equal(mastrini.basis, 'prima_nota_canonica')
  assert.ok(mastrini.conti.some(c => c.codice === '1.01' && c.dare === 1220))

  const bilancio = buildSaldiPerContoEsercizioModel(entries, chart, {
    societaId,
    esercizioInizio: '2026-01-01',
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  })
  assert.equal(bilancio.valid, true, bilancio.blockers.join(', '))
  assert.equal(bilancio.basis, 'prima_nota_canonica')
  assert.ok(bilancio.conti.some(c => c.codice === '1.01' && c.saldoDare === 1220))
  assert.equal(bilancio.conti.some(c => c.dare === 235870), false)
})
