import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.match(/^\w+=/))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const BASE    = env.SUPABASE_URL.replace(/\/$/, '')
const KEY     = env.SUPABASE_SERVICE_ROLE_KEY

const oaRes = await fetch(`${BASE}/rest/v1/`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/openapi+json' }
})
const oa = await oaRes.json()
const defs = oa.definitions || {}

function cols(table) {
  const d = defs[table]
  if (!d) return `TABLE NOT FOUND: ${table}`
  const req = new Set(d.required || [])
  return Object.entries(d.properties || {}).map(([n, v]) => `${n}:${v.type || v.format || '?'}${req.has(n) ? '(req)' : ''}${v.default != null ? `[def=${v.default}]` : ''}`)
}

// Also list all tables with 'iva' or 'partita' in name
const allTables = Object.keys(defs).filter(k => k.includes('iva') || k.includes('partita') || k.includes('registro'))
console.log('TABLES WITH iva/partita/registro:', allTables.join(', '))

console.log('\n--- registri_iva ---')
console.log(cols('registri_iva').join('\n'))

console.log('\n--- partitario ---')
console.log(cols('partitario').join('\n'))
