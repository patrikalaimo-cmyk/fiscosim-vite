/**
 * SG-L6 / LE-B10 — mass confirm only high-confidence, non-ambiguous movements.
 */

import { isMovementSelectableForMassActions } from '../../components/riconciliazione/riconciliazioneMockSelectors.js'

export const MASS_CONFIRM_MIN_CONFIDENCE = 0.85

function text(value) {
  return String(value ?? '').trim()
}

export function normalizeMatchConfidence(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  // Mock UI stores 0–100; matcher uses 0–1.
  if (n > 1) return Math.min(1, Math.round(n) / 100)
  return n
}

/**
 * @returns {{ eligible: boolean, reason: string, confidence: number }}
 */
export function evaluateMassConfirmEligibility(movement = {}, {
  minConfidence = MASS_CONFIRM_MIN_CONFIDENCE,
  confidence = null,
  matchType = '',
} = {}) {
  if (!isMovementSelectableForMassActions(movement)) {
    return { eligible: false, reason: 'not_ready_or_blocked', confidence: 0 }
  }
  const resolvedMatchType = text(matchType || movement.matchType || movement.detail?.matchType)
  if (['ambiguous', 'counterparty_only', 'no_match'].includes(resolvedMatchType)) {
    return { eligible: false, reason: 'match_not_high_confidence', confidence: normalizeMatchConfidence(confidence ?? movement.confidence) }
  }
  const review = text(movement.reviewStatus || movement.reviewLabel).toLowerCase()
  if (review.includes('review') || review.includes('verific')) {
    return { eligible: false, reason: 'needs_review', confidence: normalizeMatchConfidence(confidence ?? movement.confidence) }
  }
  const conf = normalizeMatchConfidence(confidence ?? movement.confidence ?? movement.massConfirmConfidence)
  if (conf + 1e-9 < Number(minConfidence)) {
    return { eligible: false, reason: 'confidence_below_threshold', confidence: conf }
  }
  return { eligible: true, reason: 'ok', confidence: conf }
}

export function partitionMassConfirmCandidates(movements = [], options = {}) {
  const eligible = []
  const skipped = []
  for (const movement of Array.isArray(movements) ? movements : []) {
    const evaluation = typeof options.evaluate === 'function'
      ? options.evaluate(movement)
      : evaluateMassConfirmEligibility(movement, options)
    if (evaluation.eligible) eligible.push({ movement, evaluation })
    else skipped.push({ movement, evaluation })
  }
  return { eligible, skipped }
}
