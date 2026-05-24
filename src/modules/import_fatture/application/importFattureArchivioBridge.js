/**
 * Ponte Import Fatture → `documenti_contabilita` (stesso binario di conferma Import Documenti),
 * senza prima nota né pipeline automatica.
 */

import { buildScopeMetadata, getScopeUserId } from '../../../shared/utils/accessScope.js'
import { buildDocumentoContabilitaPayload, resolveCausaleIVA } from '../../import_unificato/application/importMappers.js'
import * as importRepo from '../../import_unificato/data/importRepo.js'
import * as contabilitaRepo from '../../contabilita/data/contabilitaRepo.js'
import { FISCOSIM_IMPORT_AI_META as META } from '../../import_unificato/data/importFiscosimMeta.js'
import { pickImportFatturaStagingContoCodice } from './importFattureContoProposal.js'

export { validateImportFattureArchivioBridgePreconditions } from './importFattureArchivioPreconditions.js'

/** Allineato a `WORKING_IVA_GRID_KEY` in Import Fatture working view — righe serializzate in `_fiscosimIvaOverrides`. */
const WORKING_IVA_GRID_KEY = 'working_iva_grid'

function normalizeAiRaw(doc) {
  let raw = doc?.ai_raw_response
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return typeof p === 'object' && p && !Array.isArray(p) ? { ...p } : {}
    } catch {
      return {}
    }
  }
  return {}
}

function getBag(raw, key) {
  const bag = raw[key]
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {}
  return { ...bag }
}

function parseLooseTotaleInput(s) {
  const t = String(s || '').trim().replace(/\s/g, '')
  if (!t) return NaN
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return Number(normalized)
}

function numeroDataFromRaw(raw) {
  const num = raw.numero != null ? String(raw.numero) : '—'
  const data = raw.data != null ? String(raw.data) : '—'
  return { num, data }
}

function effectiveNumeroData(doc, raw) {
  const op = getBag(raw, META.OPERATIVE_OVERRIDES)
  const base = numeroDataFromRaw(raw)
  const num =
    op.numero_documento != null && String(op.numero_documento).trim() !== ''
      ? String(op.numero_documento).trim()
      : base.num === '—'
        ? ''
        : base.num
  const data =
    op.data_documento != null && String(op.data_documento).trim() !== ''
      ? String(op.data_documento).trim()
      : base.data === '—'
        ? ''
        : base.data
  return { num, data }
}

function ivaAiFirstRowStrings(raw) {
  const rie = Array.isArray(raw.riepilogo_iva) ? raw.riepilogo_iva : []
  const r0 = rie[0] || {}
  const imp = r0.imponibile != null ? Number(r0.imponibile) : NaN
  const iv =
    r0.imposta != null ? Number(r0.imposta) : r0.iva != null ? Number(r0.iva) : NaN
  return {
    imponibile: Number.isFinite(imp) ? String(imp) : '',
    iva: Number.isFinite(iv) ? String(iv) : '',
  }
}

function effectiveIvaTripleStrings(raw) {
  const o = getBag(raw, META.IVA_OVERRIDES)
  const ai = ivaAiFirstRowStrings(raw)
  return {
    imponibile: o.imponibile != null && String(o.imponibile).trim() !== '' ? String(o.imponibile).trim() : ai.imponibile,
    iva: o.iva != null && String(o.iva).trim() !== '' ? String(o.iva).trim() : ai.iva,
  }
}

/** Data registrazione contabile (YYYY-MM-DD): operatore in `_fiscosimOperativeOverrides`. */
function effectiveDataRegistrazione(raw) {
  const o = getBag(raw, META.OPERATIVE_OVERRIDES)
  const s = o.data_registrazione != null ? String(o.data_registrazione).trim() : ''
  return s ? s.slice(0, 10) : ''
}

/**
 * Costruisce `riepilogo_iva` come in fattura elettronica a partire dalla griglia IVA working view,
 * così `documenti_contabilita.dati_estratti` e il builder PN/IVA canonico usano le stesse righe dell'operatore.
 *
 * @param {Record<string, unknown>} raw root `ai_raw_response`
 * @param {unknown[]} causaliIva anagrafica società (per aliquota da causale se mancante)
 * @returns {Array<Record<string, unknown>> | null}
 */
function riepilogoIvaFromWorkingGrid(raw, causaliIva = []) {
  const ivaBag = getBag(raw, META.IVA_OVERRIDES)
  const wg = ivaBag[WORKING_IVA_GRID_KEY]
  if (!Array.isArray(wg) || wg.length === 0) return null
  const list = []
  for (const row of wg) {
    const imp = parseLooseTotaleInput(String(row?.imponibile ?? '').trim())
    const tax = parseLooseTotaleInput(String(row?.iva ?? '').trim())
    const cid = String(row?.causale_iva_id ?? '').trim()
    const cObj = cid ? (causaliIva || []).find((c) => String(c?.id) === cid) : null
    let aliqRaw = cObj?.aliquota
    if (aliqRaw == null || String(aliqRaw).trim() === '') {
      if (Number.isFinite(imp) && imp > 0 && Number.isFinite(tax) && tax >= 0) {
        aliqRaw = Math.round((tax / imp) * 10000) / 100
      } else {
        aliqRaw = ''
      }
    }
    list.push({
      imponibile: Number.isFinite(imp) ? imp : 0,
      imposta: Number.isFinite(tax) ? tax : 0,
      aliquota: aliqRaw,
      natura: '',
      causale_iva_id: cid || null,
    })
  }
  return list.length ? list : null
}

export function getArchivioDocumentoIdFromImportMeta(doc) {
  const raw = normalizeAiRaw(doc)
  const id = raw[META.ARCHIVIO_DOCUMENTO_ID]
  return id != null && String(id).trim() !== '' ? String(id).trim() : ''
}

/**
 * Costruisce il `form` allineato a `confirmImportedDocument` / `buildBulkConfirmFormFromDocument`.
 *
 * @param {unknown[]} [causaliIva] anagrafica causali IVA (per ricavare aliquota sulle righe griglia)
 */
export function buildArchivioConfirmFormFromImportFattureDoc(doc, pianoConti, causaliIva = []) {
  const raw = normalizeAiRaw(doc)
  const tipo = String(doc.tipo_documento || raw.tipo_documento || 'fattura_passiva')
  const nd = effectiveNumeroData(doc, raw)
  const ap = getBag(raw, META.ACCOUNTING_PROPOSALS)
  const eff = effectiveIvaTripleStrings(raw)
  const imponibileNum = parseLooseTotaleInput(eff.imponibile)
  const ivaNum = parseLooseTotaleInput(eff.iva)
  const fromGrid = riepilogoIvaFromWorkingGrid(raw, causaliIva)
  let riepilogo_iva = fromGrid
    ? fromGrid.map((x) => ({ ...x }))
    : Array.isArray(raw.riepilogo_iva)
      ? raw.riepilogo_iva.map((x) => ({ ...x }))
      : []
  if (!fromGrid) {
    if (riepilogo_iva.length === 0 && Number.isFinite(imponibileNum) && Number.isFinite(ivaNum)) {
      riepilogo_iva = [{ imponibile: imponibileNum, imposta: ivaNum, aliquota: raw.aliquota_iva ?? '' }]
    } else if (riepilogo_iva.length > 0 && (Number.isFinite(imponibileNum) || Number.isFinite(ivaNum))) {
      const r0 = { ...riepilogo_iva[0] }
      if (Number.isFinite(imponibileNum)) r0.imponibile = imponibileNum
      if (Number.isFinite(ivaNum)) r0.imposta = ivaNum
      riepilogo_iva = [r0, ...riepilogo_iva.slice(1)]
    }
  }

  const op = getBag(raw, META.OPERATIVE_OVERRIDES)
  let totaleRaw = op.totale != null ? parseLooseTotaleInput(String(op.totale)) : NaN
  if (!Number.isFinite(totaleRaw) && raw.totale != null) totaleRaw = parseLooseTotaleInput(String(raw.totale))
  const totale =
    Number.isFinite(totaleRaw) && totaleRaw > 0
      ? totaleRaw
      : Number.isFinite(imponibileNum) && Number.isFinite(ivaNum)
        ? Math.round((imponibileNum + ivaNum) * 100) / 100
        : 0

  const codConto = pickImportFatturaStagingContoCodice(doc, pianoConti, '')
  let conto_id = null
  if (codConto && Array.isArray(pianoConti)) {
    const c = pianoConti.find((x) => String(x.codice || '').trim() === codConto)
    if (c?.id) conto_id = c.id
  }

  const dataRegistrazione = effectiveDataRegistrazione(raw)

  return {
    tipo_documento: tipo,
    numero: nd.num,
    data: nd.data,
    data_registrazione: dataRegistrazione,
    cedente_denom: raw.cedente_denom || '',
    cedente_piva: raw.cedente_piva || '',
    cedente_cf: raw.cedente_cf || '',
    cessionario_denom: raw.cessionario_denom || '',
    cessionario_piva: raw.cessionario_piva || '',
    imponibile: Number.isFinite(imponibileNum) ? imponibileNum : 0,
    iva_totale: Number.isFinite(ivaNum) ? ivaNum : 0,
    totale,
    riepilogo_iva,
    causale: raw.causale || '',
    conto_id,
    causale_iva_id: String(ap.causale_iva_id ?? '').trim() || null,
    cliente_id: doc.cliente_id || null,
    linee: raw.linee || [],
    pagamenti: raw.pagamenti || [],
    aliquota_iva: raw.aliquota_iva,
    conto_da_ai: Boolean(codConto && conto_id),
  }
}

async function resolveCausaleIvaIdForInsert({
  form,
  docRow,
  societaId,
  pianoConti,
  causaliIva,
  nullNum,
}) {
  let contoId = form.conto_id || null
  let contoCodice = null
  let contoDesc = null
  let causaleIvaId = form.causale_iva_id ? String(form.causale_iva_id) : null

  if (contoId) {
    const c = pianoConti.find((x) => x.id === contoId)
    if (c) {
      contoCodice = c.codice
      contoDesc = c.descrizione
      if (c.causale_iva_id) causaleIvaId = causaleIvaId || c.causale_iva_id
    }
  }

  let imponibile = nullNum(form.imponibile)
  let iva = nullNum(form.iva_totale)
  if (form.riepilogo_iva?.length > 0) {
    imponibile = form.riepilogo_iva.reduce((s, r) => s + (r.imponibile || 0), 0)
    iva = form.riepilogo_iva.reduce((s, r) => s + (r.imposta || 0), 0)
  }

  if (!causaleIvaId && form.riepilogo_iva?.length > 0) {
    const aliq = Math.round(parseFloat(form.riepilogo_iva[0]?.aliquota || 0))
    const codFS = aliq > 0 ? `F${aliq}` : 'F0FC'
    const { data: cfs } = await importRepo.findCausaleIvaByCodice(codFS, societaId)
    if (cfs?.[0]?.id) causaleIvaId = cfs[0].id
  }

  if (!causaleIvaId) {
    const rie0 = form.riepilogo_iva?.[0] || null
    const natura0 = rie0?.natura || ''
    const aliqRaw0 = form.aliquota_iva ?? rie0?.aliquota
    const aliqRaw = iva === 0 && !natura0 ? 0 : aliqRaw0
    const causaleIvaIdResolved = resolveCausaleIVA({
      aliquota: aliqRaw,
      natura: natura0,
      fornitore: pianoConti.find((x) => x.id === contoId) || null,
      clienteDefault: null,
      causaliIva: causaliIva || [],
    })
    if (causaleIvaIdResolved) causaleIvaId = causaleIvaIdResolved
  }

  if (!causaleIvaId) {
    return { error: 'Causale IVA non risolvibile. Verifica aliquote e causali in anagrafica.' }
  }

  const totale = nullNum(form.totale) || (imponibile || 0) + (iva || 0)
  if (!Number.isFinite(totale)) {
    return { error: 'Totale documento non valido.' }
  }

  return { contoId, contoCodice, contoDesc, causaleIvaId, imponibile, iva, totale }
}

/**
 * Inserisce in `documenti_contabilita` riusando `buildDocumentoContabilitaPayload` + insert repo.
 * Nessun trigger pipeline, nessuna prima nota.
 *
 * @returns {Promise<
 *   | { ok: true, already: true, documentoContabilitaId: string }
 *   | { ok: true, already: false, documentoContabilitaId: string }
 *   | { ok: false, message: string, code?: string }
 * >}
 */
export async function insertImportFattureIntoDocumentiContabilita({
  doc,
  societaId,
  utente,
  pianoConti,
  causaliIva,
  historicalTopCodice = '',
}) {
  const pre = validateImportFattureArchivioBridgePreconditions(doc, pianoConti, historicalTopCodice, causaliIva)
  if (!pre.ok) return { ok: false, message: pre.message, code: pre.code }

  const existing = await importRepo.findDocumentoContabilitaBySourceDocumentId(societaId, doc.id)
  if (existing?.error) return { ok: false, message: existing.error.message || String(existing.error), code: 'db' }
  const row0 = existing?.data?.[0]
  if (row0?.id) {
    return { ok: true, already: true, documentoContabilitaId: String(row0.id) }
  }

  const form = buildArchivioConfirmFormFromImportFattureDoc(doc, pianoConti, causaliIva)
  const codConto = pickImportFatturaStagingContoCodice(doc, pianoConti, historicalTopCodice)
  if (codConto && !form.conto_id) {
    return { ok: false, message: `Conto "${codConto}" non trovato nel piano conti della società.`, code: 'conto' }
  }

  const nullDate = (v) => {
    if (!v) return null
    const s = String(v).trim()
    return s ? s : null
  }
  const nullNum = (v) => {
    if (v === '' || v == null || Number.isNaN(v)) return null
    const n = parseFloat(v)
    return Number.isNaN(n) ? null : n
  }

  const resolved = await resolveCausaleIvaIdForInsert({
    form,
    docRow: doc,
    societaId,
    pianoConti,
    causaliIva,
    nullNum,
  })
  if (resolved.error) return { ok: false, message: resolved.error, code: 'iva' }

  const { contoId, contoCodice, contoDesc, causaleIvaId, imponibile, iva, totale } = resolved
  const tipo = form.tipo_documento

  const scope = buildScopeMetadata({
    utente,
    societaId,
    visibility: 'shared',
    ownerUserId: getScopeUserId(utente),
    createdBy: getScopeUserId(utente),
  })

  const docForPayload = {
    ...doc,
    ai_raw_response: normalizeAiRaw(doc),
  }

  const payload = buildDocumentoContabilitaPayload({
    societaId,
    tipo,
    doc: docForPayload,
    form,
    contoId,
    causaleIvaId,
    contoCodice,
    contoDesc,
    imponibile,
    iva,
    totale,
    nullDate,
    scope,
  })

  let insRes
  try {
    insRes = await importRepo.insertDocumentoContabilita(payload)
  } catch (e) {
    return { ok: false, message: e?.message || String(e), code: 'insert' }
  }
  if (insRes?.error) {
    return { ok: false, message: insRes.error.message || String(insRes.error), code: 'insert' }
  }
  const newId = insRes?.data?.[0]?.id
  if (!newId) {
    return { ok: false, message: 'Inserimento senza id restituito.', code: 'insert' }
  }

  return { ok: true, already: false, documentoContabilitaId: String(newId) }
}

/**
 * Aggiorna una riga `documenti_contabilita` già collegata allo stesso import, dopo modifica griglia / data registrazione,
 * così `registraDocumentiConfermati` legge gli stessi dati della working view.
 */
export async function syncImportFattureDocumentoContabilitaFromImportDoc({
  doc,
  documentoContabilitaId,
  societaId,
  utente,
  pianoConti,
  causaliIva,
  historicalTopCodice = '',
}) {
  if (!doc?.id || !documentoContabilitaId) return { ok: false, message: 'Riferimenti mancanti.', code: 'args' }
  const pre = validateImportFattureArchivioBridgePreconditions(doc, pianoConti, historicalTopCodice, causaliIva)
  if (!pre.ok) return { ok: false, message: pre.message, code: pre.code }

  const uid = utente?.id || ''
  const cur = await contabilitaRepo.getDocumentoContabilitaById(documentoContabilitaId, societaId, { userId: uid })
  if (cur?.error) return { ok: false, message: cur.error.message || String(cur.error), code: 'read' }
  const row = cur?.data
  if (row?.workflow_status === 'registered' || row?.prima_nota_id) {
    return { ok: true, skipped: true }
  }

  const form = buildArchivioConfirmFormFromImportFattureDoc(doc, pianoConti, causaliIva)
  const codConto = pickImportFatturaStagingContoCodice(doc, pianoConti, historicalTopCodice)
  if (codConto && !form.conto_id) {
    return { ok: false, message: `Conto "${codConto}" non trovato nel piano conti della società.`, code: 'conto' }
  }

  const nullDate = (v) => {
    if (!v) return null
    const s = String(v).trim()
    return s ? s : null
  }
  const nullNum = (v) => {
    if (v === '' || v == null || Number.isNaN(v)) return null
    const n = parseFloat(v)
    return Number.isNaN(n) ? null : n
  }

  const resolved = await resolveCausaleIvaIdForInsert({
    form,
    docRow: doc,
    societaId,
    pianoConti,
    causaliIva,
    nullNum,
  })
  if (resolved.error) return { ok: false, message: resolved.error, code: 'iva' }

  const { contoId, contoCodice, contoDesc, causaleIvaId, imponibile, iva, totale } = resolved
  const tipo = form.tipo_documento

  const scope = buildScopeMetadata({
    utente,
    societaId,
    visibility: 'shared',
    ownerUserId: getScopeUserId(utente),
    createdBy: getScopeUserId(utente),
  })

  const docForPayload = {
    ...doc,
    ai_raw_response: normalizeAiRaw(doc),
  }

  const payload = buildDocumentoContabilitaPayload({
    societaId,
    tipo,
    doc: docForPayload,
    form,
    contoId,
    causaleIvaId,
    contoCodice,
    contoDesc,
    imponibile,
    iva,
    totale,
    nullDate,
    scope,
  })

  const patch = {
    imponibile: payload.imponibile,
    iva: payload.iva,
    totale: payload.totale,
    conto_id: payload.conto_id,
    causale_iva_id: payload.causale_iva_id,
    dati_estratti: payload.dati_estratti,
  }

  try {
    const res = await contabilitaRepo.updateDocumentoContabilita(documentoContabilitaId, patch, societaId)
    const awaited = await res
    if (awaited?.error) return { ok: false, message: awaited.error.message || String(awaited.error), code: 'update' }
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e?.message || String(e), code: 'update' }
  }
}
