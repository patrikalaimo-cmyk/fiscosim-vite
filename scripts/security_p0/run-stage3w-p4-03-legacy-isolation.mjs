/**
 * SG-P4-03: evidence for DISUSO + accounting_entries isolation (LAB/CI-safe).
 * Runs isolation unit tests; writes REPORT. No LIVE. No DB writes.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST,
  CANONICAL_FISCAL_WRITE_PATHS,
  assertNoDisusoImports,
  assertCanonicalPathsFreeOfAccountingEntries,
  buildLegacyIsolationFingerprint,
} from '../../src/modules/contabilita/application/legacy/legacyIsolationPolicy.js'

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const reportDir = join(process.cwd(), 'REPORT')
mkdirSync(reportDir, { recursive: true })
const outPath = join(reportDir, `STAGE3W_P4_03_LEGACY_ISOLATION_${stamp}.txt`)
const lines = []
const log = (m) => { lines.push(String(m)); console.log(m) }

function walkJsFiles(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walkJsFiles(full, out)
    else if (/\.(js|jsx|mjs|cjs)$/.test(name)) out.push(full)
  }
  return out
}

try {
  log('P4_03_START legacy DISUSO + accounting_entries isolation')
  const root = process.cwd()
  const dirs = ['src', 'services', 'lib', 'scripts', 'api'].map((d) => join(root, d))
  const files = dirs.flatMap((d) => walkJsFiles(d)).map((full) => ({
    filePath: relative(root, full).replace(/\\/g, '/'),
    sourceText: readFileSync(full, 'utf8'),
  }))
  const disuso = assertNoDisusoImports(files)
  log(`DISUSO_IMPORTS_OK=${disuso.ok}`)
  if (!disuso.ok) log(`DISUSO_VIOLATIONS=${JSON.stringify(disuso.violations)}`)

  const canonFiles = CANONICAL_FISCAL_WRITE_PATHS.map((p) => ({
    filePath: p,
    sourceText: readFileSync(join(root, p), 'utf8'),
  }))
  const canon = assertCanonicalPathsFreeOfAccountingEntries(canonFiles)
  log(`CANONICAL_FREE_OF_AE=${canon.ok}`)
  if (!canon.ok) log(`CANONICAL_VIOLATIONS=${JSON.stringify(canon.violations)}`)

  log(`ALLOWLIST_COUNT=${ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST.length}`)
  for (const p of ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST) {
    log(`ALLOWLIST=${p} exists=${existsSync(join(root, p))}`)
  }
  log(`DISUSO_DIR_EXISTS=${existsSync(join(root, 'DISUSO'))}`)

  const unit = spawnSync(process.execPath, ['--test', 'tests/legacyIsolationPolicy.test.js'], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  })
  log(`UNIT_EXIT=${unit.status}`)
  const unitOut = `${unit.stdout || ''}\n${unit.stderr || ''}`
  const unitPass = unit.status === 0 && !/\bfail\b/i.test(unitOut.match(/ℹ fail \d+/)?.[0] || '') && !/✖/.test(unitOut)
  log(`UNIT_PASS=${unitPass}`)
  if (!unitPass) log(`UNIT_TAIL=${unitOut.slice(-500).replace(/\n/g, ' | ')}`)

  const fp = buildLegacyIsolationFingerprint({
    disusoOk: disuso.ok,
    canonicalOk: canon.ok,
    allowlistCount: ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST.length,
  })
  log(`FINGERPRINT=${fp}`)

  if (!disuso.ok || !canon.ok || !unitPass) throw new Error('P4_03_ISOLATION_FAIL')
  log('P4_03_RESULT=PASS')
} catch (err) {
  console.error(err)
  lines.push(`P4_03_RESULT=FAIL ${err?.message || err}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('P4_03_RESULT=FAIL'))) process.exit(1)
}
