import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const LIMIT = (() => {
  const m = process.argv.slice(2).join(' ').match(/--limit\s+(\d+)/)
  return m ? parseInt(m[1], 10) : 5000
})()

function parsePercentFromText(s) {
  if (!s) return null
  const t = String(s).toLowerCase()
  if (!t.includes('indetra')) return null
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*%/)
  if (!m) return null
  const v = parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null
}

function parseDetPercentFromText(s) {
  if (!s) return null
  const t = String(s).toLowerCase()
  // supporta "detraibile 40%" oppure "indetraibile al 100%"
  // NB: "indetraibile" contiene "detraibile" → serve boundary
  const mDet = t.match(/\bdetraibile\b\s*(?:al)?\s*(\d+(?:[.,]\d+)?)\s*%/)
  if (mDet) {
    const v = parseFloat(mDet[1].replace(',', '.'))
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null
  }
  const mInd = t.match(/\bindetraibile\b\s*(?:al)?\s*(\d+(?:[.,]\d+)?)\s*%/)
  if (mInd) {
    const v = parseFloat(mInd[1].replace(',', '.'))
    return Number.isFinite(v) ? Math.max(0, Math.min(100, 100 - v)) : null
  }
  return null
}

function isDetraibileFalse(v) {
  if (v === false || v === 0) return true
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'false' || s === '0' || s === 'no' || s === 'n' || s === 'off' || s === 'f'
}

function num(v) {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const x = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

async function main() {
  const { data, error } = await sb
    .from('causali_iva')
    .select('id,codice,descrizione,detraibile,percentuale_detraibilita')
    .limit(LIMIT)

  if (error) throw error

  const changes = []

  for (const c of data || []) {
    const current = num(c.percentuale_detraibilita)

    let next = null

    // 1) Se non detraibile → detraibilità 0%
    if (isDetraibileFalse(c.detraibile)) next = 0

    // 2) Se in descrizione c'è una % indetraibile → usa quella
    if (next == null) {
      const det = parseDetPercentFromText(c.descrizione)
      if (det != null) next = det
    }

    if (next == null) continue
    if (next === current) continue

    changes.push({
      id: c.id,
      codice: c.codice,
      descrizione: c.descrizione,
      from: current,
      to: next
    })
  }

  console.log(`Found ${changes.length} causali_iva to update.`)
  for (const ch of changes.slice(0, 50)) {
    console.log(`- ${ch.codice || ch.id}: ${ch.from} -> ${ch.to} (${String(ch.descrizione || '').slice(0, 60)})`)
  }
  if (changes.length > 50) console.log(`... +${changes.length - 50} more`)

  if (!APPLY) {
    console.log('\nDry-run. Re-run with --apply to write updates.')
    return
  }

  let updated = 0
  for (const ch of changes) {
    const { error: upErr } = await sb
      .from('causali_iva')
      .update({ percentuale_detraibilita: ch.to })
      .eq('id', ch.id)
    if (upErr) {
      console.error('Update failed', ch.codice || ch.id, upErr)
      continue
    }
    updated++
  }

  console.log(`\nUpdated ${updated}/${changes.length} causali_iva.`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

