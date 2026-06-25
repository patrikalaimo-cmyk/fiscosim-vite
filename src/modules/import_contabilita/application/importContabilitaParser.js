import { createEmptyParsedDocument } from '../domain/parserContract.js'

const XML_ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeXmlEntities(value) {
  const text = String(value || '')
  return text
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = Number.parseInt(entity.slice(2), 16)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }
      if (entity.startsWith('#')) {
        const code = Number.parseInt(entity.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }
      return Object.prototype.hasOwnProperty.call(XML_ENTITY_MAP, entity) ? XML_ENTITY_MAP[entity] : match
    })
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ')
}

function unwrapCdata(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
}

function stripXmlControlChars(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\ufeff\ufffd]/g, '')
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function extractTagMatch(xml, tagName) {
  if (!xml || !tagName) return ''
  const tag = escapeRegExp(tagName)
  const re = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${tag}\\s*>`,
    'i',
  )
  const match = String(xml).match(re)
  return match ? match[1] : ''
}

function extractTagMatches(xml, tagName) {
  if (!xml || !tagName) return []
  const tag = escapeRegExp(tagName)
  const re = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${tag}\\s*>`,
    'gi',
  )
  const out = []
  const text = String(xml)
  let match
  while ((match = re.exec(text))) {
    out.push(match[1] || '')
  }
  return out
}

function extractRootName(xml) {
  const text = String(xml || '')
  const match = text.match(/<\s*(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)\b[^>]*>/i)
  return match ? String(match[1] || '').trim() : ''
}

function pushIssue(target, code, message) {
  target.push({ code, message })
}

function extractAnagraficaBlock(partyBlockXml) {
  const datiAnagrafici = extractTagMatch(partyBlockXml, 'DatiAnagrafici')
  const anagrafica = extractTagMatch(datiAnagrafici || partyBlockXml, 'Anagrafica')
  return anagrafica || datiAnagrafici || partyBlockXml || ''
}

function normalizeParty(blockXml) {
  const block = stripXmlControlChars(blockXml)
  const datiAnagraficaBlock = extractTagMatch(block, 'DatiAnagrafici') || block
  const anagraficaBlock = stripXmlControlChars(extractAnagraficaBlock(block))
  const denominazione = normalizeWhitespace(
    extractTextTag(anagraficaBlock, 'Denominazione') ||
      [extractTextTag(anagraficaBlock, 'Nome'), extractTextTag(anagraficaBlock, 'Cognome')].filter(Boolean).join(' '),
  )
  const partitaIva = normalizeWhitespace(
    extractTextTag(datiAnagraficaBlock, 'IdCodice') ||
      extractTextTag(datiAnagraficaBlock, 'PartitaIVA') ||
      extractTextTag(block, 'IdCodice') ||
      extractTextTag(block, 'PartitaIVA'),
  )
  const codiceFiscale = normalizeWhitespace(
    extractTextTag(datiAnagraficaBlock, 'CodiceFiscale') ||
      extractTextTag(block, 'CodiceFiscale'),
  )

  if (!denominazione && !partitaIva && !codiceFiscale) return null
  return {
    denominazione,
    partitaIva,
    codiceFiscale,
  }
}

function parseIvaRows(xml, warnings) {
  const rows = []
  const blocks = extractTagMatches(xml, 'DatiRiepilogo')
  for (const block of blocks) {
    const aliquotaRaw = extractTextTag(block, 'AliquotaIVA')
    const natura = normalizeWhitespace(extractTextTag(block, 'Natura'))
    const imponibileRaw = extractTextTag(block, 'ImponibileImporto')
    const impostaRaw = extractTextTag(block, 'Imposta')
    const esigibilita = normalizeWhitespace(extractTextTag(block, 'EsigibilitaIVA'))

    rows.push({
      aliquota: normalizeNumber(aliquotaRaw),
      natura,
      imponibile: normalizeNumber(imponibileRaw),
      imposta: normalizeNumber(impostaRaw),
      esigibilita,
    })
  }

  if (!rows.length) {
    warnings.push({
      code: 'iva_rows_missing',
      message: 'Nessun blocco DatiRiepilogo trovato.',
    })
  }

  return rows
}

function parseLineeDocumento(xml) {
  const rows = []
  const blocks = [
    ...extractTagMatches(xml, 'DatiDettaglioLinee'),
    ...extractTagMatches(xml, 'DettaglioLinee'),
  ]

  for (const block of blocks) {
    rows.push({
      numeroLinea: normalizeWhitespace(extractTextTag(block, 'NumeroLinea')),
      descrizione: normalizeWhitespace(extractTextTag(block, 'Descrizione')),
      quantita: normalizeNumber(extractTextTag(block, 'Quantita')),
      prezzoUnitario: normalizeNumber(extractTextTag(block, 'PrezzoUnitario')),
      prezzoTotale: normalizeNumber(extractTextTag(block, 'PrezzoTotale')),
      aliquotaIVA: normalizeNumber(extractTextTag(block, 'AliquotaIVA')),
      natura: normalizeWhitespace(extractTextTag(block, 'Natura')),
    })
  }

  return rows
}

function buildFlags(xml, parsed, causaleText = '') {
  const riepilogoNature = parsed.ivaRows.map((row) => String(row?.natura || '').trim().toUpperCase())
  const riepilogoEsigibilita = parsed.ivaRows.map((row) => String(row?.esigibilita || '').trim().toUpperCase())
  const reverseCharge = riepilogoNature.some((value) => value.startsWith('N6') || value.startsWith('N7') || value.includes('REVERSE'))
  const splitPayment = riepilogoEsigibilita.some((value) => value.startsWith('S') || value.includes('SPLIT'))
  const hasRitenuta = Boolean(extractTagMatch(xml, 'DatiRitenuta') || extractTextTag(xml, 'Ritenuta'))
  const isProfessional = Boolean(
    hasRitenuta ||
      extractTagMatch(xml, 'DatiCassaPrevidenziale') ||
      /parcella|onorario|compenso|prestazione|consulenz|profession/i.test(String(causaleText || '')),
  )

  parsed.flags = {
    reverseCharge,
    splitPayment,
    hasRitenuta,
    isProfessional,
  }
}

function finalizeNumbers(parsed) {
  const imponibile = parsed.ivaRows.reduce((sum, row) => sum + normalizeNumber(row?.imponibile), 0)
  const iva = parsed.ivaRows.reduce((sum, row) => sum + normalizeNumber(row?.imposta), 0)
  parsed.imponibile = Number.isFinite(imponibile) ? imponibile : 0
  parsed.iva = Number.isFinite(iva) ? iva : 0
}

function enrichWarningsAndErrors(xml, parsed) {
  if (!parsed.tipoDocumento) {
    pushIssue(parsed.warnings, 'tipo_documento_missing', 'Campo TipoDocumento mancante.')
  }
  if (!parsed.dataDocumento) {
    pushIssue(parsed.warnings, 'data_documento_missing', 'Campo Data mancante o non normalizzabile.')
  }
  if (!parsed.numeroDocumento) {
    pushIssue(parsed.warnings, 'numero_documento_missing', 'Campo Numero mancante.')
  }
  if (!parsed.fornitore) {
    pushIssue(parsed.warnings, 'fornitore_missing', 'Blocco CedentePrestatore non trovato o vuoto.')
  } else if (!normalizeWhitespace(parsed.fornitore.denominazione)) {
    pushIssue(parsed.warnings, 'fornitore_denominazione_missing', 'Denominazione fornitore mancante.')
  }
  if (!parsed.cliente) {
    pushIssue(parsed.warnings, 'cliente_missing', 'Blocco CessionarioCommittente non trovato o vuoto.')
  } else if (!normalizeWhitespace(parsed.cliente.denominazione)) {
    pushIssue(parsed.warnings, 'cliente_denominazione_missing', 'Denominazione cliente mancante.')
  }

  if (!xml || !String(xml).includes('FatturaElettronica')) {
    pushIssue(parsed.errors, 'not_fatturapa', 'Documento XML non riconosciuto come FatturaPA.')
  }
}

export function extractTextTag(xml, tagName) {
  const raw = extractTagMatch(xml, tagName)
  if (!raw) return ''
  const withCdata = unwrapCdata(raw)
  return normalizeWhitespace(decodeXmlEntities(stripTags(withCdata)))
}

export function normalizeNumber(value) {
  if (value === null || value === undefined) return 0
  let text = String(value).trim()
  if (!text) return 0

  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }

  text = text.replace(/[\u00a0\s€£$]/g, '')
  text = text.replace(/[^0-9,.\-]/g, '')

  if (!text) return 0
  if (text.startsWith('-')) {
    negative = true
    text = text.slice(1)
  }

  const commaIndex = text.lastIndexOf(',')
  const dotIndex = text.lastIndexOf('.')
  if (commaIndex >= 0 && dotIndex >= 0) {
    if (commaIndex > dotIndex) {
      text = text.replace(/\./g, '').replace(',', '.')
    } else {
      text = text.replace(/,/g, '')
    }
  } else if (commaIndex >= 0) {
    text = text.replace(/\./g, '').replace(',', '.')
  }

  const num = Number.parseFloat(text)
  if (!Number.isFinite(num)) return 0
  return negative ? -num : num
}

export function normalizeDate(value) {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  if (!text) return ''

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`

  const dashMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dashMatch) return `${dashMatch[3]}-${dashMatch[2]}-${dashMatch[1]}`

  const compactMatch = text.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseFatturaXml(xmlString, options = {}) {
  const parsed = createEmptyParsedDocument()
  const xml = String(xmlString || '').replace(/^\uFEFF/, '').trim()
  parsed.filename = String(options?.filename || '').trim()
  parsed.sourceHash = String(options?.sourceHash || '').trim()
  parsed.rawXml = xml

  if (!xml) {
    pushIssue(parsed.errors, 'empty_xml', 'XML vuoto o mancante.')
    return parsed
  }

  const rootName = extractRootName(xml)
  if (!rootName) {
    pushIssue(parsed.errors, 'root_missing', 'Nodo root XML non trovato.')
  } else if (!/fatturaelettronica/i.test(rootName)) {
    pushIssue(parsed.errors, 'root_unexpected', `Root XML inatteso: ${rootName}.`)
  }

  const datiGeneraliBlock = extractTagMatch(xml, 'DatiGeneraliDocumento') || extractTagMatch(xml, 'DatiGenerali') || xml
  parsed.tipoDocumento = normalizeWhitespace(extractTextTag(datiGeneraliBlock, 'TipoDocumento'))
  parsed.dataDocumento = normalizeDate(extractTextTag(datiGeneraliBlock, 'Data'))
  parsed.numeroDocumento = normalizeWhitespace(extractTextTag(datiGeneraliBlock, 'Numero'))

  const causaleText = extractTextTag(xml, 'Causale')
  const fornitoreBlock = extractTagMatch(xml, 'CedentePrestatore')
  const clienteBlock = extractTagMatch(xml, 'CessionarioCommittente')
  parsed.fornitore = normalizeParty(fornitoreBlock)
  parsed.cliente = normalizeParty(clienteBlock)

  parsed.lineeDocumento = parseLineeDocumento(xml)
  parsed.ivaRows = parseIvaRows(xml, parsed.warnings)
  finalizeNumbers(parsed)

  const totaleDocumento = normalizeNumber(extractTextTag(datiGeneraliBlock, 'ImportoTotaleDocumento'))
  parsed.totale = totaleDocumento || parsed.imponibile + parsed.iva

  buildFlags(xml, parsed, causaleText)

  const datiRitenutaBlock = extractTagMatch(xml, 'DatiRitenuta')
  if (datiRitenutaBlock) {
    const importoRitenuta = normalizeNumber(extractTextTag(datiRitenutaBlock, 'ImportoRitenuta'))
    const aliquotaRitenuta = normalizeNumber(extractTextTag(datiRitenutaBlock, 'AliquotaRitenuta'))
    const causalePagamento = normalizeWhitespace(extractTextTag(datiRitenutaBlock, 'CausalePagamento'))
    parsed.withholding = {
      enabled: true,
      amount: importoRitenuta || 0,
      rate: aliquotaRitenuta || 0,
      causaleCu: causalePagamento || '',
    }
  } else {
    parsed.withholding = null
  }

  enrichWarningsAndErrors(xml, parsed)

  if (!parsed.totale) {
    pushIssue(parsed.warnings, 'totale_missing', 'Totale documento mancante o non normalizzabile.')
  }

  return parsed
}

export async function parseFatturaFile(fileLike) {
  if (typeof fileLike === 'string') {
    return parseFatturaXml(fileLike)
  }

  const filename = String(fileLike?.name || '').trim()
  const sourceHash = String(fileLike?.sourceHash || '').trim()

  if (!fileLike) {
    const parsed = createEmptyParsedDocument()
    pushIssue(parsed.errors, 'file_missing', 'File non disponibile.')
    return parsed
  }

  if (typeof fileLike.text === 'function') {
    const xml = await fileLike.text()
    return parseFatturaXml(xml, { filename, sourceHash })
  }

  if (typeof fileLike.arrayBuffer === 'function') {
    const buffer = await fileLike.arrayBuffer()
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null
    const xml = decoder ? decoder.decode(buffer) : String.fromCharCode(...new Uint8Array(buffer))
    return parseFatturaXml(xml, { filename, sourceHash })
  }

  const parsed = createEmptyParsedDocument()
  parsed.filename = filename
  parsed.sourceHash = sourceHash
  pushIssue(parsed.errors, 'unsupported_file_like', 'Oggetto file non supportato dal parser.')
  return parsed
}
