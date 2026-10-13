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
import { buildImportSuggestionContextKey } from './buildImportSuggestionContextKey.js'
import { lookupImportDecisionFeedback } from './lookupImportDecisionFeedback.js'
import { applyStudioRuleFallback } from '../../../contabilita/application/learning/resolveStudioRuleToSocietaTargets.js'

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
 * Staging working-table: feedback LAB (contextual) > history (never overwrite manuals).
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
  societaId = '',
  feedbackLookup = null,
  storage = globalThis.localStorage,
  /** Optional Livello B studio rules (codes/natura only — never foreign UUIDs). */
  studioRules = [],
  targetSocietaCatalog = null,
} = {}) {
  const suggestion = resolveImportContabilitaAccountingHistorySuggestion({
    historyIndex,
    parsedDocument,
    counterpartyAccount,
    direction,
    pianoContiById,
    causaliContabiliById,
  })

  const feedback = feedbackLookup || (societaId
    ? lookupImportDecisionFeedback({
      societaId,
      parsedDocument,
      counterpartyAccount,
      direction,
      storage,
    })
    : { account: null, causale: null, causaleIva: null })

  const contextKey = buildImportSuggestionContextKey({
    counterpartyPiva: counterpartyAccount?.partitaIva
      || counterpartyAccount?.partita_iva
      || parsedDocument?.fornitore?.partitaIva
      || parsedDocument?.cedente?.partitaIva
      || '',
    counterpartyName: counterpartyAccount?.descrizione
      || counterpartyAccount?.denominazione
      || parsedDocument?.fornitore?.denominazione
      || parsedDocument?.cedente?.denominazione
      || '',
    direction,
    parsedDocument,
  })

  const resolveField = ({
    hasManual,
    feedbackHit,
    historyValue,
    historySampleCount,
    historyTotal,
    historyLastSeen,
    historyMatchType,
    kind,
  }) => {
    if (hasManual) return null

    const feedbackValue = feedbackHit?.valueId
      ? (kind === 'account' ? pianoContiById.get(feedbackHit.valueId) : causaliContabiliById.get(feedbackHit.valueId)) || null
      : null

    const conflicts = []
    if (
      feedbackValue
      && historyValue
      && text(feedbackValue.id) !== text(historyValue.id)
    ) {
      conflicts.push({
        kind: 'feedback_vs_history',
        field: kind,
        feedbackValueId: text(feedbackValue.id),
        historicalValueId: text(historyValue.id),
        message: 'Correzione operatore diversa dallo storico mode: preferita la conferma recente.',
      })
    }
    if (feedbackHit?.ambiguous) {
      conflicts.push({
        kind: 'feedback_ambiguous',
        field: kind,
        message: 'Feedback multipli discordanti sullo stesso contesto.',
      })
    }

    if (feedbackValue) {
      return {
        value: feedbackValue,
        explanation: createImportSuggestionExplanation({
          source: 'feedback',
          contextKey: feedbackHit.contextKey || contextKey,
          matchType: feedbackHit.score >= 100 ? 'feedback_context' : 'feedback_counterparty',
          sampleCount: feedbackHit.sampleCount || 0,
          fieldSampleCount: feedbackHit.sampleCount || 0,
          lastSeenAt: feedbackHit.lastSeenAt || '',
          conflicts,
          explanation: feedbackHit.explanation || [],
        }),
        decorateParams: {
          kind,
          sampleCount: feedbackHit.sampleCount || 0,
          totalSamples: feedbackHit.sampleCount || 0,
          lastSeenAt: feedbackHit.lastSeenAt || '',
          source: 'feedback',
        },
        requiresConfirmation: Boolean(feedbackHit.ambiguous || conflicts.length),
      }
    }

    if (!historyValue) return null
    const historyConflicts = [
      ...conflicts,
      ...((Array.isArray(suggestion?.conflicts) ? suggestion.conflicts : [])
        .filter((row) => !row?.field || row.field === kind)),
    ]
    const historyLines = [
      suggestion?.matchType?.includes('desc')
        ? 'Proposta da storico contestuale (controparte+descrizione).'
        : kind === 'account'
          ? 'Proposta da storico contabile società (conto costo/ricavo).'
          : 'Proposta da storico contabile società (causale).',
    ]
    if (historyConflicts.some((row) => row.kind === 'history_ambiguous')) {
      historyLines.push('Storico ambiguo: conferma operatore consigliata.')
    }
    return {
      value: historyValue,
      explanation: createImportSuggestionExplanation({
        source: 'history',
        contextKey: suggestion?.matchKey || contextKey,
        matchType: historyMatchType || suggestion?.matchType || '',
        sampleCount: historyTotal || 0,
        fieldSampleCount: historySampleCount || 0,
        lastSeenAt: historyLastSeen || '',
        conflicts: historyConflicts,
        explanation: historyLines,
      }),
      decorateParams: {
        kind,
        sampleCount: historySampleCount || 0,
        totalSamples: historyTotal || 0,
        lastSeenAt: historyLastSeen || '',
      },
      requiresConfirmation: Boolean(suggestion?.requiresConfirmation || historyConflicts.length),
    }
  }

  const account = resolveField({
    hasManual: hasManualAccount,
    feedbackHit: feedback.account,
    historyValue: suggestion?.costRevenueAccount || null,
    historySampleCount: suggestion?.accountSampleCount || 0,
    historyTotal: suggestion?.sampleCount || 0,
    historyLastSeen: suggestion?.lastSeenAt || '',
    historyMatchType: suggestion?.matchType || '',
    kind: 'account',
  })

  const causale = resolveField({
    hasManual: hasManualCausale,
    feedbackHit: feedback.causale,
    historyValue: suggestion?.causaleContabile || null,
    historySampleCount: suggestion?.causaleSampleCount || 0,
    historyTotal: suggestion?.sampleCount || 0,
    historyLastSeen: suggestion?.lastSeenAt || '',
    historyMatchType: suggestion?.matchType || '',
    kind: 'causale',
  })

  // SG-L4: studio rule fallback only when history/feedback did not fill the field.
  if ((!account || !causale) && Array.isArray(studioRules) && studioRules.length) {
    const catalog = targetSocietaCatalog || {
      pianoConti: Array.from(pianoContiById.values()),
      causaliContabili: Array.from(causaliContabiliById.values()),
      causaliIva: [],
    }
    for (const rule of studioRules) {
      const fallback = applyStudioRuleFallback({
        hasSuggestion: Boolean(account && causale),
        rule,
        targetSocietaCatalog: catalog,
      })
      if (!fallback.applied) continue
      const resolved = fallback.resolved
      if (!account && !hasManualAccount && resolved.account) {
        account = {
          value: resolved.account,
          explanation: createImportSuggestionExplanation({
            source: 'studio_rule',
            contextKey,
            matchType: 'studio_rule',
            sampleCount: 0,
            fieldSampleCount: 0,
            explanation: [`Regola studio ${resolved.ruleId || ''} risolta per codice/natura nella società attiva.`.trim()],
          }),
          decorateParams: {
            kind: 'account',
            sampleCount: 0,
            totalSamples: 0,
            lastSeenAt: '',
            source: 'studio_rule',
          },
          requiresConfirmation: Boolean((resolved.warnings || []).length),
        }
      }
      if (!causale && !hasManualCausale && resolved.causale) {
        causale = {
          value: resolved.causale,
          explanation: createImportSuggestionExplanation({
            source: 'studio_rule',
            contextKey,
            matchType: 'studio_rule',
            sampleCount: 0,
            fieldSampleCount: 0,
            explanation: [`Regola studio ${resolved.ruleId || ''} risolta per codice nella società attiva.`.trim()],
          }),
          decorateParams: {
            kind: 'causale',
            sampleCount: 0,
            totalSamples: 0,
            lastSeenAt: '',
            source: 'studio_rule',
          },
          requiresConfirmation: Boolean((resolved.warnings || []).length),
        }
      }
      if (account && causale) break
    }
  }

  if (!account && !causale) return null
  return { account, causale, contextKey }
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
