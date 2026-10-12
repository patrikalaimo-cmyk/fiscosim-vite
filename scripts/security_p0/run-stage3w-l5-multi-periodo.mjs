/**
 * Stage3W SG-P4-01: Suite L5 dataset multi-periodo sintetico (LAB).
 * Seeds FA+FP across 2024-11 and 2026-02 via fiscal-journal-post;
 * asserts balances, VAT liquidazione, partite, fingerprint.
 * LAB-only. Never prints tokens/passwords. No LIVE / no destructive cleanup.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcoloLiquidazioneIvaDefinitiva } from '../../src/modules/contabilita/domain/iva/calcoloLiquidazioneIvaDefinitiva.js'
import {
  buildL5MultiPeriodSeedPlan,
  expectedDatasetFromPlan,
  assertL5MultiPeriodInvariants,
} from '../../src/modules/contabilita/application/l5/buildL5MultiPeriodDatasetPlan.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API = 'http://127.0.0.1:3001/api/studio/fiscal-journal-post'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA_DEB = '72000000-0000-4000-8000-000000000012'
const CONTO_COSTO = '72000000-0000-4000-8000-000000000014'
const CONTO_IVA_CRED = '72000000-0000-4000-8000-000000000015'
const CONTO_FORNITORE = '72000000-0000-4000-8000-000000000016'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const runId = stamp.slice(-8)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_L5_MULTI_PERIODO_P4_01_${stamp}.txt`)

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

function buildFaBody(doc) {
  return {
    societa_id: SOCIETA_A,
    request_id: randomUUID(),
    contract_kind: 'fattura_attiva',
    source_module: 'registrazione_manual',
    motivazione: `SG-E2E P4-01 FA ${doc.numero_documento}`,
    header: {
      data_registrazione: doc.date,
      data_documento: doc.date,
      numero_documento: doc.numero_documento,
      descrizione: `[SG-E2E] P4-01 FA ${doc.date}`,
    },
    rows: [
      { conto_id: CONTO_CLIENTE, dare: doc.lordo, avere: 0 },
      { conto_id: CONTO_RICAVO, dare: 0, avere: doc.imponibile },
      { conto_id: CONTO_IVA_DEB, dare: 0, avere: doc.iva },
    ],
    vat: {
      rows: [{
        tipo: 'vendita',
        imponibile: doc.imponibile,
        iva: doc.iva,
        aliquota: 22,
        split_payment: false,
        numero_documento: doc.numero_documento,
        data_documento: doc.date,
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'cliente',
        conto_id: CONTO_CLIENTE,
        importo_originale: doc.lordo,
        numero_documento: doc.numero_documento,
        data_documento: doc.date,
      }],
      closures: [],
    },
  }
}

function buildFpBody(doc) {
  return {
    societa_id: SOCIETA_A,
    request_id: randomUUID(),
    contract_kind: 'fattura_passiva',
    source_module: 'registrazione_manual',
    motivazione: `SG-E2E P4-01 FP ${doc.numero_documento}`,
    header: {
      data_registrazione: doc.date,
      data_documento: doc.date,
      numero_documento: doc.numero_documento,
      descrizione: `[SG-E2E] P4-01 FP ${doc.date}`,
    },
    rows: [
      { conto_id: CONTO_COSTO, dare: doc.imponibile, avere: 0 },
      { conto_id: CONTO_IVA_CRED, dare: doc.iva, avere: 0 },
      { conto_id: CONTO_FORNITORE, dare: 0, avere: doc.lordo },
    ],
    vat: {
      rows: [{
        tipo: 'acquisto',
        imponibile: doc.imponibile,
        iva: doc.iva,
        aliquota: 22,
        iva_detraibile: doc.iva,
        split_payment: false,
        numero_documento: doc.numero_documento,
        data_documento: doc.date,
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'fornitore',
        conto_id: CONTO_FORNITORE,
        importo_originale: doc.lordo,
        numero_documento: doc.numero_documento,
        data_documento: doc.date,
      }],
      closures: [],
    },
  }
}

async function waitForApi(maxAttempts = 8) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(API.replace('/api/studio/fiscal-journal-post', '/'), {
        method: 'GET',
      })
      if (res.status > 0) {
        log(`API_REACHABLE=PASS attempt=${i} status=${res.status}`)
        return
      }
    } catch (err) {
      log(`API_WAIT attempt=${i} err=${err?.message || err}`)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('LAB_API_UNREACHABLE')
}

async function main() {
  log('P4_01_START L5 multi-periodo sintetico LAB')
  process.env.FISCOSIM_ISOLATED_LAB_API = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED = 'true'

  const plan = buildL5MultiPeriodSeedPlan({ runId })
  const expected = expectedDatasetFromPlan(plan)
  log(`RUN_ID=${plan.runId}`)
  log(`YEARS=${plan.years.join(',')}`)
  log(`PERIOD_COUNT=${plan.periodCount}`)
  log(`EXPECTED_FP=${expected.fingerprint}`)
  log(`DOCS=${plan.allDocNumbers.join(',')}`)

  await waitForApi()

  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('LAB_KEYS_MISSING')
  if (env.VITE_SUPABASE_URL !== AUTH_URL) throw new Error('LAB_URL_MISMATCH')

  const password = 'SgE2eL5!' + randomBytes(8).toString('base64url')
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

  const pnByDoc = new Map()
  for (const period of plan.periods) {
    for (const doc of period.docs) {
      const body = doc.kind === 'fattura_attiva' ? buildFaBody(doc) : buildFpBody(doc)
      const res = await postFiscal(token, body)
      log(`POST_${doc.kind}_${period.key}_STATUS=${res.status}`)
      log(`POST_${doc.kind}_${period.key}_PN=${res.json?.id || ''}`)
      if (res.status !== 201 || !res.json?.ok) {
        log(`POST_BODY=${(res.text || '').slice(0, 500)}`)
        throw new Error(`POST_FAILED_${doc.numero_documento}`)
      }
      pnByDoc.set(doc.numero_documento, res.json.id)
    }
  }
  log(`PN_POSTED=${pnByDoc.size}`)

  const docListSql = plan.allDocNumbers.map(sqlQuote).join(',')
  const observedPeriods = []

  for (const period of plan.periods) {
    const docs = period.docs.map((d) => d.numero_documento)
    const docsSql = docs.map(sqlQuote).join(',')

    const pnRows = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data_registrazione, t.id), '[]'::json) FROM (
  SELECT id::text, numero_documento, data_registrazione::text AS data_registrazione,
         totale_dare, totale_avere, stato
  FROM public.prima_nota
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND numero_documento IN (${docsSql})
) t
`)
    const balancedPnAll = Array.isArray(pnRows)
      && pnRows.length === docs.length
      && pnRows.every((r) => round2(r.totale_dare) === round2(r.totale_avere) && round2(r.totale_dare) > 0)

    const vatRows = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.id), '[]'::json) FROM (
  SELECT id, societa_id::text AS societa_id, data::text AS data,
         imponibile, iva, aliquota, tipo, iva_detraibile, iva_indetraibile,
         esigibilita, split_payment, numero_documento,
         prima_nota_id::text AS prima_nota_id
  FROM public.registri_iva
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND data>='${period.periodoInizio}'::date
    AND data<='${period.periodoFine}'::date
    AND numero_documento IN (${docsSql})
) t
`)

    const calc = calcoloLiquidazioneIvaDefinitiva(vatRows, {
      societaId: SOCIETA_A,
      periodoInizio: period.periodoInizio,
      periodoFine: period.periodoFine,
      periodicita: 'mensile',
    })

    const partite = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
  SELECT id::text, numero_documento, tipo, importo_originale, importo_residuo, stato
  FROM public.partitario
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND numero_documento IN (${docsSql})
) t
`)
    const partiteAperteLordo = round2(
      (Array.isArray(partite) ? partite : []).reduce((s, p) => s + Number(p.importo_originale || 0), 0),
    )

    const obs = {
      key: period.key,
      year: period.year,
      periodoInizio: period.periodoInizio,
      periodoFine: period.periodoFine,
      pnCount: Array.isArray(pnRows) ? pnRows.length : 0,
      vatRowsObserved: Array.isArray(vatRows) ? vatRows.length : 0,
      ivaDebito: calc.ivaDebitoEffettiva,
      ivaCredito: calc.ivaAcquistiDetraibile,
      saldoIva: calc.saldoPeriodo,
      partiteAperteLordo,
      balancedPnAll,
    }
    observedPeriods.push(obs)
    log(`PERIOD_${period.key}_PN=${obs.pnCount}`)
    log(`PERIOD_${period.key}_VAT=${obs.vatRowsObserved}`)
    log(`PERIOD_${period.key}_IVA_DEB=${obs.ivaDebito}`)
    log(`PERIOD_${period.key}_IVA_CRED=${obs.ivaCredito}`)
    log(`PERIOD_${period.key}_SALDO=${obs.saldoIva}`)
    log(`PERIOD_${period.key}_PARTITE_LORDO=${obs.partiteAperteLordo}`)
    log(`PERIOD_${period.key}_BALANCED=${obs.balancedPnAll}`)
  }

  // Doc list used to prove we only assert our synthetic markers
  log(`FILTER_DOCS=${docListSql.replace(/'/g, '')}`)

  const verdict = assertL5MultiPeriodInvariants({ plan, observedPeriods })
  log(`FINGERPRINT_EXPECTED=${verdict.expectedFingerprint}`)
  log(`FINGERPRINT_OBSERVED=${verdict.observedFingerprint}`)
  if (!verdict.valid) {
    log(`BLOCKERS=${verdict.blockers.join('|')}`)
    throw new Error('L5_INVARIANTS_FAILED')
  }

  for (const [doc, pnId] of pnByDoc.entries()) {
    log(`PN_DOC=${doc}|${pnId}`)
  }
  log('YEARS_OK=PASS')
  log('PERIODS_OK=PASS')
  log('BALANCES_OK=PASS')
  log('VAT_OK=PASS')
  log('PARTITE_OK=PASS')
  log('FINGERPRINT_OK=PASS')
  log('P4_01_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P4_01_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P4_01_RESULT=FAIL'))) process.exit(1)
  })
