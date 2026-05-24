export const GUIDED_IMPORT_AUDIT_EVENT_TYPES = Object.freeze({
  // Sessione / staging
  GUIDED_IMPORT_STARTED: 'guided_import_started',
  GUIDED_IMPORT_CANCELLED: 'guided_import_cancelled',
  GUIDED_IMPORT_COMPLETED: 'guided_import_completed',
  STAGING_RESET_FOR_NEW_IMPORT: 'staging_reset_for_new_import',
  STAGING_AUDIT_SAVED: 'staging_audit_saved',
  STAGING_AUDIT_RESTORED: 'staging_audit_restored',
  STAGING_AUDIT_DISCARDED: 'staging_audit_discarded',

  // Campi documento
  DOCUMENT_FIELD_PROPOSED: 'document_field_proposed',
  DOCUMENT_FIELD_CONFIRMED: 'document_field_confirmed',
  DOCUMENT_FIELD_SELECTED_FROM_ROW: 'document_field_selected_from_row',
  DOCUMENT_FIELD_MANUAL_CHANGED: 'document_field_manual_changed',
  DOCUMENT_FIELD_CLEARED: 'document_field_cleared',
  DOCUMENT_FIELD_RESTORED_FROM_PROPOSAL: 'document_field_restored_from_proposal',
  DOCUMENT_FIELD_MARKED_NOT_APPLICABLE: 'document_field_marked_not_applicable',
  DOCUMENT_FIELD_MARKED_MISSING: 'document_field_marked_missing',

  // Righe estratte
  EXTRACTED_ROW_SELECTED: 'extracted_row_selected',
  EXTRACTED_ROW_REJECTED: 'extracted_row_rejected',
  EXTRACTED_ROW_MARKED_AS_SOURCE: 'extracted_row_marked_as_source',
  EXTRACTED_ROW_MARKED_AS_NON_MOVEMENT: 'extracted_row_marked_as_non_movement',
  EXTRACTED_ROW_MARKED_AS_MULTILINE: 'extracted_row_marked_as_multiline',
  EXTRACTED_ROW_OPENED_IN_ORIGINAL_DOCUMENT: 'extracted_row_opened_in_original_document',

  // Sezione movimenti
  MOVEMENT_HEADER_SELECTED: 'movement_header_selected',
  MOVEMENT_FIRST_ROW_SELECTED: 'movement_first_row_selected',
  MOVEMENT_LAST_ROW_SELECTED: 'movement_last_row_selected',
  MOVEMENT_SECTION_CONFIRMED: 'movement_section_confirmed',
  MOVEMENT_SECTION_CHANGED: 'movement_section_changed',
  MOVEMENT_SECTION_CLEARED: 'movement_section_cleared',

  // Layout colonne
  COLUMN_PRESET_SELECTED: 'column_preset_selected',
  COLUMN_MAP_CHANGED: 'column_map_changed',
  DIRECTION_RULE_CHANGED: 'direction_rule_changed',
  AMOUNT_RULE_CHANGED: 'amount_rule_changed',
  DESCRIPTION_RULE_CHANGED: 'description_rule_changed',
  COLUMN_MAPPING_CONFIRMED: 'column_mapping_confirmed',

  // Ignore / multilinea
  IGNORE_SECTION_ADDED: 'ignore_section_added',
  IGNORE_SECTION_CONFIRMED: 'ignore_section_confirmed',
  IGNORE_SECTION_REMOVED: 'ignore_section_removed',
  IGNORE_SECTION_CHANGED: 'ignore_section_changed',
  MULTILINE_RULE_PROPOSED: 'multiline_rule_proposed',
  MULTILINE_RULE_CONFIRMED: 'multiline_rule_confirmed',
  MULTILINE_RULE_CHANGED: 'multiline_rule_changed',
  MULTILINE_ROW_ATTACHED: 'multiline_row_attached',
  MULTILINE_ROW_DETACHED: 'multiline_row_detached',

  // AI
  AI_SUGGESTION_CREATED: 'ai_suggestion_created',
  AI_SUGGESTION_ACCEPTED: 'ai_suggestion_accepted',
  AI_SUGGESTION_REJECTED: 'ai_suggestion_rejected',
  AI_SUGGESTION_MODIFIED: 'ai_suggestion_modified',

  // Dry run
  GUIDED_PARSE_STARTED: 'guided_parse_started',
  GUIDED_PARSE_COMPLETED: 'guided_parse_completed',
  GUIDED_PARSE_FAILED: 'guided_parse_failed',
  GUIDED_PARSE_RECOMPUTED: 'guided_parse_recomputed',

  // Decisioni
  IMPORT_DECISION_SET: 'import_decision_set',
  IMPORT_MARKED_CERTIFIED: 'import_marked_certified',
  IMPORT_MARKED_HIGH_CONFIDENCE_REVIEW: 'import_marked_high_confidence_review',
  IMPORT_MARKED_LOW_CONFIDENCE_REVIEW: 'import_marked_low_confidence_review',
  IMPORT_MARKED_UNUSABLE: 'import_marked_unusable',
  IMPORT_MARKED_IMPORT_ONLY: 'import_marked_import_only',
  TEMPLATE_DECISION_SET: 'template_decision_set',
  TEMPLATE_MARKED_SAVABLE: 'template_marked_savable',
  TEMPLATE_MARKED_SAVABLE_NON_CERTIFYING: 'template_marked_savable_non_certifying',
  TEMPLATE_MARKED_NOT_SAVABLE: 'template_marked_not_savable',
  TEMPLATE_SAVED: 'template_saved',
  TEMPLATE_SAVE_CANCELLED: 'template_save_cancelled',
  TEMPLATE_AUTO_SAVED: 'template_auto_saved',
  TEMPLATE_AUTO_UPDATED: 'template_auto_updated',
  TEMPLATE_AUTO_NOT_SAVED: 'template_auto_not_saved',
  TEMPLATE_AUTO_SAVED_NON_CERTIFYING: 'template_auto_saved_non_certifying',
  TEMPLATE_SUGGESTION_OPENED: 'template_suggestion_opened',
  TEMPLATE_SUGGESTION_APPLIED: 'template_suggestion_applied',

  // Warning / blocker
  GUIDED_IMPORT_BLOCKER_ADDED: 'guided_import_blocker_added',
  GUIDED_IMPORT_BLOCKER_RESOLVED: 'guided_import_blocker_resolved',
  GUIDED_IMPORT_WARNING_ADDED: 'guided_import_warning_added',
  GUIDED_IMPORT_WARNING_RESOLVED: 'guided_import_warning_resolved',
})

export const GUIDED_IMPORT_AUDIT_EVENT_TYPE_VALUES = Object.freeze(
  Object.values(GUIDED_IMPORT_AUDIT_EVENT_TYPES)
)

export const GUIDED_IMPORT_AUDIT_EVENT_TYPE_SET = new Set(GUIDED_IMPORT_AUDIT_EVENT_TYPE_VALUES)

export const GUIDED_IMPORT_AUDIT_EVENT_SOURCES = Object.freeze({
  PARSER: 'parser',
  AI_SUGGESTION: 'ai_suggestion',
  OPERATOR: 'operator',
  SYSTEM: 'system',
  DRY_RUN: 'dry_run',
  TEMPLATE_ENGINE: 'template_engine',
})

export const GUIDED_IMPORT_AUDIT_EVENT_SOURCE_VALUES = Object.freeze(
  Object.values(GUIDED_IMPORT_AUDIT_EVENT_SOURCES)
)

export const GUIDED_IMPORT_AUDIT_EVENT_SOURCE_SET = new Set(GUIDED_IMPORT_AUDIT_EVENT_SOURCE_VALUES)

export const GUIDED_IMPORT_AUDIT_FIELD_IDS = Object.freeze({
  BANK_NAME: 'bank_name',
  IBAN: 'iban',
  BIC: 'bic',
  ACCOUNT_NUMBER: 'account_number',
  HOLDER: 'holder',
  PERIOD_START: 'period_start',
  PERIOD_END: 'period_end',
  OPENING_BALANCE: 'opening_balance',
  TOTAL_IN: 'total_in',
  TOTAL_OUT: 'total_out',
  CLOSING_BALANCE: 'closing_balance',
})

export const GUIDED_IMPORT_AUDIT_FIELD_ID_VALUES = Object.freeze(
  Object.values(GUIDED_IMPORT_AUDIT_FIELD_IDS)
)

export const GUIDED_IMPORT_AUDIT_FIELD_ID_SET = new Set(GUIDED_IMPORT_AUDIT_FIELD_ID_VALUES)

export const GUIDED_IMPORT_AUDIT_CRITICAL_MANUAL_REASON_FIELDS = new Set([
  GUIDED_IMPORT_AUDIT_FIELD_IDS.IBAN,
  GUIDED_IMPORT_AUDIT_FIELD_IDS.OPENING_BALANCE,
  GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_IN,
  GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_OUT,
  GUIDED_IMPORT_AUDIT_FIELD_IDS.CLOSING_BALANCE,
])

export const GUIDED_IMPORT_AUDIT_TEMPLATE_SCOPE = Object.freeze({
  STUDIO: 'studio',
  CLIENTE: 'cliente',
  IMPORT_ONLY: 'import_only',
  GLOBAL: 'global',
})

export const GUIDED_IMPORT_AUDIT_TEMPLATE_SCOPE_VALUES = Object.freeze(
  Object.values(GUIDED_IMPORT_AUDIT_TEMPLATE_SCOPE)
)

export const GUIDED_IMPORT_AUDIT_TEMPLATE_SCOPE_SET = new Set(GUIDED_IMPORT_AUDIT_TEMPLATE_SCOPE_VALUES)

export const GUIDED_IMPORT_AUDIT_COLUMN_PRESETS = Object.freeze({
  DATE_VALUE_OUT_IN_DESCRIPTION: 'date_value_out_in_description',
  DATE_SIGN_AMOUNT_VALUE_DESCRIPTION: 'date_sign_amount_value_description',
  DATE_SIGNED_AMOUNT_DESCRIPTION: 'date_signed_amount_description',
  CSV_EXCEL_EXPLICIT_COLUMNS: 'csv_excel_explicit_columns',
  CUSTOM_GUIDED: 'custom_guided',
})

export const GUIDED_IMPORT_AUDIT_COLUMN_PRESET_VALUES = Object.freeze(
  Object.values(GUIDED_IMPORT_AUDIT_COLUMN_PRESETS)
)

export const GUIDED_IMPORT_AUDIT_COLUMN_PRESET_SET = new Set(GUIDED_IMPORT_AUDIT_COLUMN_PRESET_VALUES)

export const GUIDED_IMPORT_AUDIT_FIELD_EVENT_TYPES = new Set([
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_PROPOSED,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_CONFIRMED,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_SELECTED_FROM_ROW,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MANUAL_CHANGED,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_CLEARED,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_RESTORED_FROM_PROPOSAL,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MARKED_NOT_APPLICABLE,
  GUIDED_IMPORT_AUDIT_EVENT_TYPES.DOCUMENT_FIELD_MARKED_MISSING,
])
