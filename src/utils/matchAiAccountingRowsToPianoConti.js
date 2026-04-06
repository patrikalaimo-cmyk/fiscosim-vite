/**
 * Abbina righe partita doppia (output AI) al piano dei conti locale (import fatture).
 */

function toNum(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function matchPianoConto(contoStr, descrizione, pianoConti) {
  const s = String(contoStr || '').trim()
  const d = String(descrizione || '').trim()
  if (!s && !d) return null
  const list = (pianoConti || []).filter((c) => (c.livello ?? 3) >= 3)
  if (s) {
    let c = list.find((x) => x.codice === s)
    if (c) return c
    const norm = s.replace(/\s/g, '')
    c = list.find((x) => (x.codice || '').replace(/\s/g, '') === norm)
    if (c) return c
    c = list.find((x) => s.startsWith(x.codice) || (x.codice && s.includes(x.codice)))
    if (c) return c
  }
  if (d) {
    const low = d.toLowerCase()
    const c = list.find((x) =>
      (x.descrizione || '').toLowerCase().includes(low.slice(0, Math.min(28, low.length)))
    )
    if (c) return c
  }
  return null
}

/**
 * Per fattura passiva: priorità a righe in dare (costo). Per attiva: a righe in avere (ricavo).
 *
 * @returns {{ id: string, codice: string, descrizione?: string } | null}
 */
export function pickContoFromAiAccountingRows(rows, tipoDocumento, pianoConti) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(pianoConti)) return null
  const passiva = tipoDocumento === 'fattura_passiva'
  const candidates = passiva
    ? rows.filter((r) => toNum(r?.dare) > 0)
    : rows.filter((r) => toNum(r?.avere) > 0)
  const pool = candidates.length ? candidates : rows
  const sorted = [...pool].sort((a, b) =>
    passiva ? toNum(b?.dare) - toNum(a?.dare) : toNum(b?.avere) - toNum(a?.avere)
  )
  for (const r of sorted) {
    const c = matchPianoConto(r?.conto, r?.descrizione, pianoConti)
    if (c) return c
  }
  return null
}
