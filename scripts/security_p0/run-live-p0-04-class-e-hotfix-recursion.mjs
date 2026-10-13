/**
 * LIVE hotfix after class E: break utenti_studio RLS recursion in current_utente_ruolo
 * (and harden is_owner_or_admin / user_has_societa_access if they are SECURITY INVOKER).
 * Authorized under operator "approvo continua" remediation of class E apply.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ENV_PATH = join(process.cwd(), '.env.live.remediation.local')
const EXPECTED_REF = 'mlydfspmrkaedsocubku'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `LIVE_P0_04_CLASS_E_HOTFIX_${stamp}.txt`)
const sqlOutPath = join(process.cwd(), 'sql/security_p0/68_p0_04_class_e_hotfix_LIVE_mlydfspmrkaedsocubku.sql')

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
}

function psql(databaseUrl, sql) {
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-e', `DATABASE_URL=${databaseUrl}`,
      'postgres:17', 'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql,
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  ).trim()
}

function psqlFile(databaseUrl, sqlHostPath) {
  const dir = mkdtempSync(join(tmpdir(), 'fiscosim-live-ehf-'))
  copyFileSync(sqlHostPath, join(dir, 'h.sql'))
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-e', `DATABASE_URL=${databaseUrl}`,
      '-v', `${dir}:/sql:ro`,
      'postgres:17', 'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1', '-f', '/sql/h.sql',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
}

function main() {
  log('LIVE_P0_04_CLASS_E_HOTFIX_START')
  log(`PROJECT_REF=${EXPECTED_REF}`)
  if (!existsSync(ENV_PATH)) throw new Error('ENV_MISSING')
  const env = loadEnv(ENV_PATH)
  const db = String(env.DATABASE_URL || '')
  const url = String(env.SUPABASE_URL || '')
  if (!url.includes(EXPECTED_REF)) throw new Error('SUPABASE_URL_REF_MISMATCH')
  if (!db) throw new Error('DATABASE_URL_MISSING')
  if (!existsSync(sqlOutPath)) throw new Error('SQL_MISSING ' + sqlOutPath)
  log(`SQL_PATH=${sqlOutPath}`)
  const applyOut = psqlFile(db, sqlOutPath)
  for (const row of String(applyOut).split(/\r?\n/).filter(Boolean).slice(0, 40)) log(`PSQL ${row}`)

  const authId = psql(db, `SELECT id::text FROM auth.users WHERE lower(email)='patrik.alaimo@gmail.com' LIMIT 1`)
  if (!authId) throw new Error('AUTH_MISSING')

  const smoke = psql(db, `
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${authId}', true);
SELECT set_config('request.jwt.claims', '{"sub":"${authId}","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'US='||count(*)::text FROM public.utenti_studio;
SELECT 'CAUSALI='||count(*)::text FROM public.causali_contabili;
SELECT 'PN_RIGHE='||count(*)::text FROM public.prima_nota_righe;
SELECT 'DOC='||count(*)::text FROM public.documenti_contabilita;
ROLLBACK;
`)
  log('RLS_SMOKE_BEGIN')
  for (const row of smoke.split('\n').filter(Boolean)) log(`RLS ${row}`)
  log('RLS_SMOKE_END')
  if (!/US=[1-9]/.test(smoke)) throw new Error('US_FAIL')
  if (!/CAUSALI=/.test(smoke)) throw new Error('CAUSALI_FAIL')
  if (!/PN_RIGHE=/.test(smoke)) throw new Error('PN_FAIL')
  log('RLS_SMOKE=PASS')

  const broad = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC=${broad}`)
  log('LIVE_P0_04_CLASS_E_HOTFIX_RESULT=PASS')
}

try {
  main()
} catch (err) {
  console.error(redact(err?.message || err))
  lines.push(`LIVE_P0_04_CLASS_E_HOTFIX_RESULT=FAIL ${redact(err?.message || err)}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('LIVE_P0_04_CLASS_E_HOTFIX_RESULT=FAIL'))) process.exit(1)
}
