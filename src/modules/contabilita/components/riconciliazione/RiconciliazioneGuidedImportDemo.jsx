import { useEffect, useMemo, useState } from 'react'
import GuidedImportProposalsTable from './GuidedImportProposalsTable.jsx'
import GuidedImportExtractedRowsPicker from './GuidedImportExtractedRowsPicker.jsx'
import GuidedImportDryRunResult from './GuidedImportDryRunResult.jsx'
import RiconciliazioneGuidedImportAuditSummary from './RiconciliazioneGuidedImportAuditSummary.jsx'
import { buildGuidedImportAuditEvent } from './buildGuidedImportAuditEvent.js'
import { validateGuidedImportAuditEvent } from './validateGuidedImportAuditEvent.js'
import { reduceGuidedImportAuditSummary } from './reduceGuidedImportAuditSummary.js'
import {
  GUIDED_IMPORT_AUDIT_COLUMN_PRESETS,
  GUIDED_IMPORT_AUDIT_EVENT_SOURCES,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES,
} from './guidedImportAuditEventTypes.js'
import {
  GUIDED_IMPORT_DEMO_PRESET_DESCRIPTIONS,
  GUIDED_IMPORT_DEMO_SCENARIOS,
  getGuidedImportDemoScenario,
} from './guidedImportDemoScenarios.js'
import {
  GUIDED_IMPORT_DEMO_STORAGE_KEY,
  applyScenarioToDemoState,
  parseGuidedImportDemoState,
  serializeGuidedImportDemoState,
} from './guidedImportDemoState.js'

function scenarioAuditMeta(scenario) {
  return {
    auditId: `guided-import-demo-audit-${scenario.id}`,
    importId: `guided-import-demo-import-${scenario.id}`,
    sourceFileName: `demo-${scenario.id}.pdf`,
    profileCandidate: scenario.label,
  }
}

function parseAmountLoose(value) {
  if (value == null) return null
  const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function toStringValue(value) {
  if (value == null) return ''
  return String(value)
}

function mapTemplateDecisionEvent(templateDecision) {
  if (templateDecision === 'template_savable') return GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_SAVABLE
  if (templateDecision === 'template_savable_non_certifying') return GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_SAVABLE_NON_CERTIFYING
  return GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_NOT_SAVABLE
}

function mapImportDecisionEvent(finalDecision) {
  if (finalDecision === 'certified_import') return GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_CERTIFIED
  if (finalDecision === 'high_confidence_review') return GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_HIGH_CONFIDENCE_REVIEW
  if (finalDecision === 'import_only') return GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_IMPORT_ONLY
  if (finalDecision === 'unusable_import') return GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_UNUSABLE
  return GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_LOW_CONFIDENCE_REVIEW
}

function createSeedEvents(scenario) {
  const meta = scenarioAuditMeta(scenario)
  const timestamp = new Date().toISOString()
  const events = []

  const push = (eventType, payload, source = GUIDED_IMPORT_AUDIT_EVENT_SOURCES.SYSTEM) => {
    const built = buildGuidedImportAuditEvent({
      ...meta,
      eventType,
      payload,
      source,
      operatorId: 'demo_operator',
      timestamp,
    })
    const validation = validateGuidedImportAuditEvent(built)
    events.push({
      ...built,
      warnings: [...(built.warnings || []), ...(validation.warnings || [])],
      blockers: [...(built.blockers || []), ...(validation.blockers || [])],
    })
  }

  push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_IMPORT_STARTED, { mode: 'guided_import_demo', demo: true })

  scenario.fields.forEach((field) => {
    if (!field.fieldId) return
    push(
      GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED,
      {
        fieldId: field.fieldId,
        proposedValue: field.proposedValue,
        finalValue: field.finalValue,
        confidenceBefore: field.confidence,
        source: field.source,
      },
      GUIDED_IMPORT_AUDIT_EVENT_SOURCES.SYSTEM
    )
  })

  const header = scenario.fields.find((item) => item.key === 'movement_header')
  const first = scenario.fields.find((item) => item.key === 'first_movement_row')
  const last = scenario.fields.find((item) => item.key === 'last_movement_row')
  const preset = scenario.fields.find((item) => item.key === 'column_preset')

  if (header?.finalValue) {
    push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_HEADER_SELECTED, {
      headerRowId: first?.finalValue || 'row-header',
      rawText: header.finalValue,
      source: 'demo_seed',
    })
  }
  if (first?.finalValue) {
    push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_FIRST_ROW_SELECTED, {
      firstMovementRowId: first.finalValue,
      source: 'demo_seed',
    })
  }
  if (last?.finalValue) {
    push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_LAST_ROW_SELECTED, {
      lastMovementRowId: last.finalValue,
      source: 'demo_seed',
    })
  }
  if (preset?.finalValue) {
    push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.COLUMN_PRESET_SELECTED, {
      selectedColumnPreset: preset.finalValue,
      source: 'demo_seed',
    })
  }

  ;(scenario.suggestedIgnoreSections || []).forEach((section, index) => {
    push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_CONFIRMED, {
      sectionType: section,
      startRowId: `seed-ignore-${index + 1}`,
      endRowId: `seed-ignore-${index + 1}`,
      source: 'demo_seed',
      operatorConfirmed: true,
    })
  })

  if (scenario.multilineExample?.parentRowId) {
    push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_RULE_PROPOSED, {
      rule: scenario.multilineExample.text,
      reason: 'demo_seed_multiline',
      source: 'demo_seed',
    })
  }

  return events
}

export default function RiconciliazioneGuidedImportDemo({ open, onClose }) {
  const [demoState, setDemoState] = useState(() => applyScenarioToDemoState(GUIDED_IMPORT_DEMO_SCENARIOS[0].id))

  const activeScenario = useMemo(() => getGuidedImportDemoScenario(demoState.scenarioId), [demoState.scenarioId])
  const fieldRows = useMemo(() => activeScenario.fields.map((field) => demoState.fieldsByKey[field.key] || field), [activeScenario.fields, demoState.fieldsByKey])

  useEffect(() => {
    if (!open) return
    const savedRaw = window.localStorage.getItem(GUIDED_IMPORT_DEMO_STORAGE_KEY)
    const restored = parseGuidedImportDemoState(savedRaw)
    if (restored?.scenarioId && restored?.fieldsByKey) {
      setDemoState(restored)
      return
    }

    const initial = applyScenarioToDemoState(activeScenario.id)
    const seeded = createSeedEvents(activeScenario)
    setDemoState({
      ...initial,
      events: seeded,
      summary: reduceGuidedImportAuditSummary(seeded),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    window.localStorage.setItem(GUIDED_IMPORT_DEMO_STORAGE_KEY, serializeGuidedImportDemoState(demoState))
  }, [demoState, open])

  const pushEvent = (eventType, payload, source = GUIDED_IMPORT_AUDIT_EVENT_SOURCES.OPERATOR) => {
    const meta = scenarioAuditMeta(activeScenario)
    const built = buildGuidedImportAuditEvent({
      ...meta,
      eventType,
      payload,
      source,
      operatorId: 'demo_operator',
    })
    const validation = validateGuidedImportAuditEvent(built)
    const completeEvent = {
      ...built,
      warnings: [...(built.warnings || []), ...(validation.warnings || [])],
      blockers: [...(built.blockers || []), ...(validation.blockers || [])],
    }

    setDemoState((prev) => {
      const nextEvents = [...prev.events, completeEvent]
      return {
        ...prev,
        events: nextEvents,
        summary: reduceGuidedImportAuditSummary(nextEvents),
      }
    })
  }

  const setField = (fieldKey, patch) => {
    setDemoState((prev) => ({
      ...prev,
      fieldsByKey: {
        ...prev.fieldsByKey,
        [fieldKey]: {
          ...prev.fieldsByKey[fieldKey],
          ...patch,
        },
      },
    }))
  }

  const handleScenarioChange = (scenarioId) => {
    const scenario = getGuidedImportDemoScenario(scenarioId)
    const initial = applyScenarioToDemoState(scenario.id)
    const seeded = createSeedEvents(scenario)
    setDemoState({
      ...initial,
      events: seeded,
      summary: reduceGuidedImportAuditSummary(seeded),
      notes: `Scenario demo caricato: ${scenario.label}`,
    })
  }

  const handleConfirmField = (fieldKey) => {
    const field = demoState.fieldsByKey[fieldKey]
    if (!field) return

    if (field.fieldId) {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_CONFIRMED, {
        fieldId: field.fieldId,
        finalValue: field.finalValue,
        source: 'demo_operator',
      })
      setField(fieldKey, { status: 'confirmed', source: 'operator_confirmed' })
      return
    }

    if (field.actionType === 'movement_header' || field.actionType === 'movement_first' || field.actionType === 'movement_last') {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_SECTION_CONFIRMED, {
        headerRowId: toStringValue(demoState.fieldsByKey.movement_header?.finalValue),
        firstMovementRowId: toStringValue(demoState.fieldsByKey.first_movement_row?.finalValue),
        lastMovementRowId: toStringValue(demoState.fieldsByKey.last_movement_row?.finalValue),
      })
      setField(fieldKey, { status: 'confirmed' })
      return
    }

    if (field.actionType === 'ignore_sections') {
      demoState.ignoredSections.forEach((section, index) => {
        pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_CONFIRMED, {
          sectionType: section,
          startRowId: `ignore-${index + 1}`,
          endRowId: `ignore-${index + 1}`,
          source: 'demo_operator',
          operatorConfirmed: true,
        })
      })
      setField(fieldKey, { status: 'confirmed', source: 'operator_confirmed' })
      return
    }

    if (field.actionType === 'multiline') {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_RULE_CONFIRMED, {
        rule: demoState.multiline.text || 'Regola multilinea demo',
        reason: 'confirmed_in_demo',
      })
      setField(fieldKey, { status: 'confirmed', source: 'operator_confirmed' })
    }
  }

  const handleManualChangeField = (fieldKey, nextValue) => {
    const field = demoState.fieldsByKey[fieldKey]
    if (!field || !field.fieldId || !field.allowManualEdit) return

    pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MANUAL_CHANGED, {
      fieldId: field.fieldId,
      previousValue: field.finalValue,
      finalValue: nextValue,
      reason: 'manual_edit_demo',
      source: 'operator_demo',
    })
    setField(fieldKey, {
      finalValue: nextValue,
      status: 'modified_manual',
      source: 'manual_demo',
    })
  }

  const handleClearField = (fieldKey) => {
    const field = demoState.fieldsByKey[fieldKey]
    if (!field) return

    if (field.fieldId) {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_CLEARED, {
        fieldId: field.fieldId,
        previousValue: field.finalValue,
        finalValue: '',
      })
    }

    if (field.actionType === 'movement_header' || field.actionType === 'movement_first' || field.actionType === 'movement_last') {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_SECTION_CLEARED, {
        reason: 'field_cleared_demo',
      })
    }

    if (field.actionType === 'ignore_sections') {
      demoState.ignoredSections.forEach((section, index) => {
        pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_REMOVED, {
          sectionType: section,
          startRowId: `ignore-${index + 1}`,
        })
      })
      setDemoState((prev) => ({ ...prev, ignoredSections: [] }))
    }

    setField(fieldKey, {
      finalValue: '',
      status: 'missing',
      source: 'cleared_demo',
    })
  }

  const handleRestoreField = (fieldKey) => {
    const field = demoState.fieldsByKey[fieldKey]
    if (!field) return

    if (field.fieldId) {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_RESTORED_FROM_PROPOSAL, {
        fieldId: field.fieldId,
        finalValue: field.proposedValue,
        source: 'restore_demo',
      })
    }

    setField(fieldKey, {
      finalValue: field.proposedValue,
      status: 'proposed',
      source: 'restored_from_proposal',
    })
  }

  const handleOpenRowPicker = (fieldKey) => {
    const field = demoState.fieldsByKey[fieldKey]
    if (!field) return
    setDemoState((prev) => ({
      ...prev,
      pickerOpen: true,
      pickerTargetKey: fieldKey,
      pickerTargetType: field.actionType || 'document',
    }))
  }

  const handleSelectRowFromPicker = (row, selectedAmount) => {
    const fieldKey = demoState.pickerTargetKey
    const field = demoState.fieldsByKey[fieldKey]
    if (!field || !row) return

    if (field.fieldId) {
      const numericAmount = parseAmountLoose(selectedAmount)
      const finalValue = field.fieldId.includes('balance') || field.fieldId.includes('total')
        ? (numericAmount != null ? String(numericAmount) : row.text)
        : row.text
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_SELECTED_FROM_ROW, {
        fieldId: field.fieldId,
        selectedRowId: row.rowId,
        rawText: row.text,
        pageNumber: row.pageNumber,
        finalValue,
        source: 'row_picker_demo',
      })
      setField(fieldKey, {
        finalValue,
        status: 'selected_from_row',
        source: `${row.rowId}`,
      })
    } else if (field.actionType === 'movement_header') {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_HEADER_SELECTED, {
        headerRowId: row.rowId,
        rawText: row.text,
        pageNumber: row.pageNumber,
      })
      setField(fieldKey, { finalValue: row.text, status: 'selected_from_row', source: row.rowId })
    } else if (field.actionType === 'movement_first') {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_FIRST_ROW_SELECTED, {
        firstMovementRowId: row.rowId,
        pageNumber: row.pageNumber,
      })
      setField(fieldKey, { finalValue: row.rowId, status: 'selected_from_row', source: row.rowId })
    } else if (field.actionType === 'movement_last') {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_LAST_ROW_SELECTED, {
        lastMovementRowId: row.rowId,
        pageNumber: row.pageNumber,
      })
      setField(fieldKey, { finalValue: row.rowId, status: 'selected_from_row', source: row.rowId })
    } else if (field.actionType === 'ignore_sections') {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_CONFIRMED, {
        sectionType: row.text,
        startRowId: row.rowId,
        endRowId: row.rowId,
        source: 'row_picker_demo',
        operatorConfirmed: true,
      })
      setDemoState((prev) => ({
        ...prev,
        ignoredSections: Array.from(new Set([...prev.ignoredSections, row.text])),
      }))
    } else if (field.actionType === 'multiline') {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_ROW_ATTACHED, {
        parentRowId: row.rowId,
        childRowIds: activeScenario.multilineExample?.childRowIds || [],
      })
      setDemoState((prev) => ({
        ...prev,
        multiline: {
          ...prev.multiline,
          attached: true,
          parentRowId: row.rowId,
        },
      }))
    }

    setDemoState((prev) => ({
      ...prev,
      pickerOpen: false,
      pickerTargetKey: '',
      pickerTargetType: '',
      notes: `Riga ${row.rowId} selezionata per ${field.label}`,
    }))
  }

  const handleRunDryRun = () => {
    const dryRun = activeScenario.dryRunResult
    const totals = {
      totalIn: dryRun.totalIn,
      totalOut: dryRun.totalOut,
      openingBalance: dryRun.openingBalance,
      closingBalanceOfficial: dryRun.closingBalanceOfficial,
      calculatedClosingBalance: dryRun.calculatedClosingBalance,
    }

    pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_STARTED, {
      mode: 'demo_dry_run',
    }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.DRY_RUN)

    pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_COMPLETED, {
      movementsExtracted: dryRun.movementsExtracted,
      totalIn: totals.totalIn,
      totalOut: totals.totalOut,
      openingBalance: totals.openingBalance,
      closingBalanceOfficial: totals.closingBalanceOfficial,
      calculatedClosingBalance: totals.calculatedClosingBalance,
      difference: dryRun.difference,
      parseStatus: dryRun.parseStatus,
      parseReliabilityLevel: dryRun.parseReliabilityLevel,
      warnings: dryRun.warnings,
      blockers: dryRun.blockers,
      reviewRows: dryRun.finalDecision === 'low_confidence_review' ? 3 : 0,
      rejectedRows: 0,
      ignoredRows: demoState.ignoredSections.length,
      multilineAttachedRows: demoState.multiline.attached ? 1 : 0,
      confidenceOverall: dryRun.finalDecision === 'certified_import' ? 0.99 : dryRun.finalDecision === 'high_confidence_review' ? 0.84 : 0.41,
    }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.DRY_RUN)

    pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_DECISION_SET, {
      templateDecision: dryRun.templateDecision,
      dryRunAuditRef: `dry-run-${activeScenario.id}`,
    })
    pushEvent(mapTemplateDecisionEvent(dryRun.templateDecision), {
      dryRunAuditRef: `dry-run-${activeScenario.id}`,
    })

    pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_DECISION_SET, {
      finalDecision: dryRun.finalDecision,
    })
    pushEvent(mapImportDecisionEvent(dryRun.finalDecision), {})

    setDemoState((prev) => ({
      ...prev,
      dryRunResult: dryRun,
      notes: `Prova parsing completata: ${dryRun.finalDecision}`,
    }))
  }

  const handlePresetChange = (nextPreset) => {
    setField('column_preset', {
      finalValue: nextPreset,
      status: 'confirmed',
      source: 'operator_preset',
    })
    pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.COLUMN_PRESET_SELECTED, {
      selectedColumnPreset: nextPreset,
      source: 'operator_demo',
    })
  }

  const toggleIgnoreSection = (section) => {
    const exists = demoState.ignoredSections.includes(section)
    if (exists) {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_REMOVED, {
        sectionType: section,
        startRowId: `section-${section}`,
      })
      setDemoState((prev) => ({
        ...prev,
        ignoredSections: prev.ignoredSections.filter((item) => item !== section),
      }))
      return
    }

    pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_CONFIRMED, {
      sectionType: section,
      startRowId: `section-${section}`,
      endRowId: `section-${section}`,
      operatorConfirmed: true,
      source: 'operator_demo',
    })
    setDemoState((prev) => ({
      ...prev,
      ignoredSections: [...prev.ignoredSections, section],
    }))
  }

  const toggleMultilineAttach = () => {
    const parentRowId = activeScenario.multilineExample?.parentRowId || 'row-parent-demo'
    const childRowIds = activeScenario.multilineExample?.childRowIds || []
    if (demoState.multiline.attached) {
      pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_ROW_DETACHED, {
        parentRowId,
        childRowIds,
      })
      setDemoState((prev) => ({
        ...prev,
        multiline: { ...prev.multiline, attached: false },
      }))
      return
    }

    pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_ROW_ATTACHED, {
      parentRowId,
      childRowIds,
    })
    setDemoState((prev) => ({
      ...prev,
      multiline: { ...prev.multiline, attached: true },
    }))
  }

  const toggleMultilineNonMovement = () => {
    const next = !demoState.multiline.markedAsNonMovement
    pushEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.EXTRACTED_ROW_MARKED_AS_NON_MOVEMENT, {
      selectedRowId: activeScenario.multilineExample?.parentRowId || 'row-parent-demo',
      nonMovement: next,
      reason: 'demo_toggle_non_movement',
    })
    setDemoState((prev) => ({
      ...prev,
      multiline: { ...prev.multiline, markedAsNonMovement: next },
    }))
  }

  const currentPreset = demoState.fieldsByKey.column_preset?.finalValue || GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 8, 15, 0.72)', zIndex: 1100, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: 'min(1280px, 96vw)', maxHeight: '92vh', overflow: 'auto', borderRadius: 16, border: '1px solid rgba(157, 185, 213, 0.24)', background: 'linear-gradient(180deg, rgba(8, 17, 31, 0.98) 0%, rgba(6, 12, 21, 0.98) 100%)', color: '#eef6ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'flex-start', padding: '.7rem .8rem', borderBottom: '1px solid rgba(157, 185, 213, 0.2)' }}>
          <div>
            <div style={{ fontSize: '.84rem', fontWeight: 900, color: '#9fd0ff' }}>Guida FiscoSim demo operativa</div>
            <div style={{ fontSize: '.67rem', color: 'rgba(211, 224, 238, 0.86)', marginTop: '.06rem' }}>Demo - non modifica lo staging reale</div>
            <div style={{ fontSize: '.65rem', color: 'rgba(211, 224, 238, 0.8)', marginTop: '.08rem' }}>{demoState.notes}</div>
          </div>
          <button type="button" className="btn-sec" style={{ minHeight: 24, fontSize: '.62rem' }} onClick={onClose}>Chiudi demo</button>
        </div>

        <div style={{ padding: '.65rem .8rem', display: 'grid', gap: '.55rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.4rem' }}>
            <label style={{ fontSize: '.66rem', color: '#9fd0ff' }}>Scenario demo</label>
            <select
              value={demoState.scenarioId}
              onChange={(event) => handleScenarioChange(event.target.value)}
              style={{ minHeight: 26, borderRadius: 9, border: '1px solid rgba(157, 185, 213, 0.22)', background: 'rgba(8, 18, 31, 0.9)', color: '#eef6ff', fontSize: '.66rem', padding: '0 .4rem', minWidth: 320 }}
            >
              {GUIDED_IMPORT_DEMO_SCENARIOS.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>{scenario.label}</option>
              ))}
            </select>
            <button type="button" className="btn-sec" style={{ minHeight: 24, fontSize: '.62rem' }} onClick={handleRunDryRun}>Prova parsing</button>
          </div>

          <div style={{ fontSize: '.68rem', color: 'rgba(211, 224, 238, 0.9)' }}>{activeScenario.description}</div>

          <GuidedImportProposalsTable
            fields={fieldRows}
            onConfirm={handleConfirmField}
            onClear={handleClearField}
            onRestore={handleRestoreField}
            onPickRow={handleOpenRowPicker}
            onManualChange={handleManualChangeField}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '.5rem' }}>
            <div style={{ border: '1px solid rgba(157, 185, 213, 0.2)', borderRadius: 12, padding: '.5rem .55rem', display: 'grid', gap: '.38rem' }}>
              <div style={{ fontSize: '.68rem', color: '#9fd0ff', textTransform: 'uppercase', letterSpacing: '.06em' }}>Preset colonne</div>
              <select
                value={currentPreset}
                onChange={(event) => handlePresetChange(event.target.value)}
                style={{ minHeight: 26, borderRadius: 9, border: '1px solid rgba(157, 185, 213, 0.22)', background: 'rgba(8, 18, 31, 0.9)', color: '#eef6ff', fontSize: '.66rem', padding: '0 .4rem' }}
              >
                {Object.values(GUIDED_IMPORT_AUDIT_COLUMN_PRESETS).map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
              <div style={{ fontSize: '.66rem', color: 'rgba(211, 224, 238, 0.88)' }}>{GUIDED_IMPORT_DEMO_PRESET_DESCRIPTIONS[currentPreset] || '-'}</div>
            </div>

            <div style={{ border: '1px solid rgba(157, 185, 213, 0.2)', borderRadius: 12, padding: '.5rem .55rem', display: 'grid', gap: '.38rem' }}>
              <div style={{ fontSize: '.68rem', color: '#9fd0ff', textTransform: 'uppercase', letterSpacing: '.06em' }}>Sezioni da ignorare</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                {['Riassunto Scalare', 'Elementi per il conteggio competenze', 'Informativa', 'Footer legale'].map((section) => {
                  const selected = demoState.ignoredSections.includes(section)
                  return (
                    <button
                      key={section}
                      type="button"
                      className="btn-sec"
                      onClick={() => toggleIgnoreSection(section)}
                      style={{ minHeight: 24, fontSize: '.62rem', borderColor: selected ? 'rgba(142, 231, 182, 0.42)' : undefined, color: selected ? '#8ee7b6' : '#dfe9f4' }}
                    >
                      {selected ? 'Rimuovi' : 'Ignora'} {section}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid rgba(157, 185, 213, 0.2)', borderRadius: 12, padding: '.5rem .55rem', display: 'grid', gap: '.35rem' }}>
            <div style={{ fontSize: '.68rem', color: '#9fd0ff', textTransform: 'uppercase', letterSpacing: '.06em' }}>Multilinea demo</div>
            <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>{activeScenario.multilineExample?.text || 'RATA PRESTITO | Quota capitale | Interessi | Spese'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
              <button type="button" className="btn-sec" style={{ minHeight: 24, fontSize: '.62rem' }} onClick={toggleMultilineAttach}>
                {demoState.multiline.attached ? 'Scollega multilinea' : 'Conferma multilinea collegata'}
              </button>
              <button type="button" className="btn-sec" style={{ minHeight: 24, fontSize: '.62rem' }} onClick={toggleMultilineNonMovement}>
                {demoState.multiline.markedAsNonMovement ? 'Segna come movimento' : 'Marca come non movimento'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '.5rem' }}>
            <GuidedImportDryRunResult
              dryRunResult={demoState.dryRunResult}
              onUseImportOnly={() => setDemoState((prev) => ({ ...prev, notes: 'Azione demo: usa solo per questo import demo' }))}
              onSaveDemoRule={() => setDemoState((prev) => ({ ...prev, notes: 'Azione demo: regola salvata solo in modalita demo' }))}
              onBackToMapping={() => setDemoState((prev) => ({ ...prev, notes: 'Azione demo: ritorno al mapping guidato' }))}
              onClose={onClose}
            />
            <RiconciliazioneGuidedImportAuditSummary
              summary={demoState.summary}
              events={demoState.events}
              compact={false}
              defaultCollapsed={false}
            />
          </div>
        </div>
      </div>

      <GuidedImportExtractedRowsPicker
        open={demoState.pickerOpen}
        targetKey={demoState.pickerTargetKey}
        targetLabel={demoState.fieldsByKey[demoState.pickerTargetKey]?.label || '-'}
        rows={activeScenario.extractedRows}
        onClose={() => setDemoState((prev) => ({ ...prev, pickerOpen: false, pickerTargetKey: '', pickerTargetType: '' }))}
        onSelect={handleSelectRowFromPicker}
      />
    </div>
  )
}
