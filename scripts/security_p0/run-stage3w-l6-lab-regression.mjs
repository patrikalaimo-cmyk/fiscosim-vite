/**
 * Stage3W SG-P4-02: L6 regressione LAB ripetibile (core pack).
 * Runs catalogued Stage3W scripts sequentially; aggregates PASS/FAIL report.
 * LAB-only. Never prints tokens/passwords. No LIVE. No destructive cleanup.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildL6LabRegressionSuite,
  parseL6StepResult,
  assertL6LabRegressionSuite,
} from '../../src/modules/contabilita/application/l6/buildL6LabRegressionSuite.js'

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const reportDir = join(process.cwd(), 'REPORT')
mkdirSync(reportDir, { recursive: true })
const outPath = join(reportDir, `STAGE3W_L6_REGRESSIONE_P4_02_${stamp}.txt`)

const lines = []
function log(msg) {
  const row = String(msg)
  lines.push(row)
  console.log(row)
}

function runStep(step) {
  const scriptPath = join(process.cwd(), step.script)
  if (!existsSync(scriptPath)) {
    return {
      id: step.id,
      status: 'MISSING',
      exitCode: 127,
      detail: `SCRIPT_ABSENT:${step.script}`,
      ms: 0,
      output: '',
    }
  }
  const started = Date.now()
  const res = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env },
    timeout: step.maxMs,
    maxBuffer: 8 * 1024 * 1024,
  })
  const ms = Date.now() - started
  const output = `${res.stdout || ''}\n${res.stderr || ''}`
  if (res.error && res.error.code === 'ETIMEDOUT') {
    return {
      id: step.id,
      status: 'FAIL',
      exitCode: 124,
      detail: `${step.resultKey}=FAIL TIMEOUT_${step.maxMs}`,
      ms,
      output,
    }
  }
  const parsed = parseL6StepResult(output, step.resultKey)
  let status = parsed.status
  if (status === 'MISSING' && res.status === 0) {
    status = 'UNKNOWN'
  } else if (status === 'MISSING' && res.status !== 0) {
    status = 'FAIL'
  }
  if (status === 'PASS' && res.status !== 0) {
    status = 'FAIL'
  }
  return {
    id: step.id,
    status: status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : status,
    exitCode: res.status == null ? 1 : res.status,
    detail: parsed.detail || `${step.resultKey}=MISSING`,
    ms,
    output,
  }
}

function main() {
  log('P4_02_START L6 LAB regressione core pack')
  const suite = buildL6LabRegressionSuite()
  log(`PACK_ID=${suite.packId}`)
  log(`STEP_COUNT=${suite.steps.length}`)
  log(`STEP_IDS=${suite.stepIds.join(',')}`)

  const stepResults = []
  for (const step of suite.steps) {
    log(`STEP_START=${step.id} script=${step.script}`)
    const result = runStep(step)
    stepResults.push(result)
    log(`STEP_END=${step.id} status=${result.status} exit=${result.exitCode} ms=${result.ms}`)
    log(`STEP_DETAIL=${result.detail}`)
    if (step.required && result.status !== 'PASS') {
      log(`STEP_ABORT_REQUIRED_FAIL=${step.id}`)
      // Continue remaining optional only — still record required fail; keep going for diagnostics
    }
  }

  const verdict = assertL6LabRegressionSuite({ suite, stepResults })
  for (const row of verdict.rows) {
    log(`ROW=${row.id}|${row.status}|req=${row.required}|exit=${row.exitCode ?? ''}|ms=${row.ms ?? ''}`)
  }
  log(`FINGERPRINT=${verdict.fingerprint}`)
  log(`FAILED=${verdict.failed.join(',') || '-'}`)
  log(`MISSING=${verdict.missing.join(',') || '-'}`)

  if (!verdict.ok) {
    throw new Error(`L6_SUITE_FAIL failed=${verdict.failed.join(',') || '-'} missing=${verdict.missing.join(',') || '-'}`)
  }
  log('P4_02_RESULT=PASS')
}

try {
  main()
} catch (err) {
  console.error(err)
  lines.push(`P4_02_RESULT=FAIL ${err?.message || err}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('P4_02_RESULT=FAIL'))) process.exit(1)
}
