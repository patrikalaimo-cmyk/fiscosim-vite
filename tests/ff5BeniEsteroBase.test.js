import test from 'node:test'
import assert from 'node:assert/strict'

import { aggregateRegistriIvaRows } from '../src/modules/contabilita/application/liquidazioneIvaClient.js'
import { buildRegistrazioneDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js'
import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { buildCausaleContabilePolicy } from '../src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js'
import { resolveRegistrazioneCausaleBehavior } from '../src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js'

const causaleFF5 = {
  codice: 'FF5',
  descrizione: 'Acquisto beni estero',
  tipo_causale: 'Autofattura',
  operazione_partite: 'Apre',
  tipo_documento: 'Autofattura',
  registro_iva: 'acquisti',
}

const causaleCEE = {
  codice: 'ABC',
  descrizione: 'Fattura fornitore CEE',
  tipo_causale: 'Doc. IVA Acq. CEE',
  operazione_partite: 'Apre',
  tipo_documento: 'Doc. IVA Acq. CEE',
  registro_iva: 'acquisti',
  registro_iva_cee: '02',
  protocollo_iva_cee: 3,
  segno_iva_registro_cee: 'Somma',
  codice_aliquota_iva: 'B0IW',
}

const templateRowsFF5 = [
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
    descrizione_riga: 'Acquisto beni estero',
    conto_id: 'costo-1',
    conto_codice: '6 01 01 0001',
    conto_descrizione: 'Acquisto beni estero',
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

const templateRowsCEE = [
  {
    ordine: 1,
    ruolo: 'soggetto',
    lato: 'avere',
    formula_importo: 'totale_documento',
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
    descrizione_riga: 'Acquisto beni CEE',
    conto_id: 'costo-1',
    conto_codice: '6 01 01 0001',
    conto_descrizione: 'Acquisto beni CEE',
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

class MockDbQuery {
  constructor(table, client) {
    this.table = table
    this.client = client
    this.insertedData = null
  }

  insert(data) {
    this.insertedData = data
    this.client.log.push({ action: 'insert', table: this.table, data })
    return this
  }

  select() {
    return this
  }

  single() {
    return Promise.resolve({ data: { id: `${this.table}-new-id` }, error: null })
  }

  then(resolve) {
    resolve({ data: [{ id: `${this.table}-row-1` }], error: null })
  }
}

class MockDbClient {
  constructor() {
    this.log = []
  }

  from(table) {
    return new MockDbQuery(table, this)
  }
}

test('FF5 beni estero base apre il partitario solo per l imponibile', () => {
  const behavior = resolveRegistrazioneCausaleBehavior(causaleFF5)

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
        numeroDocumento: 'FF5-1',
        causaleContabile: causaleFF5,
        descrizioneGenerale: 'Acquisto beni estero base',
        soggetto: 'Fornitore estero demo',
        clienteFornitoreId: 'sup-1',
        clienteFornitoreCodice: '2 03 08 0001',
        clienteFornitoreNome: 'Fornitore estero demo',
        clienteFornitoreTipo: 'fornitore',
      },
      documentData: {
        totaleDocumento: 1500,
        totaleImponibile: 1229.51,
        totaleImposte: 270.49,
        imponibile: 1229.51,
      },
      rows: [],
      ivaData: {
        rows: [
          {
            id: 'iva-acquisti',
            riga: 1,
            causaleIvaId: 'iva-b0iw',
            causaleIvaCodice: 'B0IW',
            causaleIvaDescrizione: 'Acquisti beni estero',
            causaleIvaLabel: 'B0IW - Acquisti beni estero',
            imponibile: 1229.51,
            ivaDetratta: 270.49,
            ivaIndetraibile: 0,
            totale: 1500,
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
      causaleContabile: causaleFF5,
      selectedCausale: {
        ...causaleFF5,
        righe_prima_nota_template: templateRowsFF5,
      },
      pianoConti: [
        { id: 'sup-1', codice: '2 03 08 0001', descrizione: 'Debiti v/fornitori', livello: 3, tipo: 'FINALE' },
        { id: 'costo-1', codice: '6 01 01 0001', descrizione: 'Acquisto beni estero', livello: 3, tipo: 'FINALE' },
        { id: 'iva-acq-1', codice: '1 02 40 0001', descrizione: 'IVA NS.CREDITO', livello: 3, tipo: 'FINALE' },
        { id: 'iva-ven-1', codice: '2 03 16 0001', descrizione: 'IVA NS.DEBITO', livello: 3, tipo: 'FINALE' },
      ],
    },
  )

  assert.equal(result.validation.blockers.length, 0)
  assert.notEqual(result.validation.status, 'blocked')
  assert.equal(result.validation.totals.isBalanced, true)
  assert.equal(result.draft.rows.length, 4)
  assert.equal(result.draft.rows[0].avere, '1229.51')
  assert.equal(result.draft.rows[1].dare, '1229.51')
  assert.equal(result.draft.rows[2].dare, '270.49')
  assert.equal(result.draft.rows[3].avere, '270.49')
  assert.equal(result.partitarioDraft.importoAperto, 1229.51)
  assert.equal(result.partitarioDraft.rows[0].importoAperto, 1229.51)
  assert.equal(result.ivaDraft.causaleIvaCodice, 'B0IW')
  assert.equal(result.ivaDraft.rows[0].causaleIvaCodice, 'B0IW')

  const liquidazione = aggregateRegistriIvaRows([
    { tipo: 'acquisto', iva_detraibile: 270.49, esigibilita: 'rilascio' },
    { tipo: 'vendita', iva: 270.49, esigibilita: 'rilascio' },
  ])

  assert.equal(liquidazione.iva_debito_registrata, 270.49)
  assert.equal(liquidazione.iva_credito, 270.49)
  assert.equal(liquidazione.saldo, 0)
})

test('FF5 beni estero base persiste due righe registri IVA con acquisto e vendita/autofattura', async () => {
  const db = new MockDbClient()
  const behavior = resolveRegistrazioneCausaleBehavior(causaleFF5)

  const draft = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        societaId: 'soc-1',
        esercizioContabile: '2026',
        dataRegistrazione: '2026-06-08',
        dataDocumento: '2026-06-08',
        numeroDocumento: 'FF5-1',
        causaleContabile: causaleFF5,
        descrizioneGenerale: 'Acquisto beni estero base',
        soggetto: 'Fornitore estero demo',
        clienteFornitoreId: 'sup-1',
        clienteFornitoreCodice: '2 03 08 0001',
        clienteFornitoreNome: 'Fornitore estero demo',
        clienteFornitoreTipo: 'fornitore',
      },
      documentData: {
        totaleDocumento: 1500,
        totaleImponibile: 1229.51,
        totaleImposte: 270.49,
        imponibile: 1229.51,
      },
      rows: [],
      ivaData: {
        rows: [
          {
            id: 'iva-acquisti',
            riga: 1,
            causaleIvaId: 'iva-b0iw',
            causaleIvaCodice: 'B0IW',
            causaleIvaDescrizione: 'Acquisti beni estero',
            causaleIvaLabel: 'B0IW - Acquisti beni estero',
            imponibile: 1229.51,
            ivaDetratta: 270.49,
            ivaIndetraibile: 0,
            totale: 1500,
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
      causaleContabile: causaleFF5,
      selectedCausale: {
        ...causaleFF5,
        righe_prima_nota_template: templateRowsFF5,
      },
      pianoConti: [
        { id: 'sup-1', codice: '2 03 08 0001', descrizione: 'Debiti v/fornitori', livello: 3, tipo: 'FINALE' },
        { id: 'costo-1', codice: '6 01 01 0001', descrizione: 'Acquisto beni estero', livello: 3, tipo: 'FINALE' },
        { id: 'iva-acq-1', codice: '1 02 40 0001', descrizione: 'IVA NS.CREDITO', livello: 3, tipo: 'FINALE' },
        { id: 'iva-ven-1', codice: '2 03 16 0001', descrizione: 'IVA NS.DEBITO', livello: 3, tipo: 'FINALE' },
      ],
    },
  )

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find((entry) => entry.action === 'insert' && entry.table === 'registri_iva')
  assert.ok(ivaInsert, 'Deve esserci un inserimento su registri_iva')
  const ivaRows = Array.isArray(ivaInsert.data) ? ivaInsert.data : [ivaInsert.data]
  assert.equal(ivaRows.length, 2)
  assert.equal(ivaRows[0].tipo, 'acquisto')
  assert.equal(ivaRows[1].tipo, 'vendita')
  assert.equal(ivaRows[0].id, undefined)
  assert.equal(ivaRows[1].id, undefined)
  assert.equal(ivaRows[0].ui_id, undefined)
  assert.equal(ivaRows[1].ui_id, undefined)
  assert.equal(ivaRows[0].causale_iva_id, 'iva-acquisti')
  assert.equal(ivaRows[1].causale_iva_id, 'iva-acquisti')
  assert.equal(ivaRows[0].imponibile, 1229.51)
  assert.equal(ivaRows[1].imponibile, 1229.51)
  assert.equal(ivaRows[0].iva, 270.49)
  assert.equal(ivaRows[1].iva, 270.49)
})

test('causale CEE configurata porta fornitore e partitario sull imponibile senza hardcode sul codice', () => {
  const behavior = resolveRegistrazioneCausaleBehavior(causaleCEE)
  const policy = buildCausaleContabilePolicy(causaleCEE)

  assert.equal(behavior.showDocumentPanel, true)
  assert.equal(behavior.showIvaPanel, true)
  assert.equal(behavior.showPartitario, true)
  assert.equal(policy.isCee, true)
  assert.equal(behavior.ivaMode, 'cee')
  assert.equal(behavior.documentMode, 'documento_iva_cee')

  const result = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        societaId: 'soc-1',
        esercizioContabile: '2026',
        dataRegistrazione: '2026-06-08',
        dataDocumento: '2026-06-08',
        numeroDocumento: 'CEE-1',
        causaleContabile: causaleCEE,
        descrizioneGenerale: 'Acquisto beni CEE base',
        soggetto: 'Fornitore estero demo',
        clienteFornitoreId: 'sup-1',
        clienteFornitoreCodice: '2 03 08 0001',
        clienteFornitoreNome: 'Fornitore estero demo',
        clienteFornitoreTipo: 'fornitore',
      },
      documentData: {
        totaleDocumento: 1500,
        totaleImponibile: 1229.51,
        totaleImposte: 270.49,
        imponibile: 1229.51,
      },
      rows: [],
      ivaData: {
        rows: [
          {
            id: 'iva-acquisti',
            riga: 1,
            causaleIvaId: 'iva-b0iw',
            causaleIvaCodice: 'B0IW',
            causaleIvaDescrizione: 'Acquisti beni estero',
            causaleIvaLabel: 'B0IW - Acquisti beni estero',
            imponibile: 1229.51,
            ivaDetratta: 270.49,
            ivaIndetraibile: 0,
            totale: 1500,
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
      causaleContabile: causaleCEE,
      selectedCausale: {
        ...causaleCEE,
        righe_prima_nota_template: templateRowsCEE,
      },
      pianoConti: [
        { id: 'sup-1', codice: '2 03 08 0001', descrizione: 'Debiti v/fornitori', livello: 3, tipo: 'FINALE' },
        { id: 'costo-1', codice: '6 01 01 0001', descrizione: 'Acquisto beni CEE', livello: 3, tipo: 'FINALE' },
        { id: 'iva-acq-1', codice: '1 02 40 0001', descrizione: 'IVA NS.CREDITO', livello: 3, tipo: 'FINALE' },
        { id: 'iva-ven-1', codice: '2 03 16 0001', descrizione: 'IVA NS.DEBITO', livello: 3, tipo: 'FINALE' },
      ],
    },
  )

  assert.equal(result.validation.blockers.length, 0)
  assert.notEqual(result.validation.status, 'blocked')
  assert.equal(result.validation.totals.isBalanced, true)
  assert.equal(result.draft.rows[0].avere, '1229.51')
  assert.equal(result.draft.rows[1].dare, '1229.51')
  assert.equal(result.draft.rows[2].dare, '270.49')
  assert.equal(result.draft.rows[3].avere, '270.49')
  assert.equal(result.partitarioDraft.importoAperto, 1229.51)
  assert.equal(result.partitarioDraft.rows[0].importoAperto, 1229.51)
  assert.equal(result.ivaDraft.causaleIvaCodice, 'B0IW')
  assert.equal(result.ivaDraft.rows[0].causaleIvaCodice, 'B0IW')
})

test('causale CEE persiste due righe registri IVA con acquisto e vendita equivalenti', async () => {
  const db = new MockDbClient()
  const behavior = resolveRegistrazioneCausaleBehavior(causaleCEE)

  const draft = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        societaId: 'soc-1',
        esercizioContabile: '2026',
        dataRegistrazione: '2026-06-08',
        dataDocumento: '2026-06-08',
        numeroDocumento: 'CEE-1',
        causaleContabile: causaleCEE,
        descrizioneGenerale: 'Acquisto beni CEE base',
        soggetto: 'Fornitore estero demo',
        clienteFornitoreId: 'sup-1',
        clienteFornitoreCodice: '2 03 08 0001',
        clienteFornitoreNome: 'Fornitore estero demo',
        clienteFornitoreTipo: 'fornitore',
      },
      documentData: {
        totaleDocumento: 1500,
        totaleImponibile: 1229.51,
        totaleImposte: 270.49,
        imponibile: 1229.51,
      },
      rows: [],
      ivaData: {
        rows: [
          {
            id: 'iva-acquisti',
            riga: 1,
            causaleIvaId: 'iva-b0iw',
            causaleIvaCodice: 'B0IW',
            causaleIvaDescrizione: 'Acquisti beni estero',
            causaleIvaLabel: 'B0IW - Acquisti beni estero',
            imponibile: 1229.51,
            ivaDetratta: 270.49,
            ivaIndetraibile: 0,
            totale: 1500,
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
      causaleContabile: causaleCEE,
      selectedCausale: {
        ...causaleCEE,
        righe_prima_nota_template: templateRowsCEE,
      },
      pianoConti: [
        { id: 'sup-1', codice: '2 03 08 0001', descrizione: 'Debiti v/fornitori', livello: 3, tipo: 'FINALE' },
        { id: 'costo-1', codice: '6 01 01 0001', descrizione: 'Acquisto beni CEE', livello: 3, tipo: 'FINALE' },
        { id: 'iva-acq-1', codice: '1 02 40 0001', descrizione: 'IVA NS.CREDITO', livello: 3, tipo: 'FINALE' },
        { id: 'iva-ven-1', codice: '2 03 16 0001', descrizione: 'IVA NS.DEBITO', livello: 3, tipo: 'FINALE' },
      ],
    },
  )

  const result = await persistPrimaNotaDraft({ db, draft })
  assert.equal(result.error, null)

  const ivaInsert = db.log.find((entry) => entry.action === 'insert' && entry.table === 'registri_iva')
  assert.ok(ivaInsert, 'Deve esserci un inserimento su registri_iva')
  const ivaRows = Array.isArray(ivaInsert.data) ? ivaInsert.data : [ivaInsert.data]
  assert.equal(ivaRows.length, 2)
  assert.equal(ivaRows[0].tipo, 'acquisto')
  assert.equal(ivaRows[1].tipo, 'vendita')
  assert.equal(ivaRows[0].id, undefined)
  assert.equal(ivaRows[1].id, undefined)
  assert.equal(ivaRows[0].ui_id, undefined)
  assert.equal(ivaRows[1].ui_id, undefined)
  assert.equal(ivaRows[0].causale_iva_id, 'iva-acquisti')
  assert.equal(ivaRows[1].causale_iva_id, 'iva-acquisti')
  assert.equal(ivaRows[0].imponibile, 1229.51)
  assert.equal(ivaRows[1].imponibile, 1229.51)
  assert.equal(ivaRows[0].iva, 270.49)
  assert.equal(ivaRows[1].iva, 270.49)
  assert.equal(aggregateRegistriIvaRows(ivaRows).saldo, 0)
})
