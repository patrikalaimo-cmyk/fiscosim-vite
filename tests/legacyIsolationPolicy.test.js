import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  DISUSO_ROOT,
  CANONICAL_FISCAL_WRITE_PATHS,
  ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST,
  detectDisusoImport,
  detectAccountingEntriesAccess,
  assertNoDisusoImports,
  assertCanonicalPathsFreeOfAccountingEntries,
  buildLegacyIsolationFingerprint,
} from '../src/modules/contabilita/application/legacy/legacyIsolationPolicy.js'

const ROOT = process.cwd()

function walkJsFiles(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'coverage') continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walkJsFiles(full, out)
    else if (/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

test('detectDisusoImport catches import/require of DISUSO', () => {
  assert.equal(detectDisusoImport("import x from '../DISUSO/import_nuovo'").hit, true)
  assert.equal(detectDisusoImport("const x = require('./DISUSO/foo.js')").hit, true)
  assert.equal(detectDisusoImport("import x from '../import_contabilita'").hit, false)
})

test('detectAccountingEntriesAccess catches .from accounting_entries', () => {
  assert.equal(detectAccountingEntriesAccess("sb.from('accounting_entries').insert([])").hit, true)
  assert.equal(detectAccountingEntriesAccess("sb.from('prima_nota').insert([])").hit, false)
})

test('assert helpers aggregate violations', () => {
  const bad = assertNoDisusoImports([
    { filePath: 'a.js', sourceText: "import z from 'DISUSO/x'" },
  ])
  assert.equal(bad.ok, false)
  assert.equal(bad.violations.length, 1)

  const goodCanon = assertCanonicalPathsFreeOfAccountingEntries([
    {
      filePath: CANONICAL_FISCAL_WRITE_PATHS[0],
      sourceText: "export function ok(){ return sb.from('prima_nota') }",
    },
  ])
  assert.equal(goodCanon.ok, true)

  const badCanon = assertCanonicalPathsFreeOfAccountingEntries([
    {
      filePath: CANONICAL_FISCAL_WRITE_PATHS[0],
      sourceText: "sb.from('accounting_entries').insert([])",
    },
  ])
  assert.equal(badCanon.ok, false)
})

test('repo: no live imports of DISUSO/ (scan src+services+lib+scripts)', () => {
  const dirs = ['src', 'services', 'lib', 'scripts', 'api'].map((d) => join(ROOT, d))
  const files = dirs.flatMap((d) => walkJsFiles(d))
  const payloads = files.map((full) => ({
    filePath: relative(ROOT, full).replace(/\\/g, '/'),
    sourceText: readFileSync(full, 'utf8'),
  }))
  const res = assertNoDisusoImports(payloads)
  assert.equal(res.ok, true, JSON.stringify(res.violations))
  assert.ok(ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST.length >= 5)
  assert.equal(DISUSO_ROOT, 'DISUSO')
})

test('repo: canonical fiscal write paths free of accounting_entries', () => {
  const payloads = CANONICAL_FISCAL_WRITE_PATHS.map((p) => {
    const full = join(ROOT, p)
    return {
      filePath: p,
      sourceText: readFileSync(full, 'utf8'),
    }
  })
  const res = assertCanonicalPathsFreeOfAccountingEntries(payloads)
  assert.equal(res.ok, true, JSON.stringify(res.violations))
  const fp = buildLegacyIsolationFingerprint({
    disusoOk: true,
    canonicalOk: res.ok,
    allowlistCount: ACCOUNTING_ENTRIES_LEGACY_ALLOWLIST.length,
  })
  assert.match(fp, /^P403ISO1\|disuso=PASS;canonical=PASS;allowlist=\d+$/)
})
