import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import {
  buildFascicoloClientePeriodo,
  fascicoloHtmlToBytes,
} from '../src/modules/contabilita/application/stampe/buildFascicoloClientePeriodo.js'
import { hashStampaContenuto } from '../src/modules/contabilita/application/stampe/hashStampaContenuto.js'
import { isStampaOperativa } from '../src/modules/contabilita/application/stampe/buildPartitariStampaModel.js'
import { buildLibroGiornaleModel } from '../src/modules/contabilita/application/stampe/buildLibroGiornaleModel.js'
import { buildPartitariStampaModel } from '../src/modules/contabilita/application/stampe/buildPartitariStampaModel.js'
import { buildMovimentiPerContoModel } from '../src/modules/contabilita/application/stampe/buildMovimentiPerContoModel.js'

const SOCIETA = '72000000-0000-4000-8000-000000000001'

test('isOperativo include fascicolo', () => {
  assert.equal(isStampaOperativa('fascicolo'), true)
})

test('fascicolo cliente produces one interrogabile file from canonical models', async () => {
  const pn = [{
    id: '72000000-0000-4000-8000-0000000000a1',
    societa_id: SOCIETA,
    stato: 'confermata',
    numero_registrazione: 1,
    data_registrazione: '2026-04-12',
    numero_documento: 'FA-1',
    descrizione: 'Fattura attiva test',
    totale_dare: 1220,
    totale_avere: 1220,
    righe: [
      { id: 'r1', riga_numero: 1, conto_id: 'c1', conto_codice: '1.01', conto_descrizione: 'Cliente', importo_dare: 1220, importo_avere: 0 },
      { id: 'r2', riga_numero: 2, conto_id: 'c2', conto_codice: '4.01', conto_descrizione: 'Ricavi', importo_dare: 0, importo_avere: 1000 },
      { id: 'r3', riga_numero: 3, conto_id: 'c3', conto_codice: '2.01', conto_descrizione: 'IVA', importo_dare: 0, importo_avere: 220 },
    ],
  }]
  const giornale = buildLibroGiornaleModel(pn)
  const partitari = buildPartitariStampaModel([{
    id: '72000000-0000-4000-8000-0000000000b1',
    societa_id: SOCIETA,
    tipo: 'cliente',
    stato: 'aperta',
    importo_originale: 1220,
    importo_pagato: 0,
    importo_residuo: 1220,
    numero_documento: 'FA-1',
    data_documento: '2026-04-12',
    controparte_nome: 'Cliente Test',
    prima_nota_id: pn[0].id,
  }], { societaId: SOCIETA, periodoInizio: '2026-01-01', periodoFine: '2026-12-31' })
  const mastrini = buildMovimentiPerContoModel(pn, {
    societaId: SOCIETA,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  })

  const fascicolo = buildFascicoloClientePeriodo({
    societa: { id: SOCIETA, denominazione: 'SG E2E A', partita_iva: '00000000000' },
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
    giornaleModel: giornale,
    partitariModel: partitari,
    mastriniModel: mastrini,
    bilancioModel: null,
  })

  assert.equal(fascicolo.ok, true, fascicolo.blockers?.join(','))
  assert.equal(fascicolo.definitive, false)
  assert.equal(fascicolo.kind, 'fascicolo_cliente_periodo')
  assert.match(fascicolo.fileName, /^fascicolo_.*\.html$/)
  assert.ok(fascicolo.html.includes('Fascicolo cliente'))
  assert.ok(fascicolo.html.includes('Libro Giornale'))
  assert.ok(!fascicolo.html.includes('235870'))
  assert.ok(fascicolo.sections.some((s) => s.id === 'giornale' && s.included))

  const bytes = fascicoloHtmlToBytes(fascicolo.html)
  assert.ok(bytes.byteLength > 100)
  const digest = await hashStampaContenuto({
    fileBytes: bytes,
    mimeType: 'text/html',
    societaId: SOCIETA,
    tipoStampa: 'fascicolo',
    annoFiscale: '2026',
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  }, { subtle: webcrypto.subtle })
  assert.match(digest, /^[0-9a-f]{64}$/)
})

test('fascicolo without sections is blocked', () => {
  const fascicolo = buildFascicoloClientePeriodo({
    societa: { id: SOCIETA, denominazione: 'X' },
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  })
  assert.equal(fascicolo.ok, false)
  assert.ok(fascicolo.blockers.includes('fascicolo_senza_sezioni_operative'))
})
