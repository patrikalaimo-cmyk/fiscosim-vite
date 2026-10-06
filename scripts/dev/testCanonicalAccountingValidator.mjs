import { createEmptyCanonicalAccountingPayload } from '../../src/modules/contabilita/canonical/canonicalAccountingPayload.defaults.js'
import { validateCanonicalAccountingPayload } from '../../src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function buildBasePayload() {
  return createEmptyCanonicalAccountingPayload({
    source: {
      module: 'registrazione_manuale',
      sourceRowId: 'row-1',
      sourceDocumentId: 'doc-1',
      sourceBatchId: 'batch-1',
      sourceMeta: { origin: 'validator-smoke' },
    },
    company: {
      societaId: 'soc-1',
      esercizioId: '2026',
      periodoIva: '2026-05',
      regime: 'ordinario',
    },
    fiscalContext: {
      dataRegistrazione: '2026-05-04',
      dataDocumento: '2026-05-04',
      competenza: '2026-05',
      periodoIva: '2026-05',
      tipoOperazione: 'acquisto',
      tipoRegistro: 'acquisti',
      regimeIva: 'ordinario',
      reverseCharge: false,
      splitPayment: false,
      ivaPerCassa: false,
      proRata: '',
      ritenutaPresente: false,
    },
    header: {
      causaleContabile: { id: 'causale-ff', codice: 'FF', descrizione: 'Fattura fornitore' },
      descrizione: 'Fattura fornitore n. 351',
      protocollo: 'PR-1',
      numeroRegistrazione: 'REG-1',
      stato: 'bozza',
      currency: 'EUR',
      totals: { dare: 122, avere: 122 },
    },
    subjects: [
      {
        role: 'primary',
        tipoSoggetto: 'fornitore',
        anagraficaId: 'an-1',
        pianoContiIdPatrimoniale: 'pc-1',
        denominazione: 'Studio Rossi',
        codiceFiscale: 'RSSMRA80A01F205X',
        partitaIva: '12345678901',
        paese: 'IT',
      },
    ],
    document: {
      numeroDocumento: '351',
      dataDocumento: '2026-05-04',
      tipoDocumento: 'FT',
      xmlOrigine: null,
      allegato: null,
      totals: {
        taxable: 100,
        vat: 22,
        gross: 122,
        netPayable: 122,
        withholding: 0,
        socialSecurity: 0,
        stampDuty: 0,
        rounding: 0,
        excluded: 0,
        currency: 'EUR',
      },
      riferimentoDocumentoOrigine: '',
    },
    accounting: {
      rows: [
        { accountId: 'c1', description: 'Costo', debit: 100, credit: 0, causaleIvaId: 'iva-1' },
        { accountId: 'c2', description: 'IVA', debit: 22, credit: 0, causaleIvaId: 'iva-1' },
      ],
      dare: 122,
      avere: 122,
      conto: '',
      descrizione: '',
      importo: 0,
      soggettoCollegato: '',
      collegamentoRigaIva: '',
      collegamentoPartitario: '',
      quadratura: { isBalanced: true, difference: 0 },
    },
    vat: {
      enabled: true,
      rows: [
        {
          taxable: 100,
          tax: 22,
          rate: 22,
          natura: '',
          causaleIvaId: 'iva-1',
          causaleIva: 'AI1W',
        },
      ],
      registerType: 'acquisti',
      sezionale: '',
      protocolNumber: '1',
      competencePeriod: '2026-05',
      causaleIvaId: 'iva-1',
      causaleIva: 'AI1W',
      aliquota: 22,
      natura: '',
      imponibile: 100,
      imposta: 22,
      detraibilitaPercent: 100,
      indetraibileAmount: 0,
      esigibilita: 'immediata',
      splitPayment: false,
      reverseCharge: false,
      reverseChargeMode: '',
      ivaPerCassa: false,
      proRata: '',
      autofattura: false,
      integrazioneEstero: false,
    },
    ledger: {
      enabled: true,
      mode: 'open',
      accountId: 'pc-1',
      subjectId: 'an-1',
      rows: [
        {
          action: 'open',
          documentRef: '351',
          openItemId: '',
          amount: 122,
          dueDate: '2026-05-30',
          paymentDate: '',
          residualAmount: 122,
        },
      ],
    },
    withholding: {
      enabled: true,
      eventType: 'document',
      recipient: {
        codiceFiscale: 'RSSMRA80A01F205X',
        denominazione: 'Studio Rossi',
      },
      rows: [
        {
          baseAmount: 100,
          rate: 20,
          amount: 20,
          netPaid: 80,
          causaleCu: 'A',
          paymentDate: '',
          dueDateF24: '',
          tributeCode: '1040',
          period: '2026-05',
        },
      ],
    },
    attachments: {
      sourceFile: { name: 'doc.pdf' },
      xml: null,
      pdf: { name: 'doc.pdf' },
      p7m: null,
      hash: 'hash-1',
      storagePath: 'storage/doc.pdf',
      metadata: { name: 'doc.pdf' },
    },
    audit: {
      createdBy: 'operator-1',
      createdAt: '2026-05-04T10:00:00Z',
      sourceModule: 'registrazione_manuale',
      sourceAction: 'draft',
      importBatch: 'batch-1',
      operatorDecisions: [{ field: 'causaleContabile', value: 'FF' }],
      warnings: [],
      overrides: [],
      reasons: [],
    },
    validation: {
      errors: [],
      warnings: [],
      blocking: [],
      readiness: 'draft',
      quadratura: { isBalanced: true, difference: 0 },
      completezzaDati: {},
      targetValidabili: {},
    },
    postCommitTargets: {
      shouldCreateDocumentiContabilita: true,
      shouldCreatePrimaNota: true,
      shouldCreateIva: true,
      shouldCreateLedger: true,
      shouldCreateWithholding: true,
      shouldCreateScadenziario: false,
      shouldAttachSourceDocument: true,
      shouldUpdateAuditTrail: true,
    },
  })
}

const cases = [
  {
    name: 'Payload null/non oggetto',
    run: () => validateCanonicalAccountingPayload(null),
    check: (result) => {
      assert(result.isValid === false, 'isValid deve essere false')
      assert(result.readiness === 'blocked', 'readiness deve essere blocked')
    },
  },
  {
    name: 'Payload default in modalità draft',
    run: () => validateCanonicalAccountingPayload(createEmptyCanonicalAccountingPayload(), { mode: 'draft' }),
    check: (result) => {
      assert(result && typeof result === 'object', 'risultato oggetto')
      assert(Array.isArray(result.errors), 'errors array')
      assert(Array.isArray(result.warnings), 'warnings array')
      assert(Array.isArray(result.blocking), 'blocking array')
      assert(result.readiness === 'draft' || result.readiness === 'blocked', 'readiness valida')
    },
  },
  {
    name: 'Source module non ammesso',
    run: () => validateCanonicalAccountingPayload({
      ...buildBasePayload(),
      source: { module: 'legacy_wrong' },
    }),
    check: (result) => {
      assert(result.blocking.some((item) => String(item).includes('source.module non ammesso')), 'blocking per source.module')
    },
  },
  {
    name: 'Commit senza società',
    run: () => validateCanonicalAccountingPayload({
      ...buildBasePayload(),
      company: { societaId: '' },
    }, { mode: 'commit' }),
    check: (result) => {
      assert(result.blocking.some((item) => String(item).includes('company.societaId mancante')), 'blocking per societaId')
    },
  },
  {
    name: 'Prima Nota target attivo e quadrata',
    run: () => validateCanonicalAccountingPayload({
      ...buildBasePayload(),
      postCommitTargets: {
        ...buildBasePayload().postCommitTargets,
        shouldCreatePrimaNota: true,
      },
    }, { mode: 'commit' }),
    check: (result) => {
      assert(result.targetValidabili.primaNota.valid === true, 'primaNota valida')
      assert(!result.blocking.some((item) => String(item).includes('accounting.quadratura')), 'nessun blocking PN')
    },
  },
  {
    name: 'Prima Nota target attivo ma non quadrata',
    run: () => validateCanonicalAccountingPayload({
      ...buildBasePayload(),
      accounting: {
        ...buildBasePayload().accounting,
        quadratura: { isBalanced: false, difference: 1 },
      },
      postCommitTargets: {
        ...buildBasePayload().postCommitTargets,
        shouldCreatePrimaNota: true,
      },
    }, { mode: 'commit' }),
    check: (result) => {
      assert(result.blocking.some((item) => String(item).includes('accounting.quadratura.isBalanced')), 'blocking quadratura')
      assert(result.targetValidabili.primaNota.valid === false, 'primaNota non valida')
    },
  },
  {
    name: 'IVA target attivo senza righe IVA',
    run: () => validateCanonicalAccountingPayload({
      ...buildBasePayload(),
      vat: {
        ...buildBasePayload().vat,
        rows: [],
        enabled: true,
      },
      postCommitTargets: {
        ...buildBasePayload().postCommitTargets,
        shouldCreateIva: true,
      },
    }, { mode: 'commit' }),
    check: (result) => {
      assert(result.blocking.some((item) => String(item).includes('vat.rows assenti')), 'blocking vat.rows')
      assert(result.targetValidabili.iva.valid === false, 'iva non valida')
    },
  },
  {
    name: 'IVA target attivo con riga minima valida',
    run: () => validateCanonicalAccountingPayload({
      ...buildBasePayload(),
      vat: {
        ...buildBasePayload().vat,
        enabled: true,
        registerType: 'acquisti',
        rows: [
          {
            taxable: 100,
            tax: 22,
            rate: 22,
            causaleIvaId: 'iva-1',
          },
        ],
      },
      postCommitTargets: {
        ...buildBasePayload().postCommitTargets,
        shouldCreateIva: true,
      },
    }, { mode: 'commit' }),
    check: (result) => {
      assert(result.targetValidabili.iva.valid === true, 'iva valida')
    },
  },
  {
    name: 'Ledger close senza riferimento partita/documento',
    run: () => validateCanonicalAccountingPayload({
      ...buildBasePayload(),
      ledger: {
        ...buildBasePayload().ledger,
        enabled: true,
        mode: 'close',
        rows: [{ action: 'close', amount: 100 }],
      },
      postCommitTargets: {
        ...buildBasePayload().postCommitTargets,
        shouldCreateLedger: true,
      },
    }, { mode: 'commit' }),
    check: (result) => {
      assert(result.blocking.some((item) => String(item).includes('openItemId/documentRef')), 'blocking ledger close')
      assert(result.targetValidabili.ledger.valid === false, 'ledger non valido')
    },
  },
  {
    name: 'Withholding payment senza paymentDate in commit',
    run: () => validateCanonicalAccountingPayload({
      ...buildBasePayload(),
      withholding: {
        ...buildBasePayload().withholding,
        enabled: true,
        eventType: 'payment',
        rows: [
          {
            baseAmount: 100,
            rate: 20,
            amount: 20,
            netPaid: 80,
            causaleCu: 'A',
            tributeCode: '1040',
            period: '2026-05',
          },
        ],
      },
      postCommitTargets: {
        ...buildBasePayload().postCommitTargets,
        shouldCreateWithholding: true,
      },
    }, { mode: 'commit' }),
    check: (result) => {
      assert(result.blocking.some((item) => String(item).includes('paymentDate')), 'blocking paymentDate')
      assert(result.targetValidabili.withholding.valid === false, 'withholding non valido')
    },
  },
  {
    name: 'Attach target attivo senza allegato',
    run: () => validateCanonicalAccountingPayload({
      ...buildBasePayload(),
      attachments: {
        sourceFile: null,
        xml: null,
        pdf: null,
        p7m: null,
        hash: '',
        storagePath: '',
        metadata: {},
      },
      postCommitTargets: {
        ...buildBasePayload().postCommitTargets,
        shouldAttachSourceDocument: true,
      },
    }, { mode: 'commit' }),
    check: (result) => {
      assert(result.blocking.some((item) => String(item).includes('attachments.source mancante')), 'blocking attachments')
      assert(result.targetValidabili.attachments.valid === false, 'attachments non validi')
    },
  },
  {
    name: 'Audit target attivo con createdAt null in draft e commit',
    run: () => ({
      draft: validateCanonicalAccountingPayload({
        ...buildBasePayload(),
        audit: {
          ...buildBasePayload().audit,
          createdAt: null,
        },
        postCommitTargets: {
          ...buildBasePayload().postCommitTargets,
          shouldUpdateAuditTrail: true,
        },
      }, { mode: 'draft' }),
      commit: validateCanonicalAccountingPayload({
        ...buildBasePayload(),
        audit: {
          ...buildBasePayload().audit,
          createdAt: null,
        },
        postCommitTargets: {
          ...buildBasePayload().postCommitTargets,
          shouldUpdateAuditTrail: true,
        },
      }, { mode: 'commit' }),
    }),
    check: (result) => {
      assert(result.draft.warnings.some((item) => String(item).includes('audit.createdAt mancante')), 'warning draft audit')
      assert(result.commit.blocking.some((item) => String(item).includes('audit.createdAt mancante')), 'blocking commit audit')
    },
  },
]

let passed = 0
const failures = []

for (const testCase of cases) {
  try {
    const result = testCase.run()
    testCase.check(result)
    passed += 1
    console.log(`PASS ${testCase.name}`)
  } catch (error) {
    failures.push({ name: testCase.name, reason: error?.message || String(error) })
    console.log(`FAIL ${testCase.name}: ${error?.message || String(error)}`)
  }
}

console.log('')
console.log(`Test totali: ${cases.length}`)
console.log(`Test passati: ${passed}`)
console.log(`Test falliti: ${failures.length}`)

if (failures.length) {
  console.log('Fallimenti:')
  for (const failure of failures) {
    console.log(`- ${failure.name}: ${failure.reason}`)
  }
  process.exitCode = 1
} else {
  console.log('Tutti i casi sono passati.')
  process.exitCode = 0
}
