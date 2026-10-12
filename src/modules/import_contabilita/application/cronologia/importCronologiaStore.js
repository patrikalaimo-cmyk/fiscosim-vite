import { buildImportCronologiaEntry } from './buildImportCronologiaEntry.js'

const STORAGE_PREFIX = 'fiscosim.import_cronologia.v1.'
const MAX_ENTRIES = 200

function text(value) {
  return String(value ?? '').trim()
}

export function getImportCronologiaStorageKey(societaId) {
  return `${STORAGE_PREFIX}${text(societaId)}`
}

export function loadImportCronologiaEntries(societaId, storage = globalThis.localStorage) {
  if (!storage || !text(societaId)) return []
  try {
    const raw = storage.getItem(getImportCronologiaStorageKey(societaId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => buildImportCronologiaEntry(row))
      .filter((row) => row.interrogabile)
  } catch {
    return []
  }
}

export function saveImportCronologiaEntries(societaId, entries, storage = globalThis.localStorage) {
  if (!storage || !text(societaId)) return false
  try {
    const normalized = (Array.isArray(entries) ? entries : [])
      .map((row) => buildImportCronologiaEntry({ ...row, societaId }))
      .filter((row) => row.interrogabile)
      .slice(0, MAX_ENTRIES)
    storage.setItem(getImportCronologiaStorageKey(societaId), JSON.stringify(normalized))
    return true
  } catch {
    return false
  }
}

function sameCronologiaKey(a, b) {
  if (a.requestId && b.requestId && a.requestId === b.requestId) return true
  if (a.primaNotaId && b.primaNotaId && a.primaNotaId === b.primaNotaId) {
    if (!a.sourceHash || !b.sourceHash || a.sourceHash === b.sourceHash) return true
  }
  return false
}

/**
 * Merge server claim history with localStorage (server wins on conflict).
 */
export function mergeImportCronologiaEntries(serverEntries = [], localEntries = [], { societaId = '' } = {}) {
  const merged = []
  const push = (raw) => {
    const row = buildImportCronologiaEntry({ ...raw, societaId: societaId || raw.societaId })
    if (!row.interrogabile) return
    if (merged.some((existing) => sameCronologiaKey(existing, row))) return
    merged.push(row)
  }
  for (const row of Array.isArray(serverEntries) ? serverEntries : []) push(row)
  for (const row of Array.isArray(localEntries) ? localEntries : []) push(row)
  merged.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return merged.slice(0, MAX_ENTRIES)
}

/**
 * Prepend a successful import commit to local cronologia (UI interrogabile).
 */
export function appendImportCronologiaEntry(societaId, entry, storage = globalThis.localStorage) {
  const next = buildImportCronologiaEntry({ ...entry, societaId })
  if (!next.interrogabile) return loadImportCronologiaEntries(societaId, storage)
  const prev = loadImportCronologiaEntries(societaId, storage)
  const merged = mergeImportCronologiaEntries([next], prev, { societaId })
  saveImportCronologiaEntries(societaId, merged, storage)
  return merged
}
