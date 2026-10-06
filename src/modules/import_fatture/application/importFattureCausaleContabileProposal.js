/**
 * Proposta causale contabile (staging Import Fatture): storico soggetto → classificazione documento → fallback tipologia.
 * Codici di studio attesi: FF, FFPC, RP, RPPC, A17X, FF5, FC, FCPC (match su `causali_contabili.codice`).
 *
 * Nota RP / RPPC: stessa semantica percipiente del modulo Contabilità (CU / 770 / scheda percipienti)
 * richiedono flussi dedicati; qui si propone solo la causale coerente con il documento e lo storico.
 */

import * as importRepo from '../../import_unificato/data/importRepo.js'
import { buildDocSnapshotForContoMatch } from './importFattureContoProposal.js'
import {
  extractParcellaInvoiceSignals,
  isProfessionalParcellaDocument,
} from '../../contabilita/application/parcellaDecisionEngine.js'

const META = importRepo.FISCOSIM_IMPORT_AI_META

function parseAiRawRoot(doc) {
  const raw = doc?.ai_raw_response
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return typeof p === 'object' && p && !Array.isArray(p) ? { ...p } : {}
    } catch {
      return {}
    }
  }
  return {}
}

function readAccountingProposals(doc) {
  const raw = parseAiRawRoot(doc)
  const bag = raw[META.ACCOUNTING_PROPOSALS]
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {}
  return { ...bag }
}

function readTipoDocumentoNorm(doc) {
  const raw = parseAiRawRoot(doc)
  const t = String(doc?.tipo_documento || raw.tipo_documento || raw.tipo || '').trim().toUpperCase()
  if (t) return t
  const xml = String(raw.xml_content || '')
  const m = xml.match(/<TipoDocumento>\s*([A-Z0-9]+)\s*<\/TipoDocumento>/i)
  return m ? String(m[1]).trim().toUpperCase() : ''
}

function buildSyntheticRowForParcella(doc) {
  const raw = parseAiRawRoot(doc)
  const snap = buildDocSnapshotForContoMatch(doc)
  return {
    tipo_documento: snap.tipo_documento || doc.tipo_documento,
    dati_estratti: JSON.stringify({
      linee: raw.linee || [],
      riepilogo_iva: raw.riepilogo_iva || [],
      causale: raw.causale || '',
      xml_content: raw.xml_content || '',
    }),
    numero_documento: raw.numero,
    soggetto_denominazione: snap.soggetto_denominazione,
  }
}

/** IVA / documento: segnali testuali per variante «per cassa» (FFPC, FCPC, RPPC). */
export function inferContabilePerCassa(doc) {
  const raw = parseAiRawRoot(doc)
  const blob = [
    raw.xml_content,
    raw.causale,
    raw.regime_fiscale,
    ...(Array.isArray(raw.riepilogo_iva) ? raw.riepilogo_iva.map((r) => [r?.natura, r?.esigibilita_iva].join(' ')) : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (/\b(split\s+payment|scissione\s+dei\s+pagamenti|iva\s+per\s+cassa|regime\s+dei\s+corrispettiv)\b/i.test(blob)) {
    return true
  }
  if (/\b(esigibilitaiva|esigibilità\s*iva)\b[^a-z0-9]*\b[si]\b/i.test(blob.replace(/\s+/g, ''))) return true
  const rf = String(raw.regime_fiscale || '').toUpperCase()
  if (rf && /CASSA|CORRISPETTIV/i.test(rf)) return true
  return false
}

function riepilogoHasReverseChargeNature(raw) {
  const rie = Array.isArray(raw.riepilogo_iva) ? raw.riepilogo_iva : []
  return rie.some((r) => {
    const n = String(r?.natura || '').toUpperCase()
    return n.startsWith('N6') || n.includes('N6.1') || n.includes('N6.2')
  })
}

function lineeHintForeignServices(raw) {
  const linee = Array.isArray(raw.linee) ? raw.linee : []
  const txt = linee.map((l) => `${l?.descrizione || ''} ${l?.desc || ''}`).join(' ').toLowerCase()
  if (/\b(reverse\s+charge|inversione|art\.?\s*17|art\.?\s*44|cessione\s+intracomunitaria\s+serviz)/i.test(txt)) return true
  return false
}

/**
 * Codice causale contabile di studio (non uuid): priorità documento dopo esclusione storico.
 */
export function classifyStudioCausaleContabileCode(doc) {
  const raw = parseAiRawRoot(doc)
  const tipo = readTipoDocumentoNorm(doc)
  const tipoLower = String(doc?.tipo_documento || raw.tipo_documento || '').toLowerCase()
  const isAttiva = tipoLower.includes('attiva')
  const perCassa = inferContabilePerCassa(doc)

  if (isAttiva) return perCassa ? 'FCPC' : 'FC'

  const syn = buildSyntheticRowForParcella(doc)
  const sig = extractParcellaInvoiceSignals(syn)
  const strongParcella =
    isProfessionalParcellaDocument(syn) ||
    sig.likelyWithholding ||
    (sig.hasParcellaWord && (sig.hasExplicitWithholding || sig.hasInps || sig.hasEnasarco))

  if (strongParcella) return perCassa ? 'RPPC' : 'RP'

  if (
    tipo === 'TD08' ||
    tipo === 'TD09' ||
    riepilogoHasReverseChargeNature(raw) ||
    lineeHintForeignServices(raw) ||
    /\b(reverse\s+charge|inversione\s+contabile|autofattura\s+ester)\b/i.test(
      [raw.xml_content, raw.causale].filter(Boolean).join(' '),
    )
  ) {
    return 'A17X'
  }

  if (tipo === 'TD11' || tipo === 'TD12' || /\bacquisti\s+intracomunitari\s+beni\b/i.test(String(raw.xml_content || ''))) {
    return 'FF5'
  }

  return perCassa ? 'FFPC' : 'FF'
}

export function findCausaleContabileIdByCodice(causaliContabili = [], codice = '') {
  const want = String(codice || '').trim().toUpperCase()
  if (!want) return ''
  const list = Array.isArray(causaliContabili) ? causaliContabili : []
  const c = list.find((x) => String(x?.codice || '').trim().toUpperCase() === want)
  return c?.id != null ? String(c.id).trim() : ''
}

/** Storico confermato: causale contabile più frequente tra i documenti dello stesso soggetto. */
export function pickDominantHistoricalCausaleContabileId(historicalDocs = [], causaliContabili = []) {
  const counts = new Map()
  for (const row of historicalDocs || []) {
    const id = String(row?.causale_id || '').trim()
    if (!id) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  const list = Array.isArray(causaliContabili) ? causaliContabili : []
  let bestId = ''
  let bestN = 0
  for (const [id, n] of counts) {
    if (!list.some((c) => String(c.id) === id)) continue
    if (n > bestN) {
      bestN = n
      bestId = id
    }
  }
  return bestId
}

/**
 * @param {Record<string, unknown>} doc
 * @param {unknown[]} causaliContabili
 * @param {unknown[]} historicalDocs documenti confermati stesso soggetto (opzionale)
 * @param {string} [dominantHistoricalCausaleId] id già calcolato dal prefetch (stesso batch storico)
 */
export function pickImportFatturaStagingCausaleContabileId(
  doc,
  causaliContabili = [],
  historicalDocs = [],
  dominantHistoricalCausaleId = '',
) {
  const saved = String(readAccountingProposals(doc).causale_id ?? '').trim()
  if (saved) return saved

  let histId = pickDominantHistoricalCausaleContabileId(historicalDocs, causaliContabili)
  if (!histId && dominantHistoricalCausaleId) histId = String(dominantHistoricalCausaleId).trim()
  if (histId) return histId

  const code = classifyStudioCausaleContabileCode(doc)
  return findCausaleContabileIdByCodice(causaliContabili, code) || ''
}
