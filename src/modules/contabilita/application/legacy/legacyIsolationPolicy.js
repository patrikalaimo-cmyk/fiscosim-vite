/**
 * SG-P4-03: legacy isolation policy (pure).
 * DISUSO must never be imported; canonical fiscal paths must not write accounting_entries.
 */

/** Folders that are archived — no live import allowed. */
export const DISUSO_ROOT = 'DISUSO'

/**
 * Canonical write path modules (relative to repo root) that must not reference
 * `.from('accounting_entries')` / insert targets for fiscal commit.
 */
export const CANONICAL_FISCAL_WRITE_PATHS = Object.freeze([
  'src/modules/contabilita/application/persistPrimaNotaDraft.js',
  'src/modules/contabilita/application/fiscalJournal/mapPersistencePlanToFiscalJournalRequest.js',
  'src/modules/import_contabilita/domain/buildImportContabilitaCommitPayload.js',
  'src/modules/import_contabilita/application/importContabilitaWorkflow.js',
  'lib/fiscalJournalRequest.js',
  'services/primaNotaService.js',
])

/**
 * Known remaining consumers of `accounting_entries` (legacy / AI / test_mode).
 * Isolation = documented allowlist + anti-reintroduction tests, not mass delete.
 */
export const ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST = Object.freeze([
  'src/modules/contabilita/data/contabilitaRepo.js',
  'src/modules/contabilita/da_validare_split_view.jsx',
  'src/modules/contabilita/ContabileCopilotPanel.jsx',
  'src/modules/import_unificato/data/importRepo.js',
  'src/modules/import_unificato/components/ImportDocumentCard.jsx',
  'src/modules/test_mode/TestScenarioE2EPanel.jsx',
  'src/components/PipelineResultView.jsx',
  'services/aiDocumentMemoryService.js',
  'services/copilotAccountingService.js',
  'services/pipelineLedgerSyncService.js',
  'services/testScenarioEngine.js',
  'services/ivaRegistriSyncService.js',
  'services/autoValidateAccountingEngine.js',
  'services/operatorCorrectionsMemoryService.js',
])

const DISUSO_IMPORT_RE = /(?:from|import)\s+['"][^'"]*DISUSO[^'"]*['"]|require\(\s*['"][^'"]*DISUSO[^'"]*['"]\s*\)/
const ACCOUNTING_ENTRIES_WRITE_RE = /\.from\(\s*['"]accounting_entries['"]\s*\)\s*\.(insert|upsert|update|delete)\b|\.from\(\s*['"]accounting_entries['"]\s*\)/

export function detectDisusoImport(sourceText) {
  const text = String(sourceText || '')
  const m = text.match(DISUSO_IMPORT_RE)
  return m ? { hit: true, detail: m[0] } : { hit: false, detail: null }
}

export function detectAccountingEntriesAccess(sourceText) {
  const text = String(sourceText || '')
  const m = text.match(ACCOUNTING_ENTRIES_WRITE_RE)
  return m ? { hit: true, detail: m[0] } : { hit: false, detail: null }
}

/**
 * @param {{ filePath: string, sourceText: string }[]} files
 */
export function assertNoDisusoImports(files) {
  const violations = []
  for (const f of files || []) {
    const det = detectDisusoImport(f.sourceText)
    if (det.hit) violations.push({ file: f.filePath, detail: det.detail })
  }
  return { ok: violations.length === 0, violations }
}

/**
 * Canonical fiscal paths must not touch accounting_entries.
 * @param {{ filePath: string, sourceText: string }[]} files
 */
export function assertCanonicalPathsFreeOfAccountingEntries(files) {
  const violations = []
  const allowed = new Set(CANONICAL_FISCAL_WRITE_PATHS.map((p) => p.replace(/\\/g, '/')))
  for (const f of files || []) {
    const norm = String(f.filePath || '').replace(/\\/g, '/')
    if (!allowed.has(norm) && !CANONICAL_FISCAL_WRITE_PATHS.some((p) => norm.endsWith(p))) {
      continue
    }
    const det = detectAccountingEntriesAccess(f.sourceText)
    if (det.hit) violations.push({ file: f.filePath, detail: det.detail })
  }
  return { ok: violations.length === 0, violations }
}

export function buildLegacyIsolationFingerprint({ disusoOk, canonicalOk, allowlistCount }) {
  return `P403ISO1|disuso=${disusoOk ? 'PASS' : 'FAIL'};canonical=${canonicalOk ? 'PASS' : 'FAIL'};allowlist=${Number(allowlistCount) || 0}`
}
