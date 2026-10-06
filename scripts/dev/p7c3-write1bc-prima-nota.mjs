/**
 * WRITE1B/C — INSERT prima_nota + prima_nota_righe
 * Documento: d7cfe444-229d-405b-863d-3ea4448d1748
 * Perimetro: solo prima_nota + prima_nota_righe. Rollback se righe falliscono.
 */
import { getSupabaseAdmin } from '../../lib/db.js'

const DOCUMENTO_ID    = 'd7cfe444-229d-405b-863d-3ea4448d1748'
const SOCIETA_ID      = '4a728851-be5a-412c-9ce6-ec07b72fcdfa'
const OPERATOR_ID     = '7abb6432-9862-42d9-923a-045860ff7a92'
const CAUSALE_ID      = '462c0200-752a-40a7-a237-32511c38fc95'
const CONTO_COSTO_ID  = '008dfbd0-5967-41c5-8781-4a427d356d58'
const CONTO_FORN_ID   = '58b9940e-5d06-4da4-863a-6fbcb41c2c1e'
const CAUSALE_IVA_ID  = '06515e63-4acf-479b-9bb4-77601cd93ce8'
const FORNITORE_NOME  = 'HAPPY CASA STORE S.R.L.'
const IMPONIBILE      = 40.61
const IVA_IMPORTO     = 8.94
const TOTALE          = 49.55

const db = await getSupabaseAdmin()

// Step 0: leggo documento per data_documento e numero_documento
const { data: doc, error: docErr } = await db
  .from('documenti_contabilita')
  .select('data_documento, numero_documento')
  .eq('id', DOCUMENTO_ID)
  .single()

if (docErr) {
  console.error(JSON.stringify({ step: 'read_documento', ok: false, error: docErr.message }))
  process.exit(1)
}

// Step 1: calcolo prossimo numero_registrazione per questa società nel 2025
const { data: maxRows, error: maxErr } = await db
  .from('prima_nota')
  .select('numero_registrazione')
  .eq('societa_id', SOCIETA_ID)
  .gte('data_registrazione', '2025-01-01')
  .lte('data_registrazione', '2025-12-31')
  .order('numero_registrazione', { ascending: false })
  .limit(1)

if (maxErr) {
  console.error(JSON.stringify({ step: 'max_numero', ok: false, error: maxErr.message }))
  process.exit(1)
}

const nextNumero = maxRows.length > 0 ? (maxRows[0].numero_registrazione + 1) : 1
console.error(`[info] numero_registrazione: ${nextNumero}`)

// Step 2: INSERT prima_nota
const pnPayload = {
  societa_id:               SOCIETA_ID,
  numero_registrazione:     nextNumero,
  data_registrazione:       '2025-12-31',
  data_documento:           doc.data_documento  || null,
  numero_documento:         doc.numero_documento || null,
  causale_id:               CAUSALE_ID,
  descrizione:              `Import fattura ${FORNITORE_NOME}`,
  cliente_fornitore_id:     CONTO_FORN_ID,
  cliente_fornitore_nome:   FORNITORE_NOME,
  totale_dare:              TOTALE,
  totale_avere:             TOTALE,
  stato:                    'provvisoria',
  created_by:               OPERATOR_ID,
  documento_contabilita_id: DOCUMENTO_ID,
}

const { data: pnData, error: pnErr } = await db
  .from('prima_nota')
  .insert(pnPayload)
  .select('id, numero_registrazione')
  .single()

if (pnErr) {
  console.error(JSON.stringify({ step: 'insert_prima_nota', ok: false, error: pnErr.message, code: pnErr.code }))
  process.exit(1)
}

const pnId = pnData.id
console.error(`[info] prima_nota creata: ${pnId}`)

// Step 3: INSERT 3 righe prima_nota_righe
const righePayload = [
  {
    prima_nota_id:  pnId,
    riga_numero:    1,
    conto_id:       CONTO_COSTO_ID,
    descrizione_riga: 'Costo imponibile',
    importo_dare:   IMPONIBILE,
    importo_avere:  0,
    created_by:     OPERATOR_ID,
  },
  {
    prima_nota_id:   pnId,
    riga_numero:     2,
    conto_id:        null,
    causale_iva_id:  CAUSALE_IVA_ID,
    imponibile:      IMPONIBILE,
    iva:             IVA_IMPORTO,
    descrizione_riga: 'IVA acquisti',
    importo_dare:    IVA_IMPORTO,
    importo_avere:   0,
    created_by:      OPERATOR_ID,
  },
  {
    prima_nota_id:  pnId,
    riga_numero:    3,
    conto_id:       CONTO_FORN_ID,
    descrizione_riga: 'Debito fornitore',
    importo_dare:   0,
    importo_avere:  TOTALE,
    created_by:     OPERATOR_ID,
  },
]

const { data: righeData, error: righeErr } = await db
  .from('prima_nota_righe')
  .insert(righePayload)
  .select('id, riga_numero, importo_dare, importo_avere')

if (righeErr) {
  console.error(JSON.stringify({ step: 'insert_righe', ok: false, error: righeErr.message, code: righeErr.code }))
  // Rollback: elimino prima_nota
  const { error: rbErr } = await db.from('prima_nota').delete().eq('id', pnId)
  console.error(JSON.stringify({ step: 'rollback_prima_nota', ok: !rbErr, error: rbErr?.message || null }))
  process.exit(1)
}

// Quadratura
const dare  = righeData.reduce((a, r) => a + Number(r.importo_dare  || 0), 0)
const avere = righeData.reduce((a, r) => a + Number(r.importo_avere || 0), 0)
const balanced = Math.round(dare * 100) === Math.round(avere * 100)

console.log(JSON.stringify({
  ok: true,
  prima_nota_id:           pnId,
  numero_registrazione:    pnData.numero_registrazione,
  documento_contabilita_id: DOCUMENTO_ID,
  righe_create:            righeData.length,
  righe_ids:               righeData.map(r => ({ id: r.id, riga_numero: r.riga_numero })),
  quadratura: {
    totale_dare:  Math.round(dare  * 100) / 100,
    totale_avere: Math.round(avere * 100) / 100,
    balanced,
  },
}, null, 2))
