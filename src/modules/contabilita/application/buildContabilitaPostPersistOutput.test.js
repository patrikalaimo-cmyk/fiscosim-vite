import test from 'node:test'
import assert from 'node:assert/strict'

process.env.VITE_SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.VITE_SUPABASE_ANON_KEY ||= 'test-anon-key'

const { buildPrimaNotaDraftFromCanonicalContabilitaPayload } = await import('./canonicalContabilitaDraftMapper.js')
const { persistPrimaNotaDraft } = await import('./persistPrimaNotaDraft.js')
const { buildContabilitaPostPersistOutput } = await import('./buildContabilitaPostPersistOutput.js')

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

function makeMockDb() {
  const state = {
    prima_nota: [],
    prima_nota_righe: [],
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
                    if (inserted) state.prima_nota.push(inserted)
                    return { data: inserted, error: null }
                  },
                }
              }
            }
          },
          delete() {
            return {
              eq() {
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

test('buildContabilitaPostPersistOutput produce output canonico per moduli successivi', async () => {
  const canonical = buildPrimaNotaDraftFromCanonicalContabilitaPayload(makeCanonicalPayload())
  const db = makeMockDb()

  const persistResult = await persistPrimaNotaDraft({
    db,
    draft: canonical,
  })

  const output = buildContabilitaPostPersistOutput({
    draft: canonical,
    persistResult,
    righeCreate: persistResult?.righeIns?.data,
  })

  assert.equal(output.primaNota.id.startsWith('pn-'), true)
  assert.equal(output.primaNota.societaId, 'soc-1')
  assert.equal(output.primaNota.dataRegistrazione, '2026-04-30')
  assert.equal(output.primaNota.dataDocumento, '2026-04-30')
  assert.equal(output.primaNota.numeroDocumento, 'A-100')
  assert.equal(output.primaNota.causale.code, 'FF')
  assert.equal(output.primaNota.totaleDare, 122)
  assert.equal(output.primaNota.totaleAvere, 122)
  assert.equal(output.primaNota.isBalanced, true)

  assert.equal(Array.isArray(output.righe), true)
  assert.equal(output.righe.length, 3)
  assert.equal(output.righe[0].contoId, 'acc-cost')
  assert.equal(output.righe[1].causaleIvaId, 'iva-22')
  assert.equal(output.righe[2].contoId, 'acc-counterparty')

  assert.equal(output.ivaCandidate.enabled, true)
  assert.equal(output.ivaCandidate.registerType, 'acquisti')
  assert.equal(output.ivaCandidate.causaleIvaId, 'iva-22')
  assert.equal(output.ivaCandidate.imponibile, 100)
  assert.equal(output.ivaCandidate.iva, 22)
  assert.equal(output.ivaCandidate.aliquota, 22)
  assert.equal(output.ivaCandidate.soggetto, 'Fornitore Demo')

  assert.equal(output.ledgerCandidate.enabled, true)
  assert.equal(output.ledgerCandidate.type, 'fornitore')
  assert.equal(output.ledgerCandidate.contoId, 'acc-counterparty')
  assert.equal(output.ledgerCandidate.importoOriginale, 122)
  assert.equal(output.ledgerCandidate.residuoIniziale, 122)

  assert.equal(Array.isArray(output.bilancioCandidate.righe), true)
  assert.equal(output.bilancioCandidate.righe.length, 3)
  assert.equal(output.bilancioCandidate.totals.isBalanced, true)

  assert.equal(output.validation.blockers.length, 0)
  assert.equal(output.validation.warnings.length >= 0, true)
})
