/**
 * SG-L2 DecisionFeedback LAB store — append-only localStorage + optional DB dual-write.
 * DB path: contabile_decision_feedback via /api/studio/decision-feedback (LAB flag).
 */

import {
  buildDecisionFeedbackEvent,
  decisionFeedbackDedupKey,
} from './buildDecisionFeedbackEvent.js'
import { isDecisionFeedbackDbLabEnabled } from './isDecisionFeedbackDbLabEnabled.js'
import { persistDecisionFeedbackEventsToDb } from './decisionFeedbackDbClient.js'

const STORAGE_PREFIX = 'fiscosim.decision_feedback.lab.v1.'
const MAX_ENTRIES = 400

function text(value) {
  return String(value ?? '').trim()
}

export function getDecisionFeedbackStorageKey(societaId) {
  return `${STORAGE_PREFIX}${text(societaId)}`
}

export function loadDecisionFeedbackEvents(societaId, storage = globalThis.localStorage) {
  if (!storage || !text(societaId)) return []
  try {
    const raw = storage.getItem(getDecisionFeedbackStorageKey(societaId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => buildDecisionFeedbackEvent({ ...row, committed: true, dryRun: false }))
      .filter(Boolean)
  } catch {
    return []
  }
}

export function saveDecisionFeedbackEvents(societaId, events, storage = globalThis.localStorage) {
  if (!storage || !text(societaId)) return false
  try {
    const normalized = []
    const seen = new Set()
    for (const row of Array.isArray(events) ? events : []) {
      const event = buildDecisionFeedbackEvent({ ...row, societaId, committed: true, dryRun: false })
      if (!event) continue
      const key = decisionFeedbackDedupKey(event)
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(event)
    }
    normalized.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    storage.setItem(
      getDecisionFeedbackStorageKey(societaId),
      JSON.stringify(normalized.slice(0, MAX_ENTRIES)),
    )
    return true
  } catch {
    return false
  }
}

/**
 * Append events after successful commit / confirmed bank decision.
 * Dedup on (societaId, requestId|primaNotaId|movementId, field).
 * When DB LAB flag is on, also best-effort POST to scoped API (non-blocking).
 */
export function appendDecisionFeedbackEvents(societaId, events, storage = globalThis.localStorage) {
  const sid = text(societaId)
  if (!sid) return []
  const prev = loadDecisionFeedbackEvents(sid, storage)
  const seen = new Set(prev.map(decisionFeedbackDedupKey))
  const next = [...prev]
  const appended = []
  for (const raw of Array.isArray(events) ? events : []) {
    const event = buildDecisionFeedbackEvent({ ...raw, societaId: sid })
    if (!event) continue
    const key = decisionFeedbackDedupKey(event)
    if (seen.has(key)) continue
    seen.add(key)
    next.unshift(event)
    appended.push(event)
  }
  saveDecisionFeedbackEvents(sid, next, storage)
  if (appended.length && isDecisionFeedbackDbLabEnabled()) {
    void persistDecisionFeedbackEventsToDb({ societaId: sid, events: appended }).catch(() => null)
  }
  return loadDecisionFeedbackEvents(sid, storage)
}
