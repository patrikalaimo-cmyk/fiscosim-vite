import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyStudioRuleFallback,
  looksLikeUuid,
  resolveStudioRuleToSocietaTargets,
} from './resolveStudioRuleToSocietaTargets.js'

const TARGET = {
  pianoConti: [
    { id: 'soc-d-costo', codice: '6.01.01.001', descrizione: 'Acquisti caffe', tipo: 'economico', natura: 'costo' },
    { id: 'soc-d-ricavo', codice: '7.01.01.001', descrizione: 'Ricavi', tipo: 'economico', natura: 'ricavo' },
  ],
  causaliContabili: [
    { id: 'soc-d-ff', codice: 'FF', descrizione: 'Fattura acquisto' },
  ],
  causaliIva: [
    { id: 'soc-d-iva22', codice: 'AF22', aliquota: 22, is_default_per_aliquota: true },
    { id: 'soc-d-iva10', codice: 'AA10', aliquota: 10, is_default_per_aliquota: true },
  ],
}

test('SG-L4 LE-S02 — rifiuta UUID conti/causali alieni', () => {
  assert.equal(looksLikeUuid('72000000-0000-4000-8000-000000000099'), true)
  const resolved = resolveStudioRuleToSocietaTargets({
    id: 'rule-alien',
    accountId: '72000000-0000-4000-8000-000000000099',
    causaleId: '72000000-0000-4000-8000-000000000098',
    accountCode: '6.01.01.001',
  }, TARGET)
  assert.equal(resolved.ok, false)
  assert.ok(resolved.blockers.includes('studio_rule_forbids_foreign_account_uuid'))
  assert.ok(resolved.blockers.includes('studio_rule_forbids_foreign_causale_uuid'))
  assert.equal(resolved.account, null)
})

test('SG-L4 — risolve per codice/natura nella società target', () => {
  const byCode = resolveStudioRuleToSocietaTargets({
    id: 'rule-code',
    accountCode: '6.01.01.001',
    causaleCode: 'FF',
    causaleIvaCode: 'AF22',
  }, TARGET)
  assert.equal(byCode.ok, true)
  assert.equal(byCode.account?.id, 'soc-d-costo')
  assert.equal(byCode.causale?.id, 'soc-d-ff')
  assert.equal(byCode.causaleIva?.id, 'soc-d-iva22')
  assert.equal(byCode.resolvedBy.account, 'code')

  const byNatura = resolveStudioRuleToSocietaTargets({
    id: 'rule-natura',
    accountNatura: 'ricavo',
    aliquota: 10,
  }, TARGET)
  assert.equal(byNatura.ok, true)
  assert.equal(byNatura.account?.id, 'soc-d-ricavo')
  assert.equal(byNatura.causaleIva?.id, 'soc-d-iva10')
  assert.equal(byNatura.resolvedBy.account, 'natura')
  assert.equal(byNatura.resolvedBy.causaleIva, 'aliquota_default')
})

test('SG-L4 — fallback studio solo se manca suggestion più forte', () => {
  const rule = { accountCode: '6.01.01.001', causaleCode: 'FF' }
  const skipped = applyStudioRuleFallback({
    hasSuggestion: true,
    rule,
    targetSocietaCatalog: TARGET,
  })
  assert.equal(skipped.applied, false)
  assert.equal(skipped.reason, 'stronger_suggestion_present')

  const applied = applyStudioRuleFallback({
    hasSuggestion: false,
    rule,
    targetSocietaCatalog: TARGET,
  })
  assert.equal(applied.applied, true)
  assert.equal(applied.resolved.account?.id, 'soc-d-costo')
})
