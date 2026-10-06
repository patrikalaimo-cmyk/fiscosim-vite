import assert from 'node:assert/strict'
import { mapRegistrazioneManualeToCanonical } from '../../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function buildBaseDraft(overrides = {}) {
  return {
    draft: {
      stato: 'bozza',
      header: {
        societaId: 'soc-1',
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-04',
        dataDocumento: '2026-05-04',
        numeroDocumento: '351',
        causaleContabile: { id: 'caus-1', codice: 'FF', descrizione: 'Fattura fornitore' },
        descrizioneGenerale: 'Registrazione manuale test',
        clienteFornitoreId: 'cf-1',
        clienteFornitoreNome: 'BIRIMPORT SRL',
        clienteFornitoreCodice: 'BIR01',
      },
      rows: [
        { riga_numero: 1, conto_id: '10', conto_codice: 'A01', conto_descrizione: 'Conto A', dare: 100, avere: 0 },
        { riga_numero: 2, conto_id: '20', conto_codice: 'B01', conto_descrizione: 'Conto B', dare: 0, avere: 100 },
      ],
      totals: {
        totaleDare: 100,
        totaleAvere: 100,
        differenza: 0,
        isBalanced: true,
      },
      documentDraft: {
        divisa: 'EUR',
        totaleDocumento: 122,
        totaleImponibile: 100,
        totaleImposte: 22,
        tipoDocumento: 'FT',
      },
      ivaDraft: {
        enabled: false,
        rows: [],
        registroIva: '',
        dataCompetenza: '2026-05-04',
      },
      partitarioDraft: {
        enabled: false,
        rows: [],
        mode: 'none',
      },
      ritenutaDraft: {
        enabled: false,
        rows: [],
        mode: 'none',
      },
      meta: {
        behavior: {
          code: 'FF',
          family: 'doc',
          showDocumentPanel: true,
          showIvaPanel: false,
          showPartitario: false,
          showRitenute: false,
        },
        panelStatus: {
          document: 'ok',
          iva: 'idle',
          partitario: 'idle',
          ritenute: 'idle',
        },
        sourceRowKey: 'manual-row-1',
      },
      validation: {
        status: 'ok',
        warnings: [],
        blockers: [],
        isBalanced: true,
        totals: {
          differenza: 0,
        },
      },
    },
    ...overrides,
  }
}

function buildIvaDraftCase() {
  return buildBaseDraft({
    draft: {
      ...buildBaseDraft().draft,
      meta: {
        ...buildBaseDraft().draft.meta,
        behavior: {
          ...buildBaseDraft().draft.meta.behavior,
          showIvaPanel: true,
        },
        panelStatus: {
          ...buildBaseDraft().draft.meta.panelStatus,
          iva: 'ok',
        },
      },
      ivaDraft: {
        enabled: true,
        rows: [
          {
            riga: 1,
            causaleIvaId: 'iva-22',
            causaleIva: '22%',
            imponibile: 100,
            imposta: 22,
            aliquota: 22,
            natura: '',
            competenzaIva: '2026-05',
          },
        ],
        registroIva: 'acquisti',
        dataCompetenza: '2026-05-04',
        protocolloDefinitivo: 'PR-1',
        percentualeDetraibilita: 100,
        totaleIva: 22,
        totaleImponibile: 100,
      },
    },
  })
}

function buildWithholdingCase() {
  return buildBaseDraft({
    draft: {
      ...buildBaseDraft().draft,
      meta: {
        ...buildBaseDraft().draft.meta,
        behavior: {
          ...buildBaseDraft().draft.meta.behavior,
          showRitenute: true,
        },
        panelStatus: {
          ...buildBaseDraft().draft.meta.panelStatus,
          ritenute: 'ok',
        },
      },
      ritenutaDraft: {
        enabled: true,
        mode: 'documento',
        percipienteId: 'per-1',
        percipienteNome: 'Studio Rossi',
        codiceFiscale: 'RSSMRA80A01F205X',
        causaleCu: 'A',
        causaleReddituale: 'A - Lavoro autonomo',
        codiceTributo: '1040',
        importoCompenso: 1000,
        imponibile: 1000,
        imponibileReddito: 1000,
        baseImponibile: 1000,
        baseRitenuta: 1000,
        aliquotaRitenuta: 20,
        ritenuta: 200,
        netto: 800,
        dataPagamento: '2026-05-04',
        numeroDocumento: '351',
        tipoDocumento: 'FT',
        percipienteRecord: {
          id: 'per-1',
          denominazione: 'Studio Rossi',
          codiceFiscale: 'RSSMRA80A01F205X',
        },
        rows: [
          {
            riga: 1,
            baseAmount: 1000,
            rate: 20,
            amount: 200,
            netPaid: 800,
            causaleCu: 'A',
            paymentDate: '2026-05-04',
            tributeCode: '1040',
            period: '2026-05',
          },
        ],
      },
    },
  })
}

function buildLedgerCase() {
  return buildBaseDraft({
    draft: {
      ...buildBaseDraft().draft,
      meta: {
        ...buildBaseDraft().draft.meta,
        behavior: {
          ...buildBaseDraft().draft.meta.behavior,
          showPartitario: true,
        },
        panelStatus: {
          ...buildBaseDraft().draft.meta.panelStatus,
          partitario: 'ok',
        },
      },
      partitarioDraft: {
        enabled: true,
        mode: 'chiusura',
        tipoMovimento: 'chiusura',
        selectedPartitaId: 'part-1',
        selectedControparteId: 'cf-1',
        selectedControparteNome: 'BIRIMPORT SRL',
        soggettoId: 'cf-1',
        soggettoNome: 'BIRIMPORT SRL',
        rows: [
          {
            id: 'part-1',
            action: 'close',
            documentRef: '351',
            openItemId: 'open-1',
            amount: 100,
            dueDate: '2026-05-15',
            paymentDate: '2026-05-04',
            residualAmount: 0,
          },
        ],
      },
    },
  })
}

function buildIncompleteCase() {
  return {
    draft: {
      stato: 'bozza',
      header: {
        societaId: 'soc-1',
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-04',
        dataDocumento: '2026-05-04',
        numeroDocumento: '351',
        descrizioneGenerale: 'Bozza incompleta',
        clienteFornitoreId: 'cf-1',
        clienteFornitoreNome: 'BIRIMPORT SRL',
      },
      rows: [],
      totals: {
        totaleDare: 0,
        totaleAvere: 0,
        differenza: 0,
        isBalanced: false,
      },
      documentDraft: {
        divisa: 'EUR',
        totaleDocumento: 0,
      },
      ivaDraft: {
        enabled: false,
        rows: [],
      },
      partitarioDraft: {
        enabled: false,
        rows: [],
        mode: 'none',
      },
      ritenutaDraft: {
        enabled: false,
        rows: [],
        mode: 'none',
      },
      meta: {
        behavior: {
          code: 'FF',
          family: 'doc',
          showDocumentPanel: true,
          showIvaPanel: false,
          showPartitario: false,
          showRitenute: false,
        },
        panelStatus: {
          document: 'ok',
          iva: 'idle',
          partitario: 'idle',
          ritenute: 'idle',
        },
        sourceRowKey: 'manual-row-2',
      },
      validation: {
        status: 'blocked',
        warnings: ['dati incompleti'],
        blockers: ['causale contabile mancante'],
        isBalanced: false,
        totals: {
          differenza: 0,
        },
      },
    },
  }
}

const cases = [
  {
    name: 'PN manuale semplice',
    run: () => {
      const input = buildBaseDraft()
      const before = clone(input)
      const output = mapRegistrazioneManualeToCanonical(input)
      assert.equal(output.payload.source.module, 'registrazione_manuale')
      assert.equal(output.payload.postCommitTargets.shouldCreatePrimaNota, true)
      assert.equal(output.payload.postCommitTargets.shouldCreateIva, false)
      assert.equal(output.payload.postCommitTargets.shouldCreateLedger, false)
      assert.equal(output.payload.postCommitTargets.shouldCreateWithholding, false)
      assert.ok(Array.isArray(output.payload.accounting.rows) && output.payload.accounting.rows.length > 0)
      assert.equal(output.validationResult.targetValidabili.primaNota.valid, true)
      assert.equal(output.payload.schemaVersion, '1.0.0')
      assert.ok(Array.isArray(output.payload.subjects))
      assert.ok(output.payload.validation)
      assert.deepEqual(input, before)
    },
  },
  {
    name: 'Fattura con IVA',
    run: () => {
      const input = buildIvaDraftCase()
      const before = clone(input)
      const output = mapRegistrazioneManualeToCanonical(input)
      assert.equal(output.payload.postCommitTargets.shouldCreateIva, true)
      assert.equal(output.payload.vat.enabled, true)
      assert.ok(Array.isArray(output.payload.vat.rows) && output.payload.vat.rows.length > 0)
      assert.equal(output.validationResult.targetValidabili.iva.valid, true)
      assert.equal(output.payload.schemaVersion, '1.0.0')
      assert.ok(Array.isArray(output.payload.subjects))
      assert.ok(output.payload.validation)
      assert.deepEqual(input, before)
    },
  },
  {
    name: 'Parcella con ritenuta',
    run: () => {
      const input = buildWithholdingCase()
      const before = clone(input)
      const output = mapRegistrazioneManualeToCanonical(input)
      assert.equal(output.payload.postCommitTargets.shouldCreateWithholding, true)
      assert.equal(output.payload.withholding.enabled, true)
      assert.ok(output.payload.withholding.recipient)
      assert.equal(output.payload.withholding.recipient.codiceFiscale, 'RSSMRA80A01F205X')
      assert.ok(output.payload.subjects.some((subject) => subject.role === 'withholdingRecipient'))
      assert.equal(output.validationResult.targetValidabili.withholding.valid, true)
      assert.equal(output.payload.schemaVersion, '1.0.0')
      assert.ok(Array.isArray(output.payload.subjects))
      assert.ok(output.payload.validation)
      assert.deepEqual(input, before)
    },
  },
  {
    name: 'Pagamento fornitore con ledger close',
    run: () => {
      const input = buildLedgerCase()
      const before = clone(input)
      const output = mapRegistrazioneManualeToCanonical(input)
      assert.equal(output.payload.postCommitTargets.shouldCreateLedger, true)
      assert.equal(output.payload.ledger.enabled, true)
      assert.equal(output.payload.ledger.mode, 'close')
      assert.equal(output.payload.ledger.rows[0].action, 'close')
      assert.equal(output.validationResult.targetValidabili.ledger.valid, true)
      assert.equal(output.payload.schemaVersion, '1.0.0')
      assert.ok(Array.isArray(output.payload.subjects))
      assert.ok(output.payload.validation)
      assert.deepEqual(input, before)
    },
  },
  {
    name: 'Bozza incompleta',
    run: () => {
      const input = buildIncompleteCase()
      const before = clone(input)
      const output = mapRegistrazioneManualeToCanonical(input, { mode: 'commit' })
      assert.equal(output.payload.postCommitTargets.shouldCreatePrimaNota, true)
      assert.ok(output.validationResult.blocking.length > 0)
      assert.equal(output.validationResult.readiness, 'blocked')
      assert.equal(output.validationResult.targetValidabili.primaNota.valid, false)
      assert.equal(output.payload.schemaVersion, '1.0.0')
      assert.ok(Array.isArray(output.payload.subjects))
      assert.ok(output.payload.validation)
      assert.deepEqual(input, before)
    },
  },
]

let passed = 0
const failures = []

for (const testCase of cases) {
  try {
    testCase.run()
    passed += 1
    console.log(`PASS ${testCase.name}`)
  } catch (error) {
    failures.push({ name: testCase.name, error: error?.message || String(error) })
    console.log(`FAIL ${testCase.name}: ${error?.message || String(error)}`)
  }
}

console.log(`Totale: ${cases.length}`)
console.log(`Passati: ${passed}`)
console.log(`Falliti: ${failures.length}`)
if (failures.length) {
  console.log('Dettaglio fallimenti:')
  for (const failure of failures) {
    console.log(`- ${failure.name}: ${failure.error}`)
  }
  process.exitCode = 1
}
