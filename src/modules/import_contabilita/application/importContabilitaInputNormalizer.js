const XML_TEXT_DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null
const XML_TEXT_ENCODER = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null

const ZIP_REASON_LABELS = {
  zip_unreadable: 'Archivio ZIP non leggibile',
  zip_directory: 'Cartella ZIP',
  non_invoice_attachment: 'Allegato non fattura',
  not_invoice_xml: 'XML non fattura',
  p7m_without_xml: 'P7M senza XML',
}

let jsZipLoaderPromise = null

function normalizeText(value) {
  return String(value || '').trim()
}

function toLowerExt(name) {
  const text = normalizeText(name).toLowerCase()
  const dotIndex = text.lastIndexOf('.')
  return dotIndex >= 0 ? text.slice(dotIndex) : ''
}

function getBaseName(value) {
  return normalizeText(value).split(/[\\/]/).pop() || ''
}

function encodeText(value) {
  const text = String(value || '')
  if (XML_TEXT_ENCODER) {
    return XML_TEXT_ENCODER.encode(text)
  }
  const bytes = []
  for (let index = 0; index < text.length; index += 1) {
    bytes.push(text.charCodeAt(index) & 0xff)
  }
  return new Uint8Array(bytes)
}

function decodeBytes(bytes) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  if (XML_TEXT_DECODER) {
    return XML_TEXT_DECODER.decode(array)
  }
  let out = ''
  for (let index = 0; index < array.length; index += 1) {
    out += String.fromCharCode(array[index])
  }
  return out
}

function hashBytes(bytes) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  let hash = 0x811c9dc5
  for (let index = 0; index < array.length; index += 1) {
    hash ^= array[index]
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function hashText(value) {
  return hashBytes(encodeText(value))
}

function addDiscard(discardMap, code) {
  const key = normalizeText(code) || 'discarded'
  discardMap.set(key, (discardMap.get(key) || 0) + 1)
}

function toDiscardedReasons(discardMap) {
  return Array.from(discardMap.entries())
    .map(([code, count]) => ({
      code,
      label: ZIP_REASON_LABELS[code] || code,
      count,
    }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
}

function extractXmlStartIndex(text) {
  const source = String(text || '')
  const indexes = []

  const declIndex = source.indexOf('<?xml')
  if (declIndex >= 0) indexes.push(declIndex)

  const fatturaIndex = source.search(/<(?:[A-Za-z_][\w.-]*:)?FatturaElettronica\b/i)
  if (fatturaIndex >= 0) indexes.push(fatturaIndex)

  if (!indexes.length) return -1
  return Math.min(...indexes)
}

function extractXmlFromText(text) {
  const source = String(text || '')
  const startIndex = extractXmlStartIndex(source)
  if (startIndex < 0) return ''

  const slice = source.slice(startIndex)
  const rootMatch = slice.match(/<(?:([A-Za-z_][\w.-]*):)?FatturaElettronica\b/i)
  const namespacePrefix = rootMatch?.[1] || ''

  const candidateRegexes = namespacePrefix
    ? [
        new RegExp(`</${namespacePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:FatturaElettronica\\s*>`, 'ig'),
        /<\/(?:[A-Za-z_][\w.-]*:)?FatturaElettronica\s*>/ig,
      ]
    : [/<\/(?:[A-Za-z_][\w.-]*:)?FatturaElettronica\s*>/ig]

  for (const closingRegex of candidateRegexes) {
    let lastMatch = null
    let match
    while ((match = closingRegex.exec(slice))) {
      lastMatch = match
    }
    if (lastMatch) {
      const endIndex = lastMatch.index + lastMatch[0].length
      return slice.slice(0, endIndex).trim()
    }
  }

  if (/<(?:[A-Za-z_][\w.-]*:)?FatturaElettronicaBody\b/i.test(slice)) {
    return slice.trim()
  }

  return ''
}

function looksLikeInvoiceXml(xmlText) {
  const text = String(xmlText || '')
  return /<(?:[A-Za-z_][\w.-]*:)?FatturaElettronica\b/i.test(text) && /<(?:[A-Za-z_][\w.-]*:)?FatturaElettronicaBody\b/i.test(text)
}

async function loadJsZipCtor() {
  if (!jsZipLoaderPromise) {
    jsZipLoaderPromise = import('jszip').then((mod) => mod?.default || mod)
  }
  return jsZipLoaderPromise
}

async function readFileBytes(fileLike) {
  if (!fileLike) return new Uint8Array()
  if (typeof fileLike.arrayBuffer === 'function') {
    const buffer = await fileLike.arrayBuffer()
    return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || [])
  }
  if (typeof fileLike.text === 'function') {
    return encodeText(await fileLike.text())
  }
  if (typeof fileLike === 'string') {
    return encodeText(fileLike)
  }
  return new Uint8Array()
}

async function readFileText(fileLike) {
  if (!fileLike) return ''
  if (typeof fileLike.text === 'function') {
    return String(await fileLike.text() || '')
  }
  const bytes = await readFileBytes(fileLike)
  return decodeBytes(bytes)
}

function deriveXmlFilename(originalName) {
  const baseName = getBaseName(originalName) || 'import.xml'
  if (/\.p7m$/i.test(baseName)) {
    return `${baseName.replace(/\.p7m$/i, '') || 'import'}.xml`
  }
  if (/\.xml$/i.test(baseName)) {
    return baseName
  }
  return `${baseName || 'import'}.xml`
}

function createPreparedXmlFile({
  id,
  name,
  originFilename,
  sourceHash,
  xmlText,
  originType,
  containerFilename = '',
}) {
  const text = String(xmlText || '')
  const bytes = encodeText(text)
  return {
    id: id || null,
    name: normalizeText(name || originFilename || 'import.xml'),
    originFilename: normalizeText(originFilename || name || ''),
    containerFilename: normalizeText(containerFilename || ''),
    originType: normalizeText(originType || 'xml'),
    sourceHash: normalizeText(sourceHash || hashText(text)),
    size: bytes.byteLength,
    type: 'application/xml',
    async text() {
      return text
    },
    async arrayBuffer() {
      return bytes.slice().buffer
    },
  }
}

function recordZipDiscard(discardMap, code) {
  addDiscard(discardMap, code)
}

async function normalizeSingleXmlInput(fileLike, options = {}) {
  const originalName = normalizeText(fileLike?.name || options.filename || 'import.xml')
  const xmlText = await readFileText(fileLike)
  const finalName = deriveXmlFilename(originalName)
  const sourceHash = hashText(`${originalName}:${xmlText}`)
  return {
    preparedFiles: [
      createPreparedXmlFile({
        id: fileLike?.id || null,
        name: finalName,
        originFilename: originalName,
        sourceHash,
        xmlText,
        originType: 'xml',
      }),
    ],
    discardedCount: 0,
    discardedMap: new Map(),
  }
}

async function normalizeSingleP7mInput(fileLike, options = {}) {
  const originalName = normalizeText(fileLike?.name || options.filename || 'import.p7m')
  const bytes = await readFileBytes(fileLike)
  const decodedText = decodeBytes(bytes)
  const extractedXml = extractXmlFromText(decodedText)
  const fallbackText = decodedText
  const xmlText = extractedXml || fallbackText
  const finalName = deriveXmlFilename(originalName)
  const sourceHash = hashText(`${originalName}:${xmlText}`)

  return {
    preparedFiles: [
      createPreparedXmlFile({
        id: fileLike?.id || null,
        name: finalName,
        originFilename: originalName,
        sourceHash,
        xmlText,
        originType: extractedXml ? 'p7m' : 'p7m_fallback',
      }),
    ],
    discardedCount: 0,
    discardedMap: new Map(),
  }
}

async function normalizeZipInput(fileLike, options = {}) {
  const originalName = normalizeText(fileLike?.name || options.filename || 'archive.zip')
  const bytes = await readFileBytes(fileLike)
  const discardMap = new Map()
  const preparedFiles = []

  let JSZipCtor
  try {
    JSZipCtor = await loadJsZipCtor()
  } catch (error) {
    recordZipDiscard(discardMap, 'zip_unreadable')
    return {
      preparedFiles: [],
      discardedCount: 1,
      discardedMap: discardMap,
    }
  }

  try {
    const zip = await JSZipCtor.loadAsync(bytes)
    const containerHash = hashBytes(bytes)

    const entries = []
    zip.forEach((relativePath, entry) => {
      entries.push([relativePath, entry])
    })

    for (const [relativePath, entry] of entries) {
      const entryName = normalizeText(relativePath || entry?.name || '')
      if (!entryName || entry?.dir || /\/$/.test(entryName)) {
        continue
      }

      const baseName = getBaseName(entryName)
      const lowerName = baseName.toLowerCase()

      if (baseName.startsWith('.') || lowerName === 'desktop.ini' || lowerName === 'thumbs.db' || entryName.includes('__MACOSX') || lowerName.endsWith('_metadati.xml') || lowerName.includes('metadati') || (!lowerName.endsWith('.xml') && !lowerName.endsWith('.p7m'))) {
        recordZipDiscard(discardMap, 'non_invoice_attachment')
        continue
      }

      let entryBytes
      try {
        entryBytes = await entry.async('uint8array')
      } catch {
        recordZipDiscard(discardMap, 'zip_unreadable')
        continue
      }

      if (lowerName.endsWith('.p7m')) {
        const extractedXml = extractXmlFromText(decodeBytes(entryBytes))
        if (!extractedXml) {
          recordZipDiscard(discardMap, 'p7m_without_xml')
          continue
        }
        if (!looksLikeInvoiceXml(extractedXml)) {
          recordZipDiscard(discardMap, 'not_invoice_xml')
          continue
        }
        preparedFiles.push(
          createPreparedXmlFile({
            name: deriveXmlFilename(baseName),
            originFilename: entryName,
            sourceHash: hashText(`${containerHash}:${entryName}:${extractedXml}`),
            xmlText: extractedXml,
            originType: 'zip_p7m',
            containerFilename: originalName,
          }),
        )
        continue
      }

      if (lowerName.endsWith('.xml')) {
        const xmlText = decodeBytes(entryBytes)
        if (!looksLikeInvoiceXml(xmlText)) {
          recordZipDiscard(discardMap, 'not_invoice_xml')
          continue
        }
        preparedFiles.push(
          createPreparedXmlFile({
            name: baseName,
            originFilename: entryName,
            sourceHash: hashText(`${containerHash}:${entryName}:${xmlText}`),
            xmlText,
            originType: 'zip_xml',
            containerFilename: originalName,
          }),
        )
        continue
      }

      recordZipDiscard(discardMap, 'non_invoice_attachment')
    }
  } catch {
    recordZipDiscard(discardMap, 'zip_unreadable')
    return {
      preparedFiles: [],
      discardedCount: Math.max(1, Array.from(discardMap.values()).reduce((sum, count) => sum + count, 0)),
      discardedMap: discardMap,
    }
  }

  return {
    preparedFiles,
    discardedCount: Array.from(discardMap.values()).reduce((sum, count) => sum + count, 0),
    discardedMap: discardMap,
  }
}

function looksLikeZipFile(fileLike) {
  const ext = toLowerExt(fileLike?.name || '')
  return ext === '.zip'
}

function looksLikeP7mFile(fileLike) {
  const ext = toLowerExt(fileLike?.name || '')
  return ext === '.p7m'
}

export async function normalizeImportContabilitaInputFiles(files = [], options = {}) {
  const list = Array.isArray(files) ? files : []
  const preparedFiles = []
  const discardMap = new Map()
  let extractedXmlCount = 0

  for (const fileLike of list) {
    try {
      if (looksLikeZipFile(fileLike)) {
        const normalizedZip = await normalizeZipInput(fileLike, options)
        preparedFiles.push(...(normalizedZip.preparedFiles || []))
        extractedXmlCount += (normalizedZip.preparedFiles || []).length
        const zipDiscardMap = normalizedZip.discardedMap || new Map()
        for (const [code, count] of zipDiscardMap.entries()) {
          discardMap.set(code, (discardMap.get(code) || 0) + count)
        }
        continue
      }

      if (looksLikeP7mFile(fileLike)) {
        const normalizedP7m = await normalizeSingleP7mInput(fileLike, options)
        preparedFiles.push(...(normalizedP7m.preparedFiles || []))
        extractedXmlCount += (normalizedP7m.preparedFiles || []).length
        continue
      }

      const normalizedXml = await normalizeSingleXmlInput(fileLike, options)
      preparedFiles.push(...(normalizedXml.preparedFiles || []))
      extractedXmlCount += (normalizedXml.preparedFiles || []).length
    } catch {
      addDiscard(discardMap, 'zip_unreadable')
    }
  }

  const discardedFilesCount = Array.from(discardMap.values()).reduce((sum, count) => sum + count, 0)

  return {
    uploadedFilesCount: list.length,
    extractedXmlCount,
    discardedFilesCount,
    discardedReasons: toDiscardedReasons(discardMap),
    preparedFiles,
  }
}

export {
  createPreparedXmlFile,
  deriveXmlFilename,
  extractXmlFromText,
  hashText,
  looksLikeInvoiceXml,
}
