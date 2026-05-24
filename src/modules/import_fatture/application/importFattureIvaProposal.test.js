import test from 'node:test'
import assert from 'node:assert/strict'

import { buildImportFattureIvaProposal } from './importFattureIvaProposal.js'
import { CAUSALI_IVA_FIXTURE_MIN, buildFatturaPassivaDocBase } from './__fixtures__/importFattureGuardsFixtures.js'

const causaliIva = CAUSALI_IVA_FIXTURE_MIN

test('IVA storico dominante e coerente -> proposta storica forte', () => {
  const doc = buildFatturaPassivaDocBase()
  const historicalDocs = [
    { causale_iva_codice: 'F22', data_documento: '2026-03-10' },
    { causale_iva_codice: 'F22', data_documento: '2026-02-10' },
    { causale_iva_codice: 'F22', data_documento: '2026-01-10' },
  ]

  const proposal = buildImportFattureIvaProposal({ doc, historicalDocs, causaliIva })

  assert.equal(proposal.source, 'history')
  assert.equal(proposal.status, 'strong')
  assert.equal(proposal.suggestedCausaleId, 'caus-iva-22')
  assert.equal(proposal.prefillRows[0]?.suggested_causale_iva_id, 'caus-iva-22')
})

test('Anagrafica conto coerente -> priorità massima sulla proposta IVA', () => {
  const doc = buildFatturaPassivaDocBase()
  const historicalDocs = [{ causale_iva_codice: 'F10', data_documento: '2026-03-10' }]

  const proposal = buildImportFattureIvaProposal({
    doc,
    historicalDocs,
    causaliIva,
    masterCausaleIvaId: 'caus-iva-22',
  })

  assert.equal(proposal.source, 'anagrafica')
  assert.equal(proposal.status, 'strong')
  assert.equal(proposal.suggestedCausaleId, 'caus-iva-22')
})

test('Documento leggibile con storico incoerente -> prevale documento con warning prudente', () => {
  const doc = buildFatturaPassivaDocBase({
    riepilogo_iva: [{ imponibile: 1000, imposta: 220, aliquota: 22, causale_iva_codice: 'F22' }],
  })
  const historicalDocs = [
    { causale_iva_codice: 'F10', data_documento: '2026-03-10' },
    { causale_iva_codice: 'F10', data_documento: '2026-02-10' },
  ]

  const proposal = buildImportFattureIvaProposal({ doc, historicalDocs, causaliIva })

  assert.equal(proposal.source, 'document')
  assert.equal(proposal.suggestedCausaleId, 'caus-iva-22')
  assert.match(proposal.warning, /non allineati/i)
})

test('Default per percentuale da impostazioni procedure -> fallback finale', () => {
  const doc = buildFatturaPassivaDocBase({
    riepilogo_iva: [{ imponibile: 1000, imposta: 220, aliquota: 22, causale_iva_id: '' }],
  })
  const causali = causaliIva.map((row) =>
    row.id === 'caus-iva-22' ? { ...row, is_default_per_aliquota: true } : { ...row, is_default_per_aliquota: false },
  )

  const proposal = buildImportFattureIvaProposal({ doc, historicalDocs: [], causaliIva: causali })

  assert.equal(proposal.source, 'default_percentuale')
  assert.equal(proposal.suggestedCausaleId, 'caus-iva-22')
})

test('Storico multi-causale non dominante -> nessuna proposta forte', () => {
  const doc = buildFatturaPassivaDocBase({
    riepilogo_iva: [],
    iva_totale: '',
  })
  const historicalDocs = [
    { causale_iva_codice: 'F22', data_documento: '2026-03-10' },
    { causale_iva_codice: 'F10', data_documento: '2026-03-09' },
  ]

  const proposal = buildImportFattureIvaProposal({ doc, historicalDocs, causaliIva })

  assert.equal(proposal.source, 'manual_review')
  assert.equal(proposal.suggestedCausaleId, '')
  assert.match(proposal.warning, /storico iva/i)
})
