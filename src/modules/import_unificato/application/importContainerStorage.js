import {
  LAST_SOCIETA_STORAGE_KEY,
  AI_MODE_STORAGE_KEY,
  AI_PREPROCESS_MODE_STORAGE_KEY,
} from '../../../shared/constants'

export function getStoredAiMode() {
  try {
    return localStorage.getItem(AI_MODE_STORAGE_KEY) === 'online' ? 'online' : 'local'
  } catch {
    return 'local'
  }
}

export function getStoredAiPreprocessMode() {
  try {
    return localStorage.getItem(AI_PREPROCESS_MODE_STORAGE_KEY) === 'off' ? 'off' : 'on'
  } catch {
    return 'on'
  }
}

export function persistAiMode(aiMode) {
  try {
    localStorage.setItem(AI_MODE_STORAGE_KEY, aiMode)
  } catch {
    /* ignore */
  }
}

export function persistAiPreprocessMode(aiPreprocessMode) {
  try {
    localStorage.setItem(AI_PREPROCESS_MODE_STORAGE_KEY, aiPreprocessMode)
  } catch {
    /* ignore */
  }
}

export function getPreferredSocietaId(list) {
  if (!Array.isArray(list) || !list.length) return null
  try {
    const saved = localStorage.getItem(LAST_SOCIETA_STORAGE_KEY)
    if (saved && list.some((s) => s.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return list[0]?.id || null
}

export function persistSelectedSocieta(value) {
  try {
    if (value) localStorage.setItem(LAST_SOCIETA_STORAGE_KEY, value)
    else localStorage.removeItem(LAST_SOCIETA_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
