/**
 * SG-L2: install contabile_decision_feedback on pinned LAB DB + API smoke (A/B deny).
 * LAB-only. Never prints tokens/passwords.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const SQL_PATH = join(process.cwd(), 'sql/security_p0/61_contabile_decision_feedback_LAB_ONLY.sql')
const API = 'http://127.0.0.1:3001'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const SOCIETA_B = '72000000-0000-4000-8000-000000000002'
const USER_A = '72000000-0000-4000-8000-000000000003'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const PASSWORD = 'SgE2eLabBrowser!20261011'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_SG_L2_DECISION_FEEDBACK_DB_${stamp}.txt`)

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

function applySqlFile() {
  const sql = readFileSync(SQL_PATH, 'utf8')
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { encoding: 'utf8', input: sql },
  )
}

function loadEnvLocal() {
  const env = {}
  try {
    const raw = readFileSync(join(process.cwd(), '.env.stage3w.lab.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 1) continue
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  } catch { /* ignore */ }
  return env
}

async function main() {
  log('SG_L2_DF_DB_START')
  log(`SQL=${SQL_PATH}`)

  // Ensure password for browser/API user
  const q = PASSWORD.replace(/'/g, "''")
  psql(`
UPDATE auth.users SET
  encrypted_password=crypt('${q}', gen_salt('bf')),
  email_confirmed_at=coalesce(email_confirmed_at,now()),
  updated_at=now()
WHERE id='${USER_A}'::uuid;
`)

  applySqlFile()
  log('SQL_APPLY=PASS')

  const table = psql(`SELECT to_regclass('public.contabile_decision_feedback')::text`)
  log(`TABLE=${table}`)
  if (table !== 'contabile_decision_feedback') throw new Error('TABLE_MISSING')

  const grants = psql(`
SELECT string_agg(grantee||':'||privilege_type, ',' ORDER BY 1)
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='contabile_decision_feedback'
  AND grantee IN ('anon','authenticated','service_role','PUBLIC')
`)
  log(`GRANTS=${grants || 'none'}`)
  if (/anon:|authenticated:|PUBLIC:/i.test(grants || '')) throw new Error('UNSAFE_GRANTS')
  if (!/service_role:SELECT/i.test(grants || '') || !/service_role:INSERT/i.test(grants || '')) {
    throw new Error('SERVICE_ROLE_GRANT_MISSING')
  }

  const rls = psql(`SELECT relrowsecurity::text FROM pg_class WHERE oid='public.contabile_decision_feedback'::regclass`)
  log(`RLS=${rls}`)
  if (!/^(t|true)$/i.test(String(rls || '').trim())) throw new Error('RLS_OFF')

  process.env.FISCOSIM_DECISION_FEEDBACK_DB_LAB_ENABLED = 'true'
  const env = loadEnvLocal()
  const anon = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!anon) throw new Error('ANON_KEY_MISSING')

  // Auth via Kong 55321
  const tokenRes = await fetch('http://127.0.0.1:55321/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: EMAIL_A, password: PASSWORD }),
  })
  if (!tokenRes.ok) throw new Error(`AUTH_FAIL ${tokenRes.status}`)
  const tokenBody = await tokenRes.json()
  const token = tokenBody.access_token
  log('AUTH=PASS')

  const requestId = crypto.randomUUID()
  const postA = await fetch(`${API}/api/studio/decision-feedback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      societa_id: SOCIETA_A,
      events: [{
        societaId: SOCIETA_A,
        sourceModule: 'import_contabilita',
        field: 'account',
        finalValue: '72000000-0000-4000-8000-000000000014',
        proposedValue: '72000000-0000-4000-8000-000000000014',
        requestId,
        contextKey: 'piva:01378570350|dir:acquisto|desc:servizio',
        outcome: 'confirmed',
        committed: true,
      }],
    }),
  })
  const postABody = await postA.json().catch(() => ({}))
  log(`POST_A_STATUS=${postA.status}`)
  log(`POST_A_OK=${Boolean(postABody.ok)}`)
  if (![200, 201].includes(postA.status) || !postABody.ok) {
    throw new Error(`POST_A_FAIL ${postA.status} ${JSON.stringify(postABody)}`)
  }

  const getA = await fetch(
    `${API}/api/studio/decision-feedback?societa_id=${SOCIETA_A}&source_module=import_contabilita&limit=20`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const getABody = await getA.json().catch(() => ({}))
  log(`GET_A_STATUS=${getA.status} COUNT=${getABody.count}`)
  if (getA.status !== 200 || !(getABody.count >= 1)) throw new Error('GET_A_FAIL')

  const getB = await fetch(
    `${API}/api/studio/decision-feedback?societa_id=${SOCIETA_B}&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const getBBody = await getB.json().catch(() => ({}))
  log(`GET_B_CROSS_STATUS=${getB.status} ERROR=${getBBody.error || ''}`)
  if (getB.status !== 403 || getBBody.error !== 'SOCIETA_NON_AUTORIZZATA') {
    throw new Error('LE_S01_CROSS_COMPANY_DENY_FAIL')
  }

  const postB = await fetch(`${API}/api/studio/decision-feedback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      societa_id: SOCIETA_B,
      events: [{
        societaId: SOCIETA_B,
        sourceModule: 'import_contabilita',
        field: 'account',
        finalValue: 'x',
        requestId: crypto.randomUUID(),
        committed: true,
      }],
    }),
  })
  const postBBody = await postB.json().catch(() => ({}))
  log(`POST_B_CROSS_STATUS=${postB.status} ERROR=${postBBody.error || ''}`)
  if (postB.status !== 403) throw new Error('LE_S01_POST_CROSS_FAIL')

  const dbCount = psql(`
SELECT count(*)::text FROM public.contabile_decision_feedback
WHERE societa_id='${SOCIETA_A}'::uuid AND request_id='${requestId}'
`)
  log(`DB_ROW_COUNT=${dbCount}`)
  if (dbCount !== '1') throw new Error('DB_ROW_MISSING')

  log('LE_S01=PASS')
  log('SG_L2_DF_DB_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`SG_L2_DF_DB_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('SG_L2_DF_DB_RESULT=FAIL'))) process.exit(1)
  })
