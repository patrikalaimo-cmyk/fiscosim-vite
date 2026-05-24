import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.match(/^\w+=/))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const BASE = env.SUPABASE_URL.replace(/\/$/, '')
const KEY  = env.SUPABASE_SERVICE_ROLE_KEY

const oaRes = await fetch(`${BASE}/rest/v1/`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/openapi+json' }
})
const oa = await oaRes.json()
const defs = oa.definitions || {}

const ae = defs['accounting_entries']
if (!ae) {
  console.log('accounting_entries: NOT IN LIVE SCHEMA (PostgREST cache)')
} else {
  const req = new Set(ae.required || [])
  const cols = Object.entries(ae.properties || {}).map(([n, v]) => `${n}:${v.type || v.format || '?'}${req.has(n) ? '(req)' : ''}${v.default != null ? `[${v.default}]` : ''}`)
  console.log('accounting_entries columns:\n' + cols.join('\n'))
}

// Also list ALL tables in live
console.log('\nALL TABLES in live:')
console.log(Object.keys(defs).sort().join('\n'))
