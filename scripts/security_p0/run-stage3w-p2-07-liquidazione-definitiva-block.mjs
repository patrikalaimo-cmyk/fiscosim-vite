/**
 * Stage3W SG-P2-07: liquidazione IVA da PN/registri reali (periodo vuoto auto 2027+)
 * + consolidamento provvisorio + riconsolidamento + blocco doppio dopo definitiva.
 * LAB-only. L6-repeatable (picks empty month). Never prints tokens/passwords.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcoloLiquidazioneIvaDefinitiva } from '../../src/modules/contabilita/domain/iva/calcoloLiquidazioneIvaDefinitiva.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API_ORIGIN = 'http://127.0.0.1:3001'
const API = API_ORIGIN + '/api/studio/fiscal-journal-post'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const UTENTE_A = '72000000-0000-4000-8000-000000000005'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA_DEB = '72000000-0000-4000-8000-000000000012'
const CONTO_COSTO = '72000000-0000-4000-8000-000000000014'
const CONTO_IVA_CRED = '72000000-0000-4000-8000-000000000015'
const CONTO_FORNITORE = '72000000-0000-4000-8000-000000000016'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const TAXABLE = 1000
const VAT = 220
const GROSS = 1220
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_P2_07_LIQUIDAZIONE_DEFINITIVA_${stamp}.txt`)

/** Pick first month (from 2027-01) with zero registri_iva for SG-E2E-A — L6-repeatable. */
function pickEmptyPeriod() {
  for (let year = 2027; year <= 2030; year++) {
    for (let month = 1; month <= 12; month++) {
      const mm = String(month).padStart(2, '0')
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const inizio = `${year}-${mm}-01`
      const fine = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
      const priorVat = Number(psql(`
SELECT count(*)::text FROM public.registri_iva
WHERE societa_id='${SOCIETA_A}'::uuid
  AND data>='${inizio}'::date AND data<='${fine}'::date
`))
      if (priorVat === 0) {
        return {
          periodoInizio: inizio,
          periodoFine: fine,
          faDate: `${year}-${mm}-10`,
          fpDate: `${year}-${mm}-12`,
          priorVat,
        }
      }
    }
  }
  throw new Error('NO_EMPTY_IVA_PERIOD_2027_2030')
}

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

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function assertEq(label, actual, expected) {
  if (round2(actual) !== round2(expected)) {
    throw new Error(`${label}: got ${actual}, expected ${expected}`)
  }
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
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* keep */
  }
  return { status: res.status, json, text }
}

function callConsolidate(motivo, payload, periodoInizio, periodoFine) {
  const payloadLit = JSON.stringify(payload).replace(/'/g, "''")
  return psqlJson(`
SELECT public.consolida_periodo_iva_transazionale(
  '${SOCIETA_A}'::uuid,
  '${periodoInizio}'::date,
  '${periodoFine}'::date,
  'mensile',
  '${UTENTE_A}'::uuid,
  '${motivo.replace(/'/g, "''")}',
  '${payloadLit}'::jsonb
)::text;
`)
}

async function main() {
  log('P2_07_START Liquidazione da PN reali + blocco definitiva')
  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('LAB_KEYS_MISSING')
  if (env.VITE_SUPABASE_URL !== AUTH_URL) throw new Error('LAB_URL_MISMATCH')

  const period = pickEmptyPeriod()
  const { periodoInizio, periodoFine, faDate, fpDate } = period
  log(`PERIOD=${periodoInizio}..${periodoFine}`)
  log(`PRIOR_VAT_PERIOD=${period.priorVat}`)

  const password = 'SgE2eLiq!' + randomBytes(8).toString('base64url')
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

  const faDoc = `SG-E2E-P207-FA-${stamp.slice(-6)}`
  const fpDoc = `SG-E2E-P207-FP-${stamp.slice(-6)}`

  const faRes = await postFiscal(token, {
    societa_id: SOCIETA_A,
    request_id: randomUUID(),
    contract_kind: 'fattura_attiva',
    source_module: 'registrazione_manual',
    motivazione: `SG-E2E P2-07 FA vendita ${periodoInizio}`,
    header: {
      data_registrazione: faDate,
      data_documento: faDate,
      numero_documento: faDoc,
      descrizione: '[SG-E2E] P2-07 FA',
    },
    rows: [
      { conto_id: CONTO_CLIENTE, dare: GROSS, avere: 0 },
      { conto_id: CONTO_RICAVO, dare: 0, avere: TAXABLE },
      { conto_id: CONTO_IVA_DEB, dare: 0, avere: VAT },
    ],
    vat: {
      rows: [{
        tipo: 'vendita',
        imponibile: TAXABLE,
        iva: VAT,
        aliquota: 22,
        split_payment: false,
        numero_documento: faDoc,
        data_documento: faDate,
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'cliente',
        conto_id: CONTO_CLIENTE,
        importo_originale: GROSS,
        numero_documento: faDoc,
        data_documento: faDate,
      }],
      closures: [],
    },
  })
  log(`FA_STATUS=${faRes.status}`)
  log(`FA_PN=${faRes.json?.id || ''}`)
  if (faRes.status !== 201 || !faRes.json?.ok) {
    log(`FA_BODY=${(faRes.text || '').slice(0, 400)}`)
    throw new Error('FA_POST_FAILED')
  }

  const fpRes = await postFiscal(token, {
    societa_id: SOCIETA_A,
    request_id: randomUUID(),
    contract_kind: 'fattura_passiva',
    source_module: 'registrazione_manual',
    motivazione: `SG-E2E P2-07 FP acquisto ${periodoInizio}`,
    header: {
      data_registrazione: fpDate,
      data_documento: fpDate,
      numero_documento: fpDoc,
      descrizione: '[SG-E2E] P2-07 FP',
    },
    rows: [
      { conto_id: CONTO_COSTO, dare: TAXABLE, avere: 0 },
      { conto_id: CONTO_IVA_CRED, dare: VAT, avere: 0 },
      { conto_id: CONTO_FORNITORE, dare: 0, avere: GROSS },
    ],
    vat: {
      rows: [{
        tipo: 'acquisto',
        imponibile: TAXABLE,
        iva: VAT,
        aliquota: 22,
        iva_detraibile: VAT,
        split_payment: false,
        numero_documento: fpDoc,
        data_documento: fpDate,
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'fornitore',
        conto_id: CONTO_FORNITORE,
        importo_originale: GROSS,
        numero_documento: fpDoc,
        data_documento: fpDate,
      }],
      closures: [],
    },
  })
  log(`FP_STATUS=${fpRes.status}`)
  log(`FP_PN=${fpRes.json?.id || ''}`)
  if (fpRes.status !== 201 || !fpRes.json?.ok) {
    log(`FP_BODY=${(fpRes.text || '').slice(0, 400)}`)
    throw new Error('FP_POST_FAILED')
  }

  const vatRows = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.id), '[]'::json) FROM (
  SELECT id, societa_id::text AS societa_id, data::text AS data,
         imponibile, iva, aliquota, tipo, iva_detraibile, iva_indetraibile,
         esigibilita, split_payment, prima_nota_id::text AS prima_nota_id
  FROM public.registri_iva
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND data>='${periodoInizio}'::date AND data<='${periodoFine}'::date
) t
`)
  log(`VAT_ROWS=${vatRows.length}`)
  if (vatRows.length !== 2) throw new Error('EXPECTED_2_VAT_ROWS')

  const calc = calcoloLiquidazioneIvaDefinitiva(vatRows, {
    societaId: SOCIETA_A,
    periodoInizio,
    periodoFine,
    periodicita: 'mensile',
  })
  log(`IVA_DEBITO=${calc.ivaDebitoEffettiva}`)
  log(`IVA_CREDITO=${calc.ivaAcquistiDetraibile}`)
  log(`SALDO=${calc.saldoPeriodo}`)
  assertEq('debito', calc.ivaDebitoEffettiva, VAT)
  assertEq('credito', calc.ivaAcquistiDetraibile, VAT)
  assertEq('saldo', calc.saldoPeriodo, 0)

  const payload = {
    ivaVenditeLorda: calc.ivaVenditeLorda,
    ivaSplitEsclusa: calc.ivaSplitEsclusa,
    ivaDebitoEffettiva: calc.ivaDebitoEffettiva,
    ivaAcquistiDetraibile: calc.ivaAcquistiDetraibile,
    ivaAcquistiIndetraibile: calc.ivaAcquistiIndetraibile,
    saldoPeriodo: calc.saldoPeriodo,
    debitoPeriodo: calc.debitoPeriodo,
    debitoDaVersare: calc.debitoDaVersare,
    f24Dovuto: calc.f24Dovuto,
  }

  const first = callConsolidate(`[SG-E2E] P2-07 consolidamento provvisorio ${periodoInizio}`, payload, periodoInizio, periodoFine)
  log(`FIRST=${JSON.stringify(first)}`)
  if (first.success !== true) throw new Error('FIRST_CONSOLIDATE_FAILED')
  if (first.stato !== 'provvisoria') throw new Error('FIRST_NOT_PROVVISORIA')
  const id1 = first.liquidazioneId
  if (!id1) throw new Error('FIRST_MISSING_ID')

  const second = callConsolidate(`[SG-E2E] P2-07 riconsolidamento provvisorio ${periodoInizio}`, payload, periodoInizio, periodoFine)
  log(`SECOND=${JSON.stringify(second)}`)
  if (second.success !== true) throw new Error('SECOND_CONSOLIDATE_FAILED')
  const id2 = second.liquidazioneId
  if (!id2) throw new Error('SECOND_MISSING_ID')
  const stillFirst = psql(`SELECT count(*)::text FROM public.liquidazione_iva WHERE id='${id1}'::uuid`)
  log(`OLD_PROVVISORIA_COUNT=${stillFirst}`)
  if (stillFirst !== '0') throw new Error('OLD_PROVVISORIA_NOT_REPLACED')

  const countPeriod = psql(`
SELECT count(*)::text FROM public.liquidazione_iva
WHERE societa_id='${SOCIETA_A}'::uuid
  AND periodo_inizio='${periodoInizio}'::date
  AND periodo_fine='${periodoFine}'::date
`)
  log(`LIQ_PERIOD_COUNT=${countPeriod}`)
  if (countPeriod !== '1') throw new Error('EXPECTED_ONE_LIQ')

  psql(`
UPDATE public.liquidazione_iva
SET note = replace(coalesce(note,''), '[stato:provvisoria]', '[stato:definitiva]'),
    updated_at = now()
WHERE id='${id2}'::uuid;
`)
  const noteAfter = psql(`SELECT coalesce(note,'') FROM public.liquidazione_iva WHERE id='${id2}'::uuid`)
  log(`NOTE_AFTER_LOCK=${noteAfter.slice(0, 120)}`)
  if (!noteAfter.includes('[stato:definitiva]')) throw new Error('DEFINITIVA_MARKER_MISSING')

  const blocked = callConsolidate('[SG-E2E] P2-07 must fail after definitiva', payload, periodoInizio, periodoFine)
  log(`BLOCKED=${JSON.stringify(blocked)}`)
  if (blocked.success !== false) throw new Error('DEFINITIVA_BLOCK_MISSING')
  const err = String(blocked.error || '').toLowerCase()
  if (!err.includes('bloccato') && !err.includes('definitiva')) {
    throw new Error('DEFINITIVA_BLOCK_UNEXPECTED')
  }

  log(`FA_PN_ID=${faRes.json.id}`)
  log(`FP_PN_ID=${fpRes.json.id}`)
  log(`LIQ_ID=${id2}`)
  log('PROVVISORIA=PASS')
  log('RICONSOLIDAMENTO=PASS')
  log('DEFINITIVA_LOCK_BLOCK=PASS')
  log('P2_07_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    log(`P2_07_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P2_07_RESULT=FAIL'))) process.exit(1)
  })
