/**
 * Stage3W SG-P2-01: Import Contabilita split payment attiva (conto tecnico config)
 * -> persistPrimaNotaDraft fiscal LAB -> partita imponibile + VAT split flag
 * -> liquidazione domain excludes split VAT debit (period 2026-05 isolated).
 * LAB-only. Never prints tokens/passwords.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCommitWorkflow } from '../../src/modules/import_contabilita/application/importContabilitaWorkflow.js'
import { calcoloLiquidazioneIvaDefinitiva } from '../../src/modules/contabilita/domain/iva/calcoloLiquidazioneIvaDefinitiva.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API_ORIGIN = 'http://127.0.0.1:3001'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const UTENTE_A = '72000000-0000-4000-8000-000000000005'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA = '72000000-0000-4000-8000-000000000012'
const CONTO_SPLIT = '72000000-0000-4000-8000-000000000017'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_IMPORT_SPLIT_COMMIT_${stamp}.txt`)

const TAXABLE = 1000
const VAT = 220
const GROSS = 1220
const REG_DATE = '2026-05-15'

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

function installAbsoluteApiFetch() {
  const nativeFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return nativeFetch(API_ORIGIN + input, init)
    }
    return nativeFetch(input, init)
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

INSERT INTO auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
SELECT u.id,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email',u.id::text,now(),now(),now()
FROM auth.users u
WHERE u.id='${AUTH_A}'::uuid
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email');
`)
}

function ensureAccounts() {
  psql(`
INSERT INTO public.piano_conti(id,societa_id,codice,descrizione,tipo,attivo) VALUES
 ('${CONTO_CLIENTE}','${SOCIETA_A}','1.01','Cliente SG-E2E-A','patrimoniale',true),
 ('${CONTO_RICAVO}','${SOCIETA_A}','4.01','Ricavi SG-E2E-A','economico',true),
 ('${CONTO_IVA}','${SOCIETA_A}','2.01','IVA debito SG-E2E-A','patrimoniale',true),
 ('${CONTO_SPLIT}','${SOCIETA_A}','2.03','IVA split tecnico SG-E2E-A','patrimoniale',true)
ON CONFLICT (id) DO NOTHING;
`)
}

function insertStaging(stagingId, docNum) {
  psql(`
INSERT INTO public.documenti_import (
  id, filename, file_path, file_size, mime_type, tipo_documento, stato,
  societa_destinazione_id, company_id, uploaded_by, processato_da, created_by, owner_user_id,
  note_operatore, created_at, updated_at
) VALUES (
  '${stagingId}'::uuid,
  ${sqlQuote(docNum + '.xml')},
  ${sqlQuote('lab://sg-e2e/' + docNum + '.xml')},
  1024,
  'application/xml',
  'fattura_attiva',
  'pending',
  '${SOCIETA_A}'::uuid,
  '${SOCIETA_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '[SG-E2E] Import split payment staging P2-01',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET stato='pending', updated_at=now();
`)
}

function buildCommitPayload({ stagingId, docNum }) {
  return {
    societaId: SOCIETA_A,
    registrationDate: REG_DATE,
    societa: { id: SOCIETA_A, codice: 'SG-E2E-A', denominazione: 'SG E2E synthetic company A' },
    sourceRow: { id: stagingId, filename: docNum + '.xml' },
    classification: { code: 'split_payment', label: 'Split payment', managed: true },
    readiness: { status: 'confermata', label: 'Pronto' },
    payload: {
      handoff: {
        sourceRowKey: stagingId,
        sourceFileName: docNum + '.xml',
        sourceBatchId: 'sg-e2e-imp-split',
        contractVersion: 'P7B-v3',
        operatorId: UTENTE_A,
        createdAt: new Date().toISOString(),
      },
      company: { societaId: SOCIETA_A, esercizioId: '2026' },
      document: {
        direction: 'vendita',
        number: docNum,
        documentDate: REG_DATE,
        registrationDate: REG_DATE,
        totals: { gross: GROSS, taxable: TAXABLE, vat: VAT },
        counterparty: {
          accountId: CONTO_CLIENTE,
          name: 'PA Cliente SG-E2E-A',
          taxCode: '22222222222',
          vatNumber: '22222222222',
          split_payment: true,
        },
      },
      accounting: {
        causaleContabile: {
          id: '',
          codice: 'FC',
          code: 'FC',
          description: 'Fattura attiva split payment',
          tipoCausale: 'docivanormale',
          isDocumentoIva: true,
          gestionePartitario: 'apertura',
          segnoRegistroIva: '+',
          split_payment: true,
          conto_iva_split_payment: CONTO_SPLIT,
          conto_iva_split_payment_codice: '2.03',
          conto_iva_split_payment_descrizione: 'IVA split tecnico SG-E2E-A',
        },
        description: '[SG-E2E] Import split ' + docNum,
        isBalanced: true,
        totals: { debit: GROSS, credit: GROSS },
        rows: [
          {
            rowNumber: 1,
            accountId: CONTO_CLIENTE,
            accountCode: '1.01',
            accountDescription: 'Cliente SG-E2E-A',
            debit: GROSS,
            credit: 0,
            dare: GROSS,
            avere: 0,
            description: 'Cliente',
          },
          {
            rowNumber: 2,
            accountId: CONTO_RICAVO,
            accountCode: '4.01',
            accountDescription: 'Ricavi SG-E2E-A',
            debit: 0,
            credit: TAXABLE,
            dare: 0,
            avere: TAXABLE,
            description: 'Ricavo',
          },
          {
            rowNumber: 3,
            accountId: CONTO_IVA,
            accountCode: '2.01',
            accountDescription: 'IVA debito SG-E2E-A',
            debit: 0,
            credit: VAT,
            dare: 0,
            avere: VAT,
            description: 'IVA',
          },
        ],
      },
      vat: {
        enabled: true,
        registerType: 'vendite',
        competencePeriod: '2026-05',
        splitPayment: true,
        rows: [
          {
            rowNumber: 1,
            imponibile: TAXABLE,
            imposta: VAT,
            aliquota: 22,
            causaleIvaId: 'iva-22',
            causaleIva: 'Aliquota 22%',
            esigibilita: 'Immediata',
            splitPayment: true,
          },
        ],
      },
      ledger: {
        enabled: true,
        mode: 'open',
        accountId: CONTO_CLIENTE,
        subjectId: CONTO_CLIENTE,
        rows: [
          {
            rowNumber: 1,
            action: 'open',
            amount: GROSS,
            dueDate: '2026-06-15',
            documentRef: docNum,
          },
        ],
      },
      validation: { status: 'confermata', blockers: [], warnings: [] },
      automationMeta: { mode: 'automatic', code: 'TD01' },
    },
  }
}

async function main() {
  log('P2_01_START Import split payment + liquidazione exclude')
  process.env.FISCOSIM_ISOLATED_LAB_API = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED = 'true'
  process.env.VITE_FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB = 'true'

  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!serviceKey || !anonKey) throw new Error('LAB_KEYS_MISSING')
  if (env.VITE_SUPABASE_URL !== AUTH_URL) throw new Error('LAB_URL_MISMATCH_EXPECT_55321')

  process.env.SUPABASE_URL = AUTH_URL
  process.env.VITE_SUPABASE_URL = AUTH_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
  process.env.SUPABASE_ANON_KEY = anonKey
  process.env.VITE_SUPABASE_ANON_KEY = anonKey

  installAbsoluteApiFetch()
  ensureAccounts()
  const password = 'SgE2eSplit!' + randomBytes(8).toString('base64url')
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

  const stagingId = randomUUID()
  const docNum = `SG-E2E-P201-SPLIT-${stamp.slice(-6)}`
  insertStaging(stagingId, docNum)
  log(`STAGING_ID=${stagingId}`)
  log(`DOC_NUM=${docNum}`)

  const commitPayload = buildCommitPayload({ stagingId, docNum })
  const result = await runCommitWorkflow(commitPayload, { db: client })
  log(`IMPORT_SUCCESS=${Boolean(result?.success)}`)
  if (!result?.success) {
    log(`IMPORT_BLOCKERS=${JSON.stringify(result?.blockingReasons || result?.error || result)}`)
    throw new Error('IMPORT_COMMIT_FAILED')
  }
  let pnId =
    result?.primaNotaId ||
    result?.data?.prima_nota_id ||
    result?.pn?.id ||
    result?.persistResult?.pn?.id ||
    null
  if (!pnId) {
    pnId = psql(
      `SELECT id::text FROM public.prima_nota WHERE societa_id='${SOCIETA_A}'::uuid AND numero_documento=${sqlQuote(docNum)} ORDER BY created_at DESC NULLS LAST LIMIT 1`,
    )
  }
  log(`IMPORT_PN_ID=${pnId || ''}`)
  if (!pnId) throw new Error('PN_ID_MISSING')

  const pn = psql(`
SELECT coalesce(totale_dare::text,'')||'|'||coalesce(totale_avere::text,'')||'|'||coalesce(numero_documento,'')
FROM public.prima_nota
WHERE id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
  log(`PN_DB=${pn}`)
  const [dare, avere, docDb] = pn.split('|')
  if (docDb !== docNum) throw new Error('PN_DOC_MISMATCH')
  if (Number(dare) !== GROSS || Number(avere) !== GROSS) throw new Error('PN_UNBALANCED')

  const partita = Number(psql(`
SELECT coalesce(importo_residuo::text,'0') FROM public.partitario
WHERE societa_id='${SOCIETA_A}'::uuid AND numero_documento=${sqlQuote(docNum)}
ORDER BY created_at DESC LIMIT 1
`))
  log(`PARTITA_RESIDUO=${partita}`)
  if (partita !== TAXABLE) throw new Error('PARTITA_NOT_IMPONIBILE')

  const vat = psql(`
SELECT coalesce(split_payment::text,'')||'|'||coalesce(iva::text,'')||'|'||coalesce(imponibile::text,'')||'|'||coalesce(tipo,'')
FROM public.registri_iva
WHERE societa_id='${SOCIETA_A}'::uuid AND prima_nota_id='${pnId}'::uuid
LIMIT 1
`)
  log(`VAT_ROW=${vat}`)
  const [splitFlag, ivaAmt, impAmt, tipo] = vat.split('|')
  if (splitFlag !== 't' && splitFlag !== 'true') throw new Error('VAT_SPLIT_FLAG_MISSING')
  if (Number(ivaAmt) !== VAT || Number(impAmt) !== TAXABLE) throw new Error('VAT_AMOUNTS_MISMATCH')
  if (tipo !== 'vendita') throw new Error('VAT_TIPO_MISMATCH')

  const splitRows = psql(`
SELECT count(*)::text||'|'||coalesce(sum(importo_dare)::text,'0')||'|'||coalesce(sum(importo_avere)::text,'0')
FROM public.prima_nota_righe
WHERE prima_nota_id='${pnId}'::uuid AND conto_id='${CONTO_SPLIT}'::uuid
`)
  log(`SPLIT_TECH_ROWS=${splitRows}`)
  const [splitCount, splitDare, splitAvere] = splitRows.split('|')
  if (Number(splitCount) < 2) throw new Error('SPLIT_TECH_ROWS_MISSING')
  if (Number(splitDare) !== VAT || Number(splitAvere) !== VAT) throw new Error('SPLIT_TECH_AMOUNTS_MISMATCH')

  const clientRow = psql(`
SELECT coalesce(importo_dare::text,'0')||'|'||coalesce(importo_avere::text,'0')
FROM public.prima_nota_righe
WHERE prima_nota_id='${pnId}'::uuid AND conto_id='${CONTO_CLIENTE}'::uuid
LIMIT 1
`)
  log(`CLIENT_ROW=${clientRow}`)
  const [cliDare] = clientRow.split('|')
  if (Number(cliDare) !== TAXABLE) throw new Error('CLIENT_NOT_IMPONIBILE')

  const claimKind = psql(`
SELECT coalesce(contract_kind,'') FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  const claimSource = psql(`
SELECT coalesce(request_payload->>'source_module','') FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`CLAIM_CONTRACT_KIND=${claimKind}`)
  log(`CLAIM_SOURCE_MODULE=${claimSource}`)
  if (!String(claimKind).includes('split')) throw new Error('CLAIM_KIND_NOT_SPLIT')
  if (claimSource !== 'import_contabilita') throw new Error('SOURCE_MODULE_NOT_IMPORT')

  // Liquidazione: isolate May 2026 rows for this societa (includes this doc; exclude other months)
  const vatRows = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT id, societa_id::text AS societa_id, documento_id, data::text AS data,
         imponibile, iva, aliquota, tipo,
         iva_detraibile, iva_indetraibile, esigibilita, split_payment
  FROM public.registri_iva
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND data >= '2026-05-01' AND data <= '2026-05-31'
) t
`)
  log(`LIQ_VAT_ROWS=${Array.isArray(vatRows) ? vatRows.length : 0}`)
  const thisDocVat = (vatRows || []).filter((r) => r.documento_id === docNum)
  if (thisDocVat.length !== 1) throw new Error('LIQ_DOC_VAT_MISSING')

  const calcDoc = calcoloLiquidazioneIvaDefinitiva(thisDocVat, {
    societaId: SOCIETA_A,
    periodoInizio: '2026-05-01',
    periodoFine: '2026-05-31',
    periodicita: 'mensile',
  })
  log(`LIQ_DOC_LORDA=${calcDoc.ivaVenditeLorda}`)
  log(`LIQ_DOC_SPLIT_ESCLUSA=${calcDoc.ivaSplitEsclusa}`)
  log(`LIQ_DOC_DEBITO_EFF=${calcDoc.ivaDebitoEffettiva}`)
  if (Number(calcDoc.ivaVenditeLorda) !== VAT) throw new Error('LIQ_LORDA_MISMATCH')
  if (Number(calcDoc.ivaSplitEsclusa) !== VAT) throw new Error('LIQ_SPLIT_NOT_EXCLUDED')
  if (Number(calcDoc.ivaDebitoEffettiva) !== 0) throw new Error('LIQ_DEBITO_NOT_ZERO')

  const calcMonth = calcoloLiquidazioneIvaDefinitiva(vatRows || [], {
    societaId: SOCIETA_A,
    periodoInizio: '2026-05-01',
    periodoFine: '2026-05-31',
    periodicita: 'mensile',
  })
  log(`LIQ_MONTH_SPLIT_ESCLUSA=${calcMonth.ivaSplitEsclusa}`)
  log(`LIQ_MONTH_DEBITO_EFF=${calcMonth.ivaDebitoEffettiva}`)
  if (Number(calcMonth.ivaSplitEsclusa) < VAT) throw new Error('LIQ_MONTH_SPLIT_TOO_LOW')
  // Debito effettivo must not include this split amount
  const expectedDebito = Math.round((Number(calcMonth.ivaVenditeLorda) - Number(calcMonth.ivaSplitEsclusa)) * 100) / 100
  if (Number(calcMonth.ivaDebitoEffettiva) !== expectedDebito) throw new Error('LIQ_MONTH_DEBITO_FORMULA')

  log('P2_01_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P2_01_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P2_01_RESULT=FAIL'))) process.exit(1)
  })
