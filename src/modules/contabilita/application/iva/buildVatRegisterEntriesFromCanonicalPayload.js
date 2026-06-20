import { normalizeText, round2 } from '../canonical_mapper/utils.js'

const ORDINARY_CAUSALE_TYPES = new Set([
  'docivanormale',
  'documentoiva',
  'fatturadocumentoiva',
  'notacredito',
])

const SPECIAL_CAUSALE_TYPES = new Set([
  'autofattura',
  'docivaacqcee',
  'documentoivaacqcee',
  'docivaesigdifferita',
  'documentoivaesigdifferita',
  'pagincivaesigdiff',
  'pagamentoincassivaesigdiff',
  'movimentosolaiva',
  'solaiva',
  'soloiva',
])

const OPERATION_CASES = new Map([
  ['fatturaattiva', { registerType: 'vendite', sign: '+', caseType: 'fattura_attiva' }],
  ['fatturapassiva', { registerType: 'acquisti', sign: '+', caseType: 'fattura_passiva' }],
  ['notacreditoattiva', { registerType: 'vendite', sign: '-', caseType: 'nota_credito_attiva' }],
  ['notacreditopassiva', { registerType: 'acquisti', sign: '-', caseType: 'nota_credito_passiva' }],
])

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function normalizeRegisterType(value) {
  const key = normalizeKey(value)
  if (key === 'acquisti' || key === 'acquisto' || key === '01') return 'acquisti'
  if (key === 'vendite' || key === 'vendita' || key === '02') return 'vendite'
  return ''
}

function normalizeSign(value) {
  const key = normalizeKey(value)
  if (value === '+' || key === 'somma' || key === 'positivo') return '+'
  if (value === '-' || key === 'sottrae' || key === 'negativo') return '-'
  return ''
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function signedAmount(value, multiplier) {
  return round2(Math.abs(numberOrZero(value)) * multiplier)
}

function getCausale(payload) {
  return payload?.header?.causaleContabile && typeof payload.header.causaleContabile === 'object'
    ? payload.header.causaleContabile
    : {}
}

function getTechnicalCausaleType(causale) {
  return normalizeKey(causale?.tipo_causale || causale?.tipoCausale)
}

function getTechnicalOperation(causale, payload) {
  const candidates = [
    causale?.operazione_gestita,
    causale?.operazioneGestita,
    causale?.tipo_documento,
    causale?.tipoDocumento,
    payload?.fiscalContext?.tipoOperazione,
    payload?.document?.tipoDocumento,
  ]
  for (const candidate of candidates) {
    const key = normalizeKey(candidate)
    if (OPERATION_CASES.has(key)) return OPERATION_CASES.get(key)
  }
  return null
}

function isSpecialVatPosting(payload, causaleType) {
  const vat = payload?.vat || {}
  const fiscalContext = payload?.fiscalContext || {}
  const rows = Array.isArray(vat.rows) ? vat.rows : []
  return Boolean(
    SPECIAL_CAUSALE_TYPES.has(causaleType) ||
    vat.splitPayment ||
    vat.reverseCharge ||
    vat.ivaPerCassa ||
    vat.autofattura ||
    vat.integrazioneEstero ||
    fiscalContext.splitPayment ||
    fiscalContext.reverseCharge ||
    fiscalContext.ivaPerCassa ||
    rows.some((row) => (
      row?.splitPayment ||
      row?.reverseCharge ||
      row?.ivaPerCassa ||
      ['differita', 'rilascio'].includes(normalizeKey(row?.esigibilita))
    ))
  )
}

function buildBlockingError(messages) {
  const blockers = Array.from(new Set(messages.filter(Boolean)))
  const error = new Error(blockers.join('; ') || 'Generazione registri IVA ordinari bloccata')
  error.code = 'VAT_REGISTER_ENTRIES_BLOCKED'
  error.details = { blockers }
  return error
}

function resolveCase({ causaleType, operationCase, registerType, sign }) {
  const inferred = {
    caseType: sign === '-'
      ? (registerType === 'vendite' ? 'nota_credito_attiva' : 'nota_credito_passiva')
      : (registerType === 'vendite' ? 'fattura_attiva' : 'fattura_passiva'),
    registerType,
    sign,
  }

  const resolvedCase = operationCase || inferred
  const isCreditNote = resolvedCase.caseType.startsWith('nota_credito') || causaleType === 'notacredito'
  if (isCreditNote && sign !== '-') {
    throw buildBlockingError(['Nota credito IVA ordinaria configurata senza segno sottrattivo'])
  }
  if (!isCreditNote && sign !== '+') {
    throw buildBlockingError(['Documento IVA ordinario configurato con segno sottrattivo senza tipo nota credito'])
  }
  if (
    operationCase &&
    (operationCase.registerType !== registerType || operationCase.sign !== sign)
  ) {
    throw buildBlockingError(['Operazione gestita, registro IVA e segno registro non sono coerenti'])
  }

  return resolvedCase
}

function resolveDetraibilita(row, ivaAmount) {
  const pctSource = row?.detraibilitaPercent ?? row?.percentualeDetraibilita
  const explicitDetraibile = row?.ivaDetraibile ?? row?.ivaDetratta ?? row?.iva_detraibile
  const explicitIndetraibile = row?.indetraibileAmount ?? row?.ivaIndetraibile
  const ivaAssoluta = Math.abs(ivaAmount)
  const ivaDetraibile = Number.isFinite(Number(explicitDetraibile))
    ? Math.min(ivaAssoluta, Math.abs(numberOrZero(explicitDetraibile)))
    : null
  const ivaIndetraibile = Number.isFinite(Number(explicitIndetraibile))
    ? Math.min(Math.abs(ivaAmount), Math.abs(numberOrZero(explicitIndetraibile)))
    : (ivaDetraibile !== null ? round2(ivaAssoluta - ivaDetraibile) : null)
  const pct = Number.isFinite(Number(pctSource))
    ? Math.min(100, Math.max(0, Number(pctSource)))
    : (ivaAssoluta > 0 && ivaDetraibile !== null ? round2(ivaDetraibile / ivaAssoluta * 100) : 100)
  const resolvedIndetraibile = ivaIndetraibile !== null
    ? ivaIndetraibile
    : round2(ivaAssoluta * Math.max(0, 100 - pct) / 100)
  return {
    pct,
    ivaDetraibile: round2(ivaAssoluta - resolvedIndetraibile),
    ivaIndetraibile: round2(resolvedIndetraibile),
  }
}

export function buildVatRegisterEntriesFromCanonicalPayload(payload = {}, options = {}) {
  const shouldCreateIva = payload?.postCommitTargets?.shouldCreateIva === true
  const vat = payload?.vat || {}
  const rows = Array.isArray(vat.rows) ? vat.rows : []

  if (!shouldCreateIva || vat.enabled === false || rows.length === 0) {
    return { handled: true, entries: [], reason: 'iva_not_required' }
  }

  const causale = getCausale(payload)
  const causaleType = getTechnicalCausaleType(causale)
  if (isSpecialVatPosting(payload, causaleType)) {
    return { handled: false, entries: [], reason: 'special_vat_posting' }
  }
  if (!ORDINARY_CAUSALE_TYPES.has(causaleType)) {
    throw buildBlockingError(['Tipo causale tecnico IVA ordinario mancante o non gestito'])
  }

  const configuredRegister = normalizeRegisterType(
    vat.registerType ||
    payload?.fiscalContext?.tipoRegistro ||
    causale?.codice_registro_iva ||
    causale?.registroIva ||
    causale?.registro_iva
  )
  if (!configuredRegister) {
    throw buildBlockingError(['Registro IVA ordinario mancante o non valido'])
  }

  const configuredSign = normalizeSign(
    vat.segnoRegistro ||
    vat.segnoRegistroIva ||
    causale?.segno_registro_iva ||
    causale?.segnoRegistroIva
  )
  const operationCase = getTechnicalOperation(causale, payload)
  const context = options?.persistenceContext || {}

  const entries = rows.map((row, index) => {
    const registerType = normalizeRegisterType(row?.registerType || row?.registroIva || configuredRegister)
    if (!registerType) {
      throw buildBlockingError([`Registro IVA mancante o non valido alla riga ${index + 1}`])
    }
    if (registerType !== configuredRegister) {
      throw buildBlockingError([`Registro IVA incoerente alla riga ${index + 1}`])
    }

    const sign = normalizeSign(row?.segnoRegistro || row?.segnoRegistroIva || configuredSign)
    if (!sign) {
      throw buildBlockingError([`Segno registro IVA mancante o non valido alla riga ${index + 1}`])
    }
    const vatCase = resolveCase({ causaleType, operationCase, registerType, sign })
    const multiplier = sign === '-' ? -1 : 1
    const imponibile = signedAmount(row?.imponibile, multiplier)
    const iva = signedAmount(row?.imposta ?? row?.iva, multiplier)
    const totale = round2(imponibile + iva)
    const detraibilita = resolveDetraibilita(row, iva)
    const esigibilita = ['immediata', 'differita', 'rilascio'].includes(normalizeKey(row?.esigibilita))
      ? normalizeKey(row.esigibilita)
      : 'immediata'

    const subjectsList = Array.isArray(payload?.subjects) ? payload.subjects : []
    const subj = subjectsList.find(s => s.role === 'primary') || subjectsList.find(s => s.role === 'counterparty')
    const resolvedPiva = subj ? (subj.partitaIva || subj.codiceFiscale || '') : ''
    const resolvedDenom = (subj ? subj.denominazione : '') || context.cliente_fornitore_nome || null

    return {
      documento_id: context.numero_documento || payload?.document?.numeroDocumento || 'manual-reg-doc',
      riga_idx: index,
      data: context.data_documento || payload?.document?.dataDocumento || context.data_registrazione || payload?.fiscalContext?.dataRegistrazione || null,
      imponibile,
      iva,
      totale,
      aliquota: Number.isFinite(Number(row?.aliquota)) ? Number(row.aliquota) : null,
      tipo: registerType === 'vendite' ? 'vendita' : 'acquisto',
      registerType,
      segnoRegistro: sign,
      caseType: vatCase.caseType,
      detraibile: detraibilita.pct > 0,
      percentuale_detraibilita: detraibilita.pct,
      iva_detraibile: round2(detraibilita.ivaDetraibile * multiplier),
      iva_indetraibile: round2(detraibilita.ivaIndetraibile * multiplier),
      causale_iva_id: normalizeText(row?.causaleIvaId || row?.causale_iva_id),
      societa_id: context.societa_id || payload?.company?.societaId || null,
      numero_documento: context.numero_documento || payload?.document?.numeroDocumento || null,
      data_documento: context.data_documento || payload?.document?.dataDocumento || null,
      soggetto_denominazione: resolvedDenom,
      soggetto_piva: resolvedPiva || null,
      esigibilita,
      origin_registro_iva_id: normalizeText(row?.origin_registro_iva_id || row?.originRegistroIvaId) || null,
    }
  })

  return { handled: true, entries, reason: 'ordinary_vat_posting' }
}
