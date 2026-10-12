/**
 * Stage3W SG-P2-06: controllo F24 importato vs ritenute maturate (1040).
 * Seeds matured ritenute (da_versare) + public.f24 rows, then asserts
 * verde / giallo / rosso via buildRitenuteF24ControlRows.
 * LAB-only. Never prints tokens/passwords. Not an F24 compiler.
 */
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildRitenuteScadenzarioRows } from '../../src/modules/contabilita/application/ritenute/ritenuteScadenzarioService.js'
import {
  buildRitenuteF24ControlRows,
  summarizeF24ControlStatuses,
} from '../../src/modules/contabilita/application/ritenute/buildRitenuteF24ControlRows.js'

const CONTAINER = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const SOCIETA_A = '72000000-0000-4000-8000-000000000001'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outPath = join(process.cwd(), 'REPORT', `STAGE3W_RITENUTE_F24_CONTROL_${stamp}.txt`)

const lines = []
function log(msg) {
  const row = String(msg)
  lines.push(row)
  console.log(row)
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
  'Professionista SG-E2E F24',
  'Mario',
  'Rossi',
  'A',
  20,
  true
)
ON CONFLICT (id) DO UPDATE SET attivo=true, ragione_sociale=EXCLUDED.ragione_sociale;
`)
}

function insertMaturedRitenuta({
  id,
  percipienteId,
  periodo,
  anno,
  importo,
  imponibile,
  dataPagamento,
  dataScadenza,
  numeroDocumento,
}) {
  psql(`
INSERT INTO public.ritenute_dacconto (
  id, societa_id, percipiente_id, percipiente_cf, percipiente_denominazione,
  data_documento, numero_documento, data_pagamento, data_scadenza,
  periodo_riferimento, anno_riferimento, compenso_lordo, imponibile_ritenuta,
  aliquota_ritenuta, importo_ritenuta, ritenuta, compenso_netto,
  codice_tributo, stato, causale_prestazione, inclusa_cu
) VALUES (
  '${id}'::uuid,
  '${SOCIETA_A}'::uuid,
  '${percipienteId}'::uuid,
  'RSSMRA80A01H501U',
  'Professionista SG-E2E F24',
  ${sqlQuote(dataPagamento)},
  ${sqlQuote(numeroDocumento)},
  ${sqlQuote(dataPagamento)},
  ${sqlQuote(dataScadenza)},
  ${sqlQuote(periodo)},
  ${anno},
  ${imponibile},
  ${imponibile},
  20,
  ${importo},
  ${importo},
  ${Math.round((imponibile - importo) * 100) / 100},
  '1040',
  'da_versare',
  'A',
  true
)
ON CONFLICT (id) DO UPDATE SET
  stato='da_versare',
  importo_ritenuta=EXCLUDED.importo_ritenuta,
  data_scadenza=EXCLUDED.data_scadenza,
  periodo_riferimento=EXCLUDED.periodo_riferimento;
`)
}

function insertF24({
  id,
  periodo,
  anno,
  importo,
  dataPagamento,
  dataScadenza,
  descrizione,
}) {
  psql(`
INSERT INTO public.f24 (
  id, cliente_id, cliente_nome, data_scadenza, data_pagamento, descrizione,
  codice_tributo, anno_riferimento, periodo_riferimento, importo, stato, note
) VALUES (
  '${id}'::uuid,
  NULL,
  'SG-E2E-A F24 import',
  ${sqlQuote(dataScadenza)},
  ${sqlQuote(dataPagamento)},
  ${sqlQuote(descrizione)},
  '1040',
  ${anno},
  ${sqlQuote(periodo)},
  ${importo},
  'pagato',
  '[SG-E2E] P2-06 F24 importato LAB'
)
ON CONFLICT (id) DO UPDATE SET
  importo=EXCLUDED.importo,
  data_pagamento=EXCLUDED.data_pagamento,
  periodo_riferimento=EXCLUDED.periodo_riferimento,
  stato='pagato';
`)
}

async function main() {
  log('P2_06_START Controllo F24 importato vs ritenute maturate 1040')

  const running = psql(`SELECT CASE WHEN current_database()='postgres' THEN 'LAB_DB_OK' ELSE 'LAB_DB_BAD' END`)
  log(`DB=${running}`)
  if (running !== 'LAB_DB_OK') throw new Error('LAB_DB')

  const percipienteId = randomUUID()
  ensurePercipiente(percipienteId)
  log(`PERCIPIENTE_ID=${percipienteId}`)

  const ritVerde = randomUUID()
  const ritGiallo = randomUUID()
  const ritRosso = randomUUID()
  const f24Verde = randomUUID()
  const f24Giallo = randomUUID()
  const f24Rosso = randomUUID()

  insertMaturedRitenuta({
    id: ritVerde,
    percipienteId,
    periodo: '09/2026',
    anno: 2026,
    importo: 200,
    imponibile: 1000,
    dataPagamento: '2026-09-20',
    dataScadenza: '2026-10-16',
    numeroDocumento: `SG-E2E-P206-V-${stamp.slice(-6)}`,
  })
  insertMaturedRitenuta({
    id: ritGiallo,
    percipienteId,
    periodo: '08/2026',
    anno: 2026,
    importo: 150,
    imponibile: 750,
    dataPagamento: '2026-08-20',
    dataScadenza: '2026-09-16',
    numeroDocumento: `SG-E2E-P206-G-${stamp.slice(-6)}`,
  })
  insertMaturedRitenuta({
    id: ritRosso,
    percipienteId,
    periodo: '07/2026',
    anno: 2026,
    importo: 100,
    imponibile: 500,
    dataPagamento: '2026-07-20',
    dataScadenza: '2026-08-16',
    numeroDocumento: `SG-E2E-P206-R-${stamp.slice(-6)}`,
  })
  log(`RIT_IDS=${[ritVerde, ritGiallo, ritRosso].join(',')}`)

  // Verde: full amount on time
  insertF24({
    id: f24Verde,
    periodo: '09/2026',
    anno: 2026,
    importo: 200,
    dataPagamento: '2026-10-10',
    dataScadenza: '2026-10-16',
    descrizione: '[SG-E2E] F24 1040 verde on-time',
  })
  // Giallo: full amount late
  insertF24({
    id: f24Giallo,
    periodo: '08/2026',
    anno: 2026,
    importo: 150,
    dataPagamento: '2026-09-20',
    dataScadenza: '2026-09-16',
    descrizione: '[SG-E2E] F24 1040 giallo late',
  })
  // Rosso: shortfall
  insertF24({
    id: f24Rosso,
    periodo: '07/2026',
    anno: 2026,
    importo: 40,
    dataPagamento: '2026-08-10',
    dataScadenza: '2026-08-16',
    descrizione: '[SG-E2E] F24 1040 rosso shortfall',
  })
  log(`F24_IDS=${[f24Verde, f24Giallo, f24Rosso].join(',')}`)

  const ritenute = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
  SELECT id::text AS id, stato, data_pagamento::text AS data_pagamento,
         data_scadenza::text AS data_scadenza, periodo_riferimento, anno_riferimento,
         importo_ritenuta, imponibile_ritenuta, codice_tributo,
         percipiente_id::text AS percipiente_id, percipiente_cf, percipiente_denominazione,
         numero_documento
  FROM public.ritenute_dacconto
  WHERE id IN ('${ritVerde}'::uuid,'${ritGiallo}'::uuid,'${ritRosso}'::uuid)
) t
`)
  log(`RITENUTE_COUNT=${ritenute.length}`)
  if (ritenute.length !== 3) throw new Error('RITENUTE_SEED_FAIL')

  const f24Lines = psqlJson(`
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
  SELECT id::text AS id, codice_tributo, periodo_riferimento, anno_riferimento,
         importo, data_pagamento::text AS data_pagamento, data_scadenza::text AS data_scadenza,
         descrizione, stato
  FROM public.f24
  WHERE id IN ('${f24Verde}'::uuid,'${f24Giallo}'::uuid,'${f24Rosso}'::uuid)
) t
`)
  log(`F24_COUNT=${f24Lines.length}`)
  if (f24Lines.length !== 3) throw new Error('F24_SEED_FAIL')

  const scadenzario = buildRitenuteScadenzarioRows({
    ritenute,
    year: 2026,
    today: '2026-09-21',
  })
  log(`SCADENZARIO_COUNT=${scadenzario.length}`)
  if (scadenzario.length !== 3) throw new Error('SCADENZARIO_COUNT')

  const controlled = buildRitenuteF24ControlRows({
    scadenzarioRows: scadenzario,
    f24Lines,
    tributeCode: '1040',
  })
  const byId = Object.fromEntries(controlled.map((row) => [row.id, row.f24Control]))
  log(`CONTROL_VERDE=${JSON.stringify(byId[ritVerde])}`)
  log(`CONTROL_GIALLO=${JSON.stringify(byId[ritGiallo])}`)
  log(`CONTROL_ROSSO=${JSON.stringify(byId[ritRosso])}`)

  if (byId[ritVerde]?.status !== 'verde') throw new Error('EXPECT_VERDE')
  if (byId[ritGiallo]?.status !== 'giallo') throw new Error('EXPECT_GIALLO')
  if (byId[ritRosso]?.status !== 'rosso') throw new Error('EXPECT_ROSSO')
  if (Number(byId[ritRosso]?.residualAmount) !== 60) throw new Error('EXPECT_RESIDUAL_60')

  const summary = summarizeF24ControlStatuses(controlled)
  log(`SUMMARY=${JSON.stringify(summary)}`)
  if (summary.verde !== 1 || summary.giallo !== 1 || summary.rosso !== 1) {
    throw new Error('SUMMARY_MISMATCH')
  }

  log('P2_06_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P2_06_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P2_06_RESULT=FAIL'))) process.exit(1)
  })
