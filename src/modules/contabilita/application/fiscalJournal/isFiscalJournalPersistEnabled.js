/**
 * Stage3W fiscal persist routing (cutover-aware).
 * - LAB flags remain supported.
 * - Cutover: FISCOSIM_FISCAL_JOURNAL_PERSIST_ENABLED / VITE_FISCOSIM_FISCAL_JOURNAL_PERSIST.
 * - Isolated studio stacks prefer Stage3W by default after operator cutover approval.
 */
import { isFiscalJournalPersistLabEnabled } from './isFiscalJournalPersistLabEnabled.js'

function envTrue(name) {
  if (typeof process === 'undefined' || !process.env) return false
  return String(process.env[name] || '').trim() === 'true'
}

function viteTrue(name) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return String(import.meta.env[name] || '') === 'true'
    }
  } catch { /* ignore */ }
  return false
}

function isIsolatedStudioStack() {
  try {
    // Lazy import avoided: check the same env contract as lib/isolatedStudioLab.js
    if (envTrue('FISCOSIM_ISOLATED_LAB_API')) return true
    const url = String(process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL || '')
    if (/127\.0\.0\.1:55321|localhost:55321/.test(url) && envTrue('FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED')) {
      return true
    }
  } catch { /* ignore */ }
  try {
    if (viteTrue('VITE_FISCOSIM_ISOLATED_LAB') || viteTrue('VITE_FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB')) {
      return true
    }
  } catch { /* ignore */ }
  return false
}

/**
 * @param {boolean} [override]
 * @returns {boolean}
 */
export function isFiscalJournalPersistEnabled(override) {
  if (override === true) return true
  if (override === false) return false
  if (isFiscalJournalPersistLabEnabled()) return true
  if (viteTrue('VITE_FISCOSIM_FISCAL_JOURNAL_PERSIST')) return true
  if (envTrue('FISCOSIM_FISCAL_JOURNAL_PERSIST_ENABLED')) return true
  // Cutover on isolated LAB stacks (operator-approved 20261012): prefer Stage3W.
  if (isIsolatedStudioStack()) return true
  return false
}

/**
 * When Stage3W persist is enabled, legacy createPrimaNotaCompleta is used only if
 * FISCOSIM_FISCAL_JOURNAL_LEGACY_FALLBACK=true (default OFF = fail closed on Stage3W errors).
 */
export function isFiscalJournalLegacyFallbackEnabled() {
  return envTrue('FISCOSIM_FISCAL_JOURNAL_LEGACY_FALLBACK')
    || viteTrue('VITE_FISCOSIM_FISCAL_JOURNAL_LEGACY_FALLBACK')
}
