/**
 * LAB-only: provision synthetic STAGE3V-* companies, chart accounts, Auth users,
 * utenti_studio + membership for Stage3V general-journal JWT E2E.
 * Idempotent upsert. Never prints passwords. No LIVE. No cleanup of SG-E2E-*.
 */
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const FIX = {
  A: {
    company: '73000000-0000-4000-8000-000000000001',
    codice: 'STAGE3V-A',
    auth: '73000000-0000-4000-8000-000000000003',
    utente: '73000000-0000-4000-8000-000000000005',
    email: 'stage3v-a@example.invalid',
    debit: '73000000-0000-4000-8000-000000000010',
    credit: '73000000-0000-4000-8000-000000000011',
  },
  B: {
    company: '73000000-0000-4000-8000-000000000002',
    codice: 'STAGE3V-B',
    auth: '73000000-0000-4000-8000-000000000004',
    utente: '73000000-0000-4000-8000-000000000006',
    email: 'stage3v-b@example.invalid',
    debit: '73000000-0000-4000-8000-000000000020',
    credit: '73000000-0000-4000-8000-000000000021',
  },
}

function sqlQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'"
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

function loadEnvKeys(path) {
  const map = {}
  if (!existsSync(path)) return map
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return map
}

const base = loadEnvKeys(join(process.cwd(), '.env.stage3w.lab.local'))
const anon = base.VITE_SUPABASE_ANON_KEY || base.SUPABASE_ANON_KEY
const service = base.SUPABASE_SERVICE_ROLE_KEY
if (!anon || !service) throw new Error('LAB_KEYS_MISSING_FROM_STAGE3W_ENV')

const pwdA = 'Stage3vA!' + randomBytes(10).toString('base64url')
const pwdB = 'Stage3vB!' + randomBytes(10).toString('base64url')

psql(`
INSERT INTO auth.instances (id, uuid, created_at, updated_at)
VALUES ('${INSTANCE}'::uuid, '${INSTANCE}'::uuid, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Companies
INSERT INTO public.societa (id, codice, denominazione, attiva, attivo)
VALUES
 ('${FIX.A.company}'::uuid, 'STAGE3V-A', 'Stage3V Synthetic A', true, true),
 ('${FIX.B.company}'::uuid, 'STAGE3V-B', 'Stage3V Synthetic B', true, true)
ON CONFLICT (id) DO UPDATE SET
  codice=EXCLUDED.codice, denominazione=EXCLUDED.denominazione,
  attiva=true, attivo=true, updated_at=now();

-- Chart: cassa (debit) + banca (credit) per company
INSERT INTO public.piano_conti (id, societa_id, codice, descrizione, tipo, natura, is_cassa, is_banca, attivo)
VALUES
 ('${FIX.A.debit}'::uuid, '${FIX.A.company}'::uuid, '1.01', 'Cassa STAGE3V-A', 'patrimoniale', 'attivo', true, false, true),
 ('${FIX.A.credit}'::uuid, '${FIX.A.company}'::uuid, '1.10', 'Banca STAGE3V-A', 'patrimoniale', 'attivo', false, true, true),
 ('${FIX.B.debit}'::uuid, '${FIX.B.company}'::uuid, '1.01', 'Cassa STAGE3V-B', 'patrimoniale', 'attivo', true, false, true),
 ('${FIX.B.credit}'::uuid, '${FIX.B.company}'::uuid, '1.10', 'Banca STAGE3V-B', 'patrimoniale', 'attivo', false, true, true)
ON CONFLICT (id) DO UPDATE SET
  societa_id=EXCLUDED.societa_id, codice=EXCLUDED.codice, descrizione=EXCLUDED.descrizione,
  tipo=EXCLUDED.tipo, attivo=true, updated_at=now();

-- Auth users (email/password login)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, reauthentication_token, email_change_token_current,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) VALUES
 ('${FIX.A.auth}'::uuid, '${INSTANCE}'::uuid, 'authenticated', 'authenticated', ${sqlQuote(FIX.A.email)},
  crypt(${sqlQuote(pwdA)}, gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{"stage3v":true}'::jsonb, now(), now(), false, false),
 ('${FIX.B.auth}'::uuid, '${INSTANCE}'::uuid, 'authenticated', 'authenticated', ${sqlQuote(FIX.B.email)},
  crypt(${sqlQuote(pwdB)}, gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{"stage3v":true}'::jsonb, now(), now(), false, false)
ON CONFLICT (id) DO UPDATE SET
  email=EXCLUDED.email,
  encrypted_password=EXCLUDED.encrypted_password,
  email_confirmed_at=coalesce(auth.users.email_confirmed_at, now()),
  updated_at=now();

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.email, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
FROM auth.users u
WHERE u.id IN ('${FIX.A.auth}'::uuid, '${FIX.B.auth}'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email');

-- Studio users + membership owner/admin
INSERT INTO public.utenti_studio (id, nome, cognome, email, ruolo, attivo, auth_user_id)
VALUES
 ('${FIX.A.utente}'::uuid, 'Stage3V', 'OwnerA', ${sqlQuote(FIX.A.email)}, 'owner', true, '${FIX.A.auth}'::uuid),
 ('${FIX.B.utente}'::uuid, 'Stage3V', 'OwnerB', ${sqlQuote(FIX.B.email)}, 'owner', true, '${FIX.B.auth}'::uuid)
ON CONFLICT (id) DO UPDATE SET
  email=EXCLUDED.email, ruolo='owner', attivo=true, auth_user_id=EXCLUDED.auth_user_id;

INSERT INTO public.utenti_studio_societa (utente_id, auth_user_id, societa_id, ruolo, is_default)
VALUES
 ('${FIX.A.utente}'::uuid, '${FIX.A.auth}'::uuid, '${FIX.A.company}'::uuid, 'owner', true),
 ('${FIX.B.utente}'::uuid, '${FIX.B.auth}'::uuid, '${FIX.B.company}'::uuid, 'owner', true)
ON CONFLICT (auth_user_id, societa_id) DO UPDATE SET
  utente_id=EXCLUDED.utente_id, ruolo='owner', is_default=true;
`)

const pnA = psql(`SELECT count(*)::text FROM public.prima_nota WHERE societa_id='${FIX.A.company}'::uuid`)
const pnB = psql(`SELECT count(*)::text FROM public.prima_nota WHERE societa_id='${FIX.B.company}'::uuid`)
if (pnA !== '0' || pnB !== '0') {
  console.error(`STAGE3V_PN_NOT_EMPTY A=${pnA} B=${pnB} — harness requires empty companies`)
  process.exit(1)
}

const verify = psql(`
SELECT string_agg(codice, ',' ORDER BY codice) FROM public.societa WHERE codice LIKE 'STAGE3V-%'
`)
if (!verify.includes('STAGE3V-A') || !verify.includes('STAGE3V-B')) {
  throw new Error('STAGE3V_COMPANIES_MISSING_AFTER_PROVISION')
}

const envOut = join(process.cwd(), '.env.stage3v.lab.local')
const lines = [
  '# AUTO-GENERATED Stage3V LAB fixtures — do not commit secrets',
  'FISCOSIM_ISOLATED_LAB_API=true',
  'FISCOSIM_GENERAL_JOURNAL_POST_LAB_ENABLED=true',
  'FISCOSIM_STAGE3V_PERSISTENT_WRITE_APPROVAL=LAB_SYNTHETIC_WRITE_APPROVED',
  'SUPABASE_URL=http://127.0.0.1:55321',
  'VITE_SUPABASE_URL=http://127.0.0.1:55321',
  'FISCOSIM_E2E_API_URL=http://127.0.0.1:3001',
  `FISCOSIM_E2E_PUBLISHABLE_KEY=${anon}`,
  `SUPABASE_SERVICE_ROLE_KEY=${service}`,
  `SUPABASE_ANON_KEY=${anon}`,
  `VITE_SUPABASE_ANON_KEY=${anon}`,
  `FISCOSIM_E2E_A_EMAIL=${FIX.A.email}`,
  `FISCOSIM_E2E_A_PASSWORD=${pwdA}`,
  `FISCOSIM_E2E_B_EMAIL=${FIX.B.email}`,
  `FISCOSIM_E2E_B_PASSWORD=${pwdB}`,
  `FISCOSIM_E2E_COMPANY_A=${FIX.A.company}`,
  `FISCOSIM_E2E_COMPANY_B=${FIX.B.company}`,
  `FISCOSIM_E2E_A_DEBIT_ACCOUNT=${FIX.A.debit}`,
  `FISCOSIM_E2E_A_CREDIT_ACCOUNT=${FIX.A.credit}`,
  `FISCOSIM_E2E_B_DEBIT_ACCOUNT=${FIX.B.debit}`,
  `FISCOSIM_E2E_B_CREDIT_ACCOUNT=${FIX.B.credit}`,
]
writeFileSync(envOut, lines.join('\n') + '\n', 'utf8')
console.log('STAGE3V_FIXTURES_PROVISIONED=PASS')
console.log(`COMPANIES=${verify}`)
console.log(`ENV_FILE=${envOut}`)
console.log('PN_EMPTY=true')
