/**
 * Dopo DOCUMENT_NORMALIZED: risolve IVA per riepiloghi/righe, builder prima nota guidata, log pipeline.
 */
import { traceStep } from '../../utils/pipelineLogger.js'
import {
  resolveIva,
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

/**
 * @param {object} params
 * @param {{ dati: Record<string, unknown>, tipo?: string, metodo?: string }} params.analisi
 * @param {string} params.tipoFinale — es. fattura_passiva
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
    let aliquotaForResolve = r.aliquota ?? r.Aliquota ?? ''
    if ((aliquotaForResolve === '' || aliquotaForResolve == null) && totIva === 0) aliquotaForResolve = 0
    if (isNaturaFatturaPA(naturaR)) {
      aliquotaForResolve = 0
      r.aliquota = 0
    }
    const pct = parseIvaPercent(aliquotaForResolve)
    traceStep(
      'RESOLVE_IVA_INPUT',
      {
        scope: 'import_riepilogo',
        index: i,
        aliquota: aliquotaForResolve,
        aliquota_percent: pct,
        natura: naturaR || null,
        policy: 'natura FatturaPA → 0% → causale da natura o default Impostazioni Procedure',
        conto_id: null,
        causaliIva_count: causaliIva.length,
      },
      { import_pipeline: true },
      pipelineCtx
    )
    const id = resolveIva({
      conto: null,
      aliquota: aliquotaForResolve,
      natura: naturaR,
      causaliIva,
      pipelineContext: pipelineCtx,
    })
    traceStep(
      'RESOLVE_IVA_OUTPUT',
      {
        scope: 'import_riepilogo',
        index: i,
        causale_iva_id: id,
        causale_iva_id_typeof: typeof id,
      },
      { import_pipeline: true },
      pipelineCtx
    )
    r.causale_iva_id = id || null
  }
  d.riepilogo_iva = rie

  const linesSrc = Array.isArray(d.linee) ? d.linee : []
  const lines = linesSrc.map(l => (typeof l === 'object' && l ? { ...l } : {}))

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const naturaL = String(l.natura ?? l.Natura ?? l.codice_natura ?? l.codiceNatura ?? '').trim()
    let aliqRaw = l.iva ?? l.aliquota ?? l.aliquotaIVA ?? l.aliquota_iva ?? ''
    if ((aliqRaw === '' || aliqRaw == null) && totIva === 0) aliqRaw = 0
    if (isNaturaFatturaPA(naturaL)) {
      aliqRaw = 0
      l.aliquota = 0
      l.aliquota_iva = 0
    }
    const pctLine = parseIvaPercent(aliqRaw)
    traceStep(
      'RESOLVE_IVA_INPUT',
      {
        scope: 'import_linea',
        index: i,
        aliquota: aliqRaw,
        aliquota_percent: pctLine,
        natura: naturaL || null,
        policy: 'natura FatturaPA → 0% → causale da natura o default Impostazioni Procedure',
        conto_id: null,
        causaliIva_count: causaliIva.length,
      },
      { import_pipeline: true },
      pipelineCtx
    )
    const id = resolveIva({
      conto: null,
      aliquota: aliqRaw,
      natura: naturaL,
      causaliIva,
      pipelineContext: pipelineCtx,
    })
    traceStep(
      'RESOLVE_IVA_OUTPUT',
      {
        scope: 'import_linea',
        index: i,
        causale_iva_id: id,
        causale_iva_id_typeof: typeof id,
      },
      { import_pipeline: true },
      pipelineCtx
    )
    l.causale_iva_id = id || null
  }
  d.linee = lines

  const nImpRie = (r) => {
    const raw = r?.imponibile ?? r?.Imponibile ?? ''
    const it = parseItalianAmount(raw)
    if (it != null) return it
    const x = parseFloat(String(raw).replace(',', '.'))
    return Number.isFinite(x) ? x : 0
  }
  const rieConCausale = rie.filter(r => r.causale_iva_id)
  const headerCausaleIvaId =
    (rieConCausale.length
      ? [...rieConCausale].sort((a, b) => nImpRie(b) - nImpRie(a))[0]?.causale_iva_id
      : null)
    || rie.map(x => x.causale_iva_id).find(Boolean)
    || lines.map(x => x.causale_iva_id).find(Boolean)
    || null

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
    causale_iva_id: headerCausaleIvaId,
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

  return {
    enrichedDati: d,
    primaNotaDraft,
    headerCausaleIvaId,
  }
}
