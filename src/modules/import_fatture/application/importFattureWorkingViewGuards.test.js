/**
 * Test sui blocchi strutturali condivisi Import Fatture (fixture realistiche, node:test).
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { FISCOSIM_IMPORT_AI_META as M } from '../../import_unificato/data/importFiscosimMeta.js'
import {
  evaluateImportFattureStructuralAccountingBlocks,
  extractWorkingViewGuardsInputsFromDoc,
  validateImportFattureStructuralForArchivio,
} from './importFattureWorkingViewGuards.js'
import { validateImportFattureArchivioBridgePreconditions } from './importFattureArchivioPreconditions.js'
import {
  PIANO_CONTI_FIXTURE_MIN,
  CAUSALI_IVA_FIXTURE_MIN,
  buildFatturaPassivaDocBase,
  pnGridBalanced,
  pnGridUnbalanced,
  pnGridWithEmptyRow,
  pnGridBadConto,
  ivaGridOkSingleRow,
  ivaGridMissingCausale,
  ivaGridUnknownCausale,
  ivaGridMismatchDetraibile,
  buildDocMultiRiepilogo,
  ivaGridMultiOk,
  opDraftFromDoc,
  docWithPersistedGrids,
  pnGridBalanced990,
} from './__fixtures__/importFattureGuardsFixtures.js'

const piano = PIANO_CONTI_FIXTURE_MIN
const causali = CAUSALI_IVA_FIXTURE_MIN

function hasTab(blocks, tab) {
  return blocks.some((b) => b.tab === tab)
}

function msgIncludes(blocks, substr) {
  const t = blocks.map((b) => b.message).join(' | ')
  return t.toLowerCase().includes(substr.toLowerCase())
}

test('PN: griglia bilanciata e conti validi → nessun blocco PN/IVA/partitario', () => {
  const doc = buildFatturaPassivaDocBase()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridBalanced(),
    ivaGridRows: ivaGridOkSingleRow(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.equal(blocks.length, 0)
})

test('PN: sbilancio Dare/Avere → blocco con messaggio sbilancio', () => {
  const doc = buildFatturaPassivaDocBase()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridUnbalanced(),
    ivaGridRows: ivaGridOkSingleRow(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.ok(blocks.some((b) => b.message.includes('Sbilancio Prima nota')))
})

test('PN: riga vuota → blocco', () => {
  const doc = buildFatturaPassivaDocBase()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridWithEmptyRow(),
    ivaGridRows: ivaGridOkSingleRow(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.ok(msgIncludes(blocks, 'vuota'))
})

test('PN: conto non nel piano → blocco', () => {
  const doc = buildFatturaPassivaDocBase()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridBadConto(),
    ivaGridRows: ivaGridOkSingleRow(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.ok(msgIncludes(blocks, 'non agganciato'))
})

test('IVA: griglia coerente con documento → OK', () => {
  const doc = buildFatturaPassivaDocBase()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridBalanced(),
    ivaGridRows: ivaGridOkSingleRow('caus-iva-22'),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  const ivaBlocks = blocks.filter((b) => b.tab === 'iva')
  assert.equal(ivaBlocks.length, 0)
})

test('IVA: causale assente → blocco', () => {
  const doc = buildFatturaPassivaDocBase()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridBalanced(),
    ivaGridRows: ivaGridMissingCausale(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.ok(msgIncludes(blocks, 'causale IVA mancante'))
})

test('IVA: causale non in anagrafica → blocco', () => {
  const doc = buildFatturaPassivaDocBase()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridBalanced(),
    ivaGridRows: ivaGridUnknownCausale(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.ok(msgIncludes(blocks, 'non presente in anagrafica'))
})

test('IVA: mismatch documento vs somma griglia (indetraibile errata) → blocco', () => {
  const doc = buildFatturaPassivaDocBase()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridBalanced(),
    ivaGridRows: ivaGridMismatchDetraibile(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.ok(msgIncludes(blocks, 'IVA documento') && msgIncludes(blocks, 'differenza'))
})

test('IVA: due righe / due aliquote coerenti con riepilogo FE → OK', () => {
  const doc = buildDocMultiRiepilogo()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridBalanced990(),
    ivaGridRows: ivaGridMultiOk(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.equal(blocks.length, 0)
})

test('Partitario: totali coerenti → OK', () => {
  const doc = buildFatturaPassivaDocBase()
  const op = opDraftFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridBalanced(),
    ivaGridRows: ivaGridOkSingleRow(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.equal(blocks.filter((b) => b.tab === 'partitario').length, 0)
})

test('Partitario: totale operativo ≠ totale fattura → blocco', () => {
  const doc = buildFatturaPassivaDocBase()
  const raw = { ...doc.ai_raw_response }
  raw[M.OPERATIVE_OVERRIDES] = {
    ...raw[M.OPERATIVE_OVERRIDES],
    totale: '1300,00',
  }
  const docBad = { ...doc, ai_raw_response: raw }
  const op = opDraftFromDoc(docBad)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc: docBad,
    pnGridRows: pnGridBalanced(),
    ivaGridRows: ivaGridOkSingleRow(),
    opDraft: op,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.ok(hasTab(blocks, 'partitario'))
  assert.ok(msgIncludes(blocks, 'Totale fattura'))
})

test('Partitario: totale documento non ricavabile ma totale operativo compilato → blocco dedicato', () => {
  const doc = {
    id: 'doc-no-totale',
    tipo_documento: 'fattura_passiva',
    ai_raw_response: {
      [M.FINAL_STEP_CONFIRMATION]: true,
      numero: '1',
      data: '2026-01-10',
      cedente_denom: 'Beta Spa',
      iva_totale: '220,00',
      [M.OPERATIVE_OVERRIDES]: {
        controparte: 'Beta Spa',
        numero_documento: '1',
        data_documento: '2026-01-10',
        totale: '500,00',
      },
    },
  }
  const extracted = extractWorkingViewGuardsInputsFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: pnGridBalanced(),
    ivaGridRows: ivaGridOkSingleRow(),
    opDraft: extracted.opDraft,
    pianoConti: piano,
    causaliIva: causali,
  })
  assert.ok(
    blocks.some((b) => b.message.includes('non ricavabile') || b.message.includes('impossibile validare')),
  )
})

test('extract + evaluate su blob persistito = validateImportFattureStructuralForArchivio', () => {
  const base = buildFatturaPassivaDocBase()
  const doc = docWithPersistedGrids(base, pnGridBalanced(), ivaGridOkSingleRow())
  const ext = extractWorkingViewGuardsInputsFromDoc(doc)
  const manual = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows: ext.pnGridRows,
    ivaGridRows: ext.ivaGridRows,
    opDraft: ext.opDraft,
    pianoConti: piano,
    causaliIva: causali,
  })
  const wrapped = validateImportFattureStructuralForArchivio(doc, piano, causali)
  assert.equal(manual.length === 0, wrapped.ok)
  if (!wrapped.ok) {
    assert.ok(wrapped.message.length > 0)
  }
})

test('allineamento bridge: stesso esito OK/KO e stesso messaggio di validateImportFattureStructuralForArchivio', () => {
  const base = buildFatturaPassivaDocBase()
  const docKo = docWithPersistedGrids(base, pnGridUnbalanced(), ivaGridOkSingleRow())
  const s = validateImportFattureStructuralForArchivio(docKo, piano, causali)
  const b = validateImportFattureArchivioBridgePreconditions(docKo, piano, '', causali)
  assert.equal(s.ok, b.ok)
  assert.equal(s.message, b.message)
  assert.equal(s.code || 'structural_guards', b.code)

  const docOk = docWithPersistedGrids(base, pnGridBalanced(), ivaGridOkSingleRow())
  const sOk = validateImportFattureStructuralForArchivio(docOk, piano, causali)
  const bOk = validateImportFattureArchivioBridgePreconditions(docOk, piano, '', causali)
  assert.equal(sOk.ok, true)
  assert.equal(bOk.ok, true)
})

test('bridge: assenza passo finale → fallisce prima dei blocchi strutturali', () => {
  const base = buildFatturaPassivaDocBase()
  const raw = { ...base.ai_raw_response }
  delete raw[M.FINAL_STEP_CONFIRMATION]
  const doc = { ...base, ai_raw_response: raw }
  const pre = validateImportFattureArchivioBridgePreconditions(doc, piano, '', causali)
  assert.equal(pre.ok, false)
  assert.equal(pre.code, 'final_flag')
})
