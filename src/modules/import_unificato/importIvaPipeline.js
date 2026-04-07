/**
 * Dopo DOCUMENT_NORMALIZED: normalizza l'input IVA, delega la decisione canonica al builder
 * del draft e riflette l'esito del draft nei campi enrich usati dallo staging import.
 */
import { traceStep } from '../../utils/pipelineLogger.js'
import {
  parseIvaPercent,
  isNaturaFatturaPA,
  buildInitialDraftFromDocumento,
  pickPrimaryRiepilogoIva,
} from '../../shared/utils/primaNotaDraftFromDocumento.js'
import { parseItalianAmount } from '../../../domain/parseItalianAmount.js'

function nIva(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const it = parseItalianAmount(v)
  if (it != null) return it
  const x = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

function normalizeAliquotaForDraft(rawAliquota, natura, totIva) {
  let nextRaw = rawAliquota
  if ((nextRaw === '' || nextRaw == null) && totIva === 0) nextRaw = 0
  if (isNaturaFatturaPA(natura)) nextRaw = 0
  return nextRaw
}

function buildDraftIvaRowsByAliquotaMap(ivaRows) {
  const map = new Map()
  for (const row of Array.isArray(ivaRows) ? ivaRows : []) {
    const key = row?.aliquota
    if (key == null) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  }
  return map
}

function pickDraftCausaleIdForAliquota(ivaRowsByAliquota, aliquotaPct, fallbackId) {
  if (aliquotaPct == null) return fallbackId ?? null
  const list = ivaRowsByAliquota.get(aliquotaPct) || []
  return list.find((r) => r?.causale_iva_id)?.causale_iva_id ?? fallbackId ?? null
}

function applyDraftIvaResolutionToImportedData({ dati, primaNotaDraft, totalIva }) {
  const d = { ...(dati && typeof dati === 'object' ? dati : {}) }
  const ivaRowsByAliquota = buildDraftIvaRowsByAliquotaMap(primaNotaDraft?.ivaRows)
  const headerCausaleIvaId =
    primaNotaDraft?.meta?.causale_iva_id
    ?? primaNotaDraft?.ivaUi?.causale_iva_id
    ?? null

  const rie = (Array.isArray(d.riepilogo_iva) ? d.riepilogo_iva : []).map((r) => {
    const naturaR = String(r?.natura ?? r?.Natura ?? '').trim()
    const rawAliq = normalizeAliquotaForDraft(r?.aliquota ?? r?.Aliquota ?? '', naturaR, totalIva)
    const pct = parseIvaPercent(rawAliq)
    return {
      ...r,
      ...(isNaturaFatturaPA(naturaR) ? { aliquota: 0 } : {}),
      causale_iva_id: pickDraftCausaleIdForAliquota(ivaRowsByAliquota, pct, headerCausaleIvaId),
    }
  })

  const lines = (Array.isArray(d.linee) ? d.linee : []).map((l) => {
    const naturaL = String(l?.natura ?? l?.Natura ?? l?.codice_natura ?? l?.codiceNatura ?? '').trim()
    const rawAliq = normalizeAliquotaForDraft(
      l?.iva ?? l?.aliquota ?? l?.aliquotaIVA ?? l?.aliquota_iva ?? '',
      naturaL,
      totalIva
    )
    const pct = parseIvaPercent(rawAliq)
    return {
      ...l,
      ...(isNaturaFatturaPA(naturaL) ? { aliquota: 0, aliquota_iva: 0 } : {}),
      causale_iva_id: pickDraftCausaleIdForAliquota(ivaRowsByAliquota, pct, headerCausaleIvaId),
    }
  })

  return {
    enrichedDati: {
      ...d,
      riepilogo_iva: rie,
      linee: lines,
    },
    headerCausaleIvaId,
  }
}

/**
 * @param {object} params
 * @param {{ dati: Record<string, unknown>, tipo?: string, metodo?: string }} params.analisi
 * @param {string} params.tipoFinale - es. fattura_passiva
 * @param {string} params.societaId
 * @param {unknown[]} params.pianoConti
 * @param {unknown[]} params.causaliIva
 * @param {unknown[]} params.causaliContabili
 * @param {unknown[]} params.clienti
 * @param {Record<string, unknown>} [params.pipelineCtx]
 * @returns {Promise<{ enrichedDati: Record<string, unknown>, primaNotaDraft: object, headerCausaleIvaId: string | null } | null>}
 */
export async function runImportIvaAndDraftPipeline({
  analisi,
  tipoFinale,
  societaId,
  pianoConti,
  causaliIva,
  causaliContabili,
  clienti,
  pipelineCtx,
}) {
  if (tipoFinale !== 'fattura_passiva' && tipoFinale !== 'fattura_attiva') return null
  if (!Array.isArray(causaliIva) || causaliIva.length === 0) return null

  const d = { ...(analisi?.dati && typeof analisi.dati === 'object' ? analisi.dati : {}) }
  const totIva = nIva(d.iva)

  const rieSrc = Array.isArray(d.riepilogo_iva) ? d.riepilogo_iva : []
  const rie = rieSrc.map(r => (typeof r === 'object' && r ? { ...r } : {}))

  for (let i = 0; i < rie.length; i++) {
    const r = rie[i]
    const naturaR = String(r.natura ?? r.Natura ?? '').trim()
    const aliquotaForDraft = normalizeAliquotaForDraft(r.aliquota ?? r.Aliquota ?? '', naturaR, totIva)
    if (isNaturaFatturaPA(naturaR)) r.aliquota = 0
    traceStep(
      'IMPORT_IVA_NORMALIZE',
      {
        scope: 'import_riepilogo',
        index: i,
        aliquota: aliquotaForDraft,
        aliquota_percent: parseIvaPercent(aliquotaForDraft),
        natura: naturaR || null,
        policy: 'normalizzazione input per builder draft canonico',
      },
      { import_pipeline: true },
      pipelineCtx
    )
  }
  d.riepilogo_iva = rie

  const linesSrc = Array.isArray(d.linee) ? d.linee : []
  const lines = linesSrc.map(l => (typeof l === 'object' && l ? { ...l } : {}))

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const naturaL = String(l.natura ?? l.Natura ?? l.codice_natura ?? l.codiceNatura ?? '').trim()
    const aliqForDraft = normalizeAliquotaForDraft(
      l.iva ?? l.aliquota ?? l.aliquotaIVA ?? l.aliquota_iva ?? '',
      naturaL,
      totIva
    )
    if (isNaturaFatturaPA(naturaL)) {
      l.aliquota = 0
      l.aliquota_iva = 0
    }
    traceStep(
      'IMPORT_IVA_NORMALIZE',
      {
        scope: 'import_linea',
        index: i,
        aliquota: aliqForDraft,
        aliquota_percent: parseIvaPercent(aliqForDraft),
        natura: naturaL || null,
        policy: 'normalizzazione input per builder draft canonico',
      },
      { import_pipeline: true },
      pipelineCtx
    )
  }
  d.linee = lines

  const isAttiva = tipoFinale === 'fattura_attiva'
  const syntheticDoc = {
    id: null,
    filename: d.filename,
    tipo_documento: tipoFinale,
    imponibile: d.imponibile,
    iva: d.iva,
    totale: d.totale,
    data_documento: d.data,
    soggetto_denominazione: isAttiva ? d.cessionario_denom : d.cedente_denom,
    soggetto_piva: isAttiva ? d.cessionario_piva : d.cedente_piva,
    soggetto_cf: isAttiva ? d.cessionario_cf : d.cedente_cf,
    causale_iva_id: null,
    dati_estratti: {
      ...d,
      riepilogo_iva: rie,
      linee: lines,
      cedente_denominazione: d.cedente_denom,
      cedente_piva: d.cedente_piva,
      cedente_cf: d.cedente_cf,
      cessionario_denominazione: d.cessionario_denom,
      imponibile: d.imponibile,
      iva: d.iva,
      totale: d.totale,
      aliquota_iva: pickPrimaryRiepilogoIva(rie)?.aliquota ?? rie[0]?.aliquota,
    },
  }

  const primaNotaDraft = await buildInitialDraftFromDocumento(syntheticDoc, {
    societaId,
    pianoConti: pianoConti || [],
    causaliContabili: causaliContabili || [],
    causaliIva,
    clienti: clienti || [],
    pipelineContext: pipelineCtx,
  })

  const { enrichedDati, headerCausaleIvaId } = applyDraftIvaResolutionToImportedData({
    dati: d,
    primaNotaDraft,
    totalIva: totIva,
  })

  traceStep(
    'IMPORT_IVA_ADAPTER_FROM_DRAFT',
    {
      header_causale_iva_id: headerCausaleIvaId,
      iva_rows_count: Array.isArray(primaNotaDraft?.ivaRows) ? primaNotaDraft.ivaRows.length : 0,
    },
    { import_pipeline: true, canonical_source: 'buildInitialDraftFromDocumento' },
    pipelineCtx
  )

  return {
    enrichedDati,
    primaNotaDraft,
    headerCausaleIvaId,
  }
}
