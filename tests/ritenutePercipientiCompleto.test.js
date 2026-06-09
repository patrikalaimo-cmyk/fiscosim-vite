import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRegistrazioneDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js'
import { calculateRitenutaProfessionista } from '../src/modules/contabilita/domain/ritenute/calculateRitenutaProfessionista.js'
import { resolveRitenutaScadenza } from '../src/modules/contabilita/domain/ritenute/resolveRitenutaScadenza.js'
import { persistPrimaNotaDraft } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { parseRitenutaDecimalInput, resolveRitenutaNumericInputValue } from '../src/modules/contabilita/components/registrazione/ritenuteUiNumbers.js'

class MockQuery {
  constructor(table, client) {
    this.table = table
    this.client = client
    this.data = null
  }

  insert(data) {
    this.data = data
    this.client.log.push({ action: 'insert', table: this.table, data })
    return this
  }

  select(fields = '*') {
    this.client.log.push({ action: 'select', table: this.table, fields })
    return this
  }

  single() {
    return Promise.resolve({ data: { id: `${this.table}-id`, ...(this.data?.[0] || {}) }, error: null })
  }

  delete() {
    this.client.log.push({ action: 'delete', table: this.table })
    return this
  }

  eq() {
    return this
  }

  then(resolve) {
    const rows = Array.isArray(this.data)
      ? this.data.map((row, index) => ({ id: `${this.table}-${index + 1}`, ...row }))
      : []
    resolve({ data: rows, error: null })
  }
}

class MockDb {
  constructor() {
    this.log = []
  }

  from(table) {
    return new MockQuery(table, this)
  }
}

const percipiente = {
  id: 'percipiente-1',
  societa_id: 'soc-1',
  ragione_sociale: 'Studio Professionista',
  codice_fiscale: 'RSSMRA80A01H501U',
  aliquota_ritenuta: 20,
  cassa_previdenziale: 4,
  causale_prevalente: 'A',
  codice_tributo: '1040',
  codice_cassa: 'INPS',
  soggetto_cu: true,
  attivo: true,
}

const causaleProfessionista = {
  id: 'causale-professionista',
  codice: 'FIXTURE-PROF',
  tipo_causale: 'Doc. IVA normale',
  tipo_documento: 'Fattura passiva',
  operazione_partite: 'Apre',
  op_ritenute: 'Documento',
  codice_registro_iva: '01',
  righe_prima_nota_template: [
    { ordine: 1, ruolo: 'costo', lato: 'dare', formula_importo: 'compenso', conto_id: 'costo-1', conto_codice: '6001', conto_descrizione: 'Compensi professionali', hierarchyType: 'sottoconto' },
    { ordine: 2, ruolo: 'costo', lato: 'dare', formula_importo: 'cassa_previdenziale', conto_id: 'cassa-prev-1', conto_codice: '6002', conto_descrizione: 'Cassa previdenziale', hierarchyType: 'sottoconto' },
    { ordine: 3, ruolo: 'iva', lato: 'dare', formula_importo: 'iva_detraibile', conto_id: 'iva-1', conto_codice: '1201', conto_descrizione: 'IVA a credito', hierarchyType: 'sottoconto' },
    { ordine: 4, ruolo: 'soggetto', lato: 'avere', formula_importo: 'totale_documento', conto_id: 'fornitore-1', conto_codice: '2001', conto_descrizione: 'Studio Professionista', hierarchyType: 'sottoconto' },
  ],
}

function buildInput({ withCassa = true, ritenute = true } = {}) {
  const causale = ritenute ? causaleProfessionista : { ...causaleProfessionista, op_ritenute: 'Ignora' }
  return {
    input: {
      header: {
        societaId: 'soc-1',
        esercizioContabile: '2026',
        dataRegistrazione: '2026-06-09',
        dataDocumento: '2026-06-09',
        numeroDocumento: 'PAR-1',
        causaleContabile: causale,
        clienteFornitoreId: 'fornitore-1',
        clienteFornitoreNome: 'Studio Professionista',
        clienteFornitoreTipo: 'fornitore',
        totaleDocumento: withCassa ? 1268.8 : 1220,
      },
      rows: [],
      documentData: {
        totaleDocumento: withCassa ? 1268.8 : 1220,
        totaleImponibile: withCassa ? 1040 : 1000,
        totaleImposte: withCassa ? 228.8 : 220,
      },
      ivaData: {
        active: true,
        aliquota: 22,
        imponibile: withCassa ? 1040 : 1000,
        imposta: withCassa ? 228.8 : 220,
        causaleIvaId: 'iva-22',
        causaleIva: 'IVA 22%',
      },
      partitarioData: {},
      ritenutaData: {
        percipienteId: percipiente.id,
        percipienteNome: percipiente.ragione_sociale,
        codiceFiscale: percipiente.codice_fiscale,
        causaleCu: 'A',
        codiceTributo: '1040',
        importoCompenso: 1000,
        aliquotaCassa: withCassa ? 4 : 0,
        aliquotaRitenuta: 20,
        dataPagamento: '2026-06-09',
      },
    },
    options: {
      selectedCausale: causale,
      causaleContabile: causale,
      behavior: {
        showDocumentPanel: true,
        showIvaPanel: true,
        showPartitario: true,
        showRitenute: ritenute,
        partitarioMode: 'apertura',
        ritenuteMode: ritenute ? 'documento' : 'nessuno',
      },
      percipienti: [percipiente],
      causaliIva: [{ id: 'iva-22', codice: '22', aliquota: 22, descrizione: 'IVA 22%' }],
      pianoConti: [
        { id: 'fornitore-1', codice: '2001', descrizione: 'Studio Professionista', is_fornitore: true, hierarchyType: 'sottoconto' },
        { id: 'costo-1', codice: '6001', descrizione: 'Compensi professionali', hierarchyType: 'sottoconto' },
        { id: 'cassa-prev-1', codice: '6002', descrizione: 'Cassa previdenziale', hierarchyType: 'sottoconto' },
        { id: 'iva-1', codice: '1201', descrizione: 'IVA a credito', hierarchyType: 'sottoconto' },
      ],
      forceTemplateRows: true,
    },
  }
}

test('calcolo professionista con cassa produce netto, F24 e CU/770 coerenti', () => {
  const totals = calculateRitenutaProfessionista({
    compenso: 1000,
    aliquotaCassa: 4,
    aliquotaRitenuta: 20,
    totaleDocumento: 1268.8,
  })
  assert.deepEqual(totals, {
    compenso: 1000,
    aliquotaCassa: 4,
    importoCassa: 40,
    imponibileIva: 1040,
    quotaNonSoggetta: 0,
    sommeNonSoggette: 0,
    baseRitenuta: 1000,
    aliquotaRitenuta: 20,
    ritenuta: 200,
    totaleDocumento: 1268.8,
    nettoPagabile: 1068.8,
  })
  assert.deepEqual(resolveRitenutaScadenza('2026-06-09'), {
    dataScadenza: '2026-07-16',
    periodoRiferimento: '2026-06',
    annoRiferimento: 2026,
  })

  const cassaManuale = calculateRitenutaProfessionista({
    compenso: 1000,
    aliquotaCassa: 4,
    importoCassa: 50,
    aliquotaRitenuta: 20,
    totaleDocumento: 1278.8,
  })
  assert.equal(cassaManuale.importoCassa, 50)
  assert.equal(cassaManuale.aliquotaCassa, 5)
})

test('draft parcella genera PN quadrata, partitario lordo e dati fiscali completi', () => {
  const { input, options } = buildInput()
  const result = buildRegistrazioneDraft(input, options)

  assert.equal(result.totals.isBalanced, true)
  assert.equal(result.totals.totaleDare, 1268.8)
  assert.equal(result.totals.totaleAvere, 1268.8)
  assert.equal(result.partitarioDraft.importoAperto, 1268.8)
  assert.equal(result.ritenutaDraft.ritenuta, 200)
  assert.equal(result.ritenutaDraft.netto, 1068.8)
  assert.equal(result.ritenutaDraft.dataScadenza, '')
  assert.equal(result.ritenutaDraft.codiceTributo, '1040')
  assert.equal(result.ritenutaDraft.annoRiferimento, null)
  assert.equal(result.ritenutaDraft.percipienteId, percipiente.id)
  assert.equal(result.ritenutaDraft.codiceCassa, 'INPS')
  assert.equal(result.draft.meta.ritenute.appliedToRows, false)
  assert.deepEqual(result.draft.meta.ritenute.blockers, [])

  const subject = result.draft.rows.find((row) => row.ruolo === 'soggetto')
  const withholding = result.draft.rows.find((row) => row.ruolo === 'ritenuta')
  assert.equal(Number(subject.avere), 1268.8)
  assert.equal(withholding, undefined)
})

test('ritenuta senza cassa mantiene netto corretto', () => {
  const { input, options } = buildInput({ withCassa: false })
  const result = buildRegistrazioneDraft(input, options)
  assert.equal(result.ritenutaDraft.importoCassa, 0)
  assert.equal(result.ritenutaDraft.ritenuta, 200)
  assert.equal(result.ritenutaDraft.netto, 1020)
  assert.equal(result.partitarioDraft.importoAperto, 1220)
  assert.equal(result.totals.isBalanced, true)
})

test('default percipiente ricavano compenso e cassa dalla parcella senza input manuali', () => {
  const { input, options } = buildInput()
  input.ritenutaData = {
    percipienteId: percipiente.id,
    percipienteNome: percipiente.ragione_sociale,
  }
  const result = buildRegistrazioneDraft(input, options)

  assert.equal(result.ritenutaDraft.importoCompenso, 1000)
  assert.equal(result.ritenutaDraft.aliquotaCassa, 4)
  assert.equal(result.ritenutaDraft.importoCassa, 40)
  assert.equal(result.ritenutaDraft.aliquotaRitenuta, 20)
  assert.equal(result.ritenutaDraft.ritenuta, 200)
  assert.equal(result.ritenutaDraft.netto, 1068.8)
  assert.equal(result.ritenutaDraft.codiceTributo, '1040')
  assert.equal(result.ritenutaDraft.causaleCu, 'A')
  assert.equal(result.ritenutaDraft.codiceCassa, 'INPS')
  assert.equal(result.ritenutaDraft.escludiDaCu, true)
})

test('UI ritenute scorpora la cassa dall imponibile IVA comprensivo', () => {
  const { input, options } = buildInput()
  input.ritenutaData = {
    percipienteId: percipiente.id,
    percipienteNome: percipiente.ragione_sociale,
    importoCompenso: 1040,
    imponibileReddito: 1040,
    imponibile: 1040,
    aliquotaCassa: 4,
    manualCompensoOverride: false,
  }
  const result = buildRegistrazioneDraft(input, options)
  const supplier = result.draft.rows.find((row) => row.ruolo === 'soggetto')
  const vat = result.draft.rows.find((row) => row.ruolo === 'iva')

  assert.equal(result.ritenutaDraft.importoCompenso, 1000)
  assert.equal(result.ritenutaDraft.importoCassa, 40)
  assert.equal(result.ritenutaDraft.baseRitenuta, 1000)
  assert.equal(result.ritenutaDraft.ritenuta, 200)
  assert.equal(result.ritenutaDraft.netto, 1068.8)
  assert.equal(result.partitarioDraft.importoAperto, 1268.8)
  assert.equal(Number(vat.dare), 228.8)
  assert.equal(Number(supplier.avere), 1268.8)
})

test('input ritenute accetta virgola, punto e conserva gli stati intermedi', () => {
  assert.equal(parseRitenutaDecimalInput('1000,50'), 1000.5)
  assert.equal(parseRitenutaDecimalInput('1000.50'), 1000.5)
  assert.equal(parseRitenutaDecimalInput('4,5'), 4.5)
  assert.equal(parseRitenutaDecimalInput('4.5'), 4.5)
  assert.equal(parseRitenutaDecimalInput('1,'), 1)
  assert.equal(resolveRitenutaNumericInputValue('1,', 1), '1,')
  assert.equal(resolveRitenutaNumericInputValue('4,', 4), '4,')
})

test('compenso ritenuta deriva dalla riga professionale e non dalla riga IVA', () => {
  const { input, options } = buildInput()
  input.ritenutaData = {
    percipienteId: percipiente.id,
    percipienteNome: percipiente.ragione_sociale,
  }
  input.rows = [
    { ruolo: 'costo', formula_importo: 'compenso', conto_id: 'costo-1', conto_descrizione: 'Compensi professionali', dare: 1000, avere: 0 },
    { ruolo: 'costo', formula_importo: 'cassa_previdenziale', conto_id: 'cassa-prev-1', conto_descrizione: 'Cassa previdenziale', dare: 40, avere: 0 },
    { ruolo: 'iva', formula_importo: 'iva_detraibile', conto_id: 'iva-1', conto_descrizione: 'IVA a credito', dare: 228.8, avere: 0 },
    { ruolo: 'soggetto', formula_importo: 'totale_documento', conto_id: 'fornitore-1', conto_descrizione: 'Studio Professionista', dare: 0, avere: 1268.8 },
  ]
  const result = buildRegistrazioneDraft(input, options)

  assert.equal(result.ritenutaDraft.importoCompenso, 1000)
  assert.equal(result.ritenutaDraft.compensoSource, 'riga_formula_compenso')
  assert.equal(result.ritenutaDraft.importoCassa, 40)
  assert.equal(result.ritenutaDraft.ritenuta, 200)
  assert.notEqual(result.ritenutaDraft.importoCompenso, 228.8)
})

test('ritenuta blocca il documento quando sono disponibili solo IVA e totale documento', () => {
  const { input, options } = buildInput()
  input.ritenutaData = {
    percipienteId: percipiente.id,
    percipienteNome: percipiente.ragione_sociale,
  }
  input.documentData = { totaleDocumento: 1268.8, totaleImposte: 228.8 }
  input.ivaData = { active: true, imposta: 228.8, causaleIvaId: 'iva-22', causaleIva: 'IVA 22%' }
  input.rows = [
    { ruolo: 'iva', formula_importo: 'iva_detraibile', conto_id: 'iva-1', conto_descrizione: 'IVA a credito', dare: 228.8, avere: 0 },
  ]
  options.forceTemplateRows = false
  options.selectedCausale = { ...options.selectedCausale, righe_prima_nota_template: [] }
  options.causaleContabile = options.selectedCausale
  const result = buildRegistrazioneDraft(input, options)

  assert.equal(result.ritenutaDraft.importoCompenso, 0)
  assert.equal(result.ritenutaDraft.compensoResolved, false)
  assert.ok(result.ritenutaDraft.blockers.some((item) => item.includes('compenso professionale non identificabile')))
})

test('causale senza gestione ritenute ignora dati stale', () => {
  const { input, options } = buildInput({ ritenute: false })
  const result = buildRegistrazioneDraft(input, options)
  assert.equal(result.ritenutaDraft.active, false)
  assert.equal(result.draft.meta.ritenute.appliedToRows, false)
  assert.equal(result.partitarioDraft.importoAperto, input.documentData.totaleDocumento)
})

test('causale con gestione ritenute blocca dati minimi mancanti', () => {
  const { input, options } = buildInput()
  input.ritenutaData = { importoCompenso: 1000, aliquotaRitenuta: 20 }
  options.percipienti = []
  const result = buildRegistrazioneDraft(input, options)
  assert.equal(result.validation.status, 'blocked')
  assert.ok(result.validation.blockers.some((item) => item.includes('percipiente')))
})

test('persistenza collega ritenuta a prima nota, partita e percipiente', async () => {
  const { input, options } = buildInput()
  const result = buildRegistrazioneDraft(input, options)
  result.draft.rows = result.draft.rows.map((row) => row.ruolo === 'soggetto'
    ? { ...row, hierarchyType: 'sottoconto', conto_resolved_finale: true }
    : row)
  result.draft.righePayload = result.draft.rows
  const db = new MockDb()
  const persisted = await persistPrimaNotaDraft({ db, draft: result.draft })
  assert.equal(persisted.error, null)

  const insert = db.log.find((entry) => entry.action === 'insert' && entry.table === 'ritenute_dacconto')
  assert.ok(insert)
  const row = insert.data[0]
  assert.equal(row.prima_nota_id, 'prima_nota-id')
  assert.equal(row.partitario_id, 'partitario-1')
  assert.equal(row.percipiente_id, percipiente.id)
  assert.equal(row.codice_tributo, '1040')
  assert.equal(row.data_scadenza, null)
  assert.equal(row.importo_ritenuta, 200)
  assert.equal(row.imponibile_ritenuta, 1000)
  assert.equal(row.stato, 'predisposta')
  assert.equal(row.data_pagamento, null)
  assert.equal(row.inclusa_cu, false)
})
