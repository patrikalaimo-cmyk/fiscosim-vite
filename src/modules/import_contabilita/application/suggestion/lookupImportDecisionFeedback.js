/**
 * Consume SG-L2 DecisionFeedback LAB for Import staging suggestions (SG-L3 contextual).
 */

import { loadDecisionFeedbackEvents } from '../../../contabilita/application/learning/decisionFeedbackLabStore.js'
import {
  buildImportSuggestionContextKey,
  scoreImportContextKeyMatch,
} from './buildImportSuggestionContextKey.js'

function text(value) {
  return String(value ?? '').trim()
}

function pickMode(values = []) {
  const counts = new Map()
  for (const value of values) {
    const key = text(value)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  let best = null
  let bestCount = 0
  let secondCount = 0
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      secondCount = bestCount
      bestCount = count
      best = value
    } else if (count > secondCount) {
      secondCount = count
    }
  }
  return {
    value: best,
    sampleCount: bestCount,
    ambiguous: Boolean(best && secondCount > 0 && secondCount === bestCount),
    distinctCount: counts.size,
  }
}

/**
 * @returns {{ account: object|null, causale: object|null, causaleIva: object|null }}
 */
export function lookupImportDecisionFeedback({
  societaId = '',
  parsedDocument = null,
  counterpartyAccount = null,
  direction = '',
  storage = globalThis.localStorage,
} = {}) {
  const empty = { account: null, causale: null, causaleIva: null }
  if (!text(societaId)) return empty

  const currentKey = buildImportSuggestionContextKey({
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

  const events = loadDecisionFeedbackEvents(societaId, storage)
    .filter((row) => row.sourceModule === 'import_contabilita' && row.outcome === 'confirmed')

  const byField = {
    account: [],
    causale: [],
    causale_iva: [],
  }

  for (const event of events) {
    const field = text(event.field)
    if (!byField[field]) continue
    const score = scoreImportContextKeyMatch(event.contextKey, currentKey)
    // Require at least same identity (+ optional dir). Pure noise skipped.
    if (score < 40) continue
    byField[field].push({ event, score })
  }

  const resolveField = (field) => {
    const rows = byField[field]
    if (!rows.length) return null
    rows.sort((a, b) => b.score - a.score || String(b.event.createdAt).localeCompare(String(a.event.createdAt)))
    const topScore = rows[0].score
    const topRows = rows.filter((row) => row.score === topScore)
    const mode = pickMode(topRows.map((row) => row.event.finalValue))
    if (!mode.value) return null
    return {
      valueId: mode.value,
      sampleCount: mode.sampleCount,
      ambiguous: mode.ambiguous,
      score: topScore,
      contextKey: currentKey,
      source: 'feedback',
      lastSeenAt: topRows[0]?.event?.createdAt || '',
      explanation: [
        topScore >= 100
          ? 'Proposta da correzione operatore confermata sullo stesso contesto (controparte+descrizione).'
          : 'Proposta da correzione operatore confermata sulla stessa controparte.',
        mode.ambiguous ? 'Feedback ambiguo su questo campo: verificare prima della contabilizzazione.' : '',
      ].filter(Boolean),
    }
  }

  return {
    account: resolveField('account'),
    causale: resolveField('causale'),
    causaleIva: resolveField('causale_iva'),
  }
}
