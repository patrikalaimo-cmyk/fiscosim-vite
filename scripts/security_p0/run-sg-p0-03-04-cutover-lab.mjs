/**
 * SG-P0-03 audit/period + SG-P0-04 anon containment LAB + cutover smoke.
 * LAB-only on pinned Docker volume. Never prints secrets.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isFiscalJournalLegacyFallbackEnabled,
  isFiscalJournalPersistEnabled,
} from '../../src/modules/contabilita/application/fiscalJournal/isFiscalJournalPersistEnabled.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_SG_P0_03_04_CUTOVER_${stamp}.txt`)
const SQL_P004 = join(process.cwd(), 'sql/security_p0/62_p0_04_anon_containment_LAB_ONLY.sql')

const lines = []
function log(msg) {
  const row = String(msg)
  lines.push(row)
  console.log(row)
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

function applySql(path) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { encoding: 'utf8', input: readFileSync(path, 'utf8') },
  )
}

function main() {
  log('SG_P0_03_04_CUTOVER_START')

  // Cutover flags (process)
  process.env.FISCOSIM_ISOLATED_LAB_API = process.env.FISCOSIM_ISOLATED_LAB_API || 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED = process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED || 'true'
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:55321'
  process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_ENABLED = 'true'

  const persistOn = isFiscalJournalPersistEnabled()
  const legacyFb = isFiscalJournalLegacyFallbackEnabled()
  log(`CUTOVER_PERSIST_ENABLED=${persistOn}`)
  log(`LEGACY_FALLBACK=${legacyFb}`)
  if (!persistOn) throw new Error('CUTOVER_PERSIST_NOT_ENABLED')
  if (legacyFb) throw new Error('LEGACY_FALLBACK_SHOULD_BE_OFF')

  const rpc = psql(`SELECT to_regprocedure('public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)')::text`)
  log(`STAGE3W_RPC=${rpc || 'MISSING'}`)
  if (!rpc || rpc === '') throw new Error('STAGE3W_RPC_MISSING')

  // P0-03: recent Stage3W PN must have audit
  const auditPair = psql(`
WITH recent AS (
  SELECT id FROM public.prima_nota
  WHERE societa_id='${SOCIETA_A}'::uuid
  ORDER BY created_at DESC NULLS LAST
  LIMIT 5
)
SELECT count(*)::text||'|'||(
  SELECT count(*)::text FROM public.audit_contabile a
  WHERE a.societa_id='${SOCIETA_A}'::uuid
    AND a.entity_type='prima_nota'
    AND a.entity_id IN (SELECT id FROM recent)
)
FROM recent
`)
  log(`P0_03_RECENT_PN_AUDIT=${auditPair}`)
  const [pnCount, auditCount] = String(auditPair).split('|').map((x) => Number(x))
  if (!(pnCount > 0) || !(auditCount > 0)) throw new Error('P0_03_AUDIT_MISSING_FOR_RECENT_PN')

  // Period block helper present in RPC source
  const periodGuard = psql(`
SELECT (prosrc LIKE '%stampe_definitive%' AND prosrc LIKE '%periodo_inizio%')::text
FROM pg_proc
WHERE oid='public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'::regprocedure
`)
  log(`P0_03_PERIOD_GUARD_IN_RPC=${periodGuard}`)
  if (periodGuard !== 'true' && periodGuard !== 't') throw new Error('P0_03_PERIOD_GUARD_MISSING')

  // P0-04 containment
  applySql(SQL_P004)
  log('P0_04_SQL_APPLY=PASS')
  const anonDml = psql(`
SELECT count(*)::text FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
  AND table_name IN ('prima_nota','prima_nota_righe','registri_iva','partitario','ritenute_dacconto','stampe_definitive','audit_contabile')
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
`)
  log(`P0_04_ANON_CORE_DML=${anonDml}`)
  if (anonDml !== '0') throw new Error('P0_04_ANON_DML_REMAIN')

  const anonPolicy = psql(`
SELECT count(*)::text FROM pg_policy pol
JOIN pg_class c ON c.oid=pol.polrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='avvisi_ade' AND pol.polname='anon_access_test'
`)
  log(`P0_04_ANON_ACCESS_TEST_POLICY=${anonPolicy}`)
  if (anonPolicy !== '0') throw new Error('P0_04_ANON_POLICY_REMAIN')

  // Stampa UI gate still requires server evidence checksum (source contract)
  const stampaSrc = readFileSync(
    join(process.cwd(), 'src/modules/contabilita/application/stampe/motoreStampaDefinitiva.js'),
    'utf8',
  )
  if (!/validateStampaDefinitivaEvidence/.test(stampaSrc) || !/checksum/.test(stampaSrc)) {
    throw new Error('P0_03_STAMPA_EVIDENCE_GATE_MISSING')
  }
  log('P0_03_STAMPA_UI_GATE=PASS')

  log('LIVE_NOTE=no cloud credentials in active LAB env; LIVE GRANT/REVOKE not applied (containment SQL LAB-only)')
  log('SG_P0_03_04_CUTOVER_RESULT=PASS')
}

try {
  main()
} catch (err) {
  console.error(err)
  lines.push(`SG_P0_03_04_CUTOVER_RESULT=FAIL ${err?.message || err}`)
} finally {
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`EVIDENCE=${outPath}`)
  if (lines.some((l) => l.startsWith('SG_P0_03_04_CUTOVER_RESULT=FAIL'))) process.exit(1)
}
