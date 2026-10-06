// audit schema + precheck completo per P7-ACCELERATED-2
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.match(/^\w+=/))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const BASE   = env.SUPABASE_URL.replace(/\/$/, '')
const KEY    = env.SUPABASE_SERVICE_ROLE_KEY
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

async function rest(method, path, body) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = text }
  return { ok: res.ok, status: res.status, data: json }
}

// 1. Schema via OpenAPI
const oaRes = await fetch(`${BASE}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/openapi+json' } })
const oa = await oaRes.json()
const defs = oa.definitions || {}

function getColumns(table) {
  const d = defs[table]
  if (!d) return null
  const req = new Set(d.required || [])
  return Object.entries(d.properties || {}).map(([n, v]) => ({
    n, type: v.type || v.format || '?', nullable: !req.has(n), default: v.default ?? null
  }))
}

const registriIvaColumns = getColumns('registri_iva')
const partitarioColumns   = getColumns('partitario')

console.log('=== SCHEMA registri_iva ===')
console.log(JSON.stringify(registriIvaColumns, null, 2))
console.log('=== SCHEMA partitario ===')
console.log(JSON.stringify(partitarioColumns, null, 2))

// 2. Precheck 1: documenti_contabilita esiste ed è registering
const doc = await rest('GET', `documenti_contabilita?id=eq.d7cfe444-229d-405b-863d-3ea4448d1748&select=id,workflow_status,validation_status,prima_nota_id,locked_by,locked_at`)
const docRow = Array.isArray(doc.data) ? doc.data[0] : null

// 3. Precheck 2-5: prima_nota + righe
const pn = await rest('GET', `prima_nota?id=eq.99cc9361-bbda-4285-89ac-70e7474f2a94&select=id,documento_contabilita_id,numero_registrazione,totale_dare,totale_avere,stato`)
const pnRow = Array.isArray(pn.data) ? pn.data[0] : null

const righe = await rest('GET', `prima_nota_righe?prima_nota_id=eq.99cc9361-bbda-4285-89ac-70e7474f2a94&select=id,riga_numero,importo_dare,importo_avere,causale_iva_id&order=riga_numero.asc`)
const righeRows = Array.isArray(righe.data) ? righe.data : []

// 4. Precheck 7: nessun registri_iva già esistente per questa prima_nota
const rivExisting = await rest('GET', `registri_iva?prima_nota_id=eq.99cc9361-bbda-4285-89ac-70e7474f2a94&select=id`)
const rivExists = Array.isArray(rivExisting.data) && rivExisting.data.length > 0

// 4b. Fallback: cerca con documento_id
const rivByDocId = await rest('GET', `registri_iva?documento_id=eq.d7cfe444-229d-405b-863d-3ea4448d1748&select=id`)
const rivByDocExists = Array.isArray(rivByDocId.data) && rivByDocId.data.length > 0

// 5. Precheck 8: nessun partitario già esistente per questa prima_nota
const partExisting = await rest('GET', `partitario?prima_nota_id=eq.99cc9361-bbda-4285-89ac-70e7474f2a94&select=id`)
const partExists = Array.isArray(partExisting.data) && partExisting.data.length > 0

const dare  = righeRows.reduce((a, r) => a + Number(r.importo_dare  || 0), 0)
const avere = righeRows.reduce((a, r) => a + Number(r.importo_avere || 0), 0)
const rigaIva = righeRows.find(r => r.causale_iva_id === '06515e63-4acf-479b-9bb4-77601cd93ce8')

const prechecks = {
  '1_doc_registering':    docRow?.workflow_status === 'registering',
  '2_doc_pn_null':        docRow?.prima_nota_id === null || docRow?.prima_nota_id === undefined,
  '3_pn_doc_link':        pnRow?.documento_contabilita_id === 'd7cfe444-229d-405b-863d-3ea4448d1748',
  '4_righe_count_3':      righeRows.length === 3,
  '5_quadratura':         Math.round(dare * 100) === Math.round(avere * 100) && Math.round(dare * 100) === 4955,
  '6_riga_iva_present':   !!rigaIva,
  '7_no_riv_existing':    !rivExists && !rivByDocExists,
  '8_no_part_existing':   !partExists,
}

const allOk = Object.values(prechecks).every(Boolean)

console.log('=== PRECHECK ===')
console.log(JSON.stringify({
  prechecks,
  allOk,
  doc: docRow,
  pn: pnRow,
  righe: righeRows,
  dare: Math.round(dare*100)/100,
  avere: Math.round(avere*100)/100,
  rivExistingByPnId: rivExisting.data,
  rivExistingByDocId: rivByDocId.data,
  partExisting: partExisting.data,
}, null, 2))

if (!allOk) {
  console.error('PRECHECK FALLITO — nessuna scrittura eseguita')
  process.exit(1)
}
console.log('PRECHECK OK — pronto per write')
