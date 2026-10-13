/**
 * LIVE P0-04 tranche 2 (authorized):
 * - REVOKE EXECUTE FROM anon (+ PUBLIC) on SECURITY DEFINER RPCs that anon can execute
 * - Ensure authenticated retains EXECUTE
 * - REVOKE remaining anon table privileges on public tables (SELECT/DML) where still present
 * - DROP policies whose roles are ONLY {anon} (not authenticated/public catch-all)
 * Does NOT drop broad allow_all policies that also cover authenticated (would lock UI).
 * Never prints secrets.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ENV_PATH = join(process.cwd(), '.env.live.remediation.local')
const EXPECTED_REF = 'mlydfspmrkaedsocubku'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `LIVE_P0_04_TRANCHE2_APPLY_${stamp}.txt`)
const sqlOutPath = join(process.cwd(), 'sql/security_p0/64_p0_04_tranche2_LIVE_mlydfspmrkaedsocubku.sql')

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
  const dir = mkdtempSync(join(tmpdir(), 'fiscosim-live-t2-'))
  const localSql = join(dir, 't2.sql')
  copyFileSync(sqlHostPath, localSql)
  return execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-v', `${dir}:/sql:ro`,
      'postgres:17',
      'psql', databaseUrl,
      '-v', 'ON_ERROR_STOP=1',
      '-f', '/sql/t2.sql',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
}

function main() {
  log('LIVE_P0_04_T2_START')
  log(`PROJECT_REF=${EXPECTED_REF}`)
  if (!existsSync(ENV_PATH)) throw new Error('ENV_MISSING')
  const env = loadEnv(ENV_PATH)
  const db = String(env.DATABASE_URL || '')
  const url = String(env.SUPABASE_URL || '')
  if (!url.includes(EXPECTED_REF)) throw new Error('SUPABASE_URL_REF_MISMATCH')
  if (!db) throw new Error('DATABASE_URL_MISSING')

  const beforeDefiner = psql(db, `
SELECT count(*)::text FROM pg_proc f
JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public' AND f.prosecdef
  AND has_function_privilege('anon', f.oid, 'EXECUTE');
`)
  log(`DEFINER_ANON_EXECUTE_BEFORE=${beforeDefiner}`)

  const beforeAnonTable = psql(db, `
SELECT count(*)::text FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
  AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE');
`)
  log(`ANON_TABLE_PRIVS_BEFORE=${beforeAnonTable}`)

  const anonOnlyPolicies = psql(db, `
SELECT tablename||'|'||policyname
FROM pg_policies
WHERE schemaname='public'
  AND roles = ARRAY['anon']::name[]
ORDER BY 1;
`)
  log('ANON_ONLY_POLICIES_BEFORE_BEGIN')
  for (const r of anonOnlyPolicies.split('\n').filter(Boolean)) log(`ANON_ONLY_POLICY ${r}`)
  log('ANON_ONLY_POLICIES_BEFORE_END')

  // Build SQL dynamically from live catalog (identity args for overloads)
  const funcRows = psql(db, `
SELECT f.oid::regprocedure::text
FROM pg_proc f
JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public' AND f.prosecdef
  AND has_function_privilege('anon', f.oid, 'EXECUTE')
ORDER BY 1;
`)
  const funcs = funcRows.split('\n').filter(Boolean)
  log(`DEFINER_TARGETS=${funcs.length}`)
  for (const f of funcs) log(`TARGET_FN ${f}`)

  const tableRows = psql(db, `
SELECT DISTINCT table_name
FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
  AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE')
ORDER BY 1;
`)
  const tables = tableRows.split('\n').filter(Boolean)
  log(`ANON_TABLE_TARGETS=${tables.length}`)

  const sqlParts = []
  sqlParts.push('-- SG-P0-04 LIVE tranche 2 — generated; authorized 2026-10-13')
  sqlParts.push('-- REVOKE anon/PUBLIC EXECUTE on SECURITY DEFINER; keep authenticated')
  sqlParts.push('BEGIN;')

  for (const regproc of funcs) {
    // regprocedure already quoted like name(args)
    sqlParts.push(`REVOKE EXECUTE ON FUNCTION ${regproc} FROM anon;`)
    sqlParts.push(`REVOKE EXECUTE ON FUNCTION ${regproc} FROM PUBLIC;`)
    sqlParts.push(`GRANT EXECUTE ON FUNCTION ${regproc} TO authenticated;`)
    sqlParts.push(`GRANT EXECUTE ON FUNCTION ${regproc} TO service_role;`)
  }

  for (const t of tables) {
    const safe = t.replace(/'/g, "''")
    sqlParts.push(`REVOKE ALL ON TABLE public.${JSON.stringify(t).slice(1, -1).replace(/"/g, '')} FROM anon;`)
    // Use format-safe identifier via quote
  }

  // Rebuild table revokes with proper quoting via DO block instead
  sqlParts.length = 0
  sqlParts.push('-- SG-P0-04 LIVE tranche 2 — generated; authorized 2026-10-13')
  sqlParts.push('BEGIN;')
  sqlParts.push(`DO $body$
DECLARE
  r record;
  t text;
BEGIN
  -- 1) SECURITY DEFINER: revoke anon/PUBLIC execute; grant authenticated+service_role
  FOR r IN
    SELECT f.oid, f.oid::regprocedure AS regproc
    FROM pg_proc f
    JOIN pg_namespace n ON n.oid=f.pronamespace
    WHERE n.nspname='public' AND f.prosecdef
      AND has_function_privilege('anon', f.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.regproc);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.regproc);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.regproc);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.regproc);
  END LOOP;

  -- 2) Revoke any remaining anon privileges on public tables/views
  FOR t IN
    SELECT DISTINCT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v')
      AND has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
  END LOOP;

  -- 3) Drop policies that target ONLY anon (safe; does not remove authenticated allow_all)
  FOR r IN
    SELECT c.relname AS tablename, p.polname AS policyname
    FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname='anon')]::oid[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END
$body$;`)

  sqlParts.push(`-- verify definer anon execute = 0`)
  sqlParts.push(`DO $v$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM pg_proc f
  JOIN pg_namespace n ON n.oid=f.pronamespace
  WHERE n.nspname='public' AND f.prosecdef
    AND has_function_privilege('anon', f.oid, 'EXECUTE');
  IF bad > 0 THEN
    RAISE EXCEPTION 'tranche2 failed: % SECURITY DEFINER still executable by anon', bad;
  END IF;
END
$v$;`)

  sqlParts.push('COMMIT;')
  const sqlText = sqlParts.join('\n') + '\n'
  writeFileSync(sqlOutPath, sqlText, 'utf8')
  log(`SQL_WRITTEN=${sqlOutPath}`)

  log('APPLY_SQL=START')
  const out = psqlFile(db, sqlOutPath)
  log('APPLY_SQL=DONE')
  for (const l of redact(out).split('\n').filter((x) => x && !/postgresql:\/\//i.test(x)).slice(0, 30)) {
    log(`APPLY_OUT ${l}`)
  }

  const afterDefiner = psql(db, `
SELECT count(*)::text FROM pg_proc f
JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public' AND f.prosecdef
  AND has_function_privilege('anon', f.oid, 'EXECUTE');
`)
  log(`DEFINER_ANON_EXECUTE_AFTER=${afterDefiner}`)
  if (afterDefiner !== '0') throw new Error('VERIFY_DEFINER_FAIL')

  const afterAnonTable = psql(db, `
SELECT count(*)::text FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
  AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE');
`)
  log(`ANON_TABLE_PRIVS_AFTER=${afterAnonTable}`)

  const authExec = psql(db, `
SELECT count(*)::text FROM pg_proc f
JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public' AND f.prosecdef
  AND f.proname IN (
    'consolida_periodo_iva_transazionale','consolidazione_stampa_definitiva',
    'precheck_stampa_definitiva','rpc_annulla_prima_nota_logica',
    'rpc_get_prima_nota_operation_guards','rpc_storna_prima_nota_generale',
    'rpc_update_prima_nota_generale_controllata','apply_ai_learning_from_feedback'
  )
  AND has_function_privilege('authenticated', f.oid, 'EXECUTE');
`)
  log(`AUTHENTICATED_DEFINER_EXECUTE_COUNT=${authExec}`)

  const broadStill = psql(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
`)
  log(`BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC_REMAINING=${broadStill}`)
  log('NOTE=Broad allow_all for authenticated/public NOT dropped (would break old UI); needs tenant-scoped replacement before A100 freeze')

  log('LIVE_P0_04_T2_RESULT=PASS')
}

try {
  main()
} catch (err) {
  console.error(redact(err?.stderr || err?.message || err))
  lines.push(`LIVE_P0_04_T2_RESULT=FAIL ${redact(err?.message || err)}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('LIVE_P0_04_T2_RESULT=FAIL'))) process.exit(1)
}
