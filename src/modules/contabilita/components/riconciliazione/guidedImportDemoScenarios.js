import {
  GUIDED_IMPORT_AUDIT_COLUMN_PRESETS,
  GUIDED_IMPORT_AUDIT_FIELD_IDS,
} from './guidedImportAuditEventTypes.js'

const DEMO_ROW_BASE = [
  {
    rowId: 'row-1',
    pageNumber: 1,
    lineNumber: 12,
    text: 'BANCO DI SARDEGNA - CONTO CORRENTE ORDINARIO',
    candidateTypes: ['bank_header'],
    candidateDates: [],
    candidateAmounts: [],
    confidence: 0.98,
  },
  {
    rowId: 'row-2',
    pageNumber: 1,
    lineNumber: 15,
    text: 'IBAN IT96C0101503200000070745491 BIC BPMOIT22XXX',
    candidateTypes: ['iban', 'bic'],
    candidateDates: [],
    candidateAmounts: [],
    confidence: 0.97,
  },
  {
    rowId: 'row-3',
    pageNumber: 1,
    lineNumber: 21,
    text: 'DATA VALUTA USCITE ENTRATE DESCRIZIONE',
    candidateTypes: ['movement_header'],
    candidateDates: [],
    candidateAmounts: [],
    confidence: 0.99,
  },
  {
    rowId: 'row-4',
    pageNumber: 1,
    lineNumber: 22,
    text: '02/10/25 30/09/25 5,49 - CANONE SERVIZI TELEMATICI',
    candidateTypes: ['movement'],
    candidateDates: ['02/10/25', '30/09/25'],
    candidateAmounts: [5.49],
    confidence: 0.9,
  },
  {
    rowId: 'row-5',
    pageNumber: 1,
    lineNumber: 36,
    text: '31/12/2025 SALDO CONTABILE FINALE EUR 810,52',
    candidateTypes: ['closing_balance'],
    candidateDates: ['31/12/2025'],
    candidateAmounts: [810.52],
    confidence: 0.96,
  },
  {
    rowId: 'row-6',
    pageNumber: 2,
    lineNumber: 7,
    text: 'Riassunto Scalare competenze e conteggi',
    candidateTypes: ['ignore_section'],
    candidateDates: [],
    candidateAmounts: [],
    confidence: 0.85,
  },
  {
    rowId: 'row-7',
    pageNumber: 2,
    lineNumber: 10,
    text: 'RATA PRESTITO',
    candidateTypes: ['multiline_parent'],
    candidateDates: [],
    candidateAmounts: [6652.29],
    confidence: 0.87,
  },
  {
    rowId: 'row-8',
    pageNumber: 2,
    lineNumber: 11,
    text: 'Quota capitale 6.512,00 Interessi 120,29 Spese 20,00',
    candidateTypes: ['multiline_child', 'movement_detail'],
    candidateDates: [],
    candidateAmounts: [6512, 120.29, 20],
    confidence: 0.84,
  },
]

export const GUIDED_IMPORT_DEMO_PRESET_DESCRIPTIONS = Object.freeze({
  [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_VALUE_OUT_IN_DESCRIPTION]: 'DATA + VALUTA + USCITE + ENTRATE + DESCRIZIONE',
  [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_SIGN_AMOUNT_VALUE_DESCRIPTION]: 'DATA + SEGNO(D/A) + IMPORTO + VALUTA + DESCRIZIONE',
  [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_SIGNED_AMOUNT_DESCRIPTION]: 'DATA + IMPORTO con segno + DESCRIZIONE',
  [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CSV_EXCEL_EXPLICIT_COLUMNS]: 'CSV/Excel con colonne esplicite mappate',
  [GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED]: 'Preset guidato custom definito in demo',
})

const BASE_FIELDS = [
  {
    key: 'bank_name',
    label: 'Banca',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.BANK_NAME,
    proposedValue: 'Banco di Sardegna',
    finalValue: 'Banco di Sardegna',
    confidence: 0.97,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'iban',
    label: 'IBAN',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.IBAN,
    proposedValue: 'IT96C0101503200000070745491',
    finalValue: 'IT96C0101503200000070745491',
    confidence: 0.98,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'bic',
    label: 'BIC',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.BIC,
    proposedValue: 'BPMOIT22XXX',
    finalValue: 'BPMOIT22XXX',
    confidence: 0.83,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'account_number',
    label: 'Numero conto',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.ACCOUNT_NUMBER,
    proposedValue: '000070745491',
    finalValue: '000070745491',
    confidence: 0.82,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'holder',
    label: 'Intestatario',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.HOLDER,
    proposedValue: 'SIRIA S.R.L.',
    finalValue: 'SIRIA S.R.L.',
    confidence: 0.88,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'period_start',
    label: 'Periodo da',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.PERIOD_START,
    proposedValue: '30/09/2025',
    finalValue: '30/09/2025',
    confidence: 0.91,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'period_end',
    label: 'Periodo a',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.PERIOD_END,
    proposedValue: '31/12/2025',
    finalValue: '31/12/2025',
    confidence: 0.91,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'opening_balance',
    label: 'Saldo iniziale',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.OPENING_BALANCE,
    proposedValue: '927,97',
    finalValue: '927,97',
    confidence: 0.79,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'total_in',
    label: 'Totale entrate',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_IN,
    proposedValue: '20.000,00',
    finalValue: '20.000,00',
    confidence: 0.95,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'total_out',
    label: 'Totale uscite',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_OUT,
    proposedValue: '20.117,45',
    finalValue: '20.117,45',
    confidence: 0.95,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'closing_balance',
    label: 'Saldo finale',
    fieldId: GUIDED_IMPORT_AUDIT_FIELD_IDS.CLOSING_BALANCE,
    proposedValue: '810,52',
    finalValue: '810,52',
    confidence: 0.95,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: true,
    actionType: 'document',
  },
  {
    key: 'movement_header',
    label: 'Header movimenti',
    proposedValue: 'DATA VALUTA USCITE ENTRATE DESCRIZIONE',
    finalValue: 'DATA VALUTA USCITE ENTRATE DESCRIZIONE',
    confidence: 0.99,
    source: 'row_1_21',
    status: 'proposed',
    allowManualEdit: false,
    actionType: 'movement_header',
  },
  {
    key: 'first_movement_row',
    label: 'Prima riga movimento',
    proposedValue: 'row-4',
    finalValue: 'row-4',
    confidence: 0.86,
    source: 'row_1_22',
    status: 'proposed',
    allowManualEdit: false,
    actionType: 'movement_first',
  },
  {
    key: 'last_movement_row',
    label: 'Ultima riga movimento',
    proposedValue: 'row-5',
    finalValue: 'row-5',
    confidence: 0.86,
    source: 'row_1_36',
    status: 'proposed',
    allowManualEdit: false,
    actionType: 'movement_last',
  },
  {
    key: 'column_preset',
    label: 'Preset colonne',
    proposedValue: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_VALUE_OUT_IN_DESCRIPTION,
    finalValue: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_VALUE_OUT_IN_DESCRIPTION,
    confidence: 0.94,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: false,
    actionType: 'column_preset',
  },
  {
    key: 'ignore_sections',
    label: 'Sezioni da ignorare',
    proposedValue: 'Riassunto Scalare; Elementi per il conteggio competenze',
    finalValue: 'Riassunto Scalare; Elementi per il conteggio competenze',
    confidence: 0.88,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: false,
    actionType: 'ignore_sections',
  },
  {
    key: 'multiline_rules',
    label: 'Regole multilinea',
    proposedValue: 'RATA PRESTITO + righe dettaglio',
    finalValue: 'RATA PRESTITO + righe dettaglio',
    confidence: 0.82,
    source: 'parser_demo',
    status: 'proposed',
    allowManualEdit: false,
    actionType: 'multiline',
  },
]

export const GUIDED_IMPORT_DEMO_SCENARIOS = Object.freeze([
  {
    id: 'banco_trimestrale_certificabile',
    label: 'Banco Sardegna trimestrale certificabile',
    description: 'Scenario demo con quadratura certificabile e template salvabile.',
    fields: BASE_FIELDS,
    extractedRows: DEMO_ROW_BASE,
    suggestedIgnoreSections: ['Riassunto Scalare', 'Elementi per il conteggio competenze'],
    multilineExample: {
      parentRowId: 'row-7',
      childRowIds: ['row-8'],
      text: 'RATA PRESTITO | Quota capitale | Interessi | Spese',
    },
    dryRunResult: {
      movementsExtracted: 14,
      totalIn: 20000,
      totalOut: 20117.45,
      openingBalance: 927.97,
      closingBalanceOfficial: 810.52,
      calculatedClosingBalance: 810.52,
      difference: 0,
      parseStatus: 'parsed_with_review',
      parseReliabilityLevel: 'certified_balanced',
      finalDecision: 'certified_import',
      templateDecision: 'template_savable',
      warnings: [],
      blockers: [],
    },
  },
  {
    id: 'banco_mensile_non_certificante',
    label: 'Banco Sardegna mensile non certificante',
    description: 'Scenario demo con saldi ufficiali incompleti e review ad alta confidenza.',
    fields: BASE_FIELDS.map((field) => {
      if (field.key === 'movement_header') {
        return {
          ...field,
          proposedValue: 'DATA SEGNO (D/A) IMPORTO VALUTA DESCRIZIONE',
          finalValue: 'DATA SEGNO (D/A) IMPORTO VALUTA DESCRIZIONE',
        }
      }
      if (field.key === 'column_preset') {
        return {
          ...field,
          proposedValue: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_SIGN_AMOUNT_VALUE_DESCRIPTION,
          finalValue: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.DATE_SIGN_AMOUNT_VALUE_DESCRIPTION,
        }
      }
      if (field.key === 'opening_balance' || field.key === 'closing_balance') {
        return {
          ...field,
          proposedValue: '',
          finalValue: '',
          status: 'missing',
          confidence: 0.32,
        }
      }
      return field
    }),
    extractedRows: DEMO_ROW_BASE.map((row) => {
      if (row.rowId === 'row-3') {
        return {
          ...row,
          text: 'DATA SEGNO (D/A) IMPORTO VALUTA DESCRIZIONE',
        }
      }
      return row
    }),
    suggestedIgnoreSections: ['Riassunto Scalare', 'Informativa'],
    multilineExample: {
      parentRowId: 'row-7',
      childRowIds: ['row-8'],
      text: 'RATA PRESTITO | Quota capitale | Interessi | Spese',
    },
    dryRunResult: {
      movementsExtracted: 7,
      totalIn: 6120,
      totalOut: 6678.72,
      openingBalance: null,
      closingBalanceOfficial: null,
      calculatedClosingBalance: null,
      difference: null,
      parseStatus: 'parsed_with_review',
      parseReliabilityLevel: 'high_confidence',
      finalDecision: 'high_confidence_review',
      templateDecision: 'template_savable_non_certifying',
      warnings: [{ code: 'missing_official_balances', reason: 'Saldo ufficiale non disponibile nel documento mensile' }],
      blockers: [],
    },
  },
  {
    id: 'documento_sconosciuto_bassa_confidenza',
    label: 'Documento sconosciuto / bassa confidenza',
    description: 'Scenario demo con campi incompleti, righe unknown e decisione prudente.',
    fields: BASE_FIELDS.map((field) => {
      if (field.key === 'bank_name') {
        return {
          ...field,
          proposedValue: 'Banca non riconosciuta',
          finalValue: 'Banca non riconosciuta',
          confidence: 0.31,
          status: 'proposed',
        }
      }
      if (field.key === 'iban' || field.key === 'closing_balance') {
        return {
          ...field,
          proposedValue: '',
          finalValue: '',
          status: 'missing',
          confidence: 0.22,
        }
      }
      if (field.key === 'movement_header') {
        return {
          ...field,
          proposedValue: 'RIGA MOVIMENTO NON STABILE',
          finalValue: 'RIGA MOVIMENTO NON STABILE',
          confidence: 0.25,
        }
      }
      if (field.key === 'column_preset') {
        return {
          ...field,
          proposedValue: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED,
          finalValue: GUIDED_IMPORT_AUDIT_COLUMN_PRESETS.CUSTOM_GUIDED,
          confidence: 0.31,
        }
      }
      return field
    }),
    extractedRows: DEMO_ROW_BASE.map((row, index) => ({
      ...row,
      confidence: Math.max(0.2, row.confidence - 0.45),
      text: index % 2 === 0 ? `${row.text} [unknown-block]` : row.text,
      candidateTypes: row.candidateTypes.includes('movement') ? ['unknown'] : row.candidateTypes,
    })),
    suggestedIgnoreSections: ['Footer legale', 'Informativa'],
    multilineExample: {
      parentRowId: 'row-7',
      childRowIds: ['row-8'],
      text: 'RATA PRESTITO non confermata, righe parziali',
    },
    dryRunResult: {
      movementsExtracted: 3,
      totalIn: 900,
      totalOut: 1250.8,
      openingBalance: null,
      closingBalanceOfficial: null,
      calculatedClosingBalance: null,
      difference: null,
      parseStatus: 'parsed_with_review',
      parseReliabilityLevel: 'needs_review',
      finalDecision: 'low_confidence_review',
      templateDecision: 'template_not_savable',
      warnings: [{ code: 'unknown_rows', reason: 'Molte righe classificabili come unknown' }],
      blockers: [{ code: 'missing_required_document_fields', reason: 'IBAN e saldo finale mancanti' }],
    },
  },
])

export function getGuidedImportDemoScenario(scenarioId) {
  const fallback = GUIDED_IMPORT_DEMO_SCENARIOS[0]
  return GUIDED_IMPORT_DEMO_SCENARIOS.find((item) => item.id === scenarioId) || fallback
}
