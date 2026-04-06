import { Fragment, createElement } from 'react'

const fmtEuro = (n) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(
    Number(n) || 0
  )

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Campi del documento / piano citati esplicitamente nella risposta Copilot → evidenziazione UI.
 */
export function deriveCopilotHighlights(doc, pianoConti, causaliIva, answer, reasoning) {
  const text = `${String(answer || '')}\n${String(reasoning || '')}`
  if (!text.trim() || !doc) {
    return {
      contoCodes: [],
      numeroDocumento: false,
      soggetto: false,
      piva: false,
      totale: false,
      imponibile: false,
      iva: false,
      causaleIva: false,
    }
  }

  const codeSet = new Set()
  for (const c of pianoConti || []) {
    const code = String(c.codice || '').replace(/\s+/g, '').trim()
    if (code.length >= 4 && code.length <= 10) codeSet.add(code)
  }

  const contoCodes = []
  const reCode = /\b(\d{4,8})\b/g
  let m
  while ((m = reCode.exec(text)) !== null) {
    if (codeSet.has(m[1])) contoCodes.push(m[1])
  }

  const nd = String(doc.numero_documento || '').trim()
  const numeroDocumento = Boolean(nd && nd.length >= 1 && text.includes(nd))

  const subj = String(doc.soggetto_denominazione || '').trim()
  const soggetto =
    subj.length >= 3 &&
    text.toLowerCase().includes(subj.toLowerCase().slice(0, Math.min(48, subj.length)))

  const pivaRaw = String(doc.soggetto_piva || '').replace(/\s/g, '')
  const piva =
    pivaRaw.length >= 9 &&
    (text.replace(/\s/g, '').includes(pivaRaw) ||
      text.replace(/\s/g, '').includes(pivaRaw.replace(/^IT/i, '')))

  const totStr = fmtEuro(doc.totale)
  const totale =
    doc.totale != null &&
    (text.includes(totStr) ||
      text.includes(String(doc.totale)) ||
      text.includes(String(doc.totale).replace('.', ',')))

  const impStr = doc.imponibile != null ? fmtEuro(doc.imponibile) : ''
  const imponibile =
    doc.imponibile != null &&
    ((impStr && text.includes(impStr)) || text.includes(String(doc.imponibile)))

  const ivaStr = doc.iva != null ? fmtEuro(doc.iva) : ''
  const iva =
    doc.iva != null &&
    ((ivaStr && text.includes(ivaStr)) || text.includes(String(doc.iva)))

  let causaleIva = false
  const cid = doc.causale_iva
  if (cid && Array.isArray(causaliIva)) {
    const row = causaliIva.find((x) => String(x.id) === String(cid))
    const cod = String(row?.codice || '').trim()
    if (cod && text.includes(cod)) causaleIva = true
  }

  return {
    contoCodes: [...new Set(contoCodes)],
    numeroDocumento,
    soggetto,
    piva,
    totale,
    imponibile,
    iva,
    causaleIva,
  }
}

/**
 * Evidenzia in-line i codici conto presenti nella risposta.
 */
export function buildAnswerHighlightNodes(text, contoCodes) {
  const s = String(text || '')
  const codes = [...new Set(contoCodes || [])].filter(Boolean).sort((a, b) => b.length - a.length)
  if (!s || !codes.length) return s

  const body = codes.map(escapeRegExp).join('|')
  if (!body) return s
  const re = new RegExp(`\\b(${body})\\b`, 'g')
  const nodes = []
  let last = 0
  let match
  let idx = 0
  while ((match = re.exec(s)) !== null) {
    if (match.index > last) {
      nodes.push(createElement(Fragment, { key: `t-${idx++}` }, s.slice(last, match.index)))
    }
    nodes.push(
      createElement(
        'mark',
        { key: `m-${idx++}`, className: 'copilot-highlight-inline' },
        match[0]
      )
    )
    last = match.index + match[0].length
  }
  if (last < s.length) {
    nodes.push(createElement(Fragment, { key: `t-${idx++}` }, s.slice(last)))
  }
  return nodes.length ? nodes : s
}
