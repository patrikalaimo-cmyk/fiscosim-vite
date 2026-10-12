/**
 * Apply authorized LIVE P0-04 tranche 1: REVOKE anon DML core + drop anon_access_test.
 * Requires .env.live.remediation.local DATABASE_URL. Never prints secrets.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ENV_PATH = join(process.cwd(), '.env.live.remediation.local')
const SQL_PATH = join(process.cwd(), 'sql/security_p0/63_p0_04_anon_containment_LIVE_mlydfspmrkaedsocubku.sql')
const EXPECTED_REF = 'mlydfspmrkaedsocubku'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `LIVE_P0_04_CONTAINMENT_APPLY_${stamp}.txt`)

const lines = []
function log(msg) {
  const row = String(msg)
  lines.push(row)
  console.log(row)
}

function loadEnv(path) {
  const map = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return map
}

function redact(s) {
  return String(s || '')
    .replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://***@')
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, 'JWT_REDACTED')
}

function psqlFile(databaseUrl, sqlHostPath) {
  const dir = mkdtempSync(join(tmpdir(), 'fiscosim-live-p004-'))
  const localSql = join(dir, 'containment.sql')
  copyFileSync(sqlHostPath, localSql)
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-v', `${dir}:/sql:ro`,
      'postgres:17',
      'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1',
      '-f', '/sql/containment.sql',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
}

function psql(databaseUrl, sql) {
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      'postgres:17',
      'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1',
      '-At',
      '-c', sql,
    ],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  ).trim()
}

function main() {
  log('LIVE_P0_04_APPLY_START')
  log(`PROJECT_REF=${EXPECTED_REF}`)
  log('SCOPE=REVOKE_ANON_DML_CORE+DROP_anon_access_test')
  if (!existsSync(ENV_PATH)) throw new Error('ENV_MISSING')
  if (!existsSync(SQL_PATH)) throw new Error('SQL_MISSING')
  const env = loadEnv(ENV_PATH)
  const db = String(env.DATABASE_URL || env.SUPABASE_DB_URL || '')
  const url = String(env.SUPABASE_URL || '')
  if (!url.includes(EXPECTED_REF)) throw new Error('SUPABASE_URL_REF_MISMATCH')
  if (!db) throw new Error('DATABASE_URL_MISSING')

  const before = psql(db, `
SELECT count(*)::text
FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
  AND table_name IN (
    'prima_nota','prima_nota_righe','registri_iva','partitario',
    'ritenute_dacconto','stampe_definitive','audit_contabile',
    'societa','piano_conti','documenti_import','documenti_contabilita',
    'liquidazioni_iva','utenti_studio'
  )
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
`)
  log(`ANON_DML_CORE_BEFORE=${before}`)

  const policyBefore = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public' AND tablename='avvisi_ade' AND policyname='anon_access_test';
`)
  log(`ANON_ACCESS_TEST_POLICY_BEFORE=${policyBefore}`)

  log('APPLY_SQL=START')
  const applyOut = psqlFile(db, SQL_PATH)
  log(`APPLY_SQL_EXIT=0`)
  if (applyOut && applyOut.trim()) {
    // Keep short; never echo connection noise with secrets
    const safe = redact(applyOut).split('\n').filter((l) => l && !/password|postgresql:\/\//i.test(l)).slice(0, 40)
    for (const l of safe) log(`APPLY_OUT ${l}`)
  }
  log('APPLY_SQL=DONE')

  const after = psql(db, `
SELECT count(*)::text
FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
  AND table_name IN (
    'prima_nota','prima_nota_righe','registri_iva','partitario',
    'ritenute_dacconto','stampe_definitive','audit_contabile',
    'societa','piano_conti','documenti_import','documenti_contabilita',
    'liquidazioni_iva','utenti_studio'
  )
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
`)
  log(`ANON_DML_CORE_AFTER=${after}`)
  if (after !== '0') throw new Error(`VERIFY_FAIL_ANON_DML_STILL_${after}`)

  const policyAfter = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public' AND tablename='avvisi_ade' AND policyname='anon_access_test';
`)
  log(`ANON_ACCESS_TEST_POLICY_AFTER=${policyAfter}`)
  if (policyAfter !== '0') throw new Error('VERIFY_FAIL_POLICY_STILL_PRESENT')

  // Authenticated still has DML on at least prima_nota (sanity: we did not revoke authenticated)
  const authPn = psql(db, `
SELECT count(*)::text
FROM information_schema.role_table_grants
WHERE grantee='authenticated' AND table_schema='public' AND table_name='prima_nota'
  AND privilege_type IN ('INSERT','UPDATE','DELETE');
`)
  log(`AUTHENTICATED_PRIMA_NOTA_DML_GRANTS=${authPn}`)

  log('LIVE_P0_04_APPLY_RESULT=PASS')
}

try {
  main()
} catch (err) {
  console.error(redact(err?.stderr || err?.message || err))
  lines.push(`LIVE_P0_04_APPLY_RESULT=FAIL ${redact(err?.message || err)}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('LIVE_P0_04_APPLY_RESULT=FAIL'))) process.exit(1)
}
