/**
 * Accounting Module Service (Prima Nota / Scritture)
 *
 * Responsibility:
 * - Build and persist a minimal accounting entry derived from AI parsing JSON.
 * - Keep logic small and extensible (pipeline-friendly).
 */
 
import { buildScritturaRowsFromIvaRows } from '../domain/primaNotaScritturaFromIvaRows.js'
import { getSupabaseAdmin } from '../lib/db.js'
import { aiSupervisorService } from './aiSupervisorService.js'
import { syncPartitarioFromAccountingEntry } from './partitarioSyncService.js'
import { logBilancioUpdated } from './bilancioMastriniService.js'
import { syncRegistriIvaFromAccountingEntry } from './ivaRegistriSyncService.js'
import { maybeAutoValidateAfterPersist } from './autoValidateAccountingEngine.js'
import {
  getFiscalKnowledge,
  formatFiscalKnowledgeForPrompt,
  promptBodyFromFiscalRows,
  FISCAL_CATEGORIES_ACCOUNTING,
} from '../lib/fiscalKnowledge.js'
 
function toNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
 
function defaultLog(event, payload) {
  if (payload === undefined) console.log(`[accountingModuleService] ${event}`)
  else console.log(`[accountingModuleService] ${event}`, payload)
}
 
async function supervisorLog({ log, step, pipelineContext }) {
  try {
    const r = await aiSupervisorService({ ivaRows: [], righe: [], documentoTotale: null, pipelineContext })
    log('ACC_SUPERVISOR_STEP', { step, ok: r.ok })
  } catch (e) {
    log('ACC_SUPERVISOR_STEP_ERROR', { step, error: e?.message || String(e) })
  }
}

/**
 * Funzione richiesta dalla spec.
 *
 * @param {string} documentId
 * @param {Record<string, any>} parsingJson
 * @param {{
 *   deps?: { db?: any, log?: (event: string, payload?: any) => void },
 *   pipelineContext?: Record<string, unknown>,
 * }} [options]
 * @returns {Promise<{ ok: true, entry: any } | { ok: false, error: string, warnings?: string[] }>}
 */
export async function runAccounting(documentId, parsingJson, options = {}) {
  const { deps = {}, pipelineContext, deferLedgerSync = false } = options
  const db = deps.db || (await getSupabaseAdmin())
  const log = deps.log || defaultLog

  if (!documentId) return { ok: false, error: 'documentId mancante' }

  let fkRows = []
  let fkOk = false
  let fkErr = null
  try {
    const fk = await getFiscalKnowledge(db, FISCAL_CATEGORIES_ACCOUNTING)
    fkOk = Boolean(fk.ok)
    fkErr = fk.error || null
    fkRows = fk.ok && Array.isArray(fk.rows) ? fk.rows : []
    void formatFiscalKnowledgeForPrompt(fkRows)
  } catch (e) {
    fkErr = e?.message || String(e)
    void formatFiscalKnowledgeForPrompt([])
  }
  const appendix = promptBodyFromFiscalRows(fkRows)
  if (pipelineContext && typeof pipelineContext === 'object') {
    pipelineContext.fiscalKnowledgePromptAppendix = appendix
  }
  log('FISCAL_KNOWLEDGE_ATTACHED', {
    documentId,
    phase: 'runAccounting',
    rows: fkRows.length,
    chars: appendix.length,
    dbOk: fkOk,
    error: fkErr,
  })
  if (!parsingJson || typeof parsingJson !== 'object') return { ok: false, error: 'parsingJson mancante o invalido' }
 
  await supervisorLog({ log, step: 'START', pipelineContext })
 
  const cont = parsingJson?.contabile || {}
  const doc = parsingJson?.documento || {}
 
  const imponibile = toNum(cont.imponibile)
  const iva = toNum(cont.iva)
  const totale = Math.round((imponibile + iva) * 100) / 100
  const data = doc?.data ?? null
 
  const warnings = []
  if (!data) warnings.push('data mancante')
  if (!(imponibile > 0 || iva > 0)) warnings.push('imponibile/iva mancanti o zero')
  if (cont?.aliquota == null) warnings.push('aliquota mancante')
  if (parsingJson?.documento?.fornitore?.nome == null) warnings.push('fornitore.nome mancante')
 
  if (warnings.length) log('ACC_WARN_MISSING_DATA', { documentId, warnings })
 
  const entry = {
    tipo: 'acquisto',
    imponibile,
    iva,
    totale,
    data,
  }
 
  await supervisorLog({ log, step: 'ENTRY_BUILT', pipelineContext })
 
  const ins = await db
    .from('accounting_entries')
    .insert([
      {
        document_id: documentId,
        data: entry,
        status: 'CREATED',
      },
    ])
    .select()
    .maybeSingle()
 
  if (ins.error) {
    log('ACC_DB_INSERT_FAILED', { documentId, error: ins.error?.message || ins.error })
    return { ok: false, error: ins.error?.message || String(ins.error), warnings }
  }

  const inserted = ins.data
  let entryRow = Array.isArray(inserted) ? inserted[0] : inserted
  if (entryRow?.id && !deferLedgerSync) {
    try {
      await syncPartitarioFromAccountingEntry({ db, entry: entryRow, log })
    } catch (e) {
      log('PARTITARIO_SYNC_EXCEPTION', { documentId, message: e?.message || String(e) })
    }
    try {
      await logBilancioUpdated({ documentId, log, deps: { db } })
    } catch {
      /* ignore */
    }
    try {
      await syncRegistriIvaFromAccountingEntry({ db, entry: entryRow, log })
    } catch (e) {
      log('IVA_REGISTER_SYNC_EXCEPTION', { documentId, message: e?.message || String(e) })
    }
    entryRow = (await maybeAutoValidateAfterPersist(db, entryRow, log)) || entryRow
  }
 
  await supervisorLog({ log, step: 'DB_SAVED', pipelineContext })
 
  return { ok: true, entry: entryRow, warnings }
}
 
/**
 * @param {{
 *   ivaRows: Array<{ id?: string, aliquota: number, imponibile: number, iva: number, causale_iva_id?: string | null }>,
 *   documento?: { id?: string, totale?: number, soggetto_denominazione?: string } | null,
 *   header?: { cliente_fornitore_id?: string | null, causale_id?: string | null } | null,
 *   masterData: {
 *     pianoConti: any[],
 *     causaliIva: any[],
 *     causaleContabile: { codice?: string, descrizione?: string } | null,
 *     clientiFornitori: any[],
 *   },
 *   deps?: { newRow: () => any },
 *   pipelineContext?: Record<string, unknown>,
 * }} p
 * @returns {Promise<{ ok: true, righe: any[] } | { ok: false, error: string }>}
 */
export async function accountingModuleService({
  ivaRows,
  documento = null,
  header = null,
  masterData,
  deps = {},
  pipelineContext,
} = {}) {
  const logAcc = deps.log || defaultLog
  const traceDocId =
    documento?.id ?? pipelineContext?.documentId ?? pipelineContext?.document_id ?? null
  try {
    const db = deps.db || (await getSupabaseAdmin())
    const fk = await getFiscalKnowledge(db, FISCAL_CATEGORIES_ACCOUNTING)
    const fkRows = fk.ok && Array.isArray(fk.rows) ? fk.rows : []
    void formatFiscalKnowledgeForPrompt(fkRows)
    const appendix = promptBodyFromFiscalRows(fkRows)
    if (pipelineContext && typeof pipelineContext === 'object') {
      pipelineContext.fiscalKnowledgePromptAppendix = appendix
    }
    logAcc('FISCAL_KNOWLEDGE_ATTACHED', {
      documentId: traceDocId,
      phase: 'accountingModuleService',
      rows: fkRows.length,
      chars: appendix.length,
      dbOk: fk.ok,
      error: fk.error || null,
    })
  } catch (e) {
    const appendix = promptBodyFromFiscalRows([])
    if (pipelineContext && typeof pipelineContext === 'object') {
      pipelineContext.fiscalKnowledgePromptAppendix = appendix
    }
    logAcc('FISCAL_KNOWLEDGE_ATTACHED', {
      documentId: traceDocId,
      phase: 'accountingModuleService',
      rows: 0,
      chars: appendix.length,
      dbOk: false,
      error: e?.message || String(e),
    })
  }

  // If masterdata is missing, we must NOT block the pipeline.
  // We'll generate a minimal, consistent scrittura with default mapping.
  const { pianoConti = [], causaliIva = [], causaleContabile = null, clientiFornitori = [] } = masterData || {}
  const { newRow = defaultNewRow } = deps
 
  const clienteFornitoreId = header?.cliente_fornitore_id ?? null
  const soggettoNomeFallback = documento?.soggetto_denominazione ?? ''
  const tipo_registrazione = 'acquisto'
  const defaultContoLabel = 'costi generici'
  const defaultCausaleIvaId = 'IVA_ACQUISTI_22'
 
  if (!masterData) {
    return {
      ok: true,
      righe: buildBaseRowsNoMasterData({
        ivaRows,
        soggettoNomeFallback,
        tipo_registrazione,
        defaultContoLabel,
        defaultCausaleIvaId,
        newRow,
      }),
    }
  }
 
  const { rows, error } = buildScritturaRowsFromIvaRows({
    ivaRows,
    pianoConti,
    causaliIva,
    clientiFornitori,
    clienteFornitoreId,
    causaleContabile,
    soggettoNomeFallback,
    newRow,
  })
 
  if (error) return { ok: false, error }
  if (!rows) return { ok: true, righe: [] }
  return { ok: true, righe: rows }
}
 
function buildBaseRowsNoMasterData({
  ivaRows,
  soggettoNomeFallback,
  tipo_registrazione,
  defaultContoLabel,
  defaultCausaleIvaId,
  newRow,
}) {
  const safeRows = Array.isArray(ivaRows) ? ivaRows : []
  const imponibileTot = safeRows.reduce((s, r) => s + toNum(r?.imponibile), 0)
  const ivaTot = safeRows.reduce((s, r) => s + toNum(r?.iva), 0)
  const totale = Math.round((imponibileTot + ivaTot) * 100) / 100
 
  const out = []
 
  // Costi (Dare): una riga per ogni imponibile
  for (const r of safeRows) {
    const imp = toNum(r?.imponibile)
    if (!(imp > 0)) continue
    out.push({
      ...newRow(),
      conto_id: defaultContoLabel,
      descrizione: `${tipo_registrazione} - ${defaultContoLabel}`,
      dare: String(imp),
      avere: '',
      iva_row_id: r?.id || null,
    })
  }
 
  // IVA (Dare): una riga per ogni iva > 0
  for (const r of safeRows) {
    const imposta = toNum(r?.iva)
    if (!(imposta > 0)) continue
    out.push({
      ...newRow(),
      conto_id: 'IVA',
      descrizione: `${tipo_registrazione} - IVA`,
      dare: String(imposta),
      avere: '',
      causale_iva_id: String(r?.causale_iva_id || defaultCausaleIvaId),
      iva_row_id: r?.id || null,
    })
  }
 
  // Fornitore (Avere): una sola riga totale
  if (totale !== 0) {
    out.push({
      ...newRow(),
      conto_id: 'fornitore',
      descrizione: soggettoNomeFallback ? `Fornitore: ${soggettoNomeFallback}` : 'Fornitore',
      dare: '',
      avere: String(totale),
    })
  }
 
  return out
}

function defaultNewRow() {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    conto_id: '',
    descrizione: '',
    dare: '',
    avere: '',
  }
}
 
