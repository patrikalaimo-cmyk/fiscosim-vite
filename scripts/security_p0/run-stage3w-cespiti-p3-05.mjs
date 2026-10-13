/**
 * Stage3W SG-P3-05: Cespiti operativi + quote (LAB).
 * Posts acquisition PN once, bridges scheda cespite + proposed quotes,
 * asserts bridge does NOT invent a second Prima Nota. LAB-only.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bridgeCespiteFromExistingPrimaNota } from '../../src/modules/contabilita/application/cespiti/bridgeCespiteFromExistingPrimaNota.js'
import {
  calculatePianoAmmortamento,
  proposeQuotaAmmortamento,
} from '../../src/modules/contabilita/domain/cespiti/calculatePianoAmmortamento.js'
import { extractPrimaNotaIdFromCespiteNote } from '../../src/modules/contabilita/domain/cespiti/cespitePrimaNotaLink.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API = 'http://127.0.0.1:3001/api/studio/fiscal-journal-post'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_COSTO = '72000000-0000-4000-8000-000000000014'
const CONTO_IVA = '72000000-0000-4000-8000-000000000015'
const CONTO_FORN = '72000000-0000-4000-8000-000000000016'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const OPEN_DATE = '2026-06-18'
const TAXABLE = 2500
const VAT = 550
const GROSS = 3050
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_CESPITI_P3_05_${stamp}.txt`)

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

/** LAB db adapter: postgres via docker/psql (bypass RLS for evidence writes). */
function makePsqlDb() {
  return {
    from(table) {
      if (table === 'beni_ammortizzabili') {
        return {
          select() {
            return {
              ilike(col, pattern) {
                return {
                  async maybeSingle() {
                    const like = String(pattern || '').replace(/%/g, '')
                    const row = psql(`
SELECT coalesce(row_to_json(t), 'null') FROM (
  SELECT id, cliente_id, cliente_nome, descrizione, categoria,
         data_acquisto::text AS data_acquisto, costo_storico, aliquota_ammortamento,
         fondo_ammortamento, valore_residuo, anni_vita_utile, note, attivo
  FROM public.beni_ammortizzabili
  WHERE ${col} ILIKE ${sqlQuote(pattern)}
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1
) t
`)
                    if (!row || row === 'null') return { data: null, error: null }
                    const data = JSON.parse(row)
                    if (!String(data.note || '').includes(like)) return { data: null, error: null }
                    return { data, error: null }
                  },
                }
              },
            }
          },
          insert(rows) {
            const row = rows[0]
            return {
              async select() {
                const id = firstLine(psql(`
INSERT INTO public.beni_ammortizzabili (
  cliente_id, cliente_nome, descrizione, categoria, data_acquisto,
  costo_storico, aliquota_ammortamento, fondo_ammortamento, valore_residuo,
  anni_vita_utile, note, attivo
) VALUES (
  ${row.cliente_id ? sqlQuote(row.cliente_id) + '::uuid' : 'NULL'},
  ${sqlQuote(row.cliente_nome || '')},
  ${sqlQuote(row.descrizione || '')},
  ${sqlQuote(row.categoria || 'Attrezzatura')},
  ${sqlQuote(row.data_acquisto)}::date,
  ${Number(row.costo_storico)},
  ${Number(row.aliquota_ammortamento)},
  ${Number(row.fondo_ammortamento || 0)},
  ${Number(row.valore_residuo)},
  ${Number(row.anni_vita_utile || 5)},
  ${sqlQuote(row.note || '')},
  true
)
RETURNING id::text
`))
                return {
                  data: [{ id, ...row }],
                  error: /^[0-9a-f-]{36}$/i.test(id) ? null : new Error('INSERT_BENE_FAILED:' + id),
                }
              },
            }
          },
        }
      }
      if (table === 'quote_ammortamento') {
        return {
          async upsert(rows) {
            for (const r of rows) {
              psql(`
INSERT INTO public.quote_ammortamento (bene_id, anno, quota_annua, fondo_progressivo, valore_residuo)
VALUES (${sqlQuote(r.bene_id)}::uuid, ${Number(r.anno)}, ${Number(r.quota_annua)}, ${Number(r.fondo_progressivo)}, ${Number(r.valore_residuo)})
ON CONFLICT (bene_id, anno) DO UPDATE SET
  quota_annua=EXCLUDED.quota_annua,
  fondo_progressivo=EXCLUDED.fondo_progressivo,
  valore_residuo=EXCLUDED.valore_residuo
`)
            }
            return { data: rows, error: null }
          },
        }
      }
      if (table === 'prima_nota') {
        throw new Error('BRIDGE_MUST_NOT_TOUCH_PRIMA_NOTA')
      }
      throw new Error('Unexpected table: ' + table)
    },
  }
}

async function main() {
  log('P3_05_START Cespiti operativi + quote LAB (bridge non duplica PN)')
  process.env.FISCOSIM_ISOLATED_LAB_API = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED = 'true'

  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('LAB_KEYS_MISSING')
  if (env.VITE_SUPABASE_URL !== AUTH_URL) throw new Error('LAB_URL_MISMATCH')

  const password = 'SgE2eCesp!' + randomBytes(8).toString('base64url')
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

  const pnBefore = Number(psql(`
SELECT count(*)::text FROM public.prima_nota WHERE societa_id='${SOCIETA_A}'::uuid
`) || '0')
  log(`PN_COUNT_BEFORE=${pnBefore}`)

  const fpDoc = `SG-E2E-P305-FP-${stamp.slice(-6)}`
  const fpRes = await postFiscal(token, {
    societa_id: SOCIETA_A,
    request_id: randomUUID(),
    contract_kind: 'fattura_passiva',
    source_module: 'import_contabilita',
    motivazione: 'SG-E2E P3-05 acquisition PN for cespite bridge',
    header: {
      data_registrazione: OPEN_DATE,
      data_documento: OPEN_DATE,
      numero_documento: fpDoc,
      descrizione: '[SG-E2E] P3-05 FP cespite acquisition',
    },
    rows: [
      { conto_id: CONTO_COSTO, dare: TAXABLE, avere: 0 },
      { conto_id: CONTO_IVA, dare: VAT, avere: 0 },
      { conto_id: CONTO_FORN, dare: 0, avere: GROSS },
    ],
    vat: {
      rows: [{
        tipo: 'acquisto',
        imponibile: TAXABLE,
        iva: VAT,
        aliquota: 22,
        numero_documento: fpDoc,
        data_documento: OPEN_DATE,
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'fornitore',
        conto_id: CONTO_FORN,
        importo_originale: GROSS,
        numero_documento: fpDoc,
        data_documento: OPEN_DATE,
      }],
      closures: [],
    },
  })
  log(`FP_STATUS=${fpRes.status}`)
  log(`FP_PN=${fpRes.json?.id || ''}`)
  if (fpRes.status !== 201 || !fpRes.json?.id) {
    log(`FP_BODY=${(fpRes.text || '').slice(0, 400)}`)
    throw new Error('FP_ACQUISITION_FAILED')
  }
  const acquisitionPnId = fpRes.json.id

  const pnAfterPost = Number(psql(`
SELECT count(*)::text FROM public.prima_nota WHERE societa_id='${SOCIETA_A}'::uuid
`) || '0')
  log(`PN_COUNT_AFTER_ACQUISITION=${pnAfterPost}`)
  if (pnAfterPost !== pnBefore + 1) throw new Error('PN_ACQUISITION_COUNT_MISMATCH')

  const db = makePsqlDb()
  const first = await bridgeCespiteFromExistingPrimaNota({
    db,
    primaNotaId: acquisitionPnId,
    source: 'Import Contabilità',
    descrizione: 'Attrezzatura studio SG-E2E P3-05',
    categoria: 'Attrezzatura',
    dataAcquisto: OPEN_DATE,
    costoStorico: TAXABLE,
    aliquotaAmmortamento: 20,
    clienteId: null,
    clienteNome: 'SG E2E A',
    proposeQuotes: true,
    quoteAnno: 2026,
    persistQuotes: true,
  })
  log(`BRIDGE1_CREATED=${first.created}`)
  log(`BRIDGE1_DUP=${first.duplicatePrevented}`)
  log(`BRIDGE1_PN_CREATED=${first.pnCreated}`)
  log(`BRIDGE1_LINKED_PN=${first.linkedPrimaNotaId}`)
  log(`BRIDGE1_BENE_ID=${first.bene?.id || ''}`)
  log(`BRIDGE1_QUOTES_OK=${Boolean(first.quotesProposed?.piano?.ok)}`)
  log(`BRIDGE1_QUOTA_2026=${first.quotesProposed?.quota?.quota_annua ?? ''}`)
  log(`BRIDGE1_QUOTES_PERSISTED=${first.quotesPersisted}`)
  if (first.error) throw new Error('BRIDGE1_ERROR: ' + (first.error.message || first.error))
  if (!first.created) throw new Error('BRIDGE1_EXPECTED_CREATE')
  if (first.pnCreated) throw new Error('BRIDGE1_INVENTED_PN')
  if (first.linkedPrimaNotaId !== acquisitionPnId) throw new Error('BRIDGE1_LINK_MISMATCH')
  if (extractPrimaNotaIdFromCespiteNote(first.bene?.note) !== acquisitionPnId) {
    throw new Error('BRIDGE1_NOTE_LINK_MISSING')
  }

  const pnAfterBridge1 = Number(psql(`
SELECT count(*)::text FROM public.prima_nota WHERE societa_id='${SOCIETA_A}'::uuid
`) || '0')
  log(`PN_COUNT_AFTER_BRIDGE1=${pnAfterBridge1}`)
  if (pnAfterBridge1 !== pnAfterPost) throw new Error('BRIDGE1_DUPLICATED_PN')

  const second = await bridgeCespiteFromExistingPrimaNota({
    db,
    primaNotaId: acquisitionPnId,
    source: 'Import Contabilità',
    descrizione: 'Attrezzatura studio SG-E2E P3-05',
    dataAcquisto: OPEN_DATE,
    costoStorico: TAXABLE,
    aliquotaAmmortamento: 20,
    proposeQuotes: true,
    persistQuotes: false,
  })
  log(`BRIDGE2_CREATED=${second.created}`)
  log(`BRIDGE2_DUP=${second.duplicatePrevented}`)
  log(`BRIDGE2_PN_CREATED=${second.pnCreated}`)
  if (!second.duplicatePrevented || second.created) throw new Error('BRIDGE2_SHOULD_DEDUPE')
  if (second.pnCreated) throw new Error('BRIDGE2_INVENTED_PN')

  const pnAfterBridge2 = Number(psql(`
SELECT count(*)::text FROM public.prima_nota WHERE societa_id='${SOCIETA_A}'::uuid
`) || '0')
  log(`PN_COUNT_AFTER_BRIDGE2=${pnAfterBridge2}`)
  if (pnAfterBridge2 !== pnAfterPost) throw new Error('BRIDGE2_DUPLICATED_PN')

  const beneCount = Number(psql(`
SELECT count(*)::text FROM public.beni_ammortizzabili
WHERE note ILIKE ${sqlQuote('%ID prima nota: ' + acquisitionPnId + '%')}
`) || '0')
  log(`BENE_LINKED_COUNT=${beneCount}`)
  if (beneCount !== 1) throw new Error('BENE_DEDUP_FAILED')

  const quoteCount = Number(psql(`
SELECT count(*)::text FROM public.quote_ammortamento
WHERE bene_id='${first.bene.id}'::uuid
`) || '0')
  log(`QUOTE_ROWS=${quoteCount}`)
  if (!(quoteCount >= 1)) throw new Error('QUOTES_NOT_PERSISTED')

  const piano = calculatePianoAmmortamento({
    costo_storico: TAXABLE,
    aliquota_ammortamento: 20,
    data_acquisto: OPEN_DATE,
    fondo_ammortamento: 0,
  })
  const q2026 = proposeQuotaAmmortamento({
    costo_storico: TAXABLE,
    aliquota_ammortamento: 20,
    data_acquisto: OPEN_DATE,
  }, { anno: 2026 })
  log(`PIANO_ROWS=${piano.rows.length}`)
  log(`QUOTA_2026_PROPOSED=${q2026.quote?.quota_annua ?? ''}`)
  if (q2026.quote?.quota_annua !== 500) throw new Error('QUOTA_MATH_UNEXPECTED')

  log('ACCEPTANCE=Bridge non duplica PN')
  log('P3_05_RESULT=PASS')
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  log(`EVIDENCE=${outPath}`)
}

main().catch((err) => {
  log(`P3_05_RESULT=FAIL`)
  log(`ERROR=${err?.stack || err?.message || String(err)}`)
  try {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.error('EVIDENCE=' + outPath)
  } catch { /* ignore */ }
  process.exitCode = 1
})
