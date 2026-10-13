import { buildBankCronologiaEntry } from './buildBankCronologiaEntry.js'

const STORAGE_PREFIX = 'fiscosim.bank_cronologia.v1.'
const MAX_ENTRIES = 200

function text(value) {
  return String(value ?? '').trim()
}

export function getBankCronologiaStorageKey(societaId) {
  return `${STORAGE_PREFIX}${text(societaId)}`
}

function sameBankKey(a, b) {
  if (a.requestId && b.requestId && a.requestId === b.requestId) return true
  if (a.primaNotaId && b.primaNotaId && a.primaNotaId === b.primaNotaId) return true
  return false
}

export function loadBankCronologiaEntries(societaId, storage = globalThis.localStorage) {
  if (!storage || !text(societaId)) return []
  try {
    const raw = storage.getItem(getBankCronologiaStorageKey(societaId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => buildBankCronologiaEntry(row))
      .filter((row) => row.interrogabile)
  } catch {
    return []
  }
}

export function saveBankCronologiaEntries(societaId, entries, storage = globalThis.localStorage) {
  if (!storage || !text(societaId)) return false
  try {
    const normalized = (Array.isArray(entries) ? entries : [])
      .map((row) => buildBankCronologiaEntry({ ...row, societaId }))
      .filter((row) => row.interrogabile)
      .slice(0, MAX_ENTRIES)
    storage.setItem(getBankCronologiaStorageKey(societaId), JSON.stringify(normalized))
    return true
  } catch {
    return false
  }
}

export function mergeBankCronologiaEntries(serverEntries = [], localEntries = [], { societaId = '' } = {}) {
  const merged = []
  const push = (raw) => {
    const row = buildBankCronologiaEntry({ ...raw, societaId: societaId || raw.societaId })
    if (!row.interrogabile) return
    if (merged.some((existing) => sameBankKey(existing, row))) return
    merged.push(row)
  }
  for (const row of Array.isArray(serverEntries) ? serverEntries : []) push(row)
  for (const row of Array.isArray(localEntries) ? localEntries : []) push(row)
  merged.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return merged.slice(0, MAX_ENTRIES)
}

export function appendBankCronologiaEntry(societaId, entry, storage = globalThis.localStorage) {
  const next = buildBankCronologiaEntry({ ...entry, societaId })
  if (!next.interrogabile) return loadBankCronologiaEntries(societaId, storage)
  const prev = loadBankCronologiaEntries(societaId, storage)
  const merged = mergeBankCronologiaEntries([next], prev, { societaId })
  saveBankCronologiaEntries(societaId, merged, storage)
  return merged
}
