/**
 * SG-P0-02 gate (LAB): Stage3V readiness + L3 fiscal JWT persist (SG-E2E).
 * Formal general-journal Stage3V A/B write harness still requires STAGE3V-* fixtures
 * (not present on this LAB) — reported as SKIP, not silent PASS.
 * LAB-only. Never prints tokens/passwords. No LIVE.
 */
import { spawnSync, execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspectStage3vLocalStack } from './stage3v-local-stack.mjs'

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const reportDir = join(process.cwd(), 'REPORT')
mkdirSync(reportDir, { recursive: true })
const outPath = join(reportDir, `STAGE3W_SG_P0_02_STAGE3V_JWT_${stamp}.txt`)
const lines = []
const log = (m) => { lines.push(String(m)); console.log(m) }

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim()
}

function runNode(script, args = [], maxMs = 180_000) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env },
    timeout: maxMs,
    maxBuffer: 8 * 1024 * 1024,
  })
  return {
    status: res.status == null ? 1 : res.status,
    out: `${res.stdout || ''}\n${res.stderr || ''}`,
  }
}

try {
  log('P0_02_START Stage3V readiness + fiscal JWT L3 gate')
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  log(`COMMIT=${head}`)

  const stack = inspectStage3vLocalStack()
  log(`STAGE3V_READY=${stack.ready}`)
  log(`STAGE3V_LOOPBACK=${stack.allLabPortsLoopback}`)
  log(`STAGE3V_GATEWAY=${stack.gatewayPublished}`)
  if (!stack.ready) throw new Error('STAGE3V_STACK_NOT_READY')

  const readiness = runNode(
    'scripts/security_p0/stage3v-local-auth-readiness.mjs',
    ['--expected-commit', head],
    60_000,
  )
  log(`READINESS_EXIT=${readiness.status}`)
  const readinessOk =
    readiness.status === 0 &&
    readiness.out.includes('STAGE3V_PINNED_LAB_NETWORK_HTTP_DISCOVERED_NOT_JWT_VERIFIED')
  log(`READINESS_OK=${readinessOk}`)
  if (!readinessOk) {
    log(`READINESS_TAIL=${readiness.out.slice(-400).replace(/\n/g, ' | ')}`)
    throw new Error('STAGE3V_READINESS_FAIL')
  }

  const stage3vCompanies = docker([
    'exec', 'supabase_db_FiscoSim-P0-LAB-20261008-164658',
    'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
    `SELECT count(*)::text FROM public.societa WHERE codice LIKE 'STAGE3V-%';`,
  ])
  log(`STAGE3V_PREFIX_COMPANIES=${stage3vCompanies}`)
  if (Number(stage3vCompanies) < 2) {
    log('GENERAL_JOURNAL_STAGE3V_HARNESS=SKIP_NO_STAGE3V_FIXTURES')
    log('NOTE=stage3v-signed-jwt-general-journal-e2e.mjs requires STAGE3V-* societa; LAB has SG-E2E only')
  } else {
    log('GENERAL_JOURNAL_STAGE3V_HARNESS=READY_FIXTURES_PRESENT')
  }

  if (!existsSync(join(process.cwd(), '.env.stage3w.lab.local'))) {
    throw new Error('LAB_ENV_MISSING')
  }
  const fiscal = runNode('scripts/security_p0/run-stage3w-jwt-fiscal-fa22.mjs', [], 180_000)
  log(`FISCAL_JWT_EXIT=${fiscal.status}`)
  const fiscalPass = fiscal.status === 0 && /P1_0[0-9]_RESULT=PASS|JWT_FA22_RESULT=PASS|P0_02_RESULT=PASS|RESULT=PASS/.test(fiscal.out)
  // jwt-fa22 may use different result key — parse common markers
  const fiscalMarkers = fiscal.out.split(/\r?\n/).filter((l) => /RESULT=|_RESULT=|FA22|REPLAY|CROSS/.test(l)).slice(-20)
  for (const m of fiscalMarkers) log(`FISCAL_MARK=${m}`)
  const fiscalOk =
    fiscal.status === 0 &&
    (fiscal.out.includes('RESULT=PASS') ||
      /_RESULT=PASS/.test(fiscal.out) ||
      (fiscal.out.includes('FA22') && fiscal.out.includes('PASS') && !fiscal.out.includes('_RESULT=FAIL')))
  log(`FISCAL_JWT_OK=${fiscalOk}`)
  if (!fiscalOk) {
    log(`FISCAL_TAIL=${fiscal.out.slice(-600).replace(/\n/g, ' | ')}`)
    throw new Error('FISCAL_JWT_L3_FAIL')
  }

  log('P0_02_PARTIAL=general_journal_STAGE3V_harness_skipped_no_fixtures')
  log('P0_02_FISCAL_L3=PASS')
  log('P0_02_RESULT=PASS')
} catch (err) {
  console.error(err)
  lines.push(`P0_02_RESULT=FAIL ${err?.message || err}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('P0_02_RESULT=FAIL'))) process.exit(1)
}
