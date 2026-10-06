import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveRegistrazioneSplitPayment } from '../src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneSplitPayment.js'
import { buildSplitPaymentRows } from '../src/modules/contabilita/application/registrazioneOperations/buildSplitPaymentRows.js'
import { buildRegistrazionePartitarioDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazionePartitarioDraft.js'
import { buildRegistrazioneIvaRows } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneIvaRows.js'
import { buildRegistrazioneDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js'
import { normalizeRegistrazioneInput } from '../src/modules/contabilita/application/registrazioneOperations/normalizeRegistrazioneInput.js'
import { buildRegistrazioneCausaleContabilePayload, hydrateRegistrazioneCausaleContabileForm } from '../src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js'
import { mapRegistrazioneManualeToCanonical } from '../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js'
import { aggregateRegistriIvaRows } from '../src/modules/contabilita/application/liquidazioneIvaClient.js'
import { mergeResolvedRowsForVisual } from '../src/modules/contabilita/components/registrazione/mergeResolvedRowsForVisual.js'

const activeInvoice = {
  id: 'caus-fc-generica',
  tipo_causale: 'docivanormale',
  tipo_documento: 'fattura_attiva',
  codice_registro_iva: '02',
  gestione_partite: 'apre',
  conto_iva_split_payment: 'iva-split',
  conto_iva_split_payment_codice: 'IVA-SP',
  conto_iva_split_payment_descrizione: 'IVA split payment',
}

const passiveInvoice = {
  id: 'caus-ff-generica',
  tipo_causale: 'docivanormale',
  tipo_documento: 'fattura_passiva',
  codice_registro_iva: '01',
  gestione_partite: 'apre',
}

test('fattura attiva ordinaria senza cliente split resta ordinaria', () => {
  const split = resolveRegistrazioneSplitPayment({
    header: { clienteFornitoreTipo: 'cliente' },
    causaleContabile: activeInvoice,
  })
  assert.equal(split.active, false)

  const result = buildSplitPaymentRows({
    rows: [{ ruolo: 'soggetto', dare: 1220 }, { ruolo: 'ricavo', avere: 1000 }, { ruolo: 'iva', avere: 220 }],
    splitPayment: split,
    ivaDraft: { totaleImponibile: 1000, totaleIva: 220 },
    causale: activeInvoice,
  })
  assert.equal(result.rows.length, 3)
  assert.equal(result.rows[0].dare, 1220)
})

test('campo causale split payment viene normalizzato, salvato e riletto dal resolver', () => {
  const payload = buildRegistrazioneCausaleContabilePayload({
    ...activeInvoice,
    conto_iva_split_payment: 'conto-split-reale',
  }, { isIva: false })

  assert.equal(payload.conto_iva_split_payment, 'conto-split-reale')

  const hydrated = hydrateRegistrazioneCausaleContabileForm(payload, { isIva: false })
  assert.equal(hydrated.conto_iva_split_payment, 'conto-split-reale')

  const split = resolveRegistrazioneSplitPayment({
    header: { clienteFornitoreTipo: 'cliente', split_payment: true },
    causaleContabile: payload,
  })

  const result = buildSplitPaymentRows({
    rows: [
      { ruolo: 'soggetto', dare: 1220, avere: 0 },
      { ruolo: 'ricavo', dare: 0, avere: 1000 },
      { ruolo: 'iva', dare: 0, avere: 220 },
    ],
    splitPayment: split,
    ivaDraft: { totaleImponibile: 1000, totaleIva: 220 },
    causale: payload,
    pianoConti: [
      { id: 'conto-split-reale', codice: '220199', descrizione: 'IVA split payment' },
    ],
  })

  assert.deepEqual(result.blockers, [])
  assert.equal(result.rows.find((row) => row.id === 'split-payment-dare').conto_id, 'conto-split-reale')
  assert.equal(result.rows.find((row) => row.id === 'split-payment-dare').conto_codice, '220199')
  assert.equal(result.rows.find((row) => row.id === 'split-payment-dare').conto_descrizione, 'IVA split payment')
})

test('fattura attiva ordinaria mantiene riga cliente e IVA ns.debito senza split', () => {
  const draft = buildRegistrazioneDraft({
    header: {
      societaId: 'soc-1',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-07',
      dataDocumento: '2026-06-07',
      numeroDocumento: 'FC-ORD-1',
      clienteFornitoreId: 'cliente-ord',
      clienteFornitoreNome: "Cliente Ordinario",
      clienteFornitoreTipo: 'cliente',
      splitPayment: false,
      split_payment: false,
      causaleContabile: activeInvoice,
    },
    documentData: { totaleDocumento: 1500, totaleImponibile: 1363.64, totaleImposte: 136.36 },
    rows: [
      { id: 'cliente', ruolo: 'soggetto', conto_id: 'cliente-ord', conto_descrizione: 'Cliente Ordinario', dare: 1500, avere: 0 },
      { id: 'ricavo', ruolo: 'ricavo', conto_id: 'ricavo', conto_descrizione: 'Ricavo', dare: 0, avere: 1363.64 },
      { id: 'iva-ordinaria', ruolo: 'iva_debito', conto_id: 'iva-ns', conto_descrizione: 'IVA NS.DEBITO', dare: 0, avere: 136.36 },
    ],
  }, {
    selectedCausale: activeInvoice,
    causaliIva: [{ id: 'iva22', aliquota: 22, registroIva: '02' }],
    pianoConti: [
      { id: 'cliente-ord', codice: 'C-ORD', descrizione: 'Cliente Ordinario', is_cliente: true },
      { id: 'iva-ns', codice: 'IVA-NS', descrizione: 'IVA NS.DEBITO' },
    ],
  })

  assert.equal(draft.draft.header.splitPayment, false)
  const pnRows = draft.draft.rows
  assert.equal(pnRows[0].dare, 1500)
  assert.equal(pnRows[1].avere, 1363.64)
  assert.equal(pnRows[2].avere, 136.36)
  assert.equal(pnRows.filter((row) => String(row.conto_descrizione || '').toLowerCase().includes('split payment')).length, 0)
})

test('fattura attiva generica con cliente split attiva il regime senza dipendere dal codice causale', () => {
  const split = resolveRegistrazioneSplitPayment({
    header: { clienteFornitoreTipo: 'cliente', split_payment: true },
    causaleContabile: activeInvoice,
  })
  assert.equal(split.active, true)
  assert.equal(split.source, 'controparte')
})

test('normalizzazione header riallinea split_payment dal record piano conti fresco anche se l header era stale', () => {
  const normalized = normalizeRegistrazioneInput({
    header: {
      clienteFornitoreId: 'cliente-pa',
      clienteFornitoreNome: 'Cliente PA',
      clienteFornitoreTipo: 'cliente',
      splitPayment: false,
      split_payment: false,
    },
    documentData: { totaleDocumento: 1500, totaleImponibile: 1363.64, totaleImposte: 136.36 },
  }, {
    pianoConti: [
      {
        id: 'cliente-pa',
        codice: 'C001',
        descrizione: 'Cliente PA',
        is_cliente: true,
        split_payment: true,
      },
    ],
    causaliContabili: [activeInvoice],
  })

  assert.equal(normalized.header.splitPayment, true)
  assert.equal(normalized.header.split_payment, true)
})

test('codice causale dedicato senza flag cliente non attiva split', () => {
  const split = resolveRegistrazioneSplitPayment({
    header: { clienteFornitoreTipo: 'cliente' },
    causaleContabile: { ...activeInvoice, codice: 'FCPA' },
  })
  assert.equal(split.active, false)
})

test('fattura passiva non attiva split anche con flag controparte', () => {
  const split = resolveRegistrazioneSplitPayment({
    header: { clienteFornitoreTipo: 'fornitore', split_payment: true },
    causaleContabile: passiveInvoice,
  })
  assert.equal(split.active, false)
})

test('righe PN split usano imponibile per cliente e doppia riga tecnica IVA', () => {
  const result = buildSplitPaymentRows({
    rows: [
      { id: 'cliente', ruolo: 'soggetto', conto_id: 'cliente-pa', dare: 1220, avere: 0 },
      { id: 'ricavo', ruolo: 'ricavo', conto_id: 'ricavo', dare: 0, avere: 1000 },
      { id: 'iva', ruolo: 'iva', conto_id: 'iva-debito', dare: 0, avere: 220 },
    ],
    splitPayment: { active: true },
    ivaDraft: { totaleImponibile: 1000, totaleIva: 220 },
    causale: {
      ...activeInvoice,
      conto_iva_split_payment: 'iva-split-id',
    },
    pianoConti: [
      { id: 'iva-split-id', codice: '220199', descrizione: 'IVA split payment' },
    ],
    header: { clienteFornitoreId: 'cliente-pa' },
  })

  assert.deepEqual(result.blockers, [])
  assert.equal(result.rows.length, 4)
  assert.equal(result.rows.find((row) => row.ruolo === 'soggetto').dare, 1000)
  assert.equal(result.rows.filter((row) => row.source === 'split_payment').length, 2)
  assert.equal(result.rows.find((row) => row.id === 'split-payment-dare').dare, 220)
  assert.equal(result.rows.find((row) => row.id === 'split-payment-avere').avere, 220)
  assert.equal(result.rows.find((row) => row.id === 'split-payment-dare').contoQuery, '220199 - IVA split payment')
  assert.equal(result.rows.find((row) => row.id === 'split-payment-avere').contoQuery, '220199 - IVA split payment')
  assert.equal(result.rows.reduce((sum, row) => sum + Number(row.dare || 0), 0), 1220)
  assert.equal(result.rows.reduce((sum, row) => sum + Number(row.avere || 0), 0), 1220)
})

test('cliente split viene abbassato all imponibile anche quando la riga non porta ruolo esplicito', () => {
  const result = buildSplitPaymentRows({
    rows: [
      { id: 'cliente', conto_id: 'cliente-pa', conto_codice: 'C001', conto_descrizione: 'Cliente PA', dare: 1600, avere: 0 },
      { id: 'ricavo', ruolo: 'ricavo', conto_id: 'ricavo', dare: 0, avere: 1454.55 },
      { id: 'iva', ruolo: 'iva', conto_id: 'iva-debito', dare: 0, avere: 145.45 },
    ],
    splitPayment: { active: true },
    ivaDraft: { totaleImponibile: 1454.55, totaleIva: 145.45 },
    causale: {
      ...activeInvoice,
      conto_iva_split_payment: 'iva-split-id',
    },
    pianoConti: [
      { id: 'iva-split-id', codice: '1 02 40 4306', descrizione: 'IVA VENDITE SPLIT PAYMENT' },
    ],
    header: { clienteFornitoreId: 'cliente-pa' },
  })

  assert.deepEqual(result.blockers, [])
  assert.equal(result.rows.find((row) => row.id === 'cliente').dare, 1454.55)
  assert.equal(result.rows.find((row) => row.id === 'cliente').avere, 0)
  assert.equal(result.rows.find((row) => row.id === 'split-payment-dare').conto_id, 'iva-split-id')
})

test('conto split mancante produce blocco esplicito', () => {
  const result = buildSplitPaymentRows({
    rows: [{ ruolo: 'soggetto', conto_id: 'cliente', dare: 1220 }],
    splitPayment: { active: true },
    ivaDraft: { totaleImponibile: 1000, totaleIva: 220 },
    causale: { ...activeInvoice, conto_iva_split_payment: '', conto_iva_split_payment_codice: '', conto_iva_split_payment_descrizione: '' },
  })
  assert.equal(result.rows.length, 0)
  assert.equal(result.blockers.length, 1)
  assert.equal(result.blockerCode, 'SPLIT_PAYMENT_ACCOUNT_MISSING')
  assert.match(result.blockers[0], /SPLIT_PAYMENT_ACCOUNT_MISSING/)
  assert.match(result.blockers[0], /conto IVA split payment/i)
})

test('draft split con conto mancante blocca la registrazione e conserva il codice errore nel meta', () => {
  const draft = buildRegistrazioneDraft({
    header: {
      societaId: 'soc-1',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-06-07',
      dataDocumento: '2026-06-07',
      numeroDocumento: 'FC-SPLIT-1',
      clienteFornitoreId: 'cliente-pa',
      clienteFornitoreNome: 'Cliente PA',
      clienteFornitoreTipo: 'cliente',
      splitPayment: true,
      split_payment: true,
      causaleContabile: { ...activeInvoice, conto_iva_split_payment: '', conto_iva_split_payment_codice: '', conto_iva_split_payment_descrizione: '' },
    },
    documentData: { totaleDocumento: 1500, totaleImponibile: 1363.64, totaleImposte: 136.36 },
    rows: [
      { id: 'cliente', ruolo: 'soggetto', conto_id: 'cliente-pa', dare: 1500, avere: 0 },
      { id: 'ricavo', ruolo: 'ricavo', conto_id: 'ricavo', dare: 0, avere: 1363.64 },
      { id: 'iva-ordinaria', ruolo: 'iva_debito', conto_id: 'iva-ns', conto_descrizione: 'IVA NS.DEBITO', dare: 0, avere: 136.36 },
    ],
  }, {
    selectedCausale: { ...activeInvoice, conto_iva_split_payment: '', conto_iva_split_payment_codice: '', conto_iva_split_payment_descrizione: '' },
    causaliIva: [{ id: 'iva22', aliquota: 22, registroIva: '02' }],
    pianoConti: [
      { id: 'cliente-pa', codice: 'C001', descrizione: 'Cliente PA', is_cliente: true, split_payment: true },
    ],
  })

  assert.equal(draft.validation.status, 'blocked')
  assert.match(draft.validation.blockers[0], /SPLIT_PAYMENT_ACCOUNT_MISSING/)
  assert.equal(draft.draft.meta.splitPayment.blockerCode, 'SPLIT_PAYMENT_ACCOUNT_MISSING')
  assert.equal(draft.draft.meta.splitPayment.blockerMessage.includes('Conto IVA split payment non configurato'), true)
  assert.equal(draft.draft.rows.length, 0)
})

test('partitario split apre la partita cliente al solo importo incassabile', () => {
  const draft = buildRegistrazionePartitarioDraft({
    header: {
      clienteFornitoreId: 'cliente-pa',
      clienteFornitoreNome: 'Cliente PA',
      numeroDocumento: 'SP-1',
      dataDocumento: '2026-06-07',
    },
    documentData: { totaleDocumento: 1220 },
    partitarioData: {},
    selectedCausale: activeInvoice,
  }, {
    behavior: { showPartitario: true, partitarioMode: 'apertura' },
    selectedCausale: activeInvoice,
    pianoConti: [{ id: 'cliente-pa', is_cliente: true }],
    splitPayment: { active: true },
    splitPaymentImportoIncassabile: 1000,
  })

  assert.equal(draft.importoOriginario, 1000)
  assert.equal(draft.importoAperto, 1000)
  assert.equal(draft.rows[0].importoOriginario, 1000)
  assert.equal(draft.totaleDocumento, 1220)
  assert.equal(draft.importoIncassabile, 1000)
})

test('righe IVA e payload canonico mantengono splitPayment true', () => {
  const ivaRows = buildRegistrazioneIvaRows({
    rows: [{ imponibile: 1000, totale: 1220, aliquota: 22, causaleIvaId: 'iva22' }],
    documentData: { totaleDocumento: 1220 },
    header: { dataRegistrazione: '2026-06-07' },
    causaliIva: [{ id: 'iva22', aliquota: 22, registroIva: '02' }],
    causaleContabile: activeInvoice,
    causaleBehavior: { registroIva: '02', aliquota: 22 },
    splitPayment: true,
  })
  assert.equal(ivaRows.rows[0].splitPayment, true)

  const mapped = mapRegistrazioneManualeToCanonical({
    draft: {
      header: {
        societaId: 'soc-1',
        dataRegistrazione: '2026-06-07',
        dataDocumento: '2026-06-07',
        numeroDocumento: 'SP-1',
        causaleContabile: activeInvoice,
        clienteFornitoreId: 'cliente-pa',
      },
      rows: [
        { conto_id: 'cliente-pa', dare: 1000, avere: 0 },
        { conto_id: 'ricavo', dare: 0, avere: 1000 },
      ],
      documentDraft: { totaleDocumento: 1220 },
      ivaDraft: { active: true, splitPayment: true, rows: ivaRows.rows },
      partitarioDraft: { active: true, mode: 'apertura', rows: [{ action: 'open', importoAperto: 1000 }] },
      totals: { totaleDare: 1000, totaleAvere: 1000 },
    },
  })
  assert.equal(mapped.payload.fiscalContext.splitPayment, true)
  assert.equal(mapped.payload.vat.splitPayment, true)
  assert.equal(mapped.payload.vat.rows[0].splitPayment, true)
})

test('liquidazione evidenzia e sottrae IVA split dal debito effettivo', () => {
  const result = aggregateRegistriIvaRows([
    { tipo: 'vendita', iva: 1300, esigibilita: 'immediata', split_payment: false },
    { tipo: 'vendita', iva: 200, esigibilita: 'immediata', split_payment: true },
    { tipo: 'acquisto', iva_detraibile: 100, esigibilita: 'immediata' },
  ])
  assert.equal(result.iva_debito_registrata, 1500)
  assert.equal(result.iva_split_payment, 200)
  assert.equal(result.iva_debito_effettiva, 1300)
  assert.equal(result.iva_credito, 100)
  assert.equal(result.iva_dovuta, 1200)
  assert.equal(result.saldo, 1200)
})

test('le resolvedRows sostituiscono la riga originaria con stesso id nella resa visiva', () => {
  const rows = [
    { id: 'cliente', ruolo: 'soggetto', dare: 1500, avere: 0, conto_descrizione: 'Cliente' },
    { id: 'ricavo', ruolo: 'ricavo', dare: 0, avere: 1363.64, conto_descrizione: 'Ricavo' },
    { id: 'iva', ruolo: 'iva', dare: 0, avere: 136.36, conto_descrizione: 'IVA NS.DEBITO' },
  ]

  const resolvedRows = [
    { id: 'cliente', ruolo: 'soggetto', dare: 1363.64, avere: 0, conto_descrizione: 'Cliente', splitPayment: true },
    { id: 'ricavo', ruolo: 'ricavo', dare: 0, avere: 1363.64, conto_descrizione: 'Ricavo' },
    { id: 'split-payment-dare', ruolo: 'iva_split_payment', dare: 136.36, avere: 0, technicalDerived: true, conto_descrizione: 'IVA split payment' },
    { id: 'split-payment-avere', ruolo: 'iva_split_payment', dare: 0, avere: 136.36, technicalDerived: true, conto_descrizione: 'IVA split payment' },
  ]

  const visualRows = mergeResolvedRowsForVisual(rows, resolvedRows)
  assert.equal(visualRows.find((row) => row.id === 'cliente').dare, 1363.64)
  assert.equal(visualRows.find((row) => row.id === 'ricavo').avere, 1363.64)
  assert.equal(visualRows.filter((row) => row.id === 'cliente').length, 1)
  assert.equal(visualRows.filter((row) => row.id === 'ricavo').length, 1)
  assert.equal(visualRows.some((row) => row.id === 'iva'), false)
  assert.equal(visualRows.filter((row) => row.technicalDerived).length, 2)
  assert.equal(visualRows.reduce((sum, row) => sum + Number(row.dare || 0), 0), 1500)
  assert.equal(visualRows.reduce((sum, row) => sum + Number(row.avere || 0), 0), 1500)
})
