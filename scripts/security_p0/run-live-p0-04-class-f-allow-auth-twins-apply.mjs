/**
 * LIVE P0-04 class F: drop TRUE allow_all where "Allow authenticated" (or other non-true) twin exists.
 * Tables: f24_righe, f24_scadenze, impostazioni_studio (if twin), etc. — discovered dynamically.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ENV_PATH = join(process.cwd(), '.env.live.remediation.local')
const EXPECTED_REF = 'mlydfspmrkaedsocubku'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `LIVE_P0_04_CLASS_F_APPLY_${stamp}.txt`)
const sqlOutPath = join(process.cwd(), 'sql/security_p0/69_p0_04_class_f_LIVE_mlydfspmrkaedsocubku.sql')

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
  const dir = mkdtempSync(join(tmpdir(), 'fiscosim-live-f-'))
  copyFileSync(sqlHostPath, join(dir, 'f.sql'))
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-e', `DATABASE_URL=${databaseUrl}`,
      '-v', `${dir}:/sql:ro`,
      'postgres:17', 'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1', '-f', '/sql/f.sql',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
}

function main() {
  log('LIVE_P0_04_CLASS_F_START')
  log(`PROJECT_REF=${EXPECTED_REF}`)
  log('AUTHORIZATION=operator approvo continua 2026-10-13')
  if (!existsSync(ENV_PATH)) throw new Error('ENV_MISSING')
  const env = loadEnv(ENV_PATH)
  const db = String(env.DATABASE_URL || '')
  const url = String(env.SUPABASE_URL || '')
  if (!url.includes(EXPECTED_REF)) throw new Error('SUPABASE_URL_REF_MISMATCH')
  if (!db) throw new Error('DATABASE_URL_MISSING')

  const before = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_BEFORE=${before}`)

  // Candidates: true policies on tables that also have a non-true policy
  const candidates = psql(db, `
SELECT t.tablename||'|'||t.policyname
FROM pg_policies t
WHERE t.schemaname='public'
  AND (lower(btrim(coalesce(t.qual,'')))='true' OR lower(btrim(coalesce(t.with_check,'')))='true')
  AND (t.roles @> ARRAY['public']::name[] OR t.roles @> ARRAY['authenticated']::name[])
  AND EXISTS (
    SELECT 1 FROM pg_policies s
    WHERE s.schemaname='public' AND s.tablename=t.tablename
      AND s.policyname <> t.policyname
      AND lower(btrim(coalesce(s.qual,''))) <> 'true'
      AND lower(btrim(coalesce(s.with_check,''))) <> 'true'
  )
ORDER BY 1;
`)
  const rows = candidates.split('\n').filter(Boolean)
  log(`CANDIDATES=${rows.length}`)
  for (const r of rows) log(`CANDIDATE ${r}`)
  if (rows.length === 0) {
    log('LIVE_P0_04_CLASS_F_RESULT=PASS_NOOP')
    return
  }

  const drops = rows.map((r) => {
    const i = r.indexOf('|')
    const table = r.slice(0, i)
    const policy = r.slice(i + 1)
    return `DROP POLICY IF EXISTS ${JSON.stringify(policy)} ON public.${JSON.stringify(table).replace(/^"|"$/g, '"')};`
      .replace(/"([^"]+)"/g, (_, id) => `"${id.replace(/"/g, '""')}"`)
  })
  // Safer quote via format in SQL DO block
  const sql = `-- SG-P0-04 LIVE class F — drop TRUE policies with non-true twin
BEGIN;
DO $body$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tablename, t.policyname
    FROM pg_policies t
    WHERE t.schemaname='public'
      AND (lower(btrim(coalesce(t.qual,'')))='true' OR lower(btrim(coalesce(t.with_check,'')))='true')
      AND (t.roles @> ARRAY['public']::name[] OR t.roles @> ARRAY['authenticated']::name[])
      AND EXISTS (
        SELECT 1 FROM pg_policies s
        WHERE s.schemaname='public' AND s.tablename=t.tablename
          AND s.policyname <> t.policyname
          AND lower(btrim(coalesce(s.qual,''))) <> 'true'
          AND lower(btrim(coalesce(s.with_check,''))) <> 'true'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'DROPPED % on %', r.policyname, r.tablename;
  END LOOP;
END
$body$;
COMMIT;
`
  void drops
  writeFileSync(sqlOutPath, sql, 'utf8')
  log(`SQL_WRITTEN=${sqlOutPath}`)
  const applyOut = psqlFile(db, sqlOutPath)
  for (const row of String(applyOut).split(/\r?\n/).filter(Boolean).slice(0, 60)) log(`PSQL ${row}`)

  const after = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_AFTER=${after}`)
  if (!(Number(after) < Number(before))) throw new Error('NOT_REDUCED')

  const authId = psql(db, `SELECT id::text FROM auth.users WHERE lower(email)='patrik.alaimo@gmail.com' LIMIT 1`)
  const smoke = psql(db, `
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${authId}', true);
SELECT set_config('request.jwt.claims', '{"sub":"${authId}","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'US='||count(*)::text FROM public.utenti_studio;
SELECT 'PN_RIGHE='||count(*)::text FROM public.prima_nota_righe;
SELECT 'F24R='||count(*)::text FROM public.f24_righe;
ROLLBACK;
`)
  log('RLS_SMOKE_BEGIN')
  for (const row of smoke.split('\n').filter(Boolean)) log(`RLS ${row}`)
  log('RLS_SMOKE_END')
  if (!/US=[1-9]/.test(smoke) || !/PN_RIGHE=/.test(smoke)) throw new Error('RLS_SMOKE_FAIL')
  log('RLS_SMOKE=PASS')
  log('LIVE_P0_04_CLASS_F_RESULT=PASS')
}

try {
  main()
} catch (err) {
  console.error(redact(err?.message || err))
  lines.push(`LIVE_P0_04_CLASS_F_RESULT=FAIL ${redact(err?.message || err)}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => /RESULT=FAIL/.test(l))) process.exit(1)
}
