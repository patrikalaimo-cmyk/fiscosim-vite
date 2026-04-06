/**
 * Cost Analysis Engine: aggrega costi (fatture passive) per mese, categoria (conto) e fornitore;
 * confronta ultimo mese vs precedente e genera insight se |variazione| > 20%.
 */

/** Soglia |variazione %| mese su mese (pctChange restituisce già percentuale, es. 25 = +25%) */
const VARIATION_THRESHOLD_PCT = 20
const MIN_PREV_MONTH_TOTAL = 400
const MIN_PREV_CATEGORY = 200
const MAX_CATEGORY_INSIGHTS = 4
const TOP_SUPPLIERS = 5

const MONTH_NAMES_IT = [
  '',
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
]

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function isPassiva(d) {
  return String(d?.tipo_documento || '').toLowerCase().includes('passiva')
}

/** Costo documento: imponibile se presente, altrimenti totale */
function docCost(d) {
  const imp = num(d.imponibile)
  if (imp > 0) return imp
  return num(d.totale)
}

/** @returns {string|null} YYYY-MM */
function docMonthKey(d) {
  if (!d?.data_documento) return null
  const t = new Date(d.data_documento)
  if (Number.isNaN(t.getTime())) return null
  const y = t.getFullYear()
  const m = String(t.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function formatMonthIt(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || ''
  const [ys, ms] = ym.split('-')
  const m = parseInt(ms, 10)
  const y = parseInt(ys, 10)
  return `${MONTH_NAMES_IT[m] || ms} ${y}`
}

function pctChange(cur, prev) {
  if (prev <= 0) return null
  return ((cur - prev) / prev) * 100
}

function fingerprintSlug(s, max = 48) {
  return String(s || 'cat')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} societaId
 * @returns {Promise<Array<{ tipo: string, titolo: string, descrizione: string, gravita: string, entity_ref: object, fingerprint: string }>>}
 */
export async function analyzeCostAnalysisEngine(db, societaId) {
  if (!db || !societaId) return []

  const since = new Date()
  since.setMonth(since.getMonth() - 18)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data: docs, error } = await db
    .from('documenti_contabilita')
    .select(
      'id, numero_documento, tipo_documento, imponibile, totale, data_documento, conto_id, soggetto_piva, soggetto_denominazione'
    )
    .eq('societa_id', societaId)
    .gte('data_documento', sinceStr)
    .order('data_documento', { ascending: true })

  if (error) {
    console.warn('[costAnalysisEngine] documenti', error.message)
    return []
  }

  const passiva = (docs || []).filter(isPassiva)
  if (!passiva.length) return []

  const { data: pianoRows } = await db
    .from('piano_conti')
    .select('id, codice, descrizione')
    .eq('societa_id', societaId)
    .eq('attivo', true)

  const pianoById = new Map((pianoRows || []).map((p) => [String(p.id), p]))

  function categoryKey(d) {
    const p = d.conto_id ? pianoById.get(String(d.conto_id)) : null
    if (!p) return 'Senza conto'
    const cod = String(p.codice || '').trim()
    const des = String(p.descrizione || '').trim()
    return `${cod} — ${des}`.trim() || 'Senza conto'
  }

  function supplierKey(d) {
    const piva = String(d.soggetto_piva || '').replace(/\s/g, '')
    if (piva.length >= 9) return `piva:${piva}`
    const n = String(d.soggetto_denominazione || '').trim().slice(0, 80)
    return n ? `nome:${n.toLowerCase()}` : 'sconosciuto'
  }

  function supplierLabel(d) {
    const n = String(d.soggetto_denominazione || '').trim()
    const piva = String(d.soggetto_piva || '').replace(/\s/g, '')
    if (n && piva) return `${n} (P.IVA ${piva})`
    if (n) return n
    if (piva) return `P.IVA ${piva}`
    return 'Fornitore n/d'
  }

  /** @type {Map<string, Map<string, number>>} month -> (bucket -> sum) */
  const monthCategory = new Map()
  const monthSupplier = new Map()
  const monthTotal = new Map()
  const supplierLabels = new Map()

  for (const d of passiva) {
    const mk = docMonthKey(d)
    if (!mk) continue
    const cost = docCost(d)
    if (cost <= 0) continue

    monthTotal.set(mk, (monthTotal.get(mk) || 0) + cost)

    const ck = categoryKey(d)
    if (!monthCategory.has(mk)) monthCategory.set(mk, new Map())
    const cm = monthCategory.get(mk)
    cm.set(ck, (cm.get(ck) || 0) + cost)

    const sk = supplierKey(d)
    if (!monthSupplier.has(mk)) monthSupplier.set(mk, new Map())
    const sm = monthSupplier.get(mk)
    sm.set(sk, (sm.get(sk) || 0) + cost)
    if (!supplierLabels.has(sk)) supplierLabels.set(sk, supplierLabel(d))
  }

  const months = [...monthTotal.keys()].sort()
  if (months.length < 2) return []

  const prevM = months[months.length - 2]
  const curM = months[months.length - 1]

  const totalPrev = monthTotal.get(prevM) || 0
  const totalCur = monthTotal.get(curM) || 0
  const pctTotal = pctChange(totalCur, totalPrev)

  const out = []

  function topSuppliersForDelta(supCur, supPrev, direction) {
    const keys = new Set([...supCur.keys(), ...supPrev.keys()])
    const rows = []
    for (const k of keys) {
      const c = supCur.get(k) || 0
      const p = supPrev.get(k) || 0
      const delta = c - p
      rows.push({
        key: k,
        label: supplierLabels.get(k) || k,
        cur: Math.round(c * 100) / 100,
        prev: Math.round(p * 100) / 100,
        delta_eur: Math.round(delta * 100) / 100,
      })
    }
    if (direction === 'up') {
      rows.sort((a, b) => b.delta_eur - a.delta_eur)
      return rows.filter((r) => r.delta_eur > 0).slice(0, TOP_SUPPLIERS)
    }
    rows.sort((a, b) => a.delta_eur - b.delta_eur)
    return rows.filter((r) => r.delta_eur < 0).slice(0, TOP_SUPPLIERS)
  }

  const supCur = monthSupplier.get(curM) || new Map()
  const supPrev = monthSupplier.get(prevM) || new Map()
  const catCur = monthCategory.get(curM) || new Map()
  const catPrev = monthCategory.get(prevM) || new Map()

  if (
    totalPrev >= MIN_PREV_MONTH_TOTAL &&
    pctTotal != null &&
    Math.abs(pctTotal) > VARIATION_THRESHOLD_PCT
  ) {
    const up = pctTotal > 0
    const topSup = topSuppliersForDelta(supCur, supPrev, up ? 'up' : 'down')
    const topLine = topSup.length
      ? topSup.map((t) => `${t.label}: Δ €${t.delta_eur >= 0 ? '+' : ''}${t.delta_eur.toFixed(2)} (da €${t.prev.toFixed(2)} a €${t.cur.toFixed(2)})`).join('; ')
      : 'Nessun singolo fornitore domina la variazione.'

    const descrizione = [
      `Confronto costi documenti passivi (${formatMonthIt(curM)} vs ${formatMonthIt(prevM)}), base imponibile o totale.`,
      `Totale ${formatMonthIt(prevM)}: €${totalPrev.toFixed(2)} → ${formatMonthIt(curM)}: €${totalCur.toFixed(2)} (**variazione ${pctTotal >= 0 ? '+' : ''}${pctTotal.toFixed(1)}%**).`,
      up ? `Principali fornitori che contribuiscono all'incremento: ${topLine}` : `Fornitori con maggior calo: ${topLine}`,
    ].join(' ')

    out.push({
      tipo: 'cost_analysis',
      titolo:
        pctTotal > 0
          ? `Costi in aumento: ${formatMonthIt(curM)} (+${pctTotal.toFixed(1)}%)`
          : `Costi in calo: ${formatMonthIt(curM)} (${pctTotal.toFixed(1)}%)`,
      descrizione,
      gravita: Math.abs(pctTotal) >= 35 ? 'warning' : 'info',
      entity_ref: {
        entity_type: 'societa',
        engine: 'cost_analysis',
        aggregation: 'month_total',
        current_month: curM,
        previous_month: prevM,
        current_total: Math.round(totalCur * 100) / 100,
        previous_total: Math.round(totalPrev * 100) / 100,
        percentage_change: Math.round(pctTotal * 100) / 100,
        top_suppliers: topSup,
        direction: up ? 'increase' : 'decrease',
      },
      fingerprint: `cost_analysis:month_total:${societaId}:${curM}`,
    })
  }

  const catKeys = new Set([...catCur.keys(), ...catPrev.keys()])
  const catDeltas = []
  for (const ck of catKeys) {
    const c = catCur.get(ck) || 0
    const p = catPrev.get(ck) || 0
    if (p < MIN_PREV_CATEGORY) continue
    const pct = pctChange(c, p)
    if (pct == null || Math.abs(pct) <= VARIATION_THRESHOLD_PCT) continue
    catDeltas.push({
      category: ck,
      cur: c,
      prev: p,
      pct,
      absDelta: Math.abs(c - p),
    })
  }
  catDeltas.sort((a, b) => b.absDelta - a.absDelta)

  let nCat = 0
  for (const row of catDeltas) {
    if (nCat >= MAX_CATEGORY_INSIGHTS) break
    const up = row.pct > 0
    const slug = fingerprintSlug(row.category) || `idx_${nCat}`

    const supForCatCur = new Map()
    const supForCatPrev = new Map()
    for (const d of passiva) {
      if (docMonthKey(d) !== curM && docMonthKey(d) !== prevM) continue
      if (categoryKey(d) !== row.category) continue
      const cost = docCost(d)
      if (cost <= 0) continue
      const sk = supplierKey(d)
      if (!supplierLabels.has(sk)) supplierLabels.set(sk, supplierLabel(d))
      const mk = docMonthKey(d)
      const m = mk === curM ? supForCatCur : supForCatPrev
      m.set(sk, (m.get(sk) || 0) + cost)
    }
    const topCatSup = topSuppliersForDelta(supForCatCur, supForCatPrev, up ? 'up' : 'down')
    const topCatLine = topCatSup.length
      ? topCatSup.map((t) => `${t.label} (Δ €${t.delta_eur >= 0 ? '+' : ''}${t.delta_eur.toFixed(2)})`).join('; ')
      : '—'

    out.push({
      tipo: 'cost_analysis',
      titolo: `${up ? 'Aumento' : 'Calo'} costi per categoria: ${row.category.slice(0, 60)}${row.category.length > 60 ? '…' : ''}`,
      descrizione: `Categoria **${row.category}**: ${formatMonthIt(prevM)} €${row.prev.toFixed(2)} → ${formatMonthIt(curM)} €${row.cur.toFixed(2)} (**${row.pct >= 0 ? '+' : ''}${row.pct.toFixed(1)}%**). Fornitori che pesano di più sulla variazione: ${topCatLine}`,
      gravita: Math.abs(row.pct) >= 40 ? 'warning' : 'info',
      entity_ref: {
        entity_type: 'societa',
        engine: 'cost_analysis',
        aggregation: 'category',
        category: row.category,
        current_month: curM,
        previous_month: prevM,
        current_total: Math.round(row.cur * 100) / 100,
        previous_total: Math.round(row.prev * 100) / 100,
        percentage_change: Math.round(row.pct * 100) / 100,
        top_suppliers: topCatSup,
        direction: up ? 'increase' : 'decrease',
      },
      fingerprint: `cost_analysis:category:${societaId}:${curM}:${slug}`,
    })
    nCat += 1
  }

  return out
}
