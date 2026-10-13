/**
 * LIVE P0-04 class D (authorized): drop allow_all on test_* tables.
 * Does NOT touch fiscal/core UI tables. Never prints secrets.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ENV_PATH = join(process.cwd(), '.env.live.remediation.local')
const EXPECTED_REF = 'mlydfspmrkaedsocubku'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `LIVE_P0_04_CLASS_D_APPLY_${stamp}.txt`)
const sqlOutPath = join(process.cwd(), 'sql/security_p0/66_p0_04_class_d_LIVE_mlydfspmrkaedsocubku.sql')
const BACKUP_HINT = 'REPORT/LIVE_BACKUP_schema_public_20261013.sql'

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

function psql(databaseUrl, sql) {
  return execFileSync(
    'docker',
    ['run', '--rm', '--dns', '8.8.8.8', 'postgres:17', 'psql', databaseUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  ).trim()
}

function psqlFile(databaseUrl, sqlHostPath) {
  const dir = mkdtempSync(join(tmpdir(), 'fiscosim-live-d-'))
  const localSql = join(dir, 'd.sql')
  copyFileSync(sqlHostPath, localSql)
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-v', `${dir}:/sql:ro`,
      'postgres:17',
      'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1',
      '-f', '/sql/d.sql',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
}

const SQL = `-- SG-P0-04 LIVE class D — authorized 2026-10-13 (operator: approvo continua)
-- Drop allow_all on test_* only; deny authenticated. No fiscal tables.
BEGIN;

DROP POLICY IF EXISTS allow_all_test_cases ON public.test_cases;
DROP POLICY IF EXISTS allow_all_test_datasets ON public.test_datasets;
DROP POLICY IF EXISTS allow_all_test_runs ON public.test_runs;

DO $body$
BEGIN
  IF to_regclass('public.test_cases') IS NOT NULL THEN
    BEGIN
      CREATE POLICY test_cases_deny_authenticated ON public.test_cases
        FOR ALL TO authenticated USING (false) WITH CHECK (false);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
  IF to_regclass('public.test_datasets') IS NOT NULL THEN
    BEGIN
      CREATE POLICY test_datasets_deny_authenticated ON public.test_datasets
        FOR ALL TO authenticated USING (false) WITH CHECK (false);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
  IF to_regclass('public.test_runs') IS NOT NULL THEN
    BEGIN
      CREATE POLICY test_runs_deny_authenticated ON public.test_runs
        FOR ALL TO authenticated USING (false) WITH CHECK (false);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$body$;

DO $v$
DECLARE bad int;
BEGIN
  SELECT count(*)::int INTO bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('test_cases', 'test_datasets', 'test_runs')
    AND (lower(btrim(coalesce(qual, ''))) = 'true' OR lower(btrim(coalesce(with_check, ''))) = 'true');
  IF bad > 0 THEN
    RAISE EXCEPTION 'class D LIVE failed: % true policies remain on test_*', bad;
  END IF;
END
$v$;

COMMIT;
`

function main() {
  log('LIVE_P0_04_CLASS_D_START')
  log(`PROJECT_REF=${EXPECTED_REF}`)
  log('AUTHORIZATION=operator approvo continua 2026-10-13')
  log(`BACKUP_HINT=${BACKUP_HINT}`)
  if (!existsSync(join(process.cwd(), BACKUP_HINT))) {
    throw new Error('BACKUP_MISSING ' + BACKUP_HINT)
  }
  log('BACKUP_PRESENT=true')
  if (!existsSync(ENV_PATH)) throw new Error('ENV_MISSING')
  const env = loadEnv(ENV_PATH)
  const db = String(env.DATABASE_URL || '')
  const url = String(env.SUPABASE_URL || '')
  if (!url.includes(EXPECTED_REF)) throw new Error('SUPABASE_URL_REF_MISMATCH')
  if (!db) throw new Error('DATABASE_URL_MISSING')

  const before = psql(db, `
SELECT count(*)::text
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('test_cases','test_datasets','test_runs')
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true');
`)
  log(`TEST_TRUE_POLICIES_BEFORE=${before}`)

  const beforeBroad = psql(db, `
SELECT count(*)::text
FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC_BEFORE=${beforeBroad}`)

  writeFileSync(sqlOutPath, SQL, 'utf8')
  log(`SQL_WRITTEN=${sqlOutPath}`)

  const applyOut = psqlFile(db, sqlOutPath)
  for (const row of String(applyOut).split(/\r?\n/).filter(Boolean).slice(0, 40)) {
    log(`PSQL ${row}`)
  }

  const after = psql(db, `
SELECT count(*)::text
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('test_cases','test_datasets','test_runs')
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true');
`)
  log(`TEST_TRUE_POLICIES_AFTER=${after}`)
  if (Number(after) !== 0) throw new Error('CLASS_D_VERIFY_FAIL')

  const afterBroad = psql(db, `
SELECT count(*)::text
FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC_AFTER=${afterBroad}`)

  const detail = psql(db, `
SELECT tablename||'|'||policyname||'|'||coalesce(qual,'')
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('test_cases','test_datasets','test_runs')
ORDER BY 1;
`)
  log('TEST_POLICY_DETAIL_BEGIN')
  for (const r of detail.split('\n').filter(Boolean)) log(`TEST_POLICY ${r}`)
  log('TEST_POLICY_DETAIL_END')

  // anon containment must remain
  const anonDml = psql(db, `
SELECT count(*)::text FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
  AND table_name IN ('prima_nota','prima_nota_righe','utenti_studio');
`)
  log(`ANON_DML_CORE_AFTER=${anonDml}`)
  if (Number(anonDml) !== 0) throw new Error('ANON_CONTAINMENT_REGRESSED')

  log('LIVE_P0_04_CLASS_D_RESULT=PASS')
  log('NEXT=prepare LIVE class E/B safe drops or tenant fiscal policies after LAB rehearsal')
}

try {
  main()
} catch (err) {
  console.error(redact(err?.message || err))
  lines.push(`LIVE_P0_04_CLASS_D_RESULT=FAIL ${redact(err?.message || err)}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('LIVE_P0_04_CLASS_D_RESULT=FAIL'))) process.exit(1)
}
