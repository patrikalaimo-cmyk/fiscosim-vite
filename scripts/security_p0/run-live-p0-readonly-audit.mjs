/**
 * LIVE read-only security audit (P0 exposure).
 * Uses .env.live.remediation.local DATABASE_URL via docker postgres:17 psql.
 * Never prints connection strings, passwords, or row data from business tables.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ENV_PATH = join(process.cwd(), '.env.live.remediation.local')
const EXPECTED_REF = 'mlydfspmrkaedsocubku'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `LIVE_P0_READONLY_AUDIT_${stamp}.txt`)

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
    .replace(/[A-Za-z0-9+/=]{40,}/g, 'SECRET_REDACTED')
}

function psql(databaseUrl, sql) {
  // Pass URL via env inside container to avoid argv leakage in process lists where possible
  const out = execFileSync(
    'docker',
    [
      'run', '--rm', '--dns', '8.8.8.8',
      '-e', `DATABASE_URL=${databaseUrl}`,
      'postgres:17',
      'psql',
      databaseUrl,
      '-v', 'ON_ERROR_STOP=1',
      '-At',
      '-c', sql,
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
  return out.trim()
}

function main() {
  log('LIVE_P0_READONLY_START')
  if (!existsSync(ENV_PATH)) throw new Error('ENV_MISSING')
  const env = loadEnv(ENV_PATH)
  const url = String(env.SUPABASE_URL || '')
  const db = String(env.DATABASE_URL || env.SUPABASE_DB_URL || '')
  if (!url.includes(EXPECTED_REF)) throw new Error('SUPABASE_URL_REF_MISMATCH')
  if (!db) throw new Error('DATABASE_URL_MISSING')
  if (!db.includes(EXPECTED_REF) && !db.includes('pooler.supabase.com')) {
    throw new Error('DATABASE_URL_UNEXPECTED_HOST')
  }
  log(`PROJECT_REF=${EXPECTED_REF}`)
  log(`SUPABASE_URL_HOST_OK=true`)
  log(`DATABASE_URL_PRESENT=true`)
  log('MODE=READ_ONLY')

  const counts = psql(db, `
SELECT
  (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p'))
  ||'|'||
  (SELECT count(*)::text FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='public')
  ||'|'||
  (SELECT count(*)::text FROM pg_policies WHERE schemaname='public');
`)
  log(`PUBLIC_TABLES_FUNCS_POLICIES=${counts}`)

  const anonDmlCore = psql(db, `
SELECT count(*)::text
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN (
    'prima_nota','prima_nota_righe','registri_iva','partitario',
    'ritenute_dacconto','stampe_definitive','audit_contabile',
    'societa','piano_conti','documenti_import','documenti_contabilita',
    'liquidazioni_iva','utenti_studio'
  )
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
`)
  log(`ANON_DML_CORE_COUNT=${anonDmlCore}`)

  const anonDmlCoreDetail = psql(db, `
SELECT table_name||'|'||privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN (
    'prima_nota','prima_nota_righe','registri_iva','partitario',
    'ritenute_dacconto','stampe_definitive','audit_contabile',
    'societa','piano_conti','documenti_import','documenti_contabilita',
    'liquidazioni_iva','utenti_studio'
  )
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
ORDER BY 1;
`)
  log('ANON_DML_CORE_DETAIL_BEGIN')
  for (const row of anonDmlCoreDetail.split('\n').filter(Boolean)) log(`ANON_DML ${row}`)
  log('ANON_DML_CORE_DETAIL_END')

  const anonSelectCore = psql(db, `
SELECT count(*)::text
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN (
    'prima_nota','prima_nota_righe','registri_iva','partitario',
    'ritenute_dacconto','stampe_definitive','audit_contabile','utenti_studio'
  )
  AND privilege_type = 'SELECT';
`)
  log(`ANON_SELECT_CORE_COUNT=${anonSelectCore}`)

  const definerAnon = psql(db, `
SELECT count(*)::text
FROM pg_proc f
JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public'
  AND f.prosecdef
  AND has_function_privilege('anon', f.oid, 'EXECUTE');
`)
  log(`SECURITY_DEFINER_ANON_EXECUTE_COUNT=${definerAnon}`)

  const definerNames = psql(db, `
SELECT f.proname
FROM pg_proc f
JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public'
  AND f.prosecdef
  AND has_function_privilege('anon', f.oid, 'EXECUTE')
ORDER BY 1
LIMIT 40;
`)
  log('SECURITY_DEFINER_ANON_NAMES_BEGIN')
  for (const row of definerNames.split('\n').filter(Boolean)) log(`DEFINER_ANON ${row}`)
  log('SECURITY_DEFINER_ANON_NAMES_END')

  const broadPolicies = psql(db, `
SELECT count(*)::text
FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[]);
`)
  log(`BROAD_ANON_OR_PUBLIC_TRUE_POLICIES=${broadPolicies}`)

  const broadNames = psql(db, `
SELECT tablename||'|'||policyname||'|'||cmd
FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
  AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[])
ORDER BY 1
LIMIT 50;
`)
  log('BROAD_POLICY_DETAIL_BEGIN')
  for (const row of broadNames.split('\n').filter(Boolean)) log(`BROAD_POLICY ${row}`)
  log('BROAD_POLICY_DETAIL_END')

  const migration = psql(db, `
SELECT coalesce(to_regclass('supabase_migrations.schema_migrations')::text, 'ABSENT');
`)
  log(`MIGRATION_HISTORY=${migration}`)

  const needsContainment = Number(anonDmlCore) > 0
  log(`P0_04_CONTAINMENT_NEEDED=${needsContainment}`)
  log(`LIVE_P0_READONLY_RESULT=PASS`)
  log('NEXT=await explicit authorization before any REVOKE/DROP POLICY on LIVE')
}

try {
  main()
} catch (err) {
  console.error(redact(err?.message || err))
  lines.push(`LIVE_P0_READONLY_RESULT=FAIL ${redact(err?.message || err)}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('LIVE_P0_READONLY_RESULT=FAIL'))) process.exit(1)
}
