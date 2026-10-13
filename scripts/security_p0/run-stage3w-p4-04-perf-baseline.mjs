/**
 * SG-P4-04: performance baseline LAB (lightweight).
 * Reuses L6 step timings + optional stampe model build on PN sample.
 * No LIVE. No destructive cleanup. Does not claim 500+ doc production SLA.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const reportDir = join(process.cwd(), 'REPORT')
mkdirSync(reportDir, { recursive: true })
const outPath = join(reportDir, `STAGE3W_P4_04_PERF_BASELINE_${stamp}.txt`)
const lines = []
const log = (m) => { lines.push(String(m)); console.log(m) }

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

try {
  log('P4_04_START perf baseline LAB')
  const pnCount = Number(psql(`SELECT count(*)::text FROM public.prima_nota WHERE societa_id='${SOCIETA_A}'::uuid`))
  log(`PN_COUNT_SOCIETA_A=${pnCount}`)

  const t0 = Date.now()
  const { buildPartitariStampaModel } = await import('../../src/modules/contabilita/application/stampe/buildPartitariStampaModel.js')
  // Minimal empty model timing (pure) — documents builder cost floor
  const empty = buildPartitariStampaModel([], {
    societaId: SOCIETA_A,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  })
  const buildMs = Date.now() - t0
  log(`STAMPE_EMPTY_BUILD_MS=${buildMs}`)
  log(`STAMPE_EMPTY_ROWS=${Array.isArray(empty?.rows) ? empty.rows.length : 0}`)
  log(`STAMPE_EMPTY_OPERATIVO=${Boolean(empty?.isOperativo)}`)

  // Parse last L6 evidence for step timings if present
  const l6 = spawnSync(process.execPath, ['scripts/security_p0/run-stage3w-l6-lab-regression.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 900_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  const out = `${l6.stdout || ''}\n${l6.stderr || ''}`
  log(`L6_EXIT=${l6.status}`)
  const stepLines = out.split(/\r?\n/).filter((l) => l.startsWith('STEP_END='))
  for (const l of stepLines) log(`L6_${l}`)
  const totalMs = stepLines.reduce((acc, l) => {
    const m = l.match(/ms=(\d+)/)
    return acc + (m ? Number(m[1]) : 0)
  }, 0)
  log(`L6_CORE_TOTAL_MS=${totalMs}`)
  log(`L6_CORE_PASS=${/P4_02_RESULT=PASS/.test(out)}`)

  // Soft gates (LAB laptop baseline — not production SLA)
  if (l6.status !== 0) throw new Error('L6_CORE_FAILED')
  if (totalMs > 600_000) throw new Error('L6_CORE_TOO_SLOW')
  if (buildMs > 5_000) throw new Error('STAMPE_EMPTY_BUILD_TOO_SLOW')

  log('NOTE=500+ doc / paginated stampe production SLA remains manual debt (FISCOSIM_MANUAL_TEST_DEBT)')
  log('P4_04_RESULT=PASS')
} catch (err) {
  console.error(err)
  lines.push(`P4_04_RESULT=FAIL ${err?.message || err}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('P4_04_RESULT=FAIL'))) process.exit(1)
}
