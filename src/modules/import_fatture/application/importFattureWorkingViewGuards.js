/**
 * Controlli strutturali Import Fatture (Prima nota / IVA / Partitario) condivisi tra
 * working view UI e bridge verso `documenti_contabilita` — una sola logica di blocco.
 */

import { fmt } from '../../import_unificato/components/importUiConfig.js'
import { FISCOSIM_IMPORT_AI_META as META } from '../../import_unificato/data/importFiscosimMeta.js'

export const ACCOUNTING_BLOCK_EPS = 0.01

export const WORKING_PN_GRID_KEY = 'working_pn_grid'
export const WORKING_IVA_GRID_KEY = 'working_iva_grid'

function parseLooseTotaleInput(s) {
  const t = String(s || '').trim().replace(/\s/g, '')
  if (!t) return NaN
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return Number(normalized)
}

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

function normContoCodiceUi(s) {
  return String(s ?? '').trim()
}

function leadingContoCodiceFromCell(s) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  const beforeSep = t.split('·')[0].trim()
  return beforeSep.replace(/\s+/g, ' ').trim()
}

function findPianoContoByCellValue(cellValue, pianoConti) {
  const code = normContoCodiceUi(leadingContoCodiceFromCell(cellValue))
  if (!code) return null
  return (
    (Array.isArray(pianoConti) ? pianoConti : []).find(
      (x) => String(x?.codice || '').trim() === code && Number(x?.livello || 0) >= 3,
    ) || null
  )
}

function documentInvoiceTotalNumber(doc) {
  if (!doc) return NaN
  const raw = parseAiRawRoot(doc)
  const t = parseLooseTotaleInput(String(raw.totale ?? ''))
  if (Number.isFinite(t) && t >= 0) return Math.round(t * 100) / 100
  const rie = Array.isArray(raw.riepilogo_iva) ? raw.riepilogo_iva : []
  if (!rie.length) return NaN
  let sum = 0
  for (const r of rie) {
    const im = Number(r?.imponibile || 0)
    const iv = Number(r?.imposta != null ? r.imposta : r?.iva != null ? r.iva : 0)
    if (Number.isFinite(im)) sum += im
    if (Number.isFinite(iv)) sum += iv
  }
  return Math.round(sum * 100) / 100
}

function documentIvaTotalNumber(doc) {
  if (!doc) return NaN
  const raw = parseAiRawRoot(doc)
  const it = parseLooseTotaleInput(String(raw.iva_totale ?? ''))
  if (Number.isFinite(it) && it >= 0) return Math.round(it * 100) / 100
  const rie = Array.isArray(raw.riepilogo_iva) ? raw.riepilogo_iva : []
  let s = 0
  for (const r of rie) {
    const iv = Number(r?.imposta != null ? r.imposta : r?.iva != null ? r.iva : 0)
    if (Number.isFinite(iv)) s += iv
  }
  return Math.round(s * 100) / 100
}

function operativePartitarioTotalNumber(doc, opDraft) {
  const trim = (s) => String(s ?? '').trim()
  if (trim(opDraft?.totale) !== '') {
    const n = parseLooseTotaleInput(trim(opDraft.totale))
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100
  }
  return documentInvoiceTotalNumber(doc)
}

function causaleIvaIdValidInList(id, causaliIva) {
  const s = String(id ?? '').trim()
  if (!s) return false
  return (causaliIva || []).some((c) => String(c.id) === s)
}

function sumGridIvaContabile(ivaGridRows) {
  let s = 0
  for (const row of ivaGridRows || []) {
    const n = parseLooseTotaleInput(String(row?.iva ?? '').trim())
    if (Number.isFinite(n) && n >= 0) s += n
  }
  return Math.round(s * 100) / 100
}

/**
 * Legge griglie e bozza partitario serializzate nel blob import (stesso schema della working view salvata).
 */
export function extractWorkingViewGuardsInputsFromDoc(doc) {
  const raw = parseAiRawRoot(doc)
  const acc = raw[META.ACCOUNTING_PROPOSALS] && typeof raw[META.ACCOUNTING_PROPOSALS] === 'object' ? raw[META.ACCOUNTING_PROPOSALS] : {}
  const ivaBag = raw[META.IVA_OVERRIDES] && typeof raw[META.IVA_OVERRIDES] === 'object' ? raw[META.IVA_OVERRIDES] : {}
  const op = raw[META.OPERATIVE_OVERRIDES] && typeof raw[META.OPERATIVE_OVERRIDES] === 'object' ? raw[META.OPERATIVE_OVERRIDES] : {}
  const pnGridRows = Array.isArray(acc[WORKING_PN_GRID_KEY]) ? acc[WORKING_PN_GRID_KEY] : []
  const ivaGridRows = Array.isArray(ivaBag[WORKING_IVA_GRID_KEY]) ? ivaBag[WORKING_IVA_GRID_KEY] : []
  const opDraft = {
    controparte: op.controparte,
    numero_documento: op.numero_documento,
    data_documento: op.data_documento,
    totale: op.totale,
  }
  return { pnGridRows, ivaGridRows, opDraft }
}

/**
 * Stessi blocchi strutturali della working view: elenco messaggi con tab di provenienza.
 *
 * @returns {Array<{ tab: 'prima_nota' | 'iva' | 'partitario', message: string }>}
 */
export function evaluateImportFattureStructuralAccountingBlocks({
  doc,
  pnGridRows,
  ivaGridRows,
  opDraft,
  pianoConti,
  causaliIva = [],
}) {
  const items = []
  if (!doc) return items
  const trim = (x) => String(x ?? '').trim()
  const pnRows = Array.isArray(pnGridRows) ? pnGridRows : []
  const ivaRows = Array.isArray(ivaGridRows) ? ivaGridRows : []

  if (pnRows.length === 0) {
    items.push({
      tab: 'prima_nota',
      message: 'Prima nota: griglia vuota — aggiungere righe o ripristinare i default.',
    })
  }

  for (let i = 0; i < pnRows.length; i += 1) {
    const row = pnRows[i] || {}
    const c = trim(row?.conto)
    const d = trim(row?.dare)
    const a = trim(row?.avere)
    const n = trim(row?.nota)
    const hasAny = c || d || a || n
    if (!hasAny) {
      items.push({
        tab: 'prima_nota',
        message: `Prima nota: riga ${i + 1} vuota — ogni riga deve essere compilata o rimossa.`,
      })
      continue
    }
    const nd = parseLooseTotaleInput(d)
    const na = parseLooseTotaleInput(a)
    const hasD = d !== '' && Number.isFinite(nd)
    const hasA = a !== '' && Number.isFinite(na)
    if (!hasD && !hasA) {
      items.push({
        tab: 'prima_nota',
        message: `Prima nota: riga ${i + 1} — indicare Dare oppure Avere (importo valido).`,
      })
    }
    if (d !== '' && (!Number.isFinite(nd) || nd < 0)) {
      items.push({ tab: 'prima_nota', message: `Prima nota: riga ${i + 1} — Dare non valido.` })
    }
    if (a !== '' && (!Number.isFinite(na) || na < 0)) {
      items.push({ tab: 'prima_nota', message: `Prima nota: riga ${i + 1} — Avere non valido.` })
    }
    const contoMatch = findPianoContoByCellValue(row?.conto, pianoConti)
    if (!contoMatch) {
      items.push({
        tab: 'prima_nota',
        message: `Prima nota: riga ${i + 1} — conto non agganciato al piano dei conti (testo libero non valido).`,
      })
    }
  }

  let sumDare = 0
  let sumAvere = 0
  for (const row of pnRows) {
    const d = parseLooseTotaleInput(String(row?.dare ?? '').trim())
    const a = parseLooseTotaleInput(String(row?.avere ?? '').trim())
    if (Number.isFinite(d)) sumDare += d
    if (Number.isFinite(a)) sumAvere += a
  }
  if (pnRows.length) {
    const diff = Math.round((sumDare - sumAvere) * 100) / 100
    if (Math.abs(diff) > ACCOUNTING_BLOCK_EPS) {
      const side = diff > 0 ? 'Dare' : 'Avere'
      const mag = Math.abs(diff)
      items.push({
        tab: 'prima_nota',
        message: `Sbilancio Prima nota: ${fmt(mag)} € (eccedenza in ${side}; Dare ${fmt(sumDare)} € / Avere ${fmt(sumAvere)} €).`,
      })
    }
  }

  const docTotPn = documentInvoiceTotalNumber(doc)
  if (
    pnRows.length &&
    Number.isFinite(docTotPn) &&
    Number.isFinite(sumDare) &&
    Number.isFinite(sumAvere)
  ) {
    const pnChiusura = Math.max(sumDare, sumAvere)
    if (Math.abs(pnChiusura - docTotPn) > ACCOUNTING_BLOCK_EPS) {
      items.push({
        tab: 'prima_nota',
        message: `Prima nota: totale Dare/Avere (${fmt(pnChiusura)} €) non coincide con il totale fattura (${fmt(docTotPn)} €).`,
      })
    }
  }

  if (ivaRows.length === 0) {
    items.push({ tab: 'iva', message: 'IVA: nessuna riga nella griglia.' })
  }
  for (let i = 0; i < ivaRows.length; i += 1) {
    const row = ivaRows[i] || {}
    const imp = trim(row.imponibile)
    const iv = trim(row.iva)
    const caus = trim(row.causale_iva_id)
    if (!imp && !iv && !caus) {
      items.push({
        tab: 'iva',
        message: `IVA: riga ${i + 1} vuota — compilare causale, imponibile e IVA o rimuovere la riga.`,
      })
      continue
    }
    if (!caus) {
      items.push({ tab: 'iva', message: `IVA: riga ${i + 1} — causale IVA mancante.` })
    } else if (!causaleIvaIdValidInList(caus, causaliIva)) {
      items.push({
        tab: 'iva',
        message: `IVA: riga ${i + 1} — causale IVA non valida o non presente in anagrafica società.`,
      })
    }
    if (!imp) {
      items.push({ tab: 'iva', message: `IVA: riga ${i + 1} — imponibile mancante.` })
    } else {
      const nim = parseLooseTotaleInput(imp)
      if (!Number.isFinite(nim) || nim < 0) {
        items.push({ tab: 'iva', message: `IVA: riga ${i + 1} — imponibile non valido.` })
      }
    }
    if (!iv) {
      items.push({
        tab: 'iva',
        message: `IVA: riga ${i + 1} — IVA mancante (serve anche la quota indetraibile nel totale riga).`,
      })
    } else {
      const niv = parseLooseTotaleInput(iv)
      if (!Number.isFinite(niv) || niv < 0) {
        items.push({ tab: 'iva', message: `IVA: riga ${i + 1} — importo IVA non valido.` })
      }
    }
  }

  const docIva = documentIvaTotalNumber(doc)
  const gridIva = sumGridIvaContabile(ivaRows)
  const hasAnyGridIva = ivaRows.some((r) => String(r?.iva ?? '').trim())
  if (hasAnyGridIva) {
    if (!Number.isFinite(docIva)) {
      items.push({
        tab: 'iva',
        message:
          'IVA: impossibile verificare il confronto — totale IVA documento non disponibile nell\'estratto (iva_totale / riepilogo).',
      })
    } else if (Math.abs(docIva - gridIva) > ACCOUNTING_BLOCK_EPS) {
      const dlt = Math.round((gridIva - docIva) * 100) / 100
      items.push({
        tab: 'iva',
        message: `IVA documento ${fmt(docIva)} € / IVA contabile (somma griglia) ${fmt(gridIva)} € / differenza ${fmt(Math.abs(dlt))} € — devono coincidere (incl. indetraibile).`,
      })
    }
  }

  if (!trim(opDraft?.controparte) || !trim(opDraft?.numero_documento) || !trim(opDraft?.data_documento)) {
    items.push({
      tab: 'partitario',
      message: 'Partitario: compilare controparte, numero e data documento.',
    })
  }
  const docTot = documentInvoiceTotalNumber(doc)
  const partTot = operativePartitarioTotalNumber(doc, opDraft)
  if (Number.isFinite(docTot) && Number.isFinite(partTot) && Math.abs(docTot - partTot) > ACCOUNTING_BLOCK_EPS) {
    const dlt = Math.round((partTot - docTot) * 100) / 100
    items.push({
      tab: 'partitario',
      message: `Totale fattura ${fmt(docTot)} € / totale partitario (mostrato) ${fmt(partTot)} € / differenza ${fmt(Math.abs(dlt))} €.`,
    })
  }
  if (!Number.isFinite(docTot) && trim(opDraft?.totale)) {
    items.push({
      tab: 'partitario',
      message:
        'Partitario: totale documento non ricavabile dall\'estratto — impossibile validare la coerenza con il totale inserito.',
    })
  }

  const uniq = []
  const seen = new Set()
  for (const item of items) {
    const key = `${item.tab}:${String(item.message || '').trim().toLowerCase()}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    uniq.push(item)
  }
  return uniq
}

/**
 * Wrapper per bridge / API: stessi blocchi della working view sul documento persistito.
 */
export function validateImportFattureStructuralForArchivio(doc, pianoConti = [], causaliIva = []) {
  const { pnGridRows, ivaGridRows, opDraft } = extractWorkingViewGuardsInputsFromDoc(doc)
  const blocks = evaluateImportFattureStructuralAccountingBlocks({
    doc,
    pnGridRows,
    ivaGridRows,
    opDraft,
    pianoConti,
    causaliIva,
  })
  if (!blocks.length) return { ok: true }
  const message = blocks
    .slice(0, 8)
    .map((b) => b.message)
    .join('\n')
  return {
    ok: false,
    message: message || 'Controlli strutturali non superati.',
    code: 'structural_guards',
    blocks,
  }
}
