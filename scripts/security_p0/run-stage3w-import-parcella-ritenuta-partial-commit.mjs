/**
 * Stage3W SG-P2-05: Import Contabilita parcella + pagamento parziale con ritenuta
 * pro-quota (fiscal LAB). Open full → JWT pay 50% netto → residual aperta + matured
 * da_versare slice → scadenzario/CU on matured amount only.
 * LAB-only. Never prints tokens/passwords.
 */
import { calculateRitenutaPartialMaturation } from '../../src/modules/contabilita/domain/ritenute/calculateRitenutaPartialMaturation.js'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCommitWorkflow } from '../../src/modules/import_contabilita/application/importContabilitaWorkflow.js'
import { buildRitenuteScadenzarioRows } from '../../src/modules/contabilita/application/ritenute/ritenuteScadenzarioService.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API_ORIGIN = 'http://127.0.0.1:3001'
const API = API_ORIGIN + '/api/studio/fiscal-journal-post'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const UTENTE_A = '72000000-0000-4000-8000-000000000005'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA = '72000000-0000-4000-8000-000000000012'
const CONTO_BANCA = '72000000-0000-4000-8000-000000000013'
const CONTO_ERARIO = '72000000-0000-4000-8000-000000000018'
const CONTO_CASSA = '72000000-0000-4000-8000-000000000019'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_IMPORT_PARCELLA_RITENUTA_PARTIAL_COMMIT_${stamp}.txt`)

const COMPENSO = 1000
const CASSA_PREV = 40
const RITENUTA = 200
const IVA = 228.8
const NETTO_CLIENTE = 1068.8
const PAY_PARTIAL = 534.4
const PN_TOTAL = 1268.8
const VAT_TAXABLE = 1040
const OPEN_DATE = '2026-09-10'
const PAY_DATE = '2026-09-20'
const PARTIAL_SPLIT = calculateRitenutaPartialMaturation({
  importoPagamento: PAY_PARTIAL,
  importoResiduoPartita: NETTO_CLIENTE,
  importoRitenuta: RITENUTA,
  imponibileRitenuta: COMPENSO,
  compensoLordo: COMPENSO,
})

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
 ('${CONTO_BANCA}','${SOCIETA_A}','1.10','Banca SG-E2E-A','patrimoniale',true),
 ('${CONTO_ERARIO}','${SOCIETA_A}','2.20','Erario ritenute SG-E2E-A','patrimoniale',true),
 ('${CONTO_CASSA}','${SOCIETA_A}','4.02','Cassa previdenziale SG-E2E-A','economico',true)
ON CONFLICT (id) DO NOTHING;
`)
}

function ensurePercipiente(percipienteId) {
  psql(`
INSERT INTO public.percipienti (
  id, societa_id, tipo_persona, codice_fiscale, ragione_sociale, nome, cognome,
  causale_prevalente, aliquota_ritenuta, attivo
) VALUES (
  '${percipienteId}'::uuid,
  '${SOCIETA_A}'::uuid,
  'fisica',
  'RSSMRA80A01H501U',
  'Professionista SG-E2E',
  'Mario',
  'Rossi',
  'A',
  20,
  true
)
ON CONFLICT (id) DO UPDATE SET
  codice_fiscale=EXCLUDED.codice_fiscale,
  ragione_sociale=EXCLUDED.ragione_sociale,
  attivo=true;
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
  '[SG-E2E] Import parcella ritenuta P2-05 partial',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET stato='pending', updated_at=now();
`)
}

function buildOpenPayload({ stagingId, docNum, percipienteId }) {
  return {
    societaId: SOCIETA_A,
    registrationDate: OPEN_DATE,
    societa: { id: SOCIETA_A, codice: 'SG-E2E-A', denominazione: 'SG E2E synthetic company A' },
    sourceRow: { id: stagingId, filename: docNum + '.xml' },
    classification: { code: 'parcella_ritenuta', label: 'Parcella con ritenuta', managed: true },
    readiness: { status: 'confermata', label: 'Pronto' },
    payload: {
      handoff: {
        sourceRowKey: stagingId,
        sourceFileName: docNum + '.xml',
        sourceBatchId: 'sg-e2e-imp-parc',
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
        totals: {
          gross: PN_TOTAL,
          taxable: VAT_TAXABLE,
          vat: IVA,
          withholding: RITENUTA,
          netPayable: NETTO_CLIENTE,
        },
        counterparty: {
          accountId: CONTO_CLIENTE,
          name: 'Cliente Parcella SG-E2E-A',
          taxCode: '44444444444',
          vatNumber: '44444444444',
        },
        flags: { hasRitenuta: true, isProfessional: true },
      },
      accounting: {
        causaleContabile: {
          id: '',
          codice: 'PAR',
          code: 'PAR',
          description: 'Parcella con ritenuta',
          tipoCausale: 'docivanormale',
          isDocumentoIva: true,
          gestionePartitario: 'apertura',
          segnoRegistroIva: '+',
          opRitenute: 'documento',
          codice_registro_iva: 'vendite',
          registroIva: 'vendite',
        },
        description: '[SG-E2E] Import parcella ritenuta ' + docNum,
        isBalanced: true,
        totals: { debit: PN_TOTAL, credit: PN_TOTAL },
        rows: [
          {
            rowNumber: 1,
            accountId: CONTO_CLIENTE,
            accountCode: '1.01',
            debit: NETTO_CLIENTE,
            credit: 0,
            dare: NETTO_CLIENTE,
            avere: 0,
            description: 'Cliente netto',
          },
          {
            rowNumber: 2,
            accountId: CONTO_ERARIO,
            accountCode: '2.20',
            debit: RITENUTA,
            credit: 0,
            dare: RITENUTA,
            avere: 0,
            description: 'Ritenuta 1040',
          },
          {
            rowNumber: 3,
            accountId: CONTO_RICAVO,
            accountCode: '4.01',
            debit: 0,
            credit: COMPENSO,
            dare: 0,
            avere: COMPENSO,
            description: 'Compenso',
          },
          {
            rowNumber: 4,
            accountId: CONTO_CASSA,
            accountCode: '4.02',
            debit: 0,
            credit: CASSA_PREV,
            dare: 0,
            avere: CASSA_PREV,
            description: 'Cassa previdenziale',
          },
          {
            rowNumber: 5,
            accountId: CONTO_IVA,
            accountCode: '2.01',
            debit: 0,
            credit: IVA,
            dare: 0,
            avere: IVA,
            description: 'IVA',
          },
        ],
      },
      vat: {
        enabled: true,
        registerType: 'vendite',
        competencePeriod: '2026-09',
        rows: [
          {
            rowNumber: 1,
            imponibile: VAT_TAXABLE,
            imposta: IVA,
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
            amount: NETTO_CLIENTE,
            dueDate: '2026-10-10',
            documentRef: docNum,
          },
        ],
      },
      withholding: {
        enabled: true,
        supported: true,
        recipient: {
          anagraficaId: percipienteId,
          denominazione: 'Professionista SG-E2E',
          codiceFiscale: 'RSSMRA80A01H501U',
          partitaIva: '',
          paese: 'IT',
        },
        rows: [
          {
            rowNumber: 1,
            baseAmount: COMPENSO,
            rate: 20,
            amount: RITENUTA,
            netPaid: NETTO_CLIENTE,
            causaleCu: 'A',
            tributeCode: '1040',
          },
        ],
      },
      validation: { status: 'confermata', blockers: [], warnings: [] },
      automationMeta: { mode: 'automatic', code: 'TD06' },
    },
  }
}

async function postFiscal(token, payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* keep */
  }
  return { status: res.status, json, text }
}

async function main() {
  log('P2_05_START Import parcella + pagamento parziale ritenuta pro-quota')
  log(`PARTIAL_SPLIT=${JSON.stringify(PARTIAL_SPLIT)}`)
  if (PARTIAL_SPLIT.kind !== 'parziale') throw new Error('SPLIT_NOT_PARTIAL')
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
  const percipienteId = randomUUID()
  ensurePercipiente(percipienteId)
  log(`PERCIPIENTE_ID=${percipienteId}`)

  const password = 'SgE2eParc!' + randomBytes(8).toString('base64url')
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

  const stagingId = randomUUID()
  const docNum = `SG-E2E-P205-PARC-${stamp.slice(-6)}`
  insertStaging(stagingId, docNum, 'parcella')
  log(`OPEN_DOC=${docNum}`)

  const openRes = await runCommitWorkflow(buildOpenPayload({ stagingId, docNum, percipienteId }), {
    db: client,
  })
  log(`OPEN_SUCCESS=${Boolean(openRes?.success)}`)
  if (!openRes?.success) {
    log(`OPEN_BLOCKERS=${JSON.stringify(openRes?.blockingReasons || [])}`)
    throw new Error('OPEN_PARCELLA_FAILED')
  }

  let openPn =
    openRes?.primaNotaId ||
    openRes?.data?.prima_nota_id ||
    openRes?.pn?.id ||
    openRes?.persistResult?.pn?.id ||
    null
  if (!openPn) {
    openPn = psql(
      `SELECT id::text FROM public.prima_nota WHERE societa_id='${SOCIETA_A}'::uuid AND numero_documento=${sqlQuote(docNum)} ORDER BY created_at DESC NULLS LAST LIMIT 1`,
    )
  }
  log(`OPEN_PN_ID=${openPn}`)
  if (!openPn) throw new Error('OPEN_PN_MISSING')

  const pn = psql(`
SELECT coalesce(totale_dare::text,'')||'|'||coalesce(totale_avere::text,'')
FROM public.prima_nota WHERE id='${openPn}'::uuid
`)
  log(`PN_TOTALS=${pn}`)
  const [dare, avere] = pn.split('|')
  if (Number(dare) !== PN_TOTAL || Number(avere) !== PN_TOTAL) throw new Error('PN_UNBALANCED')

  const partita = psql(`
SELECT id::text||'|'||coalesce(importo_residuo::text,'0')||'|'||coalesce(tipo,'')
FROM public.partitario
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`PARTITA=${partita}`)
  const [partitaId, partResiduo, partTipo] = partita.split('|')
  if (!partitaId) throw new Error('PARTITA_MISSING')
  if (Number(partResiduo) !== NETTO_CLIENTE) throw new Error('PARTITA_NOT_NETTO')
  if (partTipo !== 'cliente') throw new Error('PARTITA_NOT_CLIENTE')

  let ritRow
  try {
    ritRow = psqlJson(`
SELECT row_to_json(t) FROM (
  SELECT id::text AS id, percipiente_id::text AS percipiente_id, percipiente_cf,
         percipiente_denominazione, importo_ritenuta, imponibile_ritenuta, aliquota_ritenuta,
         codice_tributo, stato, causale_prestazione, contributo_cassa_prev
  FROM public.ritenute_dacconto
  WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
  LIMIT 1
) t
`)
  } catch (e) {
    throw new Error('RITENUTA_ROW_MISSING:' + e.message)
  }
  log(`RITENUTA=${JSON.stringify(ritRow)}`)
  if (Number(ritRow.importo_ritenuta) !== RITENUTA) throw new Error('RIT_AMOUNT')
  if (Number(ritRow.imponibile_ritenuta) !== COMPENSO) throw new Error('RIT_IMPONIBILE')
  if (String(ritRow.codice_tributo) !== '1040') throw new Error('RIT_NOT_1040')
  if (String(ritRow.stato) !== 'aperta') throw new Error('RIT_NOT_APERTA')
  if (String(ritRow.percipiente_id) !== percipienteId) throw new Error('RIT_PERCIPIENTE')
  if (String(ritRow.percipiente_cf) !== 'RSSMRA80A01H501U') throw new Error('RIT_CF')
  if (String(ritRow.causale_prestazione || '') !== 'A') throw new Error('RIT_CAUSALE_CU')

  const claimOpen = psql(`
SELECT coalesce(contract_kind,'')||'|'||coalesce(request_payload->>'source_module','')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`CLAIM_OPEN=${claimOpen}`)
  if (!String(claimOpen).startsWith('parcella_documento|import_contabilita')) {
    throw new Error('CLAIM_OPEN_MISMATCH')
  }

  const vat = psql(`
SELECT coalesce(tipo,'')||'|'||coalesce(imponibile::text,'')||'|'||coalesce(iva::text,'')
FROM public.registri_iva WHERE prima_nota_id='${openPn}'::uuid LIMIT 1
`)
  log(`VAT=${vat}`)
  const [vatTipo, vatImp, vatIva] = vat.split('|')
  if (vatTipo !== 'vendita' || Number(vatImp) !== VAT_TAXABLE || Number(vatIva) !== IVA) {
    throw new Error('VAT_MISMATCH')
  }

  // Partial cash collection: close 50% netto + split withholding residual/matured
  const payReq = randomUUID()
  const payBody = {
    societa_id: SOCIETA_A,
    request_id: payReq,
    contract_kind: 'pagamento',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E P2-05 maturazione pro-quota ritenuta su incasso parziale',
    header: {
      data_registrazione: PAY_DATE,
      data_documento: PAY_DATE,
      numero_documento: `PAY-PART-${docNum}`,
      descrizione: '[SG-E2E] Incasso parziale parcella + maturazione 1040 pro-quota',
    },
    rows: [
      { conto_id: CONTO_BANCA, dare: PAY_PARTIAL, avere: 0 },
      { conto_id: CONTO_CLIENTE, dare: 0, avere: PAY_PARTIAL },
    ],
    ledger: {
      mode: 'close',
      openings: [],
      closures: [{ partita_id: partitaId, importo_chiuso: PAY_PARTIAL }],
    },
    withholding: {
      eventType: 'pagamento',
      updates: [
        {
          id: ritRow.id,
          stato: 'aperta',
          importo_ritenuta: PARTIAL_SPLIT.residual.importo_ritenuta,
          ritenuta: PARTIAL_SPLIT.residual.importo_ritenuta,
          imponibile_ritenuta: PARTIAL_SPLIT.residual.imponibile_ritenuta,
          compenso_lordo: PARTIAL_SPLIT.residual.compenso_lordo,
          compenso_netto: PARTIAL_SPLIT.residual.compenso_netto,
          codice_tributo: '1040',
        },
      ],
      inserts: [
        {
          percipiente_id: percipienteId,
          percipiente_cf: 'RSSMRA80A01H501U',
          percipiente_denominazione: 'Professionista SG-E2E',
          prima_nota_id: openPn,
          partitario_id: partitaId,
          data_documento: OPEN_DATE,
          numero_documento: docNum,
          data_pagamento: PAY_DATE,
          data_scadenza: '2026-10-16',
          periodo_riferimento: '09/2026',
          anno_riferimento: 2026,
          compenso_lordo: PARTIAL_SPLIT.matured.compenso_lordo,
          imponibile_ritenuta: PARTIAL_SPLIT.matured.imponibile_ritenuta,
          aliquota_ritenuta: 20,
          importo_ritenuta: PARTIAL_SPLIT.matured.importo_ritenuta,
          compenso_netto: PARTIAL_SPLIT.matured.compenso_netto,
          codice_tributo: '1040',
          stato: 'da_versare',
          causale_prestazione: 'A',
          inclusa_cu: true,
        },
      ],
    },
  }

  const payRes = await postFiscal(token, payBody)
  log(`PAY_STATUS=${payRes.status}`)
  log(`PAY_OK=${Boolean(payRes.json?.ok)}`)
  log(`PAY_PN_ID=${payRes.json?.id || ''}`)
  if (payRes.status !== 201 || !payRes.json?.ok || !payRes.json?.id) {
    log(`PAY_BODY=${(payRes.text || '').slice(0, 500)}`)
    throw new Error('PAY_PARTIAL_MATURATION_FAILED')
  }

  const ritResidual = psqlJson(`
SELECT row_to_json(t) FROM (
  SELECT id::text AS id, stato, importo_ritenuta, imponibile_ritenuta,
         prima_nota_pagamento_id::text AS prima_nota_pagamento_id
  FROM public.ritenute_dacconto WHERE id='${ritRow.id}'::uuid
) t
`)
  log(`RITENUTA_RESIDUAL=${JSON.stringify(ritResidual)}`)
  if (ritResidual.stato !== 'aperta') throw new Error('RIT_RESIDUAL_NOT_APERTA')
  if (Number(ritResidual.importo_ritenuta) !== PARTIAL_SPLIT.residual.importo_ritenuta) {
    throw new Error('RIT_RESIDUAL_AMOUNT')
  }
  if (ritResidual.prima_nota_pagamento_id) throw new Error('RIT_RESIDUAL_HAS_PAY_PN')

  const ritMatured = psqlJson(`
SELECT row_to_json(t) FROM (
  SELECT id::text AS id, stato, data_pagamento::text AS data_pagamento,
         data_scadenza::text AS data_scadenza, codice_tributo,
         prima_nota_pagamento_id::text AS prima_nota_pagamento_id,
         importo_ritenuta, imponibile_ritenuta,
         percipiente_id::text AS percipiente_id, percipiente_cf,
         percipiente_denominazione, periodo_riferimento, anno_riferimento,
         prima_nota_id::text AS prima_nota_id
  FROM public.ritenute_dacconto
  WHERE societa_id='${SOCIETA_A}'::uuid
    AND prima_nota_pagamento_id='${payRes.json.id}'::uuid
    AND stato='da_versare'
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1
) t
`)
  log(`RITENUTA_MATURED=${JSON.stringify(ritMatured)}`)
  if (Number(ritMatured.importo_ritenuta) !== PARTIAL_SPLIT.matured.importo_ritenuta) {
    throw new Error('RIT_MATURED_AMOUNT')
  }
  if (ritMatured.codice_tributo !== '1040') throw new Error('RIT_1040_MATURED')
  if (!String(ritMatured.data_pagamento || '').startsWith('2026-09-20')) throw new Error('RIT_PAY_DATE')
  if (String(ritMatured.percipiente_id) !== percipienteId) throw new Error('RIT_MATURED_PERCIPIENTE')

  const partAfter = Number(psql(`SELECT importo_residuo::text FROM public.partitario WHERE id='${partitaId}'::uuid`))
  log(`PARTITA_AFTER=${partAfter}`)
  if (partAfter !== PAY_PARTIAL) throw new Error('PARTITA_RESIDUAL_NOT_HALF')

  const scadenzario = buildRitenuteScadenzarioRows({
    ritenute: [ritMatured],
    year: 2026,
    today: '2026-09-21',
  })
  log(`SCADENZARIO_COUNT=${scadenzario.length}`)
  if (scadenzario.length !== 1) throw new Error('SCADENZARIO_EMPTY')
  const sc = scadenzario[0]
  log(`SCADENZARIO_STATO=${sc.operationalStatus}`)
  log(`SCADENZARIO_TRIBUTO=${sc.codiceTributo}`)
  log(`SCADENZARIO_IMPORTO=${sc.withholdingAmount}`)
  log(`CU_READY=${sc.cu770?.ready}`)
  if (sc.codiceTributo !== '1040') throw new Error('SCAD_NOT_1040')
  if (Number(sc.withholdingAmount) !== PARTIAL_SPLIT.matured.importo_ritenuta) throw new Error('SCAD_AMOUNT')
  if (!sc.cu770?.ready) throw new Error('CU_NOT_READY')
  if (Number(sc.cu770.importoRitenuta) !== PARTIAL_SPLIT.matured.importo_ritenuta) throw new Error('CU_AMOUNT')
  if (sc.cu770.percipienteId !== percipienteId) throw new Error('CU_PERCIPIENTE')

  log('P2_05_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P2_05_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P2_05_RESULT=FAIL'))) process.exit(1)
  })
