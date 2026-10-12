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

/**
 * Prepend a successful import commit to local cronologia (UI interrogabile).
 */
export function appendImportCronologiaEntry(societaId, entry, storage = globalThis.localStorage) {
  const next = buildImportCronologiaEntry({ ...entry, societaId })
  if (!next.interrogabile) return loadImportCronologiaEntries(societaId, storage)
  const prev = loadImportCronologiaEntries(societaId, storage)
  const deduped = prev.filter((row) => !(
    (next.requestId && row.requestId === next.requestId)
    || (next.primaNotaId && row.primaNotaId === next.primaNotaId && row.sourceHash === next.sourceHash)
  ))
  const merged = [next, ...deduped].slice(0, MAX_ENTRIES)
  saveImportCronologiaEntries(societaId, merged, storage)
  return merged
}
