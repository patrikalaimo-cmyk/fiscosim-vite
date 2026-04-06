/**
 * Output fiscali: LIPE e F24 da liquidazione_iva; scadenzario da partitari/debiti-crediti;
 * CU / 770 solo base futura.
 */

import { logStep } from './aiSupervisorService.js'

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function toNum(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number' && Number.isFinite(v)) return round2(v)
  const s = String(v).replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? round2(n) : 0
}

/** Scadenza versamento IVA mensile: 16 del mese successivo al periodo (semplificazione). */
function scadenzaIvaVersamento(periodoFine) {
  const d = new Date(periodoFine + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return null
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 16)
  return next.toISOString().slice(0, 10)
}

/**
 * Ultimo movimento partitario per soggetto (saldo “aperto” a fine lista).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 */
async function loadUltimiSaldiPartitari(db) {
  if (!db?.from) return []
  const { data: rows, error } = await db
    .from('partitari')
    .select('id, soggetto_id, data, saldo_progressivo, dare, avere, descrizione, documento_id')
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error || !Array.isArray(rows)) return []

  const bySoggetto = new Map()
  for (const r of rows) {
    const sid = String(r.soggetto_id || '')
    if (!sid || bySoggetto.has(sid)) continue
    bySoggetto.set(sid, r)
  }
  return [...bySoggetto.values()]
}

/**
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   liquidazioneIvaId: string,
 *   log?: (event: string, payload?: Record<string, unknown>) => void,
 *   persistAiLog?: boolean,
 * }} opts
 * @returns {Promise<{ ok: boolean, outputs?: unknown[], error?: string }>}
 */
export async function generateFiscalOutputsFromLiquidazione(opts) {
  const { db, liquidazioneIvaId, log, persistAiLog = true } = opts || {}
  const L = log || ((e, p) => console.log(`[fiscalOutput] ${e}`, p || ''))

  if (!db?.from || !liquidazioneIvaId) {
    L('FISCAL_OUTPUT_ERROR', { reason: 'db_o_liquidazione_mancante' })
    return { ok: false, error: 'db o liquidazioneIvaId mancante' }
  }

  const { data: liq, error: errLiq } = await db
    .from('liquidazione_iva')
    .select('*')
    .eq('id', liquidazioneIvaId)
    .maybeSingle()

  if (errLiq || !liq) {
    L('FISCAL_OUTPUT_ERROR', { reason: 'liquidazione_non_trovata', liquidazioneIvaId })
    return { ok: false, error: 'liquidazione_iva non trovata' }
  }

  const ivaDebito = toNum(liq.iva_debito)
  const ivaCredito = toNum(liq.iva_credito)
  const saldo = toNum(liq.saldo)
  const daVersare = Math.max(0, saldo)
  const creditoPeriodo = Math.max(0, -saldo)

  /** LIPE (riepilogo da liquidazione — struttura compatibile con export successivi) */
  const payloadLipe = {
    tipo_modello: 'LIPE',
    versione_schema: '1',
    fonte: 'liquidazione_iva',
    liquidazione_iva_id: liq.id,
    periodo: {
      periodicita: liq.periodicita,
      anno: liq.anno,
      mese: liq.mese,
      trimestre: liq.trimestre,
      inizio: liq.periodo_inizio,
      fine: liq.periodo_fine,
    },
    riepilogo: {
      iva_debito: ivaDebito,
      iva_credito: ivaCredito,
      saldo,
      iva_da_versare: daVersare,
      credito_imposta: creditoPeriodo,
    },
    note: 'Generato automaticamente da liquidazione_iva (VP/VPR — dettaglio da integrare)',
  }

  /** F24 — saldo IVA (tributo esempio 6099 sezione Erario, rigo semplificato) */
  const payloadF24 = {
    tipo_modello: 'F24',
    versione_schema: '1',
    fonte: 'liquidazione_iva',
    liquidazione_iva_id: liq.id,
    periodo_riferimento: {
      inizio: liq.periodo_inizio,
      fine: liq.periodo_fine,
    },
    sezioni_erario: [
      {
        codice_ente: 'Erario',
        codice_tributo: '6099',
        codice_rigo: '0201',
        importo: daVersare,
        note: 'IVA dovuta da saldo periodo (importo positivo; se zero nessun versamento da questo rigo)',
      },
    ],
    totale_debito: daVersare,
    note: 'Modello F24 — struttura base; codici e righe da confermare con normativa vigente',
  }

  /** Scadenzario: scadenza IVA + partite da partitari */
  const scadenzaIva = scadenzaIvaVersamento(liq.periodo_fine)
  const ultimiPart = await loadUltimiSaldiPartitari(db)
  const partiteSaldi = ultimiPart.map((p) => ({
    soggetto_id: p.soggetto_id,
    data_movimento: p.data,
    saldo_progressivo: toNum(p.saldo_progressivo),
    descrizione: p.descrizione || null,
    documento_id: p.documento_id || null,
    natura: toNum(p.saldo_progressivo) >= 0 ? 'debito' : 'credito',
  }))

  const payloadScadenzario = {
    tipo_modello: 'SCADENZARIO',
    versione_schema: '1',
    fonte: 'liquidazione_iva + partitari',
    liquidazione_iva_id: liq.id,
    scadenze: [
      {
        voce: 'Versamento IVA periodo',
        tipo: 'IVA',
        importo: daVersare,
        data_scadenza: scadenzaIva,
        riferimento: liq.id,
        note: 'Regola semplificata: 16 del mese successivo al periodo di liquidazione',
      },
      ...partiteSaldi.slice(0, 200).map((row, i) => ({
        voce: `Partita soggetto ${row.soggetto_id ? String(row.soggetto_id).slice(0, 8) : i}…`,
        tipo: 'PARTITARIO',
        importo: Math.abs(toNum(row.saldo_progressivo)),
        natura: row.natura,
        data_riferimento: row.data_movimento,
        documento_id: row.documento_id,
      })),
    ],
    note: 'Debiti/crediti da ultimo movimento partitario per soggetto; affinare con anagrafiche e scadenze contrattuali',
  }

  /** CU / 770 — base futura */
  const payloadCu = {
    tipo_modello: 'CU',
    stato: 'base_futura',
    versione_schema: '0',
    note: 'Struttura riservata a modelli CU e tracciati INPS/IRPEF — nessun calcolo in questa versione',
  }

  const payload770 = {
    tipo_modello: 'DICHIARAZIONE_770',
    stato: 'base_futura',
    versione_schema: '0',
    note: 'Struttura riservata a Modello 770 / corrispettivi — nessun calcolo in questa versione',
  }

  const rows = [
    {
      tipo: 'LIPE',
      liquidazione_iva_id: liq.id,
      periodo_inizio: liq.periodo_inizio,
      periodo_fine: liq.periodo_fine,
      payload: payloadLipe,
      meta: { generator: 'fiscalOutputService.generateFiscalOutputsFromLiquidazione' },
    },
    {
      tipo: 'F24_IVA',
      liquidazione_iva_id: liq.id,
      periodo_inizio: liq.periodo_inizio,
      periodo_fine: liq.periodo_fine,
      payload: payloadF24,
      meta: { generator: 'fiscalOutputService' },
    },
    {
      tipo: 'SCADENZARIO',
      liquidazione_iva_id: liq.id,
      periodo_inizio: liq.periodo_inizio,
      periodo_fine: liq.periodo_fine,
      payload: payloadScadenzario,
      meta: { partite_count: partiteSaldi.length },
    },
    {
      tipo: 'CU',
      liquidazione_iva_id: liq.id,
      periodo_inizio: liq.periodo_inizio,
      periodo_fine: liq.periodo_fine,
      payload: payloadCu,
      meta: { stub: true },
    },
    {
      tipo: 'DICHIARAZIONE_770',
      liquidazione_iva_id: liq.id,
      periodo_inizio: liq.periodo_inizio,
      periodo_fine: liq.periodo_fine,
      payload: payload770,
      meta: { stub: true },
    },
  ]

  const ins = await db.from('fiscal_outputs').insert(rows).select('id, tipo')

  if (ins.error) {
    L('FISCAL_OUTPUT_ERROR', { reason: 'insert', message: ins.error.message })
    return { ok: false, error: ins.error.message }
  }

  const generated = (ins.data || []).map((r) => r.tipo)

  const logPayload = {
    kind: 'FISCAL_OUTPUT',
    event: 'FISCAL_OUTPUT_GENERATED',
    liquidazione_iva_id: liq.id,
    periodo_inizio: liq.periodo_inizio,
    periodo_fine: liq.periodo_fine,
    generated,
    ids: (ins.data || []).map((r) => r.id),
  }

  L('FISCAL_OUTPUT_GENERATED', logPayload)

  if (persistAiLog) {
    const docId = `fiscal-out-${liq.id}`
    try {
      await logStep(docId, 'FISCAL_OUTPUT', JSON.stringify(logPayload), 'info', { deps: { db } })
    } catch {
      /* best-effort */
    }
  }

  return { ok: true, outputs: ins.data, logPayload }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ tipo?: string, limit?: number }} [opts]
 */
export async function fetchFiscalOutputs(db, opts = {}) {
  const limit = Math.min(200, Math.max(1, opts.limit || 50))
  if (!db?.from) return { data: null, error: new Error('db mancante') }
  let q = db.from('fiscal_outputs').select('*').order('created_at', { ascending: false }).limit(limit)
  if (opts.tipo) q = q.eq('tipo', opts.tipo)
  return q
}
