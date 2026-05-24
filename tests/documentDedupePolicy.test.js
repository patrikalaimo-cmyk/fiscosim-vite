import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentDedupeRequest } from '../domain/documentDedupePolicy.js'

function buildPlan() {
  return {
    documentiContabilita: {
      societa_id: 'soc-1',
      numero_documento: 'F-100',
      data_documento: '2026-04-29',
      soggetto_piva: 'IT12345678901',
      soggetto_cf: null,
      soggetto_denominazione: 'Fornitore Spa',
      totale: 122,
    },
  }
}

test('dedupe request builds canonical functional key', () => {
  const result = buildDocumentDedupeRequest(buildPlan())
  assert.equal(result.required, true)
  assert.equal(result.strategy, 'documenti_contabilita_functional_key')
  assert.deepEqual(result.key, {
    societaId: 'soc-1',
    numeroDocumento: 'F-100',
    dataDocumento: '2026-04-29',
    soggettoPiva: 'IT12345678901',
    soggettoCf: null,
    soggettoDenominazione: 'Fornitore Spa',
    totale: 122,
  })
  assert.equal(result.status, 'not_executed')
})

test('dedupe request blocks when number date or subject is missing', () => {
  const plan = buildPlan()
  plan.documentiContabilita.numero_documento = null
  plan.documentiContabilita.data_documento = null
  plan.documentiContabilita.soggetto_piva = null
  plan.documentiContabilita.soggetto_cf = null
  plan.documentiContabilita.soggetto_denominazione = null

  const result = buildDocumentDedupeRequest(plan)
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((b) => b.code === 'P7_MISSING_DOCUMENT_NUMBER'))
  assert.ok(result.blockers.some((b) => b.code === 'P7_MISSING_DOCUMENT_DATE'))
  assert.ok(result.blockers.some((b) => b.code === 'P7_MISSING_COUNTERPARTY'))
})