/**
 * LIVE P0-04 class E (authorized via "approvo continua"):
 * Drop redundant allow_all / TRUE policies ONLY where a scoped twin already exists.
 * Never prints secrets. Verifies RLS read as Patrik auth user after apply.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ENV_PATH = join(process.cwd(), '.env.live.remediation.local')
const EXPECTED_REF = 'mlydfspmrkaedsocubku'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `LIVE_P0_04_CLASS_E_APPLY_${stamp}.txt`)
const sqlOutPath = join(process.cwd(), 'sql/security_p0/67_p0_04_class_e_LIVE_mlydfspmrkaedsocubku.sql')
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
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-e', `DATABASE_URL=${databaseUrl}`,
      'postgres:17',
      'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1',
      '-At',
      '-c', sql,
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  ).trim()
}

function psqlFile(databaseUrl, sqlHostPath) {
  const dir = mkdtempSync(join(tmpdir(), 'fiscosim-live-e-'))
  const localSql = join(dir, 'e.sql')
  copyFileSync(sqlHostPath, localSql)
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-e', `DATABASE_URL=${databaseUrl}`,
      '-v', `${dir}:/sql:ro`,
      'postgres:17',
      'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1',
      '-f', '/sql/e.sql',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
}

const SQL = `-- SG-P0-04 LIVE class E — authorized 2026-10-13 (operator: approvo continua)
-- Drop TRUE allow_all ONLY when scoped twin already present on same table.
BEGIN;

-- Guard: each target must still have at least one non-true policy
DO $g$
DECLARE missing text;
BEGIN
  SELECT string_agg(t, ',') INTO missing
  FROM unnest(ARRAY[
    'causali_contabili','causali_iva','documenti_contabilita','documenti_import',
    'liquidazioni_iva','prima_nota_righe','utenti_studio'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename=t
      AND lower(btrim(coalesce(p.qual,''))) <> 'true'
      AND lower(btrim(coalesce(p.with_check,''))) <> 'true'
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'class E aborted: missing scoped twin on %', missing;
  END IF;
END
$g$;

DROP POLICY IF EXISTS causali_contabili_all ON public.causali_contabili;
DROP POLICY IF EXISTS causali_iva_all ON public.causali_iva;
DROP POLICY IF EXISTS allow_all_doc_cont ON public.documenti_contabilita;
DROP POLICY IF EXISTS "Allow all" ON public.documenti_import;
DROP POLICY IF EXISTS "Allow all operations on documenti_import" ON public.documenti_import;
DROP POLICY IF EXISTS allow_all_documenti ON public.documenti_import;
DROP POLICY IF EXISTS allow_all_liq ON public.liquidazioni_iva;
DROP POLICY IF EXISTS allow_all_pn_righe ON public.prima_nota_righe;
DROP POLICY IF EXISTS public_access ON public.utenti_studio;

DO $v$
DECLARE bad int;
BEGIN
  SELECT count(*)::int INTO bad
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN (
      'causali_contabili','causali_iva','documenti_contabilita','documenti_import',
      'liquidazioni_iva','prima_nota_righe','utenti_studio'
    )
    AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true');
  IF bad > 0 THEN
    RAISE EXCEPTION 'class E failed: % true policies remain on targeted tables', bad;
  END IF;
END
$v$;

COMMIT;
`

function main() {
  log('LIVE_P0_04_CLASS_E_START')
  log(`PROJECT_REF=${EXPECTED_REF}`)
  log('AUTHORIZATION=operator approvo continua 2026-10-13')
  if (!existsSync(join(process.cwd(), BACKUP_HINT))) throw new Error('BACKUP_MISSING')
  log(`BACKUP_PRESENT=true`)
  if (!existsSync(ENV_PATH)) throw new Error('ENV_MISSING')
  const env = loadEnv(ENV_PATH)
  const db = String(env.DATABASE_URL || '')
  const url = String(env.SUPABASE_URL || '')
  if (!url.includes(EXPECTED_REF)) throw new Error('SUPABASE_URL_REF_MISMATCH')
  if (!db) throw new Error('DATABASE_URL_MISSING')

  const beforeBroad = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC_BEFORE=${beforeBroad}`)

  writeFileSync(sqlOutPath, SQL, 'utf8')
  log(`SQL_WRITTEN=${sqlOutPath}`)
  const applyOut = psqlFile(db, sqlOutPath)
  for (const row of String(applyOut).split(/\r?\n/).filter(Boolean).slice(0, 50)) log(`PSQL ${row}`)

  const afterBroad = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC_AFTER=${afterBroad}`)
  if (!(Number(afterBroad) < Number(beforeBroad))) throw new Error('BROAD_COUNT_NOT_REDUCED')

  // Resolve Patrik auth id from known email (no PII beyond what operator already uses)
  const authId = psql(db, `
SELECT id::text FROM auth.users
WHERE lower(email)='patrik.alaimo@gmail.com'
LIMIT 1;
`)
  if (!authId || authId.length < 30) throw new Error('PATRIK_AUTH_NOT_FOUND')
  log(`PATRIK_AUTH_RESOLVED=true`)

  // RLS smoke as authenticated (Supabase JWT claim pattern)
  const rlsSmoke = psql(db, `
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${authId}', true);
SELECT set_config('request.jwt.claims', '{"sub":"${authId}","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'US='||count(*)::text FROM public.utenti_studio;
SELECT 'PN_RIGHE_OK='||count(*)::text FROM public.prima_nota_righe;
ROLLBACK;
`)
  log('RLS_SMOKE_BEGIN')
  for (const row of rlsSmoke.split('\n').filter(Boolean)) log(`RLS ${row}`)
  log('RLS_SMOKE_END')
  if (!/US=[1-9]/.test(rlsSmoke)) throw new Error('RLS_SMOKE_UTENTI_STUDIO_FAIL')
  if (!/PN_RIGHE_OK=/.test(rlsSmoke)) throw new Error('RLS_SMOKE_PN_RIGHE_FAIL')
  log('RLS_SMOKE=PASS')

  const anonDml = psql(db, `
SELECT count(*)::text FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
  AND table_name IN ('prima_nota','prima_nota_righe','utenti_studio');
`)
  log(`ANON_DML_CORE_AFTER=${anonDml}`)
  if (Number(anonDml) !== 0) throw new Error('ANON_CONTAINMENT_REGRESSED')

  log('LIVE_P0_04_CLASS_E_RESULT=PASS')
  log('NEXT=operator smoke login Contabilità on fiscosim-v6; then remaining allow_all (adempimenti/invii/f24/…)')
}

try {
  main()
} catch (err) {
  console.error(redact(err?.message || err))
  lines.push(`LIVE_P0_04_CLASS_E_RESULT=FAIL ${redact(err?.message || err)}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('LIVE_P0_04_CLASS_E_RESULT=FAIL'))) process.exit(1)
}
