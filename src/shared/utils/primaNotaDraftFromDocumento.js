/**
 * Prima nota guidata: builder canonico del draft da documento.
 * La risoluzione IVA e' centralizzata in {@link ./resolveIva.js} e la composizione/decisione IVA
 * nel path documento -> draft passa da questo builder (import + contabilita').
 */
import { traceStep, traceIva } from '../../utils/pipelineLogger.js'
import {
  resolveIva,
  ResolveIvaError,
  parseIvaPercent,
  normalizeAliquotaSupportata,
  IVA_ALIQUOTE_SUPPORTATE,
  isNaturaFatturaPA,
  classifyIvaRegime,
} from './resolveIva.js'
import {
  extractAliquota,
  percentFromCodiceInterno,
  pickPrimaryRiepilogoIva,
  buildDraftRowsFromDocumentoValues,
  todayStr,
} from '../../../domain/primaNotaDraftPure.js'
import { getContoFornitore } from './primaNotaDraftLookups.js'

export {
  resolveIva,
  ResolveIvaError,
  parseIvaPercent,
  normalizeAliquotaSupportata,
  IVA_ALIQUOTE_SUPPORTATE,
  isNaturaFatturaPA,
}

export {
  extractAliquota,
  percentFromCodiceInterno,
  pickPrimaryRiepilogoIva,
  todayStr,
}

export const PN_GUIDATA_BUILDER_VERSION = '2026-04-03-iva-rows-multi'

function newIvaRowId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `iva-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function parsePercent(p) {
  if (p == null) return 0
  if (typeof p === 'number') return Number.isFinite(p) ? p : 0
  const s = String(p).trim().toLowerCase()
  const m = s.match(/(\d+(?:[.,]\d+)?)/)
  if (!m) return 0
  const x = parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

function isDetraibileFalse(v) {
  if (v === false || v === 0) return true
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'false' || s === '0' || s === 'no' || s === 'n' || s === 'off' || s === 'f'
}

function getPercDetraibileFromCausale(c) {
  if (!c) return 100
  if (isDetraibileFalse(c.detraibile)) return 0
  const det = parsePercent(c.percentuale_detraibilita)
  if (String(c.percentuale_detraibilita ?? '').trim() !== '') {
    return Math.max(0, Math.min(100, det))
  }
  const ind = parsePercent(c.percentuale_indetraibilita)
  return Math.max(0, Math.min(100, 100 - ind))
}

/**
 * Prima nota guidata: builder canonico del draft da documento.
 * La risoluzione IVA e' centralizzata in {@link ./resolveIva.js} e la composizione/decisione IVA
 * nel path documento -> draft passa da questo builder (import + contabilita').
 */
function buildIvaRowsFromRiepiloghi({
  riepilogoLista,
  imponibileDoc,
  ivaDoc,
  aliquotaDocRaw,
  naturaDocFallback,
  causaliIva,
  conto,
  splitPayment = false,
  pipelineContext,
}) {
  const n = (v) => {
    const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
    return Number.isFinite(x) ? x : 0
  }

  const rows = []

  const pushRow = (aliquotaNum, imponibileVal, ivaVal, rawAliquotaForResolve, naturaForResolve) => {
    let causale_iva_id = null
    let codice_interno = null
    let autoResolved = false
    let causaleObj = null
    try {
      causale_iva_id = resolveIva({
        conto,
        aliquota: rawAliquotaForResolve,
        natura: naturaForResolve,
        causaliIva,
        pipelineContext,
      })
      const c = causaliIva.find((x) => String(x?.id) === String(causale_iva_id))
      causaleObj = c || null
      codice_interno = c?.codice_interno ?? null
      autoResolved = true
      traceStep('IVA_ROW_RESOLVED', { aliquota: aliquotaNum, causale_iva_id }, {}, pipelineContext)
    } catch (e) {
      if (e instanceof ResolveIvaError) {
        traceStep(
          'IVA_ROW_RESOLVE_FAILED',
          { aliquota: aliquotaNum, error: e.message, code: e.details?.code },
          {},
          pipelineContext
        )
      } else {
        throw e
      }
    }
    rows.push({
      id: newIvaRowId(),
      aliquota: aliquotaNum,
      imponibile: Math.round(imponibileVal * 100) / 100,
      iva: Math.round(ivaVal * 100) / 100,
      causale_iva_id,
      codice_interno,
      autoResolved,
      natura: String(naturaForResolve ?? '').trim() || null,
      regime_iva: classifyIvaRegime({
        causale: causaleObj,
        natura: naturaForResolve,
        aliquota: aliquotaNum,
        splitPayment,
      }),
    })
  }

  if (Array.isArray(riepilogoLista) && riepilogoLista.length > 1) {
    for (const r of riepilogoLista) {
      const imp = n(r?.imponibile ?? r?.Imponibile)
      const tax = n(r?.imposta ?? r?.Imposta)
      const naturaR = String(r?.natura ?? r?.Natura ?? '').trim()
      let rawAliq = r?.aliquota ?? r?.Aliquota
      let aliquotaNum = parseIvaPercent(rawAliq)
      if (isNaturaFatturaPA(naturaR)) {
        aliquotaNum = 0
        rawAliq = 0
      }
      if (aliquotaNum === null) continue
      if (imp <= 0 && tax <= 0) continue
      pushRow(aliquotaNum, imp, tax, rawAliq, naturaR)
    }
  } else if (Array.isArray(riepilogoLista) && riepilogoLista.length === 1) {
    const r0 = riepilogoLista[0]
    const impR = n(r0?.imponibile ?? r0?.Imponibile)
    const taxR = n(r0?.imposta ?? r0?.Imposta)
    const naturaR = String(r0?.natura ?? r0?.Natura ?? '').trim()
    let rawAliq = r0?.aliquota ?? r0?.Aliquota
    const impUse = impR > 0 || taxR > 0 ? impR : imponibileDoc
    const taxUse = impR > 0 || taxR > 0 ? taxR : ivaDoc
    let aliquotaNum = parseIvaPercent(rawAliq)
    if (isNaturaFatturaPA(naturaR)) {
      aliquotaNum = 0
      rawAliq = 0
    }
    if (aliquotaNum !== null && (impUse > 0 || taxUse > 0)) {
      pushRow(aliquotaNum, impUse, taxUse, rawAliq, naturaR)
    }
  }

  if (rows.length === 0) {
    const rawAliq = aliquotaDocRaw
    const naturaFb = String(naturaDocFallback ?? '').trim()
    let aliquotaNum = parseIvaPercent(rawAliq)
    if (isNaturaFatturaPA(naturaFb)) {
      aliquotaNum = 0
    }
    if (aliquotaNum !== null && (imponibileDoc > 0 || ivaDoc > 0)) {
      const rawForResolve = isNaturaFatturaPA(naturaFb) ? 0 : rawAliq
      pushRow(aliquotaNum, imponibileDoc, ivaDoc, rawForResolve, naturaFb)
    } else if ((imponibileDoc > 0 || ivaDoc > 0) && aliquotaNum === null) {
      traceStep(
        'IVA_ROWS_SKIP_NO_ALIQUOTA',
        { imponibileDoc, ivaDoc, aliquotaDocRaw: rawAliq },
        {},
        pipelineContext
      )
    }
  }

  rows.sort((a, b) => a.aliquota - b.aliquota)
  traceStep('IVA_ROWS_INIT', { ivaRows: rows }, { count: rows.length }, pipelineContext)
  return rows
}

/**
 * Prima nota guidata: builder canonico del draft da documento.
 * La risoluzione IVA e' centralizzata in {@link ./resolveIva.js} e la composizione/decisione IVA
 * nel path documento -> draft passa da questo builder (import + contabilita').
 */
export async function buildInitialDraftFromDocumento(
  doc,
  {
    societaId = null,
    pianoConti = [],
    causaliContabili = [],
    causaliIva = [],
    clienti = [],
    pipelineContext,
  } = {}
) {
  const datiEst = doc?.dati_estratti
    ? (typeof doc.dati_estratti === 'string' ? JSON.parse(doc.dati_estratti) : doc.dati_estratti)
    : {}

  traceStep('BUILDER_INPUT', {
    documento_id: doc?.id,
    tipo_documento: doc?.tipo_documento,
    filename: doc?.filename,
    has_dati_estratti: !!doc?.dati_estratti,
    linee_count: Array.isArray(datiEst?.linee) ? datiEst.linee.length : 0,
  }, { builder_version: PN_GUIDATA_BUILDER_VERSION }, pipelineContext)

  const n = (v) => {
    const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
    return Number.isFinite(x) ? x : 0
  }

  const imponibile = n(doc?.imponibile ?? datiEst?.imponibile)
  const iva = n(doc?.iva ?? datiEst?.iva ?? datiEst?.imposta)
  const totaleRaw = n(doc?.totale ?? datiEst?.totale)
  const totale = totaleRaw > 0 ? totaleRaw : Math.round((imponibile + iva) * 100) / 100
  const causaleIvaBaseId = (datiEst?.causale_iva_id ?? doc?.causale_iva_id ?? '')

  const dataReg = doc?.data_documento || datiEst?.data_documento || todayStr()
  const isPassiva = !!doc?.tipo_documento?.includes?.('passiva')

  const soggettoDen = doc?.soggetto_denominazione || datiEst?.cedente_denominazione || datiEst?.soggetto_denominazione || ''
  const contoStoricoId = await getContoFornitore({ societaId, soggettoDenominazione: soggettoDen })
  const pivaSoggetto = doc?.soggetto_piva || datiEst?.cedente_piva || datiEst?.soggetto_piva || ''
  const contoBySoggettoObj = soggettoDen
    ? (pianoConti.find(c => String(c?.descrizione || '').trim() === String(soggettoDen).trim()) || null)
    : null
  const isLikelyFornitoreAccount = !!(contoBySoggettoObj && (
    contoBySoggettoObj.is_fornitore === true ||
    (pivaSoggetto && (contoBySoggettoObj.partita_iva === pivaSoggetto || contoBySoggettoObj.anagrafica_piva === pivaSoggetto))
  ))
  const contoBySoggetto = (!isLikelyFornitoreAccount && contoBySoggettoObj) ? contoBySoggettoObj.id : ''
  const contoFallback = pianoConti.find(c => String(c?.codice || '').trim().toUpperCase() === 'COSTI_DA_CLASSIFICARE')?.id || ''
  const contoCostoRicavoId = contoStoricoId || contoBySoggetto || contoFallback || ''

  const contoIva = pianoConti.find(c =>
    c?.is_iva && c?.livello >= 3 &&
    (isPassiva ? /credito/i.test(c?.descrizione || '') : /debito/i.test(c?.descrizione || ''))
  ) || null

  const contoControparte = (
    (pivaSoggetto
      ? pianoConti.find(c => (c?.partita_iva === pivaSoggetto || c?.anagrafica_piva === pivaSoggetto) && c?.livello >= 3)
      : null)
    || (soggettoDen
      ? pianoConti.find(c => String(c?.descrizione || '').trim() === String(soggettoDen).trim() && c?.livello >= 3)
      : null)
    || pianoConti.find(c => (isPassiva ? c?.is_fornitore : c?.is_cliente) && c?.livello >= 4)
    || null
  )

  const riepilogoLista = Array.isArray(datiEst?.riepilogo_iva) ? datiEst.riepilogo_iva : []
  const riepilogo0 = pickPrimaryRiepilogoIva(riepilogoLista) || null
  const naturaPrim = String(riepilogo0?.natura ?? riepilogo0?.Natura ?? datiEst?.natura ?? '').trim()
  let aliquotaIva = doc?.aliquota_iva ?? riepilogo0?.aliquota ?? datiEst?.aliquota_iva ?? ''
  if ((aliquotaIva === '' || aliquotaIva == null) && iva === 0) aliquotaIva = 0
  if (isNaturaFatturaPA(naturaPrim)) aliquotaIva = 0
  const contoCosto = pianoConti.find(c => c?.id === contoCostoRicavoId) || null
  const pct = parseIvaPercent(aliquotaIva)
  traceStep('RESOLVE_IVA_INPUT', {
    conto_costo_id: contoCostoRicavoId,
    aliquota: aliquotaIva,
    aliquota_percent: pct,
    natura: naturaPrim || null,
    riepilogo_iva_count: riepilogoLista.length,
    riepilogo_primary_by_imponibile: riepilogoLista.length > 1,
    policy:
      'conto.causale_iva_id (se coerente con 0%) â†’ natura FatturaPA â†’ default per aliquota (Impostazioni Procedure)',
    causaliIva_count: causaliIva?.length ?? 0,
  }, { context: 'buildInitialDraftFromDocumento' }, pipelineContext)

  let causaleIvaId = null
  try {
    causaleIvaId = resolveIva({
      conto: contoCosto,
      aliquota: aliquotaIva,
      natura: naturaPrim,
      causaliIva,
      pipelineContext,
    })
    traceIva('POST_RESOLVE_IVA', 'builder', causaleIvaId, pipelineContext)
    traceStep('RESOLVE_IVA_OUTPUT', {
      causale_iva_id: causaleIvaId,
      causale_iva_id_typeof: typeof causaleIvaId,
    }, { context: 'buildInitialDraftFromDocumento' }, pipelineContext)
  } catch (e) {
    if (e instanceof ResolveIvaError) {
      traceStep('RESOLVE_IVA_PRIMARY_FAILED', { message: e.message, details: e.details }, {}, pipelineContext)
      causaleIvaId = null
    } else {
      throw e
    }
  }

  const causale = (
    (isPassiva
      ? causaliContabili.find(c => String(c?.codice || '').toUpperCase() === 'FF')
      : causaliContabili.find(c => String(c?.codice || '').toUpperCase() === 'FC'))
    || (isPassiva
      ? causaliContabili.find(c => /FF|fatt.*forn/i.test(String((c?.codice || '') + (c?.descrizione || ''))))
      : causaliContabili.find(c => /FC|fatt.*cli/i.test(String((c?.codice || '') + (c?.descrizione || '')))))
  )

  const cf = (doc?.soggetto_cf || datiEst?.cedente_cf || datiEst?.soggetto_cf || '').toUpperCase()
  const clienteMatch = clienti.find(x =>
    (pivaSoggetto && (x?.partita_iva === pivaSoggetto)) ||
    (cf && (String(x?.codice_fiscale || '').toUpperCase() === cf))
  ) || null
  const splitPayment = !isPassiva && clienteMatch?.split_payment === true

  const soggettoNome =
    doc?.soggetto_denominazione
    || datiEst?.cedente_denominazione
    || datiEst?.soggetto_denominazione
    || ''

  const rows = buildDraftRowsFromDocumentoValues({
    riepilogoLista,
    imponibile,
    iva,
    contoCostoRicavoId,
    contoIvaId: contoIva?.id || '',
    soggettoNome,
  })

  if (totale > 0) {
    rows.push({
      conto_id: contoControparte?.id || '',
      descrizione: soggettoNome || 'Fornitore',
      dare: '',
      avere: totale
    })
  }

  if (rows.length === 0) {
    rows.push({ conto_id: contoCostoRicavoId || '', descrizione: 'Imponibile', dare: 0, avere: '' })
    rows.push({ conto_id: contoIva?.id || '', descrizione: 'IVA', dare: 0, avere: '' })
    rows.push({ conto_id: contoControparte?.id || '', descrizione: soggettoNome || 'Fornitore', dare: '', avere: 0 })
  }

  if (Array.isArray(datiEst.linee) && datiEst.linee.length > 0) {
    datiEst.linee.forEach((linea, rowIndex) => {
      traceStep('BUILDER_ROW_TRANSFORM', { rowIndex, linea }, { rowIndex }, pipelineContext)
    })
  }

  const ivaRows = buildIvaRowsFromRiepiloghi({
    riepilogoLista,
    imponibileDoc: imponibile,
    ivaDoc: iva,
    aliquotaDocRaw: aliquotaIva,
    naturaDocFallback: datiEst?.natura,
    causaliIva,
    conto: contoCosto,
    splitPayment,
    pipelineContext,
  })

  const sumImpUi = ivaRows.reduce((s, r) => s + r.imponibile, 0)
  const sumTaxUi = ivaRows.reduce((s, r) => s + r.iva, 0)
  const ivaTotals = ivaRows.reduce(
    (acc, r) => {
      const causale = causaliIva.find((c) => String(c?.id) === String(r?.causale_iva_id))
      const percDet = getPercDetraibileFromCausale(causale)
      const rowIva = n(r?.iva)
      const rowInd = Math.round((rowIva * (100 - percDet) / 100) * 100) / 100
      acc.iva += rowIva
      acc.indetraibile += rowInd
      return acc
    },
    { iva: 0, indetraibile: 0 }
  )

  const primRForMeta = pickPrimaryRiepilogoIva(riepilogoLista)
  const primNatForMeta = String(primRForMeta?.natura ?? primRForMeta?.Natura ?? datiEst?.natura ?? '').trim()
  const primAliqPctForMeta = isNaturaFatturaPA(primNatForMeta)
    ? 0
    : (primRForMeta ? parseIvaPercent(primRForMeta?.aliquota) : pct)
  const primaryIvaRow =
    primAliqPctForMeta != null
      ? ivaRows.find((r) => r.aliquota === primAliqPctForMeta)
      : null
  const primaryForMeta = primaryIvaRow || ivaRows[0]
  const baseCausaleDoc = causaleIvaBaseId && String(causaleIvaBaseId).trim() ? String(causaleIvaBaseId).trim() : null
  const metaCausaleIva = primaryForMeta?.causale_iva_id ?? causaleIvaId ?? baseCausaleDoc

  const primImpUi = riepilogo0 ? n(riepilogo0?.imponibile ?? riepilogo0?.Imponibile) : imponibile
  const primTaxUi = riepilogo0 ? n(riepilogo0?.imposta ?? riepilogo0?.Imposta) : iva
  const primAliqUi = pct != null ? pct : (iva === 0 && primTaxUi === 0 ? 0 : null)
  const percDetPrim = getPercDetraibileFromCausale(
    causaliIva.find((c) => String(c?.id) === String(primaryForMeta?.causale_iva_id ?? causaleIvaId))
  )
  const percDetFinal = (() => {
    if (ivaRows.length > 0) {
      if (ivaTotals.iva > 0) {
        const pctDet = Math.round(((ivaTotals.iva - ivaTotals.indetraibile) / ivaTotals.iva) * 10000) / 100
        return Math.max(0, Math.min(100, pctDet))
      }
      return percDetPrim
    }
    return percDetPrim
  })()
  const ivaIndetraibileFinal = ivaRows.length > 0
    ? Math.round(ivaTotals.indetraibile * 100) / 100
    : Math.round((primTaxUi * (100 - percDetFinal) / 100) * 100) / 100
  const regimePrim = classifyIvaRegime({
    causale: causaliIva.find((c) => String(c?.id) === String(primaryForMeta?.causale_iva_id ?? causaleIvaId)),
    natura: primNatForMeta,
    aliquota: primAliqUi,
    splitPayment,
  })
  const regimeFinal = (() => {
    if (!ivaRows.length) return regimePrim
    const regimes = ivaRows.map(r => r.regime_iva || null).filter(Boolean)
    if (!regimes.length) return regimePrim
    const uniq = Array.from(new Set(regimes))
    return uniq.length === 1 ? uniq[0] : 'misto'
  })()

  const draft = {
    stato: 'bozza',
    header: {
      data_registrazione: dataReg,
      causale_id: causale?.id || '',
      cliente_fornitore_id: clienteMatch?.id || ''
    },
    ivaUi: {
      causale_iva_id: primaryForMeta?.causale_iva_id ?? causaleIvaId ?? null,
      imponibile: ivaRows.length > 0 ? sumImpUi : primImpUi,
      iva: ivaRows.length > 0 ? sumTaxUi : primTaxUi,
      aliquota: primAliqUi,
      percDetraibile: percDetFinal,
      ivaIndetraibile: ivaIndetraibileFinal,
      regime_iva: regimeFinal,
      label: '',
      multi_riepilogo: riepilogoLista.length > 1
    },
    meta: {
      documento_import_id: doc?.id || null,
      causale_iva_id: metaCausaleIva || null,
      builder_version: PN_GUIDATA_BUILDER_VERSION
    },
    ivaRows,
    rows
  }
  traceStep('BUILDER_OUTPUT', draft, { rows_count: draft.rows.length }, pipelineContext)
  traceIva('BUILDER_OUTPUT', 'builder', draft.ivaUi?.causale_iva_id ?? draft.meta?.causale_iva_id ?? null, pipelineContext)
  return draft
}

