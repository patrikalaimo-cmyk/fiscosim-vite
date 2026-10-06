import { normalizeText } from './utils.js'

function inferEsteroFlag(parsedDocument, direction) {
  const parsed = parsedDocument && typeof parsedDocument === 'object' ? parsedDocument : {}
  const fornitorePiva = normalizeText(parsed?.fornitore?.partitaIva)
  const clientePiva = normalizeText(parsed?.cliente?.partitaIva)

  const piva = direction === 'vendita' ? clientePiva : fornitorePiva
  if (!piva) return false
  if (/^IT/i.test(piva)) return false
  if (/^\d{11}$/.test(piva)) return false
  return true
}

function inferIvaPerCassaFlag(input, parsedDocument, sourceRow) {
  const parsed = parsedDocument && typeof parsedDocument === 'object' ? parsedDocument : {}
  const source = sourceRow && typeof sourceRow === 'object' ? sourceRow : {}
  const flags = parsed?.flags && typeof parsed.flags === 'object' ? parsed.flags : {}
  const candidates = [
    flags.ivaPerCassa,
    flags.cashAccounting,
    flags.regimeContabile,
    flags.regime_contabile,
    parsed?.regimeContabile,
    parsed?.regime_contabile,
    parsed?.regimeIva,
    parsed?.regime_iva,
    source?.regimeContabile,
    source?.regime_contabile,
    source?.regimeIva,
    source?.regime_iva,
    input?.regimeContabile,
    input?.regime_contabile,
    input?.regimeIva,
    input?.regime_iva,
  ]

  return candidates.some((value) => {
    const normalized = normalizeText(value).toLowerCase()
    return normalized === 'iva_cassa' || normalized === 'iva per cassa' || normalized === 'cassa' || normalized.includes('cash accounting')
  })
}

export function classifyCanonicalContabilitaScenario(input = {}, payload = null) {
  const sourceRow = input?.sourceRow && typeof input.sourceRow === 'object' ? input.sourceRow : {}
  const parsedDocument = input?.parsedDocument && typeof input.parsedDocument === 'object' ? input.parsedDocument : {}
  const flags = parsedDocument?.flags && typeof parsedDocument.flags === 'object' ? parsedDocument.flags : {}
  const document = payload?.document && typeof payload.document === 'object' ? payload.document : {}
  const direction = normalizeText(document.direction) || 'acquisto'
  const isRitenuta = Boolean(flags.hasRitenuta)
  const isReverseOrEstero = Boolean(flags.reverseCharge || flags.isForeign || flags.estero || inferEsteroFlag(parsedDocument, direction))
  const isSplitPayment = Boolean(flags.splitPayment)
  const isIvaPerCassa = inferIvaPerCassaFlag(input, parsedDocument, sourceRow)
  const isProfessional = Boolean(flags.isProfessional)

  if (isRitenuta) {
    return { code: 'ritenuta_professionista', label: 'Ritenuta / professionista', managed: false }
  }
  if (isProfessional) {
    return { code: 'professionista', label: 'Professionista', managed: true }
  }
  if (isReverseOrEstero) {
    return { code: 'reverse_o_autofattura_estera', label: 'Reverse / autofattura estera', managed: false }
  }
  if (isSplitPayment) {
    return { code: 'split_payment', label: 'Split payment', managed: true }
  }
  if (isIvaPerCassa) {
    return { code: 'iva_per_cassa', label: 'IVA per cassa', managed: false }
  }
  return { code: 'ordinario', label: 'Ordinario', managed: true }
}
