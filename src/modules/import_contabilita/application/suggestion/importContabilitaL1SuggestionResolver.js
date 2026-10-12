/**
 * SG-L1 SuggestionResolver — thin facade over Import Contabilità history adapters.
 * No DB tables; explainable DTO for staging + Working View IVA.
 */
import {
  buildImportContabilitaAccountingHistoryIndex,
  resolveImportContabilitaAccountingHistorySuggestion,
} from '../../domain/importContabilitaAccountingHistory.js'
import {
  buildImportContabilitaVatHistoryIndex,
  resolveImportContabilitaVatHistorySuggestion,
} from '../../domain/importContabilitaVatHistory.js'
import { resolveImportWorkingViewCausaleIvaSuggestion } from '../../domain/importContabilitaWorkingViewIvaDraft.js'

function text(value) {
  return String(value ?? '').trim()
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function createImportSuggestionExplanation({
  source = 'none',
  contextKey = '',
  matchType = '',
  sampleCount = 0,
  fieldSampleCount = 0,
  lastSeenAt = '',
  conflicts = [],
  explanation = [],
} = {}) {
  return {
    source: text(source) || 'none',
    contextKey: text(contextKey),
    matchType: text(matchType),
    sampleCount: num(sampleCount),
    fieldSampleCount: num(fieldSampleCount),
    lastSeenAt: text(lastSeenAt),
    conflicts: Array.isArray(conflicts) ? conflicts : [],
    explanation: Array.isArray(explanation)
      ? explanation.map((line) => text(line)).filter(Boolean)
      : [],
  }
}

export function buildImportContabilitaL1HistoryIndexes({
  vatHistoryRows = [],
  accountingHistoryBundle = {},
  pianoConti = [],
  causaliContabili = [],
} = {}) {
  return {
    vatHistoryIndex: buildImportContabilitaVatHistoryIndex(vatHistoryRows),
    accountingHistoryIndex: buildImportContabilitaAccountingHistoryIndex({
      documents: accountingHistoryBundle?.documents || [],
      headers: accountingHistoryBundle?.headers || [],
      rows: accountingHistoryBundle?.rows || [],
      pianoConti,
      causaliContabili,
    }),
  }
}

/**
 * Staging working-table: conto/causale from società history (never overwrite manuals).
 */
export function resolveImportContabilitaStagingAccountingHistorySuggestions({
  historyIndex = new Map(),
  parsedDocument = null,
  counterpartyAccount = null,
  direction = '',
  pianoContiById = new Map(),
  causaliContabiliById = new Map(),
  hasManualAccount = false,
  hasManualCausale = false,
} = {}) {
  const suggestion = resolveImportContabilitaAccountingHistorySuggestion({
    historyIndex,
    parsedDocument,
    counterpartyAccount,
    direction,
    pianoContiById,
    causaliContabiliById,
  })
  if (!suggestion) return null

  const base = {
    source: 'history',
    contextKey: suggestion.matchKey || '',
    matchType: suggestion.matchType || '',
    sampleCount: suggestion.sampleCount || 0,
    lastSeenAt: suggestion.lastSeenAt || '',
    conflicts: [],
  }

  const account = !hasManualAccount && suggestion.costRevenueAccount
    ? {
        value: suggestion.costRevenueAccount,
        explanation: createImportSuggestionExplanation({
          ...base,
          fieldSampleCount: suggestion.accountSampleCount || 0,
          explanation: ['Proposta da storico contabile società (conto costo/ricavo).'],
        }),
        decorateParams: {
          kind: 'account',
          sampleCount: suggestion.accountSampleCount || 0,
          totalSamples: suggestion.sampleCount || 0,
          lastSeenAt: suggestion.lastSeenAt || '',
        },
      }
    : null

  const causale = !hasManualCausale && suggestion.causaleContabile
    ? {
        value: suggestion.causaleContabile,
        explanation: createImportSuggestionExplanation({
          ...base,
          fieldSampleCount: suggestion.causaleSampleCount || 0,
          explanation: ['Proposta da storico contabile società (causale).'],
        }),
        decorateParams: {
          kind: 'causale',
          sampleCount: suggestion.causaleSampleCount || 0,
          totalSamples: suggestion.sampleCount || 0,
          lastSeenAt: suggestion.lastSeenAt || '',
        },
      }
    : null

  if (!account && !causale) return null
  return { account, causale }
}

/**
 * Working View IVA: manual/explicit > standard Studio > storico (+ conflicts DTO).
 */
export function resolveImportContabilitaWorkingViewVatRowSuggestion({
  vatHistoryIndex = new Map(),
  source = {},
  counterpartyAccount = null,
  parsedDocument = null,
  causaliIva = [],
  isDemoSocieta = false,
  manualCausaleIvaId = '',
} = {}) {
  const historicalSuggestion = resolveImportContabilitaVatHistorySuggestion({
    historyIndex: vatHistoryIndex,
    counterpartyAccount,
    parsedDocument,
    source,
  })
  const suggestion = resolveImportWorkingViewCausaleIvaSuggestion({
    source,
    counterpartyAccount,
    causaliIva,
    isDemoSocieta,
    historicalSuggestion,
    manualCausaleIvaId,
  })

  const conflicts = []
  if (
    suggestion.standardCausaleIvaId
    && suggestion.historicalCausaleIvaId
    && suggestion.standardCausaleIvaId !== suggestion.historicalCausaleIvaId
  ) {
    conflicts.push({
      kind: 'standard_vs_history',
      field: 'causale_iva',
      standardValueId: suggestion.standardCausaleIvaId,
      historicalValueId: suggestion.historicalCausaleIvaId,
      message: suggestion.warning || '',
    })
  }

  return {
    ...suggestion,
    historicalDetraibilePercent: historicalSuggestion?.detraibilePercent ?? null,
    historicalSampleCount: historicalSuggestion?.sampleCount ?? 0,
    explanation: createImportSuggestionExplanation({
      source: suggestion.source || 'none',
      contextKey: historicalSuggestion?.matchKey || '',
      matchType: historicalSuggestion?.matchType || '',
      sampleCount: historicalSuggestion?.sampleCount || 0,
      fieldSampleCount: historicalSuggestion?.causaleSampleCount || 0,
      lastSeenAt: historicalSuggestion?.lastSeenAt || '',
      conflicts,
      explanation: suggestion.warning ? [suggestion.warning] : [],
    }),
  }
}
