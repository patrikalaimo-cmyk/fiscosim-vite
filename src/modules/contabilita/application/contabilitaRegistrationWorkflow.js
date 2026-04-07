import {
  buildPrimaNotaHeaderPayload,
  buildPrimaNotaRighePayload,
  normalizeRigaForPrimaNotaPayload,
} from '../../../../domain/primaNotaPayloadBuilder.js'
import { buildScritturaContabileFromDraft } from '../../../../domain/primaNotaPipeline.js'
import { buildInitialDraftFromDocumento } from '../../../shared/utils/primaNotaDraftFromDocumento.js'
import { createPrimaNotaCompleta } from '../../../../services/primaNotaService.js'
import { syncRegistriIvaFromAccountingEntry } from '../../../../services/ivaRegistriSyncService.js'
import { sb } from '../../../lib/supabase.js'
import * as contabilitaRepo from '../data/contabilitaRepo.js'

const EPS = 0.01

function toNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function sumRows(righe) {
  let dare = 0
  let avere = 0
  for (const r of righe || []) {
    const d = toNum(r?.importo_dare ?? r?.dare ?? 0) || 0
    const a = toNum(r?.importo_avere ?? r?.avere ?? 0) || 0
    dare += d
    avere += a
  }
  return { dare, avere }
}

function hasImporto(r) {
  const d = toNum(r?.dare ?? r?.importo_dare ?? 0) || 0
  const a = toNum(r?.avere ?? r?.importo_avere ?? 0) || 0
  return d > 0 || a > 0
}

function sumIvaRows(ivaRows) {
  let imponibile = 0
  let iva = 0
  for (const r of ivaRows || []) {
    imponibile += toNum(r?.imponibile) || 0
    iva += toNum(r?.iva) || 0
  }
  const totale = Math.round((imponibile + iva) * 100) / 100
  return { imponibile, iva, totale }
}

function pickCausaleContabile(causaliContabili, isPassiva) {
  if (!Array.isArray(causaliContabili)) return null
  return isPassiva
    ? causaliContabili.find((c) => /FF|fatt.*forn/i.test((c.codice || '') + (c.descrizione || '')))
    : causaliContabili.find((c) => /FC|fatt.*cli/i.test((c.codice || '') + (c.descrizione || '')))
}

async function buildIvaAwarePayload({
  doc,
  societaId,
  pianoConti,
  causaliContabili,
  causaliIva,
  clienti,
  trace,
  pipelineContext,
}) {
  const draft = await buildInitialDraftFromDocumento(doc, {
    societaId,
    pianoConti,
    causaliContabili,
    causaliIva,
    clienti,
    pipelineContext,
  })
  let ivaRows = Array.isArray(draft?.ivaRows) ? draft.ivaRows : []
  const isPassiva = doc?.tipo_documento?.includes('passiva')
  const isAttiva = doc?.tipo_documento?.includes('attiva')
  if (!isPassiva && !isAttiva) {
    return { error: 'Tipo documento non supportato' }
  }

  const causaleContabile =
    (draft?.header?.causale_id
      ? causaliContabili.find((c) => String(c.id) === String(draft.header.causale_id))
      : null) || pickCausaleContabile(causaliContabili, isPassiva)

  if (!ivaRows.length) {
    const docIva = toNum(doc?.iva) || 0
    const docImp = toNum(doc?.imponibile ?? doc?.totale) || 0
    if (docIva > 0) {
      return { error: 'IVA rows mancanti: impossibile registrare con percorso rapido' }
    }
    if (docImp <= 0 && docIva <= 0) {
      return { error: 'Documento privo di importi: impossibile registrare' }
    }
    ivaRows = [{
      id: `iva-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      aliquota: 0,
      imponibile: docImp,
      iva: docIva,
      causale_iva_id: doc?.causale_iva_id ?? null,
      codice_interno: null,
      autoResolved: false,
      natura: doc?.natura ?? null,
      regime_iva: null
    }]
  }

  const { rows, error } = buildScritturaContabileFromDraft({
      ivaRows,
    pianoConti,
    causaliIva,
    clientiFornitori: clienti || [],
    clienteFornitoreId: draft?.header?.cliente_fornitore_id || null,
    causaleContabile,
    soggettoNomeFallback: doc?.soggetto_denominazione || '',
    newRow: () => ({ id: crypto.randomUUID?.() || String(Math.random()), conto_id: '', descrizione: '', dare: '', avere: '' })
  })
  if (error) return { error }

  const dataReg = draft?.header?.data_registrazione || doc?.data_documento || new Date().toISOString().slice(0, 10)
  const descr = `${isPassiva ? 'Fatt. passiva' : 'Fatt. attiva'} ${doc?.soggetto_denominazione || ''} n.${doc?.numero_documento || '?'}`
  const docIdForPayload = draft?.meta?.documento_import_id || doc?.source_document_id || doc?.id || null

  const pnPayload = buildPrimaNotaHeaderPayload({
    societa_id: societaId,
    data_registrazione: dataReg,
    data_documento: doc?.data_documento,
    numero_documento: doc?.numero_documento,
    causale_id: causaleContabile?.id || null,
    causale_codice: causaleContabile?.codice || (isPassiva ? 'FF' : 'FC'),
    descrizione: descr,
    cliente_fornitore_nome: doc?.soggetto_denominazione,
    totale_dare: doc?.totale || 0,
    totale_avere: doc?.totale || 0,
    stato: 'provvisoria',
    documento_import_id: docIdForPayload,
  })

  const righePayload = buildPrimaNotaRighePayload(rows || [], {
    filterRow: hasImporto,
    mapRow: normalizeRigaForPrimaNotaPayload,
  })

  if (trace) {
    trace('IVA_AWARE_DRAFT_USED', {
      doc_id: doc?.id,
      iva_rows: ivaRows.length,
      righe: righePayload.length,
      causale_id: causaleContabile?.id || null,
    })
  }

  return {
    pnPayload,
    righePayload,
    partEntries: [],
    ivaRows,
    righeForAccountingEntry: rows || [],
    dataReg,
    isPassiva,
  }
}

async function ensureRegistriIvaSync({
  doc,
  ivaRows,
  righeForAccountingEntry,
  dataReg,
  isPassiva,
  trace,
}) {
  if (!Array.isArray(ivaRows) || ivaRows.length === 0) {
    return { skipped: true, reason: 'no_iva_rows' }
  }

  const { data: existing, error: readErr } = await contabilitaRepo.getAccountingEntriesByDocumentId(doc.id)
  if (readErr) {
    return { skipped: true, reason: 'accounting_entries_read_failed', error: readErr }
  }

  let entry = null
  if (Array.isArray(existing) && existing.length > 0) {
    entry = existing.find((e) => e.status === 'AI_PROPOSED') || existing[0]
  }

  if (!entry) {
    const sums = sumIvaRows(ivaRows)
    const entryPayload = {
      document_id: doc.id,
      status: 'CREATED',
      data: {
        tipo: isPassiva ? 'acquisto' : 'vendita',
        imponibile: sums.imponibile,
        iva: sums.iva,
        totale: sums.totale,
        data: dataReg,
        causale_iva_id: doc?.causale_iva_id ?? null,
        rows: righeForAccountingEntry || [],
      },
    }
    const ins = await contabilitaRepo.insertAccountingEntry(entryPayload)
    if (ins?.error) {
      return { skipped: true, reason: 'accounting_entry_insert_failed', error: ins.error }
    }
    entry = ins?.data || null
  }

  if (!entry?.id) {
    return { skipped: true, reason: 'accounting_entry_missing' }
  }

  try {
    const syncRes = await syncRegistriIvaFromAccountingEntry({
      db: sb,
      entry,
      log: (event, payload) => trace?.('IVA_REGISTRI_SYNC', { event, ...payload }),
    })
    return { ok: true, result: syncRes }
  } catch (e) {
    return { skipped: true, reason: 'registri_sync_exception', error: e }
  }
}

function buildControls({ doc, righe, causaliIva = [], allDocumenti = [], primaryCausaleIvaId = null }) {
  const controls = []

  const { dare, avere } = sumRows(righe)
  if (Math.abs(dare - avere) > EPS) {
    controls.push({
      code: 'PN_NOT_BALANCED',
      severity: 'block',
      message: `Scrittura non bilanciata (Dare ${dare.toFixed(2)} / Avere ${avere.toFixed(2)})`,
    })
  }

  const imponibile = toNum(doc?.imponibile)
  const iva = toNum(doc?.iva)
  const totale = toNum(doc?.totale)

  const hasIva = (iva ?? 0) > 0
  const resolvedCausaleIvaId = doc?.causale_iva_id || primaryCausaleIvaId || null
  if (hasIva) {
    if (!Number.isFinite(imponibile) || !Number.isFinite(iva)) {
      controls.push({
        code: 'IVA_INCOMPLETE',
        severity: 'block',
        message: 'IVA incompleta o non numerica',
      })
    }
    if (!resolvedCausaleIvaId) {
      controls.push({
        code: 'IVA_CAUSALE_MISSING',
        severity: 'block',
        message: 'Causale IVA mancante per documento imponibile',
      })
    }
  }

  if (resolvedCausaleIvaId && Array.isArray(causaliIva) && causaliIva.length > 0) {
    const known = causaliIva.some((c) => String(c.id) === String(resolvedCausaleIvaId))
    if (!known) {
      controls.push({
        code: 'IVA_CAUSALE_UNKNOWN',
        severity: 'warning',
        message: 'Causale IVA non riconosciuta nelle anagrafiche correnti',
      })
    }
  } else if (!resolvedCausaleIvaId) {
    controls.push({
      code: 'IVA_CAUSALE_SUSPICIOUS',
      severity: 'warning',
      message: 'Causale IVA non risolta sul documento',
    })
  }

  if (Number.isFinite(totale)) {
    const rowTotal = Math.max(dare, avere)
    if (Math.abs(rowTotal - totale) > EPS) {
      controls.push({
        code: 'DOC_TOTAL_MISMATCH',
        severity: 'warning',
        message: `Totale documento (${totale.toFixed(2)}) non coerente con righe (${rowTotal.toFixed(2)})`,
      })
    }
  }

  const numero = doc?.numero_documento
  const data = doc?.data_documento
  const keySubject = doc?.soggetto_piva || doc?.soggetto_cf || doc?.soggetto_denominazione
  if (numero && data && keySubject) {
    const possibleDup = (allDocumenti || []).find((d) => {
      if (!d || d.id === doc.id) return false
      if (d?.numero_documento !== numero) return false
      if (d?.data_documento !== data) return false
      const otherKey = d?.soggetto_piva || d?.soggetto_cf || d?.soggetto_denominazione
      return otherKey && otherKey === keySubject
    })
    if (possibleDup) {
      controls.push({
        code: 'POSSIBLE_DUPLICATE',
        severity: 'warning',
        message: 'Possibile duplicato per numero/data/soggetto',
      })
    }
  }

  return controls
}

export async function registraDocumentiConfermati({
  documenti,
  societaId,
  pianoConti,
  causaliContabili,
  causaliIva,
  clienti,
  updateDocumento,
  trace,
  traceStep,
  traceDiff,
  traceIva,
  insertCausaleIvaMeta,
}) {
  const daRegistrare = (documenti || []).filter(
    (d) => d.validation_status === 'confirmed' && d.workflow_status !== 'registered'
  )

  if (!daRegistrare.length) return { registrati: 0, skipped: true, errors: [] }

  let registrati = 0
  const errors = []
  const warnings = []
  let blocked = 0
  for (const doc of daRegistrare) {
    try {
      if (!societaId) {
        errors.push({ docId: doc?.id, error: 'SocietÃ  non selezionata' })
        continue
      }
      if (!doc?.id) {
        errors.push({ docId: doc?.id, error: 'Documento non valido' })
        continue
      }
      const isPassiva = doc.tipo_documento?.includes('passiva')
      const isAttiva = doc.tipo_documento?.includes('attiva')
      if (!isPassiva && !isAttiva) {
        errors.push({ docId: doc.id, error: 'Tipo documento non supportato' })
        continue
      }
      const totalNum = Number(doc?.totale)
      if (!Number.isFinite(totalNum)) {
        errors.push({ docId: doc.id, error: 'Totale documento non valido' })
        continue
      }

      const pipelineContext = { docId: doc.id, path: 'registraDocumentiConfermati' }
      trace?.('DB', { action: 'INSERT prima_nota', doc_id: doc.id })

      let pnInsertPayload
      let righe = []
      let partEntries = []
      let ivaRows = []
      let righeForAccountingEntry = []
      let dataReg = doc.data_documento || new Date().toISOString().slice(0, 10)

      const ivaAware = await buildIvaAwarePayload({
        doc,
        societaId,
        pianoConti,
        causaliContabili,
        causaliIva,
        clienti,
        trace,
        pipelineContext,
      })

  if (ivaAware?.error) {
    errors.push({ docId: doc?.id, error: ivaAware.error })
    continue
  }

      pnInsertPayload = ivaAware.pnPayload
      righe = ivaAware.righePayload || []
      partEntries = ivaAware.partEntries || []
      ivaRows = ivaAware.ivaRows || []
      righeForAccountingEntry = ivaAware.righeForAccountingEntry || []
      dataReg = ivaAware.dataReg || dataReg

      const primaryCausaleIvaId = ivaRows.find((r) => r?.causale_iva_id)?.causale_iva_id || null
      const controls = buildControls({
        doc,
        righe,
        causaliIva,
        allDocumenti: documenti,
        primaryCausaleIvaId,
      })
      const blocking = controls.filter((c) => c.severity === 'block')
      const warn = controls.filter((c) => c.severity === 'warning')

      if (blocking.length) {
        blocked += 1
        errors.push({
          docId: doc?.id,
          error: blocking.map((c) => c.message).join('; '),
          blocking: true,
          controls: blocking,
        })
        continue
      }

      if (warn.length) {
        warnings.push({
          docId: doc?.id,
          warnings: warn,
        })
      }

      traceIva?.('PRE_INSERT_PRIMA_NOTA_HEADER', 'DB', doc.causale_iva_id ?? null)
      traceStep?.(
        'INSERT_PAYLOAD',
        pnInsertPayload,
        { table: 'prima_nota', ...(insertCausaleIvaMeta ? insertCausaleIvaMeta(pnInsertPayload) : {}) }
      )
      traceDiff?.(
        'DB_MAPPING_DIFF',
        { causale_iva_id: doc.causale_iva_id ?? null },
        { causale_iva_id: pnInsertPayload.causale_iva_id ?? null }
      )

      if (righe.length > 0) {
        traceIva?.('PRE_INSERT_PRIMA_NOTA_RIGHE', 'DB', righe[0]?.causale_iva_id ?? doc.causale_iva_id ?? null)
        traceStep?.(
          'INSERT_PAYLOAD',
          righe,
          { table: 'prima_nota_righe', ...(insertCausaleIvaMeta ? insertCausaleIvaMeta(righe) : {}) }
        )
        traceDiff?.(
          'DB_MAPPING_DIFF',
          { causale_iva_id: doc.causale_iva_id ?? null },
          { causale_iva_id: righe[0]?.causale_iva_id ?? null }
        )
      }

      const complete = await createPrimaNotaCompleta({
        pnPayload: pnInsertPayload,
        righePayload: righe,
        partEntries,
        headerSelect: '*',
        righeSelect: '*',
        partitarioSelect: '*',
      })
      traceStep?.('INSERT_RESULT', { table: 'prima_nota', data: complete.pn, error: complete.error })
      traceStep?.(
        'INSERT_RESULT',
        { table: 'prima_nota_righe', data: complete.righeIns?.data, error: complete.righeIns?.error ?? complete.error }
      )
      if (complete.error || complete.partIns?.error) throw complete.error || complete.partIns?.error
      const pn = complete.pn

      const syncRes = await ensureRegistriIvaSync({
        doc,
        ivaRows,
        righeForAccountingEntry,
        dataReg,
        isPassiva,
        trace,
      })
      if (syncRes?.skipped && syncRes.reason && syncRes.reason !== 'no_iva_rows') {
        warnings.push({
          docId: doc?.id,
          warnings: [{
            code: 'IVA_REGISTRI_SYNC_SKIPPED',
            severity: 'warning',
            message: 'Registri IVA non sincronizzati automaticamente (verifica manuale).',
            detail: syncRes.reason,
          }],
        })
      }

      const updRes = await updateDocumento(doc.id, {
        workflow_status: 'registered',
        registered_at: new Date().toISOString(),
        prima_nota_id: pn.id,
      })
      if (updRes?.error) throw updRes.error

      registrati++
    } catch (err) {
      console.error('Registrazione error per doc', doc.id, err)
      errors.push({ docId: doc?.id, error: err?.message || String(err) })
    }
  }

  return { registrati, skipped: false, total: daRegistrare.length, errors, warnings, blocked }
}
