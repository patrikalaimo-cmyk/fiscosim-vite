/**
 * Adapter locale per upload in «Import Fatture»: perimetro file e filtri post-estrazione ZIP
 * senza duplicare `importWorkflow.js`.
 */

const ROOT_EXT = ['.xml', '.pdf', '.zip', '.p7m']

function lowerName(file) {
  return String(file?.name || '').toLowerCase()
}

const XML_INVOICE_MARKERS = [
  'fatturaelettronica',
  'cedenteprestatore',
  'cessionariocommittente',
  'datigeneralidocumento',
]

const XML_SIDE_CAR_TOKENS = [
  'metadato',
  'metadati',
  'metadata',
  '_metadato',
  '_metadati',
  '_metadata',
  'daticert',
  'segnatura',
  'ricevuta',
  'esito',
  'notifica',
]

function normalizeXmlContent(xmlContent) {
  return String(xmlContent || '').toLowerCase()
}

function isInvoiceXmlContent(xmlContent) {
  const normalized = normalizeXmlContent(xmlContent)
  return XML_INVOICE_MARKERS.some((marker) => normalized.includes(marker))
}

function isSidecarXmlName(file) {
  const n = lowerName(file)
  return XML_SIDE_CAR_TOKENS.some((token) => n.includes(token))
}

/** Estensioni ammesse come file radice (selezione / drop). */
export function isAllowedFattureRootFile(file) {
  const n = lowerName(file)
  return ROOT_EXT.some((ext) => n.endsWith(ext))
}

/**
 * Filtra i file selezionati dall'utente prima di `inspectImportedFiles`.
 * @returns {{ allowed: File[], rejectedNames: string[] }}
 */
export function filterRootFilesForFattureImport(fileList) {
  const allowed = []
  const rejectedNames = []
  for (const f of Array.from(fileList || [])) {
    if (isAllowedFattureRootFile(f)) allowed.push(f)
    else rejectedNames.push(f.name || '(senza nome)')
  }
  return { allowed, rejectedNames }
}

function isAllowedExpandedLeaf(file) {
  const n = lowerName(file)
  if (n.endsWith('.xml')) return true
  return false
}

/**
 * Dopo `safeExpandIncomingFiles` / ispezione: tieni solo XML (i P7M convertiti diventano XML; le immagini e i PDF da ZIP vengono scartati).
 * Gli elementi con `preflightError` restano (gestione errore a valle).
 * @param {Array<{ file: File, xmlContent?: string, preflightError?: string }>} items
 * @returns {{ filtered: typeof items, skippedNames: string[] }}
 */
export function filterExpandedItemsForFattureStaging(items, { onSkipped } = {}) {
  const filtered = []
  const skippedNames = []
  for (const item of items || []) {
    const f = item?.file
    if (!f) continue
    const xmlContent = typeof item?.xmlContent === 'string' ? item.xmlContent : ''
    if (!isAllowedExpandedLeaf(f)) {
      skippedNames.push(f.name || '(senza nome)')
      continue
    }
    if (isSidecarXmlName(f)) {
      skippedNames.push(f.name || '(senza nome)')
      continue
    }
    if (xmlContent && !isInvoiceXmlContent(xmlContent)) {
      skippedNames.push(f.name || '(senza nome)')
      continue
    }
    if (item?.preflightError) {
      filtered.push(item)
      continue
    }
    filtered.push(item)
  }
  if (skippedNames.length && typeof onSkipped === 'function') {
    onSkipped(skippedNames)
  }
  return { filtered, skippedNames }
}
