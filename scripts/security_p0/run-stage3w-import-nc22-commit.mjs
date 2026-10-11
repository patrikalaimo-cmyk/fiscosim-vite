/**
 * Stage3W SG-P1-02: Import Contabilita NC attiva 22% -> persistPrimaNotaDraft (fiscal LAB) -> PG.
 * Signs: VAT imponibile/iva negative, partita cliente residual -1220.
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
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_IMPORT_NC22_COMMIT_${stamp}.txt`)

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
 ('${CONTO_IVA}','${SOCIETA_A}','2.01','IVA debito SG-E2E-A','patrimoniale',true)
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
  'nota_credito_attiva',
  'pending',
  '${SOCIETA_A}'::uuid,
  '${SOCIETA_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '${UTENTE_A}'::uuid,
  '[SG-E2E] Import NC22 staging for P1-02',
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

function buildCommitPayload({ stagingId, docNum }) {
  const innerPayload = {
    handoff: {
      sourceRowKey: stagingId,
      sourceFileName: docNum + '.xml',
      sourceBatchId: 'sg-e2e-imp-nc22',
      contractVersion: 'P7B-v3',
      operatorId: UTENTE_A,
      createdAt: new Date().toISOString(),
    },
    company: {
      societaId: SOCIETA_A,
      esercizioId: '2026',
    },
    document: {
      direction: 'vendita',
      number: docNum,
      documentDate: '2026-04-18',
      registrationDate: '2026-04-18',
      totals: {
        gross: 1220.0,
        taxable: 1000.0,
        vat: 220.0,
      },
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
        codice: 'NC',
        code: 'NC',
        description: 'Nota credito attiva',
        // Must be the explicit operazione gestita label; bare "notacredito" is treated as
        // explicit-but-unclassified and clears notaCredito despite segno '-'.
        tipoCausale: 'docivanormale',
        tipoDocumento: 'Nota credito attiva',
        operazioneGestita: 'Nota credito attiva',
        registroIva: 'vendite',
        codice_registro_iva: 'vendite',
        isDocumentoIva: true,
        gestionePartitario: 'apertura',
        segnoRegistroIva: '-',
      },
      description: '[SG-E2E] Import NC22 ' + docNum,
      isBalanced: true,
      totals: {
        debit: 1220.0,
        credit: 1220.0,
      },
      // Mirror matrix NC: ricavi+IVA in Dare, cliente in Avere
      rows: [
        {
          rowNumber: 1,
          accountId: CONTO_RICAVO,
          accountCode: '4.01',
          accountDescription: 'Ricavi SG-E2E-A',
          debit: 1000.0,
          credit: 0.0,
          dare: 1000.0,
          avere: 0.0,
          description: 'Storno ricavo',
        },
        {
          rowNumber: 2,
          accountId: CONTO_IVA,
          accountCode: '2.01',
          accountDescription: 'IVA debito SG-E2E-A',
          debit: 220.0,
          credit: 0.0,
          dare: 220.0,
          avere: 0.0,
          description: 'Storno IVA',
        },
        {
          rowNumber: 3,
          accountId: CONTO_CLIENTE,
          accountCode: '1.01',
          accountDescription: 'Cliente SG-E2E-A',
          debit: 0.0,
          credit: 1220.0,
          dare: 0.0,
          avere: 1220.0,
          description: 'Credito cliente NC',
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
          imponibile: 1000.0,
          imposta: 220.0,
          aliquota: 22.0,
          causaleIvaId: '',
          causaleIva: 'NC Aliquota 22%',
          esigibilita: 'Immediata',
          segnoRegistroIva: '-',
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
          amount: -1220.0,
          dueDate: '2026-05-18',
          documentRef: docNum,
        },
      ],
    },
    validation: {
      status: 'confermata',
      blockers: [],
      warnings: [],
    },
    automationMeta: {
      mode: 'automatic',
      code: 'TD04',
    },
  }

  return {
    societaId: SOCIETA_A,
    registrationDate: '2026-04-18',
    societa: {
      id: SOCIETA_A,
      codice: 'SG-E2E-A',
      denominazione: 'SG E2E synthetic company A',
    },
    sourceRow: {
      id: stagingId,
      filename: docNum + '.xml',
    },
    payload: innerPayload,
    classification: {
      code: 'TD04',
      label: 'Nota di credito',
      managed: true,
    },
    readiness: {
      status: 'confermata',
      label: 'Pronto per contabilita',
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

  const password = 'SgE2eNc!' + randomBytes(10).toString('base64url')
  ensureAuthPassword(password)
  ensureAccounts()

  const stagingId = randomUUID()
  const docNum = 'SG-E2E-IMP-NC22-' + stamp.slice(-8)
  insertStaging(stagingId, docNum)

  log('P1_02_START Import NC22 commit via runCommitWorkflow')
  log(`STAGING_ID=${stagingId}`)
  log(`DOC_NUM=${docNum}`)

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

  const result = await runCommitWorkflow(buildCommitPayload({ stagingId, docNum }), { db: userClient })
  log(`COMMIT_SUCCESS=${Boolean(result?.success)}`)
  if (!result?.success) {
    log(`COMMIT_BLOCKERS=${JSON.stringify(result?.blockingReasons || [])}`)
    throw new Error('IMPORT_COMMIT_FAILED')
  }

  const pnId =
    result?.primaNotaId ||
    psql(
      `SELECT id::text FROM public.prima_nota WHERE societa_id='${SOCIETA_A}'::uuid AND numero_documento=${sqlQuote(docNum)} ORDER BY created_at DESC NULLS LAST LIMIT 1`,
    )
  log(`PN_ID=${pnId || ''}`)
  if (!pnId) throw new Error('PN_ID_MISSING')

  const pnRow = psql(`
SELECT coalesce(totale_dare::text,'')||'|'||coalesce(totale_avere::text,'')||'|'||coalesce(numero_documento,'')
FROM public.prima_nota WHERE id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
  const [dare, avere, numeroDoc] = pnRow.split('|')
  log(`PN_TOTALS=${dare}/${avere}`)
  log(`PN_NUMERO_DOCUMENTO=${numeroDoc}`)
  if (Number(dare) !== 1220 || Number(avere) !== 1220) throw new Error('PN_UNBALANCED')
  if (numeroDoc !== docNum) throw new Error('PN_DOC_NUM_MISMATCH')

  const vatRow = psql(`
SELECT coalesce(imponibile::text,'')||'|'||coalesce(iva::text,'')||'|'||coalesce(tipo,'')
FROM public.registri_iva
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  const [imp, iva, tipo] = vatRow.split('|')
  log(`VAT_ROW=${imp}/${iva}/${tipo}`)
  if (Number(imp) !== -1000 || Number(iva) !== -220) throw new Error('VAT_SIGN_MISMATCH')
  if (tipo !== 'vendita') throw new Error('VAT_TIPO_MISMATCH')

  const residuo = psql(`
SELECT importo_residuo::text FROM public.partitario
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid AND tipo='cliente'
LIMIT 1
`)
  log(`PARTITA_RESIDUO=${residuo}`)
  if (Number(residuo) !== -1220) throw new Error('PARTITA_RESIDUAL_MISMATCH')

  const claimSource = psql(`
SELECT coalesce(request_payload->>'source_module','')||'|'||coalesce(contract_kind,'')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  const [src, kind] = claimSource.split('|')
  log(`CLAIM_SOURCE_MODULE=${src}`)
  log(`CLAIM_CONTRACT_KIND=${kind}`)
  if (src !== 'import_contabilita') throw new Error('SOURCE_MODULE_NOT_IMPORT')
  if (kind !== 'nota_credito_attiva') throw new Error('CONTRACT_KIND_NOT_NC_ATTIVA')

  const bCount = psql(`
SELECT count(*)::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_B}'::uuid AND numero_documento=${sqlQuote(docNum)}
`)
  log(`SOCIETA_B_PN=${bCount}`)
  if (bCount !== '0') throw new Error('CROSS_COMPANY_LEAK')

  const stagingStato = psql(`SELECT coalesce(stato,'') FROM public.documenti_import WHERE id='${stagingId}'::uuid`)
  log(`STAGING_STATO=${stagingStato}`)

  log('P1_02_RESULT=PASS')
}

main()
  .catch((err) => {
    log(`P1_02_RESULT=FAIL ${err?.message || err}`)
    console.error(err)
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    process.exit(1)
  })
  .then(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
  })
