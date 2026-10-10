/**
 * Stage3W L2: liquidazione IVA from persisted SG-E2E registri_iva on P0 LAB.
 * Reads PostgreSQL via docker exec (no JWT). Uses domain calculator + independent expected.
 * Persist to liquidazione_iva only with FISCOSIM_SG_E2E_LIQ_PERSIST=APPROVED.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcoloLiquidazioneIvaDefinitiva } from '../../src/modules/contabilita/domain/iva/calcoloLiquidazioneIvaDefinitiva.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const LAB = process.env.FISCOSIM_P0_LAB_DIR || 'C:\\Users\\patri\\FiscoSim-P0-LAB-20261008-164658'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const SOCIETA_B = '72000000-0000-4000-8000-000000000002'
const PERIODO_INIZIO = '2026-03-01'
const PERIODO_FINE = '2026-03-31'

/** Independent expected amounts (cents arithmetic), not imported from domain. */
const EXPECTED_A = {
  ivaVenditeLorda: 448.8,
  ivaSplitEsclusa: 220,
  ivaDebitoEffettiva: 228.8,
  ivaAcquistiDetraibile: 220,
  saldoPeriodo: 8.8,
  debitoDaVersare: 8.8,
  f24Dovuto: 0,
  rimandoSottoSoglia: true,
  righeIncluseCount: 5,
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function psqlJson(sql) {
  const out = execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8' },
  )
  const line = out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.startsWith('{') || s.startsWith('['))
  if (!line) throw new Error('LAB_JSON_MISSING: ' + out.slice(0, 200))
  return JSON.parse(line)
}

function psqlExec(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

function assertEq(label, actual, expected) {
  const a = round2(actual)
  const e = round2(expected)
  if (a !== e) throw new Error(`${label}: got ${a}, expected ${e}`)
}

const rowsSql = `
SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.documento_id), '[]'::json)
FROM (
  SELECT id, societa_id::text AS societa_id, documento_id, data::text AS data,
         imponibile, iva, aliquota, tipo,
         iva_detraibile, iva_indetraibile, esigibilita, split_payment
  FROM public.registri_iva
  WHERE societa_id IN ('${SOCIETA_A}','${SOCIETA_B}')
) t;
`

const rows = psqlJson(rowsSql)
if (!Array.isArray(rows)) throw new Error('LAB_READ_FAILED: registri_iva')

const rowsA = rows.filter((r) => r.societa_id === SOCIETA_A)
const rowsB = rows.filter((r) => r.societa_id === SOCIETA_B)
if (rowsA.length !== 5) throw new Error(`EXPECTED_5_VAT_ROWS_A got ${rowsA.length}`)
if (rowsB.length !== 0) throw new Error(`EXPECTED_0_VAT_ROWS_B got ${rowsB.length}`)

const calcA = calcoloLiquidazioneIvaDefinitiva(rowsA, {
  societaId: SOCIETA_A,
  periodoInizio: PERIODO_INIZIO,
  periodoFine: PERIODO_FINE,
  periodicita: 'mensile',
})

assertEq('ivaVenditeLorda', calcA.ivaVenditeLorda, EXPECTED_A.ivaVenditeLorda)
assertEq('ivaSplitEsclusa', calcA.ivaSplitEsclusa, EXPECTED_A.ivaSplitEsclusa)
assertEq('ivaDebitoEffettiva', calcA.ivaDebitoEffettiva, EXPECTED_A.ivaDebitoEffettiva)
assertEq('ivaAcquistiDetraibile', calcA.ivaAcquistiDetraibile, EXPECTED_A.ivaAcquistiDetraibile)
assertEq('saldoPeriodo', calcA.saldoPeriodo, EXPECTED_A.saldoPeriodo)
assertEq('debitoDaVersare', calcA.debitoDaVersare, EXPECTED_A.debitoDaVersare)
assertEq('f24Dovuto', calcA.f24Dovuto, EXPECTED_A.f24Dovuto)
if (calcA.rimandoSottoSoglia !== EXPECTED_A.rimandoSottoSoglia) {
  throw new Error('rimandoSottoSoglia mismatch')
}
if (calcA.righeIncluseCount !== EXPECTED_A.righeIncluseCount) {
  throw new Error(`righeIncluseCount got ${calcA.righeIncluseCount}`)
}

const calcB = calcoloLiquidazioneIvaDefinitiva(rowsB, {
  societaId: SOCIETA_B,
  periodoInizio: PERIODO_INIZIO,
  periodoFine: PERIODO_FINE,
  periodicita: 'mensile',
})
assertEq('B_ivaDebitoEffettiva', calcB.ivaDebitoEffettiva, 0)
assertEq('B_saldoPeriodo', calcB.saldoPeriodo, 0)
if (calcB.righeIncluseCount !== 0) throw new Error('B must have zero included rows')

let persistedId = null
const persist = String(process.env.FISCOSIM_SG_E2E_LIQ_PERSIST || '') === 'APPROVED'
if (persist) {
  const insertSql = `
INSERT INTO public.liquidazione_iva (
  societa_id, periodicita, anno, mese, trimestre,
  periodo_inizio, periodo_fine, iva_debito, iva_credito, saldo, note
) VALUES (
  '${SOCIETA_A}', 'mensile', 2026, 3, NULL,
  '${PERIODO_INIZIO}', '${PERIODO_FINE}',
  ${calcA.ivaDebitoEffettiva}, ${calcA.ivaAcquistiDetraibile}, ${calcA.saldoPeriodo},
  '[SG-E2E] Liquidazione mensile marzo 2026 da registri persistiti Stage3W'
)
ON CONFLICT (societa_id, periodicita, anno, mese)
WHERE periodicita = 'mensile' AND mese IS NOT NULL AND societa_id IS NOT NULL
DO UPDATE SET
  iva_debito = EXCLUDED.iva_debito,
  iva_credito = EXCLUDED.iva_credito,
  saldo = EXCLUDED.saldo,
  note = EXCLUDED.note,
  updated_at = now()
RETURNING id::text;
`
  const insertOut = psqlExec(insertSql)
  persistedId = insertOut.split(/\r?\n/).map((s) => s.trim()).find((s) => /^[0-9a-f-]{36}$/i.test(s))
  if (!persistedId) {
    throw new Error(`LIQ_PERSIST_FAILED output=${insertOut.slice(0, 300)}`)
  }
  const check = psqlJson(`
SELECT row_to_json(t) FROM (
  SELECT id::text, iva_debito, iva_credito, saldo, note
  FROM public.liquidazione_iva WHERE id='${persistedId}'
) t;
`)
  assertEq('persisted_iva_debito', check.iva_debito, EXPECTED_A.ivaDebitoEffettiva)
  assertEq('persisted_iva_credito', check.iva_credito, EXPECTED_A.ivaAcquistiDetraibile)
  assertEq('persisted_saldo', check.saldo, EXPECTED_A.saldoPeriodo)
  if (!String(check.note || '').includes('[SG-E2E]')) throw new Error('persisted note missing SG-E2E marker')
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 23)
const reportPath = join(LAB, `STAGE3W_LIQUIDAZIONE_SGE2E_${stamp}.txt`)
const lines = [
  'STAGE3W_LIQUIDAZIONE_SGE2E',
  `CONTAINER=${CONTAINER}`,
  `SOCIETA_A=${SOCIETA_A}`,
  `PERIODO=${PERIODO_INIZIO}/${PERIODO_FINE}`,
  'SOURCE=registri_iva_LAB_real',
  'DOMAIN=calcoloLiquidazioneIvaDefinitiva',
  `IVA_VENDITE_LORDA=${calcA.ivaVenditeLorda}`,
  `IVA_SPLIT_ESCLUSA=${calcA.ivaSplitEsclusa}`,
  `IVA_DEBITO_EFFETTIVA=${calcA.ivaDebitoEffettiva}`,
  `IVA_ACQUISTI_DETRAIBILE=${calcA.ivaAcquistiDetraibile}`,
  `SALDO_PERIODO=${calcA.saldoPeriodo}`,
  `F24_DOVUTO=${calcA.f24Dovuto}`,
  `RIMANDO_SOTTO_SOGLIA=${calcA.rimandoSottoSoglia}`,
  `RIGHE_INCLUSE=${calcA.righeIncluseCount}`,
  `PERSIST=${persist ? 'YES' : 'NO'}`,
  persistedId ? `LIQUIDAZIONE_IVA_ID=${persistedId}` : 'LIQUIDAZIONE_IVA_ID=',
  'RESULT=PASS',
]
writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8')
console.log('STAGE3W_LIQUIDAZIONE_SGE2E|PASS')
console.log(`REPORT=${reportPath}`)
if (persistedId) console.log(`LIQUIDAZIONE_IVA_ID=${persistedId}`)
