/**
 * Stage3W SG-P3-01: Bank reconciliation atomic commit via fiscal LAB
 * (riconciliazione_bancaria → pagamento + partita close) + server claim history.
 * Does not use Manuale createPrimaNotaCompleta. LAB-only.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitBankReconciliationFiscalLab } from '../../src/modules/contabilita/application/riconciliazione/commitBankReconciliationFiscalLab.js'
import {
  buildBankFiscalCommitHistoryQuery,
  normalizeBankFiscalCommitHistoryRows,
} from '../../src/modules/contabilita/application/riconciliazione/listBankFiscalCommitHistory.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API_ORIGIN = 'http://127.0.0.1:3001'
const API = API_ORIGIN + '/api/studio/fiscal-journal-post'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA = '72000000-0000-4000-8000-000000000012'
const CONTO_BANCA = '72000000-0000-4000-8000-000000000013'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const TAXABLE = 1000
const VAT = 220
const GROSS = 1220
const OPEN_DATE = '2026-04-10'
const PAY_DATE = '2026-04-18'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_BANK_COMMIT_LAB_${stamp}.txt`)

const lines = []
function log(msg) {
  const row = String(msg)
  lines.push(row)
  console.log(row)
}

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
  ).trim()
}

function psqlJson(sql) {
  const out = psql(sql)
  const line = out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.startsWith('{') || s.startsWith('['))
  if (!line) throw new Error('JSON_MISSING: ' + out.slice(0, 200))
  return JSON.parse(line)
}

function ensureAuthPassword(password) {
  psql(`
INSERT INTO auth.instances (id, uuid, created_at, updated_at)
VALUES ('${INSTANCE}'::uuid, '${INSTANCE}'::uuid, now(), now())
ON CONFLICT (id) DO NOTHING;
UPDATE auth.users SET
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
  updated_at=now()
WHERE id='${AUTH_A}'::uuid;
`)
}

async function postFiscal(token, body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* keep */ }
  return { status: res.status, json, text }
}

async function main() {
  log('P3_01_START Bank RPC atomica via Stage3W + storico claim')
  process.env.FISCOSIM_ISOLATED_LAB_API = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED = 'true'
  process.env.FISCOSIM_BANK_COMMIT_LAB_ENABLED = 'true'

  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('LAB_KEYS_MISSING')
  if (env.VITE_SUPABASE_URL !== AUTH_URL) throw new Error('LAB_URL_MISMATCH')

  const password = 'SgE2eBank!' + randomBytes(8).toString('base64url')
  ensureAuthPassword(password)
  const client = createClient(AUTH_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sess, error: loginErr } = await client.auth.signInWithPassword({
    email: EMAIL_A,
    password,
  })
  if (loginErr || !sess?.session?.access_token) throw new Error('LOGIN_FAILED')
  log('LOGIN_JWT=PASS')
  const token = sess.session.access_token

  const faDoc = `SG-E2E-P301-FA-${stamp.slice(-6)}`
  const faRes = await postFiscal(token, {
    societa_id: SOCIETA_A,
    request_id: randomUUID(),
    contract_kind: 'fattura_attiva',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E P3-01 FA open for bank close',
    header: {
      data_registrazione: OPEN_DATE,
      data_documento: OPEN_DATE,
      numero_documento: faDoc,
      descrizione: '[SG-E2E] P3-01 FA open',
    },
    rows: [
      { conto_id: CONTO_CLIENTE, dare: GROSS, avere: 0 },
      { conto_id: CONTO_RICAVO, dare: 0, avere: TAXABLE },
      { conto_id: CONTO_IVA, dare: 0, avere: VAT },
    ],
    vat: {
      rows: [{
        tipo: 'vendita',
        imponibile: TAXABLE,
        iva: VAT,
        aliquota: 22,
        numero_documento: faDoc,
        data_documento: OPEN_DATE,
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'cliente',
        conto_id: CONTO_CLIENTE,
        importo_originale: GROSS,
        numero_documento: faDoc,
        data_documento: OPEN_DATE,
      }],
      closures: [],
    },
  })
  log(`FA_STATUS=${faRes.status}`)
  log(`FA_PN=${faRes.json?.id || ''}`)
  if (faRes.status !== 201 || !faRes.json?.id) {
    log(`FA_BODY=${(faRes.text || '').slice(0, 300)}`)
    throw new Error('FA_OPEN_FAILED')
  }

  const partitaId = psql(`
SELECT id::text FROM public.partitario
WHERE prima_nota_id='${faRes.json.id}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`PARTITA_ID=${partitaId}`)
  if (!partitaId) throw new Error('PARTITA_MISSING')
  const residuoOpen = Number(psql(`SELECT importo_residuo::text FROM public.partitario WHERE id='${partitaId}'::uuid`))
  log(`PARTITA_OPEN=${residuoOpen}`)
  if (residuoOpen !== GROSS) throw new Error('PARTITA_NOT_GROSS')

  const movementId = `bm-p301-${stamp.slice(-6)}`
  const bankResult = await commitBankReconciliationFiscalLab({
    accessToken: token,
    apiUrl: API,
    context: {
      societaId: SOCIETA_A,
      registrationDate: PAY_DATE,
      movementId,
      motivazione: 'SG-E2E P3-01 bank atomic commit LAB',
    },
    payload: {
      movementId,
      primaNotaRighe: [
        { conto_id: CONTO_BANCA, dare: GROSS, avere: 0, descrizione: 'Incasso bancario' },
        { conto_id: CONTO_CLIENTE, dare: 0, avere: GROSS, descrizione: 'Chiusura cliente' },
      ],
      partitarioMovements: [{
        action: 'chiusura_totale',
        partitaId,
        importoChiusura: GROSS,
      }],
    },
  })
  log(`BANK_STATUS=${bankResult.status}`)
  log(`BANK_COMMITTED=${Boolean(bankResult.committed)}`)
  log(`BANK_PN=${bankResult.primaNotaId || ''}`)
  log(`BANK_REQUEST=${bankResult.requestId || ''}`)
  if (!bankResult.committed || !bankResult.primaNotaId) {
    log(`BANK_DETAIL=${JSON.stringify(bankResult).slice(0, 500)}`)
    throw new Error('BANK_COMMIT_FAILED')
  }

  const claim = psql(`
SELECT coalesce(request_payload->>'source_module','')||'|'||coalesce(request_payload->>'contract_kind','')||'|'||coalesce(prima_nota_id::text,'')
FROM public.fiscosim_fiscal_journal_claim
WHERE societa_id='${SOCIETA_A}'::uuid AND request_id='${bankResult.requestId}'::uuid
LIMIT 1
`)
  log(`CLAIM=${claim}`)
  if (!String(claim).startsWith('riconciliazione_bancaria|pagamento|')) {
    throw new Error('CLAIM_SOURCE_MISMATCH')
  }

  const residuoAfter = Number(psql(`SELECT importo_residuo::text FROM public.partitario WHERE id='${partitaId}'::uuid`))
  log(`PARTITA_AFTER=${residuoAfter}`)
  if (residuoAfter !== 0) throw new Error('PARTITA_NOT_CLOSED')

  const historyRaw = psqlJson(buildBankFiscalCommitHistoryQuery({ societaId: SOCIETA_A, limit: 20 }))
  const history = normalizeBankFiscalCommitHistoryRows(historyRaw)
  log(`HISTORY_COUNT=${history.length}`)
  const hit = history.find((row) => row.requestId === bankResult.requestId)
  log(`HISTORY_HIT=${JSON.stringify(hit || null)}`)
  if (!hit || hit.primaNotaId !== bankResult.primaNotaId) throw new Error('HISTORY_MISSING')
  if (hit.sourceModule !== 'riconciliazione_bancaria') throw new Error('HISTORY_SOURCE')

  // Replay exact same fiscal body → same PN (Stage3W claim idempotency)
  if (!bankResult.fiscalRequest) throw new Error('FISCAL_REQUEST_MISSING')
  const replay = await postFiscal(token, bankResult.fiscalRequest)
  log(`REPLAY_STATUS=${replay.status}`)
  log(`REPLAY_PN=${replay.json?.id || ''}`)
  if (replay.status !== 201 || replay.json?.id !== bankResult.primaNotaId) {
    log(`REPLAY_BODY=${(replay.text || '').slice(0, 300)}`)
    throw new Error('IDEMPOTENCY_REPLAY_FAILED')
  }

  log('P3_01_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P3_01_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P3_01_RESULT=FAIL'))) process.exit(1)
  })
