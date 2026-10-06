import test from 'node:test'
import assert from 'node:assert/strict'
import { assessWorkingViewIvaDraftRows } from '../domain/importContabilitaDemoCausaliIva.js'
import { mapWorkingViewIvaDraftToCommitRows } from '../domain/importContabilitaDemoWorkingViewCommit.js'
import {
  rebuildImportWorkingViewIvaDraftRows,
  resolveImportWorkingViewStandardCausaleIvaId,
} from '../domain/importContabilitaWorkingViewIvaDraft.js'
import { buildImportContabilitaVatHistoryIndex } from '../domain/importContabilitaVatHistory.js'
import { normalizeImportVatRows } from '../domain/importContabilitaVatRowNormalization.js'

const CAUSALI_IVA = [
  { id: 'std-22', codice: 'AF22', aliquota: 22, is_default_per_aliquota: true, descrizione: 'Acquisti 22%' },
  { id: 'std-10', codice: 'AA10', aliquota: 10, is_default_per_aliquota: true, descrizione: 'Acquisti 10%' },
  { id: 'std-0', codice: 'F0FC', aliquota: 0, is_default_per_aliquota: true, descrizione: 'Fuori campo' },
  { id: 'alt-22', codice: 'ALT22', aliquota: 22, is_default_per_aliquota: false, descrizione: 'Alternativa 22%' },
  { id: 'hist-22', codice: 'HIST22', aliquota: 22, is_default_per_aliquota: false, descrizione: 'Storico 22%' },
]

const VERGNANO_PARSED = {
  imponibile: 350,
  iva: 71,
  totale: 421,
  ivaRows: [
    { aliquota: 22, imponibile: 300, imposta: 66, iva: 66 },
    { aliquota: 10, imponibile: 50, imposta: 5, iva: 5 },
    { aliquota: 0, imponibile: 0, imposta: 0, iva: 0 },
  ],
}

test('25A-FIX-5 — rebuild Working View auto-matcha causali standard per aliquota', () => {
  const rows = rebuildImportWorkingViewIvaDraftRows({
    parsedDocument: VERGNANO_PARSED,
    previousRows: [],
    causaliIva: CAUSALI_IVA,
    isDemoSocieta: false,
    causaliIvaById: new Map(CAUSALI_IVA.map((row) => [row.id, row])),
  })

  assert.equal(rows.length, 2)
  assert.equal(rows[0].causaleIvaId, 'std-22')
  assert.equal(rows[1].causaleIvaId, 'std-10')
})

test('25A-FIX-5 — catena Working View: placeholder 0/0 non blocca controlli', () => {
  const rows = rebuildImportWorkingViewIvaDraftRows({
    parsedDocument: VERGNANO_PARSED,
    previousRows: [],
    causaliIva: CAUSALI_IVA,
    causaliIvaById: new Map(CAUSALI_IVA.map((row) => [row.id, row])),
  })

  const assessment = assessWorkingViewIvaDraftRows(
    [...rows, { aliquota: 0, imponibile: 0, imposta: 0, causaleIvaId: '' }],
    { documentVatTotal: 71 },
  )
  assert.equal(assessment.status, 'ok')
  assert.equal(mapWorkingViewIvaDraftToCommitRows(rows).length, 2)
})

test('25A-FIX-5 — caso Vergnano: movimenti IVA finali = 2 con totali invariati', () => {
  const rows = rebuildImportWorkingViewIvaDraftRows({
    parsedDocument: VERGNANO_PARSED,
    previousRows: [],
    causaliIva: CAUSALI_IVA,
    causaliIvaById: new Map(CAUSALI_IVA.map((row) => [row.id, row])),
  })
  const commitRows = mapWorkingViewIvaDraftToCommitRows(rows)
  assert.equal(commitRows.length, 2)
  assert.equal(commitRows[0].taxable + commitRows[1].taxable, 350)
  assert.equal(commitRows[0].tax + commitRows[1].tax, 71)
})

test('25A-FIX-5 — scelta manuale causale IVA non viene sovrascritta al rebuild', () => {
  const previous = [{
    aliquota: 22,
    imponibile: 300,
    imposta: 66,
    causaleIvaId: 'alt-22',
    causaleIvaManual: true,
  }]

  const rows = rebuildImportWorkingViewIvaDraftRows({
    parsedDocument: {
      ...VERGNANO_PARSED,
      ivaRows: [{ aliquota: 22, imponibile: 300, imposta: 66 }],
    },
    previousRows: previous,
    causaliIva: CAUSALI_IVA,
    causaliIvaById: new Map(CAUSALI_IVA.map((row) => [row.id, row])),
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].causaleIvaId, 'alt-22')
  assert.equal(rows[0].causaleIvaManual, true)
})

test('25A-FIX-5 — resolve standard usa is_default_per_aliquota da causali caricate', () => {
  const resolved = resolveImportWorkingViewStandardCausaleIvaId({
    source: { aliquota: 10, imponibile: 50, imposta: 5 },
    causaliIva: CAUSALI_IVA,
    isDemoSocieta: false,
  })
  assert.equal(resolved, 'std-10')
})

test('25A-FIX-5 — riga 0/0 con natura reale non viene prunata', () => {
  const rows = normalizeImportVatRows([
    { aliquota: 0, imponibile: 0, imposta: 0, natura: 'N4', causaleIvaId: '' },
  ])
  assert.equal(rows.length, 1)
})

test('IMPORT-25A-HISTORY-1 — P1 standard Studio prevale su P2 storico e genera warning non bloccante', () => {
  const historyIndex = buildImportContabilitaVatHistoryIndex([
    {
      tipo: 'acquisto',
      soggetto_piva: '99999999999',
      soggetto_denominazione: 'Fornitore Caffe Test Srl',
      aliquota: 22,
      iva: 66,
      iva_detraibile: 39.6,
      causale_iva_id: 'hist-22',
      created_at: '2026-09-30T10:00:00Z',
    },
  ])

  const rows = rebuildImportWorkingViewIvaDraftRows({
    parsedDocument: {
      ...VERGNANO_PARSED,
      fornitore: { denominazione: 'Fornitore Caffe Test Srl', partitaIva: '99999999999' },
      ivaRows: [{ aliquota: 22, imponibile: 300, imposta: 66 }],
    },
    previousRows: [],
    causaliIva: CAUSALI_IVA,
    counterpartyAccount: {
      isFornitore: true,
      partitaIva: '99999999999',
      descrizione: 'Fornitore Caffe Test Srl',
    },
    causaliIvaById: new Map(CAUSALI_IVA.map((row) => [row.id, row])),
    vatHistoryIndex: historyIndex,
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].causaleIvaId, 'std-22')
  assert.equal(rows[0].causaleIvaSuggestionSource, 'standard')
  assert.equal(rows[0].historicalCausaleIvaId, 'hist-22')
  assert.match(rows[0].causaleIvaHistoryWarning, /Storico controparte diverso/i)
  assert.equal(rows[0].detraibilePercent, 60)

  const assessment = assessWorkingViewIvaDraftRows(rows, { documentVatTotal: 66 })
  assert.equal(assessment.status, 'warning')
  assert.equal(assessment.blockingIssues.length, 0)
  assert.equal(assessment.warnings.length, 1)
})

test('IMPORT-25A-HISTORY-1 — P2 storico propone causale IVA quando manca lo standard Studio', () => {
  const noStandard = CAUSALI_IVA.map((row) => ({ ...row, is_default_per_aliquota: false }))
  const historyIndex = buildImportContabilitaVatHistoryIndex([
    {
      tipo: 'acquisto',
      soggetto_piva: '99999999999',
      aliquota: 22,
      iva: 22,
      iva_detraibile: 13.2,
      causale_iva_id: 'hist-22',
      created_at: '2026-09-30T10:00:00Z',
    },
  ])

  const rows = rebuildImportWorkingViewIvaDraftRows({
    parsedDocument: {
      ...VERGNANO_PARSED,
      ivaRows: [{ aliquota: 22, imponibile: 100, imposta: 22 }],
    },
    causaliIva: noStandard,
    counterpartyAccount: { isFornitore: true, partitaIva: '99999999999' },
    causaliIvaById: new Map(noStandard.map((row) => [row.id, row])),
    vatHistoryIndex: historyIndex,
  })

  assert.equal(rows[0].causaleIvaId, 'hist-22')
  assert.equal(rows[0].causaleIvaSuggestionSource, 'history')
  assert.equal(rows[0].causaleIvaHistoryWarning, '')
  assert.equal(rows[0].detraibilePercent, 60)
})

test('IMPORT-25A-HISTORY-1 — percentuale detrazione manuale resta preservata al rebuild', () => {
  const historyIndex = buildImportContabilitaVatHistoryIndex([
    {
      tipo: 'acquisto',
      soggetto_piva: '99999999999',
      aliquota: 22,
      iva: 22,
      iva_detraibile: 13.2,
      causale_iva_id: 'hist-22',
      created_at: '2026-09-30T10:00:00Z',
    },
  ])
  const previous = [{
    aliquota: 22,
    imponibile: 100,
    imposta: 22,
    causaleIvaId: 'std-22',
    detraibilePercent: 75,
    detraibileManual: true,
  }]

  const rows = rebuildImportWorkingViewIvaDraftRows({
    parsedDocument: {
      ...VERGNANO_PARSED,
      ivaRows: [{ aliquota: 22, imponibile: 100, imposta: 22 }],
    },
    previousRows: previous,
    causaliIva: CAUSALI_IVA,
    counterpartyAccount: { isFornitore: true, partitaIva: '99999999999' },
    causaliIvaById: new Map(CAUSALI_IVA.map((row) => [row.id, row])),
    vatHistoryIndex: historyIndex,
  })

  assert.equal(rows[0].detraibileManual, true)
  assert.equal(rows[0].detraibilePercent, 75)
  assert.equal(rows[0].detraibileImposta, 16.5)
  assert.equal(rows[0].indetraibileImposta, 5.5)
})

test('IMPORT-25A-HISTORY-1 — causale preferita anagrafica non supera la causale standard di Studio', () => {
  const resolved = resolveImportWorkingViewStandardCausaleIvaId({
    source: { aliquota: 22, imponibile: 100, imposta: 22 },
    counterpartyAccount: { causaleIvaId: 'alt-22' },
    causaliIva: CAUSALI_IVA,
    isDemoSocieta: false,
  })

  assert.equal(resolved, 'std-22')
})

