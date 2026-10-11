/**
 * Stage3W SG-P1-05: same FP22 economics via Import vs Manuale (persistPrimaNotaDraft),
 * compare hashed PG effects (totals/VAT/partita/contract_kind). source_module may differ.
 * LAB-only. Never prints tokens/passwords.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCommitWorkflow } from '../../src/modules/import_contabilita/application/importContabilitaWorkflow.js'
import { persistPrimaNotaDraft } from '../../src/modules/contabilita/application/persistPrimaNotaDraft.js'

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
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_IMPORT_VS_MANUALE_EQUIV_${stamp}.txt`)

const GROSS = 1220
const TAXABLE = 1000
const VAT = 220

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
  '[SG-E2E] Import vs Manuale equiv staging',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET stato='pending', updated_at=now();
`)
}

function buildImportPayload({ stagingId, docNum }) {
  return {
    societaId: SOCIETA_A,
    registrationDate: '2026-04-28',
    societa: { id: SOCIETA_A, codice: 'SG-E2E-A', denominazione: 'SG E2E synthetic company A' },
    sourceRow: { id: stagingId, filename: docNum + '.xml' },
    classification: { code: 'TD01', label: 'Fattura passiva', managed: true },
    readiness: { status: 'confermata', label: 'Pronto' },
    payload: {
      handoff: {
        sourceRowKey: stagingId,
        sourceFileName: docNum + '.xml',
        sourceBatchId: 'sg-e2e-equiv',
        contractVersion: 'P7B-v3',
        operatorId: UTENTE_A,
        createdAt: new Date().toISOString(),
      },
      company: { societaId: SOCIETA_A, esercizioId: '2026' },
      document: {
        direction: 'acquisto',
        number: docNum,
        documentDate: '2026-04-28',
        registrationDate: '2026-04-28',
        totals: { gross: GROSS, taxable: TAXABLE, vat: VAT },
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
        description: '[SG-E2E] Equiv Import ' + docNum,
        isBalanced: true,
        totals: { debit: GROSS, credit: GROSS },
        rows: [
          {
            rowNumber: 1,
            accountId: CONTO_COSTO,
            accountCode: '5.01',
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
        competencePeriod: '2026-04',
        rows: [
          {
            rowNumber: 1,
            imponibile: TAXABLE,
            imposta: VAT,
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
        accountId: CONTO_FORN,
        subjectId: CONTO_FORN,
        rows: [{ rowNumber: 1, action: 'open', amount: GROSS, dueDate: '2026-05-28', documentRef: docNum }],
      },
      validation: { status: 'confermata', blockers: [], warnings: [] },
      automationMeta: { mode: 'automatic', code: 'TD01' },
    },
  }
}

function buildManualeDraft({ docNum }) {
  return {
    pnPayload: {
      societa_id: SOCIETA_A,
      esercizio: 2026,
      data_registrazione: '2026-04-28',
      data_documento: '2026-04-28',
      numero_documento: docNum,
      causale_codice: 'FF',
      descrizione: '[SG-E2E] Equiv Manuale ' + docNum,
      cliente_fornitore_id: CONTO_FORN,
      cliente_fornitore_nome: 'Fornitore SG-E2E-A',
      totale_dare: GROSS,
      totale_avere: GROSS,
      stato: 'confermata',
    },
    righePayload: [
      {
        conto_id: CONTO_COSTO,
        conto_codice: '5.01',
        descrizione_riga: 'Costo',
        dare: TAXABLE,
        avere: 0,
        riga_numero: 1,
      },
      {
        conto_id: CONTO_IVA,
        conto_codice: '2.02',
        descrizione_riga: 'IVA',
        dare: VAT,
        avere: 0,
        riga_numero: 2,
      },
      {
        conto_id: CONTO_FORN,
        conto_codice: '2.10',
        descrizione_riga: 'Fornitore',
        dare: 0,
        avere: GROSS,
        riga_numero: 3,
      },
    ],
    header: {
      societaId: SOCIETA_A,
      esercizioContabile: '2026',
      dataRegistrazione: '2026-04-28',
      dataDocumento: '2026-04-28',
      causaleContabile: {
        codice: 'FF',
        code: 'FF',
        description: 'Fattura passiva',
        tipoCausale: 'docivanormale',
        isDocumentoIva: true,
        gestionePartitario: 'apertura',
        segnoRegistroIva: '+',
      },
      descrizioneGenerale: '[SG-E2E] Equiv Manuale ' + docNum,
      clienteFornitoreId: CONTO_FORN,
      clienteFornitoreNome: 'Fornitore SG-E2E-A',
    },
    totals: { totaleDare: GROSS, totaleAvere: GROSS, differenza: 0, isBalanced: true },
    meta: {
      operatorId: UTENTE_A,
      createdAt: new Date().toISOString(),
      behavior: {
        code: 'FF',
        showDocumentPanel: true,
        showIvaPanel: true,
        showPartitario: true,
        showRitenute: false,
      },
    },
    ivaDraft: {
      active: true,
      registroIva: 'acquisti',
      esigibilita: 'immediata',
      rows: [
        {
          riga: 1,
          imponibile: TAXABLE,
          iva: VAT,
          aliquota: 22,
          causaleIvaId: 'iva-22',
          causaleIvaLabel: 'Aliquota 22%',
          esigibilita: 'Immediata',
          splitPayment: false,
        },
      ],
    },
    partitarioDraft: {
      active: true,
      mode: 'apertura',
      accountId: CONTO_FORN,
      soggettoId: CONTO_FORN,
      soggettoNome: 'Fornitore SG-E2E-A',
      amount: GROSS,
      rows: [
        {
          riga: 1,
          soggettoId: CONTO_FORN,
          accountId: CONTO_FORN,
          soggettoNome: 'Fornitore SG-E2E-A',
          soggettoTipo: 'fornitore',
          importoOriginario: GROSS,
          importoAperto: GROSS,
          dataScadenza: '2026-05-28',
          dataDocumento: '2026-04-28',
          numeroDocumento: docNum,
        },
      ],
    },
    ritenutaDraft: { active: false, rows: [] },
  }
}

function loadEffects(pnId) {
  const totals = psql(`
SELECT coalesce(totale_dare::text,'')||'|'||coalesce(totale_avere::text,'')
FROM public.prima_nota WHERE id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
  const [dare, avere] = totals.split('|')
  const vatLines = psql(`
SELECT string_agg(tipo||'|'||aliquota::text||'|'||imponibile::text||'|'||iva::text, ';' ORDER BY aliquota, imponibile)
FROM public.registri_iva
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
  const part = psql(`
SELECT coalesce(tipo,'')||'|'||coalesce(importo_originale::text,'')||'|'||coalesce(importo_residuo::text,'')
FROM public.partitario
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
ORDER BY created_at NULLS LAST
LIMIT 1
`)
  const kind = psql(`
SELECT coalesce(contract_kind,'')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  const source = psql(`
SELECT coalesce(request_payload->>'source_module','')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  const rows = psql(`
SELECT string_agg(conto_id::text||'|'||coalesce(importo_dare::text,'0')||'|'||coalesce(importo_avere::text,'0'), ';' ORDER BY riga_numero, conto_id)
FROM public.prima_nota_righe
WHERE prima_nota_id='${pnId}'::uuid
`)
  return {
    dare: Number(dare),
    avere: Number(avere),
    vat: vatLines || '',
    partita: part || '',
    contract_kind: kind || '',
    source_module: source || '',
    rows: rows || '',
  }
}

function effectFingerprint(effects) {
  // Exclude source_module (import vs manual by design)
  const canonical = {
    dare: effects.dare,
    avere: effects.avere,
    vat: effects.vat,
    partita: effects.partita,
    contract_kind: effects.contract_kind,
    rows: effects.rows,
  }
  const json = JSON.stringify(canonical)
  return {
    json,
    hash: createHash('sha256').update(json).digest('hex'),
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
  const password = 'SgE2eEq!' + randomBytes(10).toString('base64url')
  ensureAuthPassword(password)
  ensureAccounts()

  log('P1_05_START Import vs Manuale equivalence FP22')

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

  const suffix = stamp.slice(-8)
  const importDoc = 'SG-E2E-EQ-IMP-' + suffix
  const manualDoc = 'SG-E2E-EQ-MAN-' + suffix
  const stagingId = randomUUID()
  insertStaging(stagingId, importDoc)

  const importRes = await runCommitWorkflow(buildImportPayload({ stagingId, docNum: importDoc }), {
    db: userClient,
  })
  log(`IMPORT_SUCCESS=${Boolean(importRes?.success)}`)
  if (!importRes?.success) {
    log(`IMPORT_BLOCKERS=${JSON.stringify(importRes?.blockingReasons || [])}`)
    throw new Error('IMPORT_COMMIT_FAILED')
  }
  const importPn = importRes.primaNotaId
  log(`IMPORT_PN_ID=${importPn}`)

  const manualRes = await persistPrimaNotaDraft({
    db: userClient,
    draft: buildManualeDraft({ docNum: manualDoc }),
    fiscalPersistLab: true,
  })
  log(`MANUAL_ERROR=${manualRes?.error?.message || ''}`)
  if (manualRes?.error) throw new Error('MANUAL_PERSIST_FAILED:' + manualRes.error.message)
  const manualPn = manualRes?.pn?.id || manualRes?.data?.id || manualRes?.data?.primaNotaId
  log(`MANUAL_PN_ID=${manualPn || ''}`)
  log(`MANUAL_FISCAL_LAB=${Boolean(manualRes?.fiscalLab)}`)
  if (!manualPn) throw new Error('MANUAL_PN_MISSING')
  if (!manualRes.fiscalLab) throw new Error('MANUAL_NOT_FISCAL_LAB')

  const importFx = loadEffects(importPn)
  const manualFx = loadEffects(manualPn)
  log(`IMPORT_SOURCE=${importFx.source_module}`)
  log(`MANUAL_SOURCE=${manualFx.source_module}`)
  log(`IMPORT_KIND=${importFx.contract_kind}`)
  log(`MANUAL_KIND=${manualFx.contract_kind}`)

  if (importFx.source_module !== 'import_contabilita') throw new Error('IMPORT_SOURCE_WRONG')
  if (manualFx.source_module !== 'registrazione_manual') throw new Error('MANUAL_SOURCE_WRONG')

  const importFp = effectFingerprint(importFx)
  const manualFp = effectFingerprint(manualFx)
  log(`IMPORT_HASH=${importFp.hash}`)
  log(`MANUAL_HASH=${manualFp.hash}`)
  log(`IMPORT_EFFECTS=${importFp.json}`)
  log(`MANUAL_EFFECTS=${manualFp.json}`)

  if (importFp.hash !== manualFp.hash) throw new Error('EFFECT_HASH_MISMATCH')
  log('P1_05_RESULT=PASS')
}

main()
  .catch((err) => {
    log(`P1_05_RESULT=FAIL ${err?.message || err}`)
    console.error(err)
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    process.exit(1)
  })
  .then(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
  })
