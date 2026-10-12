import test from 'node:test'
import assert from 'node:assert/strict'
import { isBankFiscalCommitLabEnabled } from '../src/modules/contabilita/application/riconciliazione/isBankFiscalCommitLabEnabled.js'
import { mapBankPayloadToFiscalJournalRequest } from '../src/modules/contabilita/application/riconciliazione/mapBankPayloadToFiscalJournalRequest.js'
import { normalizeBankFiscalCommitHistoryRows } from '../src/modules/contabilita/application/riconciliazione/listBankFiscalCommitHistory.js'

test('bank LAB gate requires isolated + fiscal + bank flags', () => {
  assert.equal(isBankFiscalCommitLabEnabled({}), false)
  assert.equal(isBankFiscalCommitLabEnabled({
    FISCOSIM_ISOLATED_LAB_API: 'true',
    FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED: 'true',
  }), false)
  assert.equal(isBankFiscalCommitLabEnabled({
    FISCOSIM_ISOLATED_LAB_API: 'true',
    FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED: 'true',
    FISCOSIM_BANK_COMMIT_LAB_ENABLED: 'true',
  }), true)
})

test('mapBankPayloadToFiscalJournalRequest builds pagamento close for incasso', () => {
  const mapped = mapBankPayloadToFiscalJournalRequest({
    requestId: '72000000-0000-4000-8000-000000000099',
    context: {
      societaId: '72000000-0000-4000-8000-000000000001',
      registrationDate: '2026-04-15',
      movementId: 'mov-1',
    },
    payload: {
      movementId: 'mov-1',
      primaNotaRighe: [
        { conto_id: '72000000-0000-4000-8000-000000000013', dare: 1220, avere: 0 },
        { conto_id: '72000000-0000-4000-8000-000000000010', dare: 0, avere: 1220 },
      ],
      partitarioMovements: [{
        action: 'chiusura_totale',
        partitaId: '72000000-0000-4000-8000-000000000050',
        importoChiusura: 1220,
      }],
    },
  })
  assert.equal(mapped.ok, true, JSON.stringify(mapped))
  assert.equal(mapped.request.contract_kind, 'pagamento')
  assert.equal(mapped.request.source_module, 'riconciliazione_bancaria')
  assert.equal(mapped.request.ledger.mode, 'close')
  assert.equal(mapped.request.ledger.closures.length, 1)
  assert.equal(mapped.request.rows.length, 2)
})

test('normalizeBankFiscalCommitHistoryRows keeps server history shape', () => {
  const rows = normalizeBankFiscalCommitHistoryRows([{
    request_id: 'r1',
    prima_nota_id: 'pn1',
    created_at: '2026-04-15T10:00:00Z',
    source_module: 'riconciliazione_bancaria',
    contract_kind: 'pagamento',
    descrizione: 'Incasso',
    numero_documento: 'BANK-mov-1',
    data_registrazione: '2026-04-15',
  }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].sourceModule, 'riconciliazione_bancaria')
  assert.equal(rows[0].primaNotaId, 'pn1')
})
