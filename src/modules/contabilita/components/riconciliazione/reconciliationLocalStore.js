export const DEFAULT_RECONCILIATION_FILTERS = {
  search: '',
  status: 'all',
  direction: 'all',
  confidence: 'all',
  kind: 'all',
  ivaCassa: false,
  withholding: false,
  f24: false,
  giroconti: false,
  onlyReady: false,
  onlyBlocked: false,
  onlyWithoutMatch: false,
}

export const DEFAULT_RECONCILIATION_SUMMARY_COLLAPSED = {
  'Import & Stato banca': true,
  'Match / Proposte': true,
  'Azioni contabili': true,
}

const ACTIVE_KEY_STORAGE = 'reconciliationDraft:lastActiveKey'
const STORAGE_VERSION = 1

function canUseLocalStorage() {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  } catch {
    return false
  }
}

function safeParse(rawValue) {
  try {
    return JSON.parse(rawValue)
  } catch {
    return null
  }
}

function isFileLike(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof File !== 'undefined' && value instanceof File) return true
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  return Boolean(value?.name && value?.size != null && value?.type != null && value?.lastModified != null)
}

function cloneSerializable(value) {
  return JSON.parse(
    JSON.stringify(value, (key, currentValue) => {
      if (key === 'sourceFile') return undefined
      if (isFileLike(currentValue)) return undefined
      return currentValue
    })
  )
}

export function loadReconciliationDraft(storageKey) {
  if (!canUseLocalStorage() || !storageKey) {
    return { draft: null, error: null, activeKey: null }
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw) {
      const parsed = safeParse(raw)
      if (parsed && typeof parsed === 'object' && parsed.version === STORAGE_VERSION) {
        return { draft: parsed, error: null, activeKey: storageKey }
      }
    }

    const activeKey = window.localStorage.getItem(ACTIVE_KEY_STORAGE) || ''
    if (activeKey && activeKey === storageKey) {
      const activeRaw = window.localStorage.getItem(activeKey)
      const parsed = safeParse(activeRaw)
      if (parsed && typeof parsed === 'object' && parsed.version === STORAGE_VERSION) {
        return { draft: parsed, error: null, activeKey }
      }
    }

    return { draft: null, error: null, activeKey: activeKey || null }
  } catch (error) {
    return { draft: null, error: error?.message || 'local_storage_read_failed', activeKey: null }
  }
}

export function saveReconciliationDraft(storageKey, draft) {
  if (!canUseLocalStorage() || !storageKey) {
    return { ok: false, error: 'local_storage_unavailable' }
  }

  try {
    const serializableDraft = cloneSerializable({
      ...draft,
      version: STORAGE_VERSION,
      updatedAt: new Date().toISOString(),
    })
    window.localStorage.setItem(storageKey, JSON.stringify(serializableDraft))
    window.localStorage.setItem(ACTIVE_KEY_STORAGE, storageKey)
    return { ok: true, updatedAt: serializableDraft.updatedAt }
  } catch (error) {
    return { ok: false, error: error?.message || 'local_storage_write_failed' }
  }
}

export function removeReconciliationDraft(storageKey) {
  if (!canUseLocalStorage() || !storageKey) {
    return { ok: false, error: 'local_storage_unavailable' }
  }

  try {
    window.localStorage.removeItem(storageKey)
    const activeKey = window.localStorage.getItem(ACTIVE_KEY_STORAGE)
    if (activeKey === storageKey) {
      window.localStorage.removeItem(ACTIVE_KEY_STORAGE)
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error?.message || 'local_storage_remove_failed' }
  }
}

export function buildReconciliationDraftSnapshot({
  mode,
  bankStatement,
  selectedId,
  selectedIds,
  filters,
  summaryCollapsed,
  advancedFiltersOpen,
  detailCollapsed,
  documentPreviewPage,
  documentPreviewZoom,
  reviewStateById,
  documentModalOpen,
  actionNote,
  reconciliationContext,
  selectedMovementIds = [],
}) {
  const sourceFile = bankStatement?.sourceFile || null
  const sourceFileMeta = sourceFile
    ? {
        name: sourceFile.name || bankStatement?.sourceFileName || '',
        type: sourceFile.type || bankStatement?.sourceFileType || '',
        size: sourceFile.size || bankStatement?.sourceFileSize || 0,
        lastModified: sourceFile.lastModified || 0,
      }
    : {
        name: bankStatement?.sourceFileName || '',
        type: bankStatement?.sourceFileType || '',
        size: bankStatement?.sourceFileSize || 0,
        lastModified: 0,
      }

  return {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    mode,
    context: reconciliationContext || null,
    bankStatement,
    selectedId: selectedId ?? null,
    selectedMovementId: selectedId ?? null,
    selectedIds: Array.isArray(selectedIds) ? selectedIds : [],
    selectedMovementIds: Array.isArray(selectedMovementIds) ? selectedMovementIds : [],
    filters,
    summaryCollapsed,
    advancedFiltersOpen: Boolean(advancedFiltersOpen),
    detailCollapsed: Boolean(detailCollapsed),
    documentPreviewPage: Number(documentPreviewPage || 1) || 1,
    documentPreviewZoom,
    reviewStateById,
    documentModalOpen: Boolean(documentModalOpen),
    actionNote: actionNote || '',
    sourceFileMeta,
  }
}

export function reviveReconciliationDraft(storedDraft) {
  if (!storedDraft || typeof storedDraft !== 'object') return null
  const bankStatement = storedDraft.bankStatement
    ? { ...storedDraft.bankStatement, sourceFile: null }
    : null

  return {
    mode: storedDraft.mode || 'demo',
    context: storedDraft.context || null,
    bankStatement,
    selectedId: storedDraft.selectedId ?? storedDraft.selectedMovementId ?? null,
    selectedIds: Array.isArray(storedDraft.selectedIds) ? storedDraft.selectedIds : [],
    selectedMovementIds: Array.isArray(storedDraft.selectedMovementIds) ? storedDraft.selectedMovementIds : [],
    filters: storedDraft.filters || { ...DEFAULT_RECONCILIATION_FILTERS },
    summaryCollapsed: storedDraft.summaryCollapsed || { ...DEFAULT_RECONCILIATION_SUMMARY_COLLAPSED },
    advancedFiltersOpen: Boolean(storedDraft.advancedFiltersOpen),
    detailCollapsed: Boolean(storedDraft.detailCollapsed),
    documentPreviewPage: Number(storedDraft.documentPreviewPage || 1) || 1,
    documentPreviewZoom: storedDraft.documentPreviewZoom || 'fit',
    reviewStateById: storedDraft.reviewStateById || {},
    documentModalOpen: false,
    actionNote: storedDraft.actionNote || '',
    sourceFileMeta: storedDraft.sourceFileMeta || null,
    savedAt: storedDraft.savedAt || storedDraft.updatedAt || '',
  }
}

export function getActiveReconciliationDraftKey() {
  if (!canUseLocalStorage()) return ''
  try {
    return window.localStorage.getItem(ACTIVE_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}
