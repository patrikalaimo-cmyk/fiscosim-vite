/**
 * Stage3W L2: official consolida_periodo_iva_transazionale on SG-E2E LAB data.
 * 1) Domain calc from registri_iva
 * 2) RPC consolidamento provvisorio
 * 3) Riconsolidamento replaces prior non-definitiva
 * 4) Lock [stato:definitiva] in note + RPC must refuse
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcoloLiquidazioneIvaDefinitiva } from '../../src/modules/contabilita/domain/iva/calcoloLiquidazioneIvaDefinitiva.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const LAB = process.env.FISCOSIM_P0_LAB_DIR || 'C:\\Users\\patri\\FiscoSim-P0-LAB-20261008-164658'
const REPORT_DIR = process.cwd()
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const OPERATORE = '72000000-0000-4000-8000-000000000005'
const PERIODO_INIZIO = '2026-03-01'
const PERIODO_FINE = '2026-03-31'

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8' },
  )
}

function psqlJson(sql) {
  const line = psql(sql)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.startsWith('{') || s.startsWith('['))
  if (!line) throw new Error('JSON_MISSING: ' + psql(sql).slice(0, 200))
  return JSON.parse(line)
}

function assertEq(label, actual, expected) {
  const a = round2(actual)
  const e = round2(expected)
  if (a !== e) throw new Error(`${label}: got ${a}, expected ${e}`)
}

const rows = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.documento_id), '[]'::json)
FROM (
  SELECT id, societa_id::text AS societa_id, documento_id, data::text AS data,
         imponibile, iva, aliquota, tipo, iva_detraibile, iva_indetraibile,
         esigibilita, split_payment, prima_nota_id::text AS prima_nota_id
  FROM public.registri_iva
  WHERE societa_id='${SOCIETA_A}'
) t;
`)
if (!Array.isArray(rows) || rows.length !== 5) {
  throw new Error(`Expected 5 VAT rows, got ${rows?.length}`)
}

const calc = calcoloLiquidazioneIvaDefinitiva(rows, {
  societaId: SOCIETA_A,
  periodoInizio: PERIODO_INIZIO,
  periodoFine: PERIODO_FINE,
  periodicita: 'mensile',
})

assertEq('ivaDebitoEffettiva', calc.ivaDebitoEffettiva, 228.8)
assertEq('saldoPeriodo', calc.saldoPeriodo, 8.8)

const payload = {
  ivaVenditeLorda: calc.ivaVenditeLorda,
  ivaSplitEsclusa: calc.ivaSplitEsclusa,
  ivaDebitoEffettiva: calc.ivaDebitoEffettiva,
  ivaAcquistiDetraibile: calc.ivaAcquistiDetraibile,
  ivaAcquistiIndetraibile: calc.ivaAcquistiIndetraibile,
  saldoPeriodo: calc.saldoPeriodo,
  debitoPeriodo: calc.debitoPeriodo,
  debitoDaVersare: calc.debitoDaVersare,
  f24Dovuto: calc.f24Dovuto,
}

function callRpc(motivo) {
  const payloadLit = JSON.stringify(payload).replace(/'/g, "''")
  const sql = `
SELECT public.consolida_periodo_iva_transazionale(
  '${SOCIETA_A}'::uuid,
  '${PERIODO_INIZIO}'::date,
  '${PERIODO_FINE}'::date,
  'mensile',
  '${OPERATORE}'::uuid,
  '${motivo.replace(/'/g, "''")}',
  '${payloadLit}'::jsonb
)::text;
`
  return psqlJson(sql)
}

const first = callRpc('[SG-E2E] Consolidamento RPC provvisorio marzo 2026')
if (first.success !== true) throw new Error('FIRST_CONSOLIDATE_FAILED: ' + JSON.stringify(first))
if (first.stato !== 'provvisoria') throw new Error('FIRST_STATO: ' + first.stato)
const id1 = first.liquidazioneId
if (!id1) throw new Error('FIRST_MISSING_ID')

const row1 = psqlJson(`
SELECT row_to_json(t) FROM (
  SELECT id::text, iva_debito, iva_credito, saldo, note
  FROM public.liquidazione_iva WHERE id='${id1}'
) t;
`)
// RPC schema-alignment stores iva_debito from ivaVenditeLorda
assertEq('rpc_iva_debito_lorda', row1.iva_debito, calc.ivaVenditeLorda)
assertEq('rpc_iva_credito', row1.iva_credito, calc.ivaAcquistiDetraibile)
assertEq('rpc_saldo', row1.saldo, calc.saldoPeriodo)
if (!String(row1.note || '').includes('[stato:provvisoria]')) {
  throw new Error('FIRST_NOTE_NOT_PROVVISORIA: ' + row1.note)
}

const second = callRpc('[SG-E2E] Riconsolidamento RPC provvisorio marzo 2026')
if (second.success !== true) throw new Error('SECOND_CONSOLIDATE_FAILED: ' + JSON.stringify(second))
const id2 = second.liquidazioneId
if (!id2 || id2 === id1) {
  // replace may create new id; old must be gone
}
const stillFirst = psql(`SELECT count(*)::text FROM public.liquidazione_iva WHERE id='${id1}';`).trim()
if (stillFirst !== '0') throw new Error('OLD_PROVVISORIA_NOT_REPLACED')
const countPeriod = psql(`
SELECT count(*)::text FROM public.liquidazione_iva
WHERE societa_id='${SOCIETA_A}'
  AND periodo_inizio='${PERIODO_INIZIO}'
  AND periodo_fine='${PERIODO_FINE}';
`).trim()
if (countPeriod !== '1') throw new Error(`EXPECTED_ONE_LIQ_ROW got ${countPeriod}`)

// Lock definitiva using schema-alignment note marker honored by RPC
psql(`
UPDATE public.liquidazione_iva
SET note = replace(note, '[stato:provvisoria]', '[stato:definitiva]'),
    updated_at = now()
WHERE id='${id2}';
`)

const blocked = callRpc('[SG-E2E] Must fail after definitiva lock')
if (blocked.success !== false) throw new Error('DEFINITIVA_BLOCK_MISSING: ' + JSON.stringify(blocked))
if (!String(blocked.error || '').toLowerCase().includes('bloccato')
  && !String(blocked.error || '').toLowerCase().includes('definitiva')) {
  throw new Error('DEFINITIVA_BLOCK_UNEXPECTED: ' + JSON.stringify(blocked))
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 23)
const reportName = `STAGE3W_LIQUIDAZIONE_CONSOLIDAMENTO_SGE2E_${stamp}.txt`
const reportLab = join(LAB, reportName)
const reportRepo = join(REPORT_DIR, 'REPORT', 'STAGE3W_LIQUIDAZIONE_CONSOLIDAMENTO_SGE2E_20261011.txt')
const lines = [
  'STAGE3W_LIQUIDAZIONE_CONSOLIDAMENTO_SGE2E',
  `CONTAINER=${CONTAINER}`,
  `SOCIETA_A=${SOCIETA_A}`,
  `PERIODO=${PERIODO_INIZIO}/${PERIODO_FINE}`,
  'RPC=consolida_periodo_iva_transazionale',
  `IVA_VENDITE_LORDA=${calc.ivaVenditeLorda}`,
  `IVA_DEBITO_EFFETTIVA=${calc.ivaDebitoEffettiva}`,
  `IVA_SPLIT_ESCLUSA=${calc.ivaSplitEsclusa}`,
  `SALDO_PERIODO=${calc.saldoPeriodo}`,
  `FIRST_LIQ_ID=${id1}`,
  `SECOND_LIQ_ID=${id2}`,
  'PROVVISORIA=PASS',
  'RICONSOLIDAMENTO=PASS',
  'DEFINITIVA_LOCK_BLOCK=PASS',
  'NOTE=definitiva marker applied via note replace (schema-alignment LAB contract; no separate mark-definitiva RPC)',
  'RESULT=PASS',
]
writeFileSync(reportLab, lines.join('\n') + '\n', 'utf8')
writeFileSync(reportRepo, lines.join('\n') + '\n', 'utf8')
console.log('STAGE3W_LIQUIDAZIONE_CONSOLIDAMENTO_SGE2E|PASS')
console.log(`REPORT=${reportLab}`)
console.log(`SECOND_LIQ_ID=${id2}`)
