/**
 * Read LAB DecisionFeedback bank partita confirms and boost candidate scores.
 */

import { loadDecisionFeedbackEvents } from './decisionFeedbackLabStore.js'

function text(value) {
  return String(value ?? '').trim()
}

function money(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function normalizeKey(value) {
  return text(value).toLowerCase()
}

/**
 * @returns {{ partitaIds: Set<string>, hits: object[] }}
 */
export function lookupBankMatchMemory({
  societaId = '',
  movement = {},
  storage = globalThis.localStorage,
} = {}) {
  const events = loadDecisionFeedbackEvents(societaId, storage)
    .filter((row) => row.sourceModule === 'riconciliazione_bancaria' && row.field === 'partita' && row.outcome === 'confirmed')

  const counterparty = normalizeKey(movement.counterpartyName || movement.counterparty || '')
  const amount = money(movement.amount)
  const direction = text(movement.direction)

  const hits = []
  const partitaIds = new Set()

  for (const event of events) {
    const finalPartita = text(event.finalValue)
    if (!finalPartita) continue
    const sameCounterparty = counterparty
      && event.counterpartyKey
      && (counterparty.includes(event.counterpartyKey) || event.counterpartyKey.includes(counterparty))
    const amountClose = amount > 0 && event.amount != null && Math.abs(amount - Number(event.amount)) <= 0.01
    const contextBits = text(event.contextKey).split('|')
    const sameDirection = !direction || !contextBits[0] || contextBits[0] === direction
    if ((sameCounterparty || amountClose) && sameDirection) {
      partitaIds.add(finalPartita)
      hits.push(event)
    }
  }

  return { partitaIds, hits }
}

/**
 * Boost candidates that match LAB memory of confirmed partite.
 */
export function applyBankMatchMemoryBoost(candidates = [], memory = { partitaIds: new Set() }) {
  const ids = memory?.partitaIds instanceof Set ? memory.partitaIds : new Set()
  if (!ids.size) return Array.isArray(candidates) ? candidates : []
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const partitaId = text(candidate?.partitaId)
    if (!partitaId || !ids.has(partitaId)) return candidate
    const confidence = Math.min(0.99, Math.round((Number(candidate.confidence || 0) + 0.08) * 100) / 100)
    const reasons = Array.isArray(candidate.reasons) ? candidate.reasons : []
    return {
      ...candidate,
      confidence,
      score: confidence,
      reasons: reasons.includes('match_memory_confirmed')
        ? reasons
        : [...reasons, 'match_memory_confirmed'],
      matchMemoryHit: true,
    }
  })
}
