import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import handler, { validateFiscalJournalRequest } from '../api/studio/fiscal-journal-post.js'
import { matchesStudioRoute } from '../lib/devStudioHttp.js'
import {
  expectedFatturaAttiva22,
  expectedFatturaPassiva22,
  expectedNotaCreditoAttiva22,
  expectedPagamentoParzialeCliente,
  expectedParcellaRitenuta,
  expectedSplitPaymentAttiva22,
} from '../domain/fiscalAtomicCommit/independentExpectedScenarios.js'

const source = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const sql = source('sql/security_p0/57_stage3w_fiscal_journal_atomic_LAB_ONLY.sql')
const matrix = source('sql/security_p0/58_stage3w_fiscal_journal_matrix_TEST_ONLY.sql')
const preflight = source('sql/security_p0/59_stage3w_fiscal_preflight_READ_ONLY.sql')

const A_CLIENTE = '71000000-0000-4000-8000-000000000010'
const A_RICAVO = '71000000-0000-4000-8000-000000000011'
const A_IVA = '71000000-0000-4000-8000-000000000012'
const SOCIETA = '71000000-0000-4000-8000-000000000001'
const REQUEST = '71000000-0000-4000-8000-000000000099'

function fatturaAttivaPayload() {
  const exp = expectedFatturaAttiva22({ imponibile: 1000 })
  return {
    societa_id: SOCIETA,
    request_id: REQUEST,
    contract_kind: 'fattura_attiva',
    source_module: 'registrazione_manual',
    header: {
      data_registrazione: '2026-03-15',
      data_documento: '2026-03-15',
      numero_documento: 'FT-A-001',
      descrizione: 'Fattura attiva ordinaria 22 percento',
    },
    rows: [
      { conto_id: A_CLIENTE, dare: exp.totale, avere: 0 },
      { conto_id: A_RICAVO, dare: 0, avere: exp.imponibile },
      { conto_id: A_IVA, dare: 0, avere: exp.iva },
    ],
    vat: {
      rows: [{
        tipo: 'vendita',
        imponibile: exp.imponibile,
        iva: exp.iva,
        aliquota: 22,
        esigibilita: 'immediata',
        split_payment: false,
        documento_id: 'FT-A-001',
        riga_idx: 0,
      }],
    },
    ledger: {
      mode: 'open',
      openings: [{
        tipo: 'cliente',
        conto_id: A_CLIENTE,
        numero_documento: 'FT-A-001',
        data_documento: '2026-03-15',
        importo_originale: exp.totale,
      }],
      closures: [],
    },
    withholding: { eventType: 'none', inserts: [], updates: [] },
    motivazione: 'Verified active invoice twenty two percent lab case',
  }
}

test('Stage3W fiscal-journal endpoint is importable and LAB-disabled by default', () => {
  assert.equal(typeof handler, 'function')
  assert.equal(matchesStudioRoute('/api/studio/fiscal-journal-post'), true)
  const js = source('api/studio/fiscal-journal-post.js')
  assert.match(js, /isIsolatedStudioEnvironment\(\)/)
  assert.match(js, /FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED/)
  assert.match(js, /requireApiAuth\(req,\s*res/)
  assert.match(js, /\.rpc\('fiscosim_post_fiscal_journal'/)
  assert.match(js, /FISCAL_JOURNAL_LAB_ONLY_DISABLED/)
  assert.doesNotMatch(js, /\.from\(['"]prima_nota['"]\)\.insert/)
  assert.doesNotMatch(js, /VITE_SUPABASE_SERVICE_ROLE_KEY/)
})

test('Stage3W validator accepts balanced fattura attiva aligned to independent expectations', () => {
  const plan = validateFiscalJournalRequest(fatturaAttivaPayload())
  const exp = expectedFatturaAttiva22({ imponibile: 1000 })
  assert.ok(plan)
  assert.equal(plan.contract_kind, 'fattura_attiva')
  assert.equal(plan.rows.length, 3)
  assert.equal(plan.vat.rows[0].iva, exp.iva)
  assert.equal(plan.ledger.openings[0].importo_originale, exp.totale)
})

test('Stage3W validator rejects ambiguous top-level keys, unbalanced rows and wrong contracts', () => {
  const base = fatturaAttivaPayload()
  assert.equal(validateFiscalJournalRequest({ ...base, societa_id: 'x' }), null)
  assert.equal(validateFiscalJournalRequest({ ...base, contract_kind: 'movimento_generale' }), null)
  assert.equal(validateFiscalJournalRequest({ ...base, vatEntries: [] }), null)
  assert.equal(validateFiscalJournalRequest({
    ...base,
    rows: [
      { conto_id: A_CLIENTE, dare: 100, avere: 0 },
      { conto_id: A_RICAVO, dare: 0, avere: 99.99 },
    ],
  }), null)
  assert.equal(validateFiscalJournalRequest({
    ...base,
    rows: base.rows.map((r) => ({ ...r, societa_id: SOCIETA })),
  }), null)
  assert.equal(validateFiscalJournalRequest({
    ...base,
    header: { ...base.header, created_by: 'x' },
  }), null)
  assert.equal(validateFiscalJournalRequest({
    ...base,
    ledger: { mode: 'none', openings: [], closures: [] },
  }), null)
})

test('Independent expected scenarios stay deterministic and balanced', () => {
  const fa = expectedFatturaAttiva22({ imponibile: 1000 })
  assert.equal(fa.iva, 220)
  assert.equal(fa.totale, 1220)
  assert.equal(fa.totalDare, fa.totalAvere)

  const fp = expectedFatturaPassiva22({ imponibile: 1000 })
  assert.equal(fp.iva, 220)
  assert.equal(fp.partita.importo_residuo, 1220)

  const nc = expectedNotaCreditoAttiva22({ imponibile: 1000 })
  assert.equal(nc.registroIva.iva, -220)
  assert.equal(nc.partita.importo_originale, -1220)

  const pay = expectedPagamentoParzialeCliente({
    importoOriginale: 1220, importoIncasso: 500,
  })
  assert.equal(pay.partitaAfter.importo_residuo, 720)
  assert.equal(pay.partitaAfter.stato, 'aperta')

  const parc = expectedParcellaRitenuta({ compenso: 1000 })
  assert.equal(parc.contributo_cassa_prev, 40)
  assert.equal(parc.iva, 228.8)
  assert.equal(parc.importo_ritenuta, 200)
  assert.equal(parc.compenso_netto, 1068.8)
  assert.equal(parc.totalDare, parc.totalAvere)

  const split = expectedSplitPaymentAttiva22({ imponibile: 1000 })
  assert.equal(split.partita.importo_originale, 1000)
  assert.equal(split.registroIva.split_payment, true)
  assert.equal(split.registroIva.iva_in_debito_liquidazione, 0)
  assert.equal(split.totalDare, split.totalAvere)
})

test('Independent scenarios module must not import FiscoSim accounting services', () => {
  const mod = source('domain/fiscalAtomicCommit/independentExpectedScenarios.js')
  assert.doesNotMatch(mod, /persistPrimaNotaDraft|createPrimaNotaCompleta|canonicalAccounting/)
  assert.doesNotMatch(mod, /from ['"].*persistPrimaNotaDraft/)
  assert.doesNotMatch(mod, /from ['"].*primaNotaService/)
  assert.doesNotMatch(mod, /from ['"].*modules\/contabilita/)
})

test('Stage3W SQL ensures separate claim table, ACID inserts, FOR UPDATE closures, Stage3U untouched', () => {
  for (const marker of [
    'BEGIN;',
    'COMMIT;',
    'CREATE TABLE public.fiscosim_fiscal_journal_claim',
    'PRIMARY KEY(societa_id,request_id)',
    'ON CONFLICT DO NOTHING',
    'FOR UPDATE',
    'request_payload IS DISTINCT FROM v_claim',
    'SECURITY INVOKER',
    'SET search_path=pg_catalog',
    'FROM PUBLIC,anon,authenticated',
    'TO service_role',
    'Stage3W closure exceeds residual',
    'INSERT INTO public.registri_iva(',
    'INSERT INTO public.partitario(',
    'INSERT INTO public.ritenute_dacconto(',
    'INSERT INTO public.audit_contabile(',
    'fiscosim_post_general_journal',
    'Stage3W must not alter Stage3U',
    'local-fiscal-journal-atomic-candidate-only',
  ]) {
    assert.ok(sql.includes(marker), marker)
  }
  assert.doesNotMatch(sql, /SECURITY DEFINER SET/)
  assert.doesNotMatch(sql, /LANGUAGE plpgsql VOLATILE SECURITY DEFINER/)
  assert.doesNotMatch(sql, /DELETE FROM public\./)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.fiscosim_post_general_journal/)
  assert.doesNotMatch(sql, /DROP FUNCTION public\.fiscosim_post_general_journal/)
  assert.match(sql, /SECURITY INVOKER/)
})

test('Stage3W matrix covers fattura, payment, NC, split, parcella, overpay, late audit rollback', () => {
  for (const marker of [
    'local-fiscal-journal-matrix-rollback-only',
    'SET LOCAL ROLE service_role;',
    'fiscosim_post_fiscal_journal(',
    'exact fiscal replay did not return same PN ID',
    'fattura partita residual expected 1220',
    'partial payment residual expected 720',
    'Overpay closure must be rejected by residual lock',
    'nota_credito_attiva',
    'NC attiva partita residual expected -1220',
    'split_attiva',
    'split partita residual expected 1000',
    'parcella_documento',
    'parcella withholding row missing',
    'parcella partita residual expected 1068.80',
    'REVOKE INSERT ON public.audit_contabile FROM service_role',
    'failed audit left fiscal idempotency claim',
    'failed audit left a posted fiscal PN',
    'failed audit left VAT rows',
    'failed audit left partita rows',
    'GRANT INSERT ON public.audit_contabile TO service_role',
    'STAGE3W_LAB_MATRIX|PASS|FIXTURE_ROLLBACK',
    'ROLLBACK;',
  ]) assert.ok(matrix.includes(marker), marker)
  assert.doesNotMatch(matrix, /\bCOMMIT\s*;/)
})

test('Stage3W preflight is READ ONLY and does not install', () => {
  for (const x of [
    'BEGIN READ ONLY;',
    'ROLLBACK;',
    'local-fiscal-journal-readonly-preflight',
    'STAGE3W_PREFLIGHT|READ_ONLY_PASS|NO_ACCOUNTING_POST',
    'Stage3W fiscal tables MISSING',
  ]) assert.ok(preflight.includes(x), x)
  assert.doesNotMatch(preflight, /^COMMIT;/m)
  assert.doesNotMatch(preflight, /^INSERT INTO /m)
  assert.doesNotMatch(preflight, /^CREATE (?:TABLE|FUNCTION)/m)
})

test('Stage3W persistent install script is gated and preserves Stage3U', () => {
  const ps = source('scripts/security_p0/run-stage3w-fiscal-persistent-lab-install.ps1')
  for (const marker of [
    'ApproveLabSchemaInstall',
    'STAGE3W_FISCAL_REHEARSAL_',
    'STAGE3W_ROLLBACK_VERIFIED|NO_FISCAL_SCHEMA_PERSISTED',
    '57_stage3w_fiscal_journal_atomic_LAB_ONLY.sql',
    '58_stage3w_fiscal_journal_matrix_TEST_ONLY.sql',
    '1e920b0f2aeda5cd40106395b64d41947ab013d3',
    'e3ce10b8466b80a6bc9542b23ba6e04e0f71206f',
    'STAGE3U_MUST_REMAIN_UNTOUCHED=true',
    'DO NOT rerun automatically',
    '3W_PERSISTENT_INSTALL|SCHEMA_PRESENT|NO_FIXTURE_ROWS|ACL_PASS|STAGE3U_OK',
  ]) assert.ok(ps.includes(marker), marker)
  assert.match(ps, /fiscosim_post_general_journal/)
})

test('Stage3W is not wired into Manuale or Import productive persist paths', () => {
  const pn = source('src/modules/contabilita/application/persistPrimaNotaDraft.js')
  const service = source('services/primaNotaService.js')
  assert.match(pn, /createPrimaNotaCompleta/)
  assert.doesNotMatch(pn, /fiscosim_post_fiscal_journal/)
  assert.doesNotMatch(service, /fiscosim_post_fiscal_journal/)
  assert.doesNotMatch(source('src/modules/import_contabilita/application/importContabilitaWorkflow.js'), /fiscosim_post_fiscal_journal/)
})
