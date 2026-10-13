/**
 * Stage3W SG-P2-03: Import Contabilita reverse/estero (autofattura passiva)
 * -> fiscal LAB: doppia annotazione IVA + partitario imponibile + liquidazione neutra.
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
const CONTO_COSTO = '72000000-0000-4000-8000-000000000014'
const CONTO_IVA = '72000000-0000-4000-8000-000000000015'
const CONTO_FORN = '72000000-0000-4000-8000-000000000016'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_IMPORT_REVERSE_ESTERO_COMMIT_${stamp}.txt`)

const TAXABLE = 1000
const VAT = 220
const GROSS = 1220
const REG_DATE = '2026-08-14'

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
 ('${CONTO_COSTO}','${SOCIETA_A}','5.01','Costi SG-E2E-A','economico',true),
 ('${CONTO_IVA}','${SOCIETA_A}','2.02','IVA credito SG-E2E-A','patrimoniale',true),
 ('${CONTO_FORN}','${SOCIETA_A}','2.10','Fornitore SG-E2E-A','patrimoniale',true)
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
  'fattura_passiva',
  'pending',
  '${SOCIETA_A}'::uuid,
  '${SOCIETA_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '[SG-E2E] Import reverse/estero P2-03',
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
    classification: { code: 'reverse_o_autofattura_estera', label: 'Reverse / autofattura estera', managed: true },
    readiness: { status: 'confermata', label: 'Pronto' },
    payload: {
      handoff: {
        sourceRowKey: stagingId,
        sourceFileName: docNum + '.xml',
        sourceBatchId: 'sg-e2e-imp-reverse',
        contractVersion: 'P7B-v3',
        operatorId: UTENTE_A,
        createdAt: new Date().toISOString(),
      },
      company: { societaId: SOCIETA_A, esercizioId: '2026' },
      document: {
        direction: 'acquisto',
        number: docNum,
        documentDate: REG_DATE,
        registrationDate: REG_DATE,
        totals: { gross: GROSS, taxable: TAXABLE, vat: VAT },
        counterparty: {
          accountId: CONTO_FORN,
          name: 'Fornitore Estero SG-E2E-A',
          taxCode: 'EU999999999',
          vatNumber: 'EU999999999',
        },
        flags: { reverseCharge: true, isForeign: true },
      },
      accounting: {
        causaleContabile: {
          id: '',
          codice: 'A17X',
          code: 'A17X',
          description: 'Autofattura / reverse estero',
          tipoCausale: 'autofattura',
          isDocumentoIva: true,
          gestionePartitario: 'apertura',
          segnoRegistroIva: '+',
          reverse_charge: true,
          codice_registro_iva: 'acquisti',
          registroIva: 'acquisti',
        },
        description: '[SG-E2E] Import reverse estero ' + docNum,
        isBalanced: true,
        totals: { debit: GROSS, credit: GROSS },
        // Pre-rewrite ordinary shape; workflow rebuilds 4 reverse rows.
        rows: [
          {
            rowNumber: 1,
            accountId: CONTO_COSTO,
            accountCode: '5.01',
            accountDescription: 'Costi SG-E2E-A',
            debit: TAXABLE,
            credit: 0,
            dare: TAXABLE,
            avere: 0,
            description: 'Costo',
          },
          {
            rowNumber: 2,
            accountId: CONTO_IVA,
            accountCode: '2.02',
            accountDescription: 'IVA credito SG-E2E-A',
            debit: VAT,
            credit: 0,
            dare: VAT,
            avere: 0,
            description: 'IVA',
          },
          {
            rowNumber: 3,
            accountId: CONTO_FORN,
            accountCode: '2.10',
            accountDescription: 'Fornitore SG-E2E-A',
            debit: 0,
            credit: GROSS,
            dare: 0,
            avere: GROSS,
            description: 'Fornitore',
          },
        ],
      },
      vat: {
        enabled: true,
        registerType: 'acquisti',
        competencePeriod: '2026-08',
        reverseCharge: true,
        autofattura: true,
        rows: [
          {
            rowNumber: 1,
            imponibile: TAXABLE,
            imposta: VAT,
            aliquota: 22,
            causaleIvaId: 'iva-22',
            causaleIva: 'Reverse / estero 22%',
            esigibilita: 'Immediata',
            reverseCharge: true,
          },
        ],
      },
      ledger: {
        enabled: true,
        mode: 'open',
        accountId: CONTO_FORN,
        subjectId: CONTO_FORN,
        rows: [
          {
            rowNumber: 1,
            action: 'open',
            amount: GROSS,
            dueDate: '2026-09-14',
            documentRef: docNum,
          },
        ],
      },
      validation: { status: 'confermata', blockers: [], warnings: [] },
      automationMeta: { mode: 'automatic', code: 'TD17' },
    },
  }
}

async function main() {
  log('P2_03_START Import reverse/estero autofattura')
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
  const password = 'SgE2eRev!' + randomBytes(8).toString('base64url')
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
  const docNum = `SG-E2E-P203-REV-${stamp.slice(-6)}`
  insertStaging(stagingId, docNum)
  log(`DOC_NUM=${docNum}`)

  const result = await runCommitWorkflow(buildCommitPayload({ stagingId, docNum }), { db: client })
  log(`IMPORT_SUCCESS=${Boolean(result?.success)}`)
  if (!result?.success) {
    log(`IMPORT_BLOCKERS=${JSON.stringify(result?.blockingReasons || [])}`)
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
  log(`PN_ID=${pnId || ''}`)
  if (!pnId) throw new Error('PN_ID_MISSING')

  const pn = psql(`
SELECT coalesce(totale_dare::text,'')||'|'||coalesce(totale_avere::text,'')
FROM public.prima_nota WHERE id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
  log(`PN_TOTALS=${pn}`)
  const [dare, avere] = pn.split('|')
  if (Number(dare) !== GROSS || Number(avere) !== GROSS) throw new Error('PN_UNBALANCED')

  const rowCount = Number(psql(`
SELECT count(*)::text FROM public.prima_nota_righe WHERE prima_nota_id='${pnId}'::uuid
`))
  log(`PN_RIGHE=${rowCount}`)
  if (rowCount !== 4) throw new Error('EXPECTED_4_REVERSE_ROWS')

  const fornRow = psql(`
SELECT coalesce(importo_dare::text,'0')||'|'||coalesce(importo_avere::text,'0')
FROM public.prima_nota_righe
WHERE prima_nota_id='${pnId}'::uuid AND conto_id='${CONTO_FORN}'::uuid
LIMIT 1
`)
  log(`FORN_ROW=${fornRow}`)
  const [, fornAvere] = fornRow.split('|')
  if (Number(fornAvere) !== TAXABLE) throw new Error('FORN_NOT_IMPONIBILE')

  const ivaNet = psql(`
SELECT coalesce(sum(importo_dare)::text,'0')||'|'||coalesce(sum(importo_avere)::text,'0')
FROM public.prima_nota_righe
WHERE prima_nota_id='${pnId}'::uuid AND conto_id='${CONTO_IVA}'::uuid
`)
  log(`IVA_NET_ROWS=${ivaNet}`)
  const [ivaDare, ivaAvere] = ivaNet.split('|')
  if (Number(ivaDare) !== VAT || Number(ivaAvere) !== VAT) throw new Error('IVA_DOUBLE_ANNOTATION_MISMATCH')

  const partita = psql(`
SELECT coalesce(tipo,'')||'|'||coalesce(importo_residuo::text,'0')
FROM public.partitario
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`PARTITA=${partita}`)
  const [partTipo, partResiduo] = partita.split('|')
  if (partTipo !== 'fornitore') throw new Error('PARTITA_NOT_FORNITORE')
  if (Number(partResiduo) !== TAXABLE) throw new Error('PARTITA_NOT_IMPONIBILE')

  const vatTypes = psql(`
SELECT string_agg(tipo||':'||iva::text, ';' ORDER BY tipo)
FROM public.registri_iva
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
  log(`VAT_TYPES=${vatTypes}`)
  if (!String(vatTypes).includes('acquisto:220') || !String(vatTypes).includes('vendita:220')) {
    throw new Error('VAT_DOUBLE_ANNOTATION_MISSING')
  }
  const vatN = Number(psql(`
SELECT count(*)::text FROM public.registri_iva
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`))
  if (vatN !== 2) throw new Error('VAT_ROW_COUNT')

  const claim = psql(`
SELECT coalesce(contract_kind,'')||'|'||coalesce(request_payload->>'source_module','')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`CLAIM=${claim}`)
  if (!String(claim).includes('import_contabilita')) throw new Error('SOURCE_NOT_IMPORT')

  const vatRows = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT id, societa_id::text AS societa_id, documento_id, data::text AS data,
         imponibile, iva, aliquota, tipo, esigibilita, split_payment,
         iva_detraibile, iva_indetraibile
  FROM public.registri_iva
  WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
) t
`)
  const calc = calcoloLiquidazioneIvaDefinitiva(vatRows || [], {
    societaId: SOCIETA_A,
    periodoInizio: '2026-08-01',
    periodoFine: '2026-08-31',
    periodicita: 'mensile',
  })
  log(`LIQ_DEBITO=${calc.ivaDebitoEffettiva}`)
  log(`LIQ_CREDITO=${calc.ivaAcquistiDetraibile}`)
  log(`LIQ_SALDO=${calc.saldoPeriodo}`)
  if (Number(calc.ivaDebitoEffettiva) !== VAT) throw new Error('LIQ_DEBITO_MISMATCH')
  if (Number(calc.ivaAcquistiDetraibile) !== VAT) throw new Error('LIQ_CREDITO_MISMATCH')
  if (Number(calc.saldoPeriodo) !== 0) throw new Error('LIQ_NOT_NEUTRAL')

  log('P2_03_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P2_03_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P2_03_RESULT=FAIL'))) process.exit(1)
  })
