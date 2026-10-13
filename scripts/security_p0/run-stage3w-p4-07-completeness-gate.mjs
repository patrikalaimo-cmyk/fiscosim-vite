/**
 * SG-P4-07: criterio “completo nel perimetro” — inventory PASS evidence vs roadmap IDs.
 * Pure filesystem check + report. No LIVE.
 */
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const reportDir = join(process.cwd(), 'REPORT')
mkdirSync(reportDir, { recursive: true })
const outPath = join(reportDir, `STAGE3W_P4_07_COMPLETENESS_${stamp}.txt`)
const lines = []
const log = (m) => { lines.push(String(m)); console.log(m) }

/** Mandatory Studio Grade IDs with expected evidence filename prefixes */
const MANDATORY = [
  { id: 'SG-P0-00', prefix: 'STAGE3W_SG_P0_00_LOOPBACK_', result: 'P0_00_RESULT=PASS' },
  { id: 'SG-P4-01', prefix: 'STAGE3W_L5_MULTI_PERIODO_P4_01_', result: 'P4_01_RESULT=PASS' },
  { id: 'SG-P4-02', prefix: 'STAGE3W_L6_REGRESSIONE_P4_02_', result: 'P4_02_RESULT=PASS' },
  { id: 'SG-P4-03', prefix: 'STAGE3W_P4_03_LEGACY_ISOLATION_', result: 'P4_03_RESULT=PASS' },
  { id: 'SG-P3-01', prefix: 'STAGE3W_BANK_COMMIT_LAB_', result: 'P3_01_RESULT=PASS' },
  { id: 'SG-P3-02', prefix: 'STAGE3W_IMPORT_CRONOLOGIA_HASH_', result: 'P3_02_RESULT=PASS' },
  { id: 'SG-P3-03', prefix: 'STAGE3W_STAMPE_P3_03_', result: 'P3_03_RESULT=PASS' },
  { id: 'SG-P3-07', prefix: 'STAGE3W_AGING_INSOLUTI_P3_07_', result: 'P3_07_RESULT=PASS' },
  { id: 'SG-P2-07', prefix: 'STAGE3W_P2_07_LIQUIDAZIONE_DEFINITIVA_', result: 'P2_07_RESULT=PASS' },
]

try {
  log('P4_07_START completeness gate (evidence inventory)')
  const files = existsSync(reportDir) ? readdirSync(reportDir) : []
  let missing = 0
  for (const item of MANDATORY) {
    const candidates = files.filter((f) => f.startsWith(item.prefix) && f.endsWith('.txt')).sort()
    const latest = candidates.at(-1) || null
    let pass = false
    if (latest) {
      const body = readFileSync(join(reportDir, latest), 'utf8')
      pass = body.includes(item.result)
    }
    log(`ITEM=${item.id} evidence=${latest || '-'} pass=${pass}`)
    if (!pass) missing += 1
  }
  log(`MISSING_OR_FAIL=${missing}`)
  // Studio Grade “completo nel perimetro” for P0-00 + P3 core + P4-01..03
  if (missing > 0) throw new Error('COMPLETENESS_GAP')
  log('NOTE=Browser manual debt (FISCOSIM_MANUAL_TEST_DEBT) remains outside automated completeness')
  log('P4_07_RESULT=PASS')
} catch (err) {
  console.error(err)
  lines.push(`P4_07_RESULT=FAIL ${err?.message || err}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('P4_07_RESULT=FAIL'))) process.exit(1)
}
