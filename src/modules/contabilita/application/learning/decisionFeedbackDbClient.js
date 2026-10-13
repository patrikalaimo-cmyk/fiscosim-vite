/**
 * Client helpers for LAB DecisionFeedback DB API (best-effort dual-write).
 */

import { isDecisionFeedbackDbLabEnabled } from './isDecisionFeedbackDbLabEnabled.js'
import { buildDecisionFeedbackEvent, decisionFeedbackDedupKey } from './buildDecisionFeedbackEvent.js'

function text(value) {
  return String(value ?? '').trim()
}

function apiBase() {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return String(window.location.origin).replace(/\/$/, '')
    }
  } catch { /* ignore */ }
  return 'http://127.0.0.1:5173'
}

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  try {
    const { sb } = await import('../../../../lib/supabase.js')
    const { data } = await sb.auth.getSession()
    const token = data?.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  } catch { /* ignore */ }
  return headers
}

export async function fetchDecisionFeedbackEventsFromDb({
  societaId = '',
  sourceModule = '',
  limit = 100,
  enabledOverride,
} = {}) {
  if (!isDecisionFeedbackDbLabEnabled(enabledOverride) || !text(societaId)) return []
  const params = new URLSearchParams({
    societa_id: text(societaId),
    limit: String(Math.min(Math.max(Number(limit) || 100, 1), 200)),
  })
  if (text(sourceModule)) params.set('source_module', text(sourceModule))
  try {
    const res = await fetch(`${apiBase()}/api/studio/decision-feedback?${params}`, {
      method: 'GET',
      headers: await authHeaders(),
      credentials: 'same-origin',
    })
    if (!res.ok) return []
    const body = await res.json()
    const rows = Array.isArray(body?.rows) ? body.rows : []
    return rows
      .map((row) => buildDecisionFeedbackEvent({ ...row, committed: true, dryRun: false, storageKind: 'lab_db' }))
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function persistDecisionFeedbackEventsToDb({
  societaId = '',
  events = [],
  enabledOverride,
} = {}) {
  if (!isDecisionFeedbackDbLabEnabled(enabledOverride) || !text(societaId)) {
    return { ok: false, skipped: true }
  }
  const payloadEvents = (Array.isArray(events) ? events : [])
    .map((row) => buildDecisionFeedbackEvent({ ...row, societaId, committed: true, dryRun: false }))
    .filter(Boolean)
  if (!payloadEvents.length) return { ok: false, skipped: true }
  try {
    const res = await fetch(`${apiBase()}/api/studio/decision-feedback`, {
      method: 'POST',
      headers: await authHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({ societa_id: text(societaId), events: payloadEvents }),
    })
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body }
  } catch (error) {
    return { ok: false, error: String(error?.message || error) }
  }
}

export function mergeDecisionFeedbackEventLists(localEvents = [], remoteEvents = []) {
  const seen = new Set()
  const out = []
  for (const row of [...(remoteEvents || []), ...(localEvents || [])]) {
    const event = buildDecisionFeedbackEvent({ ...row, committed: true, dryRun: false })
    if (!event) continue
    const key = decisionFeedbackDedupKey(event)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return out
}
