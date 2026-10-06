import { getGuidedImportDemoScenario } from './guidedImportDemoScenarios.js'

export const GUIDED_IMPORT_DEMO_STORAGE_KEY = 'fiscosim:reconciliation:guided-import-demo:v1'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function asObject(list) {
  return list.reduce((acc, item) => {
    acc[item.key] = item
    return acc
  }, {})
}

export function createGuidedImportDemoInitialState(scenarioId) {
  const scenario = getGuidedImportDemoScenario(scenarioId)
  const fieldsList = clone(scenario.fields)
  return {
    scenarioId: scenario.id,
    fieldsByKey: asObject(fieldsList),
    events: [],
    summary: null,
    dryRunResult: null,
    pickerOpen: false,
    pickerTargetKey: '',
    pickerTargetType: '',
    notes: 'Demo - non modifica lo staging reale',
    ignoredSections: [...(scenario.suggestedIgnoreSections || [])],
    multiline: {
      attached: false,
      markedAsNonMovement: false,
      ...(scenario.multilineExample || {}),
    },
  }
}

export function applyScenarioToDemoState(scenarioId) {
  return createGuidedImportDemoInitialState(scenarioId)
}

export function serializeGuidedImportDemoState(state) {
  return JSON.stringify(state)
}

export function parseGuidedImportDemoState(raw) {
  try {
    const parsed = JSON.parse(String(raw || ''))
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.scenarioId) return null
    return parsed
  } catch {
    return null
  }
}
