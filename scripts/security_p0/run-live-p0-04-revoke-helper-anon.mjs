import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ENV_PATH = join(process.cwd(), '.env.live.remediation.local')
const EXPECTED_REF = 'mlydfspmrkaedsocubku'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `LIVE_P0_04_REVOKE_HELPER_ANON_${stamp}.txt`)
const sqlPath = join(process.cwd(), 'sql/security_p0/70_p0_04_revoke_helper_anon_LIVE_mlydfspmrkaedsocubku.sql')

const lines = []
function log(msg) {
  lines.push(String(msg))
  console.log(msg)
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
  return String(s || '').replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://***@')
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
  const dir = mkdtempSync(join(tmpdir(), 'fiscosim-live-rev-'))
  copyFileSync(sqlHostPath, join(dir, 'x.sql'))
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-e', `DATABASE_URL=${databaseUrl}`,
      '-v', `${dir}:/sql:ro`,
      'postgres:17', 'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1', '-f', '/sql/x.sql',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
}

try {
  log('REVOKE_HELPER_ANON_START')
  if (!existsSync(ENV_PATH) || !existsSync(sqlPath)) throw new Error('ENV_OR_SQL_MISSING')
  const env = loadEnv(ENV_PATH)
  const db = String(env.DATABASE_URL || '')
  if (!String(env.SUPABASE_URL || '').includes(EXPECTED_REF)) throw new Error('REF_MISMATCH')
  const before = psql(db, `
SELECT count(*)::text FROM pg_proc f
JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public' AND f.prosecdef
  AND has_function_privilege('anon', f.oid, 'EXECUTE');
`)
  log(`DEFINER_ANON_BEFORE=${before}`)
  for (const row of String(psqlFile(db, sqlPath)).split(/\r?\n/).filter(Boolean).slice(0, 30)) log(`PSQL ${row}`)
  const after = psql(db, `
SELECT count(*)::text FROM pg_proc f
JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public' AND f.prosecdef
  AND has_function_privilege('anon', f.oid, 'EXECUTE');
`)
  log(`DEFINER_ANON_AFTER=${after}`)
  if (Number(after) !== 0) throw new Error('ANON_EXECUTE_REMAIN')
  // quick auth smoke
  const authId = psql(db, `SELECT id::text FROM auth.users WHERE lower(email)='patrik.alaimo@gmail.com' LIMIT 1`)
  const smoke = psql(db, `
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${authId}', true);
SELECT set_config('request.jwt.claims', '{"sub":"${authId}","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'US='||count(*)::text FROM public.utenti_studio;
SELECT 'PN='||count(*)::text FROM public.prima_nota_righe;
ROLLBACK;
`)
  log(`SMOKE=${/US=[1-9]/.test(smoke) && /PN=/.test(smoke) ? 'PASS' : 'FAIL'}`)
  if (!/US=[1-9]/.test(smoke)) throw new Error('SMOKE_FAIL')
  log('REVOKE_HELPER_ANON_RESULT=PASS')
} catch (err) {
  console.error(redact(err?.message || err))
  lines.push(`REVOKE_HELPER_ANON_RESULT=FAIL ${redact(err?.message || err)}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.includes('RESULT=FAIL'))) process.exit(1)
}
