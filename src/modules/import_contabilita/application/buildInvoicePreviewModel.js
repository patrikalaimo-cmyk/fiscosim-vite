function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeIssueList(list) {
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    if (typeof item === 'string') {
      return { code: '', message: toText(item) }
    }
    if (isObject(item)) {
      return {
        code: toText(item.code),
        message: toText(item.message || item.code),
      }
    }
    return { code: '', message: '' }
  }).filter((item) => item.message)
}

function normalizeParty(party) {
  const source = isObject(party) ? party : {}
  return {
    denominazione: toText(source.denominazione),
    partitaIva: toText(source.partitaIva),
    codiceFiscale: toText(source.codiceFiscale),
  }
}

function normalizeLine(line, index) {
  const source = isObject(line) ? line : {}
  return {
    numeroLinea: toText(source.numeroLinea || index + 1),
    descrizione: toText(source.descrizione),
    quantita: toNumber(source.quantita),
    prezzoUnitario: toNumber(source.prezzoUnitario),
    prezzoTotale: toNumber(source.prezzoTotale),
    aliquotaIVA: toNumber(source.aliquotaIVA),
    natura: toText(source.natura),
  }
}

function normalizeVatRow(row) {
  const source = isObject(row) ? row : {}
  return {
    aliquota: toNumber(source.aliquota),
    natura: toText(source.natura),
    imponibile: toNumber(source.imponibile),
    imposta: toNumber(source.imposta),
    esigibilita: toText(source.esigibilita || source.esigibilitaIVA),
  }
}

function hasValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  return Boolean(toText(value))
}

function hasPartyData(party) {
  return hasValue(party.denominazione) || hasValue(party.partitaIva) || hasValue(party.codiceFiscale)
}

export function buildInvoicePreviewModel(parsedDocument, options = {}) {
  const parsed = isObject(parsedDocument) ? parsedDocument : {}

  const source = {
    filename: toText(options.filename || parsed.filename),
    sourceHash: toText(options.sourceHash || parsed.sourceHash),
    originType: toText(options.originType),
    originFilename: toText(options.originFilename),
    containerFilename: toText(options.containerFilename),
  }

  const cedentePrestatore = normalizeParty(parsed.fornitore)
  const cessionarioCommittente = normalizeParty(parsed.cliente)
  const linee = Array.isArray(parsed.lineeDocumento) ? parsed.lineeDocumento.map(normalizeLine) : []
  const riepilogoIva = Array.isArray(parsed.ivaRows) ? parsed.ivaRows.map(normalizeVatRow) : []
  const warnings = normalizeIssueList(parsed.warnings)
  const errors = normalizeIssueList(parsed.errors)
  const rawXml = toText(parsed.rawXml)
  const rawXmlAvailable = Boolean(rawXml)

  const fiscoSim = {
    tipoDocumento: toText(parsed.tipoDocumento),
    numero: toText(parsed.numeroDocumento),
    data: toText(parsed.dataDocumento),
    divisa: toText(parsed.divisa),
    totale: toNumber(parsed.totale),
    cedentePrestatore,
    cessionarioCommittente,
    linee,
    riepilogoIva,
    warnings,
    errors,
  }

  const documentSummary = {
    tipoDocumento: fiscoSim.tipoDocumento,
    numero: fiscoSim.numero,
    data: fiscoSim.data,
    divisa: fiscoSim.divisa,
    imponibile: toNumber(parsed.imponibile),
    iva: toNumber(parsed.iva),
    totale: fiscoSim.totale,
  }

  const parties = {
    cedentePrestatore,
    cessionarioCommittente,
  }

  const hasOriginalBaseData = (
    hasValue(documentSummary.tipoDocumento)
    || hasValue(documentSummary.numero)
    || hasValue(documentSummary.data)
    || hasPartyData(cedentePrestatore)
    || hasPartyData(cessionarioCommittente)
    || linee.length > 0
    || riepilogoIva.length > 0
  )

  const missingXmlReason = 'XML originale non disponibile nello snapshot corrente'

  const originale = {
    available: hasOriginalBaseData,
    reason: rawXmlAvailable ? '' : missingXmlReason,
    rawXmlAvailable,
    rawXmlPersisted: false,
    parties,
    document: documentSummary,
    lines: linee,
    vatSummary: riepilogoIva,
    payments: [],
    withholding: parsed?.flags?.hasRitenuta ? { detected: true } : null,
    pensionFund: null,
    stampDuty: null,
  }

  const xml = {
    available: rawXmlAvailable,
    rawXml,
    reason: rawXmlAvailable ? '' : missingXmlReason,
  }

  const available = Boolean(
    xml.available
    || originale.available
    || hasValue(fiscoSim.tipoDocumento)
    || hasValue(fiscoSim.numero)
    || hasValue(fiscoSim.data)
    || linee.length > 0
    || riepilogoIva.length > 0
  )

  return {
    available,
    source,
    fiscoSim,
    originale,
    xml,
  }
}
