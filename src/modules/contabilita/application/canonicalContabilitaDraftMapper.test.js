import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPrimaNotaDraftFromCanonicalContabilitaPayload } from './canonicalContabilitaDraftMapper.js'

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
      label: 'Pronto per contabilità',
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

test('prima nota draft generabile da payload canonico ordinario', () => {
  const result = buildPrimaNotaDraftFromCanonicalContabilitaPayload(makeCanonicalPayload())

  assert.equal(result.validation.status, 'ok')
  assert.equal(result.classification.code, 'ordinario')
  assert.equal(result.readiness.status, 'pronto_per_contabilita')
  assert.equal(result.pnPayload.societa_id, 'soc-1')
  assert.equal(result.pnPayload.data_registrazione, '2026-04-30')
  assert.equal(result.pnPayload.causale_id, 'caus-1')
  assert.equal(result.pnPayload.cliente_fornitore_id, 'acc-counterparty')
  assert.equal(result.pnPayload.totale_dare, 122)
  assert.equal(result.pnPayload.totale_avere, 122)
  assert.equal(result.righePayload.length, 3)
  assert.equal(result.draft.header.causale_id, 'caus-1')
  assert.equal(result.draft.rows.every((row) => row.dare >= 0 && row.avere >= 0), true)
  assert.equal(result.draft.rows.some((row) => !row.conto_id), false)
})

test('draft blocca importi negativi o righe vuote', () => {
  const result = buildPrimaNotaDraftFromCanonicalContabilitaPayload(makeCanonicalPayload({
    accounting: {
      causaleContabile: {
        id: 'caus-1',
        code: 'FF',
        description: 'Fattura fornitore',
      },
      rows: [
        { accountId: 'acc-cost', description: 'Costo', debit: -10, credit: 0 },
        { accountId: '', description: '', debit: 0, credit: 0 },
      ],
      totals: {
        debit: -10,
        credit: 0,
      },
      isBalanced: false,
    },
    document: {
      ...makeCanonicalPayload().document,
      totals: {
        taxable: 100,
        vat: 22,
        gross: 122,
      },
    },
    validation: {
      status: 'blocked',
      blockers: ['Dare/Avere non quadrati'],
      warnings: [],
    },
    readiness: {
      status: 'incompleto',
      label: 'Incompleto',
    },
  }))

  assert.equal(result.validation.status, 'blocked')
  assert.equal(result.validation.blockers.length > 0, true)
  assert.equal(result.validation.blockers.includes('riga 1: importo negativo'), true)
  assert.equal(result.validation.blockers.includes('riga 2: conto mancante'), true)
  assert.equal(result.validation.blockers.includes('riga 2: importo assente'), true)
})
