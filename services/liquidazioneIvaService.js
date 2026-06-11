/**
 * Liquidazione IVA periodica da `registri_iva`.
 * - IVA a debito: somma `iva` con tipo = vendita
 * - IVA a credito: somma `iva_detraibile` con tipo = acquisto
 * - Saldo: iva_debito - iva_credito (positivo = debito verso l’Erario, convenzione semplificata)
 */

import { logStep } from './aiSupervisorService.js'
import { generateFiscalOutputsFromLiquidazione } from './fiscalOutputService.js'
import { aggregateVatRegisterEntries } from '../src/modules/contabilita/application/iva/aggregateVatRegisterEntries.js'

/**
 * @param {number} year
 * @param {number} month 1-12
 * @returns {{ periodo_inizio: string, periodo_fine: string }}
 */
export function boundsMensile(year, month) {
  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 0)
  return {
    periodo_inizio: from.toISOString().slice(0, 10),
    periodo_fine: to.toISOString().slice(0, 10),
  }
}

/**
 * @param {number} year
 * @param {number} trimestre 1-4
 */
export function boundsTrimestrale(year, trimestre) {
  const startMonth = (trimestre - 1) * 3 + 1
  const endMonth = trimestre * 3
  const from = new Date(year, startMonth - 1, 1)
  const to = new Date(year, endMonth, 0)
  return {
    periodo_inizio: from.toISOString().slice(0, 10),
    periodo_fine: to.toISOString().slice(0, 10),
  }
}

/**
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   periodo_inizio: string,
 *   periodo_fine: string,
 * }} p
 * @returns {Promise<{ iva_debito: number, iva_credito: number, saldo: number, righe_considerate: number }>}
 */
export async function aggregateRegistriIvaPeriodo({ db, societaId, periodo_inizio, periodo_fine }) {
  if (!db?.from) {
    return aggregateVatRegisterEntries([], {
      societaId,
      periodoInizio: periodo_inizio,
      periodoFine: periodo_fine,
    })
  }

  let query = db
    .from('registri_iva')
    .select('societa_id, tipo, imponibile, iva, iva_detraibile, data, esigibilita, split_payment')
    .gte('data', periodo_inizio)
    .lte('data', periodo_fine)
  if (societaId) query = query.eq('societa_id', societaId)

  const { data: rows, error } = await query
  if (error) throw new Error(error.message || String(error))

  return aggregateVatRegisterEntries(rows, {
    societaId,
    periodoInizio: periodo_inizio,
    periodoFine: periodo_fine,
  })
}

/**
 * Esegue liquidazione e upsert su `liquidazione_iva`.
 *
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   periodicita: 'mensile' | 'trimestrale',
 *   anno: number,
 *   mese?: number | null,
 *   trimestre?: number | null,
 *   log?: (event: string, payload?: Record<string, unknown>) => void,
 *   persistAiLog?: boolean,
 *   generateFiscalOutputs?: boolean,
 * }} opts
 */
export async function runLiquidazioneIva(opts) {
  const {
    db,
    societaId,
    periodicita,
    anno,
    mese = null,
    trimestre = null,
    log,
    persistAiLog = true,
    generateFiscalOutputs = false,
  } = opts || {}

  const L = log || ((e, p) => console.log(`[liquidazioneIva] ${e}`, p || ''))

  if (!db?.from) {
    L('IVA_LIQUIDATION_ERROR', { reason: 'db_mancante' })
    return { ok: false, error: 'db_mancante' }
  }

  const per = String(periodicita || '').toLowerCase()
  if (per !== 'mensile' && per !== 'trimestrale') {
    L('IVA_LIQUIDATION_ERROR', { reason: 'periodicita_invalida', periodicita })
    return { ok: false, error: 'periodicita deve essere mensile o trimestrale' }
  }

  let periodo_inizio
  let periodo_fine
  let meseIns = null
  let trimIns = null

  if (per === 'mensile') {
    const m = Number(mese)
    if (!Number.isFinite(m) || m < 1 || m > 12) {
      L('IVA_LIQUIDATION_ERROR', { reason: 'mese_invalido', mese })
      return { ok: false, error: 'mese 1-12 richiesto per liquidazione mensile' }
    }
    const b = boundsMensile(anno, m)
    periodo_inizio = b.periodo_inizio
    periodo_fine = b.periodo_fine
    meseIns = m
  } else {
    const t = Number(trimestre)
    if (!Number.isFinite(t) || t < 1 || t > 4) {
      L('IVA_LIQUIDATION_ERROR', { reason: 'trimestre_invalido', trimestre })
      return { ok: false, error: 'trimestre 1-4 richiesto per liquidazione trimestrale' }
    }
    const b = boundsTrimestrale(anno, t)
    periodo_inizio = b.periodo_inizio
    periodo_fine = b.periodo_fine
    trimIns = t
  }

  let agg
  try {
    agg = await aggregateRegistriIvaPeriodo({ db, societaId, periodo_inizio, periodo_fine })
  } catch (e) {
    L('IVA_LIQUIDATION_ERROR', { reason: 'aggregate', message: e?.message || String(e) })
    return { ok: false, error: e?.message || String(e) }
  }

  const row = {
    ...(societaId ? { societa_id: societaId } : {}),
    periodicita: per,
    anno,
    mese: meseIns,
    trimestre: trimIns,
    periodo_inizio,
    periodo_fine,
    iva_debito: agg.iva_debito,
    iva_credito: agg.iva_credito,
    saldo: agg.saldo,
    updated_at: new Date().toISOString(),
  }

  let sel = db.from('liquidazione_iva').select('id').eq('periodicita', per).eq('anno', anno)
  if (societaId) sel = sel.eq('societa_id', societaId)
  if (per === 'mensile') {
    sel = sel.eq('mese', meseIns).is('trimestre', null)
  } else {
    sel = sel.eq('trimestre', trimIns).is('mese', null)
  }
  const { data: existing } = await sel.maybeSingle()

  let saved = null
  if (existing?.id) {
    const up = await db.from('liquidazione_iva').update(row).eq('id', existing.id).select('*').maybeSingle()
    if (up.error) {
      L('IVA_LIQUIDATION_ERROR', { reason: 'update', message: up.error.message })
      return { ok: false, error: up.error.message }
    }
    saved = up.data
  } else {
    const ins = await db.from('liquidazione_iva').insert([row]).select('*').maybeSingle()
    if (ins.error) {
      L('IVA_LIQUIDATION_ERROR', { reason: 'insert', message: ins.error.message })
      return { ok: false, error: ins.error.message }
    }
    saved = ins.data
  }

  const payload = {
    kind: 'IVA_LIQUIDATION',
    periodicita: per,
    anno,
    mese: meseIns,
    trimestre: trimIns,
    periodo_inizio,
    periodo_fine,
    iva_debito: agg.iva_debito,
    iva_credito: agg.iva_credito,
    saldo: agg.saldo,
    righe_considerate: agg.righe_considerate,
    liquidazione_id: saved?.id,
  }

  L('IVA_LIQUIDATION_DONE', payload)

  if (persistAiLog && db.from) {
    const docId = `iva-liq-${anno}-${per === 'mensile' ? String(meseIns) : `T${trimIns}`}`
    try {
      await logStep(docId, 'IVA_LIQUIDATION', JSON.stringify(payload), 'info', { deps: { db } })
    } catch {
      /* best-effort */
    }
  }

  if (generateFiscalOutputs && saved?.id) {
    try {
      await generateFiscalOutputsFromLiquidazione({
        db,
        liquidazioneIvaId: saved.id,
        log: L,
        persistAiLog,
      })
    } catch (e) {
      L('FISCAL_OUTPUT_ERROR', { reason: 'post_liquidazione', message: e?.message || String(e) })
    }
  }

  return { ok: true, ...agg, liquidazione: saved, periodo_inizio, periodo_fine }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ limit?: number }} [opts]
 */
export async function fetchLiquidazioni(db, opts = {}) {
  const limit = Math.min(500, Math.max(1, opts.limit || 100))
  if (!db?.from) return { data: null, error: new Error('db mancante') }
  return db.from('liquidazione_iva').select('*').order('periodo_fine', { ascending: false }).limit(limit)
}
