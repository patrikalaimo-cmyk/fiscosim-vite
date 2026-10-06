import {
  GUIDED_IMPORT_AUDIT_COLUMN_PRESETS,
  GUIDED_IMPORT_AUDIT_FIELD_EVENT_TYPES,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES,
  GUIDED_IMPORT_AUDIT_FIELD_ID_VALUES,
} from './guidedImportAuditEventTypes.js'

const IMPORT_DECISION_EVENT_TO_VALUE = {
  [GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_CERTIFIED]: 'certified_import',
  [GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_HIGH_CONFIDENCE_REVIEW]: 'high_confidence_review',
  [GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_LOW_CONFIDENCE_REVIEW]: 'low_confidence_review',
  [GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_UNUSABLE]: 'unusable_import',
  [GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_IMPORT_ONLY]: 'import_only',
}

const TEMPLATE_DECISION_EVENT_TO_VALUE = {
  [GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_SAVABLE]: 'template_savable',
  [GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_SAVABLE_NON_CERTIFYING]: 'template_savable_non_certifying',
  [GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_NOT_SAVABLE]: 'template_not_savable',
}

function createEmptyFieldStatus() {
  return {
    status: 'missing',
    value: null,
    source: '',
    confidence: null,
    selectedRowId: '',
    pageNumber: null,
    rawText: '',
    warnings: [],
    blockers: [],
    updatedAt: '',
  }
}

function createInitialSummary() {
  const fieldsStatus = {}
  GUIDED_IMPORT_AUDIT_FIELD_ID_VALUES.forEach((fieldId) => {
    fieldsStatus[fieldId] = createEmptyFieldStatus()
  })

  return {
    fieldsStatus,
    movementSectionStatus: {
      headerRowId: '',
      firstMovementRowId: '',
      lastMovementRowId: '',
      selectedColumnPreset: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED,
      columnMap: null,
      directionRule: null,
      amountRule: null,
      descriptionRule: null,
      updatedAt: '',
    },
    ignoreSectionsStatus: {
      sections: [],
      updatedAt: '',
    },
    multilineStatus: {
      rules: [],
      attachedRows: {},
      updatedAt: '',
    },
    dryRunStatus: {
      parseStatus: '',
      parseReliabilityLevel: '',
      movementsExtracted: null,
      difference: null,
      totals: {
        totalIn: null,
        totalOut: null,
        openingBalance: null,
        closingBalanceOfficial: null,
        calculatedClosingBalance: null,
      },
      reviewRows: null,
      rejectedRows: null,
      ignoredRows: null,
      multilineAttachedRows: null,
      confidenceOverall: null,
      blockers: [],
      warnings: [],
      updatedAt: '',
    },
    finalDecision: '',
    templateDecision: '',
    blockers: [],
    warnings: [],
    lastUpdatedAt: '',
    eventCount: 0,
  }
}

function pushUnique(target, items) {
  if (!Array.isArray(items)) return
  items.forEach((item) => {
    if (item == null) return
    const serialized = typeof item === 'string' ? item : JSON.stringify(item)
    const exists = target.some((existing) => {
      const existingSerialized = typeof existing === 'string' ? existing : JSON.stringify(existing)
      return existingSerialized === serialized
    })
    if (!exists) target.push(item)
  })
}

function upsertIgnoreSection(sections, payload) {
  const sectionType = String(payload?.sectionType || '').trim()
  const startRowId = String(payload?.startRowId || '').trim()
  const endRowId = String(payload?.endRowId || '').trim()
  const idx = sections.findIndex((item) => item.sectionType === sectionType && item.startRowId === startRowId)
  const nextValue = {
    sectionType,
    startRowId,
    endRowId,
    startPage: payload?.startPage ?? null,
    endPage: payload?.endPage ?? null,
    reason: payload?.reason || '',
    source: payload?.source || '',
    operatorConfirmed: payload?.operatorConfirmed === true,
  }
  if (idx >= 0) sections[idx] = nextValue
  else sections.push(nextValue)
}

function removeIgnoreSection(sections, payload) {
  const sectionType = String(payload?.sectionType || '').trim()
  const startRowId = String(payload?.startRowId || '').trim()
  return sections.filter((item) => !(item.sectionType === sectionType && (!startRowId || item.startRowId === startRowId)))
}

export function reduceGuidedImportAuditSummary(events = [], context = {}) {
  const summary = createInitialSummary()
  if (!Array.isArray(events)) return summary

  const initialWarnings = Array.isArray(context.initialWarnings) ? context.initialWarnings : []
  const initialBlockers = Array.isArray(context.initialBlockers) ? context.initialBlockers : []
  pushUnique(summary.warnings, initialWarnings)
  pushUnique(summary.blockers, initialBlockers)

  events.forEach((event) => {
    if (!event || typeof event !== 'object') return
    const eventType = String(event.eventType || '').trim()
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {}
    const ts = String(event.timestamp || '').trim()

    summary.eventCount += 1
    if (ts) summary.lastUpdatedAt = ts

    pushUnique(summary.warnings, event.warnings)
    pushUnique(summary.blockers, event.blockers)

    if (GUIDED_IMPORT_AUDIT_FIELD_EVENT_TYPES.has(eventType)) {
      const fieldId = String(payload.fieldId || '').trim()
      if (fieldId && summary.fieldsStatus[fieldId]) {
        const target = summary.fieldsStatus[fieldId]
        const nextStatus = {
          [GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED]: 'proposed',
          [GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_CONFIRMED]: 'confirmed',
          [GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_SELECTED_FROM_ROW]: 'selected_from_row',
          [GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MANUAL_CHANGED]: 'modified_manual',
          [GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MARKED_MISSING]: 'missing',
          [GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MARKED_NOT_APPLICABLE]: 'not_applicable',
          [GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_CLEARED]: 'missing',
          [GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_RESTORED_FROM_PROPOSAL]: 'proposed',
        }[eventType]

        target.status = nextStatus || target.status
        target.value = payload.finalValue ?? payload.proposedValue ?? null
        target.source = String(payload.source || event.source || target.source || '').trim()
        target.confidence = payload.confidenceAfter ?? payload.confidenceBefore ?? target.confidence
        target.selectedRowId = String(payload.selectedRowId || target.selectedRowId || '').trim()
        target.pageNumber = payload.pageNumber ?? target.pageNumber
        target.rawText = String(payload.rawText || target.rawText || '').trim()
        target.updatedAt = ts || target.updatedAt
        pushUnique(target.warnings, payload.warnings)
        pushUnique(target.blockers, payload.blockers)
      }
      return
    }

    switch (eventType) {
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_HEADER_SELECTED:
        summary.movementSectionStatus.headerRowId = String(payload.headerRowId || '').trim()
        summary.movementSectionStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_FIRST_ROW_SELECTED:
        summary.movementSectionStatus.firstMovementRowId = String(payload.firstMovementRowId || '').trim()
        summary.movementSectionStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_LAST_ROW_SELECTED:
        summary.movementSectionStatus.lastMovementRowId = String(payload.lastMovementRowId || '').trim()
        summary.movementSectionStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_SECTION_CLEARED:
        summary.movementSectionStatus.headerRowId = ''
        summary.movementSectionStatus.firstMovementRowId = ''
        summary.movementSectionStatus.lastMovementRowId = ''
        summary.movementSectionStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.COLUMN_PRESET_SELECTED:
        summary.movementSectionStatus.selectedColumnPreset = String(payload.selectedColumnPreset || summary.movementSectionStatus.selectedColumnPreset)
        summary.movementSectionStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.COLUMN_MAP_CHANGED:
        summary.movementSectionStatus.columnMap = payload.columnMap ?? summary.movementSectionStatus.columnMap
        summary.movementSectionStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.DIRECTION_RULE_CHANGED:
        summary.movementSectionStatus.directionRule = payload.directionRule ?? summary.movementSectionStatus.directionRule
        summary.movementSectionStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.AMOUNT_RULE_CHANGED:
        summary.movementSectionStatus.amountRule = payload.amountRule ?? summary.movementSectionStatus.amountRule
        summary.movementSectionStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.DESCRIPTION_RULE_CHANGED:
        summary.movementSectionStatus.descriptionRule = payload.descriptionRule ?? summary.movementSectionStatus.descriptionRule
        summary.movementSectionStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_ADDED:
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_CONFIRMED:
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_CHANGED:
        upsertIgnoreSection(summary.ignoreSectionsStatus.sections, payload)
        summary.ignoreSectionsStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_REMOVED:
        summary.ignoreSectionsStatus.sections = removeIgnoreSection(summary.ignoreSectionsStatus.sections, payload)
        summary.ignoreSectionsStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_RULE_PROPOSED:
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_RULE_CONFIRMED:
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_RULE_CHANGED:
        summary.multilineStatus.rules.push({
          rule: payload.rule || '',
          reason: payload.reason || '',
          source: payload.source || event.source || '',
          timestamp: ts,
        })
        summary.multilineStatus.updatedAt = ts
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_ROW_ATTACHED: {
        const parentRowId = String(payload.parentRowId || '').trim()
        const childRowIds = Array.isArray(payload.childRowIds) ? payload.childRowIds : []
        if (parentRowId) {
          const current = Array.isArray(summary.multilineStatus.attachedRows[parentRowId])
            ? summary.multilineStatus.attachedRows[parentRowId]
            : []
          summary.multilineStatus.attachedRows[parentRowId] = Array.from(new Set([...current, ...childRowIds]))
        }
        summary.multilineStatus.updatedAt = ts
        break
      }
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.MULTILINE_ROW_DETACHED: {
        const parentRowId = String(payload.parentRowId || '').trim()
        const childRowIds = Array.isArray(payload.childRowIds) ? payload.childRowIds : []
        if (parentRowId && Array.isArray(summary.multilineStatus.attachedRows[parentRowId])) {
          summary.multilineStatus.attachedRows[parentRowId] = summary.multilineStatus.attachedRows[parentRowId]
            .filter((rowId) => !childRowIds.includes(rowId))
        }
        summary.multilineStatus.updatedAt = ts
        break
      }
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_COMPLETED:
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_RECOMPUTED:
        summary.dryRunStatus.movementsExtracted = payload.movementsExtracted ?? summary.dryRunStatus.movementsExtracted
        summary.dryRunStatus.totals.totalIn = payload.totalIn ?? summary.dryRunStatus.totals.totalIn
        summary.dryRunStatus.totals.totalOut = payload.totalOut ?? summary.dryRunStatus.totals.totalOut
        summary.dryRunStatus.totals.openingBalance = payload.openingBalance ?? summary.dryRunStatus.totals.openingBalance
        summary.dryRunStatus.totals.closingBalanceOfficial = payload.closingBalanceOfficial ?? summary.dryRunStatus.totals.closingBalanceOfficial
        summary.dryRunStatus.totals.calculatedClosingBalance = payload.calculatedClosingBalance ?? summary.dryRunStatus.totals.calculatedClosingBalance
        summary.dryRunStatus.difference = payload.difference ?? summary.dryRunStatus.difference
        summary.dryRunStatus.reviewRows = payload.reviewRows ?? summary.dryRunStatus.reviewRows
        summary.dryRunStatus.rejectedRows = payload.rejectedRows ?? summary.dryRunStatus.rejectedRows
        summary.dryRunStatus.ignoredRows = payload.ignoredRows ?? summary.dryRunStatus.ignoredRows
        summary.dryRunStatus.multilineAttachedRows = payload.multilineAttachedRows ?? summary.dryRunStatus.multilineAttachedRows
        summary.dryRunStatus.confidenceOverall = payload.confidenceOverall ?? summary.dryRunStatus.confidenceOverall
        summary.dryRunStatus.parseReliabilityLevel = payload.parseReliabilityLevel || summary.dryRunStatus.parseReliabilityLevel
        summary.dryRunStatus.parseStatus = payload.parseStatus || summary.dryRunStatus.parseStatus
        summary.dryRunStatus.updatedAt = ts
        pushUnique(summary.dryRunStatus.blockers, payload.blockers)
        pushUnique(summary.dryRunStatus.warnings, payload.warnings)
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_FAILED:
        summary.dryRunStatus.parseStatus = payload.parseStatus || 'failed'
        summary.dryRunStatus.updatedAt = ts
        pushUnique(summary.dryRunStatus.blockers, payload.blockers)
        pushUnique(summary.dryRunStatus.warnings, payload.warnings)
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_DECISION_SET:
        summary.finalDecision = String(payload.finalDecision || summary.finalDecision)
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_DECISION_SET:
        summary.templateDecision = String(payload.templateDecision || summary.templateDecision)
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_IMPORT_WARNING_ADDED:
        pushUnique(summary.warnings, [payload])
        break
      case GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_IMPORT_BLOCKER_ADDED:
        pushUnique(summary.blockers, [payload])
        break
      default:
        if (IMPORT_DECISION_EVENT_TO_VALUE[eventType]) {
          summary.finalDecision = IMPORT_DECISION_EVENT_TO_VALUE[eventType]
        }
        if (TEMPLATE_DECISION_EVENT_TO_VALUE[eventType]) {
          summary.templateDecision = TEMPLATE_DECISION_EVENT_TO_VALUE[eventType]
        }
        break
    }
  })

  return summary
}

export default reduceGuidedImportAuditSummary
