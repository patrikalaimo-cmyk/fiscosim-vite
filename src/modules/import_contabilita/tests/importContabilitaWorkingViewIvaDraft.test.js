import test from 'node:test'
import assert from 'node:assert/strict'
import { assessWorkingViewIvaDraftRows } from '../domain/importContabilitaDemoCausaliIva.js'
import { mapWorkingViewIvaDraftToCommitRows } from '../domain/importContabilitaDemoWorkingViewCommit.js'
import {
  rebuildImportWorkingViewIvaDraftRows,
  resolveImportWorkingViewStandardCausaleIvaId,
} from '../domain/importContabilitaWorkingViewIvaDraft.js'
import { normalizeImportVatRows } from '../domain/importContabilitaVatRowNormalization.js'

const CAUSALI_IVA = [
  { id: 'std-22', codice: 'AF22', aliquota: 22, is_default_per_aliquota: true, descrizione: 'Acquisti 22%' },
  { id: 'std-10', codice: 'AA10', aliquota: 10, is_default_per_aliquota: true, descrizione: 'Acquisti 10%' },
  { id: 'std-0', codice: 'F0FC', aliquota: 0, is_default_per_aliquota: true, descrizione: 'Fuori campo' },
  { id: 'alt-22', codice: 'ALT22', aliquota: 22, is_default_per_aliquota: false, descrizione: 'Alternativa 22%' },
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
