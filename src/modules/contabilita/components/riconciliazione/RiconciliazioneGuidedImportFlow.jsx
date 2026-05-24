/**
 * RiconciliazioneGuidedImportFlow
 *
 * Componente Guida FiscoSim REALE.
 * Lavora sullo staging corrente (bankStatement).
 * UI più leggera rispetto alla demo: sfondo soft-navy, card chiare, più aria.
 *
 * NON modifica movimenti reali senza azione esplicita.
 * NON fa matching, commit, DB, API.
 * Genera eventi audit reali nello staging corrente.
 */

import { useEffect, useMemo, useState } from 'react'
import GuidedImportProposalsTable from './GuidedImportProposalsTable.jsx'
import GuidedImportExtractedRowsPicker from './GuidedImportExtractedRowsPicker.jsx'
import GuidedImportDryRunResult from './GuidedImportDryRunResult.jsx'
import RiconciliazioneGuidedImportAuditSummary from './RiconciliazioneGuidedImportAuditSummary.jsx'
import { buildGuidedImportAuditEvent } from './buildGuidedImportAuditEvent.js'
import { validateGuidedImportAuditEvent } from './validateGuidedImportAuditEvent.js'
import { reduceGuidedImportAuditSummary } from './reduceGuidedImportAuditSummary.js'
import { buildGuidedImportInitialStateFromStatement } from './buildGuidedImportInitialStateFromStatement.js'
import { runGuidedImportDryRun } from './runGuidedImportDryRun.js'
import { applyMultipleGuidedImportEventsToStatementAudit } from './applyGuidedImportEventToStatementAudit.js'
import { canAutoSaveTemplate, buildGuidedImportTemplateFromState } from './buildGuidedImportTemplateFromState.js'
import { addOrUpdateGuidedImportTemplate, markGuidedImportTemplateUsed } from './guidedImportTemplateStorage.js'
import { mergeGuidedImportStateWithTemplate } from './mergeGuidedImportStateWithTemplate.js'
import {
  GUIDED_IMPORT_AUDIT_COLUMN_PRESETS,
  GUIDED_IMPORT_AUDIT_EVENT_SOURCES,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES,
} from './guidedImportAuditEventTypes.js'

// ─── stili ────────────────────────────────────────────────────────────────────
// UI soft: sfondo navy chiaro, card semi-trasparenti, contrasto morbido

const OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(4, 10, 19, 0.62)',
  zIndex: 1150,
  display: 'grid',
  placeItems: 'center',
  padding: 20,
}

const MODAL_STYLE = {
  width: 'min(1300px, 97vw)',
  maxHeight: '94vh',
  overflow: 'auto',
  borderRadius: 18,
  border: '1px solid rgba(138, 179, 225, 0.28)',
  background: 'linear-gradient(170deg, rgba(14, 28, 48, 0.97) 0%, rgba(10, 20, 36, 0.97) 100%)',
  color: '#dde9f6',
}

const HEADER_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '.6rem',
  alignItems: 'flex-start',
  padding: '.75rem .9rem',
  borderBottom: '1px solid rgba(138, 179, 225, 0.22)',
  background: 'rgba(18, 34, 57, 0.92)',
  borderRadius: '18px 18px 0 0',
}

const BODY_STYLE = {
  padding: '.75rem .9rem',
  display: 'grid',
  gap: '.6rem',
}

const CARD_STYLE = {
  borderRadius: 13,
  border: '1px solid rgba(138, 179, 225, 0.2)',
  background: 'rgba(18, 32, 52, 0.72)',
  padding: '.55rem .65rem',
}

const TEMPLATE_BANNER_STYLE = {
  borderRadius: 11,
  border: '1px solid rgba(142, 231, 182, 0.45)',
  background: 'rgba(80, 220, 150, 0.10)',
  padding: '.44rem .6rem',
  fontSize: '.7rem',
  color: '#8ee7b6',
  display: 'flex',
  gap: '.55rem',
  alignItems: 'flex-start',
}

const WARNING_BANNER_STYLE = {
  borderRadius: 11,
  border: '1px solid rgba(255, 211, 140, 0.38)',
  background: 'rgba(255, 195, 80, 0.09)',
  padding: '.44rem .6rem',
  fontSize: '.7rem',
  color: '#ffd38c',
  display: 'flex',
  gap: '.4rem',
  alignItems: 'flex-start',
}

const LABEL_STYLE = {
  fontSize: '.68rem',
  color: '#9fd0ff',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  fontWeight: 700,
}

const SECTION_TITLE_STYLE = {
  ...LABEL_STYLE,
  marginBottom: '.3rem',
}

const BADGE_STYLE_PRIMARY = {
  display: 'inline-block',
  padding: '.12rem .45rem',
  borderRadius: 8,
  background: 'rgba(255, 200, 80, 0.18)',
  border: '1px solid rgba(255, 200, 80, 0.35)',
  color: '#ffd38c',
  fontSize: '.62rem',
  fontWeight: 700,
  textTransform: 'uppercase',
}

const BADGE_STYLE_SECONDARY = {
  display: 'inline-block',
  padding: '.12rem .45rem',
  borderRadius: 8,
  background: 'rgba(159, 208, 255, 0.14)',
  border: '1px solid rgba(159, 208, 255, 0.28)',
  color: '#9fd0ff',
  fontSize: '.62rem',
  fontWeight: 700,
}

const BTN_PRIMARY = {
  minHeight: 28,
  fontSize: '.65rem',
  borderRadius: 8,
  border: '1px solid rgba(142, 231, 182, 0.45)',
  background: 'rgba(142, 231, 182, 0.1)',
  color: '#8ee7b6',
  padding: '0 .7rem',
  cursor: 'pointer',
}

const BTN_SEC = {
  minHeight: 26,
  fontSize: '.63rem',
  borderRadius: 8,
  border: '1px solid rgba(138, 179, 225, 0.28)',
  background: 'rgba(138, 179, 225, 0.08)',
  color: '#dde9f6',
  padding: '0 .6rem',
  cursor: 'pointer',
}

const BTN_DANGER = {
  minHeight: 26,
  fontSize: '.63rem',
  borderRadius: 8,
  border: '1px solid rgba(255, 159, 176, 0.32)',
  background: 'rgba(255, 159, 176, 0.08)',
  color: '#ff9fb0',
  padding: '0 .6rem',
  cursor: 'pointer',
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toStringValue(value) {
  if (value == null) return ''
  return String(value)
}

function parseAmountLoose(value) {
  if (value == null) return null
  const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function reliabilityBadgeLabel(level) {
  if (!level) return 'Sconosciuto'
  return level.replace(/_/g, ' ')
}

function reliabilityBadgeTone(level) {
  if (level === 'certified_balanced') return '#8ee7b6'
  if (level === 'high_confidence') return '#9fd0ff'
  if (level === 'needs_review') return '#ffd38c'
  return '#ff9fb0'
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

function buildAuditMeta(bankStatement) {
  return {
    auditId: bankStatement?.guidedImportAudit?.auditId || `guided-real-${Date.now()}`,
    importId: bankStatement?.sourceFileHash || bankStatement?.sourceFileName || `import-${Date.now()}`,
    sourceFileName: bankStatement?.sourceFileName || '',
    profileCandidate: bankStatement?.profile || bankStatement?.profileLabel || '',
  }
}

// ─── componente ───────────────────────────────────────────────────────────────

export default function RiconciliazioneGuidedImportFlow({
  open,
  bankStatement,
  onClose,
  onUpdateStatement,
  templateMatch = null,
}) {
  const [flowState, setFlowState] = useState(null)

  // Inizializza il flusso ogni volta che si apre con un nuovo statement
  useEffect(() => {
    if (!open || !bankStatement) return
    let initial = buildGuidedImportInitialStateFromStatement(bankStatement)

    // Se c'è un template match valido, applica suggerimenti strutturali
    if (templateMatch?.matched && templateMatch?.template) {
      initial = mergeGuidedImportStateWithTemplate(initial, templateMatch)
      // Incrementa usageCount nel registry
      markGuidedImportTemplateUsed(templateMatch.template.templateId)
      // Aggiungi e persisti evento audit TEMPLATE_SUGGESTION_APPLIED all'avvio
      const tplApplied = initial.templateContext || initial.templateAppliedFrom || {}
      const builtTemplateEvent = buildGuidedImportAuditEvent({
        ...buildAuditMeta(bankStatement),
        eventType: GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_SUGGESTION_APPLIED,
        source: GUIDED_IMPORT_AUDIT_EVENT_SOURCES.TEMPLATE_ENGINE,
        operatorId: 'operatore_reale',
        payload: {
          templateId: templateMatch.template.templateId,
          templateLabel: templateMatch.template.templateLabel,
          score: templateMatch.score,
          reasons: templateMatch.reasons || [],
          appliedFields: tplApplied.appliedFields || [],
          appliedColumnPreset: tplApplied.appliedColumnPreset || null,
          appliedIgnoreSections: tplApplied.appliedIgnoreSections || [],
          appliedMultilineRules: tplApplied.appliedMultilineRules || [],
          appliedMode: 'suggested_only',
        },
      })
      const templateValidation = validateGuidedImportAuditEvent(builtTemplateEvent)
      const templateEvent = {
        ...builtTemplateEvent,
        warnings: [...(builtTemplateEvent.warnings || []), ...(templateValidation.warnings || [])],
        blockers: [...(builtTemplateEvent.blockers || []), ...(templateValidation.blockers || [])],
      }
      initial = {
        ...initial,
        events: [...(initial.events || []), templateEvent],
        summary: reduceGuidedImportAuditSummary([...(initial.events || []), templateEvent]),
      }

      if (onUpdateStatement) {
        const nextStatement = applyMultipleGuidedImportEventsToStatementAudit(bankStatement, [templateEvent])
        onUpdateStatement(nextStatement)
      }
    }

    setFlowState(initial)
  }, [open, bankStatement?.sourceFileHash, bankStatement?.sourceFileName, templateMatch, onUpdateStatement])

  const auditMeta = useMemo(() => buildAuditMeta(bankStatement), [bankStatement?.sourceFileHash, bankStatement?.sourceFileName])

  const fieldRows = useMemo(() => {
    if (!flowState?.fieldsByKey) return []
    return Object.values(flowState.fieldsByKey).filter((field) => field.actionType !== 'column_preset' && field.actionType !== 'ignore_sections' && field.actionType !== 'multiline')
  }, [flowState?.fieldsByKey])

  const extractedRows = useMemo(() => flowState?.extractedRows || [], [flowState?.extractedRows])

  const hasExtractedRows = extractedRows.length > 0

  if (!open) return null
  if (!bankStatement) return null
  if (!flowState) return null

  // ─── event builder ──────────────────────────────────────────────────────────

  const buildEvent = (eventType, payload, source = GUIDED_IMPORT_AUDIT_EVENT_SOURCES.OPERATOR) => {
    const built = buildGuidedImportAuditEvent({
      ...auditMeta,
      eventType,
      payload,
      source,
      operatorId: 'operatore_reale',
    })
    const validation = validateGuidedImportAuditEvent(built)
    return {
      ...built,
      warnings: [...(built.warnings || []), ...(validation.warnings || [])],
      blockers: [...(built.blockers || []), ...(validation.blockers || [])],
    }
  }

  const pushLocalEvent = (eventType, payload, source) => {
    const event = buildEvent(eventType, payload, source)
    setFlowState((prev) => {
      const nextEvents = [...(prev.events || []), event]
      return {
        ...prev,
        events: nextEvents,
        summary: reduceGuidedImportAuditSummary(nextEvents),
      }
    })
    return event
  }

  const persistEventToStatement = (event) => {
    if (!onUpdateStatement) return
    const next = applyMultipleGuidedImportEventsToStatementAudit(bankStatement, [event])
    onUpdateStatement(next)
  }

  const pushAndPersistEvent = (eventType, payload, source = GUIDED_IMPORT_AUDIT_EVENT_SOURCES.OPERATOR) => {
    const event = buildEvent(eventType, payload, source)
    setFlowState((prev) => {
      const nextEvents = [...(prev.events || []), event]
      return {
        ...prev,
        events: nextEvents,
        summary: reduceGuidedImportAuditSummary(nextEvents),
      }
    })
    if (onUpdateStatement) {
      const next = applyMultipleGuidedImportEventsToStatementAudit(bankStatement, [event])
      onUpdateStatement(next)
    }
    return event
  }

  const setField = (fieldKey, patch) => {
    setFlowState((prev) => ({
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

  // ─── azioni tabella proposte ─────────────────────────────────────────────────

  const handleConfirmField = (fieldKey) => {
    const field = flowState.fieldsByKey[fieldKey]
    if (!field) return
    if (field.fieldId) {
      pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_CONFIRMED, {
        fieldId: field.fieldId,
        finalValue: field.finalValue,
        source: 'operator_real',
      })
      setField(fieldKey, { status: 'confirmed', source: 'operator_confirmed' })
    }
  }

  const handleManualChangeField = (fieldKey, nextValue) => {
    const field = flowState.fieldsByKey[fieldKey]
    if (!field || !field.fieldId || !field.allowManualEdit) return
    pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MANUAL_CHANGED, {
      fieldId: field.fieldId,
      previousValue: field.finalValue,
      finalValue: nextValue,
      reason: 'manual_edit_real',
      source: 'operator_real',
    })
    setField(fieldKey, {
      finalValue: nextValue,
      status: 'modified_manual',
      source: 'manual_real',
    })
  }

  const handleClearField = (fieldKey) => {
    const field = flowState.fieldsByKey[fieldKey]
    if (!field) return
    if (field.fieldId) {
      pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_CLEARED, {
        fieldId: field.fieldId,
        previousValue: field.finalValue,
        finalValue: '',
      })
    }
    setField(fieldKey, { finalValue: '', status: 'missing', source: 'cleared_real' })
  }

  const handleRestoreField = (fieldKey) => {
    const field = flowState.fieldsByKey[fieldKey]
    if (!field) return
    if (field.fieldId) {
      pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_RESTORED_FROM_PROPOSAL, {
        fieldId: field.fieldId,
        finalValue: field.proposedValue,
        source: 'restore_real',
      })
    }
    setField(fieldKey, {
      finalValue: field.proposedValue,
      status: 'proposed',
      source: 'restored_from_proposal',
    })
  }

  const handleOpenRowPicker = (fieldKey) => {
    const field = flowState.fieldsByKey[fieldKey]
    if (!field) return
    setFlowState((prev) => ({
      ...prev,
      pickerOpen: true,
      pickerTargetKey: fieldKey,
      pickerTargetType: field.actionType || 'document',
    }))
  }

  const handleSelectRowFromPicker = (row, selectedAmount) => {
    const fieldKey = flowState.pickerTargetKey
    const field = flowState.fieldsByKey[fieldKey]
    if (!field || !row) return

    if (field.fieldId) {
      const numericAmount = parseAmountLoose(selectedAmount)
      const finalValue = field.fieldId.includes('balance') || field.fieldId.includes('total')
        ? (numericAmount != null ? String(numericAmount) : row.text)
        : row.text
      pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_SELECTED_FROM_ROW, {
        fieldId: field.fieldId,
        selectedRowId: row.rowId,
        rawText: row.text,
        pageNumber: row.pageNumber,
        finalValue,
        source: 'row_picker_real',
      })
      setField(fieldKey, {
        finalValue,
        status: 'selected_from_row',
        source: `${row.rowId}`,
      })
    } else if (field.actionType === 'movement_header') {
      pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_HEADER_SELECTED, {
        headerRowId: row.rowId,
        rawText: row.text,
        pageNumber: row.pageNumber,
      })
      setField(fieldKey, { finalValue: row.text, status: 'selected_from_row', source: row.rowId })
    }

    setFlowState((prev) => ({
      ...prev,
      pickerOpen: false,
      pickerTargetKey: '',
      pickerTargetType: '',
      notes: `Riga ${row.rowId} selezionata per ${field.label}`,
    }))
  }

  // ─── preset colonne ──────────────────────────────────────────────────────────

  const handlePresetChange = (nextPreset) => {
    setFlowState((prev) => ({ ...prev, columnPreset: nextPreset }))
    pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.COLUMN_PRESET_SELECTED, {
      selectedColumnPreset: nextPreset,
      source: 'operator_real',
    })
    setField('column_preset', { finalValue: nextPreset, status: 'confirmed', source: 'operator_preset' })
  }

  // ─── sezioni da ignorare ─────────────────────────────────────────────────────

  const toggleIgnoreSection = (section) => {
    const exists = flowState.ignoredSections.includes(section)
    if (exists) {
      pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_REMOVED, {
        sectionType: section,
        startRowId: `section-${section}`,
      })
      setFlowState((prev) => ({
        ...prev,
        ignoredSections: prev.ignoredSections.filter((item) => item !== section),
      }))
    } else {
      pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_CONFIRMED, {
        sectionType: section,
        startRowId: `section-${section}`,
        endRowId: `section-${section}`,
        operatorConfirmed: true,
        source: 'operator_real',
      })
      setFlowState((prev) => ({
        ...prev,
        ignoredSections: [...prev.ignoredSections, section],
      }))
    }
  }

  // ─── multilinea ──────────────────────────────────────────────────────────────

  const toggleMultilineAttach = () => {
    const parentRowId = `real-multiline-${Date.now()}`
    if (flowState.multiline.attached) {
      pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_ROW_DETACHED, {
        parentRowId,
        childRowIds: [],
      })
      setFlowState((prev) => ({ ...prev, multiline: { ...prev.multiline, attached: false } }))
    } else {
      pushAndPersistEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_ROW_ATTACHED, {
        parentRowId,
        childRowIds: [],
      })
      setFlowState((prev) => ({ ...prev, multiline: { ...prev.multiline, attached: true } }))
    }
  }

  // ─── dry run ─────────────────────────────────────────────────────────────────

  const handleRunDryRun = () => {
    pushLocalEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_STARTED, {
      mode: 'real_dry_run',
    }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.DRY_RUN)

    const result = runGuidedImportDryRun({ statement: bankStatement, guidedState: flowState })
    const generatedDryRunAuditRef = `dry-run-${Date.now()}`

    const completedEvent = buildEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_COMPLETED, {
      movementsExtracted: result.movementsExtracted,
      totalIn: result.totalIn,
      totalOut: result.totalOut,
      openingBalance: result.openingBalance,
      closingBalanceOfficial: result.closingBalanceOfficial,
      calculatedClosingBalance: result.calculatedClosingBalance,
      difference: result.difference,
      parseStatus: result.parseStatus,
      parseReliabilityLevel: result.parseReliabilityLevel,
      warnings: result.warnings,
      blockers: result.blockers,
      reviewRows: 0,
      rejectedRows: 0,
      ignoredRows: flowState.ignoredSections.length,
      multilineAttachedRows: flowState.multiline.attached ? 1 : 0,
      confidenceOverall: result.parseReliabilityLevel === 'certified_balanced' ? 0.99 : 0.75,
      dryRunAuditRef: generatedDryRunAuditRef,
    }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.DRY_RUN)

    const dryRunAuditRef =
      completedEvent?.payload?.dryRunAuditRef ||
      completedEvent?.dryRunAuditRef ||
      generatedDryRunAuditRef

    const templateEvent = buildEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_DECISION_SET, {
      templateDecision: result.templateDecision,
      dryRunAuditRef,
    })
    const templateMarkedEvent = buildEvent(mapTemplateDecisionEvent(result.templateDecision), {
      dryRunAuditRef,
    })
    const importEvent = buildEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_DECISION_SET, {
      finalDecision: result.finalDecision,
      dryRunAuditRef,
    })
    const importMarkedEvent = buildEvent(mapImportDecisionEvent(result.finalDecision), {
      dryRunAuditRef,
    })

    const newEvents = [completedEvent, templateEvent, templateMarkedEvent, importEvent, importMarkedEvent]

    // ─── auto-learning template ──────────────────────────────────────────────
    const { canSave, certifying } = canAutoSaveTemplate(result)
    let autoLearnStatus = null

    if (canSave) {
      const template = buildGuidedImportTemplateFromState({
        statement: bankStatement,
        guidedState: flowState,
        dryRunResult: result,
        auditMeta,
      })
      const saveResult = addOrUpdateGuidedImportTemplate(template)
      if (saveResult.ok) {
        autoLearnStatus = {
          saved: true,
          certifying,
          templateId: template.templateId,
          templateLabel: template.templateLabel,
          certificationMode: template.certificationMode,
        }
        const autoEventType = certifying
          ? GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_AUTO_SAVED
          : GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_AUTO_SAVED_NON_CERTIFYING
        newEvents.push(buildEvent(autoEventType, {
          templateId: template.templateId,
          templateLabel: template.templateLabel,
          certificationMode: template.certificationMode,
          autoLearned: true,
          dryRunAuditRef,
        }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.TEMPLATE_ENGINE))
      } else {
        autoLearnStatus = { saved: false, reason: 'storage_error' }
        newEvents.push(buildEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_AUTO_NOT_SAVED, {
          reason: 'storage_error',
          autoLearned: true,
          dryRunAuditRef,
        }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.TEMPLATE_ENGINE))
      }
    } else {
      const { reason } = canAutoSaveTemplate(result)
      autoLearnStatus = { saved: false, reason: reason || 'not_eligible' }
      newEvents.push(buildEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_AUTO_NOT_SAVED, {
        reason: reason || 'not_eligible',
        autoLearned: true,
        dryRunAuditRef,
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.TEMPLATE_ENGINE))
    }

    setFlowState((prev) => {
      const nextEvents = [...(prev.events || []), ...newEvents]
      return {
        ...prev,
        events: nextEvents,
        summary: reduceGuidedImportAuditSummary(nextEvents),
        dryRunResult: result,
        autoLearnStatus,
        notes: `Prova parsing completata: ${result.finalDecision}`,
      }
    })

    if (onUpdateStatement) {
      const next = applyMultipleGuidedImportEventsToStatementAudit(bankStatement, newEvents)
      onUpdateStatement(next)
    }
  }

  // ─── decisione finale ────────────────────────────────────────────────────────

  const handleUseImportOnly = () => {
    const event = buildEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_DECISION_SET, {
      finalDecision: 'import_only',
      reason: 'operator_use_import_only',
    })
    const markedEvent = buildEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_IMPORT_ONLY, {})
    const completedEvent = buildEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_IMPORT_COMPLETED, {
      finalDecision: 'import_only',
    })
    const newEvents = [event, markedEvent, completedEvent]
    setFlowState((prev) => {
      const nextEvents = [...(prev.events || []), ...newEvents]
      return { ...prev, events: nextEvents, summary: reduceGuidedImportAuditSummary(nextEvents) }
    })
    if (onUpdateStatement) {
      const next = applyMultipleGuidedImportEventsToStatementAudit(bankStatement, newEvents)
      onUpdateStatement(next)
    }
    onClose()
  }

  const handleBackToMapping = () => {
    setFlowState((prev) => ({ ...prev, dryRunResult: null }))
  }

  const handleClose = () => {
    const cancelEvent = buildEvent(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_IMPORT_CANCELLED, {
      reason: 'operator_close',
    })
    setFlowState((prev) => {
      const nextEvents = [...(prev.events || []), cancelEvent]
      return { ...prev, events: nextEvents, summary: reduceGuidedImportAuditSummary(nextEvents) }
    })
    if (onUpdateStatement) {
      const next = applyMultipleGuidedImportEventsToStatementAudit(bankStatement, [cancelEvent])
      onUpdateStatement(next)
    }
    onClose()
  }

  // ─── dati per la UI ──────────────────────────────────────────────────────────

  const parseReliabilityLevel = bankStatement?.parseReliabilityLevel || ''
  const profileLabel = bankStatement?.profileLabel || bankStatement?.profile || 'Sconosciuto'
  const movementsCount = bankStatement?.movements?.length ?? bankStatement?.parsedMovements ?? 0
  const currentPreset = flowState.columnPreset || GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED
  const pickerTargetField = flowState.fieldsByKey[flowState.pickerTargetKey]
  const templateContext = flowState.templateContext || null

  const PRESET_DESCRIPTIONS = {
    [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_VALUE_OUT_IN_DESCRIPTION]: 'Data | Valuta | Uscite | Entrate | Descrizione',
    [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_SIGN_AMOUNT_VALUE_DESCRIPTION]: 'Data | Segno | Importo | Valuta | Descrizione',
    [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_SIGNED_AMOUNT_DESCRIPTION]: 'Data | Importo con segno | Descrizione',
    [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CSV_EXCEL_EXPLICIT_COLUMNS]: 'CSV/Excel con colonne esplicite',
    [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED]: 'Guidato personalizzato',
  }

  const IGNORE_SECTIONS_BASE = ['Intestazione banca', 'Riepilogo estratto', 'Saldo iniziale', 'Righe informative multilinea', 'Footer legale']

  return (
    <div style={OVERLAY_STYLE}>
      <div style={MODAL_STYLE}>

        {/* ─── header ─── */}
        <div style={HEADER_STYLE}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '.86rem', fontWeight: 900, color: '#dde9f6' }}>Guida FiscoSim</div>
              <span style={BADGE_STYLE_PRIMARY}>Staging reale</span>
              <span style={{ ...BADGE_STYLE_SECONDARY, color: reliabilityBadgeTone(parseReliabilityLevel) }}>
                {reliabilityBadgeLabel(parseReliabilityLevel)}
              </span>
            </div>
            <div style={{ fontSize: '.7rem', color: '#9fd0ff', marginTop: '.06rem' }}>
              {profileLabel} · {movementsCount} movimenti
            </div>
            <div style={{ fontSize: '.64rem', color: 'rgba(211, 224, 238, 0.72)', marginTop: '.04rem' }}>
              {bankStatement?.sourceFileName || ''}
            </div>
          </div>
          <button type="button" style={BTN_SEC} onClick={handleClose}>Chiudi guida</button>
        </div>

        <div style={BODY_STYLE}>

          {/* ─── template banner ─── */}
          {templateContext?.applied && (
            <div style={TEMPLATE_BANNER_STYLE}>
              <span style={{ fontSize: '.78rem' }}>✦</span>
              <div>
                <strong>Template applicato in modalità suggerita:</strong>{' '}
                {templateContext.templateLabel || templateContext.templateId}
                {templateContext.scoreLevel && (
                  <span style={{ marginLeft: '.5rem', opacity: 0.8, fontSize: '.66rem' }}>
                    Score {templateContext.scoreLevel} ({Math.round((templateContext.score || 0) * 100)}%)
                  </span>
                )}
                <div style={{ marginTop: '.18rem', fontSize: '.66rem', opacity: 0.92 }}>
                  Affidabilità {templateContext.reliability || '-'} · {templateContext.certificationMode || 'non_certifying'}
                </div>
                {!!templateContext.reasons?.length && (
                  <div style={{ marginTop: '.14rem', fontSize: '.64rem', opacity: 0.86 }}>
                    Match: {templateContext.reasons.join(', ')}
                  </div>
                )}
                <div style={{ marginTop: '.18rem', fontSize: '.66rem', opacity: 0.85 }}>
                  Movimenti e importi non modificati automaticamente.
                </div>
              </div>
            </div>
          )}

          {/* ─── warning banner ─── */}
          <div style={WARNING_BANNER_STYLE}>
            <span style={{ fontSize: '.78rem' }}>⚠</span>
            <div>
              <strong>Questa guida lavora sullo staging corrente.</strong>
              {' '}Non contabilizza e non modifica i movimenti senza conferma.
              Gli eventi generati vengono salvati nel pannello Audit import guidato.
            </div>
          </div>

          {/* ─── tabella proposte ─── */}
          <div style={CARD_STYLE}>
            <div style={SECTION_TITLE_STYLE}>Campi documento</div>
            <GuidedImportProposalsTable
              fields={fieldRows}
              onConfirm={handleConfirmField}
              onClear={handleClearField}
              onRestore={handleRestoreField}
              onPickRow={handleOpenRowPicker}
              onManualChange={handleManualChangeField}
            />
          </div>

          {/* ─── picker righe / fallback ─── */}
          {!hasExtractedRows ? (
            <div style={{ ...CARD_STYLE, fontSize: '.7rem', color: 'rgba(211, 224, 238, 0.8)', padding: '.5rem .65rem' }}>
              <span style={{ color: '#ffd38c', marginRight: '.4rem' }}>▲</span>
              Righe estratte non disponibili per questo import.
              Puoi usare modifica manuale sui dati documento oppure ricaricare il file.
            </div>
          ) : null}

          {/* ─── preset + sezioni ignore ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '.5rem' }}>
            <div style={CARD_STYLE}>
              <div style={SECTION_TITLE_STYLE}>
                Preset colonne
                {templateContext?.appliedColumnPreset && (
                  <span style={{ ...BADGE_STYLE_SECONDARY, marginLeft: '.35rem', color: '#8ee7b6', borderColor: 'rgba(142, 231, 182, 0.45)' }}>
                    template suggestion
                  </span>
                )}
              </div>
              <select
                value={currentPreset}
                onChange={(event) => handlePresetChange(event.target.value)}
                style={{ minHeight: 28, borderRadius: 9, border: '1px solid rgba(138, 179, 225, 0.24)', background: 'rgba(12, 24, 41, 0.9)', color: '#dde9f6', fontSize: '.67rem', padding: '0 .45rem', width: '100%', marginBottom: '.3rem' }}
              >
                {Object.values(GUIDED_IMPORT_AUDIT_COLUMN_PRESETS).map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
              <div style={{ fontSize: '.67rem', color: 'rgba(211, 224, 238, 0.82)' }}>{PRESET_DESCRIPTIONS[currentPreset] || '-'}</div>
            </div>

            <div style={CARD_STYLE}>
              <div style={SECTION_TITLE_STYLE}>
                Sezioni da ignorare
                {!!templateContext?.appliedIgnoreSections?.length && (
                  <span style={{ ...BADGE_STYLE_SECONDARY, marginLeft: '.35rem', color: '#8ee7b6', borderColor: 'rgba(142, 231, 182, 0.45)' }}>
                    template suggestion
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.28rem', marginBottom: '.3rem' }}>
                {IGNORE_SECTIONS_BASE.map((section) => {
                  const selected = flowState.ignoredSections.includes(section)
                  return (
                    <button
                      key={section}
                      type="button"
                      style={{
                        ...BTN_SEC,
                        borderColor: selected ? 'rgba(142, 231, 182, 0.42)' : undefined,
                        color: selected ? '#8ee7b6' : '#dde9f6',
                      }}
                      onClick={() => toggleIgnoreSection(section)}
                    >
                      {selected ? '✓' : '+'} {section}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: '.65rem', color: 'rgba(211, 224, 238, 0.72)' }}>
                {flowState.ignoredSections.length} sezioni attive
              </div>
            </div>
          </div>

          {/* ─── multilinea base ─── */}
          <div style={CARD_STYLE}>
            <div style={SECTION_TITLE_STYLE}>
              Multilinea
              {!!templateContext?.appliedMultilineRules?.length && (
                <span style={{ ...BADGE_STYLE_SECONDARY, marginLeft: '.35rem', color: '#8ee7b6', borderColor: 'rgba(142, 231, 182, 0.45)' }}>
                  template suggestion
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{
                  ...BTN_SEC,
                  borderColor: flowState.multiline.attached ? 'rgba(142, 231, 182, 0.42)' : undefined,
                  color: flowState.multiline.attached ? '#8ee7b6' : '#dde9f6',
                }}
                onClick={toggleMultilineAttach}
              >
                {flowState.multiline.attached ? '✓ Multilinea attiva' : 'Attiva multilinea'}
              </button>
              <span style={{ fontSize: '.67rem', color: 'rgba(211, 224, 238, 0.75)' }}>
                {flowState.multiline.attached
                  ? 'Righe multilinea saranno aggregate in fase di import'
                  : 'Nessuna regola multilinea attiva'}
              </span>
            </div>
          </div>

          {/* ─── dry run / risultato ─── */}
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
              <div style={LABEL_STYLE}>Prova parsing guidata</div>
              <button type="button" style={BTN_PRIMARY} onClick={handleRunDryRun}>
                Prova parsing
              </button>
            </div>
            <GuidedImportDryRunResult
              dryRunResult={flowState.dryRunResult}
              onUseImportOnly={handleUseImportOnly}
              onSaveDemoRule={() => {}}
              onBackToMapping={handleBackToMapping}
              onClose={handleClose}
              isDemo={false}
              autoLearnStatus={flowState.autoLearnStatus || null}
            />
          </div>

          {/* ─── audit summary ─── */}
          <div style={CARD_STYLE}>
            <div style={SECTION_TITLE_STYLE}>Audit import guidato — eventi reali</div>
            <RiconciliazioneGuidedImportAuditSummary
              audit={bankStatement?.guidedImportAudit}
              summary={flowState.summary}
              events={flowState.events}
              compact={true}
              defaultCollapsed={false}
            />
            <div style={{ fontSize: '.64rem', color: 'rgba(211, 224, 238, 0.65)', marginTop: '.3rem' }}>
              {flowState.events.length} eventi in questa sessione · {flowState.notes}
            </div>
          </div>

          {/* ─── azioni finali ─── */}
          <div style={{ ...CARD_STYLE, display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center' }}>
            <button type="button" style={BTN_PRIMARY} onClick={handleUseImportOnly}>
              Usa solo per questo import
            </button>
            {flowState.autoLearnStatus ? (
              flowState.autoLearnStatus.saved ? (
                <div style={{ fontSize: '.67rem', color: flowState.autoLearnStatus.certifying ? '#8ee7b6' : '#ffd38c', padding: '.18rem .55rem', borderRadius: 8, border: `1px solid ${flowState.autoLearnStatus.certifying ? 'rgba(142,231,182,0.35)' : 'rgba(255,211,140,0.35)'}`, background: flowState.autoLearnStatus.certifying ? 'rgba(142,231,182,0.07)' : 'rgba(255,211,140,0.07)' }}>
                  {flowState.autoLearnStatus.certifying
                    ? 'FiscoSim ha appreso una nuova regola da questo documento.'
                    : 'FiscoSim ha appreso una regola non certificante: i prossimi import simili richiederanno review.'}
                </div>
              ) : (
                <div style={{ fontSize: '.67rem', color: '#ff9fb0', padding: '.18rem .55rem', borderRadius: 8, border: '1px solid rgba(255,159,176,0.28)', background: 'rgba(255,159,176,0.06)' }}>
                  Regola non appresa: audit non affidabile.
                </div>
              )
            ) : null}
            <button type="button" style={BTN_SEC} onClick={handleBackToMapping}>
              Torna al mapping
            </button>
            <button type="button" style={BTN_DANGER} onClick={handleClose}>
              Chiudi guida
            </button>
          </div>

        </div>
      </div>

      {/* ─── picker righe estratte ─── */}
      <GuidedImportExtractedRowsPicker
        open={flowState.pickerOpen}
        targetLabel={pickerTargetField?.label || flowState.pickerTargetKey}
        targetKey={flowState.pickerTargetKey}
        rows={extractedRows}
        onClose={() => setFlowState((prev) => ({ ...prev, pickerOpen: false, pickerTargetKey: '' }))}
        onSelect={handleSelectRowFromPicker}
      />
    </div>
  )
}
