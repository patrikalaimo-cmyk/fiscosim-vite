import { parseItalianAmount } from './parseItalianAmount.js'

/** Importo italiano in testo: 1.234,56 o 234,56 */
const RE_IT_AMOUNT = /(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\b/g
const RE_PIVA_IT = /\bIT\s?\d{11}\b/gi
const RE_CF_16 = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi
const RE_DATE_IT = /\b\d{2}[-/.]\d{2}[-/.]\d{4}\b/g
const RE_DATE_ISO = /\b\d{4}-\d{2}-\d{2}\b/g
const RE_NATURA = /\bN[1-7][A-Z]?\b/gi

const FISCAL_LINE =
  /totale|imponibil|imposta|iva|documento|fattura|cedente|cessionario|fornitore|cliente|denominazione|partita|riepilogo|bollo|pagamento|scadenza/i

export function splitPdfTextToLines(text) {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  const out = []
  for (const seg of raw.split('\n')) {
    const t = seg.trim()
    if (!t) continue
    if (t.length > 380 && /\s{2,}/.test(t)) {
      const chunks = t.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
      out.push(...(chunks.length > 1 ? chunks : [t]))
    } else {
      out.push(t)
    }
  }
  return out
}

function formatEnAmount(n) {
  if (n == null || !Number.isFinite(n)) return ''
  return (Math.round(n * 100) / 100).toFixed(2)
}

export function parseInvoiceTableRow(line) {
  const s = line.replace(/\s+/g, ' ').trim()
  if (s.length < 6) return null
  const matches = [...s.matchAll(new RegExp(RE_IT_AMOUNT.source, 'g'))]
  if (matches.length === 0) return null
  const last = matches[matches.length - 1]
  const amountStr = last[0]
  const idx = last.index ?? s.indexOf(amountStr)
  const before = s.slice(0, idx).trim()
  const after = s.slice(idx + amountStr.length).trim()
  const n = parseItalianAmount(amountStr)
  if (n == null) return null
  let nature = ''
  const natAfter = after.match(RE_NATURA)
  const natBefore = before.match(RE_NATURA)
  if (natAfter?.[0]) nature = natAfter[0].toUpperCase()
  else if (natBefore?.[0]) nature = natBefore[0].toUpperCase()
  const desc = before.replace(RE_NATURA, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)
  if (desc.length < 3 && !nature) return null
  return { desc: desc || '(riga)', amountEn: formatEnAmount(n), nature }
}

function uniqueStrings(arr, max = 30) {
  const seen = new Set()
  const out = []
  for (const x of arr) {
    const k = String(x).trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
    if (out.length >= max) break
  }
  return out
}

export function preprocessInvoiceTextForAi(rawText, opts = {}) {
  const maxChars = opts.maxChars != null ? opts.maxChars : 14000
  const lines = splitPdfTextToLines(rawText)
  const flat = lines.join('\n')

  const pivaHits = uniqueStrings(flat.match(RE_PIVA_IT) || [], 12)
  const cfHits = uniqueStrings(flat.match(RE_CF_16) || [], 8)
  const dateHits = uniqueStrings(
    [...(flat.match(RE_DATE_IT) || []), ...(flat.match(RE_DATE_ISO) || [])],
    15
  )

  const headerHints = []
  const lowerKeys =
    /numero\s+documento|data\s+documento|tipo\s+documento|tipologia|cedente|cessionario|fornitore|cliente|denominazione|identificativo\s+fiscale|codice\s+fiscale|partita\s+iva|totale\s+documento|riepilogo/i

  for (const line of lines) {
    if (lowerKeys.test(line) && line.length < 500) headerHints.push(line.trim())
  }

  const itemRows = []
  for (const line of lines) {
    const row = parseInvoiceTableRow(line)
    if (row) itemRows.push(row)
  }

  const totalLines = lines.filter(
    (l) =>
      /totale\s+documento|importo\s+bollo|totale\s+da\s+pagare|saldo|netto\s+a\s+pagare/i.test(l) &&
      RE_IT_AMOUNT.test(l)
  )

  const fiscalFragments = lines.filter((l) => FISCAL_LINE.test(l) && l.length < 400).slice(0, 45)

  const parts = []
  parts.push('=== RIEPILOGO_STRUTTURATO (estrazione deterministica da PDF, senza interpretazione) ===')
  parts.push('Usa queste sezioni come base principale; il JSON richiesto deve essere coerente con i valori qui sotto.')
  parts.push('')
  parts.push('--- header_candidati (righe grezze rilevanti) ---')
  if (headerHints.length) parts.push(...headerHints.slice(0, 35).map((h) => `- ${h}`))
  else parts.push('- (nessuna riga etichettata esplicitamente)')

  parts.push('')
  parts.push('--- partite_iva ---')
  parts.push(pivaHits.length ? pivaHits.join(', ') : '(non trovate)')

  parts.push('')
  parts.push('--- codici_fiscali ---')
  parts.push(cfHits.length ? cfHits.join(', ') : '(non trovati)')

  parts.push('')
  parts.push('--- date_trovate ---')
  parts.push(dateHits.length ? dateHits.join(', ') : '(non trovate)')

  parts.push('')
  parts.push('--- righe_dettaglio (descrizione | importo_EUR | natura_iva) ---')
  if (itemRows.length) {
    for (const r of itemRows.slice(0, 80)) {
      parts.push(`${r.desc} | ${r.amountEn} | ${r.nature || '-'}`)
    }
  } else {
    parts.push('(nessuna riga con importo italiano riconosciuto â€” vedi frammenti)')
  }

  parts.push('')
  parts.push('--- righe_totali (testo grezzo con importi) ---')
  if (totalLines.length) parts.push(...totalLines.slice(0, 15).map((l) => `- ${l}`))
  else parts.push('- (nessuna riga totale esplicita)')

  parts.push('')
  parts.push('--- frammenti_fiscali (contesto aggiuntivo) ---')
  parts.push(...fiscalFragments.slice(0, 40).map((l) => `- ${l}`))

  let compactText = parts.join('\n')
  if (compactText.length > maxChars) {
    compactText = compactText.slice(0, maxChars - 80) + '\n[... testo troncato per limite ...]'
  }

  const stats = {
    lineCount: lines.length,
    itemRows: itemRows.length,
    pivaHits: pivaHits.length,
    cfHits: cfHits.length,
    dateHits: dateHits.length,
    headerHintLines: headerHints.length,
    outputChars: compactText.length,
  }

  return { compactText, stats }
}
