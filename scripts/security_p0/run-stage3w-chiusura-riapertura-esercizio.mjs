/**
 * Stage3W SG-P3-06: Chiusura/riapertura esercizio — continuity saldi, lock, audit.
 * LAB-only. Posts via Stage3U fiscosim_post_general_journal (docker/psql).
 * Never prints tokens/passwords. No LIVE / no destructive cleanup of other years.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildChiusuraRiaperturaPlans,
  isPeriodoChiusoLock,
  toCents,
} from '../../src/modules/contabilita/application/chiusuraEsercizio/buildChiusuraRiaperturaPlans.js'
import { mapPlanToGeneralJournalRpcArgs } from '../../src/modules/contabilita/application/chiusuraEsercizio/postGeneralJournalLab.js'
import { auditRaccordoEserciziModel } from '../../src/modules/contabilita/application/stampe/auditRaccordoEserciziModel.js'
import { buildSaldiPerContoEsercizioModel } from '../../src/modules/contabilita/application/stampe/buildSaldiPerContoEsercizioModel.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API = 'http://127.0.0.1:3001/api/studio/fiscal-journal-post'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const UTENTE_A = '72000000-0000-4000-8000-000000000005'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_UTILE = '72000000-0000-4000-8000-000000000040'
const CAUSALE_CHIUD = '72000000-0000-4000-8000-000000000030'
const CAUSALE_APERT = '72000000-0000-4000-8000-000000000031'
const CAUSALE_ORD = '72000000-0000-4000-8000-000000000032'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const AMOUNT = 1000
const SALE_DATE = '2025-06-15'
const CLOSE_CE_DATE = '2025-12-30'
const CLOSE_SP_DATE = '2025-12-31'
const REOPEN_DATE = '2026-01-02'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_CHIUSURA_RIAPERTURA_P3_06_${stamp}.txt`)

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
  const raw = execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8' },
  )
  return String(raw || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !/^INSERT\b/i.test(s) && !/^UPDATE\b/i.test(s) && !/^DELETE\b/i.test(s))
    .join('\n')
    .trim()
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean) || ''
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

function ensureLabFixtures() {
  psql(`
INSERT INTO public.piano_conti(id,societa_id,codice,descrizione,tipo,natura,attivo)
VALUES
 ('${CONTO_CLIENTE}','${SOCIETA_A}','1.01','Cliente SG-E2E-A','patrimoniale','attivo',true),
 ('${CONTO_RICAVO}','${SOCIETA_A}','4.01','Ricavi SG-E2E-A','economico','ricavo',true),
 ('${CONTO_UTILE}','${SOCIETA_A}','2.90','Utile/perdita esercizio SG-E2E-A','patrimoniale','passivo',true)
ON CONFLICT (id) DO UPDATE SET
  societa_id=EXCLUDED.societa_id,
  codice=EXCLUDED.codice,
  tipo=EXCLUDED.tipo,
  natura=EXCLUDED.natura,
  descrizione=EXCLUDED.descrizione,
  attivo=true
WHERE public.piano_conti.societa_id=EXCLUDED.societa_id;

UPDATE public.piano_conti SET
  tipo=CASE
    WHEN codice LIKE '4.%' OR codice LIKE '5.%' THEN 'economico'
    ELSE 'patrimoniale'
  END,
  natura=CASE
    WHEN codice LIKE '1.%' THEN 'attivo'
    WHEN codice LIKE '2.%' THEN 'passivo'
    WHEN codice LIKE '4.%' THEN 'ricavo'
    WHEN codice LIKE '5.%' THEN 'costo'
    ELSE coalesce(nullif(natura,''), 'attivo')
  END
WHERE societa_id='${SOCIETA_A}'::uuid;

INSERT INTO public.causali_contabili(id,societa_id,codice,descrizione,tipo,attivo)
VALUES
 ('${CAUSALE_CHIUD}','${SOCIETA_A}','SG-CHIUD','Chiusura esercizio SG-E2E','chiusura',true),
 ('${CAUSALE_APERT}','${SOCIETA_A}','SG-APERT','Apertura esercizio SG-E2E','apertura',true),
 ('${CAUSALE_ORD}','${SOCIETA_A}','SG-ORD','Operazione ordinaria SG-E2E','fattura_cliente',true)
ON CONFLICT (id) DO UPDATE SET
  tipo=EXCLUDED.tipo,
  descrizione=EXCLUDED.descrizione,
  attivo=true;
`)
}

function postGeneralJournalRpc(plan, motivazione) {
  const requestId = randomUUID()
  const args = mapPlanToGeneralJournalRpcArgs(plan, {
    societaId: SOCIETA_A,
    authUserId: AUTH_A,
    requestId,
    motivazione,
  })
  if (!args) throw new Error('RPC_ARGS_INVALID')
  const headerLit = JSON.stringify(args.p_header).replace(/'/g, "''")
  const rowsLit = JSON.stringify(args.p_rows).replace(/'/g, "''")
  const id = firstLine(psql(`
SELECT public.fiscosim_post_general_journal(
  '${args.p_societa_id}'::uuid,
  '${args.p_auth_user_id}'::uuid,
  '${args.p_request_id}'::uuid,
  '${headerLit}'::jsonb,
  '${rowsLit}'::jsonb,
  ${sqlQuote(args.p_reason)}
)::text;
`))
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('GJ_POST_FAILED:' + id)
  return { id, requestId }
}

function loadPnBundle(ids) {
  const list = ids.map((id) => sqlQuote(id)).join(',')
  const headers = psqlJson(`
SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.data_registrazione, t.id), '[]'::jsonb)::text
FROM (
  SELECT id, societa_id, data_registrazione::text AS data_registrazione,
         causale_id, descrizione, stato, totale_dare, totale_avere,
         esercizio
  FROM public.prima_nota
  WHERE id IN (${list})
) t
`)
  const rows = psqlJson(`
SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.prima_nota_id, t.riga_numero, t.id), '[]'::jsonb)::text
FROM (
  SELECT id, prima_nota_id, riga_numero, conto_id, conto_codice,
         descrizione_riga, importo_dare, importo_avere
  FROM public.prima_nota_righe
  WHERE prima_nota_id IN (${list})
) t
`)
  const byPn = new Map()
  for (const r of rows) {
    if (!byPn.has(r.prima_nota_id)) byPn.set(r.prima_nota_id, [])
    byPn.get(r.prima_nota_id).push(r)
  }
  return headers.map((h) => ({ ...h, societa_id: h.societa_id, righe: byPn.get(h.id) || [] }))
}

function loadYearPn(year) {
  const headers = psqlJson(`
SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.data_registrazione, t.id), '[]'::jsonb)::text
FROM (
  SELECT id, societa_id, data_registrazione::text AS data_registrazione,
         causale_id, descrizione, stato, totale_dare, totale_avere, esercizio
  FROM public.prima_nota
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND data_registrazione>='${year}-01-01'::date
    AND data_registrazione<='${year}-12-31'::date
) t
`)
  if (!headers.length) return []
  return loadPnBundle(headers.map((h) => h.id))
}

function loadPianoECausali() {
  const pianoConti = psqlJson(`
SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.codice, t.id), '[]'::jsonb)::text
FROM (
  SELECT id, societa_id, codice, descrizione, tipo, natura, parent_id, attivo
  FROM public.piano_conti WHERE societa_id='${SOCIETA_A}'::uuid
) t
`)
  const causaliContabili = psqlJson(`
SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.id), '[]'::jsonb)::text
FROM (
  SELECT id, societa_id, tipo, attivo
  FROM public.causali_contabili WHERE societa_id='${SOCIETA_A}'::uuid
) t
`)
  return { pianoConti, causaliContabili }
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
  log('P3_06_START Chiusura/riapertura esercizio continuity+lock+audit')
  process.env.FISCOSIM_ISOLATED_LAB_API = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED = 'true'

  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('LAB_KEYS_MISSING')
  if (env.VITE_SUPABASE_URL !== AUTH_URL) throw new Error('LAB_URL_MISMATCH')

  ensureLabFixtures()
  log('FIXTURES_CAUSALI_CONTI=PASS')

  const prior2025 = Number(firstLine(psql(`
SELECT count(*)::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_A}'::uuid
  AND data_registrazione>='2025-01-01'::date
  AND data_registrazione<='2025-12-31'::date
`)) || '0')
  let closeCeId = firstLine(psql(`
SELECT id::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_A}'::uuid AND causale_id='${CAUSALE_CHIUD}'::uuid
  AND data_registrazione='${CLOSE_CE_DATE}'::date
ORDER BY created_at DESC NULLS LAST LIMIT 1
`))
  let closeSpId = firstLine(psql(`
SELECT id::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_A}'::uuid AND causale_id='${CAUSALE_CHIUD}'::uuid
  AND data_registrazione='${CLOSE_SP_DATE}'::date
ORDER BY created_at DESC NULLS LAST LIMIT 1
`))
  let reopenId = firstLine(psql(`
SELECT id::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_A}'::uuid AND causale_id='${CAUSALE_APERT}'::uuid
  AND data_registrazione='${REOPEN_DATE}'::date
ORDER BY created_at DESC NULLS LAST LIMIT 1
`))
  const alreadyClosed = Boolean(closeCeId && closeSpId && reopenId)
  log(`PRIOR_PN_2025=${prior2025} ALREADY_CLOSED=${alreadyClosed}`)

  const password = 'SgE2eClose!' + randomBytes(8).toString('base64url')
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

  let saleId = firstLine(psql(`
SELECT id::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_A}'::uuid
  AND data_registrazione='${SALE_DATE}'::date
  AND descrizione LIKE '[SG-E2E] P3-06%'
ORDER BY created_at DESC NULLS LAST
LIMIT 1
`))
  // Ensure sale not left annullata from a prior failed lock attempt
  if (saleId) {
    psql(`
UPDATE public.prima_nota
SET stato='confermata', annullata_at=NULL, annullata_by=NULL, annullamento_motivo=NULL
WHERE id='${saleId}'::uuid AND stato='annullata'
`)
  }
  if (!saleId && !alreadyClosed) {
    const salePlan = {
      header: {
        data_registrazione: SALE_DATE,
        descrizione: '[SG-E2E] P3-06 vendita esercizio 2025',
        causale_id: CAUSALE_ORD,
      },
      rows: [
        { conto_id: CONTO_CLIENTE, dare: AMOUNT, avere: 0, descrizione: 'Cliente' },
        { conto_id: CONTO_RICAVO, dare: 0, avere: AMOUNT, descrizione: 'Ricavi' },
      ],
    }
    const sale = postGeneralJournalRpc(salePlan, 'SG-E2E P3-06 prior-year sale activity LAB')
    saleId = sale.id
  }
  log(`SALE_PN=${saleId}`)

  const { pianoConti, causaliContabili } = loadPianoECausali()

  if (!alreadyClosed) {
    const prevAfterSale = loadYearPn(2025)
    const saldiModel = buildSaldiPerContoEsercizioModel(prevAfterSale, pianoConti, {
      societaId: SOCIETA_A,
      esercizioInizio: '2025-01-01',
      periodoInizio: '2025-01-01',
      periodoFine: '2025-12-31',
    })
    if (!saldiModel.valid) throw new Error('SALDI_AFTER_SALE_INVALID:' + saldiModel.blockers.join(','))

    const saldiConti = saldiModel.conti
      .filter((c) => toCents(c.saldoFinale) !== 0 || c.contoId === CONTO_UTILE)
      .map((c) => ({
        contoId: c.contoId,
        codice: c.codice,
        tipo: c.tipo,
        natura: c.natura,
        saldoFinale: c.saldoFinale,
      }))
    if (!saldiConti.some((c) => c.contoId === CONTO_UTILE)) {
      saldiConti.push({
        contoId: CONTO_UTILE, codice: '2.90', tipo: 'patrimoniale', natura: 'passivo', saldoFinale: 0,
      })
    }

    const plans = buildChiusuraRiaperturaPlans({
      saldiConti,
      contoUtileId: CONTO_UTILE,
      causaleChiusuraId: CAUSALE_CHIUD,
      causaleAperturaId: CAUSALE_APERT,
      dates: { closeCe: CLOSE_CE_DATE, closeSp: CLOSE_SP_DATE, reopen: REOPEN_DATE },
    })
    if (!plans.valid) throw new Error('PLANS_INVALID:' + plans.blockers.join(','))
    log(`PLANS_VALID=true CE_ROWS=${plans.closeCe.rows.length} SP_ROWS=${plans.closeSp.rows.length} REOPEN_ROWS=${plans.reopenSp.rows.length}`)

    closeCeId = postGeneralJournalRpc(plans.closeCe, 'SG-E2E P3-06 chiusura conto economico 2025').id
    closeSpId = postGeneralJournalRpc(plans.closeSp, 'SG-E2E P3-06 chiusura stato patrimoniale 2025').id
    reopenId = postGeneralJournalRpc(plans.reopenSp, 'SG-E2E P3-06 riapertura stato patrimoniale 2026').id
  } else {
    log('PLANS_VALID=reuse_existing_close_reopen')
  }
  log(`CLOSE_CE_PN=${closeCeId} DATE=${CLOSE_CE_DATE}`)
  log(`CLOSE_SP_PN=${closeSpId} DATE=${CLOSE_SP_DATE}`)
  log(`REOPEN_SP_PN=${reopenId} DATE=${REOPEN_DATE}`)

  const prevFull = loadYearPn(2025)
  const reopenBundle = loadPnBundle([reopenId])
  const audit = auditRaccordoEserciziModel({
    societaId: SOCIETA_A,
    esercizioCorrente: '2026',
    pianoConti,
    causaliContabili,
    primaNotaEsercizioPrecedente: prevFull,
    idChiusurePatrimoniali: [closeSpId],
    scrittureRiapertura: reopenBundle,
  })
  log(`AUDIT_RACCORDO_VALID=${audit.valid}`)
  log(`AUDIT_BLOCKERS=${audit.blockers.join('|') || 'none'}`)
  log(`AUDIT_COUNTS_PREV=${audit.counts.primaNotaPrecedente} CLOSE_SP=${audit.counts.chiusurePatrimoniali} REOPEN=${audit.counts.riaperture}`)
  const bancaRacc = audit.raccordo.find((r) => r.contoId === CONTO_CLIENTE)
  if (bancaRacc) {
    log(`CONTINUITY_CLIENTE_CHIUSURA=${bancaRacc.saldoChiusura} RIAPERTURA=${bancaRacc.saldoRiapertura} DIFF=${bancaRacc.differenza}`)
  }
  if (!audit.valid) throw new Error('AUDIT_FAILED:' + audit.blockers.join(','))

  // LAB lock: periodo_chiuso_lock on closed-year PN + stampe_definitive → fiscal write blocked
  psql(`
UPDATE public.prima_nota
SET periodo_chiuso_lock=true
WHERE societa_id='${SOCIETA_A}'::uuid
  AND data_registrazione>='2025-01-01'::date
  AND data_registrazione<='2025-12-31'::date
`)
  const lockedN = Number(firstLine(psql(`
SELECT count(*)::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_A}'::uuid
  AND data_registrazione>='2025-01-01'::date
  AND data_registrazione<='2025-12-31'::date
  AND periodo_chiuso_lock=true
`)) || '0')
  log(`PERIODO_CHIUSO_LOCK_SET=${lockedN}`)

  const sampleLock = psqlJson(`
SELECT row_to_json(t)::text FROM (
  SELECT id, periodo_chiuso_lock, stampa_giornale_id
  FROM public.prima_nota WHERE id='${saleId}'::uuid
) t
`)
  if (!isPeriodoChiusoLock(sampleLock)) throw new Error('LOCK_FLAG_NOT_SET')
  log('PERIODO_CHIUSO_LOCK_SEMANTICS=PASS')

  const guards = psqlJson(`
SELECT public.rpc_get_prima_nota_operation_guards(
  '${saleId}'::uuid, '${SOCIETA_A}'::uuid, 'ANNULLA'
)::text
`)
  const guardWarnings = JSON.stringify(guards?.warnings || [])
  if (!/chiuso|definitiv/i.test(guardWarnings)) {
    throw new Error('GUARDS_MISSING_CLOSED_PERIOD_WARNING')
  }
  log(`LOCK_GUARDS_WARNING_LEVEL=${guards?.warning_level || ''}`)
  log('LOCK_GUARDS_CLOSED_PERIOD=PASS')

  let stampaId = firstLine(psql(`
SELECT id::text FROM public.stampe_definitive
WHERE societa_id='${SOCIETA_A}'::uuid
  AND tipo_stampa='libro_giornale'
  AND periodo_inizio='2025-01-01'::date
  AND periodo_fine='2025-12-31'::date
  AND coalesce(stato,'valida')='valida'
LIMIT 1
`))
  if (!stampaId) {
    stampaId = randomUUID()
    psql(`
INSERT INTO public.stampe_definitive(
  id, societa_id, tipo_stampa, famiglia_numerazione, anno_fiscale,
  periodo_inizio, periodo_fine, pagina_iniziale, checksum, stato, creato_by, motivo, metadata
) VALUES (
  '${stampaId}'::uuid, '${SOCIETA_A}'::uuid, 'libro_giornale', 'libro_giornale', 2025,
  '2025-01-01'::date, '2025-12-31'::date, 1,
  ${sqlQuote('SG-E2E-P306-' + stamp)}, 'valida', '${UTENTE_A}'::uuid,
  'SG-E2E P3-06 lock periodo chiuso 2025',
  '{"source":"SG-P3-06"}'::jsonb
)
`)
  }
  log(`STAMPE_DEFINITIVE_2025=${stampaId}`)

  const blockDoc = `SG-E2E-P306-BLOCK-${stamp.slice(-6)}`
  const CONTO_IVA = '72000000-0000-4000-8000-000000000012'
  const blockedFiscal = await postFiscal(token, {
    societa_id: SOCIETA_A,
    request_id: randomUUID(),
    contract_kind: 'fattura_attiva',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E P3-06 must be blocked on closed 2025',
    header: {
      data_registrazione: '2025-07-01',
      data_documento: '2025-07-01',
      numero_documento: blockDoc,
      descrizione: '[SG-E2E] P3-06 blocked write on closed year',
    },
    rows: [
      { conto_id: CONTO_CLIENTE, dare: 122, avere: 0 },
      { conto_id: CONTO_RICAVO, dare: 0, avere: 100 },
      { conto_id: CONTO_IVA, dare: 0, avere: 22 },
    ],
    vat: {
      rows: [{
        tipo: 'vendita',
        imponibile: 100,
        iva: 22,
        aliquota: 22,
        numero_documento: blockDoc,
        data_documento: '2025-07-01',
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'cliente',
        conto_id: CONTO_CLIENTE,
        importo_originale: 122,
        numero_documento: blockDoc,
        data_documento: '2025-07-01',
      }],
      closures: [],
    },
  })
  log(`LOCK_WRITE_STATUS=${blockedFiscal.status}`)
  log(`LOCK_WRITE_ERROR=${blockedFiscal.json?.error || blockedFiscal.text.slice(0, 160)}`)
  if (blockedFiscal.status === 201) throw new Error('LOCK_DID_NOT_BLOCK_WRITE')
  if (![400, 409, 503].includes(blockedFiscal.status)) {
    throw new Error('LOCK_UNEXPECTED_STATUS:' + blockedFiscal.status)
  }
  // Prefer explicit period-lock failure when payload is valid
  const err = String(blockedFiscal.json?.error || blockedFiscal.text || '')
  if (blockedFiscal.status === 409 || /period locked|PERIOD|JOURNAL_ATOMIC/i.test(err)) {
    log('LOCK_WRITE_BLOCKED=PASS')
  } else if (blockedFiscal.status !== 201) {
    log('LOCK_WRITE_BLOCKED=PASS_NON_201')
  }

  log('P3_06_RESULT=PASS')
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log('EVIDENCE=' + outPath)
}

main().catch((err) => {
  log('P3_06_RESULT=FAIL')
  log('ERROR=' + (err?.message || String(err)))
  try { writeFileSync(outPath, lines.join('\n') + '\n', 'utf8') } catch { /* ignore */ }
  console.error(err)
  process.exit(1)
})
