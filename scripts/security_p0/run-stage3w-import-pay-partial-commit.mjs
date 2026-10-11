/**
 * Stage3W SG-P1-04: Import Contabilita — open FA22-like + partial collection (500)
 * via runCommitWorkflow fiscal LAB; assert residual 720; overpay rejected.
 * LAB-only. Never prints tokens/passwords.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCommitWorkflow } from '../../src/modules/import_contabilita/application/importContabilitaWorkflow.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API_ORIGIN = 'http://127.0.0.1:3001'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const SOCIETA_B = '72000000-0000-4000-8000-000000000002'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const UTENTE_A = '72000000-0000-4000-8000-000000000005'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA = '72000000-0000-4000-8000-000000000012'
const CONTO_BANCA = '72000000-0000-4000-8000-000000000013'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_IMPORT_PAY_PARTIAL_COMMIT_${stamp}.txt`)

const OPEN_GROSS = 1220
const PAY_AMOUNT = 500
const EXPECT_RESIDUAL = 720

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
 ('${CONTO_BANCA}','${SOCIETA_A}','1.10','Banca SG-E2E-A','patrimoniale',true)
ON CONFLICT (id) DO NOTHING;
`)
}

function insertStaging(stagingId, docNum, tipo) {
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
  ${sqlQuote(tipo)},
  'pending',
  '${SOCIETA_A}'::uuid,
  '${SOCIETA_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '[SG-E2E] Import pay-partial staging for P1-04',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  stato='pending',
  filename=EXCLUDED.filename,
  note_operatore=EXCLUDED.note_operatore,
  updated_at=now();
`)
}

function baseCommitShell({ stagingId, docNum, registrationDate }) {
  return {
    societaId: SOCIETA_A,
    registrationDate,
    societa: {
      id: SOCIETA_A,
      codice: 'SG-E2E-A',
      denominazione: 'SG E2E synthetic company A',
    },
    sourceRow: { id: stagingId, filename: docNum + '.xml' },
    classification: { code: 'TD01', label: 'Documento', managed: true },
    readiness: { status: 'confermata', label: 'Pronto per contabilita' },
  }
}

function buildOpenFaPayload({ stagingId, docNum }) {
  const registrationDate = '2026-04-25'
  return {
    ...baseCommitShell({ stagingId, docNum, registrationDate }),
    payload: {
      handoff: {
        sourceRowKey: stagingId,
        sourceFileName: docNum + '.xml',
        sourceBatchId: 'sg-e2e-imp-pay',
        contractVersion: 'P7B-v3',
        operatorId: UTENTE_A,
        createdAt: new Date().toISOString(),
      },
      company: { societaId: SOCIETA_A, esercizioId: '2026' },
      document: {
        direction: 'vendita',
        number: docNum,
        documentDate: registrationDate,
        registrationDate,
        totals: { gross: OPEN_GROSS, taxable: 1000, vat: 220 },
        counterparty: {
          accountId: CONTO_CLIENTE,
          name: 'Cliente SG-E2E-A',
          taxCode: '22222222222',
          vatNumber: '22222222222',
        },
      },
      accounting: {
        causaleContabile: {
          id: '',
          codice: 'FV',
          code: 'FV',
          description: 'Fattura attiva',
          tipoCausale: 'docivanormale',
          isDocumentoIva: true,
          gestionePartitario: 'apertura',
          segnoRegistroIva: '+',
          codice_registro_iva: 'vendite',
          registroIva: 'vendite',
        },
        description: '[SG-E2E] Import pay-open FA ' + docNum,
        isBalanced: true,
        totals: { debit: OPEN_GROSS, credit: OPEN_GROSS },
        rows: [
          {
            rowNumber: 1,
            accountId: CONTO_CLIENTE,
            accountCode: '1.01',
            debit: OPEN_GROSS,
            credit: 0,
            dare: OPEN_GROSS,
            avere: 0,
            description: 'Cliente',
          },
          {
            rowNumber: 2,
            accountId: CONTO_RICAVO,
            accountCode: '4.01',
            debit: 0,
            credit: 1000,
            dare: 0,
            avere: 1000,
            description: 'Ricavo',
          },
          {
            rowNumber: 3,
            accountId: CONTO_IVA,
            accountCode: '2.01',
            debit: 0,
            credit: 220,
            dare: 0,
            avere: 220,
            description: 'IVA',
          },
        ],
      },
      vat: {
        enabled: true,
        registerType: 'vendite',
        competencePeriod: '2026-04',
        rows: [
          {
            rowNumber: 1,
            imponibile: 1000,
            imposta: 220,
            aliquota: 22,
            causaleIvaId: 'iva-22',
            causaleIva: 'Aliquota 22%',
            esigibilita: 'Immediata',
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
            amount: OPEN_GROSS,
            dueDate: '2026-05-25',
            documentRef: docNum,
          },
        ],
      },
      validation: { status: 'confermata', blockers: [], warnings: [] },
      automationMeta: { mode: 'automatic', code: 'TD01' },
    },
  }
}

function buildPayPayload({ stagingId, docNum, partitaId, amount }) {
  const registrationDate = '2026-04-26'
  return {
    ...baseCommitShell({ stagingId, docNum, registrationDate }),
    classification: { code: 'PAY', label: 'Incasso', managed: true },
    payload: {
      handoff: {
        sourceRowKey: stagingId,
        sourceFileName: docNum + '.xml',
        sourceBatchId: 'sg-e2e-imp-pay',
        contractVersion: 'P7B-v3',
        operatorId: UTENTE_A,
        createdAt: new Date().toISOString(),
      },
      company: { societaId: SOCIETA_A, esercizioId: '2026' },
      document: {
        direction: 'vendita',
        number: docNum,
        documentDate: registrationDate,
        registrationDate,
        totals: { gross: amount, taxable: 0, vat: 0 },
        counterparty: {
          accountId: CONTO_CLIENTE,
          name: 'Cliente SG-E2E-A',
          taxCode: '22222222222',
          vatNumber: '22222222222',
        },
      },
      accounting: {
        causaleContabile: {
          id: '',
          codice: 'INC',
          code: 'INC',
          description: 'Incasso cliente',
          tipoCausale: 'movimentogenerale',
          gestionePartitario: 'chiusura',
          operazione_partite: 'chiude',
          isDocumentoIva: false,
        },
        description: '[SG-E2E] Import pay-partial ' + docNum,
        isBalanced: true,
        totals: { debit: amount, credit: amount },
        rows: [
          {
            rowNumber: 1,
            accountId: CONTO_BANCA,
            accountCode: '1.10',
            debit: amount,
            credit: 0,
            dare: amount,
            avere: 0,
            description: 'Banca',
          },
          {
            rowNumber: 2,
            accountId: CONTO_CLIENTE,
            accountCode: '1.01',
            debit: 0,
            credit: amount,
            dare: 0,
            avere: amount,
            description: 'Cliente',
          },
        ],
      },
      vat: { enabled: false, registerType: '', rows: [] },
      ledger: {
        enabled: true,
        mode: 'close',
        accountId: CONTO_CLIENTE,
        subjectId: CONTO_CLIENTE,
        rows: [
          {
            rowNumber: 1,
            action: 'close',
            openItemId: partitaId,
            amount,
            documentRef: docNum,
            paymentDate: registrationDate,
          },
        ],
      },
      validation: { status: 'confermata', blockers: [], warnings: [] },
      automationMeta: { mode: 'automatic', code: 'PAY' },
    },
  }
}

async function main() {
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
  const password = 'SgE2ePay!' + randomBytes(10).toString('base64url')
  ensureAuthPassword(password)
  ensureAccounts()

  log('P1_04_START Import open FA + partial pay via runCommitWorkflow')

  const rpcName = psql(
    `SELECT coalesce(to_regprocedure('public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)')::text,'')`,
  )
  if (!rpcName.includes('fiscosim_post_fiscal_journal')) throw new Error('FISCAL_RPC_MISSING')
  log('FISCAL_RPC=PRESENT')

  const userClient = createClient(AUTH_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: authData, error: authError } = await userClient.auth.signInWithPassword({
    email: EMAIL_A,
    password,
  })
  if (authError || !authData?.session?.access_token) {
    throw new Error('SIGNIN_FAILED:' + (authError?.message || 'no token'))
  }
  log('LOGIN_JWT=PASS')

  // 1) Open FA
  const openStaging = randomUUID()
  const openDoc = 'SG-E2E-IMP-PAYFA-' + stamp.slice(-8)
  insertStaging(openStaging, openDoc, 'fattura_attiva')
  const openRes = await runCommitWorkflow(buildOpenFaPayload({ stagingId: openStaging, docNum: openDoc }), {
    db: userClient,
  })
  log(`OPEN_COMMIT_SUCCESS=${Boolean(openRes?.success)}`)
  if (!openRes?.success) {
    log(`OPEN_BLOCKERS=${JSON.stringify(openRes?.blockingReasons || [])}`)
    throw new Error('OPEN_FA_FAILED')
  }
  const openPn = openRes.primaNotaId
  log(`OPEN_PN_ID=${openPn}`)

  const partitaId = psql(`
SELECT id::text FROM public.partitario
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid AND tipo='cliente'
LIMIT 1
`)
  const openResiduo = psql(`
SELECT importo_residuo::text FROM public.partitario WHERE id='${partitaId}'::uuid
`)
  log(`PARTITA_ID=${partitaId}`)
  log(`PARTITA_OPEN_RESIDUO=${openResiduo}`)
  if (!partitaId) throw new Error('PARTITA_MISSING')
  if (Number(openResiduo) !== OPEN_GROSS) throw new Error('PARTITA_OPEN_MISMATCH')

  // 2) Partial pay 500
  const payStaging = randomUUID()
  const payDoc = 'SG-E2E-IMP-PAY500-' + stamp.slice(-8)
  insertStaging(payStaging, payDoc, 'incasso')
  const payRes = await runCommitWorkflow(
    buildPayPayload({ stagingId: payStaging, docNum: payDoc, partitaId, amount: PAY_AMOUNT }),
    { db: userClient },
  )
  log(`PAY_COMMIT_SUCCESS=${Boolean(payRes?.success)}`)
  if (!payRes?.success) {
    log(`PAY_BLOCKERS=${JSON.stringify(payRes?.blockingReasons || [])}`)
    throw new Error('PAY_COMMIT_FAILED')
  }
  const payPn = payRes.primaNotaId
  log(`PAY_PN_ID=${payPn}`)

  const afterResiduo = psql(`
SELECT importo_residuo::text FROM public.partitario WHERE id='${partitaId}'::uuid
`)
  log(`PARTITA_AFTER_RESIDUO=${afterResiduo}`)
  if (Number(afterResiduo) !== EXPECT_RESIDUAL) throw new Error('PARTITA_RESIDUAL_MISMATCH')

  const claim = psql(`
SELECT coalesce(request_payload->>'source_module','')||'|'||coalesce(contract_kind,'')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${payPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  const [src, kind] = claim.split('|')
  log(`PAY_CLAIM_SOURCE_MODULE=${src}`)
  log(`PAY_CLAIM_CONTRACT_KIND=${kind}`)
  if (src !== 'import_contabilita') throw new Error('SOURCE_MODULE_NOT_IMPORT')
  if (kind !== 'pagamento') throw new Error('CONTRACT_KIND_NOT_PAGAMENTO')

  // 3) Overpay must fail
  const overStaging = randomUUID()
  const overDoc = 'SG-E2E-IMP-PAYOVER-' + stamp.slice(-8)
  insertStaging(overStaging, overDoc, 'incasso')
  const overRes = await runCommitWorkflow(
    buildPayPayload({
      stagingId: overStaging,
      docNum: overDoc,
      partitaId,
      amount: EXPECT_RESIDUAL + 1,
    }),
    { db: userClient },
  )
  log(`OVERPAY_COMMIT_SUCCESS=${Boolean(overRes?.success)}`)
  if (overRes?.success) throw new Error('OVERPAY_ACCEPTED')
  log(`OVERPAY_BLOCKERS=${JSON.stringify(overRes?.blockingReasons || []).slice(0, 300)}`)

  const finalResiduo = psql(`
SELECT importo_residuo::text FROM public.partitario WHERE id='${partitaId}'::uuid
`)
  log(`PARTITA_FINAL_RESIDUO=${finalResiduo}`)
  if (Number(finalResiduo) !== EXPECT_RESIDUAL) throw new Error('OVERPAY_MUTATED_RESIDUAL')

  const bCount = psql(`
SELECT count(*)::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_B}'::uuid AND numero_documento IN (${sqlQuote(openDoc)},${sqlQuote(payDoc)})
`)
  log(`SOCIETA_B_PN=${bCount}`)
  if (bCount !== '0') throw new Error('CROSS_COMPANY_LEAK')

  log('P1_04_RESULT=PASS')
}

main()
  .catch((err) => {
    log(`P1_04_RESULT=FAIL ${err?.message || err}`)
    console.error(err)
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    process.exit(1)
  })
  .then(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
  })
