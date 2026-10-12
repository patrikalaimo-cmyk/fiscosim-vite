/**
 * SG-P0-02 close: run Stage3V signed-JWT general-journal persistent POST (LAB).
 * Requires provisioned STAGE3V-* fixtures + clean git worktree.
 * Temporarily parks untracked files outside the repo so Stage3V dirty-tree gate passes.
 * Never prints secrets. No LIVE.
 */
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const root = process.cwd()
const reportDir = join(root, 'REPORT')
mkdirSync(reportDir, { recursive: true })
const outPath = join(reportDir, `STAGE3W_SG_P0_02_GENERAL_JOURNAL_${stamp}.txt`)
const lines = []
const log = (m) => { lines.push(String(m)); console.log(m) }

function sh(bin, args, opts = {}) {
  return execFileSync(bin, args, { encoding: 'utf8', cwd: root, ...opts }).trim()
}

function loadEnv(path) {
  const map = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return map
}

function parkUntracked() {
  const porcelain = sh('git', ['status', '--porcelain'])
  if (!porcelain) return null
  const parkRoot = join(tmpdir(), `fiscosim-stage3v-park-${stamp}`)
  mkdirSync(parkRoot, { recursive: true })
  const moved = []
  for (const row of porcelain.split(/\r?\n/).filter(Boolean)) {
    const status = row.slice(0, 2)
    const file = row.slice(3).replace(/^"|"$/g, '').replace(/\\/g, '/')
    // Only park untracked / untracked dirs; refuse to park modified tracked files
    if (!status.includes('?')) {
      throw new Error(`DIRTY_TRACKED_FILE_REFUSE_PARK:${file}`)
    }
    const src = join(root, file)
    if (!existsSync(src)) continue
    const dest = join(parkRoot, file)
    mkdirSync(dirname(dest), { recursive: true })
    renameSync(src, dest)
    moved.push(file)
  }
  return { parkRoot, moved }
}

function restorePark(park) {
  if (!park) return
  for (const file of park.moved) {
    const dest = join(root, file)
    const src = join(park.parkRoot, file)
    if (!existsSync(src)) continue
    mkdirSync(dirname(dest), { recursive: true })
    renameSync(src, dest)
  }
}

let park = null
try {
  log('P0_02_GENERAL_START Stage3V JWT general-journal persistent write')
  const head = sh('git', ['rev-parse', 'HEAD'])
  log(`COMMIT=${head}`)

  // Ensure fixtures + env
  const prov = spawnSync(process.execPath, ['scripts/security_p0/provision-stage3v-lab-fixtures.mjs'], {
    cwd: root, encoding: 'utf8', env: process.env,
  })
  log(`PROVISION_EXIT=${prov.status}`)
  if (prov.status !== 0) {
    log((prov.stdout || '') + (prov.stderr || ''))
    throw new Error('PROVISION_FAIL')
  }
  log((prov.stdout || '').trim().split(/\r?\n/).filter((l) => !/PASSWORD|KEY=/.test(l)).join(' | '))

  const envPath = join(root, '.env.stage3v.lab.local')
  if (!existsSync(envPath)) throw new Error('STAGE3V_ENV_MISSING')
  const envMap = loadEnv(envPath)

  park = parkUntracked()
  if (park) log(`PARKED_UNTRACKED=${park.moved.length} root=${park.parkRoot}`)
  const dirty = sh('git', ['status', '--porcelain'])
  if (dirty) throw new Error('WORKTREE_STILL_DIRTY')

  const env = { ...process.env, ...envMap }
  const run = spawnSync(
    process.execPath,
    ['scripts/security_p0/stage3v-signed-jwt-general-journal-e2e.mjs', '--expected-commit', head],
    { cwd: root, encoding: 'utf8', env, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
  )
  const out = `${run.stdout || ''}\n${run.stderr || ''}`
  log(`HARNESS_EXIT=${run.status}`)
  for (const line of out.split(/\r?\n/).filter(Boolean)) {
    if (/password|token|KEY=|SERVICE_ROLE/i.test(line) && !/PASS|FAIL|STAGE3V_/.test(line)) continue
    log(`HARNESS=${line.slice(0, 400)}`)
  }
  const pass = run.status === 0 && out.includes('STAGE3V_REAL_SIGNED_JWT_PERSISTENT_POSTING_PASS')
  log(`HARNESS_PASS=${pass}`)
  if (!pass) throw new Error('STAGE3V_GENERAL_JOURNAL_HARNESS_FAIL')
  log('P0_02_GENERAL_RESULT=PASS')
  log('P0_02_RESULT=PASS')
} catch (err) {
  console.error(err)
  lines.push(`P0_02_GENERAL_RESULT=FAIL ${err?.message || err}`)
  lines.push(`P0_02_RESULT=FAIL ${err?.message || err}`)
} finally {
  try { restorePark(park) } catch (e) { lines.push(`PARK_RESTORE_ERR=${e?.message || e}`) }
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('P0_02_RESULT=FAIL'))) process.exit(1)
}
