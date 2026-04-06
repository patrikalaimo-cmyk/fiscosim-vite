/**
 * Orchestrator Service
 *
 * Responsibility:
 * - Coordinate pipeline steps (parse → build VAT rows → build accounting entries → validate → persist).
 * - Keep the services small and composable; the orchestrator wires dependencies together.
 */
 
import { getSupabaseAdmin } from '../lib/db.js'
import { aiParsingService } from './aiParsingService.js'
import { accountingModuleService } from './accountingModuleService.js'
import { aiSupervisorService } from './aiSupervisorService.js'
 
/**
 * Orchestrazione richiesta dalla spec.
 *
 * Flusso:
 * - status = PROCESSING
 * - carica ai_parsing_results.json_output
 * - legge azioni_suggerite
 * - routing: se include "registrazione_acquisto" → accountingModuleService
 * - status = COMPLETED
 *
 * NOTE:
 * - logica semplice e estendibile: if/early-return, niente switch.
 * - supervisor integrato ad ogni step (non blocca di default: logga e prosegue).
 */
export async function orchestrate(documentId, options = {}) {
  const { deps = {}, pipelineContext, masterData = null, header = null, documento = null } = options
  const db = deps.db || (await getSupabaseAdmin())
  const log = deps.log || defaultLog

  if (!documentId) return { ok: false, step: 'input', error: 'documentId mancante' }

  // Step: status PROCESSING
  await updateDocumentStatus({ db, documentId, status: 'PROCESSING', log })
  await supervisorStep({ log, step: 'STATUS_PROCESSING', pipelineContext })

  // Step: load parsing result
  const parsingRes = await db
    .from('ai_parsing_results')
    .select('json_output, confidence')
    .eq('document_id', documentId)
    .maybeSingle()

  if (parsingRes.error) {
    log('ORCH_DB_READ_PARSING_FAILED', { documentId, error: parsingRes.error?.message || parsingRes.error })
    return { ok: false, step: 'load_ai_parsing_results', error: parsingRes.error?.message || String(parsingRes.error) }
  }

  const jsonOutput = parsingRes.data?.json_output
  if (!jsonOutput) {
    log('ORCH_PARSING_MISSING', { documentId })
    return { ok: false, step: 'load_ai_parsing_results', error: 'Parsing mancante' }
  }
  await supervisorStep({ log, step: 'PARSING_LOADED', pipelineContext })

  let parsingJson = jsonOutput
  if (typeof jsonOutput === 'string') {
    try {
      parsingJson = JSON.parse(jsonOutput)
    } catch {
      parsingJson = null
    }
  }
  const pj =
    parsingJson && typeof parsingJson === 'object'
      ? parsingJson
      : jsonOutput && typeof jsonOutput === 'object'
        ? jsonOutput
        : null

  const assignOut = await assignStudioClienteFromParsingJson({ db, documentId, parsingJson: pj, log })
  const tipoDocumentoEff = assignOut?.tipo_documento === 'attivo' ? 'attivo' : 'passivo'

  const azioni = Array.isArray(pj?.azioni_suggerite) ? pj.azioni_suggerite : []

  // Routing: registrazione_acquisto → accounting module (soggetto a impostazioni automazione studio)
  if (azioni.includes('registrazione_acquisto')) {
    await supervisorStep({ log, step: 'ROUTE_REGISTRAZIONE_ACQUISTO', pipelineContext })

    const automation = await loadStudioAutomationSettings(db)
    const confidence = clamp01(pj?.meta?.confidence)

    if (!automation.auto_mode) {
      log('MANUAL_MODE_ACTIVE', {
        documentId,
        tipo_documento: tipoDocumentoEff,
        confidence,
      })
    } else {
      const allowByTipo =
        tipoDocumentoEff === 'attivo' ? automation.auto_fatture_attive : automation.auto_fatture_passive

      if (!allowByTipo) {
        log('MANUAL_REVIEW_REQUIRED', {
          documentId,
          reason: 'tipo_non_abilitato_per_automazione',
          tipo_documento: tipoDocumentoEff,
          auto_fatture_passive: automation.auto_fatture_passive,
          auto_fatture_attive: automation.auto_fatture_attive,
          confidence,
        })
      } else if (confidence < automation.confidence_threshold) {
        log('AUTO_SKIPPED_LOW_CONFIDENCE', {
          documentId,
          confidence,
          threshold: automation.confidence_threshold,
          tipo_documento: tipoDocumentoEff,
        })
      } else {
        const masterDataEff = masterData || buildDefaultMasterData()
        if (!masterData) {
          log('MASTERDATA_DEFAULT_USED', {
            documentId,
            defaults: { conto: 'costi generici', causale_iva_id: 'IVA_ACQUISTI_22', tipo_registrazione: 'acquisto' },
          })
        }

        const ivaRows = buildIvaRowsFromParsing(pj || {}).map(r => ({
          ...r,
          causale_iva_id: r.causale_iva_id || 'IVA_ACQUISTI_22',
        }))

        const accRes = await accountingModuleService({
          ivaRows,
          documento:
            documento ||
            { id: documentId, totale: null, soggetto_denominazione: pj?.documento?.fornitore?.nome ?? '' },
          header,
          masterData: masterDataEff,
          deps: deps.accountingDeps || {},
          pipelineContext,
        })

        if (!accRes.ok) {
          log('ORCH_ACCOUNTING_FAILED', { documentId, error: accRes.error })
          log('MANUAL_REVIEW_REQUIRED', { documentId, reason: 'accounting_module_failed', error: accRes.error })
        } else {
          log('AUTO_ACCOUNTING_EXECUTED', { documentId, tipo_documento: tipoDocumentoEff, confidence })

          const sup = await aiSupervisorService({
            ivaRows,
            righe: accRes.righe,
            documentoTotale: documento?.totale ?? null,
            pipelineContext,
          })
          if (!sup.ok) {
            log('ORCH_SUPERVISOR_REJECT_ACCOUNTING', { documentId, error: sup.error, details: sup.details })
          } else {
            log('ORCH_SUPERVISOR_OK_ACCOUNTING', { documentId })
          }
        }
      }
    }
  }

  // Step: status COMPLETED
  await updateDocumentStatus({ db, documentId, status: 'COMPLETED', log })
  await supervisorStep({ log, step: 'STATUS_COMPLETED', pipelineContext })

  return { ok: true, result: { documentId, azioni_suggerite: azioni } }
}

function buildDefaultMasterData() {
  // Base defaults to keep the pipeline unblocked. Future: map by fornitore/tipo documento.
  return {
    pianoConti: [],
    causaliIva: [],
    causaleContabile: { codice: 'FF', descrizione: 'Acquisto (default pipeline)' },
    clientiFornitori: [],
  }
}

/**
 * @param {{
 *   input: {
 *     documentoId?: string,
 *     fileBase64?: string,
 *     filename?: string,
 *     mimeType?: string,
 *   },
 *   masterData?: {
 *     pianoConti?: any[],
 *     causaliIva?: any[],
 *     causaliContabili?: any[],
 *     clientiFornitori?: any[],
 *   },
 *   header?: { causale_id?: string | null, cliente_fornitore_id?: string | null },
 *   ivaRows?: Array<{ id?: string, aliquota: number, imponibile: number, iva: number, causale_iva_id?: string | null }>,
 *   documento?: { id?: string, totale?: number, soggetto_denominazione?: string } | null,
 *   options?: { persist?: boolean },
 *   deps?: { db?: any },
 *   pipelineContext?: Record<string, unknown>,
 * }} p
 * @returns {Promise<{ ok: true, result: any } | { ok: false, error: string, step?: string, details?: any }>}
 */
export async function orchestratorService({
  input,
  masterData = {},
  header = null,
  ivaRows = null,
  documento = null,
  options = {},
  deps = {},
  pipelineContext,
} = {}) {
  const db = deps.db || (await getSupabaseAdmin())
 
  // 1) Parsing (optional if caller already has extracted data)
  const parseRes = await aiParsingService({ input, pipelineContext })
  if (!parseRes.ok) return { ok: false, step: 'aiParsingService', error: parseRes.error }
 
  // 2) VAT rows
  // Base skeleton: if ivaRows already provided, keep them; otherwise orchestrator would build them.
  const ivaRowsOut = Array.isArray(ivaRows) ? ivaRows : []
 
  // 3) Resolve causale contabile object (if provided as id)
  const causaleContabile = resolveCausaleContabile({
    header,
    causaliContabili: masterData.causaliContabili || [],
  })
 
  // 4) Build accounting rows
  const accRes = await accountingModuleService({
    ivaRows: ivaRowsOut,
    documento,
    header,
    masterData: {
      pianoConti: masterData.pianoConti || [],
      causaliIva: masterData.causaliIva || [],
      causaleContabile,
      clientiFornitori: masterData.clientiFornitori || [],
    },
    pipelineContext,
  })
  if (!accRes.ok) return { ok: false, step: 'accountingModuleService', error: accRes.error }
 
  // 5) Supervisor validations
  const supRes = await aiSupervisorService({
    ivaRows: ivaRowsOut,
    righe: accRes.righe,
    documentoTotale: documento?.totale ?? null,
    pipelineContext,
  })
  if (!supRes.ok) return { ok: false, step: 'aiSupervisorService', error: supRes.error, details: supRes.details }
 
  // 6) Persist (optional)
  if (options.persist) {
    // Intentionally minimal: actual insert/update tables to be implemented in your domain layer.
    // Keep the orchestrator as the coordinator; persistence should live in a dedicated repo/service module.
    void db
  }
 
  return {
    ok: true,
    result: {
      parsed: parseRes.parsed,
      ivaRows: ivaRowsOut,
      righe: accRes.righe,
    },
  }
}
 
function resolveCausaleContabile({ header, causaliContabili }) {
  const id = header?.causale_id
  if (!id) return null
  return (causaliContabili || []).find(c => String(c.id) === String(id)) || null
}
 
function buildIvaRowsFromParsing(jsonOutput) {
  const c = jsonOutput?.contabile || {}
  const imponibile = toNum(c.imponibile)
  const iva = toNum(c.iva)
  const aliquota = toNum(c.aliquota)
  return [
    {
      id: 'iva-from-parsing',
      aliquota: Number.isFinite(aliquota) ? Math.round(aliquota) : 0,
      imponibile,
      iva,
      // Non presente nello schema parsing: verrà risolta/assegnata in step successivi.
      causale_iva_id: null,
    },
  ]
}

function clamp01(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

/**
 * Legge `impostazioni_studio` (chiave/valore). Supporta `auto_mode` o alias `automazione_pipeline`.
 */
async function loadStudioAutomationSettings(db) {
  const defaults = {
    auto_mode: false,
    auto_fatture_passive: false,
    auto_fatture_attive: false,
    confidence_threshold: 0.85,
  }

  const q = await db.from('impostazioni_studio').select('chiave,valore')
  if (q.error) {
    return defaults
  }

  const map = Object.fromEntries((q.data || []).map((r) => [r.chiave, r.valore ?? '']))
  const truthy = (v) => v === true || v === 'true'

  const auto_mode = truthy(map.auto_mode) || truthy(map.automazione_pipeline)
  const auto_fatture_passive = truthy(map.auto_fatture_passive)
  const auto_fatture_attive = truthy(map.auto_fatture_attive)

  let confidence_threshold = parseFloat(String(map.confidence_threshold ?? '0.85').replace(',', '.'))
  if (!Number.isFinite(confidence_threshold)) confidence_threshold = defaults.confidence_threshold
  confidence_threshold = Math.min(0.95, Math.max(0.8, confidence_threshold))

  return {
    auto_mode,
    auto_fatture_passive,
    auto_fatture_attive,
    confidence_threshold,
  }
}

/**
 * Normalizza P.IVA per confronto: trim, rimuove IT, solo cifre (core), più varianti per query DB.
 * Nessuna AI.
 */
function normalizePivaCore(raw) {
  const trimmed = String(raw ?? '').trim().replace(/\s/g, '')
  if (!trimmed) return ''
  const digits = trimmed.replace(/^IT/i, '').replace(/[^0-9]/g, '')
  return digits
}

/** Varianti da confrontare con `clienti.partita_iva` / `anagrafica_piva`. */
function buildPivaLookupVariants(raw) {
  const s = String(raw ?? '').trim().replace(/\s/g, '')
  if (!s) return []
  const digits = normalizePivaCore(raw)
  const out = new Set()
  out.add(s)
  if (digits.length >= 9 && digits.length <= 14) {
    out.add(digits)
    out.add(`IT${digits}`)
    out.add(`it${digits}`)
  }
  return [...out]
}

/** Legge P.IVA da più percorsi possibili nel JSON di parsing (nessuna AI). */
function readPivaFromParsing(parsingJson, dotPaths) {
  for (const path of dotPaths) {
    const parts = path.split('.')
    let o = parsingJson
    for (const p of parts) {
      o = o?.[p]
    }
    if (o != null && String(o).trim()) return String(o).trim()
  }
  return ''
}

/**
 * Cedente/prestatore/fornitore e cessionario/committente/cliente: match su tabella `clienti`.
 * Non blocca mai la pipeline.
 */
async function lookupClienteUniqueByPiva(db, pivaRaw) {
  const trimmed = pivaRaw == null ? '' : String(pivaRaw).trim()
  if (!trimmed) return { kind: 'empty' }

  const variants = buildPivaLookupVariants(trimmed)
  if (!variants.length) return { kind: 'invalid', piva: trimmed }

  const idSet = new Set()
  let lastErr = null

  for (const v of variants) {
    const q1 = await db.from('clienti').select('id').eq('attivo', true).eq('partita_iva', v)
    if (q1.error) lastErr = q1.error
    for (const row of q1.data || []) {
      if (row?.id) idSet.add(String(row.id))
    }
    const q2 = await db.from('clienti').select('id').eq('attivo', true).eq('anagrafica_piva', v)
    if (q2.error) lastErr = q2.error
    for (const row of q2.data || []) {
      if (row?.id) idSet.add(String(row.id))
    }
  }

  if (lastErr && idSet.size === 0) {
    return { kind: 'error', error: lastErr.message || String(lastErr), piva: trimmed }
  }
  if (idSet.size === 0) return { kind: 'none', piva: trimmed }
  if (idSet.size > 1) return { kind: 'multiple', piva: trimmed, count: idSet.size }
  return { kind: 'one', id: [...idSet][0], piva: trimmed }
}

/** 1 = match univoco, 0 = nessuno / vuoto / invalid / errore / none, 'multiple' = ambiguo */
function clienteMatchCardinality(res) {
  if (!res) return 0
  if (res.kind === 'one') return 1
  if (res.kind === 'multiple') return 'multiple'
  return 0
}

/**
 * Match automatico cliente da parsing (XML / JSON AI): cedente vs cessionario, senza AI.
 *
 * P.IVA cedente: `documento.fornitore.piva` (priorità), poi cedente/prestatore.
 * P.IVA cessionario: `documento.cliente.piva` (priorità), poi cessionario/committente.
 *
 * Regole: match multipli su un ruolo → nessuna assegnazione.
 */
async function assignStudioClienteFromParsingJson({ db, documentId, parsingJson, log }) {
  const emitRole = (payload) => {
    log('CLIENT_ROLE_ASSIGNED', payload)
  }

  if (!parsingJson || typeof parsingJson !== 'object') {
    log('CLIENT_NOT_FOUND', { documentId, reason: 'no_parsing_json' })
    emitRole({ documentId, assigned: false, outcome: 'no_parsing_json' })
    return { tipo_documento: null }
  }

  const pivaCedente = readPivaFromParsing(parsingJson, [
    'documento.fornitore.piva',
    'documento.cedente.piva',
    'documento.prestatore.piva',
  ])
  const pivaCessionario = readPivaFromParsing(parsingJson, [
    'documento.cliente.piva',
    'documento.cessionario.piva',
    'documento.committente.piva',
  ])

  const pivaCedNorm = pivaCedente ? normalizePivaCore(pivaCedente) : ''
  const pivaCesNorm = pivaCessionario ? normalizePivaCore(pivaCessionario) : ''

  if (!pivaCedente && !pivaCessionario) {
    log('CLIENT_NOT_FOUND', { documentId, reason: 'no_cedente_nor_cessionario_piva' })
    emitRole({ documentId, assigned: false, outcome: 'no_piva_in_parsing' })
    return { tipo_documento: null }
  }

  const resCed = pivaCedente ? await lookupClienteUniqueByPiva(db, pivaCedente) : { kind: 'empty' }
  const resCes = pivaCessionario ? await lookupClienteUniqueByPiva(db, pivaCessionario) : { kind: 'empty' }

  if (resCed.kind === 'error') {
    log('CLIENT_NOT_FOUND', { documentId, role: 'cedente', reason: 'clienti_query_failed', error: resCed.error })
  }
  if (resCes.kind === 'error') {
    log('CLIENT_NOT_FOUND', { documentId, role: 'cessionario', reason: 'clienti_query_failed', error: resCes.error })
  }

  if (resCed.kind === 'multiple') {
    log('CLIENT_MULTIPLE_MATCH', { documentId, role: 'cedente', piva: resCed.piva, piva_normalized: pivaCedNorm || null, count: resCed.count })
  }
  if (resCes.kind === 'multiple') {
    log('CLIENT_MULTIPLE_MATCH', { documentId, role: 'cessionario', piva: resCes.piva, piva_normalized: pivaCesNorm || null, count: resCes.count })
  }
  if (resCed.kind === 'invalid') {
    log('CLIENT_NOT_FOUND', { documentId, role: 'cedente', reason: 'invalid_piva', piva: resCed.piva })
  }
  if (resCes.kind === 'invalid') {
    log('CLIENT_NOT_FOUND', { documentId, role: 'cessionario', reason: 'invalid_piva', piva: resCes.piva })
  }

  const matchCedente = clienteMatchCardinality(resCed)
  const matchCessionario = clienteMatchCardinality(resCes)

  if (matchCedente === 'multiple' || matchCessionario === 'multiple') {
    emitRole({
      documentId,
      assigned: false,
      outcome: 'skipped_multiple_match',
      matchCedente,
      matchCessionario,
      piva_cedente: pivaCedente || null,
      piva_cessionario: pivaCessionario || null,
    })
    return { tipo_documento: null }
  }

  const mCed = matchCedente === 1 ? 1 : 0
  const mCes = matchCessionario === 1 ? 1 : 0

  let clienteId = null
  let tipoDocumento = null

  if (mCes === 1 && mCed === 0) {
    clienteId = resCes.id
    tipoDocumento = 'passivo'
  } else if (mCed === 1 && mCes === 0) {
    clienteId = resCed.id
    tipoDocumento = 'attivo'
  } else if (mCed === 1 && mCes === 1) {
    clienteId = resCes.id
    tipoDocumento = 'passivo'
    log('DUAL_CLIENT_MATCH', {
      documentId,
      cliente_id_assegnato: resCes.id,
      cedente_cliente_id: resCed.id,
      stesso_soggetto: resCed.id === resCes.id,
      piva_cedente: pivaCedente || null,
      piva_cessionario: pivaCessionario || null,
      piva_cedente_normalized: pivaCedNorm || null,
      piva_cessionario_normalized: pivaCesNorm || null,
    })
  }

  if (!clienteId) {
    if (pivaCedente || pivaCessionario) {
      log('CLIENT_NOT_FOUND', {
        documentId,
        reason: 'no_unique_client_for_roles',
        matchCedente: mCed,
        matchCessionario: mCes,
        piva_cedente: pivaCedente || null,
        piva_cessionario: pivaCessionario || null,
      })
    }
    emitRole({
      documentId,
      assigned: false,
      outcome: 'no_match',
      matchCedente: mCed,
      matchCessionario: mCes,
      piva_cedente: pivaCedente || null,
      piva_cessionario: pivaCessionario || null,
    })
    return { tipo_documento: null }
  }

  const saved = await persistClienteIdAndTipoOnDocumentRecord({ db, documentId, clienteId, tipo_documento: tipoDocumento })
  if (saved.ok) {
    emitRole({
      documentId,
      assigned: true,
      outcome: 'persisted',
      cliente_id: clienteId,
      tipo_documento: tipoDocumento,
      table: saved.table,
      tipo_column_skipped: saved.tipo_column_skipped || false,
      piva_cedente: pivaCedente || null,
      piva_cessionario: pivaCessionario || null,
    })
  } else {
    log('CLIENT_NOT_FOUND', { documentId, reason: 'persist_failed', cliente_id: clienteId, tipo_documento: tipoDocumento })
    emitRole({
      documentId,
      assigned: false,
      outcome: 'persist_failed',
      cliente_id: clienteId,
      tipo_documento: tipoDocumento,
    })
  }

  return { tipo_documento: tipoDocumento }
}

/** Prova `documenti_contabilita` poi `documents` con `cliente_id` e `tipo_documento` (passivo/attivo). */
async function persistClienteIdAndTipoOnDocumentRecord({ db, documentId, clienteId, tipo_documento }) {
  const fullPatch = { cliente_id: clienteId, tipo_documento }
  for (const table of ['documenti_contabilita', 'documents']) {
    let upd = await db.from(table).update(fullPatch).eq('id', documentId).select('id').maybeSingle()
    if (!upd.error && upd.data?.id) return { ok: true, table, tipo_column_skipped: false }
    const onlyCliente = await db.from(table).update({ cliente_id: clienteId }).eq('id', documentId).select('id').maybeSingle()
    if (!onlyCliente.error && onlyCliente.data?.id) {
      return { ok: true, table, tipo_column_skipped: true }
    }
  }
  return { ok: false, table: null }
}

async function updateDocumentStatus({ db, documentId, status, log }) {
  // Prefer "documents" (per spec), fallback to "documenti_contabilita" (attuale codebase).
  const tried = []
  for (const t of ['documents', 'documenti_contabilita']) {
    tried.push(t)
    // documents: status = PROCESSING/COMPLETED
    // documenti_contabilita (schema): workflow_status = imported/parsed/proposed/validated/registered/error
    const workflowValue =
      status === 'PROCESSING' ? 'parsed' : status === 'COMPLETED' ? 'proposed' : String(status || '').toLowerCase()

    const attempts = [
      { patch: { status } },
      { patch: { workflow_status: workflowValue } },
      { patch: { stato: workflowValue } },
    ]

    for (const a of attempts) {
      const upd = await db.from(t).update(a.patch).eq('id', documentId)
      if (!upd.error) {
        log('ORCH_STATUS_UPDATED', { documentId, status, table: t, patch: a.patch })
        return { ok: true, table: t, patch: a.patch }
      }
    }
  }
  log('ORCH_STATUS_UPDATE_FAILED', { documentId, status, triedTables: tried })
  return { ok: false, triedTables: tried }
}

async function supervisorStep({ log, step, pipelineContext }) {
  try {
    const res = await aiSupervisorService({ ivaRows: [], righe: [], documentoTotale: null, pipelineContext })
    // We only log the step marker; supervisor here is used as a consistent hook.
    log('ORCH_SUPERVISOR_STEP', { step, ok: res.ok })
  } catch (e) {
    log('ORCH_SUPERVISOR_STEP_ERROR', { step, error: e?.message || String(e) })
  }
}

function toNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function defaultLog(event, payload) {
  if (payload === undefined) console.log(`[orchestratorService] ${event}`)
  else console.log(`[orchestratorService] ${event}`, payload)
}

