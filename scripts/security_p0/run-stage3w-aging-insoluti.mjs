/**
 * Stage3W SG-P3-07: Aging / insoluti da residui partitario (LAB).
 * Post FA open via fiscal-journal, build aging + mastrini, assert coherence.
 * LAB-only. Never prints tokens/passwords.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPartitariStampaModel, isStampaOperativa } from '../../src/modules/contabilita/application/stampe/buildPartitariStampaModel.js'
import { buildMovimentiPerContoModel } from '../../src/modules/contabilita/application/stampe/buildMovimentiPerContoModel.js'
import {
  buildAgingInsolutiModel,
  checkAgingMastriniCoherence,
} from '../../src/modules/contabilita/application/stampe/buildAgingInsolutiModel.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API = 'http://127.0.0.1:3001/api/studio/fiscal-journal-post'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA = '72000000-0000-4000-8000-000000000012'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const OPEN_DATE = '2026-05-12'
const DUE_DATE = '2026-04-01'
const AS_OF = '2026-07-15'
const PERIOD_START = '2026-01-01'
const PERIOD_END = '2026-12-31'
const TAXABLE = 1000
const VAT = 220
const GROSS = 1220
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_AGING_INSOLUTI_P3_07_${stamp}.txt`)

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
  log('P3_07_START Aging / insoluti vs mastrini LAB')
  process.env.FISCOSIM_ISOLATED_LAB_API = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED = 'true'

  if (!isStampaOperativa('aging')) throw new Error('IS_OPERATIVO_AGING_MISSING')
  log('IS_OPERATIVO_AGING=PASS')

  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('LAB_KEYS_MISSING')
  if (env.VITE_SUPABASE_URL !== AUTH_URL) throw new Error('LAB_URL_MISMATCH')

  const password = 'SgE2eAging!' + randomBytes(8).toString('base64url')
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

  const faDoc = `SG-E2E-P307-FA-${stamp.slice(-6)}`
  const faRes = await postFiscal(token, {
    societa_id: SOCIETA_A,
    request_id: randomUUID(),
    contract_kind: 'fattura_attiva',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E P3-07 FA for aging insoluti',
    header: {
      data_registrazione: OPEN_DATE,
      data_documento: OPEN_DATE,
      numero_documento: faDoc,
      descrizione: '[SG-E2E] P3-07 FA aging',
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
        data_scadenza: DUE_DATE,
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
  const pnId = faRes.json.id

  const partitaId = psql(`
SELECT id::text FROM public.partitario
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`PARTITA_ID=${partitaId}`)
  if (!partitaId) throw new Error('PARTITA_MISSING')

  const dueDb = psql(`
SELECT coalesce(data_scadenza::text,'') FROM public.partitario
WHERE id='${partitaId}'::uuid
`)
  log(`PARTITA_DUE=${dueDb}`)
  log(`AS_OF=${AS_OF}`)

  const partitarioRows = psqlJson(`
SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.data_documento, p.id), '[]'::json)
FROM public.partitario p
WHERE p.societa_id='${SOCIETA_A}'::uuid
`)
  log(`PARTITARIO_ROWS=${Array.isArray(partitarioRows) ? partitarioRows.length : 0}`)

  const pnHeaders = psqlJson(`
SELECT coalesce(json_agg(row_to_json(h) ORDER BY h.data_registrazione, h.numero_registrazione, h.id), '[]'::json)
FROM (
  SELECT id, societa_id, numero_registrazione, data_registrazione::text AS data_registrazione,
         data_documento::text AS data_documento, numero_documento, causale_codice, descrizione,
         cliente_fornitore_nome, totale_dare, totale_avere, stato, esercizio
  FROM public.prima_nota
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND data_registrazione BETWEEN '${PERIOD_START}'::date AND '${PERIOD_END}'::date
    AND stato IN ('confermata','definitiva')
) h
`)
  const pnIds = (pnHeaders || []).map((h) => h.id)
  log(`PN_HEADERS=${pnIds.length}`)
  if (!pnIds.length) throw new Error('PN_EMPTY')

  const idList = pnIds.map((id) => sqlQuote(id)).join(',')
  const pnRighe = psqlJson(`
SELECT coalesce(json_agg(row_to_json(r) ORDER BY r.prima_nota_id, r.riga_numero, r.id), '[]'::json)
FROM (
  SELECT id, prima_nota_id, riga_numero, conto_id, conto_codice, conto_descrizione,
         descrizione_riga, importo_dare, importo_avere
  FROM public.prima_nota_righe
  WHERE prima_nota_id IN (${idList})
) r
`)
  const byPn = new Map()
  for (const row of pnRighe || []) {
    const key = String(row.prima_nota_id)
    if (!byPn.has(key)) byPn.set(key, [])
    byPn.get(key).push(row)
  }
  const entries = (pnHeaders || []).map((h) => ({
    ...h,
    righe: byPn.get(String(h.id)) || [],
  }))
  log(`PN_WITH_ROWS=${entries.filter((e) => e.righe.length).length}`)

  const aging = buildAgingInsolutiModel(partitarioRows, {
    societaId: SOCIETA_A,
    asOf: AS_OF,
    tipo: 'tutti',
  })
  log(`AGING_VALID=${aging.valid}`)
  log(`AGING_COUNT=${aging.rows.length}`)
  log(`AGING_RESIDUO=${aging.totali.residuoComplessivo}`)
  log(`AGING_BUCKETS=${JSON.stringify(aging.totali.byBucket)}`)
  log(`AGING_BLOCKERS=${aging.blockers.join('|') || 'none'}`)
  if (!aging.valid) throw new Error('AGING_INVALID')

  const faRow = aging.rows.find((r) => r.id === partitaId || r.doc === faDoc)
  if (!faRow) throw new Error('AGING_MISSING_FA')
  log(`AGING_FA_BUCKET=${faRow.bucket}`)
  log(`AGING_FA_DAYS=${faRow.daysOverdue}`)
  log(`AGING_FA_RESIDUO=${faRow.residual}`)
  if (faRow.residual !== GROSS) throw new Error('AGING_FA_RESIDUO_MISMATCH')
  if (faRow.bucket !== 'd90_plus') throw new Error('AGING_FA_BUCKET_EXPECTED_90_PLUS')
  log('AGING_MODEL=PASS')

  const partitari = buildPartitariStampaModel(partitarioRows, {
    societaId: SOCIETA_A,
    tipo: 'tutti',
    stato: 'tutti',
  })
  log(`PARTITARI_VALID=${partitari.valid}`)
  log(`PARTITARI_APERTO=${partitari.totali.totaleAperto}`)
  log(`PARTITARI_RESIDUO=${partitari.totali.residuoComplessivo}`)
  if (!partitari.valid) throw new Error('PARTITARI_INVALID')

  const mastrini = buildMovimentiPerContoModel(entries, {
    societaId: SOCIETA_A,
    periodoInizio: PERIOD_START,
    periodoFine: PERIOD_END,
  })
  log(`MASTRINI_VALID=${mastrini.valid}`)
  log(`MASTRINI_CONTI=${mastrini.conti.length}`)
  log(`MASTRINI_BLOCKERS=${mastrini.blockers.join('|') || 'none'}`)
  if (!mastrini.valid) throw new Error('MASTRINI_INVALID')

  const cliMastro = mastrini.conti.find((c) => c.contoId === CONTO_CLIENTE)
  if (!cliMastro) throw new Error('MASTRINI_MISSING_CLIENTE')
  log(`MASTRINI_CLI_SALDO=${cliMastro.saldoMovimentiPeriodo}`)
  const cliAging = aging.byConto.find((c) => c.contoId === CONTO_CLIENTE)
  log(`AGING_CLI_RESIDUO=${cliAging?.residual ?? ''}`)

  // Equivalence: aging residui aperti ≡ partitari.totaleAperto + apertura FA in mastrini.
  // Full ledger saldo may diverge (riapertura SP / pagamenti non linkati) — logged, not required.
  const coherence = checkAgingMastriniCoherence(aging, mastrini, {
    mode: 'partitario',
    partitariModel: partitari,
    requirePrimaNotaIds: [pnId],
  })
  log(`COHERENCE_MODE=${coherence.mode}`)
  log(`COHERENCE=${coherence.coherent}`)
  log(`COHERENCE_PARTITARI_EQ=${coherence.partitariEquivalence}`)
  log(`COHERENCE_COMPARED=${JSON.stringify(coherence.compared)}`)
  if (coherence.mismatches.length) {
    log(`COHERENCE_MISMATCHES=${JSON.stringify(coherence.mismatches)}`)
  }
  if (!coherence.coherent) throw new Error('AGING_MASTRINI_COHERENCE_FAIL')
  if (coherence.partitariEquivalence !== true) {
    throw new Error('AGING_PARTITARI_EQUIVALENCE_FAIL')
  }

  const ledgerProbe = checkAgingMastriniCoherence(aging, mastrini, {
    mode: 'ledger',
    contoIds: [CONTO_CLIENTE],
  })
  log(`LEDGER_PROBE_CLI=${ledgerProbe.coherent}`)
  if (ledgerProbe.mismatches.length) {
    log(`LEDGER_PROBE_NOTE=full_ledger_saldo_may_include_non_partitario_movements`)
    log(`LEDGER_PROBE_MISMATCHES=${JSON.stringify(ledgerProbe.mismatches)}`)
  }

  log('COHERENCE=PASS')
  log('P3_07_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P3_07_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P3_07_RESULT=FAIL'))) process.exit(1)
  })
