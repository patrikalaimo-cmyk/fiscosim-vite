/**
 * IVA Anomaly Engine: casi di IVA indetraibile / uso promiscuo (ristoranti, carburante, uso misto)
 * confronto tra causale IVA applicata e fiscal_knowledge dello studio.
 */

import { getFiscalKnowledge, FISCAL_CATEGORIES_ACCOUNTING } from '../lib/fiscalKnowledge.js'

/** Allineato a ai_insights.gravita: critical = high, warning = medium */
export const IVA_SEVERITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
}

const RESTAURANT_RE =
  /ristorant|trattoria|osteria|pizzeria|\bbar\b|pub\b|somministraz|catering|food\s*&\s*beverage|mensa|osteria|enoteca|bistrot/i
const FUEL_RE =
  /carburant|benzina|diesel|gpl\b|metano\b|stazione\s+serv|distributore|self\s*service|retail\s+fuel|\beni\b|\bq8\b|\bip\b|\besso\b|\btamoil\b/i
const MIXED_USE_RE =
  /\bauto\b|automobile|veicolo|noleggio.{0,18}(lungo|breve)|leasing.{0,12}veic|uso\s+promiscuo|misto\s+uso|auto\s+aziendale/i

const KNOW_RESTAURANT_ND =
  /(ristor|somministraz|pasto|pranzo|cena|mensa).{0,120}(indetra|non.{0,20}detra|detraibilit.{0,25}(ridot|limit|parz))|(?:indetra|non.{0,20}detra).{0,120}(ristor|somministraz|pasto|rappresentanza)/i
const KNOW_FUEL_ND =
  /(carburant|benzina|diesel|autotrazion).{0,120}(indetra|non.{0,20}detra|quota|40|quaranta|percent)/i
const KNOW_MIXED_ND =
  /(uso.{0,25}promiscuo|misto.{0,15}uso|veic|auto).{0,120}(indetra|non.{0,20}detra|detraibilit.{0,25}(ridot|limit|parz))/i

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function isPassiva(d) {
  return String(d?.tipo_documento || '').toLowerCase().includes('passiva')
}

export function buildDocContextText(doc, contoRow) {
  const parts = [
    String(doc.soggetto_denominazione || ''),
    String(contoRow?.descrizione || ''),
    String(contoRow?.codice || ''),
  ]
  let dati = doc.dati_estratti
  if (typeof dati === 'string') {
    try {
      dati = JSON.parse(dati)
    } catch {
      dati = {}
    }
  }
  if (dati && typeof dati === 'object') {
    parts.push(JSON.stringify(dati).slice(0, 2500))
  }
  return parts.join(' \n ')
}

/**
 * @param {string} blob
 * @returns {{ restaurant: boolean, fuel: boolean, mixed: boolean }}
 */
function knowledgeNonDeductibleSignals(blob) {
  const b = String(blob || '')
  return {
    restaurant: KNOW_RESTAURANT_ND.test(b),
    fuel: KNOW_FUEL_ND.test(b),
    mixed: KNOW_MIXED_ND.test(b),
  }
}

export function detectSpendCategory(contextText) {
  const t = String(contextText || '')
  if (RESTAURANT_RE.test(t)) return 'restaurant'
  if (FUEL_RE.test(t)) return 'fuel'
  if (MIXED_USE_RE.test(t)) return 'mixed_use'
  return null
}

const RULE_COPY = {
  restaurant:
    'Le spese di somministrazione e ristorazione sono spesso soggette a limiti di detraibilità (es. rappresentanza, art. 67 TUIR).',
  fuel: 'Le spese carburante per autotrazione possono avere quote di indetraibilità o vincoli dedicati.',
  mixed_use:
    'Costi legati a veicoli con uso promiscuo possono richiedere ripartizione e limitazione dell’IVA indetraibile.',
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} societaId
 * @returns {Promise<Array<{ tipo: string, titolo: string, descrizione: string, gravita: string, entity_ref: object, fingerprint: string }>>}
 */
export async function analyzeIvaAnomalyEngine(db, societaId) {
  if (!db || !societaId) return []

  const fk = await getFiscalKnowledge(db, [...FISCAL_CATEGORIES_ACCOUNTING, 'iva'], {})
  const knowledgeBlob = (fk.rows || [])
    .map((r) => [r.valore, r.descrizione, r.chiave, r.contesto].filter(Boolean).join(' '))
    .join('\n')
  const kSignals = knowledgeNonDeductibleSignals(knowledgeBlob)

  const { data: causali, error: cErr } = await db
    .from('causali_iva')
    .select('id, codice, descrizione, aliquota, tipo, detraibile, percentuale_detraibilita')
    .eq('societa_id', societaId)
    .eq('attivo', true)

  if (cErr) {
    console.warn('[ivaAnomalyEngine] causali_iva', cErr.message)
  }

  const causaleById = new Map()
  for (const c of causali || []) {
    causaleById.set(String(c.id), c)
  }

  const { data: pianoRows } = await db
    .from('piano_conti')
    .select('id, codice, descrizione')
    .eq('societa_id', societaId)
    .eq('attivo', true)

  const pianoById = new Map((pianoRows || []).map((p) => [String(p.id), p]))

  const { data: docs, error: dErr } = await db
    .from('documenti_contabilita')
    .select(
      'id, numero_documento, tipo_documento, imponibile, iva, totale, causale_iva, soggetto_denominazione, dati_estratti, conto_id, data_documento'
    )
    .eq('societa_id', societaId)
    .order('data_documento', { ascending: false })
    .limit(400)

  if (dErr) {
    console.warn('[ivaAnomalyEngine] documenti', dErr.message)
    return []
  }

  const out = []
  const minImp = 25
  const minIva = 1

  for (const d of docs || []) {
    if (!isPassiva(d)) continue
    const imp = num(d.imponibile)
    const iva = num(d.iva)
    if (imp < minImp || iva < minIva) continue

    const conto = d.conto_id ? pianoById.get(String(d.conto_id)) : null
    const ctx = buildDocContextText(d, conto)
    const category = detectSpendCategory(ctx)
    if (!category) continue

    const kHit =
      category === 'restaurant' ? kSignals.restaurant : category === 'fuel' ? kSignals.fuel : kSignals.mixed

    const cid = d.causale_iva != null && String(d.causale_iva).trim() !== '' ? String(d.causale_iva) : null
    const caus = cid ? causaleById.get(cid) : null

    if (!caus) {
      out.push({
        tipo: 'iva_anomaly',
        titolo: `IVA: causale mancante (${categoryLabel(category)})`,
        descrizione: `Documento ${d.numero_documento || d.id}: spesa classificabile come ${categoryLabel(
          category
        )} con IVA €${iva.toFixed(2)} ma senza causale IVA. ${RULE_COPY[category]} Confrontare con la knowledge fiscale dello studio.`,
        gravita: kHit ? 'critical' : 'warning',
        entity_ref: {
          entity_type: 'documento',
          document_id: d.id,
          numero_documento: d.numero_documento,
          iva_engine: 'non_deductible_context',
          spend_category: category,
          severity: kHit ? IVA_SEVERITY.HIGH : IVA_SEVERITY.MEDIUM,
          mismatch: 'missing_causale',
          fiscal_knowledge_hit: kHit,
          knowledge_categories_scanned: FISCAL_CATEGORIES_ACCOUNTING.concat('iva'),
        },
        fingerprint: `iva_nd_engine:missing_causale:${category}:${d.id}`,
      })
      continue
    }

    const detraibile = caus.detraibile !== false
    const pctDet = num(caus.percentuale_detraibilita)
    const fullCreditClaimed = detraibile && (pctDet >= 99 || caus.percentuale_detraibilita == null)

    if (!fullCreditClaimed) {
      continue
    }

    const implicitRate = imp > 0 ? (iva / imp) * 100 : 0
    const aliq = num(caus.aliquota)

    const knowledgeMismatch = kHit
    const suspiciousWithoutKb = !kHit && implicitRate >= 15

    if (!knowledgeMismatch && !suspiciousWithoutKb) continue

    const looksLikeOrdinaryFullVat = aliq >= 20 && implicitRate >= 17
    const wrongVatOrDeductibility = knowledgeMismatch && looksLikeOrdinaryFullVat

    const high =
      wrongVatOrDeductibility &&
      (category === 'restaurant' || category === 'fuel' || (category === 'mixed_use' && implicitRate >= 20))

    const gravita = high ? 'critical' : 'warning'
    const severity = high ? IVA_SEVERITY.HIGH : IVA_SEVERITY.MEDIUM

    const titolo = high
      ? 'IVA / detraibilità: possibile trattamento non coerente'
      : 'IVA: caso sospetto (detraibilità da verificare)'

    const kbLine = knowledgeMismatch
      ? 'La knowledge fiscale dello studio contiene indicazioni su indetraibilità / limiti coerenti con questa tipologia di costo.'
      : 'Non risultano regole esplicite in knowledge: si applica comunque il profilo di rischio standard per questa categoria.'

    out.push({
      tipo: 'iva_anomaly',
      titolo,
      descrizione: `Documento ${d.numero_documento || d.id} (${categoryLabel(category)}): causale ${
        caus.codice || ''
      } (${caus.descrizione || ''}) con detraibilità piena (${pctDet || 100}%) e aliquota ${aliq}%. Imponibile €${imp.toFixed(
        2
      )}, IVA €${iva.toFixed(2)} (≈${implicitRate.toFixed(1)}% su imponibile). ${kbLine} ${RULE_COPY[category]}`,
      gravita,
      entity_ref: {
        entity_type: 'documento',
        document_id: d.id,
        numero_documento: d.numero_documento,
        causale_iva_id: caus.id,
        causale_codice: caus.codice,
        aliquota_causale: aliq,
        implicit_rate_pct: Math.round(implicitRate * 10) / 10,
        iva_engine: 'non_deductible_vs_knowledge',
        spend_category: category,
        severity,
        fiscal_knowledge_hit: knowledgeMismatch,
        mismatch_kind: high ? 'wrong_vat_applied' : 'suspicious_case',
      },
      fingerprint: `iva_nd_engine:${category}:${d.id}`,
    })
  }

  return out
}

function categoryLabel(c) {
  if (c === 'restaurant') return 'ristorazione / somministrazione'
  if (c === 'fuel') return 'carburante'
  return 'uso promiscuo / veicoli'
}
