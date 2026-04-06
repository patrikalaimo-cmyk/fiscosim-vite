/**
 * Pipeline logger — tracciamento step per FiscoSim (import, builder, UI).
 * Non deve mai lanciare: tutto è wrappato in try/catch.
 */

import { addLog } from './pipelineLogStore.js'

function newUUID() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fallthrough
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Crea un contesto pipeline da riusare per correlare più trace (stesso contextId).
 * Opzionale: documentId (es. id documento_import / documenti_contabilita) aggiornabile in seguito.
 * @param {string|null|undefined} [documentId]
 * @returns {{ contextId: string, documentId?: string }}
 */
export function newPipelineContext(documentId) {
  const ctx = { contextId: newUUID() }
  if (documentId != null && documentId !== '') ctx.documentId = documentId
  return ctx
}

/**
 * @param {Record<string, unknown>|null|undefined} pipelineContext
 * @returns {{ contextId: string, documentId?: string }}
 */
function resolvePipelineContext(pipelineContext) {
  const pc = pipelineContext && typeof pipelineContext === 'object' ? pipelineContext : {}
  const contextId =
    typeof pc.contextId === 'string' && pc.contextId.trim() ? pc.contextId.trim() : newUUID()
  const documentId =
    pc.documentId != null && pc.documentId !== '' ? pc.documentId : undefined
  return { contextId, documentId }
}

function buildMeta(meta, documentId) {
  const base = meta != null && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : {}
  if (documentId != null && documentId !== '' && base.documentId === undefined) {
    base.documentId = documentId
  }
  return base
}

/**
 * Deep clone via JSON (perde Date, undefined, Map, function).
 * Fallback: ritorna lo stesso riferimento se fallisce.
 */
export function safeClone(value) {
  try {
    if (value === null || value === undefined) return value
    if (typeof value !== 'object') return value
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

/**
 * Snapshot testo per log pipeline (head + tail, senza esplodere la console).
 * @param {unknown} text
 * @param {{ headMax?: number, tailMax?: number }} [options]
 */
export function buildAdvancedTextSnapshot(text, options = {}) {
  const headMax = options.headMax ?? 2800
  const tailMax = options.tailMax ?? 900
  const s = text == null ? '' : String(text)
  const totalChars = s.length
  const head = s.slice(0, Math.min(headMax, totalChars))
  const needTail = totalChars > headMax
  const tail = needTail ? s.slice(Math.max(0, totalChars - tailMax)) : ''
  return {
    totalChars,
    headPreview: head,
    tailPreview: tail || undefined,
    headLen: head.length,
    tailLen: tail.length,
    truncated: needTail,
  }
}

/** Estrae indice da messaggi tipo JSON.parse ("position 518"). */
export function extractJsonErrorPosition(message) {
  const m = String(message || '').match(/position\s+(\d+)/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Estratto centrato su un indice (es. errore JSON).
 * @param {string} text
 * @param {number|null|undefined} index
 * @param {number} [radius]
 */
export function snippetAroundIndex(text, index, radius = 140) {
  if (index == null || !Number.isFinite(index)) return null
  const s = String(text)
  const i = Math.max(0, Math.min(s.length, Math.floor(index)))
  const a = Math.max(0, i - radius)
  const b = Math.min(s.length, i + radius)
  return {
    index: i,
    snippet: s.slice(a, b),
    caretColumn: i - a,
    range: [a, b],
  }
}

/** Meta per INSERT_PAYLOAD: presenza / valore / typeof di causale_iva_id (prima riga se array). */
export function insertCausaleIvaMeta(payload) {
  try {
    if (Array.isArray(payload)) {
      const row0 = payload[0]
      const rowMeta =
        row0 && typeof row0 === 'object' && !Array.isArray(row0)
          ? singleRowCausaleIvaMeta(row0)
          : { causale_iva_id_in_payload: false, causale_iva_id_typeof: 'n/a' }
      return { ...rowMeta, row_count: payload.length }
    }
    if (!payload || typeof payload !== 'object') {
      return { causale_iva_id_in_payload: false, causale_iva_id_typeof: 'n/a' }
    }
    return singleRowCausaleIvaMeta(payload)
  } catch {
    return { causale_iva_id_in_payload: false, causale_iva_id_typeof: 'n/a' }
  }
}

function singleRowCausaleIvaMeta(p) {
  const has = Object.prototype.hasOwnProperty.call(p, 'causale_iva_id')
  return {
    causale_iva_id_in_payload: has,
    causale_iva_id: has ? p.causale_iva_id ?? null : undefined,
    causale_iva_id_typeof: has ? typeof p.causale_iva_id : 'n/a'
  }
}

function isoNow() {
  try {
    return new Date().toISOString()
  } catch {
    return ''
  }
}

/**
 * @param {string} step
 * @param {unknown} data
 * @param {Record<string, unknown>} [meta]
 * @param {Record<string, unknown>} [pipelineContext] — { contextId?, documentId? } (oggetto mutabile condiviso)
 */
export function traceStep(step, data, meta, pipelineContext) {
  try {
    const timestamp = isoNow()
    const { contextId, documentId } = resolvePipelineContext(pipelineContext)
    const metaOut = buildMeta(meta, documentId)
    addLog({ contextId, step, timestamp, data, meta: metaOut })

    const label = `[FiscoSim pipeline] ${step}`
    if (typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(label)
    } else {
      console.log(label)
    }
    try {
      console.log('contextId', contextId)
      if (documentId != null) console.log('documentId', documentId)
      console.log('step', step)
      console.log('timestamp', timestamp)
      console.log('data', data)
      if (Object.keys(metaOut).length > 0) {
        console.log('meta', metaOut)
      }
    } finally {
      if (typeof console.groupEnd === 'function') {
        console.groupEnd()
      }
    }
  } catch {
    // silenzioso: non rompere l'app
  }
}

const IVA_TRACE_SOURCES = new Set(['builder', 'state', 'UI', 'DB'])

/** Ultimo snapshot IVA per contesto (contextId o `__global__`). */
const lastIvaSnapshotByKey = new Map()

/**
 * Svuota lo stato dei warning IVA (es. dopo "Svuota" log o test).
 * @param {string} [contextKey] — se omesso, resetta tutti i contesti
 */
export function clearIvaPipelineWatch(contextKey) {
  try {
    if (contextKey != null && String(contextKey).trim()) {
      lastIvaSnapshotByKey.delete(String(contextKey).trim())
    } else {
      lastIvaSnapshotByKey.clear()
    }
  } catch {
    // ignore
  }
}

function ivaContextKey(pipelineContext) {
  try {
    const pc = pipelineContext && typeof pipelineContext === 'object' ? pipelineContext : null
    const id = pc && typeof pc.contextId === 'string' && pc.contextId.trim() ? pc.contextId.trim() : ''
    return id || '__global__'
  } catch {
    return '__global__'
  }
}

function hasMeaningfulIvaId(v) {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  return true
}

function buildIvaSnapshot(step, source, field, value) {
  return {
    step,
    source,
    field,
    causale_iva_id: value === undefined ? null : value,
    ['typeof']: typeof value,
  }
}

function warnIvaPipeline(kind, payload) {
  try {
    console.warn(`[FiscoSim pipeline] ⚠ ${kind}`, payload)
  } catch {
    // ignore
  }
}

/**
 * Log mirato su causale_iva_id (solo step, source, valore, typeof).
 * Confronta con lo step precedente nello stesso contesto: emette IVA_LOST, IVA_TYPE_CHANGED, IVA_FIELD_CHANGE.
 * @param {string} step
 * @param {'builder'|'state'|'UI'|'DB'} source
 * @param {unknown} value — causale_iva_id
 * @param {Record<string, unknown>} [pipelineContext]
 * @param {{ field?: string }} [options] — nome campo logico se diverso da `causale_iva_id`
 */
export function traceIva(step, source, value, pipelineContext, options) {
  try {
    const field =
      options != null && typeof options === 'object' && typeof options.field === 'string' && options.field.trim()
        ? options.field.trim()
        : 'causale_iva_id'
    const src = IVA_TRACE_SOURCES.has(source) ? source : String(source ?? '')
    const key = ivaContextKey(pipelineContext)
    const last = lastIvaSnapshotByKey.get(key) || null
    const currentSnap = buildIvaSnapshot(step, src, field, value)

    if (last) {
      if (last.field !== field) {
        const data = { previous: { ...last }, current: { ...currentSnap } }
        traceStep('IVA_FIELD_CHANGE', data, { autoIvaAlert: true, kind: 'field' }, pipelineContext)
        warnIvaPipeline('IVA_FIELD_CHANGE', data)
      }
      if (hasMeaningfulIvaId(last.causale_iva_id) && !hasMeaningfulIvaId(value)) {
        const data = { previous: { ...last }, current: { ...currentSnap } }
        traceStep('IVA_LOST', data, { autoIvaAlert: true, kind: 'lost' }, pipelineContext)
        warnIvaPipeline('IVA_LOST', data)
      } else if (
        hasMeaningfulIvaId(last.causale_iva_id) &&
        hasMeaningfulIvaId(value) &&
        last['typeof'] !== typeof value
      ) {
        const data = { previous: { ...last }, current: { ...currentSnap } }
        traceStep('IVA_TYPE_CHANGED', data, { autoIvaAlert: true, kind: 'type' }, pipelineContext)
        warnIvaPipeline('IVA_TYPE_CHANGED', data)
      }
    }

    lastIvaSnapshotByKey.set(key, { ...currentSnap })

    const data = {
      step,
      source: src,
      causale_iva_id: value === undefined ? null : value,
      ['typeof']: typeof value,
    }
    traceStep('IVA_TRACE', data, { traceIva: true, source: src }, pipelineContext)
  } catch {
    // silenzioso
  }
}

/**
 * Diff superficiale tra due oggetti plain (chiavi aggiunte/rimosse/cambiate).
 * Per valori non-oggetto confronta con JSON.stringify.
 */
function shallowDiff(before, after) {
  const changes = { added: [], removed: [], changed: [] }
  try {
    if (before === after) return changes
    if (before == null && after == null) return changes

    const b = before != null && typeof before === 'object' && !Array.isArray(before) ? before : null
    const a = after != null && typeof after === 'object' && !Array.isArray(after) ? after : null

    if (!b || !a) {
      try {
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          changes.changed.push({ path: '(root)', before, after })
        }
      } catch {
        changes.changed.push({ path: '(root)', before, after })
      }
      return changes
    }

    const keysB = new Set(Object.keys(b))
    const keysA = new Set(Object.keys(a))
    for (const k of keysA) {
      if (!keysB.has(k)) changes.added.push(k)
    }
    for (const k of keysB) {
      if (!keysA.has(k)) changes.removed.push(k)
    }
    for (const k of keysB) {
      if (!keysA.has(k)) continue
      try {
        if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
          changes.changed.push({ path: k, before: b[k], after: a[k] })
        }
      } catch {
        if (b[k] !== a[k]) changes.changed.push({ path: k, before: b[k], after: a[k] })
      }
    }
  } catch {
    // ignore
  }
  return changes
}

/**
 * @param {string} step
 * @param {unknown} before
 * @param {unknown} after
 * @param {Record<string, unknown>} [pipelineContext]
 */
export function traceDiff(step, before, after, pipelineContext) {
  try {
    const timestamp = isoNow()
    const diff = shallowDiff(before, after)
    const { contextId, documentId } = resolvePipelineContext(pipelineContext)
    const metaOut = buildMeta({}, documentId)
    addLog({
      contextId,
      step,
      timestamp,
      data: { before, after, diff },
      meta: metaOut
    })

    const label = `[FiscoSim pipeline] DIFF · ${step}`
    if (typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(label)
    } else {
      console.log(label)
    }
    try {
      console.log('contextId', contextId)
      if (documentId != null) console.log('documentId', documentId)
      console.log('step', step)
      console.log('timestamp', timestamp)
      console.log('before', before)
      console.log('after', after)
      const hasDiff =
        diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0
      console.log('diff', hasDiff ? diff : '(nessuna differenza a livello chiavi / root)')
    } finally {
      if (typeof console.groupEnd === 'function') {
        console.groupEnd()
      }
    }
  } catch {
    // silenzioso
  }
}
