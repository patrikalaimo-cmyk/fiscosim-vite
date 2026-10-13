/**
 * LIVE P0-04 class G: residual 8 broad TRUE policies.
 * - Tables with societa_id: add membership policy then drop TRUE allow_all / Accesso autenticati
 * - coda_import_fatture: collapse duplicate TRUE + add scoped if societa_id present
 * Never prints secrets. RLS smoke as Patrik after apply.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ENV_PATH = join(process.cwd(), '.env.live.remediation.local')
const EXPECTED_REF = 'mlydfspmrkaedsocubku'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `LIVE_P0_04_CLASS_G_APPLY_${stamp}.txt`)
const sqlOutPath = join(process.cwd(), 'sql/security_p0/71_p0_04_class_g_LIVE_mlydfspmrkaedsocubku.sql')

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
  const dir = mkdtempSync(join(tmpdir(), 'fiscosim-live-g-'))
  copyFileSync(sqlHostPath, join(dir, 'g.sql'))
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-e', `DATABASE_URL=${databaseUrl}`,
      '-v', `${dir}:/sql:ro`,
      'postgres:17', 'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1', '-f', '/sql/g.sql',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
}

function main() {
  log('LIVE_P0_04_CLASS_G_START')
  log('AUTHORIZATION=operator smoke Contabilità OK + prior approvo continua')
  if (!existsSync(ENV_PATH)) throw new Error('ENV_MISSING')
  if (!existsSync(sqlOutPath)) throw new Error('SQL_MISSING')
  const env = loadEnv(ENV_PATH)
  const db = String(env.DATABASE_URL || '')
  const url = String(env.SUPABASE_URL || '')
  if (!url.includes(EXPECTED_REF)) throw new Error('REF_MISMATCH')
  if (!db) throw new Error('DB_MISSING')

  // Probe columns first (read-only)
  const cols = psql(db, `
SELECT table_name||'|'||bool_or(column_name='societa_id')::text
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN (
    'coda_import_fatture','fatture_xml','invii_log',
    'corrispettivi_giornalieri','intrastat_operazioni',
    'liquidazioni_iva_societa','revisioni_dichiarativi'
  )
GROUP BY table_name
ORDER BY 1;
`)
  log('COLS_BEGIN')
  for (const r of cols.split('\n').filter(Boolean)) log(`COL ${r}`)
  log('COLS_END')

  const before = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_BEFORE=${before}`)
  log(`SQL_PATH=${sqlOutPath}`)
  const applyOut = psqlFile(db, sqlOutPath)
  for (const row of String(applyOut).split(/\r?\n/).filter(Boolean).slice(0, 80)) log(`PSQL ${row}`)

  const after = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_AFTER=${after}`)
  if (Number(after) !== 0) throw new Error('BROAD_REMAIN')

  const authId = psql(db, `SELECT id::text FROM auth.users WHERE lower(email)='patrik.alaimo@gmail.com' LIMIT 1`)
  const smoke = psql(db, `
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${authId}', true);
SELECT set_config('request.jwt.claims', '{"sub":"${authId}","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'US='||count(*)::text FROM public.utenti_studio;
SELECT 'PN='||count(*)::text FROM public.prima_nota_righe;
SELECT 'CAUSALI='||count(*)::text FROM public.causali_contabili;
ROLLBACK;
`)
  log('RLS_SMOKE_BEGIN')
  for (const row of smoke.split('\n').filter(Boolean)) log(`RLS ${row}`)
  log('RLS_SMOKE_END')
  if (!/US=[1-9]/.test(smoke) || !/PN=/.test(smoke)) throw new Error('SMOKE_FAIL')
  log('RLS_SMOKE=PASS')

  const anonDef = psql(db, `
SELECT count(*)::text FROM pg_proc f
JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public' AND f.prosecdef
  AND has_function_privilege('anon', f.oid, 'EXECUTE');
`)
  log(`DEFINER_ANON_EXECUTE=${anonDef}`)
  if (Number(anonDef) !== 0) throw new Error('ANON_DEFINER_REGRESS')

  log('LIVE_P0_04_CLASS_G_RESULT=PASS')
}

try {
  main()
} catch (err) {
  console.error(redact(err?.message || err))
  lines.push(`LIVE_P0_04_CLASS_G_RESULT=FAIL ${redact(err?.message || err)}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.includes('RESULT=FAIL'))) process.exit(1)
}
