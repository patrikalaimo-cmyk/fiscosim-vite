/**
 * SG-P4-03: legacy isolation policy (pure).
 * DISUSO must never be imported; canonical fiscal paths must not write accounting_entries.
 * Any new `.from('accounting_entries')` / insertAccountingEntry outside allowlist FAILS.
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
 * Known remaining consumers of `accounting_entries` (legacy / AI / test_mode / qa).
 * Isolation = documented allowlist + anti-reintroduction tests, not mass delete.
 */
export const ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST = Object.freeze([
  'src/modules/contabilita/data/contabilitaRepo.js',
  'src/modules/contabilita/da_validare_split_view.jsx',
  'src/modules/contabilita/application/contabilitaRegistrationWorkflow.js',
  'src/modules/contabilita/application/historicalImportNesService.js',
  'src/modules/import_unificato/data/importRepo.js',
  'src/components/PipelineResultView.jsx',
  'services/aiAccountingService.js',
  'services/aiAccountingFeedbackService.js',
  'services/aiDocumentMemoryService.js',
  'services/accountingModuleService.js',
  'services/autoValidateAccountingEngine.js',
  'services/copilotAccountingService.js',
  'services/copilotAccountingTools.js',
  'services/ivaRegistriSyncService.js',
  'services/operatorCorrectionsMemoryService.js',
  'services/partitarioSyncService.js',
  'services/pipelineLedgerSyncService.js',
  'services/testScenarioEngine.js',
  'qa/run-sprint1-smoke.mjs',
])

/** Policy / evidence modules that mention AE in strings only — skip allowlist scan. */
export const ACCOUNTING_ENTRIES_SCAN_EXEMPT = Object.freeze([
  'src/modules/contabilita/application/legacy/legacyIsolationPolicy.js',
  'scripts/security_p0/run-stage3w-p4-03-legacy-isolation.mjs',
  'tests/legacyIsolationPolicy.test.js',
])

const DISUSO_IMPORT_RE = /(?:from|import)\s+['"][^'"]*DISUSO[^'"]*['"]|require\(\s*['"][^'"]*DISUSO[^'"]*['"]\s*\)/
const ACCOUNTING_ENTRIES_ACCESS_RE =
  /\.from\(\s*['"]accounting_entries['"]\s*\)|insertAccountingEntry\s*\(/

export function detectDisusoImport(sourceText) {
  const text = String(sourceText || '')
  const m = text.match(DISUSO_IMPORT_RE)
  return m ? { hit: true, detail: m[0] } : { hit: false, detail: null }
}

export function detectAccountingEntriesAccess(sourceText) {
  const text = String(sourceText || '')
  const m = text.match(ACCOUNTING_ENTRIES_ACCESS_RE)
  return m ? { hit: true, detail: m[0] } : { hit: false, detail: null }
}

function normPath(p) {
  return String(p || '').replace(/\\/g, '/')
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
  for (const f of files || []) {
    const norm = normPath(f.filePath)
    if (!CANONICAL_FISCAL_WRITE_PATHS.some((p) => norm === p || norm.endsWith(p))) continue
    const det = detectAccountingEntriesAccess(f.sourceText)
    if (det.hit) violations.push({ file: f.filePath, detail: det.detail })
  }
  return { ok: violations.length === 0, violations }
}

/**
 * Fail if any scanned file accesses AE outside the allowlist (anti-reintroduction).
 * @param {{ filePath: string, sourceText: string }[]} files
 */
export function assertAccountingEntriesOnlyOnAllowlist(files) {
  const allow = new Set(ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST.map(normPath))
  const exempt = new Set(ACCOUNTING_ENTRIES_SCAN_EXEMPT.map(normPath))
  const violations = []
  for (const f of files || []) {
    const norm = normPath(f.filePath)
    if (exempt.has(norm) || exempt.has(norm.replace(/^\.\//, ''))) continue
    // skip tests that intentionally mention AE as forbidden (freeze guards)
    if (norm.startsWith('tests/') && !norm.includes('legacyIsolationPolicy')) continue
    const det = detectAccountingEntriesAccess(f.sourceText)
    if (!det.hit) continue
    if (allow.has(norm)) continue
    violations.push({ file: f.filePath, detail: det.detail })
  }
  return { ok: violations.length === 0, violations }
}

export function buildLegacyIsolationFingerprint({ disusoOk, canonicalOk, allowlistOk, allowlistCount }) {
  return `P403ISO2|disuso=${disusoOk ? 'PASS' : 'FAIL'};canonical=${canonicalOk ? 'PASS' : 'FAIL'};allowlistScan=${allowlistOk ? 'PASS' : 'FAIL'};allowlist=${Number(allowlistCount) || 0}`
}
