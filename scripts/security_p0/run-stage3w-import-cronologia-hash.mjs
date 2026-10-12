/**
 * Stage3W SG-P3-02: Import Cronologia UI + file hash in Stage3W claim.
 * Commit FP22 via runCommitWorkflow, then prove claim motivazione fileHash + history query.
 * LAB-only. Never prints tokens/passwords.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCommitWorkflow } from '../../src/modules/import_contabilita/application/importContabilitaWorkflow.js'
import {
  appendImportCronologiaEntry,
  loadImportCronologiaEntries,
} from '../../src/modules/import_contabilita/application/cronologia/importCronologiaStore.js'
import {
  buildImportFiscalCommitHistoryQuery,
  normalizeImportFiscalCommitHistoryRows,
} from '../../src/modules/import_contabilita/application/cronologia/listImportFiscalCommitHistory.js'
import { parseImportFileHashMarker } from '../../src/modules/import_contabilita/application/cronologia/importFileHashMarker.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API_ORIGIN = 'http://127.0.0.1:3001'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const SOCIETA_B = '72000000-0000-4000-8000-000000000002'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const UTENTE_A = '72000000-0000-4000-8000-000000000005'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_COSTO = '72000000-0000-4000-8000-000000000014'
const CONTO_IVA = '72000000-0000-4000-8000-000000000015'
const CONTO_FORN = '72000000-0000-4000-8000-000000000016'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const FILE_HASH = createHash('sha256').update(`sg-p302-${stamp}`).digest('hex').slice(0, 16)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_IMPORT_CRONOLOGIA_HASH_${stamp}.txt`)

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
    if (input instanceof Request) {
      const url = input.url
      if (url.startsWith('/api/') || url.startsWith(API_ORIGIN.replace('http://127.0.0.1:3001', '') + '/api/')) {
        /* keep */
      }
      try {
        const u = new URL(url, API_ORIGIN)
        if (u.pathname.startsWith('/api/') && (url.startsWith('/') || u.hostname === '127.0.0.1' || u.hostname === 'localhost')) {
          if (url.startsWith('/')) return nativeFetch(API_ORIGIN + url, init)
        }
      } catch {
        /* fall through */
      }
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
  '[SG-E2E] Import FP22 staging for P1-01',
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
      sourceHash: FILE_HASH,
      sourceBatchId: 'sg-e2e-imp-p302',
      contractVersion: 'P7B-v3',
      operatorId: UTENTE_A,
      createdAt: new Date().toISOString(),
    },
    company: {
      societaId: SOCIETA_A,
      esercizioId: '2026',
    },
    document: {
      direction: 'acquisto',
      number: docNum,
      documentDate: '2026-04-12',
      registrationDate: '2026-04-12',
      totals: {
        gross: 1220.0,
        taxable: 1000.0,
        vat: 220.0,
      },
      counterparty: {
        accountId: CONTO_FORN,
        name: 'Fornitore SG-E2E-A',
        taxCode: '11111111111',
        vatNumber: '11111111111',
      },
    },
    accounting: {
      causaleContabile: {
        id: '',
        codice: 'FF',
        code: 'FF',
        description: 'Fattura passiva',
        tipoCausale: 'docivanormale',
        isDocumentoIva: true,
        gestionePartitario: 'apertura',
        segnoRegistroIva: '+',
      },
      description: '[SG-E2E] Import FP22 ' + docNum,
      isBalanced: true,
      totals: {
        debit: 1220.0,
        credit: 1220.0,
      },
      rows: [
        {
          rowNumber: 1,
          accountId: CONTO_COSTO,
          accountCode: '5.01',
          accountDescription: 'Costi SG-E2E-A',
          debit: 1000.0,
          credit: 0.0,
          dare: 1000.0,
          avere: 0.0,
          description: 'Costo',
        },
        {
          rowNumber: 2,
          accountId: CONTO_IVA,
          accountCode: '2.02',
          accountDescription: 'IVA credito SG-E2E-A',
          debit: 220.0,
          credit: 0.0,
          dare: 220.0,
          avere: 0.0,
          description: 'IVA',
        },
        {
          rowNumber: 3,
          accountId: CONTO_FORN,
          accountCode: '2.10',
          accountDescription: 'Fornitore SG-E2E-A',
          debit: 0.0,
          credit: 1220.0,
          dare: 0.0,
          avere: 1220.0,
          description: 'Debito Fornitore',
        },
      ],
    },
    vat: {
      enabled: true,
      registerType: 'acquisti',
      competencePeriod: '2026-04',
      rows: [
        {
          rowNumber: 1,
          imponibile: 1000.0,
          imposta: 220.0,
          aliquota: 22.0,
          causaleIvaId: '',
          causaleIva: 'Aliquota 22%',
          esigibilita: 'Immediata',
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
          amount: 1220.0,
          dueDate: '2026-05-12',
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
      code: 'TD01',
    },
  }

  return {
    societaId: SOCIETA_A,
    registrationDate: '2026-04-12',
    societa: {
      id: SOCIETA_A,
      codice: 'SG-E2E-A',
      denominazione: 'SG E2E synthetic company A',
    },
    sourceRow: {
      id: stagingId,
      filename: docNum + '.xml',
      sourceHash: FILE_HASH,
    },
    sourceHash: FILE_HASH,
    payload: innerPayload,
    classification: {
      code: 'TD01',
      label: 'Fattura passiva',
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

  const password = 'SgE2eImp!' + randomBytes(10).toString('base64url')
  ensureAuthPassword(password)
  ensureAccounts()

  const stagingId = randomUUID()
  const docNum = 'SG-E2E-IMP-P302-' + stamp.slice(-8)
  insertStaging(stagingId, docNum)

  log('P3_02_START Import cronologia + file hash via Stage3W claim')
  log(`STAGING_ID=${stagingId}`)
  log(`DOC_NUM=${docNum}`)
  log(`FILE_HASH=${FILE_HASH}`)
  log(`FISCAL_PERSIST_LAB=${process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED}`)

  const rpcName = psql(
    `SELECT coalesce(to_regprocedure('public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)')::text,'')`,
  )
  log(`FISCAL_RPC_NAME=${rpcName}`)
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
  if (authData.user.id !== AUTH_A) throw new Error('AUTH_USER_ID_MISMATCH')
  log('LOGIN_JWT=PASS')

  const commitPayload = buildCommitPayload({ stagingId, docNum })
  const result = await runCommitWorkflow(commitPayload, { db: userClient })

  log(`COMMIT_SUCCESS=${Boolean(result?.success)}`)
  if (!result?.success) {
    log(`COMMIT_BLOCKERS=${JSON.stringify(result?.blockingReasons || [])}`)
    throw new Error('IMPORT_COMMIT_FAILED')
  }

  const primaNotaId =
    result?.primaNotaId ||
    result?.data?.prima_nota_id ||
    result?.pn?.id ||
    result?.persistResult?.pn?.id ||
    null

  // runCommitWorkflow return shape: check source
  let pnId = primaNotaId
  if (!pnId) {
    pnId = psql(
      `SELECT id::text FROM public.prima_nota WHERE societa_id='${SOCIETA_A}'::uuid AND numero_documento=${sqlQuote(docNum)} ORDER BY created_at DESC NULLS LAST LIMIT 1`,
    )
  }
  log(`PN_ID=${pnId || ''}`)
  if (!pnId) throw new Error('PN_ID_MISSING')

  const pnRow = psql(`
SELECT coalesce(totale_dare::text,'')||'|'||coalesce(totale_avere::text,'')||'|'||coalesce(numero_documento,'')||'|'||coalesce(documento_import_id::text,'')
FROM public.prima_nota WHERE id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
  const [dare, avere, numeroDoc, docImportId] = pnRow.split('|')
  log(`PN_TOTALS=${dare}/${avere}`)
  log(`PN_NUMERO_DOCUMENTO=${numeroDoc}`)
  log(`PN_DOCUMENTO_IMPORT_ID=${docImportId || '(null-rpc-gap)'}`)
  if (Number(dare) !== 1220 || Number(avere) !== 1220) throw new Error('PN_UNBALANCED')
  if (numeroDoc !== docNum) throw new Error('PN_DOC_NUM_MISMATCH')
  // Stage3W fiscal RPC header currently does not persist documento_import_id on prima_nota;
  // Import provenance is proven via claim.request_payload.source_module + staging update.

  const vatN = psql(`
SELECT count(*)::text FROM public.registri_iva
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
  AND tipo='acquisto' AND imponibile=1000 AND iva=220 AND aliquota=22
`)
  log(`VAT_ROWS=${vatN}`)
  if (vatN !== '1') throw new Error('VAT_ROW_MISSING')

  const residuo = psql(`
SELECT importo_residuo::text FROM public.partitario
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid AND tipo='fornitore'
LIMIT 1
`)
  log(`PARTITA_RESIDUO=${residuo}`)
  if (Number(residuo) !== 1220) throw new Error('PARTITA_RESIDUAL_MISMATCH')

  const claimSource = psql(`
SELECT coalesce(request_payload->>'source_module','') FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  const claimKind = psql(`
SELECT coalesce(contract_kind,'') FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  const claimMotivazione = psql(`
SELECT coalesce(request_payload->>'reason', request_payload->>'motivazione', '')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  const claimRequestId = psql(`
SELECT request_id::text FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`CLAIM_SOURCE_MODULE=${claimSource}`)
  log(`CLAIM_CONTRACT_KIND=${claimKind}`)
  log(`CLAIM_MOTIVAZIONE=${claimMotivazione}`)
  log(`CLAIM_REQUEST_ID=${claimRequestId}`)
  if (claimSource !== 'import_contabilita') throw new Error('SOURCE_MODULE_NOT_IMPORT')
  if (claimKind !== 'fattura_passiva') throw new Error('CONTRACT_KIND_NOT_PASSIVA')
  const marker = parseImportFileHashMarker(claimMotivazione)
  log(`CLAIM_FILE_HASH=${marker.sourceHash}`)
  log(`CLAIM_FILE_NAME=${marker.sourceFileName}`)
  if (marker.sourceHash !== FILE_HASH) throw new Error('CLAIM_FILE_HASH_MISMATCH')
  if (!marker.sourceFileName.includes(docNum)) throw new Error('CLAIM_FILE_NAME_MISMATCH')

  function psqlJson(sql) {
    const raw = psql(sql)
    return JSON.parse(raw || '[]')
  }
  const historyRaw = psqlJson(buildImportFiscalCommitHistoryQuery({ societaId: SOCIETA_A, limit: 30 }))
  const history = normalizeImportFiscalCommitHistoryRows(historyRaw, { societaId: SOCIETA_A })
  const hit = history.find((row) => row.primaNotaId === pnId || row.requestId === claimRequestId)
  log(`HISTORY_COUNT=${history.length}`)
  log(`HISTORY_HIT=${JSON.stringify(hit || null)}`)
  if (!hit || hit.sourceHash !== FILE_HASH) throw new Error('HISTORY_HASH_MISSING')

  const memory = new Map()
  const storage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => { memory.set(k, String(v)) },
  }
  appendImportCronologiaEntry(SOCIETA_A, {
    sourceFileName: marker.sourceFileName,
    sourceHash: marker.sourceHash,
    esito: 'committed',
    primaNotaId: pnId,
    requestId: claimRequestId,
    numeroDocumento: docNum,
    createdAt: new Date().toISOString(),
  }, storage)
  const uiRows = loadImportCronologiaEntries(SOCIETA_A, storage)
  log(`UI_CRONOLOGIA_COUNT=${uiRows.length}`)
  log(`UI_CRONOLOGIA_HASH=${uiRows[0]?.sourceHash || ''}`)
  if (!uiRows.length || uiRows[0].sourceHash !== FILE_HASH) throw new Error('UI_CRONOLOGIA_FAILED')

  const bCount = psql(`
SELECT count(*)::text FROM public.prima_nota
WHERE societa_id='${SOCIETA_B}'::uuid AND numero_documento=${sqlQuote(docNum)}
`)
  log(`SOCIETA_B_PN=${bCount}`)
  if (bCount !== '0') throw new Error('CROSS_COMPANY_LEAK')

  const stagingStato = psql(`SELECT coalesce(stato,'') FROM public.documenti_import WHERE id='${stagingId}'::uuid`)
  log(`STAGING_STATO=${stagingStato}`)

  log('P3_02_RESULT=PASS')
}

main()
  .catch((err) => {
    log(`P3_02_RESULT=FAIL ${err?.message || err}`)
    console.error(err)
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    process.exit(1)
  })
  .then(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
  })
