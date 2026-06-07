import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRegistrazioneCausaleBehavior } from '../src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js'
import { resolveRegistrazioneControparteListByHeader } from '../src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneControparti.js'
import { resolveRegistrazioneHeaderCounterpartyDraft } from '../src/modules/contabilita/application/registrazioneOperations/normalizeRegistrazioneInput.js'
import { buildRegistrazionePartitarioDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazionePartitarioDraft.js'
import { buildRegistrazioneDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js'
import { buildPersistenceValidation, mapPrimaNotaPayloadForDb, mapPrimaNotaRigaForDb, persistPrimaNotaDraft, resolveDraftBundle } from '../src/modules/contabilita/application/persistPrimaNotaDraft.js'
import { buildCausaleContabilePolicy } from '../src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js'
import { buildIvaPerCassaGirocontoRows } from '../src/modules/contabilita/application/registrazioneOperations/buildIvaPerCassaGirocontoRows.js'

// Simple DB mock client supporting filters
class MockDbQuery {
  constructor(table, client) {
    this.table = table
    this.client = client
    this.filters = {}
    this.insertedData = null
  }

  insert(data) {
    this.insertedData = data
    this.client.log.push({ action: 'insert', table: this.table, data })
    return this
  }

  delete() {
    this.client.log.push({ action: 'delete', table: this.table })
    return this
  }

  eq(field, value) {
    this.filters[field] = value
    this.client.log.push({ action: 'eq', table: this.table, field, value })
    return this
  }

  select(fields = '*') {
    this.client.log.push({ action: 'select', table: this.table, fields })
    return this
  }

  maybeSingle() {
    this.client.log.push({ action: 'maybeSingle', table: this.table })
    return Promise.resolve(this.client.resolveMaybeSingle(this.table, this.filters))
  }

  single() {
    this.client.log.push({ action: 'single', table: this.table })
    return Promise.resolve(this.client.resolveSingle(this.table, this.insertedData))
  }

  update(data) {
    this.updateData = data
    this.client.log.push({ action: 'update', table: this.table, data })
    return this
  }

  or(filter) {
    this.client.log.push({ action: 'or', table: this.table, filter })
    return this
  }

  is(field, value) {
    this.filters[field] = value
    this.client.log.push({ action: 'is', table: this.table, field, value })
    return this
  }

  in(field, values) {
    this.client.log.push({ action: 'in', table: this.table, field, values })
    return this
  }

  then(resolve, reject) {
    const isDelete = this.client.log.some(l => l.table === this.table && l.action === 'delete')
    const isUpdate = this.client.log.some(l => l.table === this.table && l.action === 'update')
    if (isDelete || isUpdate) {
      resolve({ data: [], error: null })
      return
    }
    Promise.resolve(this.client.resolveMultiple(this.table, this.filters))
      .then(resolve, reject)
  }
}

class MockDbClient {
  constructor() {
    this.log = []
    this.insertBehaviors = {}
    this.partitarioRows = []
    this.registriIvaRows = []
  }

  from(table) {
    return new MockDbQuery(table, this)
  }

  resolveSingle(table, insertedData) {
    return { data: { id: `${table}-new-id` }, error: null }
  }

  resolveMaybeSingle(table, filters) {
    if (table === 'partitario') {
      const match = this.partitarioRows.find(r => String(r.id) === String(filters.id))
      return { data: match || null, error: null }
    }
    return { data: null, error: null }
  }

  resolveMultiple(table, filters) {
    if (table === 'registri_iva') {
      let filtered = this.registriIvaRows
      if (filters.prima_nota_id) {
        filtered = filtered.filter(r => r.prima_nota_id === filters.prima_nota_id)
      }
      if (filters.esigibilita) {
        filtered = filtered.filter(r => r.esigibilita === filters.esigibilita)
      }
      if (filters.origin_registro_iva_id) {
        filtered = filtered.filter(r => r.origin_registro_iva_id === filters.origin_registro_iva_id)
      }
      return { data: filtered, error: null }
    }
    return { data: [], error: null }
  }
}

const pianoConti = [
  { id: 'conto-fornitore-1', codice: '501001', descrizione: 'Fornitore Uno', is_fornitore: true },
  { id: 'conto-professionista-1', codice: '501002', descrizione: 'Professionista Uno', is_professionista: true },
  { id: 'conto-cliente-1', codice: '101001', descrizione: 'Cliente Uno', is_cliente: true },
  { id: 'conto-banca', codice: '100001', descrizione: 'Banca' },
  { id: 'iva-ordinaria', codice: '220001', descrizione: 'IVA ordinaria' },
  { id: 'iva-differita', codice: '220002', descrizione: 'IVA differita' },
]

function buildGiroconto({
  direction = 'passivo',
  release = 140,
  cashVat = true,
  causaleCode = 'CODICE-ARBITRARIO',
  includeOrdinaryAccount = true,
  includeDeferredAccount = true,
} = {}) {
  return buildIvaPerCassaGirocontoRows({
    rows: direction === 'passivo'
      ? [
          { id: 'fornitore', conto_id: 'conto-fornitore-1', dare: '1540.00', avere: '' },
          { id: 'banca', conto_id: 'conto-banca', dare: '', avere: '1540.00' },
        ]
      : [
          { id: 'banca', conto_id: 'conto-banca', dare: '1540.00', avere: '' },
          { id: 'cliente', conto_id: 'conto-cliente-1', dare: '', avere: '1540.00' },
        ],
    causale: {
      codice: causaleCode,
      tipo_causale: cashVat ? 'pagincivaesigdiff' : 'pagamento',
      operazione_partite: 'chiude',
      iva_per_cassa: cashVat,
      conto_iva_esig_differita: includeDeferredAccount ? 'iva-differita' : '',
    },
    behavior: { showIvaPerCassaPreview: cashVat },
    header: { clienteFornitoreTipo: direction === 'passivo' ? 'fornitore' : 'cliente' },
    partitarioPreview: {
      active: cashVat,
      items: cashVat ? [{
        partitaId: 'partita-1',
        iva_per_cassa: true,
        soggettoTipo: direction === 'passivo' ? 'fornitore' : 'cliente',
        ivaDaRilasciareOra: release,
        righeIvaOriginarie: [{
          tipo: direction === 'passivo' ? 'acquisto' : 'vendita',
          causaleIvaId: 'causale-iva-1',
          ivaDaRilasciareOra: release,
        }],
      }] : [],
    },
    causaliIva: [{
      id: 'causale-iva-1',
      conto_iva_id: includeOrdinaryAccount ? 'iva-ordinaria' : '',
    }],
    pianoConti,
  })
}

test('1. Pagamento/incasso IVA per cassa non mostra tab Movimenti IVA ed abilita flusso Partitario', () => {
  const causalePFPC = {
    codice: 'PFPC',
    descrizione: 'Pagamento IVA per cassa',
    tipo_causale: 'pagincivaesigdiff', // policy.isPagamentoIncasso = true
    operazione_partite: 'chiude',
    iva_per_cassa: true
  }

  const behavior = resolveRegistrazioneCausaleBehavior(causalePFPC)
  
  assert.equal(behavior.showIvaPanel, false, 'showIvaPanel deve essere false per pagamenti')
  assert.equal(behavior.showPartitario, true, 'showPartitario deve essere true per pagamenti')
  assert.ok(!behavior.activeTabs.includes('iva'), 'activeTabs non deve includere iva')
  assert.ok(behavior.activeTabs.includes('partitario'), 'activeTabs deve includere partitario')
  assert.ok(behavior.activeTabs.includes('ivaPerCassaPreview'), 'activeTabs deve includere la preview IVA per cassa')
  assert.equal(behavior.showIvaPerCassaPreview, true)
})

test('pagamento/incasso ordinario non attiva la preview IVA per cassa', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'PAGAMENTO-ESEMPIO',
    tipo_causale: 'pagamento',
    operazione_partite: 'chiude',
    iva_per_cassa: false,
  }, { useLegacyFallback: false })

  assert.equal(behavior.showIvaPanel, false)
  assert.equal(Boolean(behavior.showIvaPerCassaPreview), false)
  assert.ok(behavior.activeTabs.includes('partitario'))
  assert.ok(!behavior.activeTabs.includes('ivaPerCassaPreview'))
})

test('2. Subject autocomplete filters correctly include professionista when appropriate', () => {
  const headerPF = {
    causaleContabile: {
      codice: 'PFPC',
      tipo_causale: 'pagincivaesigdiff',
      operazione_partite: 'chiude',
      tipo_documento: 'Pagamento'
    }
  }

  const listPF = resolveRegistrazioneControparteListByHeader(headerPF, pianoConti)
  
  const hasProf = listPF.some(c => c.id === 'conto-professionista-1')
  const hasForn = listPF.some(c => c.id === 'conto-fornitore-1')
  const hasClient = listPF.some(c => c.id === 'conto-cliente-1')

  assert.ok(hasProf, 'Professionista deve essere presente per causale di pagamento')
  assert.ok(hasForn, 'Fornitore deve essere presente per causale di pagamento')
  assert.ok(!hasClient, 'Cliente non deve essere presente per causale di pagamento')
})

test('3. Mapped open items correctly resolve names even when counterpart name/code in DB is null', () => {
  const input = {
    header: {
      clienteFornitoreId: 'conto-professionista-1'
    },
    partitarioData: {
      selectedPartitaIds: ['partita-1'],
      importiChiusura: { 'partita-1': '500.00' }
    },
    openItems: [
      {
        id: 'partita-1',
        conto_id: 'conto-professionista-1',
        controparte_nome: null,
        conto_codice: null,
        conto_descrizione: null,
        importo_originale: 1000,
        importo_residuo: 1000,
        iva_per_cassa: true
      }
    ]
  }

  const options = {
    pianoConti,
    behavior: {
      partitarioMode: 'chiusura'
    }
  }

  const draft = buildRegistrazionePartitarioDraft(input, options)
  
  assert.equal(draft.rows.length, 1)
  const row = draft.rows[0]
  assert.equal(row.soggettoNome, 'Professionista Uno', 'Il nome del soggetto deve essere risolto dal piano dei conti')
  assert.equal(row.iva_per_cassa, true, 'Il flag iva_per_cassa deve essere preservato')
  assert.equal(row.ivaPerCassa, true, 'Il flag ivaPerCassa deve essere mappato')
})

test('4. Standard items do not trigger cash VAT release', async () => {
  const db = new MockDbClient()
  db.partitarioRows = [
    {
      id: 'partita-1',
      prima_nota_id: 'pn-orig-1',
      importo_originale: 1000,
      importo_pagato: 0,
      iva_per_cassa: false, // NOT cash VAT
      stato: 'aperta'
    }
  ]

  const draft = {
    pnPayload: {
      societa_id: 'soc-1',
      esercizio: 2026,
      data_registrazione: '2026-06-03',
      causale_id: 'caus-pf',
      causale_codice: 'PF',
      descrizione: 'Pagamento fornitore',
      stato: 'bozza',
      totale_dare: 1000,
      totale_avere: 1000,
      cliente_fornitore_id: 'conto-fornitore-1',
      cliente_fornitore_nome: 'Fornitore Uno',
      created_by: 'op-1',
      created_at: '2026-06-03T10:00:00Z'
    },
    righePayload: [
      { accountId: 'conto-fornitore-1', dare: 1000, avere: 0, descrizione_riga: 'Fornitore' },
      { accountId: 'conto-banca', dare: 0, avere: 1000, descrizione_riga: 'Banca' }
    ],
    validation: {
      status: 'ok',
      isBalanced: true,
      totals: { differenza: 0 },
      blockers: [],
      warnings: [],
    },
    readiness: {
      status: 'pronto'
    },
    header: {
      societaId: 'soc-1',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-03',
      causaleContabile: {
        id: 'caus-pf',
        codice: 'PF',
        tipoCausale: 'generale',
        operazione_partite: 'chiude',
        tipo_documento: 'Pagamento',
        descrizione: 'Pagamento fornitore'
      },
      descrizioneGenerale: 'Pagamento fornitore',
      clienteFornitoreId: 'conto-fornitore-1',
      clienteFornitoreNome: 'Fornitore Uno'
    },
    totals: {
      totaleDare: 1000,
      totaleAvere: 1000,
      differenza: 0,
      isBalanced: true
    },
    meta: {
      operatorId: 'op-1',
      createdAt: '2026-06-03T10:00:00Z',
      behavior: {
        code: 'PF',
        family: 'generale',
        showDocumentPanel: false,
        showIvaPanel: false,
        showPartitario: true,
        showRitenute: false
      }
    },
    partitarioDraft: {
      active: true,
      mode: 'chiusura',
      rows: [
        {
          id: 'partita-1',
          selected: true,
          importoChiusura: 1000,
          iva_per_cassa: false
        }
      ]
    },
    pianoConti
  }

  const result = await persistPrimaNotaDraft({ db, draft })
  
  assert.equal(result.error, null)
  // Check that no registri_iva inserts were made
  const inserts = db.log.filter(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.equal(inserts.length, 0, 'Non devono essere create righe registri_iva di rilascio per partite ordinarie')
})

test('5. FFPC policy ha ivaPerCassa = true, FF ordinaria ha ivaPerCassa = false', () => {
  // Questo test verifica che la policy (non il codice causale) determini il comportamento
  const causaleFFPC = {
    codice: 'FFPC',
    descrizione: 'Fattura passiva IVA per cassa',
    tipo_causale: 'docivaesigdifferita',
    operazione_partite: 'apre',
    iva_per_cassa: true
  }

  const causaleFF = {
    codice: 'FF',
    descrizione: 'Fattura passiva ordinaria',
    tipo_causale: 'docivanormale',
    operazione_partite: 'apre',
    iva_per_cassa: false
  }

  const policyFFPC = buildCausaleContabilePolicy(causaleFFPC)
  const policyFF = buildCausaleContabilePolicy(causaleFF)

  // FFPC deve avere ivaPerCassa = true per policy
  assert.equal(policyFFPC.ivaPerCassa, true, 'FFPC deve avere ivaPerCassa = true via policy')
  // FFPC deve avere gestionePartitario = apertura per policy
  assert.equal(policyFFPC.gestionePartitario, 'apertura', 'FFPC deve avere gestionePartitario = apertura')
  // FFPC non deve essere isPagamentoIncasso
  assert.equal(policyFFPC.isPagamentoIncasso, false, 'FFPC non deve essere pagamento/incasso')
  // FFPC deve essere isDocumentoIva
  assert.equal(policyFFPC.isDocumentoIva, true, 'FFPC deve essere isDocumentoIva')

  // FF deve avere ivaPerCassa = false per policy
  assert.equal(policyFF.ivaPerCassa, false, 'FF ordinaria deve avere ivaPerCassa = false')
  // FF deve essere isDocumentoIva
  assert.equal(policyFF.isDocumentoIva, true, 'FF ordinaria deve essere isDocumentoIva')

  // Verifica che iva_per_cassa dalla riga partitario prende precedenza sulla policy se presente
  const rowFFPC = { soggettoId: 'conto-fornitore-1', importoAperto: 1000, iva_per_cassa: true }
  const rowFF = { soggettoId: 'conto-fornitore-1', importoAperto: 1000, iva_per_cassa: false }

  // La riga FFPC conserva il flag iva_per_cassa = true
  const ivaPerCassaFFPC = Boolean(rowFFPC.iva_per_cassa ?? rowFFPC.ivaPerCassa ?? policyFFPC.ivaPerCassa ?? false)
  const ivaPerCassaFF = Boolean(rowFF.iva_per_cassa ?? rowFF.ivaPerCassa ?? policyFF.ivaPerCassa ?? false)

  assert.equal(ivaPerCassaFFPC, true, 'Riga FFPC deve avere iva_per_cassa = true')
  assert.equal(ivaPerCassaFF, false, 'Riga FF deve avere iva_per_cassa = false')
})

test('preview draft attiva solo per partite IVA per cassa selezionate', () => {
  const draft = buildRegistrazionePartitarioDraft({
    header: { clienteFornitoreId: 'conto-fornitore-1' },
    selectedCausale: {
      codice: 'CODICE-NON-DECISIONALE',
      tipo_causale: 'pagincivaesigdiff',
      operazione_partite: 'chiude',
      iva_per_cassa: true,
    },
    partitarioData: {
      selectedPartitaIds: ['cash', 'ordinary'],
      importiChiusura: { cash: 770, ordinary: 100 },
    },
    openItems: [
      { id: 'cash', conto_id: 'conto-fornitore-1', importo_originale: 1540, importo_residuo: 1540, iva_per_cassa: true },
      { id: 'ordinary', conto_id: 'conto-fornitore-1', importo_originale: 100, importo_residuo: 100, iva_per_cassa: false },
    ],
  }, {
    pianoConti,
    behavior: { showPartitario: true, partitarioMode: 'chiusura' },
    ivaPerCassaOriginalVatRows: [{ id: 'iva-cash', partita_id: 'cash', imponibile: 1400, iva: 140 }],
  })

  assert.equal(draft.ivaPerCassaPreview.active, true)
  assert.equal(draft.ivaPerCassaPreview.items.length, 1)
  assert.equal(draft.ivaPerCassaPreview.items[0].partitaId, 'cash')
  assert.equal(draft.ivaPerCassaPreview.items[0].ivaDaRilasciareOra, 70)
})

test('persistenza blocca una preview IVA per cassa incoerente', () => {
  const resolved = resolveDraftBundle({
    pnPayload: {
      societa_id: 'soc-1',
      esercizio: 2026,
      data_registrazione: '2026-06-06',
      causale_id: 'causale-1',
      causale_codice: 'CODICE-ARBITRARIO',
      cliente_fornitore_id: 'conto-fornitore-1',
    },
    righePayload: [
      { conto_id: 'conto-fornitore-1', dare: 100, avere: 0 },
      { conto_id: 'conto-banca', dare: 0, avere: 100 },
    ],
    partitarioDraft: {
      ivaPerCassaPreview: {
        active: true,
        items: [{ partitaId: 'partita-1', coerente: false }],
      },
    },
  })
  const validation = buildPersistenceValidation(resolved)
  assert.equal(validation.status, 'blocked')
  assert.ok(validation.blockers.some((blocker) => blocker.includes('non coerente al centesimo')))
})

test('buildRegistrazioneDraft espone al tab la preview dopo la selezione della partita', () => {
  const selectedCausale = {
    codice: 'CODICE-ESEMPIO',
    tipo_causale: 'pagincivaesigdiff',
    operazione_partite: 'chiude',
    iva_per_cassa: true,
    conto_iva_esig_differita: 'iva-differita',
  }
  const behavior = resolveRegistrazioneCausaleBehavior(selectedCausale, { useLegacyFallback: false })
  const result = buildRegistrazioneDraft({
    header: {
      societaId: 'soc-1',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-06',
      causaleContabile: selectedCausale,
      clienteFornitoreId: 'conto-fornitore-1',
      clienteFornitoreNome: 'Fornitore Uno',
      clienteFornitoreTipo: 'fornitore',
    },
    rows: [
      { id: 'fornitore', conto_id: 'conto-fornitore-1', dare: '1000.00', avere: '' },
      { id: 'banca', conto_id: 'conto-banca', dare: '', avere: '1000.00' },
    ],
    partitarioData: {
      tipoMovimento: 'chiusura',
      selectedPartitaIds: ['partita-1540'],
      checkedPartiteIds: ['partita-1540'],
      importiChiusura: { 'partita-1540': 1000 },
    },
  }, {
    behavior,
    selectedCausale,
    pianoConti,
    causaliIva: [{ id: 'causale-iva-1', conto_iva_id: 'iva-ordinaria' }],
    partite: [{
      id: 'partita-1540',
      prima_nota_id: 'pn-originaria',
      conto_id: 'conto-fornitore-1',
      importo_originale: 1540,
      importo_residuo: 1540,
      iva_per_cassa: true,
    }],
    ivaPerCassaOriginalVatRows: [{
      id: 'iva-originaria',
      partita_id: 'partita-1540',
      prima_nota_id: 'pn-originaria',
      imponibile: 1400,
      iva: 140,
      tipo: 'acquisto',
      causale_iva_id: 'causale-iva-1',
    }],
  })

  assert.equal(result.partitarioDraft, result.draft.partitarioDraft)
  assert.equal(result.partitarioDraft.ivaPerCassaPreview.items.length, 1)
  const [item] = result.partitarioDraft.ivaPerCassaPreview.items
  assert.equal(item.partitaId, 'partita-1540')
  assert.equal(item.primaNotaId, 'pn-originaria')
  assert.equal(item.importoOriginale, 1540)
  assert.equal(item.importoChiusura, 1000)
  assert.equal(item.importoChiusuraIvaPerCassa, 1000)
  assert.equal(item.ivaDaRilasciareOra, 90.91)
  assert.equal(result.normalized.rows.length, 4)
  assert.deepEqual(
    result.normalized.rows.slice(2).map((row) => [row.conto_id, row.dare, row.avere]),
    [
      ['iva-ordinaria', '90.91', ''],
      ['iva-differita', '', '90.91'],
    ]
  )
  assert.equal(result.totals.isBalanced, true)
})

test('giroconto pagamento totale passivo genera IVA ordinaria Dare e differita Avere', () => {
  const result = buildGiroconto({ direction: 'passivo', release: 140 })
  assert.equal(result.blockers.length, 0)
  assert.equal(result.girocontoRows.length, 2)
  const ordinary = result.girocontoRows.find((row) => row.conto_id === 'iva-ordinaria')
  const deferred = result.girocontoRows.find((row) => row.conto_id === 'iva-differita')
  assert.equal(ordinary.dare, '140.00')
  assert.equal(ordinary.avere, '')
  assert.equal(deferred.dare, '')
  assert.equal(deferred.avere, '140.00')
})

test('giroconto pagamento parziale usa esattamente IVA da rilasciare 90,91', () => {
  const result = buildGiroconto({ direction: 'passivo', release: 90.91 })
  assert.equal(result.totalRelease, 90.91)
  assert.deepEqual(
    result.girocontoRows.map((row) => [row.conto_id, row.dare, row.avere]),
    [
      ['iva-ordinaria', '90.91', ''],
      ['iva-differita', '', '90.91'],
    ]
  )
})

test('giroconto incasso attivo genera differita Dare e IVA ordinaria Avere', () => {
  const result = buildGiroconto({ direction: 'attivo', release: 140 })
  const ordinary = result.girocontoRows.find((row) => row.conto_id === 'iva-ordinaria')
  const deferred = result.girocontoRows.find((row) => row.conto_id === 'iva-differita')
  assert.equal(deferred.dare, '140.00')
  assert.equal(deferred.avere, '')
  assert.equal(ordinary.dare, '')
  assert.equal(ordinary.avere, '140.00')
})

test('pagamento ordinario non genera il giroconto IVA per cassa', () => {
  const result = buildGiroconto({ cashVat: false })
  assert.equal(result.active, false)
  assert.equal(result.girocontoRows.length, 0)
  assert.equal(result.rows.length, 2)
})

test('conti IVA mancanti bloccano il giroconto con messaggi chiari', () => {
  const result = buildGiroconto({
    includeOrdinaryAccount: false,
    includeDeferredAccount: false,
  })
  assert.equal(result.girocontoRows.length, 0)
  assert.ok(result.blockers.some((message) => message.includes('conto IVA differita/sospesa')))
  assert.ok(result.blockers.some((message) => message.includes('conto IVA ordinaria')))
})

test('buildRegistrazioneDraft blocca il salvataggio se i conti del giroconto non sono risolvibili', () => {
  const selectedCausale = {
    codice: 'CODICE-QUALSIASI',
    tipo_causale: 'pagincivaesigdiff',
    operazione_partite: 'chiude',
    iva_per_cassa: true,
  }
  const behavior = resolveRegistrazioneCausaleBehavior(selectedCausale, { useLegacyFallback: false })
  const result = buildRegistrazioneDraft({
    header: {
      societaId: 'soc-1',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-07',
      causaleContabile: selectedCausale,
      clienteFornitoreId: 'conto-fornitore-1',
      clienteFornitoreTipo: 'fornitore',
    },
    rows: [
      { id: 'fornitore', conto_id: 'conto-fornitore-1', dare: '1540.00', avere: '' },
      { id: 'banca', conto_id: 'conto-banca', dare: '', avere: '1540.00' },
    ],
    partitarioData: {
      selectedPartitaIds: ['partita-1'],
      importiChiusura: { 'partita-1': 1540 },
    },
  }, {
    behavior,
    selectedCausale,
    pianoConti,
    partite: [{
      id: 'partita-1',
      prima_nota_id: 'pn-1',
      conto_id: 'conto-fornitore-1',
      importo_originale: 1540,
      importo_residuo: 1540,
      iva_per_cassa: true,
    }],
    ivaPerCassaOriginalVatRows: [{
      id: 'iva-1',
      partita_id: 'partita-1',
      prima_nota_id: 'pn-1',
      tipo: 'acquisto',
      imponibile: 1400,
      iva: 140,
    }],
  })

  assert.equal(result.validation.status, 'blocked')
  assert.equal(result.draft.stato, 'bozza_bloccata')
  assert.ok(result.validation.blockers.some((message) => message.includes('conto IVA differita/sospesa')))
  assert.ok(result.validation.blockers.some((message) => message.includes('conto IVA ordinaria')))
})

test('giroconto IVA mantiene la scrittura quadrata e coerente con il rilascio', () => {
  const result = buildGiroconto({ direction: 'passivo', release: 90.91 })
  const totals = result.rows.reduce((acc, row) => ({
    dare: acc.dare + Number(row.dare || 0),
    avere: acc.avere + Number(row.avere || 0),
  }), { dare: 0, avere: 0 })
  assert.equal(Number(totals.dare.toFixed(2)), Number(totals.avere.toFixed(2)))
  assert.equal(
    Number(result.girocontoRows.reduce((sum, row) => sum + Number(row.dare || 0), 0).toFixed(2)),
    result.totalRelease
  )
})

test('giroconto IVA non dipende da prefissi del codice causale', () => {
  const first = buildGiroconto({ causaleCode: 'PFPC' })
  const second = buildGiroconto({ causaleCode: 'XYZ-SENZA-PREFISSO' })
  assert.deepEqual(
    first.girocontoRows.map((row) => [row.conto_id, row.dare, row.avere]),
    second.girocontoRows.map((row) => [row.conto_id, row.dare, row.avere])
  )
})
