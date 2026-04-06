/**
 * Proactive Insight Engine: analizza documenti contabili e persiste insight in ai_insights.
 */

import { getFiscalKnowledge, FISCAL_CATEGORIES_ACCOUNTING } from '../lib/fiscalKnowledge.js'
import { analyzeIvaAnomalyEngine } from './ivaAnomalyEngine.js'
import { analyzeCostAnalysisEngine } from './costAnalysisEngine.js'
import { analyzeFiscalDeductibilityEngine } from './fiscalDeductibilityEngine.js'

export const INSIGHT_TIPI = {
  IVA_ANOMALY: 'iva_anomaly',
  COST_TREND: 'cost_trend',
  FISCAL_SUGGESTION: 'fiscal_suggestion',
  COST_ANALYSIS: 'cost_analysis',
}

export const INSIGHT_GRAVITA = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
}

const EPS = 0.05
const MS_DAY = 86400000

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function isPassiva(d) {
  return String(d?.tipo_documento || '').toLowerCase().includes('passiva')
}

function parseDocDate(d) {
  if (!d?.data_documento) return NaN
  const t = new Date(d.data_documento).getTime()
  return Number.isNaN(t) ? NaN : t
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} societaId
 * @returns {Promise<Array<{ tipo: string, titolo: string, descrizione: string, gravita: string, entity_ref: object, fingerprint: string }>>}
 */
export async function analyzeIvaAnomalies(db, societaId) {
  const { data: docs, error } = await db
    .from('documenti_contabilita')
    .select(
      'id, numero_documento, tipo_documento, imponibile, iva, totale, validation_status, causale_iva, soggetto_denominazione, data_documento'
    )
    .eq('societa_id', societaId)
    .order('data_documento', { ascending: false })
    .limit(350)

  if (error) {
    console.warn('[proactiveInsight] IVA query', error.message)
    return []
  }

  const out = []
  for (const d of docs || []) {
    const imp = num(d.imponibile)
    const iva = num(d.iva)
    const tot = num(d.totale)
    const passiva = isPassiva(d)

    if (tot > EPS && Math.abs(tot - imp - iva) > EPS) {
      out.push({
        tipo: INSIGHT_TIPI.IVA_ANOMALY,
        titolo: 'Coerenza imponibile / IVA / totale',
        descrizione: `Documento ${d.numero_documento || d.id}: totale €${tot.toFixed(2)} non coincide con imponibile €${imp.toFixed(2)} + IVA €${iva.toFixed(2)} (scarto > €${EPS}). Verificare estrazione o righe fattura.`,
        gravita: Math.abs(tot - imp - iva) > 50 ? INSIGHT_GRAVITA.CRITICAL : INSIGHT_GRAVITA.WARNING,
        entity_ref: {
          entity_type: 'documento',
          document_id: d.id,
          numero_documento: d.numero_documento,
          tipo_documento: d.tipo_documento,
        },
        fingerprint: `iva_totale_mismatch:${d.id}`,
      })
    }

    if (passiva && imp > 1 && iva < EPS && tot > imp + EPS) {
      out.push({
        tipo: INSIGHT_TIPI.IVA_ANOMALY,
        titolo: 'IVA assente su fattura passiva',
        descrizione: `Fattura passiva ${d.numero_documento || d.id}: imponibile €${imp.toFixed(2)} ma IVA a zero mentre il totale (€${tot.toFixed(2)}) suggerisce IVA da verificare.`,
        gravita: INSIGHT_GRAVITA.WARNING,
        entity_ref: {
          entity_type: 'documento',
          document_id: d.id,
          numero_documento: d.numero_documento,
        },
        fingerprint: `iva_missing_vat_passiva:${d.id}`,
      })
    }

    const causale = d.causale_iva
    if (passiva && imp > EPS && String(d.validation_status) === 'confirmed' && (causale == null || causale === '')) {
      out.push({
        tipo: INSIGHT_TIPI.IVA_ANOMALY,
        titolo: 'Causale IVA mancante su documento confermato',
        descrizione: `Documento confermato ${d.numero_documento || d.id} senza causale IVA: necessario per registri e liquidazione.`,
        gravita: INSIGHT_GRAVITA.WARNING,
        entity_ref: {
          entity_type: 'documento',
          document_id: d.id,
          validation_status: d.validation_status,
        },
        fingerprint: `iva_missing_causale_confirmed:${d.id}`,
      })
    }
  }

  const ivaEngine = await analyzeIvaAnomalyEngine(db, societaId)
  return out.concat(ivaEngine)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} societaId
 */
export async function analyzeCostTrends(db, societaId) {
  const { data: docs, error } = await db
    .from('documenti_contabilita')
    .select(
      'id, totale, imponibile, data_documento, conto_id, soggetto_piva, soggetto_denominazione, numero_documento, tipo_documento'
    )
    .eq('societa_id', societaId)
    .order('data_documento', { ascending: false })
    .limit(450)

  if (error) {
    console.warn('[proactiveInsight] cost trend query', error.message)
    return []
  }

  const list = docs || []
  const out = []
  const now = Date.now()

  const byPiva = new Map()
  for (const d of list) {
    const piva = String(d.soggetto_piva || '').replace(/\s/g, '')
    if (piva.length < 9) continue
    if (!byPiva.has(piva)) byPiva.set(piva, [])
    byPiva.get(piva).push(d)
  }

  for (const [piva, arr] of byPiva) {
    if (arr.length < 6) continue
    const amounts = arr.map((x) => num(x.totale)).filter((x) => x > 0)
    if (amounts.length < 6) continue
    const recent = amounts[0]
    const historical = amounts.slice(1, 22)
    const mean = historical.reduce((a, b) => a + b, 0) / historical.length
    if (mean < 80) continue
    if (recent > mean * 2.15) {
      const latest = arr[0]
      out.push({
        tipo: INSIGHT_TIPI.COST_TREND,
        titolo: 'Picco di spesa rispetto allo storico fornitore',
        descrizione: `Ultimo documento (${latest.numero_documento || 'n/d'}, ${latest.soggetto_denominazione || piva}) con totale €${recent.toFixed(2)}, nettamente sopra la media recente (~€${mean.toFixed(2)}) per la stessa P.IVA.`,
        gravita: recent > mean * 3 ? INSIGHT_GRAVITA.CRITICAL : INSIGHT_GRAVITA.WARNING,
        entity_ref: {
          entity_type: 'documento',
          document_id: latest.id,
          soggetto_piva: piva,
          soggetto_denominazione: latest.soggetto_denominazione,
        },
        fingerprint: `cost_spike_supplier:${piva}:${latest.id}`,
      })
    }
  }

  const byConto = new Map()
  for (const d of list) {
    if (!d.conto_id) continue
    const t = parseDocDate(d)
    if (Number.isNaN(t)) continue
    if (!byConto.has(d.conto_id)) byConto.set(d.conto_id, [])
    byConto.get(d.conto_id).push({ ...d, _t: t, _tot: num(d.totale) })
  }

  for (const [contoId, arr] of byConto) {
    if (arr.length < 8) continue
    const recent = arr.filter((x) => now - x._t <= 16 * MS_DAY && x._tot > 0)
    const prior = arr.filter((x) => now - x._t > 16 * MS_DAY && now - x._t <= 90 * MS_DAY && x._tot > 0)
    if (recent.length < 2 || prior.length < 4) continue
    const avgR = recent.reduce((s, x) => s + x._tot, 0) / recent.length
    const avgP = prior.reduce((s, x) => s + x._tot, 0) / prior.length
    if (avgP < 60) continue
    if (avgR > avgP * 1.7) {
      const sample = recent[0]
      out.push({
        tipo: INSIGHT_TIPI.COST_TREND,
        titolo: 'Incremento medio sullo stesso conto costo/ricavo',
        descrizione: `Sul conto selezionato l'importo medio documenti ultimi ~16gg (€${avgR.toFixed(2)}) supera la media del periodo precedente (€${avgP.toFixed(2)}). Ultimo riferimento: doc. ${sample.numero_documento || sample.id}.`,
        gravita: avgR > avgP * 2.3 ? INSIGHT_GRAVITA.WARNING : INSIGHT_GRAVITA.INFO,
        entity_ref: {
          entity_type: 'conto',
          conto_id: contoId,
          document_id: sample.id,
        },
        fingerprint: `cost_trend_conto:${contoId}`,
      })
    }
  }

  return out
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} societaId
 */
export async function analyzeFiscalSuggestions(db, societaId) {
  const { data: docs, error } = await db
    .from('documenti_contabilita')
    .select('id, numero_documento, validation_status, workflow_status, created_at, tipo_documento, data_documento')
    .eq('societa_id', societaId)
    .limit(500)

  if (error) {
    console.warn('[proactiveInsight] fiscal query', error.message)
    return []
  }

  const out = []
  const list = docs || []
  const now = Date.now()
  const pendingLong = list.filter((d) => {
    if (String(d.validation_status) !== 'pending') return false
    const c = d.created_at ? new Date(d.created_at).getTime() : NaN
    return !Number.isNaN(c) && now - c > 30 * MS_DAY
  })

  if (pendingLong.length >= 3) {
    out.push({
      tipo: INSIGHT_TIPI.FISCAL_SUGGESTION,
      titolo: 'Arretrato di validazione documenti',
      descrizione: `${pendingLong.length} documenti sono ancora in attesa di validazione da oltre 30 giorni: impatto su chiusure e registrazioni IVA.`,
      gravita: pendingLong.length >= 12 ? INSIGHT_GRAVITA.WARNING : INSIGHT_GRAVITA.INFO,
      entity_ref: {
        entity_type: 'societa',
        societa_id: societaId,
        pending_over_30d_count: pendingLong.length,
        sample_document_ids: pendingLong.slice(0, 8).map((x) => x.id),
      },
      fingerprint: `fiscal_backlog_pending:${societaId}`,
    })
  }

  const errors = list.filter((d) => String(d.validation_status) === 'error')
  if (errors.length >= 1) {
    out.push({
      tipo: INSIGHT_TIPI.FISCAL_SUGGESTION,
      titolo: 'Documenti in stato errore',
      descrizione: `${errors.length} documento/i in stato errore: correggere prima di confermare o registrare in prima nota.`,
      gravita: errors.length >= 5 ? INSIGHT_GRAVITA.WARNING : INSIGHT_GRAVITA.INFO,
      entity_ref: {
        entity_type: 'societa',
        societa_id: societaId,
        error_document_count: errors.length,
        sample_document_ids: errors.slice(0, 10).map((x) => x.id),
      },
      fingerprint: `fiscal_validation_errors:${societaId}`,
    })
  }

  const passivaUnreg = list.filter(
    (d) => isPassiva(d) && String(d.validation_status) === 'confirmed' && String(d.workflow_status || '') !== 'registered'
  )
  if (passivaUnreg.length >= 4) {
    out.push({
      tipo: INSIGHT_TIPI.FISCAL_SUGGESTION,
      titolo: 'Fatture passive confermate non registrate',
      descrizione: `${passivaUnreg.length} fatture passive confermate non risultano ancora registrate (workflow): verificare prima nota e registri IVA acquisti.`,
      gravita: INSIGHT_GRAVITA.INFO,
      entity_ref: {
        entity_type: 'societa',
        societa_id: societaId,
        unregistered_confirmed_passive_count: passivaUnreg.length,
      },
      fingerprint: `fiscal_passive_unregistered:${societaId}`,
    })
  }

  const fk = await getFiscalKnowledge(db, FISCAL_CATEGORIES_ACCOUNTING)
  if (fk.ok && fk.rows?.length && (pendingLong.length >= 2 || errors.length >= 1)) {
    const titles = fk.rows
      .slice(0, 3)
      .map((r) => String(r.chiave || r.descrizione || '').trim())
      .filter(Boolean)
    const titoloKb = titles.length ? titles.join('; ') : 'Regole fiscali attive'
    out.push({
      tipo: INSIGHT_TIPI.FISCAL_SUGGESTION,
      titolo: 'Allineamento con knowledge fiscale dello studio',
      descrizione: `Con documenti in sospeso o in errore, ripassare le regole attive (${fk.rows.length} in categorie contabile/IVA). Esempi: ${titoloKb.slice(0, 220)}${titoloKb.length > 220 ? '…' : ''}`,
      gravita: INSIGHT_GRAVITA.INFO,
      entity_ref: {
        entity_type: 'societa',
        societa_id: societaId,
        fiscal_knowledge_rows: fk.rows.length,
      },
      fingerprint: `fiscal_kb_crosscheck:${societaId}`,
    })
  }

  return out
}

/**
 * Sostituisce gli insight del tipo indicato per la società (snapshot del run).
 */
async function replaceInsightsForTipo(db, societaId, tipo, rows) {
  const { error: delErr } = await db.from('ai_insights').delete().eq('societa_id', societaId).eq('tipo', tipo)
  if (delErr) {
    console.warn('[proactiveInsight] delete', tipo, delErr.message)
    return { ok: false, error: delErr.message, inserted: 0 }
  }
  if (!rows.length) return { ok: true, inserted: 0 }

  const payload = rows.map((r) => ({
    societa_id: societaId,
    tipo: r.tipo,
    titolo: String(r.titolo || '').slice(0, 500),
    descrizione: String(r.descrizione || '').slice(0, 8000),
    gravita: r.gravita,
    entity_ref: r.entity_ref && typeof r.entity_ref === 'object' ? r.entity_ref : {},
    fingerprint: String(r.fingerprint || '').slice(0, 300),
  }))

  const { error: insErr } = await db.from('ai_insights').insert(payload)
  if (insErr) {
    console.warn('[proactiveInsight] insert', tipo, insErr.message)
    return { ok: false, error: insErr.message, inserted: 0 }
  }
  return { ok: true, inserted: payload.length }
}

/**
 * Esegue tutti gli analyzer e aggiorna ai_insights (per tipo: delete + insert).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ societaId: string, log?: function }} opts
 */
export async function runProactiveInsightEngine(db, { societaId, log } = {}) {
  if (!db || !societaId) {
    return { ok: false, error: 'db e societaId richiesti', byTipo: {} }
  }

  const iva = await analyzeIvaAnomalies(db, societaId)
  const cost = await analyzeCostTrends(db, societaId)
  const fiscalBase = await analyzeFiscalSuggestions(db, societaId)
  const fiscalDed = await analyzeFiscalDeductibilityEngine(db, societaId)
  const fiscal = [...fiscalBase, ...fiscalDed]
  const costAnalysis = await analyzeCostAnalysisEngine(db, societaId)

  const r1 = await replaceInsightsForTipo(db, societaId, INSIGHT_TIPI.IVA_ANOMALY, iva)
  const r2 = await replaceInsightsForTipo(db, societaId, INSIGHT_TIPI.COST_TREND, cost)
  const r3 = await replaceInsightsForTipo(db, societaId, INSIGHT_TIPI.FISCAL_SUGGESTION, fiscal)
  const r4 = await replaceInsightsForTipo(db, societaId, INSIGHT_TIPI.COST_ANALYSIS, costAnalysis)

  const byTipo = {
    [INSIGHT_TIPI.IVA_ANOMALY]: { count: iva.length, persist: r1 },
    [INSIGHT_TIPI.COST_TREND]: { count: cost.length, persist: r2 },
    [INSIGHT_TIPI.FISCAL_SUGGESTION]: { count: fiscal.length, persist: r3 },
    [INSIGHT_TIPI.COST_ANALYSIS]: { count: costAnalysis.length, persist: r4 },
  }

  log?.('PROACTIVE_INSIGHT_DONE', { societaId, byTipo })

  const ok = r1.ok && r2.ok && r3.ok && r4.ok
  return {
    ok,
    societaId,
    generated: {
      iva_anomaly: iva.length,
      cost_trend: cost.length,
      fiscal_suggestion: fiscal.length,
      cost_analysis: costAnalysis.length,
    },
    inserted: (r1.inserted || 0) + (r2.inserted || 0) + (r3.inserted || 0) + (r4.inserted || 0),
    byTipo,
    insights_preview: {
      iva_anomaly: iva.slice(0, 5),
      cost_trend: cost.slice(0, 5),
      fiscal_suggestion: fiscal.slice(0, 5),
      cost_analysis: costAnalysis.slice(0, 5),
    },
  }
}
