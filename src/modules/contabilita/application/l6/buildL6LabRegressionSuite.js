/**
 * L6 LAB regression suite catalog + result parsing (pure).
 * Used by Stage3W SG-P4-02 — no I/O, no LIVE.
 */

/** Canonical core pack: preflight + L5 + representative P2/P3 (no browser). */
export const L6_CORE_PACK_ID = 'l6_lab_core_v2'

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   script: string,
 *   resultKey: string,
 *   required: boolean,
 *   maxMs: number,
 * }} L6Step
 */

/** @type {L6Step[]} */
export const L6_CORE_STEPS = Object.freeze([
  {
    id: 'P0_00',
    title: 'Stage3V loopback ports verify',
    script: 'scripts/security_p0/verify-sg-p0-00-loopback.mjs',
    resultKey: 'P0_00_RESULT',
    required: true,
    maxMs: 60_000,
  },
  {
    id: 'P4_03',
    title: 'DISUSO + accounting_entries isolation',
    script: 'scripts/security_p0/run-stage3w-p4-03-legacy-isolation.mjs',
    resultKey: 'P4_03_RESULT',
    required: true,
    maxMs: 120_000,
  },
  {
    id: 'P2_06',
    title: 'Ritenute F24 control',
    script: 'scripts/security_p0/run-stage3w-ritenute-f24-control.mjs',
    resultKey: 'P2_06_RESULT',
    required: true,
    maxMs: 120_000,
  },
  {
    id: 'P2_07',
    title: 'Liquidazione definitiva block',
    script: 'scripts/security_p0/run-stage3w-p2-07-liquidazione-definitiva-block.mjs',
    resultKey: 'P2_07_RESULT',
    required: true,
    maxMs: 180_000,
  },
  {
    id: 'P3_01',
    title: 'Bank fiscal commit LAB',
    script: 'scripts/security_p0/run-stage3w-bank-commit-lab.mjs',
    resultKey: 'P3_01_RESULT',
    required: true,
    maxMs: 120_000,
  },
  {
    id: 'P3_03',
    title: 'Stampe partitari/mastrini/bilancio',
    script: 'scripts/security_p0/run-stage3w-stampe-partitari-mastrini-bilancio.mjs',
    resultKey: 'P3_03_RESULT',
    required: true,
    maxMs: 120_000,
  },
  {
    id: 'P3_07',
    title: 'Aging insoluti',
    script: 'scripts/security_p0/run-stage3w-aging-insoluti.mjs',
    resultKey: 'P3_07_RESULT',
    required: true,
    maxMs: 120_000,
  },
  {
    id: 'P4_01',
    title: 'L5 multi-periodo sintetico',
    script: 'scripts/security_p0/run-stage3w-l5-multi-periodo.mjs',
    resultKey: 'P4_01_RESULT',
    required: true,
    maxMs: 180_000,
  },
])

export function buildL6LabRegressionSuite({ packId = L6_CORE_PACK_ID } = {}) {
  if (packId !== L6_CORE_PACK_ID) {
    throw new Error(`UNKNOWN_L6_PACK:${packId}`)
  }
  return {
    kind: 'l6_lab_regressione',
    packId: L6_CORE_PACK_ID,
    version: 1,
    steps: L6_CORE_STEPS.map((s) => ({ ...s })),
    stepIds: L6_CORE_STEPS.map((s) => s.id),
    requiredCount: L6_CORE_STEPS.filter((s) => s.required).length,
  }
}

/**
 * Extract last RESULT line for a key from combined stdout/stderr text.
 * Accepts `KEY=PASS` or `KEY=FAIL …`.
 */
export function parseL6StepResult(output, resultKey) {
  const key = String(resultKey || '').trim()
  if (!key) return { status: 'MISSING', detail: 'NO_RESULT_KEY' }
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  let hit = null
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) hit = line
  }
  if (!hit) return { status: 'MISSING', detail: 'RESULT_LINE_ABSENT' }
  const value = hit.slice(key.length + 1)
  if (value === 'PASS' || value.startsWith('PASS ')) {
    return { status: 'PASS', detail: hit }
  }
  if (value.startsWith('FAIL')) {
    return { status: 'FAIL', detail: hit }
  }
  return { status: 'UNKNOWN', detail: hit }
}

/**
 * Aggregate suite outcome from per-step results.
 * @param {{ suite: ReturnType<typeof buildL6LabRegressionSuite>, stepResults: Array<{ id: string, status: string, exitCode?: number, detail?: string, ms?: number }> }} args
 */
export function assertL6LabRegressionSuite({ suite, stepResults }) {
  const byId = new Map((stepResults || []).map((r) => [r.id, r]))
  const rows = []
  const missing = []
  const failed = []

  for (const step of suite.steps) {
    const r = byId.get(step.id)
    if (!r) {
      missing.push(step.id)
      rows.push({ id: step.id, status: 'MISSING', required: step.required })
      continue
    }
    rows.push({
      id: step.id,
      status: r.status,
      required: step.required,
      exitCode: r.exitCode,
      ms: r.ms,
      detail: r.detail,
    })
    if (step.required && r.status !== 'PASS') failed.push(step.id)
  }

  const pass =
    missing.length === 0 &&
    failed.length === 0 &&
    rows.filter((r) => r.required).every((r) => r.status === 'PASS')

  return {
    ok: pass,
    packId: suite.packId,
    rows,
    missing,
    failed,
    fingerprint: buildL6SuiteFingerprint(rows),
  }
}

/** Stable fingerprint of required step outcomes. */
export function buildL6SuiteFingerprint(rows) {
  const parts = (rows || [])
    .filter((r) => r.required !== false)
    .map((r) => `${r.id}:${r.status}`)
  return `L6CORE2|${parts.join(';')}`
}
