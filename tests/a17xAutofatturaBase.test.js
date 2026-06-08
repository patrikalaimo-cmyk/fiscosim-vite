import test from 'node:test'
import assert from 'node:assert/strict'

import { aggregateRegistriIvaRows } from '../src/modules/contabilita/application/liquidazioneIvaClient.js'
import { buildRegistrazioneDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js'
import { resolveRegistrazioneCausaleBehavior } from '../src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js'

const causaleA17X = {
  codice: 'A17X',
  descrizione: 'Autofattura estera servizi',
  tipo_causale: 'Autofattura',
  operazione_partite: 'Apre',
  tipo_documento: 'Autofattura',
}

const templateRowsA17X = [
  {
    ordine: 1,
    ruolo: 'soggetto',
    lato: 'avere',
    formula_importo: 'imponibile',
    descrizione_riga: 'Fornitore',
    conto_id: 'sup-1',
    conto_codice: '2 03 08 0001',
    conto_descrizione: 'Debiti v/fornitori',
    hierarchyType: 'sottoconto',
    attiva: true,
  },
  {
    ordine: 2,
    ruolo: 'costo',
    lato: 'dare',
    formula_importo: 'imponibile',
    descrizione_riga: 'Costo/servizio',
    conto_id: 'costo-1',
    conto_codice: '6 01 03 0001',
    conto_descrizione: 'Servizi da autofattura',
    hierarchyType: 'sottoconto',
    attiva: true,
  },
  {
    ordine: 3,
    ruolo: 'iva',
    lato: 'dare',
    formula_importo: 'iva_detraibile',
    descrizione_riga: 'IVA NS.CREDITO',
    conto_id: 'iva-acq-1',
    conto_codice: '1 02 40 0001',
    conto_descrizione: 'IVA NS.CREDITO',
    hierarchyType: 'sottoconto',
    attiva: true,
  },
  {
    ordine: 4,
    ruolo: 'iva',
    lato: 'avere',
    formula_importo: 'iva_detraibile',
    descrizione_riga: 'IVA NS.DEBITO',
    conto_id: 'iva-ven-1',
    conto_codice: '2 03 16 0001',
    conto_descrizione: 'IVA NS.DEBITO',
    hierarchyType: 'sottoconto',
    attiva: true,
  },
]

test('A17X autofattura base apre il partitario solo per l imponibile', () => {
  const behavior = resolveRegistrazioneCausaleBehavior(causaleA17X)

  assert.equal(behavior.showDocumentPanel, true)
  assert.equal(behavior.showIvaPanel, true)
  assert.equal(behavior.showPartitario, true)
  assert.equal(behavior.ivaMode, 'autofattura')
  assert.equal(behavior.documentMode, 'autofattura')

  const result = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        societaId: 'soc-1',
        esercizioContabile: '2026',
        dataRegistrazione: '2026-06-08',
        dataDocumento: '2026-06-08',
        numeroDocumento: 'A-17X-1',
        causaleContabile: causaleA17X,
        descrizioneGenerale: 'Autofattura servizi base',
        soggetto: 'Fornitore estero demo',
        clienteFornitoreId: 'sup-1',
        clienteFornitoreCodice: '2 03 08 0001',
        clienteFornitoreNome: 'Fornitore estero demo',
        clienteFornitoreTipo: 'fornitore',
      },
      documentData: {
        totaleDocumento: 122,
        totaleImponibile: 100,
        totaleImposte: 22,
        imponibile: 100,
      },
      rows: [],
      ivaData: {
        rows: [
          {
            id: 'iva-acquisti',
            riga: 1,
            causaleIvaId: 'iva-acq',
            causaleIvaCodice: 'A17-AQ',
            causaleIvaDescrizione: 'Autofattura acquisti servizi',
            causaleIvaLabel: 'A17-AQ - Autofattura acquisti servizi',
            imponibile: 100,
            ivaDetratta: 22,
            ivaIndetraibile: 0,
            totale: 122,
            aliquota: 22,
            natura: '',
            competenzaIva: '2026-06-08',
            dataOperazione: '2026-06-08',
            registroIva: '01',
            segnoRegistro: '+',
            protocolloProvvisorio: '1',
            protocolloDefinitivo: '3',
            stato: 'predisposto',
            attiva: true,
          },
        ],
      },
    },
    {
      forceTemplateRows: true,
      behavior,
      causaleContabile: causaleA17X,
      selectedCausale: {
        ...causaleA17X,
        righe_prima_nota_template: templateRowsA17X,
      },
      pianoConti: [
        { id: 'sup-1', codice: '2 03 08 0001', descrizione: 'Debiti v/fornitori', livello: 3, tipo: 'FINALE' },
        { id: 'costo-1', codice: '6 01 03 0001', descrizione: 'Servizi da autofattura', livello: 3, tipo: 'FINALE' },
        { id: 'iva-acq-1', codice: '1 02 40 0001', descrizione: 'IVA NS.CREDITO', livello: 3, tipo: 'FINALE' },
        { id: 'iva-ven-1', codice: '2 03 16 0001', descrizione: 'IVA NS.DEBITO', livello: 3, tipo: 'FINALE' },
      ],
    },
  )

  assert.equal(result.validation.blockers.length, 0)
  assert.notEqual(result.validation.status, 'blocked')
  assert.equal(result.draft.rows.length, 4)
  assert.equal(result.draft.rows[0].avere, '100.00')
  assert.equal(result.draft.rows[1].dare, '100.00')
  assert.equal(result.draft.rows[2].dare, '22.00')
  assert.equal(result.draft.rows[3].avere, '22.00')
  assert.equal(result.partitarioDraft.importoAperto, 100)
  assert.equal(result.partitarioDraft.rows[0].importoAperto, 100)

  const liquidazione = aggregateRegistriIvaRows([
    { tipo: 'acquisto', iva_detraibile: 22, esigibilita: 'rilascio' },
    { tipo: 'vendita', iva: 22, esigibilita: 'rilascio' },
  ])

  assert.equal(liquidazione.iva_debito_registrata, 22)
  assert.equal(liquidazione.iva_credito, 22)
  assert.equal(liquidazione.saldo, 0)
})
