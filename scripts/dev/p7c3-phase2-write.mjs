/**
 * P7-ACCELERATED-2 — registri_iva + partitario + finalizzazione documento
 * Esegue:
 * 1. INSERT registri_iva acquisti
 * 2. INSERT partitario fornitore
 * 3. UPDATE documenti_contabilita (collega prima_nota, registered, unlock)
 * 4. Verifica post-write
 */
import { getSupabaseAdmin } from '../../lib/db.js'

const SOCIETA_ID = '4a728851-be5a-412c-9ce6-ec07b72fcdfa'
const PN_ID = '99cc9361-bbda-4285-89ac-70e7474f2a94'
const DOC_ID = 'd7cfe444-229d-405b-863d-3ea4448d1748'
const CONTO_FORN_ID = '58b9940e-5d06-4da4-863a-6fbcb41c2c1e'
const CAUSALE_IVA_ID = '06515e63-4acf-479b-9bb4-77601cd93ce8'
const FORNITORE_NOME = 'HAPPY CASA STORE S.R.L.'
const PIVA = '02708430737'
const IMPONIBILE = 40.61
const IVA_IMPORTO = 8.94
const TOTALE = 49.55
const DATA_REG = '2025-12-31'
const DATA_DOC = '2025-12-10'
const NUM_DOC = '184 00582'

const db = await getSupabaseAdmin()

// Step 1: INSERT registri_iva acquisti
const rivPayload = {
  societa_id: SOCIETA_ID,
  prima_nota_id: PN_ID,
  documento_id: DOC_ID,
  tipo: 'acquisto',
  data: DATA_REG,
  data_documento: DATA_DOC,
  numero_documento: NUM_DOC,
  soggetto_piva: PIVA,
  soggetto_denominazione: FORNITORE_NOME,
  causale_iva_id: CAUSALE_IVA_ID,
  imponibile: IMPONIBILE,
  iva: IVA_IMPORTO,
  percentuale_detraibilita: 100,
  detraibile: true,
  iva_detraibile: IVA_IMPORTO,
  iva_indetraibile: 0,
  // totale: TOTALE, // campo non esistente nello schema live
}
const { data: rivData, error: rivErr } = await db
  .from('registri_iva')
  .insert(rivPayload)
  .select('id')
  .single()
if (rivErr) {
  console.error(JSON.stringify({ step: 'insert_registri_iva', ok: false, error: rivErr.message, code: rivErr.code }))
  process.exit(1)
}
const RIV_ID = rivData.id

// Step 2: INSERT partitario fornitore
const partPayload = {
  societa_id: SOCIETA_ID,
  tipo: 'fornitore',
  prima_nota_id: PN_ID,
  conto_id: CONTO_FORN_ID,
  numero_documento: NUM_DOC,
  data_documento: DATA_DOC,
  importo_originale: TOTALE,
  importo_residuo: TOTALE,
  stato: 'aperta',
}
const { data: partData, error: partErr } = await db
  .from('partitario')
  .insert(partPayload)
  .select('id')
  .single()
if (partErr) {
  console.error(JSON.stringify({ step: 'insert_partitario', ok: false, error: partErr.message, code: partErr.code }))
  // rollback registri_iva
  await db.from('registri_iva').delete().eq('id', RIV_ID)
  process.exit(1)
}
const PART_ID = partData.id

// Step 3: UPDATE documenti_contabilita
const { error: updErr } = await db
  .from('documenti_contabilita')
  .update({
    prima_nota_id: PN_ID,
    workflow_status: 'registered',
    registered_at: new Date().toISOString(),
    locked_by: null,
    locked_at: null,
  })
  .eq('id', DOC_ID)
if (updErr) {
  console.error(JSON.stringify({ step: 'update_documento', ok: false, error: updErr.message, code: updErr.code }))
  // rollback registri_iva e partitario
  await db.from('registri_iva').delete().eq('id', RIV_ID)
  await db.from('partitario').delete().eq('id', PART_ID)
  process.exit(1)
}

// Step 4: Verifica post-write
const [rivCheck, partCheck, docCheck, pnCheck, righeCheck] = await Promise.all([
  db.from('registri_iva').select('id').eq('prima_nota_id', PN_ID),
  db.from('partitario').select('id').eq('prima_nota_id', PN_ID),
  db.from('documenti_contabilita').select('id,workflow_status,prima_nota_id,locked_by,locked_at').eq('id', DOC_ID).single(),
  db.from('prima_nota').select('id').eq('id', PN_ID),
  db.from('prima_nota_righe').select('id').eq('prima_nota_id', PN_ID),
])

const output = {
  registri_iva_ids: rivCheck.data?.map(r => r.id),
  partitario_ids: partCheck.data?.map(r => r.id),
  documento: docCheck.data,
  pn_count: pnCheck.data?.length,
  righe_count: righeCheck.data?.length,
}
console.log(JSON.stringify({
  ok: true,
  registri_iva_id: RIV_ID,
  partitario_id: PART_ID,
  documento_finale: docCheck.data,
  duplicati_registri_iva: (rivCheck.data?.length > 1),
  duplicati_partitario: (partCheck.data?.length > 1),
  pn_count: output.pn_count,
  righe_count: output.righe_count,
}, null, 2))







