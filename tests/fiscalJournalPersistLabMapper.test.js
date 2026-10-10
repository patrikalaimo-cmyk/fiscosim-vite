import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveFiscalContractKind } from '../src/modules/contabilita/application/fiscalJournal/resolveFiscalContractKind.js'
import { mapPersistencePlanToFiscalJournalRequest } from '../src/modules/contabilita/application/fiscalJournal/mapPersistencePlanToFiscalJournalRequest.js'
import { isFiscalJournalPersistLabEnabled } from '../src/modules/contabilita/application/fiscalJournal/isFiscalJournalPersistLabEnabled.js'
import { validateFiscalJournalRequest } from '../lib/fiscalJournalRequest.js'

const A = '71000000-0000-4000-8000-000000000001'
const C1 = '71000000-0000-4000-8000-000000000010'
const C2 = '71000000-0000-4000-8000-000000000011'
const C3 = '71000000-0000-4000-8000-000000000012'
const REQ = '71000000-0000-4000-8000-000000000099'

test('fiscal persist LAB flag is OFF by default', () => {
  assert.equal(isFiscalJournalPersistLabEnabled(), false)
  assert.equal(isFiscalJournalPersistLabEnabled(false), false)
  assert.equal(isFiscalJournalPersistLabEnabled(true), true)
})

test('resolveFiscalContractKind maps fattura / NC / split / pagamento / parcella', () => {
  assert.equal(resolveFiscalContractKind({
    policy: { isFatturaAttiva: true, gestionePartitario: 'apertura' },
    vatEntries: [{ tipo: 'vendita' }],
    partEntries: [{ tipo: 'cliente', importo_originale: 1220 }],
  }), 'fattura_attiva')
  assert.equal(resolveFiscalContractKind({
    policy: { notaCredito: true, isNotaCreditoAttiva: true, gestionePartitario: 'apertura' },
    vatEntries: [{ tipo: 'vendita' }],
    partEntries: [{ tipo: 'cliente', importo_originale: -1220 }],
  }), 'nota_credito_attiva')
  assert.equal(resolveFiscalContractKind({
    policy: { gestionePartitario: 'apertura' },
    vatEntries: [{ tipo: 'vendita', split_payment: true }],
    partEntries: [{ tipo: 'cliente', importo_originale: 1000 }],
  }), 'split_attiva')
  assert.equal(resolveFiscalContractKind({
    policy: { gestionePartitario: 'chiusura' },
    vatEntries: [],
    partEntries: [{ documento_id: REQ, importo_chiuso: 500, tipo_movimento: 'chiusura' }],
  }), 'pagamento')
  assert.equal(resolveFiscalContractKind({
    policy: { gestionePartitario: 'apertura' },
    vatEntries: [{ tipo: 'vendita' }],
    partEntries: [{ tipo: 'cliente', importo_originale: 1068.8 }],
    ritenutaEntries: [{ importo_ritenuta: 200 }],
  }), 'parcella_documento')
  assert.equal(resolveFiscalContractKind({
    policy: { isMovimentoGenerico: true, gestionePartitario: 'nessuno' },
    vatEntries: [],
    partEntries: [],
  }), null)
})

test('mapPersistencePlanToFiscalJournalRequest builds FA22 accepted by validator', () => {
  const mapped = mapPersistencePlanToFiscalJournalRequest({
    policy: { isFatturaAttiva: true, gestionePartitario: 'apertura' },
    pnPayload: {
      societa_id: A,
      data_registrazione: '2026-03-15',
      data_documento: '2026-03-15',
      numero_documento: 'FT-A-001',
      descrizione: 'Fattura attiva ordinaria 22 percento',
    },
    righePayload: [
      { conto_id: C1, importo_dare: 1220, importo_avere: 0 },
      { conto_id: C2, importo_dare: 0, importo_avere: 1000 },
      { conto_id: C3, importo_dare: 0, importo_avere: 220 },
    ],
    vatEntries: [{
      tipo: 'vendita', imponibile: 1000, iva: 220, aliquota: 22,
      documento_id: 'FT-A-001', riga_idx: 0, split_payment: false,
    }],
    partEntries: [{
      tipo: 'cliente', conto_id: C1, numero_documento: 'FT-A-001',
      importo_originale: 1220, tipo_movimento: 'apertura',
    }],
    requestId: REQ,
    sourceModule: 'registrazione_manual',
  })
  assert.equal(mapped.ok, true, mapped.reason)
  assert.equal(mapped.request.contract_kind, 'fattura_attiva')
  assert.ok(validateFiscalJournalRequest(mapped.request))
})

test('persistPrimaNotaDraft stays on createPrimaNotaCompleta by default and has LAB branch', () => {
  const pn = readFileSync(
    resolve('src/modules/contabilita/application/persistPrimaNotaDraft.js'),
    'utf8',
  )
  assert.match(pn, /createPrimaNotaCompleta/)
  assert.match(pn, /isFiscalJournalPersistLabEnabled/)
  assert.match(pn, /mapPersistencePlanToFiscalJournalRequest/)
  assert.match(pn, /postFiscalJournalAtomicViaStudioApi/)
  assert.doesNotMatch(pn, /fiscosim_post_fiscal_journal/)
})
