/**
 * Propose annual ammortamento quotes for a cespite (no Prima Nota side effects).
 */

function toAmount(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function round2(value) {
  return Math.round(toAmount(value) * 100) / 100
}

function resolvePurchaseYear(dataAcquisto) {
  const raw = String(dataAcquisto ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return Number.parseInt(raw.slice(0, 4), 10)
  }
  const ts = Date.parse(raw)
  if (Number.isFinite(ts)) return new Date(ts).getFullYear()
  return new Date().getFullYear()
}

/**
 * @param {object} bene
 * @param {object} [opts]
 * @param {number} [opts.maxYears=50]
 * @returns {{ ok: boolean, reason?: string, aliquotaPercent: number, rows: Array<{anno:number,quota_annua:number,fondo_progressivo:number,valore_residuo:number}> }}
 */
export function calculatePianoAmmortamento(bene = {}, opts = {}) {
  const costo = round2(Math.abs(toAmount(bene.costo_storico ?? bene.costoStorico)))
  const aliquotaPercent = toAmount(bene.aliquota_ammortamento ?? bene.aliquotaAmmortamento ?? 20)
  const fondoIniziale = round2(Math.max(0, toAmount(bene.fondo_ammortamento ?? bene.fondoAmmortamento)))
  const maxYears = Number.isFinite(opts.maxYears) ? Math.max(1, opts.maxYears) : 50

  if (!(costo > 0)) {
    return { ok: false, reason: 'invalid_cost', aliquotaPercent: 0, rows: [] }
  }
  if (!(aliquotaPercent > 0)) {
    return { ok: false, reason: 'invalid_aliquota', aliquotaPercent: 0, rows: [] }
  }

  const aliq = aliquotaPercent / 100
  const annoAcq = resolvePurchaseYear(bene.data_acquisto ?? bene.dataAcquisto)
  const rows = []
  let fondoAcc = fondoIniziale

  for (let anno = annoAcq; fondoAcc < costo - 0.004 && rows.length < maxYears; anno += 1) {
    const quota = round2(Math.min(costo * aliq, costo - fondoAcc))
    if (!(quota > 0)) break
    fondoAcc = round2(fondoAcc + quota)
    rows.push({
      anno,
      quota_annua: quota,
      fondo_progressivo: fondoAcc,
      valore_residuo: round2(Math.max(0, costo - fondoAcc)),
    })
  }

  return {
    ok: true,
    aliquotaPercent,
    costo,
    fondoIniziale,
    rows,
  }
}

/**
 * Propose the single quote for a target year (or first pending year).
 */
export function proposeQuotaAmmortamento(bene = {}, { anno } = {}) {
  const piano = calculatePianoAmmortamento(bene)
  if (!piano.ok) return { ok: false, reason: piano.reason, quote: null, piano }
  const target = Number.isFinite(Number(anno)) ? Number(anno) : null
  const quote = target == null
    ? (piano.rows[0] || null)
    : (piano.rows.find((r) => r.anno === target) || null)
  if (!quote) {
    return { ok: false, reason: 'quote_not_found', quote: null, piano }
  }
  return { ok: true, quote, piano }
}
