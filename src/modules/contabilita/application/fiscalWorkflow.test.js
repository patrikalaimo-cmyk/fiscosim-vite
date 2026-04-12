import test from 'node:test'
import assert from 'node:assert/strict'

import { buildParcellaDecision } from './parcellaDecisionEngine.js'
import { applyPaymentToParcellaWorkflow, buildRegistrationWorkflowState } from './parcellaWorkflowState.js'
import { buildCuRowsFromPayments } from './paymentDrivenFiscalViews.js'
import { classifyPercipienteOutcome, inferPercipienteCandidate } from './percipientiInference.js'

test('forfettario conflict keeps trusted percipiente defaults and emits warning', () => {
  const percipiente = {
    id: 'perc-1',
    causale_prevalente: 'A',
    regime_fiscale: 'ordinario',
    soggetto_cu: true,
    soggetto_770: true,
    soggetto_ritenuta: true,
    aliquota_ritenuta: 20,
    codice_fiscale: 'RSSMRA80A01H501U',
  }
  const documentRow = {
    tipo_documento: 'fattura_passiva',
    imponibile: 1000,
    totale: 1000,
    dati_estratti: {
      riepilogo_iva: [{ natura: 'N2.2' }],
      linee: [{ descrizione: 'Compenso professionale regime forfettario' }],
    },
  }

  const decision = buildParcellaDecision({ percipiente, documentRow, draft: {} })

  assert.equal(decision.proposal.registrationCausale, 'RP')
  assert.equal(decision.proposal.codiceSommeNonSoggette, '')
  assert.match(decision.warnings.join(' '), /forfettario/i)
})

test("diritti d'autore without age requires manual confirmation", () => {
  const percipiente = {
    id: 'perc-2',
    causale_prevalente: 'B',
    codice_fiscale: 'RSSMRA80A01H501U',
    soggetto_cu: true,
    soggetto_770: true,
  }
  const documentRow = {
    tipo_documento: 'fattura_passiva',
    imponibile: 1000,
    totale: 1000,
    dati_estratti: {
      linee: [{ descrizione: "Compensi per diritti d'autore" }],
    },
  }

  const decision = buildParcellaDecision({ percipiente, documentRow, draft: {} })

  assert.equal(decision.proposal.deductionRule, 'Da confermare manualmente')
  assert.equal(decision.proposal.quotaNonSoggetta, 0)
  assert.match(decision.warnings.join(' '), /eta non disponibile/i)
})

test('partial payments allocate accounting, withholding and non-subject amounts proportionally', () => {
  const workflow = buildRegistrationWorkflowState({
    totale: 1000,
    imponibile: 1000,
    dati_estratti: {
      parcella_confirmation: {
        finalValues: {
          registrationCausale: 'RP',
          paymentCausale: 'PF80',
          imponibileCompenso: 1000,
          quotaNonSoggetta: 200,
          withholdingAmount: 160,
          downstream: {
            updateCu: true,
            update770: true,
            updateWithholdingSchedule: true,
          },
        },
      },
    },
  })

  const first = applyPaymentToParcellaWorkflow(workflow, {
    paymentId: 'pay-1',
    paymentDate: '2026-05-10',
    paymentCausale: 'PF80',
    taxableBasePaid: 500,
    accountingPaid: 420,
    withholdingPaid: 80,
  })

  assert.equal(first.status, 'partial')
  assert.equal(first.taxableBasePaid, 500)
  assert.equal(first.nonSubjectPaid, 100)
  assert.equal(first.withholdingPayableOpen, 80)

  const second = applyPaymentToParcellaWorkflow(first, {
    paymentId: 'pay-2',
    paymentDate: '2026-06-10',
    paymentCausale: 'PF80',
    taxableBasePaid: 500,
    accountingPaid: 420,
    withholdingPaid: 80,
  })

  assert.equal(second.status, 'closed')
  assert.equal(second.nonSubjectPaid, 200)
  assert.equal(second.cuRelevantPaid, 1000)
  assert.equal(second.withholdingSchedulePaid, 160)
})

test('CU rows follow payment year, not registration year', () => {
  const documentRow = {
    id: 'doc-1',
    societa_id: 'soc-1',
    numero_documento: 'PAR-2025-01',
    soggetto_denominazione: 'Studio Rossi',
    soggetto_cf: 'RSSMRA80A01H501U',
    soggetto_piva: '12345678901',
    dati_estratti: {
      parcella_confirmation: {
        finalValues: {
          causaleReddituale: 'A',
          codiceSommeNonSoggette: '',
          quotaNonSoggetta: 0,
          downstream: {
            updateCu: true,
            update770: true,
            updateWithholdingSchedule: true,
          },
        },
      },
      parcella_workflow: {
        registrationCausale: 'RP',
        paymentCausale: 'PF80',
        excludedFromCu770Schedule: false,
      },
    },
  }

  const paymentRow = {
    id: 'pay-2026',
    societa_id: 'soc-1',
    percipiente_cf: 'RSSMRA80A01H501U',
    percipiente_denominazione: 'Studio Rossi',
    data_pagamento: '2026-01-15',
    compenso_lordo: 1000,
    ritenuta: 200,
    compenso_netto: 800,
    causale: 'A',
    note: '[FSM_PARCELLA_AUDIT]{"documentId":"doc-1","taxableBasePaid":1000,"withholdingPaid":200,"accountingPaid":800,"audit":{"status":"Confermato"}}',
  }

  const percipiente = {
    id: 'perc-1',
    societa_id: 'soc-1',
    ragione_sociale: 'Studio Rossi',
    codice_fiscale: 'RSSMRA80A01H501U',
    partita_iva: '12345678901',
    causale_prevalente: 'A',
    soggetto_cu: true,
    soggetto_770: true,
    soggetto_ritenuta: true,
    regime_fiscale: 'ordinario',
  }

  const rows2025 = buildCuRowsFromPayments({
    percipienti: [percipiente],
    documenti: [documentRow],
    payments: [paymentRow],
    year: 2025,
  })
  const rows2026 = buildCuRowsFromPayments({
    percipienti: [percipiente],
    documenti: [documentRow],
    payments: [paymentRow],
    year: 2026,
  })

  assert.equal(rows2025.length, 0)
  assert.equal(rows2026.length, 1)
  assert.equal(rows2026[0].compensi, 1000)
})

test('parcella-like wording without withholding does NOT create a percipiente (guardrail against false positives)', () => {
  const documentRow = {
    id: 'doc-poss',
    societa_id: 'soc-1',
    tipo_documento: 'fattura_passiva',
    soggetto_denominazione: 'Studio Alfa',
    soggetto_piva: '12345678901',
    soggetto_cf: '',
    dati_estratti: {
      causale: 'Parcella consulenza',
      linee: [{ descrizione: 'Compenso consulenza' }],
    },
  }
  const inferred = inferPercipienteCandidate(documentRow)
  assert.equal(inferred.relevant, true)
  const cls = classifyPercipienteOutcome({ documentRow, inferred, matchedPercipiente: null })
  assert.equal(cls.outcome, 'generic_supplier')
  assert.ok(cls.reasons.some((r) => /nessuna ritenuta/i.test(r)))
})

test('confirmed percipiente classification on strong evidence (TD06 + CF)', () => {
  const documentRow = {
    id: 'doc-conf',
    societa_id: 'soc-1',
    tipo_documento: 'fattura_passiva',
    soggetto_denominazione: 'Studio Beta',
    soggetto_piva: '12345678901',
    soggetto_cf: 'RSSMRA80A01H501U',
    dati_estratti: {
      xml_content: '<TipoDocumento>TD06</TipoDocumento>',
      causale: 'Parcella',
      linee: [{ descrizione: 'Ritenuta 20% su compenso' }],
    },
  }
  const inferred = inferPercipienteCandidate(documentRow)
  assert.equal(inferred.relevant, true)
  const cls = classifyPercipienteOutcome({ documentRow, inferred, matchedPercipiente: null })
  assert.equal(cls.outcome, 'confirmed_percipiente')
})
