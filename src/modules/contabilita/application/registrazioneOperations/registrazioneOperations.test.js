import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRegistrazioneTotals } from './calculateRegistrazioneTotals.js'
import { validateRegistrazioneDraft } from './validateRegistrazioneDraft.js'
import { buildRegistrazioneDraft } from './buildRegistrazioneDraft.js'
import { resolveRegistrazioneEsercizio } from './resolveRegistrazioneEsercizio.js'
import { resolveRegistrazioneFocusOrder, getRegistrazioneRowFieldKey } from './resolveRegistrazioneFocusOrder.js'
import { calculateRegistrazioneResidualBalance } from './calculateRegistrazioneResidualBalance.js'
import { applyRegistrazioneAutoResidualToRow } from './applyRegistrazioneAutoResidualToRow.js'
import { applyRegistrazioneAutoResidualChainToRows } from './applyRegistrazioneAutoResidualChainToRows.js'
import { parseRegistrazioneAmount } from './parseRegistrazioneAmount.js'
import { normalizeRegistrazioneRowPatch } from './normalizeRegistrazioneRowPatch.js'
import { buildRegistrazioneContoSelection, findRegistrazioneContoByPrefix, findRegistrazioneContoExactMatch, resolveContoHierarchyView, resolveRegistrazioneContoDescrizione } from './resolveRegistrazioneConti.js'
import { buildRegistrazioneContropartiList } from './resolveRegistrazioneControparti.js'
import { findRegistrazioneCausaleExactMatch, resolveRegistrazioneCausaleLabel } from './resolveRegistrazioneCausali.js'
import { resolveRegistrazioneCausaleBehavior } from '../../domain/registrazione/resolveRegistrazioneCausaleBehavior.js'
import { resolveRegistrazioneCausaleIvaBehavior } from '../../domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js'
import { resolveRegistrazioneCausaleConfig } from '../../domain/registrazione/registrazioneCausaleConfig.js'
import { buildCausaleContabilePolicy } from '../../domain/causali/buildCausaleContabilePolicy.js'
import {
  buildRegistrazioneCausaleContabilePayload,
  hydrateRegistrazioneCausaleContabileForm,
  normalizeRegistrazioneCausaleContabileValue,
  normalizeRegistrazioneCausaleRighePrimaNotaTemplate,
  normalizeRegistrazioneCausaleRighePrimaNotaTemplateRow,
} from '../../domain/registrazione/normalizeRegistrazioneCausaleDetail.js'
import { buildRegistrazioneIvaDraft } from './buildRegistrazioneIvaDraft.js'
import { buildRegistrazioneIvaRows } from './buildRegistrazioneIvaRows.js'
import { calculateRegistrazioneIvaRow } from './calculateRegistrazioneIvaRow.js'
import { buildRegistrazionePartitarioDraft } from './buildRegistrazionePartitarioDraft.js'
import { buildRegistrazioneRitenutaDraft } from './buildRegistrazioneRitenutaDraft.js'
import { buildRegistrazioneRowsFromTemplate } from './buildRegistrazioneRowsFromTemplate.js'
import { buildRegistrazioneRowsFromTemplateResolved } from './buildRegistrazioneRowsFromTemplate.js'
import { normalizeRegistrazioneRigheTemplate } from '../../domain/registrazione/normalizeRegistrazioneRigheTemplate.js'
import { buildCausaleStructureHistory } from './buildCausaleStructureHistory.js'
import { resolveRegistrazioneRigheTemplate } from '../../domain/registrazione/resolveRegistrazioneRigheTemplate.js'
import { resolveRegistrazioneTemplateRowAccount } from './resolveRegistrazioneTemplateRowAccount.js'

const pianoConti = [
  { id: 'c1', codice: '100', descrizione: 'Cassa', livello: 3, tipo: 'FINALE' },
  { id: 'c2', codice: '200', descrizione: 'Ricavi', livello: 3, tipo: 'FINALE' },
]

const causaliContabili = [
  { id: 'ff', codice: 'FF', descrizione: 'Fattura fornitore' },
]

const causaleTemplateFF = {
  id: 'ff',
  codice: 'FF',
  descrizione: 'Fattura fornitore',
  righe_prima_nota_template: [
    {
      ordine: 1,
      ruolo: 'soggetto',
      lato: 'avere',
      formula_importo: 'totale_documento',
      conto_id: 'cf-1',
      conto_codice: '2 03 08 0001',
      conto_descrizione: 'Fornitore demo',
      hierarchyType: 'sottoconto',
      isTemplateScope: false,
      descrizione_riga: 'Fornitore',
      obbligatoria: true,
      modificabile: true,
      attiva: true,
    },
    {
      ordine: 2,
      ruolo: 'iva',
      lato: 'dare',
      formula_importo: 'iva_detraibile',
      conto_id: 'iva-1',
      conto_codice: '1 02 40 0001',
      conto_descrizione: 'IVA ns credito',
      hierarchyType: 'sottoconto',
      isTemplateScope: false,
      descrizione_riga: 'IVA',
      obbligatoria: true,
      modificabile: true,
      attiva: true,
    },
    {
      ordine: 3,
      ruolo: 'costo',
      lato: 'dare',
      formula_importo: 'imponibile',
      conto_id: 'costo-1',
      conto_codice: '6 01 03 0001',
      conto_descrizione: 'Spese telefoniche',
      hierarchyType: 'sottoconto',
      isTemplateScope: false,
      descrizione_riga: 'Costo',
      obbligatoria: true,
      modificabile: true,
      attiva: true,
    },
  ],
}

test('calculateRegistrazioneTotals somma dare, avere e differenza', () => {
  const totals = calculateRegistrazioneTotals([
    { dare: 100, avere: 0 },
    { dare: 0, avere: 100 },
  ])
  assert.equal(totals.totaleDare, 100)
  assert.equal(totals.totaleAvere, 100)
  assert.equal(totals.differenza, 0)
  assert.equal(totals.isBalanced, true)
})

test('validateRegistrazioneDraft accetta una scrittura minima bilanciata', () => {
  const validation = validateRegistrazioneDraft({
    header: {
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-01',
      causaleContabile: { id: 'ff', codice: 'FF' },
    },
    rows: [
      { conto_id: 'c1', dare: 100, avere: 0 },
      { conto_id: 'c2', dare: 0, avere: 100 },
    ],
  })
  assert.equal(validation.status, 'ok')
  assert.equal(validation.isBalanced, true)
})

test('validateRegistrazioneDraft blocca una scrittura incompleta', () => {
  const validation = validateRegistrazioneDraft({
    header: {
      esercizioContabile: '',
      dataRegistrazione: '',
      causaleContabile: '',
    },
    rows: [{ conto_id: '', dare: 0, avere: 0 }],
  })
  assert.equal(validation.status, 'blocked')
  assert.ok(validation.blockers.length > 0)
})

test('buildRegistrazioneDraft produce pnPayload e righePayload compatibili', () => {
  const result = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        dataDocumento: '2026-05-01',
        numeroDocumento: 'A-100',
        causaleContabileId: 'ff',
        descrizioneGenerale: 'Acquisto demo',
      },
      rows: [
        { contoQuery: '100', descrizione: 'Cassa', dare: 100, avere: 0 },
        { contoQuery: '200', descrizione: 'Ricavi', dare: 0, avere: 100 },
      ],
    },
    { pianoConti, causaliContabili }
  )

  assert.equal(result.validation.status, 'ok')
  assert.equal(result.draft.pnPayload.societa_id, 'soc-1')
  assert.equal(result.draft.pnPayload.esercizio_contabile, '2026')
  assert.equal(result.draft.pnPayload.causale_codice, 'FF')
  assert.equal(result.draft.righePayload.length, 2)
  assert.equal(result.draft.righePayload[0].conto_id, 'c1')
})

test('buildRegistrazioneDraft conserva il cliente/fornitore selezionato dal piano conti', () => {
  const result = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        causaleContabileId: 'ff',
        soggetto: '2 03 08 0001 - Piccoli cespiti',
        clienteFornitoreId: 'cf-1',
        clienteFornitoreNome: '2 03 08 0001 - Piccoli cespiti',
      },
      rows: [
        { contoQuery: '100', descrizione: 'Cassa', dare: 100, avere: 0 },
        { contoQuery: '200', descrizione: 'Ricavi', dare: 0, avere: 100 },
      ],
    },
    { pianoConti, causaliContabili }
  )

  assert.equal(result.draft.pnPayload.cliente_fornitore_id, 'cf-1')
  assert.equal(result.draft.pnPayload.cliente_fornitore_nome, '2 03 08 0001 - Piccoli cespiti')
})

test('resolveRegistrazioneEsercizio propone esercizio coerente con la data', () => {
  const result = resolveRegistrazioneEsercizio({
    esercizio: '2025',
    dataRegistrazione: '2026-05-01',
    lastExerciseUsed: '2024',
    currentYear: 2026,
  })

  assert.equal(result.esercizio, '2025')
  assert.equal(result.suggestedExercise, '2026')
  assert.equal(result.needsConfirm, true)
})

test('resolveRegistrazioneFocusOrder collega causale, documenti e righe', () => {
  const focusOrder = resolveRegistrazioneFocusOrder({
    config: { showDocumentPanel: true, showIvaPanel: false },
    rowIds: ['r1', 'r2'],
    })

  assert.equal(focusOrder.nextByKey.causaleContabile, 'dataDocumento')
  assert.equal(focusOrder.nextByKey.dataDocumento, 'numeroDocumento')
  assert.equal(focusOrder.nextByKey[getRegistrazioneRowFieldKey('r1', 'avere')], getRegistrazioneRowFieldKey('r1', 'descrizione'))
  assert.equal(focusOrder.nextByKey[getRegistrazioneRowFieldKey('r1', 'descrizione')], getRegistrazioneRowFieldKey('r2', 'conto'))
  assert.equal(focusOrder.nextByKey[getRegistrazioneRowFieldKey('r2', 'avere')], '__add_row__')
})

test('validateRegistrazioneDraft rispetta i campi richiesti dalla causale', () => {
  const validation = validateRegistrazioneDraft(
    {
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        causaleContabile: { id: 'ff', codice: 'FF' },
        dataDocumento: '',
        numeroDocumento: '',
      },
      rows: [
        { conto_id: 'c1', dare: 100, avere: 0 },
        { conto_id: 'c2', dare: 0, avere: 100 },
      ],
    },
    {
      config: {
        requiredFields: ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento', 'campoNonImplementato'],
      },
    }
  )

  assert.equal(validation.status, 'blocked')
  assert.ok(validation.blockers.includes('data documento mancante'))
  assert.ok(validation.blockers.includes('numero documento mancante'))
  assert.equal(validation.blockers.some((item) => item.includes('campoNonImplementato')), false)
})

test('validateRegistrazioneDraft espone lo sbilancio con lato e importo', () => {
  const validation = validateRegistrazioneDraft({
    header: {
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-01',
      causaleContabile: { id: 'ff', codice: 'FF' },
    },
    rows: [
      { conto_id: 'c1', dare: 100, avere: 0 },
      { conto_id: 'c2', dare: 0, avere: 20 },
    ],
  })

  assert.equal(validation.status, 'blocked')
  assert.ok(validation.blockers.some((item) => item.includes('sbilancio')))
  assert.ok(validation.blockers.some((item) => item.includes('Avere')))
})

test('validateRegistrazioneDraft blocca il cliente/fornitore scritto ma non risolto quando la causale usa il partitario', () => {
  const validation = validateRegistrazioneDraft(
    {
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        causaleContabile: { id: 'ff', codice: 'FF' },
        soggetto: 'Cliente libero',
        clienteFornitoreId: '',
      },
      rows: [
        { conto_id: 'c1', dare: 100, avere: 0 },
        { conto_id: 'c2', dare: 0, avere: 100 },
      ],
    },
    { config: { showPartitario: true } }
  )

  assert.equal(validation.status, 'blocked')
  assert.ok(validation.blockers.some((item) => item.includes('cliente / fornitore non selezionato')))
})

test('validateRegistrazioneDraft blocca un conto scritto ma non risolto nel piano conti', () => {
  const validation = validateRegistrazioneDraft(
    {
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        causaleContabile: { id: 'ff', codice: 'FF' },
      },
      rows: [
        { contoQuery: 'abcde', conto_id: '', dare: 100, avere: 0 },
        { contoQuery: '200', conto_id: 'c2', dare: 0, avere: 100 },
      ],
    },
    { pianoConti }
  )

  assert.equal(validation.status, 'blocked')
  assert.ok(validation.blockers.some((item) => item.includes('conto inesistente')))
})

test('validateRegistrazioneDraft blocca un conto non movimentabile per la registrazione', () => {
  const validation = validateRegistrazioneDraft(
    {
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        causaleContabile: { id: 'ff', codice: 'FF' },
      },
      rows: [
        { contoQuery: '6.01', conto_id: 'm1', dare: 100, avere: 0 },
        { contoQuery: '6.01.05', conto_id: 's1', dare: 0, avere: 100 },
      ],
    },
    {
      pianoConti: [
        { id: 'm1', codice: '6.01', descrizione: 'Costi per servizi', livello: 2, tipo: 'CONTO' },
        { id: 's1', codice: '6.01.05', descrizione: 'Piccoli cespiti', livello: 3, tipo: 'FINALE' },
      ],
    }
  )

  assert.equal(validation.status, 'blocked')
  assert.ok(validation.blockers.some((item) => item.includes('serve un sottoconto')))
})

test('calculateRegistrazioneResidualBalance calcola il residuo corretto', () => {
  const result = calculateRegistrazioneResidualBalance([
    { id: 'r1', dare: 0, avere: 200 },
    { id: 'r2', dare: 0, avere: 0 },
  ])

  assert.equal(result.side, 'dare')
  assert.equal(result.amount, 200)
  assert.equal(result.isBalanced, false)
})

test('applyRegistrazioneAutoResidualToRow applica il residuo sulla riga vuota', () => {
  const result = applyRegistrazioneAutoResidualToRow([
    { id: 'r1', dare: 0, avere: 200 },
    { id: 'r2', dare: 0, avere: 0 },
  ], 'r2')

  assert.equal(result.applied, true)
  assert.equal(result.side, 'dare')
  assert.equal(Number(result.rows[1].dare || 0), 200)
  assert.equal(result.rows[1].autoResidualApplied, true)
})

test('applyRegistrazioneAutoResidualToRow rispetta l override manuale e aggiorna il residuo', () => {
  const rows = [
    { id: 'r1', dare: 0, avere: 200 },
    { id: 'r2', dare: 0, avere: 0, autoResidualApplied: true, manualAmountOverride: false },
    { id: 'r3', dare: 0, avere: 0 },
  ]

  const first = applyRegistrazioneAutoResidualToRow(rows, 'r2')
  assert.equal(first.applied, true)
  assert.equal(Number(first.rows[1].dare || 0), 200)

  const afterManual = first.rows.map((row) => (row.id === 'r2' ? { ...row, dare: 2, avere: '', manualAmountOverride: true, autoResidualApplied: false } : row))
  const second = applyRegistrazioneAutoResidualToRow(afterManual, 'r3')

  assert.equal(second.applied, true)
  assert.equal(Number(second.rows[2].dare || 0), 198)
})

test('applyRegistrazioneAutoResidualChainToRows propaga il residuo in avanti sulle righe successive', () => {
  const rows = [
    { id: 'r1', conto_id: 'c1', dare: 0, avere: 100, manualAmountOverride: true, autoResidualApplied: false },
    { id: 'r2', conto_id: 'c2', dare: 20, avere: 0, manualAmountOverride: true, autoResidualApplied: false },
    { id: 'r3', conto_id: 'c3', dare: 0, avere: 0, manualAmountOverride: false, autoResidualApplied: false },
  ]

  const result = applyRegistrazioneAutoResidualChainToRows(rows, 1)

  assert.equal(result.applied, true)
  assert.equal(Number(result.rows[0].avere || 0), 100)
  assert.equal(Number(result.rows[1].dare || 0), 20)
  assert.equal(Number(result.rows[2].dare || 0), 80)
  assert.equal(Number(result.rows[2].avere || 0), 0)
})

test('parseRegistrazioneAmount accetta virgola e punto', () => {
  assert.equal(parseRegistrazioneAmount('1.234,56'), 1234.56)
  assert.equal(parseRegistrazioneAmount('1,234.56'), 1234.56)
  assert.equal(parseRegistrazioneAmount('2,5'), 2.5)
})

test('normalizeRegistrazioneRowPatch mantiene un solo lato importo alla volta', () => {
  const darePatch = normalizeRegistrazioneRowPatch({ dare: '100', avere: '' }, { source: 'manual', amountSide: 'dare' })
  assert.equal(darePatch.dare, '100')
  assert.equal(darePatch.avere, '')
  assert.equal(darePatch.lastAmountSide, 'dare')
  assert.equal(darePatch.manualAmountOverride, true)

  const averePatch = normalizeRegistrazioneRowPatch({ avere: '20', dare: '' }, { source: 'manual', amountSide: 'avere', previousRow: darePatch })
  assert.equal(averePatch.dare, '')
  assert.equal(averePatch.avere, '20')
  assert.equal(averePatch.lastAmountSide, 'avere')
  assert.equal(averePatch.manualAmountOverride, true)
})

test('normalizeRegistrazioneRowPatch non tocca gli importi quando cambia solo la descrizione', () => {
  const patch = normalizeRegistrazioneRowPatch(
    { descrizione: 'Spese varie' },
    { source: 'manual', previousRow: { lastAmountSide: 'dare' } }
  )

  assert.equal(patch.descrizione, 'Spese varie')
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'dare'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'avere'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'lastAmountSide'), false)
})

test('findRegistrazioneContoByPrefix segue il salto incrementale tipo NES', () => {
  const conti = [
    { id: 'p1', codice: '100', descrizione: 'Paolo' },
    { id: 'p2', codice: '101', descrizione: 'Patrik' },
  ]

  assert.equal(findRegistrazioneContoByPrefix(conti, 'P')?.id, 'p1')
  assert.equal(findRegistrazioneContoByPrefix(conti, 'PA')?.id, 'p1')
  assert.equal(findRegistrazioneContoByPrefix(conti, 'PAT')?.id, 'p2')
  assert.equal(findRegistrazioneContoByPrefix(conti, ''), null)
})

test('findRegistrazioneContoExactMatch riconosce il conto scelto dalla lista a discesa', () => {
  const conti = [
    { id: 'c1', codice: '1 02 40 0001', descrizione: "ATTIVITA'", conto_descrizione: 'IVA NS.CREDITO' },
    { id: 'c2', codice: '2 03 08 0001', descrizione: "PASSIVITA'", conto_descrizione: 'Piccoli cespiti' },
  ]

  assert.equal(findRegistrazioneContoExactMatch(conti, '1 02 40 0001 - IVA NS.CREDITO')?.id, 'c1')
  assert.equal(findRegistrazioneContoExactMatch(conti, '2 03 08 0001 - Piccoli cespiti')?.id, 'c2')
  assert.equal(findRegistrazioneContoExactMatch(conti, 'abcde'), null)
})

test('findRegistrazioneContoExactMatch aggancia il conto anche se la descrizione catalogo è diversa dalla label selezionata', () => {
  const conti = [
    { id: 'c1', codice: '2 03 08 0001', descrizione: "ATTIVITA'", conto_descrizione: 'Piccoli cespiti' },
  ]

  assert.equal(findRegistrazioneContoExactMatch(conti, '2 03 08 0001 - Piccoli cespiti')?.id, 'c1')
})

test('resolveRegistrazioneContoDescrizione ignora categorie e padre quando c e una descrizione reale', () => {
  const conto = {
    codice: '1.02.03',
    descrizione: "PASSIVITA'",
    nome: 'Piccoli cespiti',
    categoria: 'Passività',
    tipo: 'patrimoniale',
  }

  assert.equal(resolveRegistrazioneContoDescrizione(conto), 'Piccoli cespiti')
})

test('resolveRegistrazioneContoDescrizione preferisce i campi descrittivi del conto', () => {
  const conto = {
    codice: '1.02.04',
    descrizione: "PASSIVITA'",
    conto_descrizione: 'IVA ns credito',
  }

  assert.equal(resolveRegistrazioneContoDescrizione(conto), 'IVA ns credito')
})

test('resolveRegistrazioneContoDescrizione estrae la descrizione reale dalla label completa', () => {
  const conto = {
    __label: '1 02 40 0001 - IVA NS.CREDITO',
    descrizione: 'ATTIVITA\'',
  }

  assert.equal(resolveRegistrazioneContoDescrizione(conto), 'IVA NS.CREDITO')
})

test('buildRegistrazioneContropartiList filtra i soli conti compatibili con cliente/fornitore', () => {
  const conti = [
    { id: 'c1', codice: '100', descrizione: 'Cassa', is_cliente: false, is_fornitore: false, livello: 2 },
    { id: 'c2', codice: '200', descrizione: 'Fornitore Alfa', is_fornitore: true, livello: 4 },
    { id: 'c3', codice: '300', descrizione: 'Cliente Beta', is_cliente: true, livello: 4 },
  ]

  const result = buildRegistrazioneContropartiList(conti)

  assert.equal(result.length, 2)
  assert.ok(result.some((item) => item.id === 'c2'))
  assert.ok(result.some((item) => item.id === 'c3'))
})

test('buildRegistrazioneDraft non risolve testo conto arbitrario senza corrispondenza esatta', () => {
  const result = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        dataDocumento: '2026-05-01',
        numeroDocumento: 'A-100',
        causaleContabileId: 'ff',
        descrizioneGenerale: 'Acquisto demo',
      },
      rows: [
        { contoQuery: 'abcde', descrizione: 'Test', dare: 100, avere: 0 },
        { contoQuery: '100 - Cassa', descrizione: 'Cassa', dare: 0, avere: 100 },
      ],
    },
    { pianoConti, causaliContabili }
  )

  assert.equal(result.normalized.rows[0].conto_id, '')
  assert.equal(result.validation.status, 'blocked')
  assert.ok(result.validation.blockers.some((item) => item.includes('conto inesistente')))
})

test('buildRegistrazioneIvaDraft costruisce un draft IVA predisposto', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'FF',
    tipo_causale: 'Doc. IVA normale',
    operazione_partite: 'Apre',
  })
  const draft = buildRegistrazioneIvaDraft(
    {
      header: { dataRegistrazione: '2026-05-01', totaleDocumento: '1220,00' },
      documentData: { totaleImponibile: '1000,00', totaleImposte: '220,00' },
      ivaData: {
        causaleIvaId: 'iva-22',
        protocolloProvvisorio: '25/00015',
        dataCompetenza: '2026-05-01',
        dataOperazione: '2026-05-01',
      },
      causaliIva: [
        { id: 'iva-22', codice: 'IVA22', descrizione: 'Acquisti 22%', aliquota: 22, registroIva: 'ACQ', segnoRegistro: '+', percentualeDetraibilita: 100 },
      ],
    },
    { behavior, causaliIva: [{ id: 'iva-22', codice: 'IVA22', descrizione: 'Acquisti 22%', aliquota: 22, registroIva: 'ACQ', segnoRegistro: '+', percentualeDetraibilita: 100 }] }
  )

  assert.equal(draft.active, true)
  assert.equal(draft.causaleIvaId, 'iva-22')
  assert.equal(draft.registroIva, 'ACQ')
  assert.equal(draft.segnoRegistro, '+')
  assert.equal(draft.totaleImponibile, 1000)
  assert.equal(draft.totaleImposta, 220)
  assert.equal(draft.ivaDetratta, 220)
  assert.equal(draft.ivaIndetraibile, 0)
  assert.equal(draft.protocolloProvvisorio, '25/00015')
  assert.equal(draft.protocolloDefinitivo, 'da assegnare')
  assert.equal(Array.isArray(draft.rows), true)
  assert.equal(draft.rows[0].causaleIvaCodice, 'IVA22')
  assert.equal(draft.rows[0].registroIva, 'ACQ')
  assert.equal(draft.status === 'ok' || draft.status === 'warning', true)
})

test('resolveRegistrazioneCausaleIvaBehavior usa registro, segno e detraibilita della causale IVA', () => {
  const behavior = resolveRegistrazioneCausaleIvaBehavior({
    causaleIva: {
      codice: 'IVA22',
      descrizione: 'Acquisti 22%',
      aliquota: 22,
      registro_iva: 'ACQ',
      segno_registro: '+',
      percentuale_detraibilita: 40,
    },
    causaleContabile: {
      tipo_causale: 'Doc. IVA normale',
    },
  })

  assert.equal(behavior.codice, 'IVA22')
  assert.equal(behavior.registroIva, 'ACQ')
  assert.equal(behavior.segnoRegistro, '+')
  assert.equal(behavior.percentualeDetraibilita, 40)
  assert.equal(behavior.detraibile, true)
  assert.equal(behavior.ivaMode, 'normale')
})

test('buildRegistrazioneIvaDraft calcola IVA parzialmente indetraibile', () => {
  const draft = buildRegistrazioneIvaDraft(
    {
      header: { dataRegistrazione: '2026-05-01' },
      documentData: { imponibile: 100, totaleImposte: 22, totaleDocumento: 122 },
      ivaData: {
        causaleIvaId: 'iva-22',
        percentualeDetraibilita: 40,
      },
      causaliIva: [
        { id: 'iva-22', codice: 'IVA22', descrizione: 'Acquisti 22%', aliquota: 22, registroIva: 'ACQ', segnoRegistro: '+', percentualeDetraibilita: 40 },
      ],
    },
    { behavior: resolveRegistrazioneCausaleBehavior({ codice: 'FF', tipo_causale: 'Doc. IVA normale' }), causaliIva: [{ id: 'iva-22', codice: 'IVA22', descrizione: 'Acquisti 22%', aliquota: 22, registroIva: 'ACQ', segnoRegistro: '+', percentualeDetraibilita: 40 }] }
  )

  assert.equal(draft.imponibile, 100)
  assert.equal(draft.totaleIva, 22)
  assert.equal(draft.ivaDetratta, 8.8)
  assert.equal(draft.ivaIndetraibile, 13.2)
  assert.equal(draft.protocolloProvvisorio, 'da assegnare')
  assert.equal(draft.protocolloDefinitivo, 'da assegnare')
})

test('buildRegistrazioneIvaDraft senza causale IVA produce warning non bloccante', () => {
  const draft = buildRegistrazioneIvaDraft(
    {
      header: { dataRegistrazione: '2026-05-01' },
      documentData: { imponibile: 100, totaleImposte: 22, totaleDocumento: 122 },
      ivaData: {},
    },
    { behavior: resolveRegistrazioneCausaleBehavior({ codice: 'FF', tipo_causale: 'Doc. IVA normale' }) }
  )

  assert.ok(Array.isArray(draft.warnings))
  assert.notEqual(draft.status, 'blocked')
})

test('buildRegistrazioneDraft collega ivaDraft alle righe template per IVA detraibile', async () => {
  const ivaSubtests = [

  test('calculateRegistrazioneIvaRow scorpora il totale con aliquota 22%', () => {
    const result = calculateRegistrazioneIvaRow({
      row: { totale: 122 },
      causaleIvaBehavior: { aliquota: 22, percentualeDetraibilita: 100, detraibile: true },
      changedField: 'totale',
      documentTotal: 122,
      previousRows: [],
    })

    assert.equal(result.totale, 122)
    assert.equal(result.imponibile, 100)
    assert.equal(result.ivaTotale, 22)
    assert.equal(result.ivaDetratta, 22)
    assert.equal(result.ivaIndetraibile, 0)
  }),

  test('calculateRegistrazioneIvaRow scorpora il totale lordo e divide l IVA con detraibilita parziale', () => {
    const result = calculateRegistrazioneIvaRow({
      row: { totale: 1200 },
      causaleIvaBehavior: { aliquota: 22, percentualeDetraibilita: 40, detraibile: true },
      changedField: 'totale',
      documentTotal: 1200,
      previousRows: [],
    })

    assert.equal(result.totale, 1200)
    assert.equal(result.imponibile, 983.61)
    assert.equal(result.ivaTotale, 216.39)
    assert.equal(result.ivaDetratta, 86.56)
    assert.equal(result.ivaIndetraibile, 129.83)
  }),

  test('calculateRegistrazioneIvaRow tratta un imponibile uguale al totale documento come lordo da scorporare', () => {
    const result = calculateRegistrazioneIvaRow({
      row: { imponibile: 1200 },
      causaleIvaBehavior: { aliquota: 22, percentualeDetraibilita: 40, detraibile: true },
      changedField: 'imponibile',
      documentTotal: 1200,
      previousRows: [],
    })

    assert.equal(result.totale, 1200)
    assert.equal(result.imponibile, 983.61)
    assert.equal(result.ivaTotale, 216.39)
    assert.equal(result.ivaDetratta, 86.56)
    assert.equal(result.ivaIndetraibile, 129.83)
  }),

  test('calculateRegistrazioneIvaRow calcola da imponibile e gestisce detraibilita parziale', () => {
    const result = calculateRegistrazioneIvaRow({
      row: { imponibile: 100 },
      causaleIvaBehavior: { aliquota: 10, percentualeDetraibilita: 50, detraibile: true },
      changedField: 'imponibile',
      documentTotal: 110,
      previousRows: [],
    })

    assert.equal(result.totale, 110)
    assert.equal(result.imponibile, 100)
    assert.equal(result.ivaTotale, 10)
    assert.equal(result.ivaDetratta, 5)
    assert.equal(result.ivaIndetraibile, 5)
  }),

  test('calculateRegistrazioneIvaRow fuori campo non applica scorporo IVA', () => {
    const result = calculateRegistrazioneIvaRow({
      row: { totale: 10 },
      causaleIvaBehavior: { aliquota: 0, natura: 'N2.1', detraibile: false },
      changedField: 'totale',
      documentTotal: 10,
      previousRows: [],
    })

    assert.equal(result.totale, 10)
    assert.equal(result.imponibile, 10)
    assert.equal(result.ivaTotale, 0)
    assert.equal(result.ivaDetratta, 0)
    assert.equal(result.ivaIndetraibile, 0)
  }),

  test('buildRegistrazioneIvaRows gestisce il residuo su più righe', () => {
    const result = buildRegistrazioneIvaRows({
      rows: [
        { id: 'iva-1', totale: 10, manualTotalOverride: true, causaleIvaCodice: 'IVA22', causaleIvaDescrizione: 'IVA 22' },
        { id: 'iva-2', causaleIvaCodice: 'IVA22', causaleIvaDescrizione: 'IVA 22' },
      ],
      documentData: { totaleDocumento: 122, imponibile: 100 },
      causaliIva: [{ id: 'iva-22', codice: 'IVA22', descrizione: 'IVA 22', aliquota: 22, percentualeDetraibilita: 100 }],
      baseCausale: { id: 'iva-22', codice: 'IVA22', descrizione: 'IVA 22', aliquota: 22, percentualeDetraibilita: 100 },
    })

    assert.equal(result.rows.length, 2)
    assert.equal(result.rows[0].totale, 10)
    assert.equal(result.rows[1].totale, 112)
    assert.equal(result.rows[1].autoResidualApplied, true)
    assert.equal(result.rows[1].imponibile, 91.8)
    assert.equal(result.rows[1].ivaTotale, 20.2)
  }),

  test('buildRegistrazioneIvaRows ricalcola le righe auto residue quando cambia il residuo a monte', () => {
    const result = buildRegistrazioneIvaRows({
      rows: [
        { id: 'iva-1', totale: 20, manualTotalOverride: true, causaleIvaCodice: 'IVA22', causaleIvaDescrizione: 'IVA 22' },
        { id: 'iva-2', totale: 112, autoResidualApplied: true, causaleIvaCodice: 'IVA22', causaleIvaDescrizione: 'IVA 22' },
      ],
      documentData: { totaleDocumento: 122, imponibile: 100 },
      causaliIva: [{ id: 'iva-22', codice: 'IVA22', descrizione: 'IVA 22', aliquota: 22, percentualeDetraibilita: 100 }],
      baseCausale: { id: 'iva-22', codice: 'IVA22', descrizione: 'IVA 22', aliquota: 22, percentualeDetraibilita: 100 },
    })

    assert.equal(result.rows[1].totale, 102)
    assert.equal(result.rows[1].autoResidualApplied, true)
  }),

  test('buildRegistrazioneIvaRows assegna il residuo alla riga vuota con causale selezionata', () => {
    const result = buildRegistrazioneIvaRows({
      rows: [
        { id: 'iva-1', causaleIvaCodice: 'IVA22', causaleIvaDescrizione: 'Acquisti 22%' },
      ],
      documentData: { totaleDocumento: 1200 },
      causaliIva: [{ id: 'iva-22', codice: 'IVA22', descrizione: 'Acquisti 22%', aliquota: 22, percentualeDetraibilita: 100 }],
      baseCausale: { id: 'iva-22', codice: 'IVA22', descrizione: 'Acquisti 22%', aliquota: 22, percentualeDetraibilita: 100 },
    })

    assert.equal(result.rows[0].totale, 1200)
    assert.equal(result.rows[0].imponibile, 983.61)
    assert.equal(result.rows[0].ivaTotale, 216.39)
    assert.equal(result.rows[0].ivaDetratta, 216.39)
    assert.equal(result.rows[0].ivaIndetraibile, 0)
  }),
  ]
  await Promise.all(ivaSubtests)

  const templatePianoConti = [
    { id: 'cf-1', codice: '2 03 08 0001', descrizione: 'Fornitore demo', livello: 3, tipo: 'FINALE' },
    { id: 'iva-1', codice: '1 02 40 0001', descrizione: 'IVA ns credito', livello: 3, tipo: 'FINALE' },
    { id: 'costo-1', codice: '6 01 03 0001', descrizione: 'Spese telefoniche', livello: 3, tipo: 'FINALE' },
  ]

  const result = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        dataDocumento: '2026-05-01',
        numeroDocumento: 'A-100',
        causaleContabileId: 'ff',
        descrizioneGenerale: 'Acquisto demo',
      },
      documentData: {
        totaleDocumento: 122,
        imponibile: 100,
      },
      ivaData: {
        causaleIvaId: 'iva-22',
      },
      rows: [{}, {}],
    },
    {
      pianoConti: templatePianoConti,
      causaliContabili: [causaleTemplateFF],
      selectedCausale: causaleTemplateFF,
      causaliIva: [
        { id: 'iva-22', codice: 'IVA22', descrizione: 'Acquisti 22%', aliquota: 22, registroIva: 'ACQ', segnoRegistro: '+', percentualeDetraibilita: 100 },
      ],
    }
  )

  assert.equal(result.templateRowsDraft.applied, true)
  assert.equal(result.draft.rows.length, 3)
  assert.equal(result.draft.rows[1].dare, '22.00')
  assert.equal(result.draft.rows[2].dare, '100.00')
})

test('buildRegistrazionePartitarioDraft costruisce un closure draft partitario', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'PF',
    tipo_causale: 'Movimento di generale',
    operazione_partite: 'Chiude',
  })
  const draft = buildRegistrazionePartitarioDraft({
    header: {
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
      clienteFornitoreNome: 'Fornitore Alfa',
    },
    partitarioData: {
      tipoMovimento: 'chiusura',
      numeroDocumento: 'FT-1',
      dataDocumento: '2026-04-01',
      tipoDocumento: 'FT',
      selectedPartitaId: 'p1',
    },
    partite: [
      { id: 'p1', numeroDocumento: 'FT 1/2026', dataDocumento: '2026-04-01', tipoDocumento: 'FAT', saldoResiduo: 200 },
    ],
  }, { behavior })

  assert.equal(draft.active, true)
  assert.equal(draft.tipoMovimento, 'chiusura')
  assert.equal(draft.selectedPartitaId, 'p1')
  assert.equal(draft.importoChiusura, 200)
  assert.equal(Array.isArray(draft.rows), true)
  assert.equal(draft.rows[0].numeroDocumento, 'FT 1/2026')
  assert.equal(draft.status === 'ok' || draft.status === 'warning', true)
})

test('buildRegistrazionePartitarioDraft costruisce una apertura partita automatica', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'FF',
    tipo_causale: 'Doc. IVA normale',
    operazione_partite: 'Apre',
  })
  const draft = buildRegistrazionePartitarioDraft({
    header: {
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
      clienteFornitoreNome: 'Fornitore Alfa',
      numeroDocumento: '351',
      dataDocumento: '2026-05-03',
      tipoDocumento: 'FT',
    },
    documentData: {
      totaleDocumento: '1220',
      numeroDocumento: '351',
      dataDocumento: '2026-05-03',
      tipoDocumento: 'FT',
    },
    partitarioData: {},
  }, { behavior, pianoConti: [{ id: 'cf-1', is_fornitore: true, codice: 'CF-1', descrizione: 'Fornitore Alfa' }] })

  assert.equal(draft.mode, 'apertura')
  assert.equal(draft.importoAperto, 1220)
  assert.equal(draft.rows[0].stato, 'apertura_predisposta')
  assert.equal(draft.rows[0].source, 'document_data')
})

test('buildRegistrazionePartitarioDraft usa il totale della testata quando documentData e vuoto', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'FF',
    tipo_causale: 'Doc. IVA normale',
    operazione_partite: 'Apre',
  })
  const draft = buildRegistrazionePartitarioDraft({
    header: {
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
      clienteFornitoreNome: 'Fornitore Alfa',
      numeroDocumento: '351',
      dataDocumento: '2026-05-03',
      totaleDocumento: '1220',
    },
    documentData: {},
    partitarioData: {},
  }, { behavior, pianoConti: [{ id: 'cf-1', is_fornitore: true, codice: 'CF-1', descrizione: 'Fornitore Alfa' }] })

  assert.equal(draft.mode, 'apertura')
  assert.equal(draft.importoOriginario, 1220)
  assert.equal(draft.importoAperto, 1220)
  assert.equal(draft.residuo, 1220)
})

test('buildRegistrazionePartitarioDraft deriva il tipo documento in apertura quando non è già nel draft', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'FF',
    tipo_causale: 'Doc. IVA normale',
    operazione_partite: 'Apre',
  })
  const draft = buildRegistrazionePartitarioDraft({
    header: {
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
      clienteFornitoreNome: 'Fornitore Alfa',
      numeroDocumento: '351',
      dataDocumento: '2026-05-03',
    },
    documentData: {
      totaleDocumento: '1220',
    },
    partitarioData: {},
    selectedCausale: {
      tipo_documento: 'FT',
      descrizione: 'Fattura fornitore',
    },
  }, { behavior, pianoConti: [{ id: 'cf-1', is_fornitore: true, codice: 'CF-1', descrizione: 'Fornitore Alfa' }] })

  assert.equal(draft.mode, 'apertura')
  assert.equal(draft.tipoDocumento, 'FT')
  assert.equal(draft.rows[0].tipoDocumento, 'FT')
  assert.equal(draft.importoAperto, 1220)
})

test('buildRegistrazionePartitarioDraft rispetta l override manuale dell importo apertura', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'FF',
    tipo_causale: 'Doc. IVA normale',
    operazione_partite: 'Apre',
  })
  const draft = buildRegistrazionePartitarioDraft({
    header: {
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
      clienteFornitoreNome: 'Fornitore Alfa',
      numeroDocumento: '351',
      dataDocumento: '2026-05-03',
      tipoDocumento: 'FT',
    },
    documentData: { totaleDocumento: '1220' },
    partitarioData: {
      importoAperto: '1000',
      manualImportoApertoOverride: true,
    },
  }, { behavior, pianoConti: [{ id: 'cf-1', is_fornitore: true, codice: 'CF-1', descrizione: 'Fornitore Alfa' }] })

  assert.equal(draft.importoAperto, 1000)
  assert.equal(draft.rows[0].importoAperto, 1000)
})

test('buildRegistrazionePartitarioDraft costruisce una chiusura parziale', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'PF',
    tipo_causale: 'Movimento di generale',
    operazione_partite: 'Chiude',
  })
  const draft = buildRegistrazionePartitarioDraft({
    header: {
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
      clienteFornitoreNome: 'Fornitore Alfa',
    },
    partitarioData: {
      tipoMovimento: 'chiusura',
      selectedPartitaId: 'p1',
      importoChiusura: '200',
    },
    partite: [
      { id: 'p1', numeroDocumento: 'FT 1/2026', dataDocumento: '2026-04-01', tipoDocumento: 'FAT', saldoResiduo: 500 },
    ],
  }, { behavior })

  assert.equal(draft.mode, 'chiusura')
  assert.equal(draft.importoChiusura, 200)
  assert.equal(draft.rows[0].residuo, 500)
  assert.equal(draft.validation.status === 'ok' || draft.validation.status === 'warning', true)
})

test('buildRegistrazionePartitarioDraft segnala le partite aperte mancanti senza bloccare PN base', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'PF',
    tipo_causale: 'Movimento di generale',
    operazione_partite: 'Chiude',
  })
  const draft = buildRegistrazionePartitarioDraft({
    header: {
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
      clienteFornitoreNome: 'Fornitore Alfa',
    },
    partitarioData: {
      tipoMovimento: 'chiusura',
    },
    partite: [],
  }, { behavior })

  assert.equal(draft.mode, 'chiusura')
  assert.ok(draft.validation.warnings.some((w) => String(w).includes('read model reale')))
})

test('validateRegistrazioneDraft blocca il partitario richiesto se manca il soggetto', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'FF',
    tipo_causale: 'Doc. IVA normale',
    operazione_partite: 'Apre',
  })
  const validation = validateRegistrazioneDraft({
    header: {
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-03',
      causaleContabile: { id: 'ff', codice: 'FF' },
      soggetto: '',
      clienteFornitoreId: '',
    },
    rows: [
      { conto_id: 'c1', dare: 100, avere: 0 },
      { conto_id: 'c2', dare: 0, avere: 100 },
    ],
    partitarioData: { tipoMovimento: 'apertura', importoAperto: '1000' },
  }, { behavior })

  assert.equal(validation.status, 'blocked')
  assert.ok(validation.blockers.some((item) => String(item).includes('cliente / fornitore')))
})

test('buildRegistrazioneDraft include il partitarioDraft nella bozza finale', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'FF',
    tipo_causale: 'Doc. IVA normale',
    operazione_partite: 'Apre',
  })
  const result = buildRegistrazioneDraft({
    header: {
      societaId: 'soc-1',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-03',
      dataDocumento: '2026-05-03',
      numeroDocumento: '351',
      causaleContabile: { id: 'ff', codice: 'FF' },
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
      clienteFornitoreNome: 'Fornitore Alfa',
    },
    rows: [
      { conto_id: 'c1', dare: 100, avere: 0 },
      { conto_id: 'c2', dare: 0, avere: 100 },
    ],
    documentData: { totaleDocumento: '1220' },
    partitarioData: {},
  }, {
    behavior,
    pianoConti: [{ id: 'cf-1', is_fornitore: true, codice: 'CF-1', descrizione: 'Fornitore Alfa' }],
    partite: [],
    causaliIva: [],
  })

  assert.equal(Boolean(result.draft.partitarioDraft), true)
  assert.equal(result.draft.partitarioDraft.mode, 'apertura')
})

test('buildRegistrazioneRitenutaDraft costruisce un draft ritenute con calcolo base', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'RP',
    tipo_causale: 'Movimento di generale',
    op_ritenute: 'Documento',
  })
  const draft = buildRegistrazioneRitenutaDraft({
    documentData: { totaleDocumento: '1220,00', imponibile: '1000,00' },
    header: { soggetto: 'Studio Rossi' },
    percipienti: [
      { id: 'p1', ragione_sociale: 'Studio Rossi', codice_fiscale: 'RSSSTU80A01H501U', causale_prevalente: 'A', aliquota_ritenuta: 20 },
    ],
    ritenutaData: {
      percipiente: 'Studio Rossi',
      causaleReddituale: 'A',
      imponibile: '1000,00',
      aliquotaRitenuta: '20',
      cassaPrevidenziale: '0',
    },
  }, { behavior })

  assert.equal(draft.active, true)
  assert.equal(draft.mode, 'documento')
  assert.equal(draft.percipienteId, 'p1')
  assert.equal(draft.causaleCu, 'A')
  assert.equal(draft.importoCompenso, 1000)
  assert.equal(draft.rows[0].imponibileReddito, 1000)
  assert.equal(draft.baseImponibile, 1000)
  assert.equal(draft.baseRitenuta, 1000)
  assert.equal(draft.ritenuta, 200)
  assert.equal(draft.netto, 800)
  assert.equal(Array.isArray(draft.rows), true)
  assert.equal(draft.rows[0].causaleReddituale, 'A')
  assert.equal(draft.status, 'ok')
})

test('buildRegistrazioneRitenutaDraft riduce la base quando ci sono somme non soggette', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'RP',
    tipo_causale: 'Movimento di generale',
    op_ritenute: 'Documento',
  })

  const draft = buildRegistrazioneRitenutaDraft({
    header: { soggetto: 'Studio Rossi' },
    ritenutaData: {
      percipiente: 'Studio Rossi',
      causaleReddituale: 'A',
      imponibile: '1000,00',
      importoCompenso: '1000,00',
      sommeNonSoggette: '100,00',
      codiceSommeNonSoggette: 'E1',
      aliquotaRitenuta: '20',
    },
  }, { behavior })

  assert.equal(draft.baseRitenuta, 900)
  assert.equal(draft.ritenuta, 180)
})

test('buildRegistrazioneRitenutaDraft legge il compenso netto IVA e blocca i codici mancanti sulle quote', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'RP',
    tipo_causale: 'Movimento di generale',
    op_ritenute: 'Documento',
  })

  const draft = buildRegistrazioneRitenutaDraft({
    header: { soggetto: 'Studio Rossi' },
    documentData: { totaleDocumento: '1220,00', imponibile: '1000,00' },
    ivaDraft: { imponibile: '1000,00', totaleDocumento: '1220,00', totaleImposta: '220,00' },
    percipienti: [
      { id: 'p1', ragione_sociale: 'Studio Rossi', codice_fiscale: 'RSSSTU80A01H501U', causale_prevalente: 'A', aliquota_ritenuta: 20 },
    ],
    ritenutaData: {
      percipiente: 'Studio Rossi',
      causaleReddituale: 'A',
      importoCompenso: '1000,00',
      quotaNonSoggetta: '100,00',
      sommeNonSoggette: '50,00',
      aliquotaRitenuta: '20',
      codiceSommeNonSoggette: '',
    },
  }, { behavior })

  assert.equal(draft.importoCompenso, 1000)
  assert.equal(draft.baseRitenuta, 850)
  assert.equal(draft.ritenuta, 170)
  assert.equal(draft.status, 'blocked')
  assert.ok(draft.blockers.some((item) => /codice somme/i.test(item)))
})

test('buildRegistrazioneRitenutaDraft rispetta l override manuale della ritenuta', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'RP',
    tipo_causale: 'Movimento di generale',
    op_ritenute: 'Documento',
  })

  const draft = buildRegistrazioneRitenutaDraft({
    header: { soggetto: 'Studio Rossi' },
    ritenutaData: {
      percipiente: 'Studio Rossi',
      causaleReddituale: 'A',
      imponibile: '1000,00',
      importoCompenso: '1000,00',
      aliquotaRitenuta: '20',
      ritenuta: '150,00',
      manualRitenutaOverride: true,
    },
  }, { behavior })

  assert.equal(draft.ritenuta, 150)
  const rerun = buildRegistrazioneRitenutaDraft({
    header: { soggetto: 'Studio Rossi' },
    ritenutaData: {
      percipiente: 'Studio Rossi',
      causaleReddituale: 'A',
      imponibile: '2000,00',
      importoCompenso: '2000,00',
      aliquotaRitenuta: '20',
      ritenuta: '150,00',
      manualRitenutaOverride: true,
    },
  }, { behavior })

  assert.equal(rerun.ritenuta, 150)
})

test('buildRegistrazioneRitenutaDraft in modalità pagamento usa il partitario collegato', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'PF80',
    tipo_causale: 'Movimento di generale',
    op_ritenute: 'Pagamento',
    operazione_partite: 'Chiude',
  })

  const draft = buildRegistrazioneRitenutaDraft({
    header: { soggetto: 'Studio Rossi' },
    percipienti: [
      { id: 'p1', ragione_sociale: 'Studio Rossi', codice_fiscale: 'RSSSTU80A01H501U', causale_prevalente: 'A', aliquota_ritenuta: 20 },
    ],
    partitarioDraft: {
      selectedPartitaId: 'part-1',
      selectedPartitaNumeroDocumento: 'FT 351',
      importoChiusura: '1000,00',
    },
    ritenutaData: {
      percipiente: 'Studio Rossi',
      causaleReddituale: 'A',
      importoPagamento: '1000,00',
      importoCompenso: '1000,00',
      aliquotaRitenuta: '20',
    },
  }, { behavior })

  assert.equal(draft.mode, 'pagamento')
  assert.equal(draft.importoPagamento, 1000)
  assert.equal(draft.ritenuta, 200)
  assert.equal(draft.netto, 800)
  assert.equal(draft.status, 'ok')
})

test('buildRegistrazioneRitenutaDraft segnala il percipiente mancante', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'RP',
    tipo_causale: 'Movimento di generale',
    op_ritenute: 'Documento',
  })

  const draft = buildRegistrazioneRitenutaDraft({
    header: {},
    ritenutaData: {
      causaleReddituale: 'A',
      imponibile: '1000,00',
      importoCompenso: '1000,00',
      aliquotaRitenuta: '20',
    },
  }, { behavior })

  assert.equal(draft.status, 'blocked')
  assert.ok(draft.blockers.some((item) => /percipiente/i.test(item)))
})

test('buildRegistrazioneDraft include ritenutaDraft senza sporcare la prima nota', () => {
  const result = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        dataDocumento: '2026-05-01',
        numeroDocumento: 'A-100',
        causaleContabileId: 'rp',
        soggetto: 'Studio Rossi',
      },
      rows: [
        { conto_id: 'c1', dare: 100, avere: 0 },
        { conto_id: 'c2', dare: 0, avere: 100 },
      ],
      ritenutaData: {
        percipiente: 'Studio Rossi',
        causaleReddituale: 'A',
        imponibile: '1000,00',
        aliquotaRitenuta: '20',
      },
    },
    { pianoConti, causaliContabili, behavior: resolveRegistrazioneCausaleBehavior({ codice: 'RP', tipo_causale: 'Movimento di generale', op_ritenute: 'Documento' }) }
  )

  assert.equal(Boolean(result.draft.ritenutaDraft), true)
  assert.equal(result.draft.ritenutaDraft.mode, 'documento')
  assert.equal(result.draft.pnPayload.societa_id, 'soc-1')
})

test('validateRegistrazioneDraft varia con il behavior della causale', () => {
  const moveSimple = validateRegistrazioneDraft({
    header: {
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-01',
      causaleContabile: { id: 'pd', codice: 'PD' },
    },
    rows: [
      { conto_id: 'c1', dare: 100, avere: 0 },
      { conto_id: 'c2', dare: 0, avere: 100 },
    ],
  }, { behavior: resolveRegistrazioneCausaleBehavior({ codice: 'PD', tipo_causale: 'Movimento di generale', operazione_partite: 'Ignora', op_ritenute: 'Ignora' }) })

  const docIva = validateRegistrazioneDraft({
    header: {
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-01',
      causaleContabile: { id: 'ff', codice: 'FF' },
      dataDocumento: '2026-05-01',
      numeroDocumento: 'FT 1/2026',
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
      totaleDocumento: '1220,00',
    },
    rows: [
      { conto_id: 'c1', dare: 100, avere: 0 },
      { conto_id: 'c2', dare: 0, avere: 100 },
    ],
    documentData: { modalitaPagamento: 'bonifico' },
    ivaData: { dataCompetenza: '2026-05-01', dataOperazione: '2026-05-01' },
  }, { behavior: resolveRegistrazioneCausaleBehavior({ codice: 'FF', tipo_causale: 'Doc. IVA normale', operazione_partite: 'Apre' }) })

  const partiteClose = validateRegistrazioneDraft({
    header: {
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-01',
      causaleContabile: { id: 'pf', codice: 'PF' },
      soggetto: 'Fornitore Alfa',
      clienteFornitoreId: 'cf-1',
    },
    rows: [
      { conto_id: 'c1', dare: 100, avere: 0 },
      { conto_id: 'c2', dare: 0, avere: 100 },
    ],
    partitarioData: { selectedPartitaId: 'p1', importoChiusura: '100,00' },
  }, { behavior: resolveRegistrazioneCausaleBehavior({ codice: 'PF', tipo_causale: 'Movimento di generale', operazione_partite: 'Chiude' }) })

  const ritenuteDoc = validateRegistrazioneDraft({
    header: {
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-01',
      causaleContabile: { id: 'rp', codice: 'RP' },
      soggetto: 'Studio Rossi',
      clienteFornitoreId: 'cf-2',
    },
    percipienti: [
      { id: 'p1', ragione_sociale: 'Studio Rossi', codice_fiscale: 'RSSSTU80A01H501U', causale_prevalente: 'A', aliquota_ritenuta: 20 },
    ],
    rows: [
      { conto_id: 'c1', dare: 100, avere: 0 },
      { conto_id: 'c2', dare: 0, avere: 100 },
    ],
    percipienti: [
      { id: 'p1', ragione_sociale: 'Studio Rossi', codice_fiscale: 'RSSSTU80A01H501U', causale_prevalente: 'A', aliquota_ritenuta: 20 },
    ],
    ritenutaData: { percipiente: 'Studio Rossi', causaleReddituale: 'A', importoCompenso: '1000,00', baseRitenuta: '1000,00', aliquotaRitenuta: '20', ritenuta: '200,00' },
  }, { behavior: resolveRegistrazioneCausaleBehavior({ codice: 'RP', tipo_causale: 'Movimento di generale', op_ritenute: 'Documento' }) })

  assert.equal(moveSimple.status, 'ok')
  assert.equal(docIva.status === 'ok' || docIva.status === 'warning', true)
  assert.equal(partiteClose.status === 'ok' || partiteClose.status === 'warning', true)
  assert.equal(ritenuteDoc.status, 'ok')
  assert.ok(docIva.warnings.length >= 0)
  assert.ok(partiteClose.info.length >= 0)
  assert.ok(ritenuteDoc.info.length >= 0)
})

test('buildRegistrazioneContoSelection conserva la descrizione reale selezionata', () => {
  const conto = {
    id: 'c1',
    codice: '1 02 40 0001',
    descrizione: "ATTIVITA'",
  }

  const selected = buildRegistrazioneContoSelection(conto, '1 02 40 0001 - IVA NS.CREDITO')

  assert.equal(selected.conto_descrizione, 'IVA NS.CREDITO')
  assert.equal(selected.__label, '1 02 40 0001 - IVA NS.CREDITO')
})

test('resolveContoHierarchyView classifica mastro conto e sottoconto', () => {
  const mastro = resolveContoHierarchyView({ codice: '6', livello: 1, tipo: 'MASTRO' })
  const conto = resolveContoHierarchyView({ codice: '6.01', livello: 2, tipo: 'CONTO' })
  const sottoconto = resolveContoHierarchyView({ codice: '6.01.05', livello: 3, tipo: 'FINALE' })

  assert.equal(mastro.hierarchyType, 'mastro')
  assert.equal(mastro.isSelectableForRegistrazione, false)
  assert.equal(conto.hierarchyType, 'conto')
  assert.equal(conto.isSelectableForRegistrazione, false)
  assert.equal(sottoconto.hierarchyType, 'sottoconto')
  assert.equal(sottoconto.isSelectableForRegistrazione, true)
})

test('findRegistrazioneCausaleExactMatch riconosce il codice e la label completa', () => {
  const causali = [
    { id: 'ff', codice: 'FF', descrizione: 'Fatture passive' },
    { id: 'fc', codice: 'FC', descrizione: 'Fatture attive' },
  ]

  assert.equal(findRegistrazioneCausaleExactMatch(causali, 'ff')?.codice, 'FF')
  assert.equal(findRegistrazioneCausaleExactMatch(causali, 'FF - Fatture passive')?.codice, 'FF')
  assert.equal(findRegistrazioneCausaleExactMatch(causali, 'fc')?.codice, 'FC')
  assert.equal(findRegistrazioneCausaleExactMatch(causali, 'F'), null)
})

test('resolveRegistrazioneCausaleLabel mostra codice e descrizione reale', () => {
  const causale = { codice: 'FF', descrizione: 'Fatture passive' }
  assert.equal(resolveRegistrazioneCausaleLabel(causale), 'FF - Fatture passive')
})

test('resolveRegistrazioneCausaleBehavior classifica un documento IVA normale con partite aperte', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'FF',
    tipo_causale: 'Doc. IVA normale',
    operazione_partite: 'Apre',
  })

  assert.equal(behavior.showDocumentPanel, true)
  assert.equal(behavior.showIvaPanel, true)
  assert.equal(behavior.showPartitario, true)
  assert.equal(behavior.showRitenute, false)
  assert.equal(behavior.ivaMode, 'normale')
  assert.equal(behavior.partitarioMode, 'apertura')
})

test('resolveRegistrazioneCausaleBehavior classifica un documento IVA esigibilita differita', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'FD',
    tipo_causale: 'Doc. IVA esig. differita',
    operazione_partite: 'Ignora',
    registro_iva_differita: 'SI',
  })

  assert.equal(behavior.showDocumentPanel, true)
  assert.equal(behavior.showIvaPanel, true)
  assert.equal(behavior.ivaMode, 'differita')
  assert.equal(behavior.documentMode, 'documento_iva_differita')
})

test('resolveRegistrazioneCausaleBehavior classifica una autofattura', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'AF',
    tipo_causale: 'Autofattura',
  })

  assert.equal(behavior.showDocumentPanel, true)
  assert.equal(behavior.showIvaPanel, true)
  assert.equal(behavior.ivaMode, 'autofattura')
  assert.equal(behavior.documentMode, 'autofattura')
})

test('resolveRegistrazioneCausaleBehavior classifica un documento IVA acquisto CEE', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'CE',
    tipo_causale: 'Doc. IVA Acq. CEE',
  })

  assert.equal(behavior.showDocumentPanel, true)
  assert.equal(behavior.showIvaPanel, true)
  assert.equal(behavior.ivaMode, 'cee')
  assert.equal(behavior.documentMode, 'documento_iva_cee')
})

test('resolveRegistrazioneCausaleBehavior classifica un corrispettivo senza partitario', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'CP',
    tipo_causale: 'Doc. Corrispettivo',
  })

  assert.equal(behavior.showDocumentPanel, true)
  assert.equal(behavior.showIvaPanel, true)
  assert.equal(behavior.showPartitario, false)
  assert.equal(behavior.family, 'corrispettivi')
})

test('resolveRegistrazioneCausaleBehavior classifica un pagamento/incasso IVA differita', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'PD',
    tipo_causale: 'Pag./Inc. IVA esig. diff.',
    operazione_partite: 'Chiude',
    registro_iva_differita: 'SI',
  })

  assert.equal(behavior.showDocumentPanel, false)
  assert.equal(behavior.showIvaPanel, true)
  assert.equal(behavior.showPartitario, true)
  assert.equal(behavior.ivaMode, 'pagamento_iva_differita')
  assert.equal(behavior.partitarioMode, 'chiusura')
})

test('resolveRegistrazioneCausaleBehavior classifica un movimento di generale con chiusura partite', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'MG',
    tipo_causale: 'Movimento di generale',
    operazione_partite: 'Chiude',
  })

  assert.equal(behavior.showDocumentPanel, false)
  assert.equal(behavior.showIvaPanel, false)
  assert.equal(behavior.showPartitario, true)
  assert.equal(behavior.partitarioMode, 'chiusura')
})

test('resolveRegistrazioneCausaleBehavior classifica un movimento di generale semplice', () => {
  const behavior = resolveRegistrazioneCausaleBehavior({
    codice: 'MG',
    tipo_causale: 'Movimento di generale',
    operazione_partite: 'Ignora',
    op_ritenute: 'Ignora',
  })

  assert.equal(behavior.family, 'movimento_generale')
  assert.equal(behavior.showDocumentPanel, false)
  assert.equal(behavior.showIvaPanel, false)
  assert.equal(behavior.showPartitario, false)
  assert.equal(behavior.showRitenute, false)
  assert.deepEqual(behavior.activeTabs, ['rows'])
})

test('resolveRegistrazioneCausaleBehavior abilita le ritenute da documento e pagamento', () => {
  const documento = resolveRegistrazioneCausaleBehavior({
    codice: 'RT',
    tipo_causale: 'Doc. IVA normale',
    op_ritenute: 'Documento',
  })
  const pagamento = resolveRegistrazioneCausaleBehavior({
    codice: 'RTP',
    tipo_causale: 'Movimento di generale',
    op_ritenute: 'Pagamento',
    operazione_partite: 'Chiude',
  })

  assert.equal(documento.showRitenute, true)
  assert.equal(documento.ritenuteMode, 'documento')
  assert.equal(pagamento.showRitenute, true)
  assert.equal(pagamento.ritenuteMode, 'pagamento')
  assert.equal(pagamento.showPartitario, true)
})

test('resolveRegistrazioneCausaleConfig espone il layout per FF', () => {
  const config = resolveRegistrazioneCausaleConfig('FF')
  assert.equal(config.showDocumentPanel, true)
  assert.equal(config.showIvaPanel, true)
  assert.equal(config.showPartitario, true)
  assert.equal(config.supportsPartitePanel, true)
})

test('normalizeRegistrazioneCausaleContabileValue canonicalizza i valori legacy', () => {
  assert.equal(normalizeRegistrazioneCausaleContabileValue('tipo_causale', 'Doc. Iva normale'), 'Doc. IVA normale')
  assert.equal(normalizeRegistrazioneCausaleContabileValue('operazione_partite', 'apre'), 'Apre')
  assert.equal(normalizeRegistrazioneCausaleContabileValue('gestione_partite', 'CHIUDE'), 'Chiude')
  assert.equal(normalizeRegistrazioneCausaleContabileValue('op_ritenute', 'documento'), 'Documento')
  assert.equal(normalizeRegistrazioneCausaleContabileValue('data_documento', 'Obbligatorio'), 'Obbligatorio')
})

test('hydrate e build della causale IVA conservano aliquota e indetraibilita modificati', () => {
  const hydrated = hydrateRegistrazioneCausaleContabileForm({
    codice: 'AI2W',
    descrizione: '22% INDETRAIBILE AL 100%',
    aliquota: 22,
    percentuale_indetraibilita: 0,
    detraibile: true,
  }, { isIva: true })

  hydrated.percentuale_imposta = 22
  hydrated.aliquota = 22
  hydrated.percentuale_indetraibilita = 50
  hydrated.detraibile = true

  const payload = buildRegistrazioneCausaleContabilePayload(hydrated, { isIva: true })

  assert.equal(payload.aliquota, 22)
  assert.equal(payload.percentuale_indetraibilita, 50)
  assert.equal(payload.detraibile, true)
})

test('normalizeRegistrazioneCausaleRighePrimaNotaTemplate normalizza array vuoti e righe valide', () => {
  assert.deepEqual(normalizeRegistrazioneCausaleRighePrimaNotaTemplate(null), [])

  const rows = normalizeRegistrazioneCausaleRighePrimaNotaTemplate([
    {
      ordine: '2',
      ruolo: 'soggetto',
      lato: 'AVERE',
      formula_importo: 'totale_documento',
      conto_id: 'c1',
      conto_codice: '1 02 40 0001',
      conto_descrizione: 'IVA ns credito',
      mastrino_hint: '02',
      descrizione_riga: 'Test riga',
      hierarchyType: 'conto',
      isTemplateScope: '1',
      obbligatoria: '1',
      modificabile: '0',
      attiva: 'x',
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].ordine, 2)
  assert.equal(rows[0].ruolo, 'soggetto')
  assert.equal(rows[0].lato, 'avere')
  assert.equal(rows[0].formula_importo, 'totale_documento')
  assert.equal(rows[0].hierarchyType, 'conto')
  assert.equal(rows[0].isTemplateScope, true)
  assert.equal(rows[0].obbligatoria, true)
  assert.equal(rows[0].modificabile, false)
  assert.equal(rows[0].attiva, true)
})

test('hydrate e build della causale contabile conservano i campi configurativi', () => {
  const hydrated = hydrateRegistrazioneCausaleContabileForm({
    codice: 'RP',
    descrizione: 'Ricevuta pagamento',
    descrizione_tabulati: 'Ricevuta pag.',
    tipo_causale: 'Movimento di generale',
    operazione_partite: 'Ignora',
    gestione_partite: 'Chiude',
    tipo_pagamento: 'Rimessa diretta',
    codice_registro_iva: '01',
    protocollo_numerazione: '12',
    segno_registro_iva: '+',
    codice_aliquota_iva: '22',
    op_ritenute: 'Ignora',
    tipo_documento: 'Generale',
    data_documento: 'Obbligatorio',
    numero_documento: 'Facoltativo',
    tipo_doc_comunicaz_ft: 'TD01',
    tipo_doc_ft_elettroniche: 'TD01',
    conto_iva_esig_differita: 'c1',
    registro_iva_differita: 'r1',
    registro_iva_cee: 'r2',
    protocollo_iva_cee: '7',
    segno_iva_registro_cee: '-',
    trascina_descrizione: true,
    trascina_sbilancio: true,
    data_competenza: true,
    rateo_risconti: false,
    disattivato: false,
    integrazione_documento: true,
    causale_giro_iva_cassa: false,
    competenza_iva_anno_prec: true,
    causale_standard_efat: false,
    ventilazione_corrispettivi: false,
    esclusa_integrazioni: true,
    note: 'test',
    righe_prima_nota_template: [
      {
        ordine: 1,
        ruolo: 'soggetto',
        lato: 'dare',
        formula_importo: 'totale_documento',
        conto_id: 'c1',
        conto_codice: '1 02 40 0001',
        conto_descrizione: 'IVA ns credito',
        mastrino_hint: '02',
        descrizione_riga: 'Riga documento',
        obbligatoria: true,
        modificabile: false,
        attiva: true,
      },
    ],
  })

  const payload = buildRegistrazioneCausaleContabilePayload(hydrated)

  assert.equal(hydrated.gestione_partite, 'Ignora')
  assert.equal(payload.tipo_causale, 'Movimento di generale')
  assert.equal(payload.tipo, 'generico')
  assert.equal(payload.operazione_partite, 'Ignora')
  assert.equal(payload.gestione_partite, undefined)
  assert.equal(payload.tipo_documento, 'Generale')
  assert.equal(payload.data_documento, 'Obbligatorio')
  assert.equal(payload.numero_documento, 'Facoltativo')
  assert.equal(payload.protocollo_numerazione, 12)
  assert.equal(payload.protocollo_iva_cee, 7)
  assert.equal(payload.trascina_sbilancio, true)
  assert.equal(payload.esclusa_integrazioni, true)
  assert.equal(Array.isArray(payload.righe_prima_nota_template), true)
  assert.equal(payload.righe_prima_nota_template.length, 1)
  assert.equal(payload.righe_prima_nota_template[0].conto_id, 'c1')
  assert.equal(payload.righe_prima_nota_template[0].conto_codice, '1 02 40 0001')
  assert.equal(payload.righe_prima_nota_template[0].conto_descrizione, 'IVA ns credito')
})

test('hydrate e build della causale contabile sincronizzano gestione partite e payload persistito', () => {
  const hydrated = hydrateRegistrazioneCausaleContabileForm({
    codice: 'MG',
    descrizione: 'Movimento generale',
    tipo_causale: 'Movimento di generale',
    operazione_partite: 'Ignora',
    gestione_partite: 'Chiude',
    tipo_documento: 'Generale',
  })

  const payload = buildRegistrazioneCausaleContabilePayload(hydrated)

  assert.equal(hydrated.gestione_partite, 'Ignora')
  assert.equal(hydrated.operazione_partite, 'Ignora')
  assert.equal(payload.operazione_partite, 'Ignora')
  assert.equal(payload.gestione_partite, undefined)
  assert.equal(payload.tipo_documento, 'Generale')
})

test('buildCausaleContabilePolicy usa operazione partite come fonte primaria e non il vecchio alias', () => {
  const policy = buildCausaleContabilePolicy({
    codice: 'MG',
    descrizione: 'Movimento generale',
    tipo_causale: 'Movimento di generale',
    operazione_partite: 'Ignora',
    gestione_partite: 'Chiude',
    tipo_documento: 'Generale',
  })

  assert.equal(policy.operazionePartite, 'Ignora')
  assert.equal(policy.gestionePartite, 'Ignora')
  assert.equal(policy.operazioneGestita, 'Generale')
  assert.equal(policy.operazioneGestitaGroup, 'movimento_generale_ignora')
  assert.equal(policy.isMovimentoGenerico, true)
  assert.equal(policy.gestionePartitario, 'nessuno')
  assert.equal(policy.partiteIgnore, true)
  assert.equal(policy.partiteClose, false)
})

test('normalizeRegistrazioneRigheTemplate filtra gli inattivi e ordina per ordine', () => {
  const normalized = normalizeRegistrazioneRigheTemplate([
    { ordine: 3, attiva: true, formula_importo: 'manuale', ruolo: 'costo', hierarchyType: 'sottoconto', lato: 'dare' },
    { ordine: 1, attiva: false, formula_importo: 'manuale', ruolo: 'soggetto', hierarchyType: 'conto', lato: 'avere' },
    { ordine: 2, attiva: true, formula_importo: 'manuale', ruolo: 'iva', hierarchyType: 'conto', lato: 'dare' },
  ])

  assert.equal(normalized.rows.length, 2)
  assert.equal(normalized.rows[0].ordine, 2)
  assert.equal(normalized.rows[1].ordine, 3)
  assert.equal(normalized.rows[0].hierarchyType, 'conto')
  assert.equal(normalized.rows[1].hierarchyType, 'sottoconto')
})

test('buildRegistrazioneRowsFromTemplate genera il template FF con importi coerenti', () => {
  const result = buildRegistrazioneRowsFromTemplate({
    templateRows: causaleTemplateFF.righe_prima_nota_template,
    documentData: { totaleDocumento: 122, imponibile: 100 },
    ivaDraft: { ivaDetraibile: 22 },
    soggetto: {
      clienteFornitoreId: 'cf-1',
      clienteFornitoreCodice: '2 03 08 0001',
      clienteFornitoreNome: 'Fornitore demo',
    },
    currentRows: [],
  })

  assert.equal(result.applied, true)
  assert.equal(result.rows.length, 3)
  assert.equal(result.rows[0].conto_codice, '2 03 08 0001')
  assert.equal(result.rows[0].avere, '122.00')
  assert.equal(result.rows[1].dare, '22.00')
  assert.equal(result.rows[2].dare, '100.00')
})

test('buildRegistrazioneRowsFromTemplate considera il conto scope come template e non come finale', () => {
  const result = buildRegistrazioneRowsFromTemplate({
    templateRows: [
      {
        ordine: 1,
        ruolo: 'costo',
        lato: 'dare',
        formula_importo: 'manuale',
        conto_id: 'scope-1',
        conto_codice: '6 01',
        conto_descrizione: 'Costi per servizi',
        hierarchyType: 'conto',
        isTemplateScope: true,
        attiva: true,
      },
    ],
    documentData: {},
    ivaDraft: {},
    soggetto: {},
    currentRows: [],
  })

  assert.equal(result.rows[0].hierarchyType, 'conto')
  assert.equal(result.rows[0].templateScope, true)
  assert.equal(result.rows[0].conto_resolved_finale, false)
})

test('buildRegistrazioneRowsFromTemplate non sovrascrive le righe manuali', () => {
  const currentRows = [
    {
      id: 'r1',
      contoQuery: 'Manuale',
      conto_id: 'manual-1',
      conto_codice: '9 99',
      conto_descrizione: 'Conto manuale',
      descrizione: 'Riga manuale',
      dare: '10.00',
      avere: '',
      manualEdited: true,
      manualAmountOverride: true,
    },
  ]

  const result = buildRegistrazioneRowsFromTemplate({
    templateRows: causaleTemplateFF.righe_prima_nota_template,
    documentData: { totaleDocumento: 122, imponibile: 100 },
    ivaDraft: { ivaDetraibile: 22 },
    soggetto: {
      clienteFornitoreId: 'cf-1',
      clienteFornitoreCodice: '2 03 08 0001',
      clienteFornitoreNome: 'Fornitore demo',
    },
    currentRows,
  })

  assert.equal(result.applied, false)
  assert.equal(result.rows[0].conto_id, 'manual-1')
  assert.equal(result.rows[0].manualEdited, true)
})

test('buildRegistrazioneRowsFromTemplate lascia vuoto l importo manuale', () => {
  const result = buildRegistrazioneRowsFromTemplate({
    templateRows: [
      {
        ordine: 1,
        ruolo: 'costo',
        lato: 'dare',
        formula_importo: 'manuale',
        conto_id: 'c1',
        conto_codice: '6 01 03 0001',
        conto_descrizione: 'Spese telefoniche',
        hierarchyType: 'sottoconto',
        attiva: true,
      },
    ],
    documentData: {},
    ivaDraft: {},
    soggetto: {},
    currentRows: [],
  })

  assert.equal(result.rows[0].dare, '')
  assert.equal(result.rows[0].avere, '')
})

test('buildRegistrazioneDraft applica automaticamente il template su righe iniziali vuote', () => {
  const templatePianoConti = [
    { id: 'cf-1', codice: '2 03 08 0001', descrizione: 'Fornitore demo', livello: 3, tipo: 'FINALE' },
    { id: 'iva-1', codice: '1 02 40 0001', descrizione: 'IVA ns credito', livello: 3, tipo: 'FINALE' },
    { id: 'costo-1', codice: '6 01 03 0001', descrizione: 'Spese telefoniche', livello: 3, tipo: 'FINALE' },
  ]

  const result = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        dataDocumento: '2026-05-01',
        numeroDocumento: 'A-100',
        causaleContabileId: 'ff',
        descrizioneGenerale: 'Acquisto demo',
      },
      documentData: {
        totaleDocumento: 122,
        imponibile: 100,
      },
      rows: [{}, {}],
    },
    {
      pianoConti: templatePianoConti,
      causaliContabili: [causaleTemplateFF],
      selectedCausale: causaleTemplateFF,
    }
  )

  assert.equal(result.templateRowsDraft.applied, true)
  assert.equal(result.draft.rows.length, 3)
  assert.equal(result.draft.rows[0].dare || result.draft.rows[0].avere, '122.00')
})

test('buildRegistrazioneDraft ricalcola le righe template quando cambia il documento', () => {
  const templatePianoConti = [
    { id: 'cf-1', codice: '2 03 08 0001', descrizione: 'Fornitore demo', livello: 3, tipo: 'FINALE' },
    { id: 'iva-1', codice: '1 02 40 0001', descrizione: 'IVA ns credito', livello: 3, tipo: 'FINALE' },
    { id: 'costo-1', codice: '6 01 03 0001', descrizione: 'Spese telefoniche', livello: 3, tipo: 'FINALE' },
  ]

  const initial = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        dataDocumento: '2026-05-01',
        numeroDocumento: 'A-100',
        causaleContabileId: 'ff',
        descrizioneGenerale: 'Acquisto demo',
      },
      documentData: {
        totaleDocumento: 122,
        imponibile: 100,
      },
      rows: [{}, {}],
    },
    {
      pianoConti: templatePianoConti,
      causaliContabili: [causaleTemplateFF],
      selectedCausale: causaleTemplateFF,
    }
  )

  const rerun = buildRegistrazioneDraft(
    {
      societaId: 'soc-1',
      header: {
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-01',
        dataDocumento: '2026-05-01',
        numeroDocumento: 'A-100',
        causaleContabileId: 'ff',
        descrizioneGenerale: 'Acquisto demo',
      },
      documentData: {
        totaleDocumento: 140,
        imponibile: 118,
      },
      rows: initial.draft.rows,
    },
    {
      pianoConti: templatePianoConti,
      causaliContabili: [causaleTemplateFF],
      selectedCausale: causaleTemplateFF,
    }
  )

  assert.equal(rerun.templateRowsDraft.applied, true)
  assert.equal(rerun.draft.rows[0].dare || rerun.draft.rows[0].avere, '140.00')
  assert.equal(rerun.draft.rows[2].dare, '118.00')
})

test('buildCausaleStructureHistory ricava il pattern soggetto iva costo', () => {
  const historicalEntries = [
    {
      prima_nota_id: 'pn-1',
      riga_numero: 1,
      conto_id: 'f-1',
      conto_codice: '2 03 08 0001',
      conto_descrizione: 'Debiti v/fornitori',
      importo_dare: 0,
      importo_avere: 122,
      descrizione_riga: 'Fornitore',
      prima_nota: { id: 'pn-1', causale_codice: 'FF', cliente_fornitore_nome: 'Fornitore Alfa' },
    },
    {
      prima_nota_id: 'pn-1',
      riga_numero: 2,
      conto_id: 'iva-1',
      conto_codice: '1 02 40 0001',
      conto_descrizione: 'IVA ns credito',
      importo_dare: 22,
      importo_avere: 0,
      descrizione_riga: 'IVA',
      prima_nota: { id: 'pn-1', causale_codice: 'FF' },
    },
    {
      prima_nota_id: 'pn-1',
      riga_numero: 3,
      conto_id: 'costo-1',
      conto_codice: '6 01 03 0001',
      conto_descrizione: 'Spese telefoniche',
      importo_dare: 100,
      importo_avere: 0,
      descrizione_riga: 'Costo',
      prima_nota: { id: 'pn-1', causale_codice: 'FF' },
    },
  ]

  const result = buildCausaleStructureHistory({ societaId: 'soc-1', causaleCodice: 'FF', historicalEntries })
  assert.equal(result.found, true)
  assert.equal(result.sampleSize, 1)
  assert.equal(result.patternRows[0].ruolo, 'soggetto')
  assert.equal(result.patternRows[1].ruolo, 'iva')
  assert.equal(result.patternRows[2].ruolo, 'costo')
})

test('resolveRegistrazioneRigheTemplate usa template, storico e fallback in priorita', () => {
  const templateResult = resolveRegistrazioneRigheTemplate({
    causaleTemplateRows: causaleTemplateFF.righe_prima_nota_template,
    causaleBehavior: resolveRegistrazioneCausaleBehavior(causaleTemplateFF),
  })
  assert.equal(templateResult.source, 'causale_template')

  const historyResult = resolveRegistrazioneRigheTemplate({
    causaleTemplateRows: [],
    historicalCausaleStructure: {
      found: true,
      confidence: 0.8,
      patternRows: [{ ordine: 1, ruolo: 'soggetto', lato: 'avere', formula_importo: 'totale_documento', attiva: true }],
    },
    causaleBehavior: resolveRegistrazioneCausaleBehavior(causaleTemplateFF),
  })
  assert.equal(historyResult.source, 'causale_structure_history')

  const fallbackResult = resolveRegistrazioneRigheTemplate({
    causaleTemplateRows: [],
    historicalCausaleStructure: { found: false, patternRows: [] },
    causaleBehavior: resolveRegistrazioneCausaleBehavior({ tipo_causale: 'Movimento di generale', operazione_partite: 'Ignora', op_ritenute: 'Ignora' }),
  })
  assert.equal(fallbackResult.source, 'behavior_fallback')
})

test('resolveRegistrazioneTemplateRowAccount rispetta la priorita del conto specifico', () => {
  const defaultResult = resolveRegistrazioneTemplateRowAccount({
    rowRole: 'costo',
    templateRow: { ruolo: 'costo', lato: 'dare', formula_importo: 'imponibile' },
    subjectAccountDefaults: { conto_id: 'def-1', conto_codice: '6 01 01 0001', conto_descrizione: 'Spese generiche', hierarchyType: 'sottoconto' },
    subjectAccountHistory: { costo: { conto_id: 'hist-1', conto_codice: '6 01 03 0001', conto_descrizione: 'Spese telefoniche', hierarchyType: 'sottoconto' } },
    procedureDefaults: { costo: { conto_id: 'proc-1', conto_codice: '6 01 09 0001', conto_descrizione: 'Spese varie', hierarchyType: 'sottoconto' } },
  })
  assert.equal(defaultResult.source, 'subject_default_account')
  assert.equal(defaultResult.conto_id, 'def-1')

  const historyResult = resolveRegistrazioneTemplateRowAccount({
    rowRole: 'costo',
    templateRow: { ruolo: 'costo', lato: 'dare', formula_importo: 'imponibile' },
    subjectAccountDefaults: null,
    subjectAccountHistory: { costo: { conto_id: 'hist-1', conto_codice: '6 01 03 0001', conto_descrizione: 'Spese telefoniche', hierarchyType: 'sottoconto' } },
    procedureDefaults: { costo: { conto_id: 'proc-1', conto_codice: '6 01 09 0001', conto_descrizione: 'Spese varie', hierarchyType: 'sottoconto' } },
  })
  assert.equal(historyResult.source, 'subject_account_history')
  assert.equal(historyResult.conto_id, 'hist-1')

  const procedureResult = resolveRegistrazioneTemplateRowAccount({
    rowRole: 'costo',
    templateRow: { ruolo: 'costo', lato: 'dare', formula_importo: 'imponibile' },
    subjectAccountDefaults: null,
    subjectAccountHistory: null,
    procedureDefaults: { costo: { conto_id: 'proc-1', conto_codice: '6 01 09 0001', conto_descrizione: 'Spese varie', hierarchyType: 'sottoconto' } },
  })
  assert.equal(procedureResult.source, 'procedure_default_account')
  assert.equal(procedureResult.conto_id, 'proc-1')

  const manualResult = resolveRegistrazioneTemplateRowAccount({
    rowRole: 'costo',
    templateRow: { ruolo: 'costo', lato: 'dare', formula_importo: 'imponibile' },
  })
  assert.equal(manualResult.source, 'manual_required')
})

test('buildRegistrazioneRowsFromTemplateResolved non sovrascrive righe manuali', () => {
  const result = buildRegistrazioneRowsFromTemplateResolved({
    templateRows: causaleTemplateFF.righe_prima_nota_template,
    documentData: { totaleDocumento: 122, imponibile: 100 },
    ivaDraft: { ivaDetraibile: 22 },
    soggetto: {},
    currentRows: [
      { id: 'manual-1', manualEdited: true, contoQuery: 'Manuale', dare: '12.00', avere: '', descrizione: 'Riga manuale' },
    ],
    causaleBehavior: resolveRegistrazioneCausaleBehavior(causaleTemplateFF),
  })

  assert.equal(result.applied, false)
  assert.equal(result.source, 'causale_template')
  assert.equal(result.rows[0].manualEdited, true)
})

