import { GUIDED_IMPORT_AUDIT_FIXTURE_SCENARIOS } from '../../src/modules/contabilita/components/riconciliazione/guidedImportAuditFixtures.js'
import { reduceGuidedImportAuditSummary } from '../../src/modules/contabilita/components/riconciliazione/reduceGuidedImportAuditSummary.js'
import { validateGuidedImportAuditEvent } from '../../src/modules/contabilita/components/riconciliazione/validateGuidedImportAuditEvent.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function printScenarioSummary(name, summary) {
  console.log(`\nScenario: ${name}`)
  console.log(`- eventCount: ${summary.eventCount}`)
  console.log(`- finalDecision: ${summary.finalDecision || '(empty)'}`)
  console.log(`- templateDecision: ${summary.templateDecision || '(empty)'}`)
  console.log(`- dryRun difference: ${summary.dryRunStatus.difference ?? '(null)'}`)
  console.log(`- blockers: ${summary.blockers.length}`)
  console.log(`- warnings: ${summary.warnings.length}`)
}

const summaries = {}

for (const scenario of GUIDED_IMPORT_AUDIT_FIXTURE_SCENARIOS) {
  const invalidEvents = []
  for (const event of scenario.events) {
    const result = validateGuidedImportAuditEvent(event)
    if (!result.valid) {
      invalidEvents.push({ eventType: event.eventType, blockers: result.blockers })
    }
  }

  assert(invalidEvents.length === 0, `${scenario.id}: eventi non validi -> ${JSON.stringify(invalidEvents)}`)

  const summary = reduceGuidedImportAuditSummary(scenario.events)
  summaries[scenario.id] = summary
  printScenarioSummary(scenario.label, summary)
}

const bancoTrim = summaries.scenario_banco_trimestrale_certificato
assert(bancoTrim.dryRunStatus.difference === 0, 'Banco trimestrale: difference deve essere 0')
assert(bancoTrim.templateDecision === 'template_savable', 'Banco trimestrale: templateDecision deve essere template_savable')

const bancoMens = summaries.scenario_banco_mensile_non_certificante
assert(
  bancoMens.templateDecision === 'template_savable_non_certifying',
  'Banco mensile: templateDecision deve essere template_savable_non_certifying'
)

const manualScenario = summaries.scenario_manual_saldo_finale
const hasManualWarning =
  manualScenario.dryRunStatus.warnings.includes('manual_input_detected_for_critical_balance') ||
  manualScenario.fieldsStatus.closing_balance.warnings.includes('manual_input_non_certifying')
assert(hasManualWarning, 'Scenario manuale: warning coerente su input manuale critico atteso')

console.log('\nAll guided import audit fixture checks passed.')
