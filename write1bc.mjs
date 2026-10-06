import { createClient } from '@supabase/supabase-js'

const cfg = {
  documentId: 'd7cfe444-229d-405b-863d-3ea4448d1748',
  societaId: '4a728851-be5a-412c-9ce6-ec07b72fcdfa',
  operatorId: '7abb6432-9862-42d9-923a-045860ff7a92',
  registrationDate: '2025-12-31',
  esercizio: 2025,
  causaleContabileId: '462c0200-752a-40a7-a237-32511c38fc95',
  contoCostoId: '008dfbd0-5967-41c5-8781-4a427d356d58',
  contoFornitoreId: '58b9940e-5d06-4da4-863a-6fbcb41c2c1e',
  imponibile: 40.61,
  iva: 8.94,
  totale: 49.55,
}

function fail(message, extra = {}) {
  console.log(JSON.stringify({ ok: false, message, ...extra }, null, 2))
  process.exit(1)
}

async function main() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const docRes = await db.from('documenti_contabilita').select('*').eq('id', cfg.documentId).maybeSingle()
  if (docRes.error) fail('Errore lettura documento', { error: docRes.error.message })
  
  // Minimal payload basato solo su colonne sicure
  const pnPayload = {
    societa_id: cfg.societaId,
    numero_registrazione: Math.floor(Date.now() / 1000),
    data_registrazione: cfg.registrationDate,
    causale_id: cfg.causaleContabileId,
    descrizione: 'Import fattura',
    totale_dare: cfg.totale,
    totale_avere: cfg.totale,
    stato: 'provvisoria'
  }

  const pnInsert = await db.from('prima_nota').insert([pnPayload]).select('id').single()
  if (pnInsert.error) fail('Insert prima_nota fallita (ultra-minimal)', { error: pnInsert.error.message })

  const righe = [
    { prima_nota_id: pnInsert.data.id, riga_numero: 1, conto_id: cfg.contoCostoId, importo_dare: cfg.imponibile, importo_avere: 0 },
    { prima_nota_id: pnInsert.data.id, riga_numero: 3, conto_id: cfg.contoFornitoreId, importo_dare: 0, importo_avere: cfg.totale }
  ]
  const righeInsert = await db.from('prima_nota_righe').insert(righe)
  if (righeInsert.error) fail('Insert righe fallita', { error: righeInsert.error.message })

  console.log(JSON.stringify({ ok: true, verdict: 'WRITE1B/C riuscita (ultra-minimal)', prima_nota_id: pnInsert.data.id }, null, 2))
}
main().catch(err => fail('Errore', { error: err.message }))
