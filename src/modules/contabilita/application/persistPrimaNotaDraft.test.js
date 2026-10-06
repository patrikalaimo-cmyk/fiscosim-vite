import test from 'node:test'
import assert from 'node:assert/strict'

process.env.VITE_SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.VITE_SUPABASE_ANON_KEY ||= 'test-anon-key'

const { buildPrimaNotaDraftFromCanonicalContabilitaPayload } = await import('./canonicalContabilitaDraftMapper.js')
const { persistPrimaNotaDraft } = await import('./persistPrimaNotaDraft.js')

function makeCanonicalPayload(overrides = {}) {
  return {
    handoff: {
      contractVersion: 'P7B-v3',
      sourceModule: 'import_contabilita',
      sourceBatchId: 'batch-1',
      sourceRowKey: 'row-1',
      sourceFileName: 'demo.xml',
      operatorId: 'op-1',
      createdAt: '2026-04-30T10:00:00.000Z',
    },
    company: {
      societaId: 'soc-1',
    },
    document: {
      direction: 'acquisto',
      type: 'TD01',
      number: 'A-100',
      documentDate: '2026-04-30',
      registrationDate: '2026-04-30',
      counterparty: {
        name: 'Fornitore Demo',
        vatNumber: 'IT12345678901',
        taxCode: 'RSSMRA80A01H501U',
        accountId: 'acc-counterparty',
        accountCode: '2.01.001',
      },
      totals: {
        taxable: 100,
        vat: 22,
        gross: 122,
      },
    },
    classification: {
      code: 'ordinario',
      label: 'Ordinario',
      managed: true,
    },
    readiness: {
      status: 'pronto_per_contabilita',
      label: 'Pronto per contabilitÃ ',
    },
    accounting: {
      causaleContabile: {
        id: 'caus-1',
        code: 'FF',
        description: 'Fattura fornitore',
      },
      rows: [
        { accountId: 'acc-cost', description: 'Costo', debit: 100, credit: 0 },
        { accountId: 'acc-iva', description: 'IVA', debit: 22, credit: 0, causaleIvaId: 'iva-22' },
        { accountId: 'acc-counterparty', description: 'Fornitore', debit: 0, credit: 122 },
      ],
      totals: {
        debit: 122,
        credit: 122,
      },
      isBalanced: true,
    },
    vat: {
      enabled: true,
      registerType: 'acquisti',
      competenceDate: '2026-04-30',
      rows: [
        {
          idx: 0,
          rate: 22,
          nature: null,
          taxable: 100,
          tax: 22,
          detraibilePercent: 100,
          indetraibilePercent: 0,
          detraibileTax: 22,
          indetraibileTax: 0,
          esigibilita: 'Immediata',
          causaleIvaId: 'iva-22',
          causaleIvaCode: 'IVA22',
        },
      ],
      totals: {
        taxable: 100,
        tax: 22,
        detraibileTax: 22,
        indetraibileTax: 0,
      },
    },
    ledger: {
      enabled: true,
      type: 'fornitore',
      accountId: 'acc-counterparty',
      amount: 122,
      documentNumber: 'A-100',
      documentDate: '2026-04-30',
      dueDate: '2026-05-30',
    },
    withholding: {
      enabled: false,
      supported: false,
      percipienteId: null,
      blockedReason: null,
      rows: [],
    },
    validation: {
      status: 'ok',
      blockers: [],
      warnings: [],
    },
    automationMeta: {},
    ...overrides,
  }
}

function makePersistenceDraft({ behavior = {}, withCounterparty = true, rows = null, pnPayloadOverrides = {} } = {}) {
  const canonical = buildPrimaNotaDraftFromCanonicalContabilitaPayload(makeCanonicalPayload())
  canonical.draft.header.esercizioContabile = '2026'
  canonical.pnPayload.esercizio = 2026
  canonical.pnPayload.scope = {
    source_module: 'registrazione_manuale',
    source_mode: 'manuale',
  }
  canonical.draft.meta = {
    ...(canonical.draft.meta || {}),
    behavior: {
      requiresSoggetto: false,
      showDocumentPanel: false,
      showIvaPanel: false,
      showPartitario: false,
      showRitenute: false,
      ...behavior,
    },
  }

  if (Array.isArray(rows)) {
    const clonedRows = rows.map((row) => ({ ...row }))
    canonical.righePayload = clonedRows
    canonical.draft.rows = clonedRows
  }

  Object.assign(canonical.pnPayload, pnPayloadOverrides)

  if (!withCounterparty) {
    canonical.pnPayload.cliente_fornitore_id = ''
    canonical.pnPayload.cliente_fornitore_nome = ''
    canonical.draft.header.cliente_fornitore_id = ''
    canonical.draft.header.cliente_fornitore_nome = ''
  }

  return canonical
}

function makeMockDb({ failRows = false } = {}) {
  const state = {
    prima_nota: [],
    prima_nota_righe: [],
    deletedPrimaNotaIds: [],
  }
  let seq = 1

  const nextId = (prefix) => `${prefix}-${seq++}`

  return {
    state,
    from(table) {
      if (table === 'prima_nota') {
        return {
          insert(rows = []) {
            const payloads = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : []
            return {
              select() {
                return {
                  single: async () => {
                    const inserted = payloads[0] ? { id: nextId('pn'), ...payloads[0] } : null
                    if (inserted) {
                      state.prima_nota.push(inserted)
                    }
                    return { data: inserted, error: null }
                  },
                }
              }
            }
          },
          delete() {
            return {
              eq(column, value) {
                if (column === 'id') {
                  state.deletedPrimaNotaIds.push(value)
                  state.prima_nota = state.prima_nota.filter((row) => row.id !== value)
                }
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      }

      if (table === 'prima_nota_righe') {
        return {
          insert(rows = []) {
            const payloads = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : []
            return {
              select() {
                if (failRows) {
                  return Promise.resolve({ data: null, error: new Error('mock righe failure') })
                }
                const inserted = payloads.map((row) => ({ id: nextId('pnr'), ...row }))
                state.prima_nota_righe.push(...inserted)
                return Promise.resolve({ data: inserted, error: null })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

test('persistenza autonoma prima nota crea testata e righe da draft canonico', async () => {
  const canonical = makePersistenceDraft()
  const db = makeMockDb()

  const result = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  assert.equal(result.error, null)
  assert.equal(result.data.prima_nota_id.startsWith('pn-'), true)
  assert.equal(result.data.numero_righe, 3)
  assert.equal(result.data.totale_dare, 122)
  assert.equal(result.data.totale_avere, 122)
  assert.equal(result.data.isBalanced, true)
  assert.equal(db.state.prima_nota.length, 1)
  assert.equal(db.state.prima_nota_righe.length, 3)

  const header = db.state.prima_nota[0]
  assert.equal(header.numero_registrazione, 'A-100')
  assert.equal(header.societa_id, 'soc-1')
  assert.equal(header.esercizio, 2026)
  assert.equal(header.data_registrazione, '2026-04-30')
  assert.equal(header.data_documento, '2026-04-30')
  assert.equal(header.causale_id, 'caus-1')
  assert.equal(header.causale_codice, 'FF')
  assert.equal(typeof header.descrizione, 'string')
  assert.equal(header.descrizione.length > 0, true)
  assert.equal(header.cliente_fornitore_id, 'acc-counterparty')
  assert.equal(header.cliente_fornitore_nome, 'Fornitore Demo')
  assert.equal(header.totale_dare, 122)
  assert.equal(header.totale_avere, 122)
  assert.equal(typeof header.stato, 'string')
  assert.equal(header.stato.length > 0, true)
  assert.equal(header.documento_import_id, 'row-1')
  for (const forbidden of ['scope', 'meta', 'behavior', 'validation', 'readiness', 'activeTabs', 'showDocumentPanel', 'showIvaPanel', 'showPartitario', 'showRitenute', 'numero_documento', 'dare', 'avere']) {
    assert.equal(Object.hasOwn(header, forbidden), false)
  }

  const allowedHeaderKeys = new Set([
    'id',
    'societa_id',
    'numero_registrazione',
    'data_registrazione',
    'data_documento',
    'causale_id',
    'causale_codice',
    'descrizione',
    'cliente_fornitore_id',
    'cliente_fornitore_nome',
    'totale_dare',
    'totale_avere',
    'stato',
    'fattura_xml_id',
    'documento_import_id',
    'created_by',
    'created_at',
    'updated_at',
    'cliente_id',
    'tenant_id',
    'company_id',
    'owner_user_id',
    'visibility',
    'locked_by',
    'locked_at',
    'documento_contabilita_id',
    'esercizio',
  ])
  for (const key of Object.keys(header)) {
    assert.equal(allowedHeaderKeys.has(key), true)
  }

  const [row1, row2, row3] = db.state.prima_nota_righe
  assert.equal(row1.prima_nota_id, result.data.prima_nota_id)
  assert.equal(row1.conto_id, 'acc-cost')
  assert.equal(row1.importo_dare, 100)
  assert.equal(row1.importo_avere, 0)
  assert.equal(row1.descrizione_riga, 'Costo')
  assert.equal(row2.prima_nota_id, result.data.prima_nota_id)
  assert.equal(row2.conto_id, 'acc-iva')
  assert.equal(row2.importo_dare, 22)
  assert.equal(row2.importo_avere, 0)
  assert.equal(row2.causale_iva_id, 'iva-22')
  assert.equal(row2.descrizione_riga, 'IVA')
  assert.equal(row3.prima_nota_id, result.data.prima_nota_id)
  assert.equal(row3.conto_id, 'acc-counterparty')
  assert.equal(row3.importo_dare, 0)
  assert.equal(row3.importo_avere, 122)
  assert.equal(row3.descrizione_riga, 'Fornitore')

  const allowedRowKeys = new Set([
    'id',
    'prima_nota_id',
    'riga_numero',
    'conto_id',
    'conto_codice',
    'conto_descrizione',
    'descrizione_riga',
    'importo_dare',
    'importo_avere',
    'causale_iva_id',
    'causale_iva_codice',
    'imponibile',
    'iva',
    'partita_aperta',
    'partita_id',
    'created_at',
    'tenant_id',
    'company_id',
    'created_by',
    'owner_user_id',
    'visibility',
    'locked_by',
    'locked_at',
  ])
  for (const row of db.state.prima_nota_righe) {
    for (const key of Object.keys(row)) {
      assert.equal(allowedRowKeys.has(key), true)
    }
    assert.equal(Object.hasOwn(row, 'dare'), false)
    assert.equal(Object.hasOwn(row, 'avere'), false)
  }
  assert.equal(db.state.deletedPrimaNotaIds.length, 0)
})

test('persistenza autonoma prima nota ricostruisce payload DB-safe da campi interni e alias', async () => {
  const rows = [
    {
      conto_id: 'acc-debit',
      conto_codice: '100',
      conto_descrizione: 'Cassa',
      descrizione: 'Prima riga',
      dare: 100,
      avere: '',
      scope: { source: 'row' },
    },
    {
      accountId: 'acc-credit',
      contoId: 'acc-credit',
      contoCodice: '200',
      contoDescrizione: 'Ricavi',
      descrizioneRiga: 'Seconda riga',
      dare: undefined,
      avere: 100,
      behavior: { nested: true },
    },
  ]
  const canonical = makePersistenceDraft({
    rows,
    pnPayloadOverrides: {
      numero_documento: 'PN-TEST-001',
      scope: { source_module: 'registrazione_manuale', source_mode: 'manuale' },
      meta: { internal: true },
      behavior: { showDocumentPanel: true },
      policy: { locked: false },
      activeTabs: ['rows'],
      showDocumentPanel: true,
      showIvaPanel: true,
      showPartitario: true,
      showRitenute: true,
      validation: { status: 'ok' },
      readiness: { status: 'pronto_per_contabilita' },
    },
  })
  canonical.validation = { status: 'ok', blockers: [], warnings: [] }
  canonical.draft.validation = { status: 'ok', blockers: [], warnings: [] }
  canonical.draft.totals = { totaleDare: 100, totaleAvere: 100, differenza: 0, isBalanced: true }
  canonical.pnPayload.totale_dare = 999
  canonical.pnPayload.totale_avere = 999

  const db = makeMockDb()
  const result = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  assert.equal(result.error, null)
  const header = db.state.prima_nota[0]
  assert.equal(header.numero_registrazione, 'PN-TEST-001')
  assert.equal(header.totale_dare, 100)
  assert.equal(header.totale_avere, 100)
  assert.equal(Object.hasOwn(header, 'scope'), false)
  assert.equal(Object.hasOwn(header, 'meta'), false)
  assert.equal(Object.hasOwn(header, 'behavior'), false)
  assert.equal(Object.hasOwn(header, 'policy'), false)
  assert.equal(Object.hasOwn(header, 'activeTabs'), false)
  assert.equal(Object.hasOwn(header, 'showDocumentPanel'), false)
  assert.equal(Object.hasOwn(header, 'showIvaPanel'), false)
  assert.equal(Object.hasOwn(header, 'showPartitario'), false)
  assert.equal(Object.hasOwn(header, 'showRitenute'), false)
  assert.equal(Object.hasOwn(header, 'validation'), false)
  assert.equal(Object.hasOwn(header, 'readiness'), false)
  assert.equal(Object.hasOwn(header, 'numero_documento'), false)

  const [row1, row2] = db.state.prima_nota_righe
  assert.equal(row1.importo_dare, 100)
  assert.equal(row1.importo_avere, 0)
  assert.equal(row1.descrizione_riga, 'Prima riga')
  assert.equal(Object.hasOwn(row1, 'dare'), false)
  assert.equal(Object.hasOwn(row1, 'avere'), false)
  assert.equal(Object.hasOwn(row1, 'scope'), false)
  assert.equal(row2.importo_dare, 0)
  assert.equal(row2.importo_avere, 100)
  assert.equal(row2.descrizione_riga, 'Seconda riga')
  assert.equal(Object.hasOwn(row2, 'dare'), false)
  assert.equal(Object.hasOwn(row2, 'avere'), false)
  assert.equal(Object.hasOwn(row2, 'behavior'), false)
  assert.equal(db.state.deletedPrimaNotaIds.length, 0)
})

test('persistenza autonoma prima nota consente un movimento semplice senza controparte', async () => {
  const canonical = makePersistenceDraft({ withCounterparty: false })
  const db = makeMockDb()

  const result = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  assert.equal(result.error, null)
  assert.equal(result.data.prima_nota_id.startsWith('pn-'), true)
  assert.equal(result.data.numero_righe, 3)
  assert.equal(db.state.prima_nota.length, 1)
  assert.equal(db.state.prima_nota_righe.length, 3)
})

test('persistenza autonoma prima nota blocca esercizio contabile mancante o non determinabile', async () => {
  const canonical = makePersistenceDraft({ withCounterparty: false })
  canonical.draft.header.esercizioContabile = ''
  canonical.pnPayload.esercizio = null
  const db = makeMockDb()

  const result = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  assert.equal(result.error instanceof Error, true)
  assert.match(result.error.message, /esercizio contabile mancante o non determinabile/)
  assert.equal(db.state.prima_nota.length, 0)
  assert.equal(db.state.prima_nota_righe.length, 0)
})

test('persistenza autonoma prima nota blocca documenti con controparte richiesta ma mancante', async () => {
  const canonical = makePersistenceDraft({
    withCounterparty: false,
    behavior: { showDocumentPanel: true, requiresSoggetto: true },
  })
  const db = makeMockDb()

  const result = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  assert.equal(result.error instanceof Error, true)
  assert.match(result.error.message, /controparte mancante/)
  assert.equal(db.state.prima_nota.length, 0)
  assert.equal(db.state.prima_nota_righe.length, 0)
})

test('persistenza autonoma prima nota blocca partitario senza controparte', async () => {
  const canonical = makePersistenceDraft({
    withCounterparty: false,
    behavior: { showPartitario: true, requiresSoggetto: true },
  })
  const db = makeMockDb()

  const result = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  assert.equal(result.error instanceof Error, true)
  assert.match(result.error.message, /controparte mancante/)
  assert.equal(db.state.prima_nota.length, 0)
  assert.equal(db.state.prima_nota_righe.length, 0)
})

test('persistenza autonoma prima nota blocca ritenute senza controparte', async () => {
  const canonical = makePersistenceDraft({
    withCounterparty: false,
    behavior: { showRitenute: true, requiresSoggetto: true },
  })
  const db = makeMockDb()

  const result = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  assert.equal(result.error instanceof Error, true)
  assert.match(result.error.message, /controparte mancante/)
  assert.equal(db.state.prima_nota.length, 0)
  assert.equal(db.state.prima_nota_righe.length, 0)
})

test('persistenza autonoma prima nota blocca draft invalidi prima della scrittura', async () => {
  const canonical = makePersistenceDraft({
    withCounterparty: false,
    behavior: { showDocumentPanel: true, requiresSoggetto: true },
  })
  const invalidRows = [
    { accountId: '', conto_id: '', description: '', descrizione: '', dare: 0, avere: 0, importo_dare: 0, importo_avere: 0 },
    { accountId: 'acc-bad', conto_id: 'acc-bad', description: 'Negativo', descrizione: 'Negativo', dare: -1, avere: 0, importo_dare: -1, importo_avere: 0 },
    { accountId: 'acc-double', conto_id: 'acc-double', description: 'Doppio', descrizione: 'Doppio', dare: 1, avere: 1, importo_dare: 1, importo_avere: 1 },
  ]
  canonical.righePayload = invalidRows
  canonical.draft.rows = invalidRows
  canonical.draft.validation = { status: 'blocked', blockers: ['draft non valido'], warnings: [] }
  canonical.draft.totals = { totaleDare: 0, totaleAvere: 0, differenza: 0, isBalanced: false }
  canonical.pnPayload.societa_id = ''
  canonical.pnPayload.data_registrazione = ''
  canonical.pnPayload.causale_id = ''
  canonical.pnPayload.causale_codice = ''
  canonical.pnPayload.cliente_fornitore_id = ''
  canonical.pnPayload.cliente_fornitore_nome = ''

  const db = makeMockDb()
  const result = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  assert.equal(result.error instanceof Error, true)
  assert.match(result.error.message, /societa_id mancante/)
  assert.match(result.error.message, /data registrazione mancante/)
  assert.match(result.error.message, /causale contabile mancante/)
  assert.match(result.error.message, /controparte mancante/)
  assert.match(result.error.message, /riga 1: conto mancante/)
  assert.match(result.error.message, /riga 1: importo assente/)
  assert.match(result.error.message, /riga 2: importo negativo/)
  assert.match(result.error.message, /riga 3: dare\/avere entrambi valorizzati/)
  assert.equal(db.state.prima_nota.length, 0)
  assert.equal(db.state.prima_nota_righe.length, 0)
})

test('persistenza autonoma prima nota fa rollback se le righe falliscono', async () => {
  const canonical = makePersistenceDraft()
  const db = makeMockDb({ failRows: true })

  const result = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  assert.equal(result.error instanceof Error, true)
  assert.match(result.error.message, /mock righe failure/)
  assert.equal(db.state.prima_nota.length, 0)
  assert.equal(db.state.prima_nota_righe.length, 0)
  assert.equal(db.state.deletedPrimaNotaIds.length, 1)
})
