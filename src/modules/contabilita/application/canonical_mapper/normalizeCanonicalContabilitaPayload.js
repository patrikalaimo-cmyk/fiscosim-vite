import { classifyCanonicalContabilitaScenario } from './classifyCanonicalContabilitaScenario.js'
import { buildCanonicalContabilitaReadiness } from './buildCanonicalContabilitaReadiness.js'
import { normalizeText, round2 } from './utils.js'

function buildMissingRequiredFields(normalized) {
  const missing = []
  if (!normalized.company.societaId) missing.push('company.societaId')
  if (!normalized.document.number) missing.push('document.number')
  if (!normalized.document.documentDate) missing.push('document.documentDate')
  if (!normalized.document.registrationDate) missing.push('document.registrationDate')
  if (!normalized.document.counterparty.accountId) missing.push('document.counterparty.accountId')
  if (!normalized.document.counterparty.name) missing.push('document.counterparty.name')
  if (!normalized.accounting.causaleContabile.id && !normalized.accounting.causaleContabile.code) missing.push('accounting.causaleContabile')
  if (!Array.isArray(normalized.accounting.rows) || normalized.accounting.rows.length === 0) missing.push('accounting.rows')
  return missing
}

function validateNormalizedPayload(normalized) {
  const blockers = []
  const warnings = []

  if (!normalized.company.societaId) blockers.push('societaId mancante')
  if (!normalized.document.number) blockers.push('numero documento mancante')
  if (!normalized.document.documentDate) blockers.push('data documento mancante')
  if (!normalized.document.registrationDate) blockers.push('data registrazione mancante')
  if (!normalized.document.counterparty.accountId) blockers.push('conto controparte mancante')
  if (!normalized.document.counterparty.name) blockers.push('controparte mancante')
  if (!normalized.accounting.causaleContabile.id && !normalized.accounting.causaleContabile.code) blockers.push('causale contabile mancante')

  const rows = Array.isArray(normalized.accounting.rows) ? normalized.accounting.rows : []
  if (!rows.length) blockers.push('righe prima nota assenti')

  const normalizedRows = rows.map((row, index) => {
    const accountId = normalizeText(row.accountId || row.conto_id || '')
    const description = normalizeText(row.description || row.descrizione || row.descrizione_riga || '')
    const debit = round2(row.debit ?? row.dare ?? row.importo_dare ?? 0)
    const credit = round2(row.credit ?? row.avere ?? row.importo_avere ?? 0)
    const hasAmount = debit > 0 || credit > 0

    if (!accountId) blockers.push(`riga ${index + 1}: conto mancante`)
    if (!hasAmount) blockers.push(`riga ${index + 1}: importo assente`)
    if (debit < 0 || credit < 0) blockers.push(`riga ${index + 1}: importo negativo`)
    if (!description) warnings.push(`riga ${index + 1}: descrizione vuota`)

    return {
      riga_numero: index + 1,
      conto_id: accountId || null,
      descrizione: description || '',
      dare: debit,
      avere: credit,
      causale_iva_id: normalizeText(row.causaleIvaId || row.causale_iva_id || ''),
    }
  })

  const totalDare = round2(normalizedRows.reduce((sum, row) => sum + row.dare, 0))
  const totalAvere = round2(normalizedRows.reduce((sum, row) => sum + row.avere, 0))
  if (Math.abs(totalDare - totalAvere) > 0.01) blockers.push('Dare/Avere non quadrati')
  if (!(normalized.document.totals.gross > 0)) blockers.push('totale documento non valido')

  return {
    status: blockers.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    blockers,
    warnings,
    totals: { dare: totalDare, avere: totalAvere },
    rows: normalizedRows,
  }
}

export function normalizeCanonicalContabilitaPayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const company = source.company && typeof source.company === 'object' ? source.company : {}
  const document = source.document && typeof source.document === 'object' ? source.document : {}
  const counterparty = document.counterparty && typeof document.counterparty === 'object' ? document.counterparty : {}
  const accounting = source.accounting && typeof source.accounting === 'object' ? source.accounting : {}
  const causaleContabile = accounting.causaleContabile && typeof accounting.causaleContabile === 'object' ? accounting.causaleContabile : {}
  const classification = classifyCanonicalContabilitaScenario(source, source)
  const validation = source.validation && typeof source.validation === 'object' ? source.validation : {}

  const normalized = {
    handoff: source.handoff && typeof source.handoff === 'object' ? source.handoff : {},
    company: {
      societaId: normalizeText(company.societaId),
    },
    document: {
      direction: normalizeText(document.direction) || 'acquisto',
      type: normalizeText(document.type) || 'fattura_passiva',
      number: normalizeText(document.number),
      documentDate: normalizeText(document.documentDate),
      registrationDate: normalizeText(document.registrationDate),
      counterparty: {
        name: normalizeText(counterparty.name),
        vatNumber: normalizeText(counterparty.vatNumber),
        taxCode: normalizeText(counterparty.taxCode),
        accountId: normalizeText(counterparty.accountId),
        accountCode: normalizeText(counterparty.accountCode),
      },
      totals: {
        taxable: round2(document.totals?.taxable),
        vat: round2(document.totals?.vat),
        gross: round2(document.totals?.gross),
      },
    },
    classification,
    readiness: buildCanonicalContabilitaReadiness(validation, classification),
    accounting: {
      causaleContabile: {
        id: normalizeText(causaleContabile.id),
        code: normalizeText(causaleContabile.code),
        description: normalizeText(causaleContabile.description),
      },
      rows: Array.isArray(accounting.rows) ? accounting.rows : [],
      totals: {
        debit: round2(accounting.totals?.debit),
        credit: round2(accounting.totals?.credit),
      },
      isBalanced: Boolean(accounting.isBalanced),
    },
    vat: {
      enabled: Boolean(source.vat?.enabled),
      registerType: normalizeText(source.vat?.registerType) || null,
      competenceDate: normalizeText(source.vat?.competenceDate) || null,
      rows: Array.isArray(source.vat?.rows) ? source.vat.rows : [],
      totals: {
        taxable: round2(source.vat?.totals?.taxable),
        tax: round2(source.vat?.totals?.tax),
        detraibileTax: round2(source.vat?.totals?.detraibileTax),
        indetraibileTax: round2(source.vat?.totals?.indetraibileTax),
      },
    },
    ledger: source.ledger && typeof source.ledger === 'object' ? source.ledger : {},
    withholding: source.withholding && typeof source.withholding === 'object' ? source.withholding : {},
    validation,
    automationMeta: source.automationMeta && typeof source.automationMeta === 'object' ? source.automationMeta : {},
  }

  normalized.missingRequiredFields = buildMissingRequiredFields(normalized)
  normalized.contractValidation = validateNormalizedPayload(normalized)
  return normalized
}
