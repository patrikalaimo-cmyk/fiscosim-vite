import { buildGuidedImportAuditEvent } from './buildGuidedImportAuditEvent.js'
import {
  GUIDED_IMPORT_AUDIT_COLUMN_PRESETS,
  GUIDED_IMPORT_AUDIT_EVENT_SOURCES,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES,
  GUIDED_IMPORT_AUDIT_FIELD_IDS,
} from './guidedImportAuditEventTypes.js'

function buildScenarioEventFactory({
  auditId,
  importId,
  sourceFileName,
  profileCandidate,
  operatorId = 'op-demo',
  baseDate = '2026-05-05T10:00:00.000Z',
}) {
  const baseMs = Date.parse(baseDate)
  let idx = 0

  return function push(eventType, payload = {}, source = GUIDED_IMPORT_AUDIT_EVENT_SOURCES.OPERATOR) {
    idx += 1
    return buildGuidedImportAuditEvent({
      eventType,
      auditId,
      importId,
      sourceFileName,
      profileCandidate,
      operatorId,
      source,
      payload,
      timestamp: new Date(baseMs + idx * 1000).toISOString(),
    })
  }
}

function buildBancoTrimestraleCertificato() {
  const push = buildScenarioEventFactory({
    auditId: 'audit-banco-trim-001',
    importId: 'import-banco-trim-001',
    sourceFileName: 'SIRIA BANCO DI SARDEGNA 4 TRIMESTRE 2025.pdf',
    profileCandidate: 'banco_sardegna_quarterly_statement_v1',
  })

  return {
    id: 'scenario_banco_trimestrale_certificato',
    label: 'Banco trimestrale certificato',
    events: [
      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_IMPORT_STARTED, {
        trigger: 'document_unknown_or_low_confidence',
        initialProfileCandidate: 'banco_sardegna_quarterly_statement_v1',
        initialConfidence: 0.82,
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.SYSTEM),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED, {
        fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.BANK_NAME,
        fieldLabel: 'Banca',
        proposedValue: 'Banco di Sardegna',
        finalValue: 'Banco di Sardegna',
        confidenceBefore: 0.91,
        confidenceAfter: 0.91,
        reason: 'contains_bank_identity_keyword',
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED, {
        fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.IBAN,
        fieldLabel: 'IBAN',
        proposedValue: 'IT96C0101503200000070745491',
        finalValue: 'IT96C0101503200000070745491',
        confidenceBefore: 0.94,
        confidenceAfter: 0.94,
        selectedRowId: 'row-iban-1',
        pageNumber: 1,
        rawText: 'IBAN IT 96 C 01015 03200 000070745491',
        reason: 'contains_valid_iban',
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED, {
        fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.OPENING_BALANCE,
        fieldLabel: 'Saldo iniziale',
        proposedValue: 927.97,
        finalValue: 927.97,
        confidenceBefore: 0.95,
        confidenceAfter: 0.95,
        selectedRowId: 'row-opening-1',
        pageNumber: 1,
        rawText: 'Saldo iniziale al 30/09/2025 927,97',
        reason: 'matches_balance_keyword',
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED, {
        fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_IN,
        fieldLabel: 'Totale entrate',
        proposedValue: 20000,
        finalValue: 20000,
        confidenceBefore: 0.94,
        confidenceAfter: 0.94,
        selectedRowId: 'row-total-in-1',
        pageNumber: 1,
        rawText: 'Totale Entrate 20.000,00',
        reason: 'matches_balance_keyword',
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED, {
        fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_OUT,
        fieldLabel: 'Totale uscite',
        proposedValue: 20117.45,
        finalValue: 20117.45,
        confidenceBefore: 0.94,
        confidenceAfter: 0.94,
        selectedRowId: 'row-total-out-1',
        pageNumber: 1,
        rawText: 'Totale Uscite 20.117,45',
        reason: 'matches_balance_keyword',
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED, {
        fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.CLOSING_BALANCE,
        fieldLabel: 'Saldo finale',
        proposedValue: 810.52,
        finalValue: 810.52,
        confidenceBefore: 0.95,
        confidenceAfter: 0.95,
        selectedRowId: 'row-closing-1',
        pageNumber: 1,
        rawText: 'Saldo finale al 31/12/2025 810,52',
        reason: 'matches_balance_keyword',
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_HEADER_SELECTED, {
        headerRowId: 'row-header-1',
        startPage: 2,
        endPage: 2,
        confidence: 0.97,
        reason: 'contains_movement_header_keywords',
      }),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_FIRST_ROW_SELECTED, {
        firstMovementRowId: 'row-first-movement-1',
        startPage: 2,
        endPage: 2,
        confidence: 0.93,
        reason: 'line_starts_with_date',
      }),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.MOVEMENT_LAST_ROW_SELECTED, {
        lastMovementRowId: 'row-last-movement-1',
        startPage: 2,
        endPage: 2,
        confidence: 0.92,
        reason: 'last_movement_before_summary',
      }),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.COLUMN_PRESET_SELECTED, {
        selectedColumnPreset: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_VALUE_OUT_IN_DESCRIPTION,
        previousColumnPreset: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED,
        confidence: 0.96,
      }),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_CONFIRMED, {
        sectionType: 'scalare_section',
        startRowId: 'row-scalare-start',
        endRowId: 'row-scalare-end',
        startPage: 3,
        endPage: 3,
        reason: 'matches_ignore_section_keyword',
        operatorConfirmed: true,
      }),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IGNORE_SECTION_CONFIRMED, {
        sectionType: 'competenze_section',
        startRowId: 'row-comp-start',
        endRowId: 'row-comp-end',
        startPage: 3,
        endPage: 3,
        reason: 'matches_ignore_section_keyword',
        operatorConfirmed: true,
      }),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_COMPLETED, {
        movementsExtracted: 14,
        totalIn: 20000,
        totalOut: 20117.45,
        openingBalance: 927.97,
        closingBalanceOfficial: 810.52,
        calculatedClosingBalance: 810.52,
        difference: 0,
        rejectedRows: 0,
        reviewRows: 0,
        ignoredRows: 18,
        multilineAttachedRows: 4,
        confidenceOverall: 0.96,
        parseReliabilityLevel: 'certified_balanced',
        parseStatus: 'parsed_balanced',
        blockers: [],
        warnings: [],
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.DRY_RUN),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_SAVABLE, {
        templateDecision: 'template_savable',
        templateScope: 'cliente',
        profileId: 'banco_sardegna_quarterly_statement_v1',
        profileLabel: 'Banco di Sardegna',
        version: '1.0.0',
        reason: 'dry_run_balanced',
        dryRunAuditRef: 'dryrun-banco-trim-001',
        operatorConfirmed: true,
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.TEMPLATE_ENGINE),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_CERTIFIED, {
        finalDecision: 'certified_import',
        reason: 'balanced_and_no_blockers',
        dryRunAuditRef: 'dryrun-banco-trim-001',
        operatorConfirmed: true,
      }),
    ],
  }
}

function buildBancoMensileNonCertificante() {
  const push = buildScenarioEventFactory({
    auditId: 'audit-banco-mens-001',
    importId: 'import-banco-mens-001',
    sourceFileName: 'SIRIA SARDEGNA OTTOBRE 2025.pdf',
    profileCandidate: 'banco_sardegna_monthly_services_v1',
    baseDate: '2026-05-05T10:30:00.000Z',
  })

  return {
    id: 'scenario_banco_mensile_non_certificante',
    label: 'Banco mensile non certificante',
    events: [
      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_IMPORT_STARTED, {
        trigger: 'document_partial_summary',
        initialProfileCandidate: 'banco_sardegna_monthly_services_v1',
        initialConfidence: 0.78,
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.SYSTEM),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED, {
        fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.BANK_NAME,
        fieldLabel: 'Banca',
        proposedValue: 'Banco di Sardegna',
        finalValue: 'Banco di Sardegna',
        confidenceBefore: 0.9,
        confidenceAfter: 0.9,
        reason: 'contains_bank_identity_keyword',
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED, {
        fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.IBAN,
        fieldLabel: 'IBAN',
        proposedValue: 'IT96C0101503200000070745491',
        finalValue: 'IT96C0101503200000070745491',
        confidenceBefore: 0.92,
        confidenceAfter: 0.92,
        selectedRowId: 'row-iban-monthly',
        pageNumber: 1,
        rawText: 'IBAN: IT 96 C 01015 03200 000070745491',
        reason: 'contains_valid_iban',
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.PARSER),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.COLUMN_PRESET_SELECTED, {
        selectedColumnPreset: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_SIGN_AMOUNT_VALUE_DESCRIPTION,
        previousColumnPreset: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED,
        confidence: 0.91,
      }),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_COMPLETED, {
        movementsExtracted: 6,
        totalIn: 6000,
        totalOut: 6707.78,
        openingBalance: null,
        closingBalanceOfficial: null,
        calculatedClosingBalance: null,
        difference: null,
        rejectedRows: 0,
        reviewRows: 1,
        ignoredRows: 5,
        multilineAttachedRows: 2,
        confidenceOverall: 0.82,
        parseReliabilityLevel: 'high_confidence',
        parseStatus: 'parsed_with_review',
        blockers: [],
        warnings: ['official_balances_missing'],
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.DRY_RUN),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_SAVABLE_NON_CERTIFYING, {
        templateDecision: 'template_savable_non_certifying',
        templateScope: 'cliente',
        profileId: 'banco_sardegna_monthly_services_v1',
        profileLabel: 'Banco di Sardegna',
        version: '1.0.0',
        reason: 'stable_layout_without_official_balances',
        dryRunAuditRef: 'dryrun-banco-monthly-001',
        operatorConfirmed: true,
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.TEMPLATE_ENGINE),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_HIGH_CONFIDENCE_REVIEW, {
        finalDecision: 'high_confidence_review',
        reason: 'missing_official_balances',
        dryRunAuditRef: 'dryrun-banco-monthly-001',
        operatorConfirmed: true,
      }),
    ],
  }
}

function buildManualSaldoFinaleScenario() {
  const push = buildScenarioEventFactory({
    auditId: 'audit-manual-closing-001',
    importId: 'import-manual-closing-001',
    sourceFileName: 'documento-sconosciuto.pdf',
    profileCandidate: 'generic_statement_v1',
    baseDate: '2026-05-05T11:00:00.000Z',
  })

  return {
    id: 'scenario_manual_saldo_finale',
    label: 'Documento con saldo finale manuale',
    events: [
      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_IMPORT_STARTED, {
        trigger: 'unknown_document',
        initialProfileCandidate: 'generic_statement_v1',
        initialConfidence: 0.32,
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.SYSTEM),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MANUAL_CHANGED, {
        fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.CLOSING_BALANCE,
        fieldLabel: 'Saldo finale',
        previousValue: null,
        proposedValue: null,
        finalValue: 118576.51,
        confidenceBefore: 0.25,
        confidenceAfter: 0.45,
        selectedRowId: null,
        pageNumber: null,
        rawText: '',
        reason: 'operator_manual_input_after_document_review',
        source: 'operator_manual_input',
        warnings: ['manual_input_non_certifying'],
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.OPERATOR),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.GUIDED_PARSE_COMPLETED, {
        movementsExtracted: 924,
        totalIn: 364205.58,
        totalOut: 395334.04,
        openingBalance: 149704.97,
        closingBalanceOfficial: null,
        calculatedClosingBalance: 118576.51,
        difference: null,
        rejectedRows: 3,
        reviewRows: 12,
        ignoredRows: 20,
        multilineAttachedRows: 8,
        confidenceOverall: 0.58,
        parseReliabilityLevel: 'needs_review',
        parseStatus: 'parsed_with_review',
        blockers: [],
        warnings: ['manual_input_detected_for_critical_balance'],
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.DRY_RUN),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.TEMPLATE_MARKED_NOT_SAVABLE, {
        templateDecision: 'template_not_savable',
        templateScope: 'import_only',
        profileId: 'generic_statement_v1',
        profileLabel: 'Generico',
        version: '1.0.0',
        reason: 'critical_manual_input_without_stable_layout',
        dryRunAuditRef: 'dryrun-manual-closing-001',
        operatorConfirmed: true,
      }, GUIDED_IMPORT_AUDIT_EVENT_SOURCES.TEMPLATE_ENGINE),

      push(GUIDED_IMPORT_AUDIT_EVENT_TYPES.IMPORT_MARKED_LOW_CONFIDENCE_REVIEW, {
        finalDecision: 'low_confidence_review',
        reason: 'manual_critical_field_and_review_rows',
        dryRunAuditRef: 'dryrun-manual-closing-001',
        operatorConfirmed: true,
      }),
    ],
  }
}

export const GUIDED_IMPORT_AUDIT_FIXTURE_SCENARIOS = Object.freeze([
  buildBancoTrimestraleCertificato(),
  buildBancoMensileNonCertificante(),
  buildManualSaldoFinaleScenario(),
])

export function getGuidedImportAuditFixtureScenario(id) {
  return GUIDED_IMPORT_AUDIT_FIXTURE_SCENARIOS.find((scenario) => scenario.id === id) || null
}

export default GUIDED_IMPORT_AUDIT_FIXTURE_SCENARIOS
