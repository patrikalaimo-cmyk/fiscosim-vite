import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function amount(value) {
  const parsed = Number.parseFloat(normalizeText(value).replace(',', '.'))
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

function rowRole(row = {}) {
  return normalizeText(row?.ruolo || row?.templateRole).toLowerCase()
}

function isOrdinaryVatRow(row = {}) {
  const role = rowRole(row)
  const textBlob = [
    row?.contoQuery,
    row?.conto_descrizione,
    row?.conto_codice,
    row?.descrizione_riga,
    row?.descrizione,
    row?.source,
    row?.templateSource,
  ]
    .filter(Boolean)
    .map((value) => normalizeText(value).toLowerCase())
    .join(' ')

  return (
    role === 'iva' ||
    role === 'iva_ns.debito' ||
    role === 'iva_nsdebito' ||
    role === 'iva_debito' ||
    role === 'iva_debito_ordinaria' ||
    role === 'iva_ordinaria' ||
    role === 'iva_vendite' ||
    role === 'iva_attiva' ||
    textBlob.includes('iva ns.debito') ||
    textBlob.includes('iva ns debito') ||
    textBlob.includes('iva debito') ||
    textBlob.includes('iva-debito') ||
    textBlob.includes('iva ordinaria')
  )
}

function resolveSplitAccount(causale = {}, rows = [], pianoConti = []) {
  const id = normalizeText(
    causale?.conto_iva_split_payment ||
    causale?.contoIvaSplitPayment ||
    causale?.conto_split_payment ||
    causale?.contoSplitPayment
  )
  if (id) {
    const catalog = Array.isArray(pianoConti) ? pianoConti : []
    const directMatch = catalog.find((item) => normalizeText(item?.id) === id)
    if (directMatch) {
      return {
        id: normalizeText(directMatch.id),
        codice: normalizeText(directMatch.codice || directMatch.code || directMatch.sigla),
        descrizione: normalizeText(directMatch.descrizione || directMatch.description || directMatch.denominazione || directMatch.nome || 'IVA split payment'),
      }
    }

    const codeMatch = catalog.filter((item) => normalizeText(item?.codice || item?.code || item?.sigla) === id)
    if (codeMatch.length === 1) {
      const match = codeMatch[0]
      return {
        id: normalizeText(match.id),
        codice: normalizeText(match.codice || match.code || match.sigla),
        descrizione: normalizeText(match.descrizione || match.description || match.denominazione || match.nome || 'IVA split payment'),
      }
    }
    return null
  }

  const template = causale?.righe_prima_nota_template || causale?.righePrimaNotaTemplate || causale?.righe_prima_nota || []
  const configured = [...(Array.isArray(template) ? template : []), ...(Array.isArray(rows) ? rows : [])]
    .find((row) => ['iva_split', 'iva_split_payment', 'split_payment'].includes(rowRole(row)))
  const configuredId = normalizeText(configured?.conto_id || configured?.contoId)
  const configuredCode = normalizeText(configured?.conto_codice || configured?.contoCodice)
  const configuredDescr = normalizeText(configured?.conto_descrizione || configured?.contoDescrizione)
  const catalog = Array.isArray(pianoConti) ? pianoConti : []
  if (configuredId) {
    const directMatch = catalog.find((item) => normalizeText(item?.id) === configuredId)
    if (directMatch) {
      return {
        id: normalizeText(directMatch.id),
        codice: normalizeText(directMatch.codice || directMatch.code || directMatch.sigla),
        descrizione: normalizeText(directMatch.descrizione || directMatch.description || directMatch.denominazione || directMatch.nome || 'IVA split payment'),
      }
    }
    const codeMatch = configuredCode ? catalog.filter((item) => normalizeText(item?.codice || item?.code || item?.sigla) === configuredCode) : []
    if (codeMatch.length === 1) {
      const match = codeMatch[0]
      return {
        id: normalizeText(match.id),
        codice: normalizeText(match.codice || match.code || match.sigla),
        descrizione: normalizeText(match.descrizione || match.description || match.denominazione || match.nome || configuredDescr || 'IVA split payment'),
      }
    }
    return null
  }
  return configuredId
    ? {
        id: configuredId,
        codice: configuredCode,
        descrizione: configuredDescr || 'IVA split payment',
      }
    : null
}

function normalizeAccountQuery(account = {}) {
  const codice = normalizeText(account?.codice || account?.code || account?.sigla || account?.conto_codice)
  const descrizione = normalizeText(account?.descrizione || account?.description || account?.nome || account?.conto_descrizione)
  const id = normalizeText(account?.id || account?.conto_id)
  return codice && descrizione ? `${codice} - ${descrizione}` : descrizione || codice || id || ''
}

function isSplitSubjectRow(row = {}, header = {}) {
  const role = rowRole(row)
  const headerId = normalizeText(header?.clienteFornitoreId || header?.cliente_fornitore_id)
  const rowContoId = normalizeText(row?.conto_id || row?.contoId)
  const rowContoCode = normalizeText(row?.conto_codice || row?.contoCodice)
  const rowSource = normalizeText(row?.source || row?.templateSource).toLowerCase()
  return (
    role === 'soggetto' ||
    rowSource === 'subject' ||
    (headerId && rowContoId === headerId) ||
    (headerId && rowContoCode && rowContoCode === headerId)
  )
}

export function buildSplitPaymentRows({ rows = [], splitPayment = {}, ivaDraft = {}, documentData = {}, causale = {}, header = {}, pianoConti = [] } = {}) {
  const sourceRows = Array.isArray(rows) ? rows : []
  if (!splitPayment?.active) return { active: false, rows: sourceRows, blockers: [], ivaSplit: 0, importoIncassabile: 0 }

  const imponibile = amount(
    ivaDraft?.totaleImponibile ||
    ivaDraft?.imponibile ||
    documentData?.totaleImponibile ||
    documentData?.totale_imponibile ||
    (amount(documentData?.totaleDocumento || documentData?.totale_documento) - amount(documentData?.totaleImposte || documentData?.totale_imposte || documentData?.totaleIva || documentData?.totale_iva))
  )
  const ivaSplit = amount(
    ivaDraft?.totaleIva ||
    ivaDraft?.totaleImposta ||
    ivaDraft?.imposta ||
    documentData?.totaleIva ||
    documentData?.totale_iva ||
    documentData?.totaleImposte ||
    documentData?.totale_imposte ||
    (amount(documentData?.totaleDocumento || documentData?.totale_documento) - imponibile)
  )
  const splitAccount = resolveSplitAccount(causale, sourceRows, pianoConti)
  if (!splitAccount) {
    const blockerCode = 'SPLIT_PAYMENT_ACCOUNT_MISSING'
    const blockerMessage = 'Conto IVA split payment non configurato per questa causale/template/anagrafica. Configurare il conto tecnico IVA split payment.'
    return {
      active: true,
      rows: [],
      blockers: [`${blockerCode}: ${blockerMessage}`],
      blockerCode,
      blockerMessage,
      ivaSplit,
      importoIncassabile: imponibile,
    }
  }

  const retained = sourceRows
    .filter((row) => !isOrdinaryVatRow(row) && !['iva_split', 'iva_split_payment', 'split_payment'].includes(rowRole(row)) && row?.source !== 'split_payment')
    .map((row) => isSplitSubjectRow(row, header)
      ? {
          ...row,
          dare: imponibile,
          avere: 0,
          splitPayment: true,
          contoQuery: normalizeText(row?.contoQuery || row?.conto_query || row?.conto_descrizione || row?.conto_codice || row?.conto_id || normalizeAccountQuery({ id: row?.conto_id, codice: row?.conto_codice, descrizione: row?.conto_descrizione })),
        }
      : row)

  const technical = [
    {
      id: 'split-payment-dare',
      ruolo: 'iva_split_payment',
      conto_id: splitAccount.id,
      conto_codice: splitAccount.codice,
      conto_descrizione: splitAccount.descrizione,
      contoQuery: normalizeAccountQuery(splitAccount),
      accountId: splitAccount.id,
      accountCode: splitAccount.codice,
      accountDescription: splitAccount.descrizione,
      descrizione: 'IVA split payment - evidenza Dare',
      dare: ivaSplit,
      avere: 0,
      source: 'split_payment',
      technical: true,
      technicalDerived: true,
      modificabile: false,
      splitPayment: true,
    },
    {
      id: 'split-payment-avere',
      ruolo: 'iva_split_payment',
      conto_id: splitAccount.id,
      conto_codice: splitAccount.codice,
      conto_descrizione: splitAccount.descrizione,
      contoQuery: normalizeAccountQuery(splitAccount),
      accountId: splitAccount.id,
      accountCode: splitAccount.codice,
      accountDescription: splitAccount.descrizione,
      descrizione: 'IVA split payment - evidenza Avere',
      dare: 0,
      avere: ivaSplit,
      source: 'split_payment',
      technical: true,
      technicalDerived: true,
      modificabile: false,
      splitPayment: true,
    },
  ].map((row, index) => ({ ...row, riga_numero: retained.length + index + 1 }))

  return { active: true, rows: [...retained, ...technical], blockers: [], ivaSplit, importoIncassabile: imponibile, splitAccount }
}
