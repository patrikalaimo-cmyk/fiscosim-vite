import { traceStep } from '../src/utils/pipelineLogger.js'

export const IVA_ALIQUOTE_SUPPORTATE = Object.freeze([0, 4, 5, 10, 22])
export const IVA_REGIMI = Object.freeze({
  ORDINARIA: 'ordinaria',
  ESENTE: 'esente',
  NON_IMPONIBILE: 'non_imponibile',
  FUORI_CAMPO: 'fuori_campo',
  REVERSE_CHARGE: 'reverse_charge',
  SPLIT_PAYMENT: 'split_payment',
  UNKNOWN: 'unknown',
})

export function isNaturaFatturaPA(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '')
  if (!raw) return false
  return /^N\d+(?:\.\d+)*$/i.test(raw)
}

export function parseIvaPercent(aliquota) {
  if (aliquota === null || aliquota === undefined || aliquota === '') return null
  const raw = String(aliquota).trim().replace(/%/g, '').replace(/\s/g, '')
  if (isNaturaFatturaPA(raw)) return 0
  if (/^ESENTE$/i.test(raw) || /^NON\s*IMPONIBILE$/i.test(raw)) return 0
  const p = parseFloat(raw.replace(',', '.'))
  if (!Number.isFinite(p)) return null
  return Math.round(p)
}

export function normalizeAliquotaSupportata(raw) {
  const p = parseIvaPercent(raw)
  if (p === null) return null
  return IVA_ALIQUOTE_SUPPORTATE.includes(p) ? p : null
}

function normCausaleId(v) {
  if (!v) return null
  if (typeof v === 'string') {
    const s = v.trim()
    return s ? s : null
  }
  if (typeof v === 'object' && typeof v.id === 'string') {
    const s = v.id.trim()
    return s ? s : null
  }
  return null
}

export function isDefaultPerAliquotaFlag(v) {
  if (v === true || v === 1) return true
  if (v === false || v === 0 || v == null) return false
  const s = String(v).trim().toLowerCase()
  return s === 'true' || s === 't' || s === '1' || s === 'yes' || s === 'si'
}

function aliquotaCausaleEquals(c, percentuale) {
  const raw = c?.aliquota
  if (raw === null || raw === undefined || raw === '') return false
  const n = parseFloat(String(raw).replace(',', '.').replace(/%/g, ''))
  if (!Number.isFinite(n)) return false
  return Math.round(n) === percentuale
}

function okSuffixCodiceInterno(c, suffix) {
  if (!suffix || !c?.codice_interno) return false
  const s = String(c.codice_interno).trim()
  const m = s.match(/(\d+)\D*$/)
  return (m?.[1] || '') === suffix
}

function matchCausaleZeroByNatura(causaliIva, natura) {
  const nat = String(natura || '').trim().toUpperCase()
  if (!nat || !isNaturaFatturaPA(nat)) return null
  const list = Array.isArray(causaliIva) ? causaliIva : []
  const listAuto = list.filter((c) => c?.usa_per_automazione === true)
  const key = `${nat.replace(/\./g, '_')}_STANDARD`
  const byKey = listAuto.find(
    (c) => String(c?.codice_interno ?? '').trim().toUpperCase() === key
  )
  if (byKey?.id) return normCausaleId(byKey.id)

  const desc = (c) => String(c?.descrizione || '').toLowerCase()
  if (nat.startsWith('N4')) {
    const m4 = listAuto.find(
      (c) =>
        okSuffixCodiceInterno(c, '0') &&
        (/esente/i.test(c?.descrizione || '') || /art\.?\s*10/i.test(c?.descrizione || ''))
    )
    if (m4?.id) return normCausaleId(m4.id)
  }
  if (nat.startsWith('N1') || nat.startsWith('N2')) {
    const m12 = listAuto.find(
      (c) =>
        okSuffixCodiceInterno(c, '0') &&
        (/esclus/i.test(desc(c)) || /fuori\s*campo/i.test(desc(c)) || /non\s*sogg/i.test(desc(c)))
    )
    if (m12?.id) return normCausaleId(m12.id)
  }
  if (nat.startsWith('N3')) {
    const m3 = listAuto.find(
      (c) =>
        okSuffixCodiceInterno(c, '0') &&
        (/non\s*imp/i.test(desc(c)) || /art\.?\s*41/i.test(desc(c)))
    )
    if (m3?.id) return normCausaleId(m3.id)
  }
  return null
}

export class ResolveIvaError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'ResolveIvaError'
    this.details = details
  }
}

export function resolveIva({ conto, aliquota, causaliIva, natura, pipelineContext }) {
  if (!Array.isArray(causaliIva) || causaliIva.length === 0) {
    traceStep(
      'RESOLVE_IVA_EMPTY_CAUSALI_ERROR',
      { causaliIva_count: 0 },
      { resolve_iva_error: true },
      pipelineContext
    )
    throw new ResolveIvaError('Nessuna causale IVA in anagrafica.', { code: 'EMPTY_CAUSALI' })
  }

  const natStr = String(natura ?? '').trim()
  const forceZeroByNatura = isNaturaFatturaPA(natStr)

  if (conto?.causale_iva_id) {
    const want = String(conto.causale_iva_id).trim()
    const c0 = causaliIva.find(c => String(c?.id ?? '').trim() === want)
    if (c0) {
      if (!forceZeroByNatura || aliquotaCausaleEquals(c0, 0)) {
        return normCausaleId(c0.id)
      }
      traceStep(
        'RESOLVE_IVA_CONTO_SKIP_NATURA_ZERO',
        { causale_conto_id: want, natura: natStr },
        { resolve_iva_note: true },
        pipelineContext
      )
    }
  }

  let effectiveAliquota = aliquota
  if (forceZeroByNatura) effectiveAliquota = 0

  const percentuale = normalizeAliquotaSupportata(effectiveAliquota)
  if (percentuale === null) {
    traceStep(
      'RESOLVE_IVA_ALIQUOTA_NON_SUPPORTATA',
      { aliquota_raw: aliquota, effective_aliquota: effectiveAliquota, natura: natStr || null },
      { resolve_iva_error: true },
      pipelineContext
    )
    throw new ResolveIvaError(
      `Aliquota IVA non supportata o non determinata (ammesse: ${IVA_ALIQUOTE_SUPPORTATE.join(', ')}%).`,
      { code: 'ALIQUOTA_NON_SUPPORTATA', aliquota_percent: null }
    )
  }

  if (percentuale === 0 && forceZeroByNatura) {
    const byNat = matchCausaleZeroByNatura(causaliIva, natStr)
    if (byNat) {
      traceStep(
        'RESOLVE_IVA_FROM_NATURA',
        {
          aliquota: 0,
          natura: natStr,
          causale_id: byNat,
        },
        { resolve_iva_note: true },
        pipelineContext
      )
      return byNat
    }
  }

  const match = causaliIva.find(
    c => aliquotaCausaleEquals(c, percentuale) && isDefaultPerAliquotaFlag(c.is_default_per_aliquota)
  )

  if (!match) {
    const debugRows = (causaliIva || []).slice(0, 80).map(c => ({
      id: c?.id ?? null,
      aliquota: c?.aliquota,
      aliquota_round: Number.isFinite(parseFloat(String(c?.aliquota ?? '').replace(',', '.')))
        ? Math.round(parseFloat(String(c.aliquota).replace(',', '.')))
        : null,
      is_default_per_aliquota: c?.is_default_per_aliquota,
      tipo_default: typeof c?.is_default_per_aliquota,
    }))
    traceStep(
      'RESOLVE_IVA_NO_DEFAULT_ERROR',
      {
        aliquota: percentuale,
        causaliIva_count: causaliIva.length,
        candidati_stessa_aliquota: causaliIva.filter(c => aliquotaCausaleEquals(c, percentuale)).length,
        hint:
          'Serve una riga con aliquota coerente e predefinita attiva. Verifica tipo boolean/1 su is_default_per_aliquota e ricarica ContabilitÃ  dopo aver salvato in Impostazioni Procedure.',
        causali_iva_debug_sample: debugRows,
      },
      { resolve_iva_error: true },
      pipelineContext
    )
    throw new ResolveIvaError(
      `Nessuna causale IVA configurata per aliquota ${percentuale}. Vai in Impostazioni Procedure.`,
      { code: 'NO_DEFAULT', aliquota_percent: percentuale }
    )
  }

  traceStep(
    'RESOLVE_IVA_FROM_SETTINGS',
    {
      aliquota: percentuale,
      causale_id: match.id,
      codice_interno: match.codice_interno ?? null,
    },
    { resolve_iva_note: true },
    pipelineContext
  )

  return normCausaleId(match.id)
}

export function resolveIvaOrNull({ conto, aliquota, causaliIva, natura, pipelineContext }) {
  try {
    return resolveIva({ conto, aliquota, causaliIva, natura, pipelineContext }) || null
  } catch {
    return null
  }
}

function normalizeRegimeString(value) {
  return String(value ?? '').trim().toLowerCase()
}

function regimeFromNatura(natura) {
  const nat = String(natura ?? '').trim().toUpperCase()
  if (!nat || !isNaturaFatturaPA(nat)) return null
  if (nat.startsWith('N6')) return IVA_REGIMI.REVERSE_CHARGE
  if (nat.startsWith('N4')) return IVA_REGIMI.ESENTE
  if (nat.startsWith('N3')) return IVA_REGIMI.NON_IMPONIBILE
  if (nat.startsWith('N2') || nat.startsWith('N1')) return IVA_REGIMI.FUORI_CAMPO
  if (nat.startsWith('N5')) return IVA_REGIMI.ESENTE
  if (nat.startsWith('N7')) return IVA_REGIMI.NON_IMPONIBILE
  return null
}

function regimeFromCausale(causale) {
  if (!causale) return null
  if (causale.reverse_charge === true) return IVA_REGIMI.REVERSE_CHARGE
  const regIva = normalizeRegimeString(causale.regime_iva)
  if (regIva) {
    if (regIva.includes('imponibile')) return IVA_REGIMI.ORDINARIA
    if (regIva.includes('non imponibile')) return IVA_REGIMI.NON_IMPONIBILE
    if (regIva.includes('esente')) return IVA_REGIMI.ESENTE
    if (regIva.includes('escluso')) return IVA_REGIMI.FUORI_CAMPO
  }
  const reg = normalizeRegimeString(causale.regime)
  if (reg) {
    if (reg.includes('reverse')) return IVA_REGIMI.REVERSE_CHARGE
    if (reg.includes('split')) return IVA_REGIMI.SPLIT_PAYMENT
    if (reg.includes('non impon')) return IVA_REGIMI.NON_IMPONIBILE
    if (reg.includes('esente')) return IVA_REGIMI.ESENTE
    if (reg.includes('esclus')) return IVA_REGIMI.FUORI_CAMPO
  }
  const desc = normalizeRegimeString(causale.descrizione)
  if (desc.includes('reverse') || desc.includes('autofatt')) return IVA_REGIMI.REVERSE_CHARGE
  if (desc.includes('split payment') || desc.includes('split-payment')) return IVA_REGIMI.SPLIT_PAYMENT
  return null
}

export function classifyIvaRegime({ causale, natura, aliquota, splitPayment = false }) {
  if (splitPayment) return IVA_REGIMI.SPLIT_PAYMENT
  const byCausale = regimeFromCausale(causale)
  if (byCausale) return byCausale
  const byNatura = regimeFromNatura(natura)
  if (byNatura) return byNatura
  const aliq = parseIvaPercent(aliquota)
  if (aliq != null && aliq > 0) return IVA_REGIMI.ORDINARIA
  if (aliq === 0) return IVA_REGIMI.UNKNOWN
  return IVA_REGIMI.UNKNOWN
}

export function formatIvaRegimeLabel(regime) {
  switch (regime) {
    case IVA_REGIMI.ORDINARIA:
      return 'Ordinaria'
    case IVA_REGIMI.ESENTE:
      return 'Esente'
    case IVA_REGIMI.NON_IMPONIBILE:
      return 'Non imponibile'
    case IVA_REGIMI.FUORI_CAMPO:
      return 'Fuori campo'
    case IVA_REGIMI.REVERSE_CHARGE:
      return 'Reverse charge'
    case IVA_REGIMI.SPLIT_PAYMENT:
      return 'Split payment'
    default:
      return 'Regime IVA ?'
  }
}
