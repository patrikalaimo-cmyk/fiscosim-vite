/**
 * Fiscal Suggestion Engine (detraibilità): confronta fiscal_knowledge con causale IVA applicata
 * e propone l’allineamento (es. costi veicolo → 50% detraibile).
 */

import { getFiscalKnowledge, FISCAL_CATEGORIES_ACCOUNTING } from '../lib/fiscalKnowledge.js'
import { buildDocContextText, detectSpendCategory } from './ivaAnomalyEngine.js'

const TOLERANCE_PCT = 5
const MIN_IMPONIBILE = 40
const MAX_INSIGHTS = 35

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function isPassiva(d) {
  return String(d?.tipo_documento || '').toLowerCase().includes('passiva')
}

function rowBlob(r) {
  return [r.valore, r.descrizione, r.chiave, r.contesto].filter(Boolean).join(' ')
}

/**
 * @param {object[]} rows
 * @param {RegExp} re
 */
function filterKnowledgeByPattern(rows, re) {
  return (rows || []).filter((r) => re.test(rowBlob(r)))
}

function pctFromMetadata(rows) {
  const keys = [
    'suggested_detraibilita_pct',
    'detraibilita_percentuale',
    'detraibilita_iva_pct',
    'iva_detraibilita_pct',
    'detraibilita_pct',
  ]
  for (const r of rows || []) {
    const m = r.metadata && typeof r.metadata === 'object' ? r.metadata : {}
    for (const k of keys) {
      if (m[k] == null) continue
      const n = num(m[k])
      if (n >= 0 && n <= 100) return { pct: Math.round(n), source: `metadata:${k}` }
    }
  }
  return null
}

/**
 * Estrae una percentuale di detraibilità dal testo knowledge.
 * @returns {{ pct: number, source: string } | null}
 */
function pctFromKnowledgeText(blob) {
  const b = String(blob || '')
  if (/totalmente\s+indetra|100\s*%\s*indetra|iva\s+non\s+detra|indetraibilit[aà]\s+nulla/i.test(b)) {
    return { pct: 0, source: 'text_non_detraibile' }
  }
  let m = b.match(/(?:detraibilit[aà]|detraibile)[^\d%n]{0,40}(\d{1,3})\s*%/i)
  if (m) {
    const p = parseInt(m[1], 10)
    if (p >= 0 && p <= 100) return { pct: p, source: 'text_after_detraibilita' }
  }
  m = b.match(/(\d{1,3})\s*%\s*(?:di\s*)?detraibilit/i)
  if (m) {
    const p = parseInt(m[1], 10)
    if (p >= 0 && p <= 100) return { pct: p, source: 'text_pct_before_detraibilita' }
  }
  m = b.match(/\b(50|40|30|25|20|10)\s*%\b[\s\S]{0,40}(?:detra|quota|indetra)/i)
  if (m) {
    const p = parseInt(m[1], 10)
    return { pct: p, source: 'text_pct_near_keyword' }
  }
  return null
}

/**
 * Default solo se esistono righe knowledge pertinenti al tema ma senza % esplicita nel testo.
 */
function heuristicPctFromTheme(theme, mergedBlob) {
  const b = String(mergedBlob || '')
  if (theme === 'mixed_use') {
    if (/uso\s+promiscuo|misto\s+uso|veicolo|automobil|auto\s+aziendale/i.test(b)) {
      if (/\b50\b|metà|cinquanta|50\s*%/i.test(b)) return { pct: 50, source: 'heuristic_vehicle_50' }
      if (/promiscuo|misto\s+uso/i.test(b)) return { pct: 50, source: 'heuristic_promiscuo_default_50' }
    }
  }
  if (theme === 'fuel' && /carburant|benzina|diesel/i.test(b)) {
    if (/\b40\b|quaranta|40\s*%/i.test(b)) return { pct: 40, source: 'heuristic_fuel_40' }
  }
  if (theme === 'restaurant' && /ristor|somministraz|rappresentanza|pasto/i.test(b)) {
    if (/non\s+detra|0\s*%|indetraibilit[aà]\s+zero/i.test(b)) return { pct: 0, source: 'heuristic_restaurant_0' }
  }
  return null
}

async function loadCausaliIva(db, societaId) {
  return db
    .from('causali_iva')
    .select('id, codice, descrizione, aliquota, tipo, detraibile, percentuale_detraibilita')
}

/**
 * @param {'restaurant'|'fuel'|'mixed_use'} theme
 * @param {object[]} allRows
 */
function resolveSuggestedDetraibilita(theme, allRows) {
  const patterns = {
    mixed_use:
      /veicolo|automobil|\bauto\b|uso\s+promiscuo|misto\s+uso|autotrazion|noleggio.{0,16}(auto|veic)|leasing.{0,12}veic/i,
    restaurant: /ristor|somministraz|rappresentanza|pasto|pranzo|cena|mensa|\bbar\b|somministrazione/i,
    fuel: /carburant|benzina|diesel|autotrazion|distributore|stazione\s+serv/i,
  }
  const re = patterns[theme]
  if (!re) return null
  const subset = filterKnowledgeByPattern(allRows, re)
  if (!subset.length) return null

  const meta = pctFromMetadata(subset)
  if (meta) return meta

  const merged = subset.map(rowBlob).join('\n')
  const fromText = pctFromKnowledgeText(merged)
  if (fromText) return fromText

  const heur = heuristicPctFromTheme(theme, merged)
  if (heur) return heur

  return null
}

function appliedDetraibilitaPct(caus) {
  if (!caus) return null
  if (caus.detraibile === false) return 0
  if (caus.percentuale_detraibilita == null || caus.percentuale_detraibilita === '') return 100
  const p = num(caus.percentuale_detraibilita)
  return Math.min(100, Math.max(0, p))
}

function categoryLabelIt(theme) {
  if (theme === 'mixed_use') return 'veicolo / uso promiscuo'
  if (theme === 'fuel') return 'carburante'
  return 'ristorazione / rappresentanza'
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} societaId
 * @returns {Promise<Array<{ tipo: string, titolo: string, descrizione: string, gravita: string, entity_ref: object, fingerprint: string }>>}
 */
export async function analyzeFiscalDeductibilityEngine(db, societaId) {
  if (!db || !societaId) return []

  const fk = await getFiscalKnowledge(
    db,
    [...FISCAL_CATEGORIES_ACCOUNTING, 'iva', 'documento'],
    {}
  )
  const allRows = fk.rows || []
  if (!allRows.length) return []

  const { data: causali, error: cErr } = await loadCausaliIva(db, societaId)

  if (cErr) console.warn('[fiscalDeductibilityEngine] causali_iva', cErr.message)
  const causById = new Map((causali || []).map((c) => [String(c.id), c]))

  const { data: pianoRows } = await db
    .from('piano_conti')
    .select('id, codice, descrizione')
    .eq('societa_id', societaId)
    .eq('attivo', true)
  const pianoById = new Map((pianoRows || []).map((p) => [String(p.id), p]))

  const { data: docs, error: dErr } = await db
    .from('documenti_contabilita')
    .select(
      'id, numero_documento, tipo_documento, imponibile, totale, causale_iva, soggetto_denominazione, dati_estratti, conto_id, data_documento'
    )
    .eq('societa_id', societaId)
    .order('data_documento', { ascending: false })
    .limit(320)

  if (dErr) {
    console.warn('[fiscalDeductibilityEngine] documenti', dErr.message)
    return []
  }

  const out = []
  const seen = new Set()

  for (const d of docs || []) {
    if (!isPassiva(d)) continue
    const imp = num(d.imponibile) || num(d.totale)
    if (imp < MIN_IMPONIBILE) continue

    const conto = d.conto_id ? pianoById.get(String(d.conto_id)) : null
    const ctx = buildDocContextText(d, conto)
    const theme = detectSpendCategory(ctx)
    if (!theme) continue

    const suggested = resolveSuggestedDetraibilita(theme, allRows)
    if (!suggested) continue

    const cid = d.causale_iva != null && String(d.causale_iva).trim() !== '' ? String(d.causale_iva) : null
    const caus = cid ? causById.get(cid) : null
    const applied = appliedDetraibilitaPct(caus)

    if (applied == null) {
      out.push({
        tipo: 'fiscal_suggestion',
        titolo: 'Suggerimento detraibilità (causale IVA da impostare)',
        descrizione: `Documento ${d.numero_documento || d.id} (${categoryLabelIt(theme)}): in base alla knowledge fiscale dello studio la detraibilità indicativa è **${suggested.pct}%** (${suggested.source}). Non risulta una causale IVA: impostare una causale coerente (es. «Cost for vehicle should be ${suggested.pct}% deductible» in adempimento operativo).`,
        gravita: 'info',
        entity_ref: {
          entity_type: 'documento',
          engine: 'fiscal_deductibility',
          document_id: d.id,
          spend_theme: theme,
          suggested_detraibilita_pct: suggested.pct,
          inference_source: suggested.source,
          applied_detraibilita_pct: null,
          causale_iva_id: null,
          mismatch: true,
        },
        fingerprint: `fiscal_suggest_ded:${theme}:no_causale:${d.id}`,
      })
      continue
    }

    if (Math.abs(applied - suggested.pct) <= TOLERANCE_PCT) continue

    const causLabel = `${caus.codice || ''} ${caus.descrizione || ''}`.trim()
    const enExample =
      theme === 'mixed_use'
        ? `Cost for vehicle should be ${suggested.pct}% deductible`
        : `This ${categoryLabelIt(theme)} cost should reflect ${suggested.pct}% VAT deductibility`

    out.push({
      tipo: 'fiscal_suggestion',
      titolo: 'Detraibilità IVA: suggerimento da knowledge fiscale',
      descrizione: `Documento ${d.numero_documento || d.id} (${categoryLabelIt(theme)}): la contabilità usa la causale «${causLabel}» con **${applied}%** di detraibilità; secondo le regole presenti in **fiscal_knowledge** la percentuale coerente sarebbe **${suggested.pct}%** (fonte: ${suggested.source}). Esempio operativo: «${enExample}». Verificare e aggiornare la causale IVA se necessario.`,
      gravita: Math.abs(applied - suggested.pct) >= 45 ? 'warning' : 'info',
      entity_ref: {
        entity_type: 'documento',
        engine: 'fiscal_deductibility',
        document_id: d.id,
        spend_theme: theme,
        suggested_detraibilita_pct: suggested.pct,
        applied_detraibilita_pct: applied,
        inference_source: suggested.source,
        causale_iva_id: caus.id,
        causale_codice: caus.codice,
        mismatch: true,
      },
      fingerprint: `fiscal_suggest_ded:${theme}:${d.id}`,
    })
  }

  const dedup = []
  for (const x of out) {
    if (seen.has(x.fingerprint)) continue
    seen.add(x.fingerprint)
    dedup.push(x)
    if (dedup.length >= MAX_INSIGHTS) break
  }
  return dedup
}
