/**
 * Stage3W SG-P3-04: Fascicolo cliente PDF/HTML unico di fine periodo (LAB).
 * Builds one file from canonical PN/partitario models + content hash.
 * LAB-only. Never prints tokens/passwords.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID, webcrypto } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPartitariStampaModel } from '../../src/modules/contabilita/application/stampe/buildPartitariStampaModel.js'
import { buildMovimentiPerContoModel } from '../../src/modules/contabilita/application/stampe/buildMovimentiPerContoModel.js'
import { buildSaldiPerContoEsercizioModel } from '../../src/modules/contabilita/application/stampe/buildSaldiPerContoEsercizioModel.js'
import { buildLibroGiornaleModel } from '../../src/modules/contabilita/application/stampe/buildLibroGiornaleModel.js'
import { isStampaOperativa } from '../../src/modules/contabilita/application/stampe/buildPartitariStampaModel.js'
import {
  buildFascicoloClientePeriodo,
  fascicoloHtmlToBytes,
} from '../../src/modules/contabilita/application/stampe/buildFascicoloClientePeriodo.js'
import { hashStampaContenuto } from '../../src/modules/contabilita/application/stampe/hashStampaContenuto.js'

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
const TAXABLE = 1000
const VAT = 220
const GROSS = 1220
const MOCK_FORBIDDEN = [235870, 412350, 857170, 12350]
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_FASCICOLO_P3_04_${stamp}.txt`)
const fascicoloOutPath = join(process.cwd(), 'REPORT', `STAGE3W_FASCICOLO_P3_04_${stamp}.html`)

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

function enrichPianoContiNatura(rows) {
  return (Array.isArray(rows) ? rows : []).map((c) => {
    if (c?.natura) return c
    const code = String(c?.codice || '')
    const tipo = String(c?.tipo || '').toLowerCase()
    let natura = ''
    if (tipo === 'patrimoniale') natura = code.startsWith('1') ? 'attivo' : 'passivo'
    else if (tipo === 'economico') natura = (code.startsWith('5') || code.startsWith('6')) ? 'costo' : 'ricavo'
    return { ...c, natura }
  })
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

function assertNoMockAmounts(model, label) {
  const blob = JSON.stringify(model)
  for (const forbidden of MOCK_FORBIDDEN) {
    if (blob.includes(String(forbidden))) {
      throw new Error(`${label}_MOCK_AMOUNT_${forbidden}`)
    }
  }
}

async function main() {
  log('P3_04_START Fascicolo cliente unico fine periodo LAB')
  process.env.FISCOSIM_ISOLATED_LAB_API = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED = 'true'

  if (!isStampaOperativa('fascicolo')) throw new Error('IS_OPERATIVO_MISSING_fascicolo')
  log('IS_OPERATIVO=PASS')

  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('LAB_KEYS_MISSING')
  if (env.VITE_SUPABASE_URL !== AUTH_URL) throw new Error('LAB_URL_MISMATCH')

  const password = 'SgE2eFasc!' + randomBytes(8).toString('base64url')
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

  const faDoc = `SG-E2E-P304-FA-${stamp.slice(-6)}`
  const faRes = await postFiscal(token, {
    societa_id: SOCIETA_A,
    request_id: randomUUID(),
    contract_kind: 'fattura_attiva',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E P3-04 FA for fascicolo cliente',
    header: {
      data_registrazione: OPEN_DATE,
      data_documento: OPEN_DATE,
      numero_documento: faDoc,
      descrizione: '[SG-E2E] P3-04 FA fascicolo',
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
  const pnId = faRes.json.id

  const partitaId = psql(`
SELECT id::text FROM public.partitario
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`PARTITA_ID=${partitaId}`)
  if (!partitaId) throw new Error('PARTITA_MISSING')

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
    AND data_registrazione BETWEEN '2026-01-01'::date AND '2026-12-31'::date
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

  const pianoRaw = psqlJson(`
SELECT coalesce(json_agg(row_to_json(c) ORDER BY c.codice), '[]'::json)
FROM (
  SELECT id, societa_id, codice, descrizione, tipo, natura, parent_id
  FROM public.piano_conti
  WHERE societa_id='${SOCIETA_A}'::uuid AND attivo IS TRUE
) c
`)
  const pianoConti = enrichPianoContiNatura(pianoRaw)
  log(`PIANO_CONTI=${pianoConti.length}`)

  const partitari = buildPartitariStampaModel(partitarioRows, {
    societaId: SOCIETA_A,
    tipo: 'tutti',
    stato: 'tutti',
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  })
  log(`PARTITARI_VALID=${partitari.valid}`)
  log(`PARTITARI_COUNT=${partitari.rows.length}`)
  log(`PARTITARI_BASIS=${partitari.basis}`)
  log(`PARTITARI_BLOCKERS=${partitari.blockers.join('|') || 'none'}`)
  assertNoMockAmounts(partitari, 'PARTITARI')
  if (!partitari.valid) throw new Error('PARTITARI_INVALID')
  if (!partitari.rows.some((r) => r.id === partitaId || r.doc === faDoc)) {
    throw new Error('PARTITARI_MISSING_FA')
  }
  if (partitari.rows.some((r) => Number(r.original) === 2440 && r.subject === 'Alfa S.r.l.')) {
    throw new Error('PARTITARI_MOCK_SUBJECT')
  }
  log('PARTITARI_MODEL=PASS')

  const mastrini = buildMovimentiPerContoModel(entries, {
    societaId: SOCIETA_A,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  })
  log(`MASTRINI_VALID=${mastrini.valid}`)
  log(`MASTRINI_CONTI=${mastrini.conti.length}`)
  log(`MASTRINI_PN=${mastrini.primaNotaIncluse}`)
  log(`MASTRINI_BLOCKERS=${mastrini.blockers.join('|') || 'none'}`)
  assertNoMockAmounts(mastrini, 'MASTRINI')
  if (!mastrini.valid) throw new Error('MASTRINI_INVALID')
  if (!mastrini.conti.some((c) => c.contoId === CONTO_CLIENTE || c.codice === '1.01')) {
    throw new Error('MASTRINI_MISSING_CLIENTE')
  }
  if (!entries.some((e) => e.id === pnId)) throw new Error('MASTRINI_PN_NOT_IN_INPUT')
  log('MASTRINI_MODEL=PASS')

  const bilancio = buildSaldiPerContoEsercizioModel(entries, pianoConti, {
    societaId: SOCIETA_A,
    esercizioInizio: '2026-01-01',
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  })
  log(`BILANCIO_VALID=${bilancio.valid}`)
  log(`BILANCIO_CONTI=${bilancio.conti.length}`)
  log(`BILANCIO_QUADRATO=${bilancio.totali?.quadrato}`)
  log(`BILANCIO_BLOCKERS=${bilancio.blockers.join('|') || 'none'}`)
  assertNoMockAmounts(bilancio, 'BILANCIO')
  if (!bilancio.valid) throw new Error('BILANCIO_INVALID')
  if (!bilancio.conti.some((c) => c.contoId === CONTO_CLIENTE || c.codice === '1.01')) {
    throw new Error('BILANCIO_MISSING_CLIENTE')
  }
  log('BILANCIO_MODEL=PASS')

  const giornale = buildLibroGiornaleModel(entries)
  log(`GIORNALE_ENTRIES=${giornale.entries?.length || 0}`)

  const fascicolo = buildFascicoloClientePeriodo({
    societa: { id: SOCIETA_A, denominazione: 'SG E2E A', partita_iva: '00000000001' },
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
    giornaleModel: giornale,
    partitariModel: partitari,
    mastriniModel: mastrini,
    bilancioModel: bilancio,
  })
  log(`FASCICOLO_OK=${fascicolo.ok}`)
  log(`FASCICOLO_FILE=${fascicolo.fileName}`)
  log(`FASCICOLO_SECTIONS=${fascicolo.sections.filter((s) => s.included).map((s) => s.id).join('|')}`)
  log(`FASCICOLO_BLOCKERS=${fascicolo.blockers.join('|') || 'none'}`)
  assertNoMockAmounts({ html: fascicolo.html }, 'FASCICOLO')
  if (!fascicolo.ok) throw new Error('FASCICOLO_INVALID')
  if (!fascicolo.html.includes(faDoc) && !fascicolo.html.includes('Libro Giornale')) {
    throw new Error('FASCICOLO_CONTENT_MISSING')
  }
  writeFileSync(fascicoloOutPath, fascicolo.html, 'utf8')
  log(`FASCICOLO_WRITTEN=${fascicoloOutPath}`)

  const bytes = fascicoloHtmlToBytes(fascicolo.html)
  const digest = await hashStampaContenuto({
    fileBytes: bytes,
    mimeType: 'text/html',
    societaId: SOCIETA_A,
    tipoStampa: 'fascicolo',
    annoFiscale: '2026',
    periodoInizio: '2026-01-01',
    periodoFine: '2026-12-31',
  }, { subtle: webcrypto.subtle })
  log(`FASCICOLO_HASH=${digest}`)
  log(`FASCICOLO_BYTES=${bytes.byteLength}`)
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('FASCICOLO_HASH_INVALID')
  if (bytes.byteLength < 200) throw new Error('FASCICOLO_TOO_SMALL')

  log('P3_04_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P3_04_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P3_04_RESULT=FAIL'))) process.exit(1)
  })
