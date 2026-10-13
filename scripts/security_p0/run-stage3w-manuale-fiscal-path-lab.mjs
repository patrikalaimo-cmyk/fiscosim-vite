/**
 * Stage3W Manuale PATH LAB (JWT fiscal-journal-post, source_module=registrazione_manual):
 *  1) IVA per cassa open (differita + iva_per_cassa) + partial pay with VAT rilascio
 *  2) Reverse/estero: fattura_passiva doppia annotazione IVA + partita imponibile
 *  3) Parcella + ritenuta 1040 open + maturazione su pagamento
 * LAB-only. Never prints tokens/passwords. Form UI collaudi restano operatore.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcoloLiquidazioneIvaDefinitiva } from '../../src/modules/contabilita/domain/iva/calcoloLiquidazioneIvaDefinitiva.js'
import { calculateIvaPerCassaReleaseRatio } from '../../src/modules/contabilita/application/registrazioneOperations/ivaPerCassaRelease.js'
import { buildRitenuteScadenzarioRows } from '../../src/modules/contabilita/application/ritenute/ritenuteScadenzarioService.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const AUTH_URL = 'http://127.0.0.1:55321'
const API = 'http://127.0.0.1:3001/api/studio/fiscal-journal-post'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const AUTH_A = '72000000-0000-4000-8000-000000000003'
const EMAIL_A = 'sg-e2e-a@example.invalid'
const CONTO_CLIENTE = '72000000-0000-4000-8000-000000000010'
const CONTO_RICAVO = '72000000-0000-4000-8000-000000000011'
const CONTO_IVA = '72000000-0000-4000-8000-000000000012'
const CONTO_BANCA = '72000000-0000-4000-8000-000000000013'
const CONTO_COSTO = '72000000-0000-4000-8000-000000000014'
const CONTO_IVA_REV = '72000000-0000-4000-8000-000000000015'
const CONTO_FORN = '72000000-0000-4000-8000-000000000016'
const CONTO_ERARIO = '72000000-0000-4000-8000-000000000018'
const CONTO_CASSA = '72000000-0000-4000-8000-000000000019'
const INSTANCE = '00000000-0000-0000-0000-000000000000'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_MANUALE_FISCAL_PATH_${stamp}.txt`)

const GROSS = 1220
const TAXABLE = 1000
const VAT = 220
const PAY_AMOUNT = 500
const COMPENSO = 1000
const CASSA_PREV = 40
const RITENUTA = 200
const IVA_PAR = 228.8
const NETTO_CLIENTE = 1068.8
const PN_PAR_TOTAL = 1268.8
const VAT_TAXABLE_PAR = 1040

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
 ('${CONTO_COSTO}','${SOCIETA_A}','5.01','Costi SG-E2E-A','economico',true),
 ('${CONTO_IVA_REV}','${SOCIETA_A}','2.02','IVA credit/debit reverse SG-E2E-A','patrimoniale',true),
 ('${CONTO_FORN}','${SOCIETA_A}','2.10','Fornitore SG-E2E-A','patrimoniale',true),
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
  try { json = JSON.parse(text) } catch { /* keep */ }
  return { status: res.status, json, text }
}

async function runIvaCassa(token) {
  log('--- MANUALE_PATH_IVA_CASSA ---')
  const openDoc = `SG-E2E-MAN-CASSA-${stamp.slice(-6)}`
  const openReq = randomUUID()
  const openBody = {
    societa_id: SOCIETA_A,
    request_id: openReq,
    contract_kind: 'fattura_attiva',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E Manuale PATH IVA per cassa open',
    header: {
      data_registrazione: '2026-06-10',
      data_documento: '2026-06-10',
      numero_documento: openDoc,
      descrizione: '[SG-E2E] Manuale IVA cassa open ' + openDoc,
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
        esigibilita: 'differita',
        split_payment: false,
        documento_id: openDoc,
        riga_idx: 0,
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'cliente',
        conto_id: CONTO_CLIENTE,
        numero_documento: openDoc,
        data_documento: '2026-06-10',
        importo_originale: GROSS,
        iva_per_cassa: true,
      }],
      closures: [],
    },
    withholding: { eventType: 'none', inserts: [], updates: [] },
  }

  const openRes = await postFiscal(token, openBody)
  log(`CASSA_OPEN_STATUS=${openRes.status}`)
  log(`CASSA_OPEN_PN=${openRes.json?.id || ''}`)
  if (openRes.status !== 201 || !openRes.json?.ok || !openRes.json?.id) {
    log(`CASSA_OPEN_BODY=${(openRes.text || '').slice(0, 400)}`)
    throw new Error('CASSA_OPEN_FAILED')
  }
  const openPn = openRes.json.id

  const vatOpen = psql(`
SELECT coalesce(esigibilita,'')||'|'||coalesce(iva::text,'')||'|'||coalesce(tipo,'')
FROM public.registri_iva
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`CASSA_VAT_OPEN=${vatOpen}`)
  {
    const [esigOpen, ivaOpen, tipoOpen] = String(vatOpen).split('|')
    if (String(esigOpen).toLowerCase() !== 'differita') throw new Error('CASSA_VAT_NOT_DIFFERITA')
    if (Number(ivaOpen) !== VAT || tipoOpen !== 'vendita') throw new Error('CASSA_VAT_OPEN_AMOUNTS')
  }

  const partita = psql(`
SELECT id::text||'|'||coalesce(importo_residuo::text,'0')||'|'||coalesce(iva_per_cassa::text,'f')
FROM public.partitario
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid AND tipo='cliente'
LIMIT 1
`)
  log(`CASSA_PARTITA=${partita}`)
  const [partitaId, residuoOpen, ivaCassaFlag] = partita.split('|')
  if (!partitaId) throw new Error('CASSA_PARTITA_MISSING')
  if (Number(residuoOpen) !== GROSS) throw new Error('CASSA_PARTITA_RESIDUO')
  if (ivaCassaFlag !== 't' && ivaCassaFlag !== 'true') throw new Error('CASSA_FLAG_FALSE')

  const claimOpen = psql(`
SELECT coalesce(contract_kind,'')||'|'||coalesce(request_payload->>'source_module','')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`CASSA_CLAIM_OPEN=${claimOpen}`)
  if (!String(claimOpen).startsWith('fattura_attiva|registrazione_manual')) {
    throw new Error('CASSA_CLAIM_SOURCE')
  }

  const ratio = calculateIvaPerCassaReleaseRatio(PAY_AMOUNT, GROSS)
  const releaseIva = round2(VAT * ratio)
  const releaseImp = round2(TAXABLE * ratio)
  const payDoc = `SG-E2E-MAN-CASSA-PAY-${stamp.slice(-6)}`
  const payReq = randomUUID()
  const payBody = {
    societa_id: SOCIETA_A,
    request_id: payReq,
    contract_kind: 'pagamento',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E Manuale PATH IVA cassa rilascio',
    header: {
      data_registrazione: '2026-07-12',
      data_documento: '2026-07-12',
      numero_documento: payDoc,
      descrizione: '[SG-E2E] Manuale IVA cassa pay ' + payDoc,
    },
    rows: [
      { conto_id: CONTO_BANCA, dare: PAY_AMOUNT, avere: 0 },
      { conto_id: CONTO_CLIENTE, dare: 0, avere: PAY_AMOUNT },
    ],
    vat: {
      rows: [{
        tipo: 'vendita',
        imponibile: releaseImp,
        iva: releaseIva,
        aliquota: 22,
        esigibilita: 'rilascio',
        split_payment: false,
        documento_id: openDoc,
        riga_idx: 0,
      }],
    },
    ledger: {
      mode: 'close',
      openings: [],
      closures: [{ partita_id: partitaId, importo_chiuso: PAY_AMOUNT }],
    },
    withholding: { eventType: 'none', inserts: [], updates: [] },
  }

  const payRes = await postFiscal(token, payBody)
  log(`CASSA_PAY_STATUS=${payRes.status}`)
  log(`CASSA_PAY_PN=${payRes.json?.id || ''}`)
  if (payRes.status !== 201 || !payRes.json?.ok || !payRes.json?.id) {
    log(`CASSA_PAY_BODY=${(payRes.text || '').slice(0, 400)}`)
    throw new Error('CASSA_PAY_FAILED')
  }
  const payPn = payRes.json.id

  const residuoAfter = Number(psql(`SELECT importo_residuo::text FROM public.partitario WHERE id='${partitaId}'::uuid`))
  log(`CASSA_PARTITA_AFTER=${residuoAfter}`)
  if (residuoAfter !== GROSS - PAY_AMOUNT) throw new Error('CASSA_RESIDUAL')

  const releaseVat = psql(`
SELECT coalesce(esigibilita,'')||'|'||coalesce(iva::text,'')||'|'||coalesce(imponibile::text,'')
FROM public.registri_iva
WHERE prima_nota_id='${payPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid AND esigibilita='rilascio'
LIMIT 1
`)
  log(`CASSA_VAT_RELEASE=${releaseVat}`)
  const [esigRel, ivaRel, impRel] = releaseVat.split('|')
  if (esigRel !== 'rilascio') throw new Error('CASSA_RELEASE_MISSING')
  if (Number(ivaRel) !== releaseIva || Number(impRel) !== releaseImp) throw new Error('CASSA_RELEASE_AMOUNTS')

  const claimPay = psql(`
SELECT coalesce(contract_kind,'')||'|'||coalesce(request_payload->>'source_module','')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${payPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`CASSA_CLAIM_PAY=${claimPay}`)
  if (!String(claimPay).startsWith('pagamento|registrazione_manual')) throw new Error('CASSA_PAY_CLAIM')

  log('MANUALE_PATH_IVA_CASSA=PASS')
  return { openPn, payPn, openDoc }
}

async function runReverse(token) {
  log('--- MANUALE_PATH_REVERSE ---')
  const doc = `SG-E2E-MAN-REV-${stamp.slice(-6)}`
  const req = randomUUID()
  const body = {
    societa_id: SOCIETA_A,
    request_id: req,
    contract_kind: 'fattura_passiva',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E Manuale PATH reverse/estero',
    header: {
      data_registrazione: '2026-08-14',
      data_documento: '2026-08-14',
      numero_documento: doc,
      descrizione: '[SG-E2E] Manuale reverse ' + doc,
    },
    rows: [
      { conto_id: CONTO_COSTO, dare: TAXABLE, avere: 0 },
      { conto_id: CONTO_IVA_REV, dare: VAT, avere: 0 },
      { conto_id: CONTO_IVA_REV, dare: 0, avere: VAT },
      { conto_id: CONTO_FORN, dare: 0, avere: TAXABLE },
    ],
    vat: {
      rows: [
        {
          tipo: 'acquisto',
          imponibile: TAXABLE,
          iva: VAT,
          aliquota: 22,
          esigibilita: 'immediata',
          split_payment: false,
          documento_id: doc,
          riga_idx: 0,
        },
        {
          tipo: 'vendita',
          imponibile: TAXABLE,
          iva: VAT,
          aliquota: 22,
          esigibilita: 'immediata',
          split_payment: false,
          documento_id: doc,
          riga_idx: 1,
        },
      ],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'fornitore',
        conto_id: CONTO_FORN,
        numero_documento: doc,
        data_documento: '2026-08-14',
        importo_originale: TAXABLE,
      }],
      closures: [],
    },
    withholding: { eventType: 'none', inserts: [], updates: [] },
  }

  const res = await postFiscal(token, body)
  log(`REV_STATUS=${res.status}`)
  log(`REV_PN=${res.json?.id || ''}`)
  if (res.status !== 201 || !res.json?.ok || !res.json?.id) {
    log(`REV_BODY=${(res.text || '').slice(0, 400)}`)
    throw new Error('REV_POST_FAILED')
  }
  const pnId = res.json.id

  const rowCount = Number(psql(`
SELECT count(*)::text FROM public.prima_nota_righe WHERE prima_nota_id='${pnId}'::uuid
`))
  log(`REV_PN_RIGHE=${rowCount}`)
  if (rowCount !== 4) throw new Error('REV_ROW_COUNT')

  const fornRow = psql(`
SELECT coalesce(importo_dare::text,'0')||'|'||coalesce(importo_avere::text,'0')
FROM public.prima_nota_righe
WHERE prima_nota_id='${pnId}'::uuid AND conto_id='${CONTO_FORN}'::uuid
LIMIT 1
`)
  log(`REV_FORN_ROW=${fornRow}`)
  if (Number(fornRow.split('|')[1]) !== TAXABLE) throw new Error('REV_FORN_NOT_IMPONIBILE')

  const vatTypes = psql(`
SELECT string_agg(tipo||':'||iva::text, ';' ORDER BY tipo)
FROM public.registri_iva
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
`)
  log(`REV_VAT_TYPES=${vatTypes}`)
  if (!String(vatTypes).includes('acquisto:220') || !String(vatTypes).includes('vendita:220')) {
    throw new Error('REV_VAT_DOUBLE_MISSING')
  }

  const partita = psql(`
SELECT coalesce(tipo,'')||'|'||coalesce(importo_residuo::text,'0')
FROM public.partitario
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`REV_PARTITA=${partita}`)
  const [partTipo, partResiduo] = partita.split('|')
  if (partTipo !== 'fornitore' || Number(partResiduo) !== TAXABLE) throw new Error('REV_PARTITA')

  const claim = psql(`
SELECT coalesce(contract_kind,'')||'|'||coalesce(request_payload->>'source_module','')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${pnId}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`REV_CLAIM=${claim}`)
  if (!String(claim).startsWith('fattura_passiva|registrazione_manual')) throw new Error('REV_CLAIM')

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
  log(`REV_LIQ_SALDO=${calc.saldoPeriodo}`)
  if (Number(calc.saldoPeriodo) !== 0) throw new Error('REV_LIQ_NOT_NEUTRAL')

  log('MANUALE_PATH_REVERSE=PASS')
  return { pnId, doc }
}

async function runParcella(token) {
  log('--- MANUALE_PATH_PARCELLA ---')
  const percipienteId = randomUUID()
  ensurePercipiente(percipienteId)
  const doc = `SG-E2E-MAN-PAR-${stamp.slice(-6)}`
  const openReq = randomUUID()
  const openBody = {
    societa_id: SOCIETA_A,
    request_id: openReq,
    contract_kind: 'parcella_documento',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E Manuale PATH parcella ritenuta',
    header: {
      data_registrazione: '2026-09-10',
      data_documento: '2026-09-10',
      numero_documento: doc,
      descrizione: '[SG-E2E] Manuale parcella ' + doc,
    },
    rows: [
      { conto_id: CONTO_CLIENTE, dare: NETTO_CLIENTE, avere: 0 },
      { conto_id: CONTO_ERARIO, dare: RITENUTA, avere: 0 },
      { conto_id: CONTO_RICAVO, dare: 0, avere: COMPENSO },
      { conto_id: CONTO_CASSA, dare: 0, avere: CASSA_PREV },
      { conto_id: CONTO_IVA, dare: 0, avere: IVA_PAR },
    ],
    vat: {
      rows: [{
        tipo: 'vendita',
        imponibile: VAT_TAXABLE_PAR,
        iva: IVA_PAR,
        aliquota: 22,
        esigibilita: 'immediata',
        split_payment: false,
        documento_id: doc,
        riga_idx: 0,
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'cliente',
        conto_id: CONTO_CLIENTE,
        numero_documento: doc,
        data_documento: '2026-09-10',
        importo_originale: NETTO_CLIENTE,
      }],
      closures: [],
    },
    withholding: {
      eventType: 'documento',
      inserts: [{
        percipiente_id: percipienteId,
        percipiente_cf: 'RSSMRA80A01H501U',
        percipiente_denominazione: 'Professionista SG-E2E',
        data_documento: '2026-09-10',
        numero_documento: doc,
        compenso_lordo: COMPENSO,
        imponibile_ritenuta: COMPENSO,
        aliquota_ritenuta: 20,
        importo_ritenuta: RITENUTA,
        compenso_netto: NETTO_CLIENTE,
        contributo_cassa_prev: CASSA_PREV,
        codice_tributo: '1040',
        stato: 'aperta',
        causale_prestazione: 'A',
      }],
      updates: [],
    },
  }

  const openRes = await postFiscal(token, openBody)
  log(`PAR_OPEN_STATUS=${openRes.status}`)
  log(`PAR_OPEN_PN=${openRes.json?.id || ''}`)
  if (openRes.status !== 201 || !openRes.json?.ok || !openRes.json?.id) {
    log(`PAR_OPEN_BODY=${(openRes.text || '').slice(0, 400)}`)
    throw new Error('PAR_OPEN_FAILED')
  }
  const openPn = openRes.json.id

  const totals = psql(`
SELECT coalesce(totale_dare::text,'0')||'|'||coalesce(totale_avere::text,'0')
FROM public.prima_nota WHERE id='${openPn}'::uuid
`)
  log(`PAR_PN_TOTALS=${totals}`)
  const [td, ta] = totals.split('|')
  if (Number(td) !== PN_PAR_TOTAL || Number(ta) !== PN_PAR_TOTAL) throw new Error('PAR_PN_UNBALANCED')

  const partitaId = psql(`
SELECT id::text FROM public.partitario
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`PAR_PARTITA_ID=${partitaId}`)
  if (!partitaId) throw new Error('PAR_PARTITA_MISSING')

  const ritRow = psqlJson(`
SELECT row_to_json(t) FROM (
  SELECT id::text AS id, stato, codice_tributo, importo_ritenuta,
         percipiente_id::text AS percipiente_id, percipiente_cf, causale_prestazione
  FROM public.ritenute_dacconto
  WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
  LIMIT 1
) t
`)
  log(`PAR_RIT=${JSON.stringify(ritRow)}`)
  if (ritRow.stato !== 'aperta' || String(ritRow.codice_tributo) !== '1040') throw new Error('PAR_RIT_OPEN')
  if (Number(ritRow.importo_ritenuta) !== RITENUTA) throw new Error('PAR_RIT_AMOUNT')

  const claimOpen = psql(`
SELECT coalesce(contract_kind,'')||'|'||coalesce(request_payload->>'source_module','')
FROM public.fiscosim_fiscal_journal_claim
WHERE prima_nota_id='${openPn}'::uuid AND societa_id='${SOCIETA_A}'::uuid
LIMIT 1
`)
  log(`PAR_CLAIM_OPEN=${claimOpen}`)
  if (!String(claimOpen).startsWith('parcella_documento|registrazione_manual')) {
    throw new Error('PAR_CLAIM_OPEN')
  }

  const payReq = randomUUID()
  const payBody = {
    societa_id: SOCIETA_A,
    request_id: payReq,
    contract_kind: 'pagamento',
    source_module: 'registrazione_manual',
    motivazione: 'SG-E2E Manuale PATH maturazione ritenuta parcella',
    header: {
      data_registrazione: '2026-09-20',
      data_documento: '2026-09-20',
      numero_documento: `PAY-${doc}`,
      descrizione: '[SG-E2E] Manuale incasso parcella ' + doc,
    },
    rows: [
      { conto_id: CONTO_BANCA, dare: NETTO_CLIENTE, avere: 0 },
      { conto_id: CONTO_CLIENTE, dare: 0, avere: NETTO_CLIENTE },
    ],
    ledger: {
      mode: 'close',
      openings: [],
      closures: [{ partita_id: partitaId, importo_chiuso: NETTO_CLIENTE }],
    },
    withholding: {
      eventType: 'pagamento',
      inserts: [],
      updates: [{
        id: ritRow.id,
        data_pagamento: '2026-09-20',
        data_scadenza: '2026-10-16',
        periodo_riferimento: '09/2026',
        anno_riferimento: 2026,
        codice_tributo: '1040',
        stato: 'da_versare',
      }],
    },
  }

  const payRes = await postFiscal(token, payBody)
  log(`PAR_PAY_STATUS=${payRes.status}`)
  log(`PAR_PAY_PN=${payRes.json?.id || ''}`)
  if (payRes.status !== 201 || !payRes.json?.ok || !payRes.json?.id) {
    log(`PAR_PAY_BODY=${(payRes.text || '').slice(0, 400)}`)
    throw new Error('PAR_PAY_FAILED')
  }

  const ritAfter = psqlJson(`
SELECT row_to_json(t) FROM (
  SELECT id::text AS id, stato, data_pagamento::text AS data_pagamento,
         codice_tributo, prima_nota_pagamento_id::text AS prima_nota_pagamento_id,
         importo_ritenuta, periodo_riferimento, anno_riferimento
  FROM public.ritenute_dacconto WHERE id='${ritRow.id}'::uuid
) t
`)
  log(`PAR_RIT_AFTER=${JSON.stringify(ritAfter)}`)
  if (ritAfter.stato !== 'da_versare') throw new Error('PAR_RIT_NOT_DA_VERSARE')
  if (ritAfter.prima_nota_pagamento_id !== payRes.json.id) throw new Error('PAR_RIT_PAY_PN')

  const partAfter = Number(psql(`SELECT importo_residuo::text FROM public.partitario WHERE id='${partitaId}'::uuid`))
  log(`PAR_PARTITA_AFTER=${partAfter}`)
  if (partAfter !== 0) throw new Error('PAR_PARTITA_NOT_CLOSED')

  const scadenzario = buildRitenuteScadenzarioRows({ ritenute: [ritAfter] })
  const sc = scadenzario?.[0]
  log(`PAR_SCAD_AMOUNT=${sc?.withholdingAmount}`)
  if (Number(sc?.withholdingAmount) !== RITENUTA) throw new Error('PAR_SCAD_AMOUNT')

  log('MANUALE_PATH_PARCELLA=PASS')
  return { openPn, payPn: payRes.json.id, doc }
}

async function main() {
  log('MANUALE_FISCAL_PATH_START')
  process.env.FISCOSIM_ISOLATED_LAB_API = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED = 'true'
  process.env.FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED = 'true'

  const env = loadEnvFile(join(process.cwd(), '.env.stage3w.lab.local'))
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('LAB_KEYS_MISSING')
  if (env.VITE_SUPABASE_URL !== AUTH_URL && env.SUPABASE_URL !== AUTH_URL) {
    throw new Error('LAB_URL_MISMATCH_EXPECT_55321')
  }

  ensureAccounts()
  const password = 'SgE2eManPath!' + randomBytes(8).toString('base64url')
  ensureAuthPassword(password)

  const client = createClient(AUTH_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email: EMAIL_A, password })
  if (error || !data?.session?.access_token) throw new Error('LOGIN_FAILED')
  log('LOGIN_JWT=PASS')
  const token = data.session.access_token

  await runIvaCassa(token)
  await runReverse(token)
  await runParcella(token)

  log('MANUALE_FISCAL_PATH_RESULT=PASS')
  log('NOTE=form_UI_collaudi_ancora_operatore')
}

main()
  .catch((err) => {
    log(`MANUALE_FISCAL_PATH_RESULT=FAIL ${err?.message || err}`)
    console.error(err)
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    process.exit(1)
  })
  .then(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
  })
