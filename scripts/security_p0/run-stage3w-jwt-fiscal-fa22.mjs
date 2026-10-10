/**
 * Stage3W L3: signed JWT -> HTTP fiscal-journal-post -> PostgreSQL persist.
 * Repairs incomplete SG-E2E auth stubs into login-ready GoTrue users (identities+password),
 * posts FA22, replay, cross-company 403. Never prints tokens/passwords.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const LAB = process.env.FISCOSIM_P0_LAB_DIR || 'C:\\Users\\patri\\FiscoSim-P0-LAB-20261008-164658'
const API = 'http://127.0.0.1:3001/api/studio/fiscal-journal-post'
const AUTH_URL = 'http://127.0.0.1:55321'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const AUTH_B = '72000000-0000-4000-8000-000000000004'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const EMAIL_B = 'sg-e2e-b@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA = '72000000-0000-4000-8000-000000000012'
const INSTANCE = '00000000-0000-0000-0000-000000000000'

function loadEnvFile(path) {
  const map = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return map
}

function sqlQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'"
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8' },
  )
}

function psqlJson(sql) {
  const line = psql(sql)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.startsWith('{') || s.startsWith('['))
  if (!line) throw new Error('JSON_MISSING')
  return JSON.parse(line)
}

const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
if (!serviceKey || !anonKey) throw new Error('LAB_KEYS_MISSING')
if (env.SUPABASE_URL !== AUTH_URL || env.VITE_SUPABASE_URL !== AUTH_URL) {
  throw new Error('LAB_URL_MISMATCH_EXPECT_55321')
}

const password = 'SgE2e!' + randomBytes(12).toString('base64url')

// Repair GoTrue rows so signInWithPassword works (stubs lacked password/identities).
psql(`
INSERT INTO auth.instances (id, uuid, created_at, updated_at)
VALUES ('${INSTANCE}'::uuid, '${INSTANCE}'::uuid, now(), now())
ON CONFLICT (id) DO NOTHING;

UPDATE auth.users
SET
  instance_id='${INSTANCE}'::uuid,
  aud='authenticated',
  role='authenticated',
  encrypted_password=crypt(${sqlQuote(password)}, gen_salt('bf')),
  email_confirmed_at=coalesce(email_confirmed_at, now()),
  confirmation_token=coalesce(confirmation_token, ''),
  recovery_token=coalesce(recovery_token, ''),
  email_change_token_new=coalesce(email_change_token_new, ''),
  email_change=coalesce(email_change, ''),
  phone_change=coalesce(phone_change, ''),
  phone_change_token=coalesce(phone_change_token, ''),
  reauthentication_token=coalesce(reauthentication_token, ''),
  email_change_token_current=coalesce(email_change_token_current, ''),
  raw_app_meta_data=coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  raw_user_meta_data=coalesce(raw_user_meta_data, '{"sg_e2e":true}'::jsonb),
  updated_at=now(),
  is_sso_user=false,
  is_anonymous=false
WHERE id IN ('${AUTH_A}'::uuid,'${AUTH_B}'::uuid);

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.email, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
FROM auth.users u
WHERE u.id IN ('${AUTH_A}'::uuid,'${AUTH_B}'::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email'
  );
`)

async function signIn(email) {
  const client = createClient(AUTH_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data?.session?.access_token) {
    throw new Error('SIGNIN_FAILED:' + (error?.message || 'no token'))
  }
  return { token: data.session.access_token, userId: data.user.id }
}

const sessionA = await signIn(EMAIL_A)
const sessionB = await signIn(EMAIL_B)
if (sessionA.userId !== AUTH_A || sessionB.userId !== AUTH_B) {
  throw new Error('AUTH_USER_ID_MISMATCH')
}

const requestId = randomUUID()
const doc = 'SG-E2E-JWT-FA22-001'
const body = {
  societa_id: SOCIETA_A,
  request_id: requestId,
  contract_kind: 'fattura_attiva',
  source_module: 'registrazione_manual',
  motivazione: 'SG-E2E JWT signed fiscal FA22 persist',
  header: {
    data_registrazione: '2026-03-22',
    data_documento: '2026-03-22',
    numero_documento: doc,
    descrizione: '[SG-E2E] JWT FA22 via fiscal-journal-post',
  },
  rows: [
    { conto_id: CONTO_CLIENTE, dare: 1220, avere: 0 },
    { conto_id: CONTO_RICAVO, dare: 0, avere: 1000 },
    { conto_id: CONTO_IVA, dare: 0, avere: 220 },
  ],
  vat: {
    rows: [{
      tipo: 'vendita',
      imponibile: 1000,
      iva: 220,
      aliquota: 22,
      esigibilita: 'immediata',
      split_payment: false,
      documento_id: doc,
      riga_idx: 0,
    }],
  },
  ledger: {
    mode: 'open',
    openings: [{
      tipo: 'cliente',
      conto_id: CONTO_CLIENTE,
      numero_documento: doc,
      data_documento: '2026-03-22',
      importo_originale: 1220,
    }],
    closures: [],
  },
  withholding: { eventType: 'none', inserts: [], updates: [] },
}

async function postFiscal(token, payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* keep */ }
  return { status: res.status, json, text }
}

const ok = await postFiscal(sessionA.token, body)
if (ok.status !== 201 || !ok.json?.ok || !ok.json?.id) {
  throw new Error('FISCAL_POST_FAILED status=' + ok.status + ' body=' + (ok.text || '').slice(0, 400))
}
const pnId = ok.json.id

const replay = await postFiscal(sessionA.token, body)
if (replay.status !== 201 || replay.json?.id !== pnId) {
  throw new Error('REPLAY_MISMATCH status=' + replay.status + ' body=' + (replay.text || '').slice(0, 200))
}

const cross = await postFiscal(sessionB.token, {
  ...body,
  request_id: randomUUID(),
  header: { ...body.header, numero_documento: 'SG-E2E-JWT-CROSS-001' },
  vat: {
    rows: [{
      ...body.vat.rows[0],
      documento_id: 'SG-E2E-JWT-CROSS-001',
    }],
  },
  ledger: {
    mode: 'open',
    openings: [{
      ...body.ledger.openings[0],
      numero_documento: 'SG-E2E-JWT-CROSS-001',
    }],
    closures: [],
  },
})
if (cross.status !== 403) {
  throw new Error('CROSS_COMPANY_NOT_DENIED status=' + cross.status + ' body=' + (cross.text || '').slice(0, 200))
}

const row = psqlJson(`
SELECT row_to_json(t) FROM (
  SELECT id::text, societa_id::text AS societa_id, numero_documento, totale_dare, totale_avere
  FROM public.prima_nota WHERE id='${pnId}'
) t;
`)
if (row.societa_id !== SOCIETA_A || row.numero_documento !== doc) throw new Error('PN_MISMATCH')
if (Number(row.totale_dare) !== 1220 || Number(row.totale_avere) !== 1220) throw new Error('PN_UNBALANCED')

const vatN = Number(psql(`
SELECT count(*)::text FROM public.registri_iva
WHERE prima_nota_id='${pnId}' AND societa_id='${SOCIETA_A}' AND iva=220 AND imponibile=1000;
`).trim())
if (vatN !== 1) throw new Error('VAT_ROW_MISSING')

const partRes = Number(psql(`
SELECT importo_residuo::text FROM public.partitario
WHERE prima_nota_id='${pnId}' AND societa_id='${SOCIETA_A}' AND tipo='cliente';
`).trim())
if (partRes !== 1220) throw new Error('PARTITA_RESIDUAL_MISMATCH')

const claimN = Number(psql(`
SELECT count(*)::text FROM public.fiscosim_fiscal_journal_claim
WHERE societa_id='${SOCIETA_A}' AND request_id='${requestId}' AND prima_nota_id='${pnId}';
`).trim())
if (claimN !== 1) throw new Error('CLAIM_MISSING')

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 23)
const reportLab = join(LAB, `STAGE3W_JWT_FISCAL_FA22_${stamp}.txt`)
const reportRepo = join(process.cwd(), 'REPORT', 'STAGE3W_JWT_FISCAL_FA22_20261011.txt')
const lines = [
  'STAGE3W_JWT_FISCAL_FA22',
  `AUTH_URL=${AUTH_URL}`,
  `API=${API}`,
  `CONTAINER=${CONTAINER}`,
  `SOCIETA_A=${SOCIETA_A}`,
  `DOC=${doc}`,
  `PN_ID=${pnId}`,
  `REQUEST_ID=${requestId}`,
  'AUTH_REPAIR=password+identities+instance',
  'LOGIN_A=PASS',
  'LOGIN_B=PASS',
  'HTTP_POST=201',
  'REPLAY_SAME_ID=PASS',
  'CROSS_COMPANY_HTTP=403',
  'PN_BALANCE=1220/1220',
  'VAT=220',
  'PARTITA_RESIDUO=1220',
  'CLAIM=1',
  'STAGE3V_PORT_GATE=still_blocked_0.0.0.0_publish',
  'TOKENS_PRINTED=false',
  'PASSWORDS_PRINTED=false',
  'RESULT=PASS',
]
writeFileSync(reportLab, lines.join('\n') + '\n', 'utf8')
writeFileSync(reportRepo, lines.join('\n') + '\n', 'utf8')
console.log('STAGE3W_JWT_FISCAL_FA22|PASS')
console.log('REPORT=' + reportLab)
console.log('PN_ID=' + pnId)
