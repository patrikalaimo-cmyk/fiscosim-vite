import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContabilitaPayloadFromImportRow,
  buildImportContabilitaCommitPayload,
  deriveVatCompetence,
} from '../domain/buildImportContabilitaCommitPayload.js'

function makeValidInput(overrides = {}) {
  return {
    societaId: 'soc-1',
    operatorId: 'op-1',
    sourceRow: {
      id: 'row-1',
      filename: 'fattura-1.xml',
      tipo_documento: 'fattura_passiva',
    },
    sourceRowKey: 'row-key-1',
    sourceBatchId: 'batch-1',
    parsedDocument: {
      tipoDocumento: 'TD01',
      numeroDocumento: 'A-100',
      dataDocumento: '2026-04-30',
      imponibile: 100,
      iva: 22,
      totale: 122,
      rawXml: '<xml />',
      fornitore: {
        denominazione: 'Fornitore Demo',
        partitaIva: 'IT12345678901',
        codiceFiscale: 'RSSMRA80A01H501U',
      },
      flags: {
        reverseCharge: false,
        hasRitenuta: false,
        isForeign: false,
      },
    },
    registrationDate: '2026-04-30',
    counterpartyAccount: {
      id: 'acc-counterparty',
      codice: '2.01.001',
    },
    costRevenueAccount: {
      id: 'acc-cost',
      codice: '6.01.001',
    },
    causaleContabile: {
      id: 'caus-1',
      codice: 'FF',
      descrizione: 'Fattura fornitore',
    },
    primaNotaDraftRows: [
      { lineNo: 1, accountId: 'acc-cost', description: 'Costo', debit: 100, credit: 0 },
      { lineNo: 2, accountId: 'acc-iva', description: 'IVA', debit: 22, credit: 0 },
      { lineNo: 3, accountId: 'acc-counterparty', description: 'Fornitore', debit: 0, credit: 122 },
    ],
    ivaDraftRows: [
      {
        idx: 0,
        rate: 22,
        taxable: 100,
        tax: 22,
        detraibilePercent: 100,
        indetraibilePercent: 0,
        detraibileTax: 22,
        indetraibileTax: 0,
        esigibilita: 'Immediata',
        causaleIvaId: 'iva-22',
      },
    ],
    partitarioDraft: {
      enabled: true,
      type: 'fornitore',
      accountId: 'acc-counterparty',
      amount: 122,
      dueDate: '2026-05-30',
    },
    percipienteDecision: null,
    readiness: { status: 'ready' },
    automationMeta: {},
    options: {
      vatPeriodicity: 'mensile',
      nowIso: '2026-04-30T10:00:00.000Z',
    },
    ...overrides,
  }
}

test('fattura passiva ordinaria valida', () => {
  const result = buildImportContabilitaCommitPayload(makeValidInput())
  assert.equal(result.validation.status, 'ok')
  assert.equal(result.payload.document.direction, 'acquisto')
  assert.equal(result.payload.accounting.isBalanced, true)
  assert.equal(result.payload.vat.rows.length, 1)
})

test('buildContabilitaPayloadFromImportRow aggiunge classificazione e readiness', () => {
  const result = buildContabilitaPayloadFromImportRow(makeValidInput())
  assert.equal(result.validation.status, 'ok')
  assert.equal(result.classification.code, 'ordinario')
  assert.equal(result.classification.label, 'Ordinario')
  assert.equal(result.readiness.status, 'pronto_per_contabilita')
  assert.equal(result.payload.classification.code, 'ordinario')
  assert.equal(result.payload.readiness.label, 'Pronto per contabilità')
})

test('buildContabilitaPayloadFromImportRow classifica professionista senza blocco', () => {
  const result = buildContabilitaPayloadFromImportRow(makeValidInput({
    parsedDocument: {
      ...makeValidInput().parsedDocument,
      flags: {
        reverseCharge: false,
        splitPayment: false,
        hasRitenuta: false,
        isProfessional: true,
      },
    },
  }))

  assert.equal(result.classification.code, 'professionista')
  assert.equal(result.classification.label, 'Professionista')
  assert.equal(result.readiness.status, 'pronto_per_contabilita')
  assert.equal(result.payload.readiness.status, 'pronto_per_contabilita')
})

test('deriveVatCompetence 31/03 trimestrale = Q1', () => {
  const competence = deriveVatCompetence('2026-03-31', 'trimestrale')
  assert.deepEqual(competence, {
    mode: 'by_registration_date',
    periodicity: 'trimestrale',
    year: 2026,
    month: 3,
    quarter: 1,
    periodKey: '2026-Q1',
  })
})

test('deriveVatCompetence 01/04 trimestrale = Q2', () => {
  const competence = deriveVatCompetence('2026-04-01', 'trimestrale')
  assert.deepEqual(competence, {
    mode: 'by_registration_date',
    periodicity: 'trimestrale',
    year: 2026,
    month: 4,
    quarter: 2,
    periodKey: '2026-Q2',
  })
})

test('blocco se Dare/Avere non quadrano', () => {
  const input = makeValidInput({
    primaNotaDraftRows: [
      { lineNo: 1, accountId: 'acc-cost', description: 'Costo', debit: 100, credit: 0 },
      { lineNo: 2, accountId: 'acc-counterparty', description: 'Fornitore', debit: 0, credit: 90 },
    ],
  })
  const result = buildImportContabilitaCommitPayload(input)
  assert.equal(result.validation.status, 'blocked')
  assert.equal(result.validation.blockers.includes('Dare/Avere non quadrati'), true)
})

test('blocco se causale IVA manca', () => {
  const input = makeValidInput({
    ivaDraftRows: [
      {
        idx: 0,
        rate: 22,
        taxable: 100,
        tax: 22,
        detraibilePercent: 100,
        indetraibilePercent: 0,
        detraibileTax: 22,
        indetraibileTax: 0,
        esigibilita: 'Immediata',
        causaleIvaId: '',
      },
    ],
  })
  const result = buildImportContabilitaCommitPayload(input)
  assert.equal(result.validation.status, 'blocked')
  assert.equal(result.validation.blockers.includes('causale IVA mancante su riga IVA'), true)
})

test('blocco se ritenuta presente', () => {
  const input = makeValidInput({
    parsedDocument: {
      ...makeValidInput().parsedDocument,
      flags: {
        reverseCharge: false,
        hasRitenuta: true,
        isForeign: false,
      },
    },
  })
  const result = buildImportContabilitaCommitPayload(input)
  assert.equal(result.validation.status, 'blocked')
  assert.equal(result.validation.blockers.includes('ritenuta presente ma non supportata in P7C1'), true)
})

test('blocco se reverse/estero presente', () => {
  const input = makeValidInput({
    parsedDocument: {
      ...makeValidInput().parsedDocument,
      flags: {
        reverseCharge: true,
        hasRitenuta: false,
        isForeign: false,
      },
    },
  })
  const result = buildImportContabilitaCommitPayload(input)
  assert.equal(result.validation.status, 'blocked')
  assert.equal(result.validation.blockers.includes('reverse/estero presente ma non supportato in P7C1'), true)
})
