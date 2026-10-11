/**
 * Stage3W SG-P2-02: IVA per cassa E2E via Import Contabilita (fiscal LAB).
 * Open FA vendita esigibilita differita + iva_per_cassa → June liquidazione excludes;
 * partial cash collection July → VAT rilascio proportional; July liquidazione includes quota.
 * LAB-only. Never prints tokens/passwords.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCommitWorkflow } from '../../src/modules/import_contabilita/application/importContabilitaWorkflow.js'
import { calcoloLiquidazioneIvaDefinitiva } from '../../src/modules/contabilita/domain/iva/calcoloLiquidazioneIvaDefinitiva.js'
import { calculateIvaPerCassaReleaseRatio } from '../../src/modules/contabilita/application/registrazioneOperations/ivaPerCassaRelease.js'

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
const CONTO_BANCA = '72000000-0000-4000-8000-000000000013'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_IMPORT_IVA_CASSA_COMMIT_${stamp}.txt`)

const GROSS = 1220
const TAXABLE = 1000
const VAT = 220
const PAY_AMOUNT = 500
const OPEN_DATE = '2026-06-10'
const PAY_DATE = '2026-07-12'

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
  '[SG-E2E] Import IVA per cassa P2-02',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET stato='pending', updated_at=now();
`)
}

function baseShell({ stagingId, docNum, registrationDate }) {
  return {
    societaId: SOCIETA_A,
    registrationDate,
    societa: { id: SOCIETA_A, codice: 'SG-E2E-A', denominazione: 'SG E2E synthetic company A' },
    sourceRow: { id: stagingId, filename: docNum + '.xml' },
    classification: { code: 'TD01', label: 'Documento', managed: true },
    readiness: { status: 'confermata', label: 'Pronto' },
  }
}

function buildOpenCassaPayload({ stagingId, docNum }) {
  return {
    ...baseShell({ stagingId, docNum, registrationDate: OPEN_DATE }),
    classification: { code: 'iva_cassa', label: 'IVA per cassa', managed: true },
    payload: {
      handoff: {
        sourceRowKey: stagingId,
        sourceFileName: docNum + '.xml',
        sourceBatchId: 'sg-e2e-imp-cassa',
        contractVersion: 'P7B-v3',
        operatorId: UTENTE_A,
        createdAt: new Date().toISOString(),
      },
      company: { societaId: SOCIETA_A, esercizioId: '2026' },
      document: {
        direction: 'vendita',
        number: docNum,
        documentDate: OPEN_DATE,
        registrationDate: OPEN_DATE,
        totals: { gross: GROSS, taxable: TAXABLE, vat: VAT },
        counterparty: {
          accountId: CONTO_CLIENTE,
          name: 'Cliente Cassa SG-E2E-A',
          taxCode: '33333333333',
          vatNumber: '33333333333',
        },
        flags: { ivaPerCassa: true },
      },
      accounting: {
        causaleContabile: {
          id: '',
          codice: 'FVC',
          code: 'FVC',
          description: 'Fattura attiva IVA per cassa',
          tipoCausale: 'docivaesigdifferita',
          isDocumentoIva: true,
          gestionePartitario: 'apertura',
          segnoRegistroIva: '+',
          registro_iva_differita: true,
          iva_per_cassa: true,
          codice_registro_iva: 'vendite',
          registroIva: 'vendite',
        },
        description: '[SG-E2E] Import IVA cassa open ' + docNum,
        isBalanced: true,
        totals: { debit: GROSS, credit: GROSS },
        rows: [
          {
            rowNumber: 1,
            accountId: CONTO_CLIENTE,
            accountCode: '1.01',
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
        competencePeriod: '2026-06',
        ivaPerCassa: true,
        rows: [
          {
            rowNumber: 1,
            imponibile: TAXABLE,
            imposta: VAT,
            aliquota: 22,
            causaleIvaId: 'iva-22',
            causaleIva: 'Aliquota 22%',
            esigibilita: 'Differita',
            ivaPerCassa: true,
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
            dueDate: '2026-07-10',
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
  return {
    ...baseShell({ stagingId, docNum, registrationDate: PAY_DATE }),
    classification: { code: 'PAY', label: 'Incasso', managed: true },
    payload: {
      handoff: {
        sourceRowKey: stagingId,
        sourceFileName: docNum + '.xml',
        sourceBatchId: 'sg-e2e-imp-cassa',
        contractVersion: 'P7B-v3',
        operatorId: UTENTE_A,
        createdAt: new Date().toISOString(),
      },
      company: { societaId: SOCIETA_A, esercizioId: '2026' },
      document: {
        direction: 'vendita',
        number: docNum,
        documentDate: PAY_DATE,
        registrationDate: PAY_DATE,
        totals: { gross: amount, taxable: 0, vat: 0 },
        counterparty: {
          accountId: CONTO_CLIENTE,
          name: 'Cliente Cassa SG-E2E-A',
          taxCode: '33333333333',
          vatNumber: '33333333333',
        },
      },
      accounting: {
        causaleContabile: {
          id: '',
          codice: 'INC',
          code: 'INC',
          description: 'Incasso cliente IVA cassa',
          tipoCausale: 'movimentogenerale',
          gestionePartitario: 'chiusura',
          operazione_partite: 'chiude',
          isDocumentoIva: false,
        },
        description: '[SG-E2E] Import IVA cassa pay ' + docNum,
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
            paymentDate: PAY_DATE,
          },
        ],
      },
      validation: { status: 'confermata', blockers: [], warnings: [] },
      automationMeta: { mode: 'automatic', code: 'PAY' },
    },
  }
}

function resolvePnId(result, docNum) {
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
  return pnId
}

async function main() {
  log('P2_02_START Import IVA per cassa open + cash release')
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
  const password = 'SgE2eCassa!' + randomBytes(8).toString('base64url')
  ensureAuthPassword(password)

  const userClient = createClient(AUTH_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: authData, error: authError } = await userClient.auth.signInWithPassword({
    email: EMAIL_A,
    password,
  })
  if (authError || !authData?.session?.access_token) throw new Error('LOGIN_FAILED')
  log('LOGIN_JWT=PASS')

  const openStaging = randomUUID()
  const openDoc = `SG-E2E-P202-CASSA-${stamp.slice(-6)}`
  insertStaging(openStaging, openDoc, 'fattura_attiva')
  log(`OPEN_DOC=${openDoc}`)

  const openRes = await runCommitWorkflow(buildOpenCassaPayload({ stagingId: openStaging, docNum: openDoc }), {
    db: userClient,
  })
  log(`OPEN_SUCCESS=${Boolean(openRes?.success)}`)
  if (!openRes?.success) {
    log(`OPEN_BLOCKERS=${JSON.stringify(openRes?.blockingReasons || [])}`)
    throw new Error('OPEN_CASSA_FAILED')
  }
  const openPn = resolvePnId(openRes, openDoc)
  log(`OPEN_PN_ID=${openPn}`)
  if (!openPn) throw new Error('OPEN_PN_MISSING')

  const vatOpen = psql(`
SELECT coalesce(esigibilita,'')||'|'||coalesce(iva::text,'')||'|'||coalesce(imponibile::text,'')||'|'||coalesce(tipo,'')
FROM public.registri_iva
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`VAT_OPEN=${vatOpen}`)
  const [esigOpen, ivaOpen, impOpen, tipoOpen] = vatOpen.split('|')
  if (String(esigOpen).toLowerCase() !== 'differita') throw new Error('VAT_NOT_DIFFERITA')
  if (Number(ivaOpen) !== VAT || Number(impOpen) !== TAXABLE || tipoOpen !== 'vendita') {
    throw new Error('VAT_OPEN_AMOUNTS')
  }

  const partita = psql(`
SELECT id::text||'|'||coalesce(importo_residuo::text,'0')||'|'||coalesce(iva_per_cassa::text,'f')
FROM public.partitario
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid AND tipo='cliente'
LIMIT 1
`)
  log(`PARTITA=${partita}`)
  const [partitaId, residuoOpen, ivaCassaFlag] = partita.split('|')
  if (!partitaId) throw new Error('PARTITA_MISSING')
  if (Number(residuoOpen) !== GROSS) throw new Error('PARTITA_OPEN_RESIDUO')
  if (ivaCassaFlag !== 't' && ivaCassaFlag !== 'true') throw new Error('PARTITA_IVA_CASSA_FALSE')

  const claimOpen = psql(`
SELECT coalesce(contract_kind,'')||'|'||coalesce(request_payload->>'source_module','')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`CLAIM_OPEN=${claimOpen}`)

  // June liquidazione: differita excluded from debito
  const juneRows = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT id, societa_id::text AS societa_id, documento_id, data::text AS data,
         imponibile, iva, aliquota, tipo, esigibilita, split_payment,
         iva_detraibile, iva_indetraibile
  FROM public.registri_iva
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND documento_id=${sqlQuote(openDoc)}
    AND data >= '2026-06-01' AND data <= '2026-06-30'
) t
`)
  const calcJune = calcoloLiquidazioneIvaDefinitiva(juneRows || [], {
    societaId: SOCIETA_A,
    periodoInizio: '2026-06-01',
    periodoFine: '2026-06-30',
    periodicita: 'mensile',
  })
  log(`LIQ_JUNE_DEBITO=${calcJune.ivaDebitoEffettiva}`)
  log(`LIQ_JUNE_DIFFERITA_V=${calcJune.ivaPerCassaDifferitaVendite}`)
  log(`LIQ_JUNE_INCLUSE=${calcJune.righeIncluseCount}`)
  if (Number(calcJune.ivaDebitoEffettiva) !== 0) throw new Error('JUNE_DEBITO_NOT_ZERO')
  if (Number(calcJune.ivaPerCassaDifferitaVendite) !== VAT) throw new Error('JUNE_DIFFERITA_MISSING')
  if (Number(calcJune.righeIncluseCount) !== 0) throw new Error('JUNE_SHOULD_EXCLUDE_ALL')

  // Partial collection July
  const payStaging = randomUUID()
  const payDoc = `SG-E2E-P202-PAY-${stamp.slice(-6)}`
  insertStaging(payStaging, payDoc, 'incasso')
  const payRes = await runCommitWorkflow(
    buildPayPayload({ stagingId: payStaging, docNum: payDoc, partitaId, amount: PAY_AMOUNT }),
    { db: userClient },
  )
  log(`PAY_SUCCESS=${Boolean(payRes?.success)}`)
  if (!payRes?.success) {
    log(`PAY_BLOCKERS=${JSON.stringify(payRes?.blockingReasons || [])}`)
    throw new Error('PAY_FAILED')
  }
  const payPn = resolvePnId(payRes, payDoc)
  log(`PAY_PN_ID=${payPn}`)

  const residuoAfter = Number(psql(`SELECT importo_residuo::text FROM public.partitario WHERE id='${partitaId}'::uuid`))
  log(`PARTITA_AFTER=${residuoAfter}`)
  if (residuoAfter !== GROSS - PAY_AMOUNT) throw new Error('PARTITA_RESIDUAL_MISMATCH')

  const ratio = calculateIvaPerCassaReleaseRatio(PAY_AMOUNT, GROSS)
  const expectReleaseIva = round2(VAT * ratio)
  const expectReleaseImp = round2(TAXABLE * ratio)
  log(`EXPECT_RELEASE_IVA=${expectReleaseIva}`)
  log(`EXPECT_RELEASE_IMP=${expectReleaseImp}`)

  const releaseVat = psql(`
SELECT coalesce(esigibilita,'')||'|'||coalesce(iva::text,'')||'|'||coalesce(imponibile::text,'')||'|'||coalesce(data::text,'')
FROM public.registri_iva
WHERE societa_id='${SOCIETA_A}'::uuid
  AND prima_nota_id='${payPn}'::uuid
  AND esigibilita='rilascio'
LIMIT 1
`)
  log(`VAT_RELEASE=${releaseVat}`)
  if (!releaseVat) throw new Error('RELEASE_VAT_MISSING')
  const [esigRel, ivaRel, impRel, dataRel] = releaseVat.split('|')
  if (esigRel !== 'rilascio') throw new Error('RELEASE_ESIG_MISMATCH')
  if (Number(ivaRel) !== expectReleaseIva) throw new Error('RELEASE_IVA_MISMATCH')
  if (Number(impRel) !== expectReleaseImp) throw new Error('RELEASE_IMP_MISMATCH')
  if (!String(dataRel).startsWith('2026-07')) throw new Error('RELEASE_DATE_NOT_JULY')

  const claimPay = psql(`
SELECT coalesce(contract_kind,'')||'|'||coalesce(request_payload->>'source_module','')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${payPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`CLAIM_PAY=${claimPay}`)
  if (!String(claimPay).startsWith('pagamento|import_contabilita')) throw new Error('PAY_CLAIM_MISMATCH')

  // July liquidazione: only this release row for our doc (filter by pay PN + open doc release)
  const julyRows = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT id, societa_id::text AS societa_id, documento_id, data::text AS data,
         imponibile, iva, aliquota, tipo, esigibilita, split_payment,
         iva_detraibile, iva_indetraibile
  FROM public.registri_iva
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND prima_nota_id='${payPn}'::uuid
    AND esigibilita='rilascio'
) t
`)
  const calcJuly = calcoloLiquidazioneIvaDefinitiva(julyRows || [], {
    societaId: SOCIETA_A,
    periodoInizio: '2026-07-01',
    periodoFine: '2026-07-31',
    periodicita: 'mensile',
  })
  log(`LIQ_JULY_DEBITO=${calcJuly.ivaDebitoEffettiva}`)
  log(`LIQ_JULY_RILASCIATA_V=${calcJuly.ivaPerCassaRilasciataVendite}`)
  if (Number(calcJuly.ivaDebitoEffettiva) !== expectReleaseIva) throw new Error('JULY_DEBITO_MISMATCH')
  if (Number(calcJuly.ivaPerCassaRilasciataVendite) !== expectReleaseIva) throw new Error('JULY_RILASCIO_MISMATCH')

  // Differita still excluded in July if we include open row by date (open is June)
  const calcJuneAfter = calcoloLiquidazioneIvaDefinitiva(juneRows || [], {
    societaId: SOCIETA_A,
    periodoInizio: '2026-06-01',
    periodoFine: '2026-06-30',
    periodicita: 'mensile',
  })
  if (Number(calcJuneAfter.ivaDebitoEffettiva) !== 0) throw new Error('JUNE_STILL_MUST_EXCLUDE')

  log('P2_02_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P2_02_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P2_02_RESULT=FAIL'))) process.exit(1)
  })
