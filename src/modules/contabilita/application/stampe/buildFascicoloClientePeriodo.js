/**
 * Fascicolo cliente di fine periodo: un unico file HTML stampabile
 * composto da modelli canonici (giornale, partitari, mastrini, bilancio).
 * Provvisorio — non stampa definitiva / non freeze A100.
 */
import { escHtml, fmtDateIT, fmtEur } from './exportStampeProvvisorie.js'

function text(value) {
  return String(value ?? '').trim()
}

function sectionMeta(model, id, title) {
  if (!model || typeof model !== 'object') {
    return { id, title, included: false, reason: 'assente' }
  }
  const basis = text(model.basis)
  const count = Number(
    model.primaNotaIncluse
      ?? model.partiteIncluse
      ?? (Array.isArray(model.entries) ? model.entries.length : null)
      ?? model.conti?.length
      ?? model.rows?.length
      ?? 0
  )
  const ok = model.valid !== false && count > 0
  return {
    id,
    title,
    included: ok,
    basis: basis || (Array.isArray(model.entries) ? 'libro_giornale_da_prima_nota' : null),
    count,
    blockers: Array.isArray(model.blockers) ? model.blockers : [],
    reason: ok ? 'ok' : (model.valid === false ? 'blockers' : 'vuoto'),
  }
}

function renderGiornaleRows(model) {
  const entries = Array.isArray(model?.entries) ? model.entries : []
  if (!entries.length) return '<p class="empty">Nessuna scrittura nel periodo.</p>'
  let html = ''
  for (const entry of entries.slice(0, 500)) {
    const righe = Array.isArray(entry.righe) ? entry.righe : []
    html += `<tr class="group"><td colspan="5"><strong>${escHtml(fmtDateIT(entry.data_registrazione))}</strong>
      · PN ${escHtml(entry.numero_registrazione || entry.id || '')}
      · ${escHtml(entry.descrizione || entry.numero_documento || '')}</td></tr>`
    for (const r of righe) {
      html += `<tr>
        <td class="mono">${escHtml(r.conto_codice || '')}</td>
        <td>${escHtml(r.conto_descrizione || r.descrizione_riga || '')}</td>
        <td class="num">${fmtEur(r.importo_dare || r.dare || 0)}</td>
        <td class="num">${fmtEur(r.importo_avere || r.avere || 0)}</td>
        <td></td>
      </tr>`
    }
  }
  return `<table><thead><tr><th>Conto</th><th>Descrizione</th><th>Dare</th><th>Avere</th><th></th></tr></thead><tbody>${html}</tbody></table>`
}

function renderPartitariRows(model) {
  const rows = Array.isArray(model?.rows) ? model.rows : []
  if (!rows.length) return '<p class="empty">Nessuna partita nel periodo.</p>'
  const body = rows.slice(0, 500).map((r) => `<tr>
    <td>${escHtml(r.subject || r.soggettoNome || '—')}</td>
    <td>${escHtml(r.doc || r.numeroDocumento || '—')}</td>
    <td class="center">${escHtml(fmtDateIT(r.date || r.dataDocumento))}</td>
    <td class="num">${fmtEur(r.original ?? r.importoOriginale)}</td>
    <td class="num">${fmtEur(r.residual ?? r.importoResiduo)}</td>
    <td class="center">${escHtml(r.state || r.stato || '')}</td>
  </tr>`).join('')
  return `<table><thead><tr><th>Soggetto</th><th>Documento</th><th>Data</th><th>Originario</th><th>Residuo</th><th>Stato</th></tr></thead><tbody>${body}</tbody></table>`
}

function renderContiRows(model, { dareKey = 'dare', avereKey = 'avere', saldoKey = 'saldoMovimentiPeriodo' } = {}) {
  const conti = Array.isArray(model?.conti) ? model.conti : []
  if (!conti.length) return '<p class="empty">Nessun conto movimentato.</p>'
  const body = conti.slice(0, 500).map((c) => `<tr>
    <td class="mono">${escHtml(c.codice || '')}</td>
    <td>${escHtml(c.descrizione || '')}</td>
    <td class="num">${fmtEur(c[dareKey])}</td>
    <td class="num">${fmtEur(c[avereKey])}</td>
    <td class="num">${fmtEur(c[saldoKey] ?? c.saldoFinale ?? 0)}</td>
  </tr>`).join('')
  return `<table><thead><tr><th>Codice</th><th>Descrizione</th><th>Dare</th><th>Avere</th><th>Saldo</th></tr></thead><tbody>${body}</tbody></table>`
}

/**
 * @returns {{ ok: boolean, definitive: false, kind: string, basis: string, blockers: string[], warnings: string[], sections: object[], fileName: string, html: string, mimeType: string }}
 */
export function buildFascicoloClientePeriodo({
  societa = {},
  periodoInizio = '',
  periodoFine = '',
  giornaleModel = null,
  partitariModel = null,
  mastriniModel = null,
  bilancioModel = null,
} = {}) {
  const blockers = []
  const warnings = [
    'Fascicolo cliente di fine periodo in modalità provvisoria (non stampa definitiva).',
    'Il file unico è HTML stampabile (print-to-PDF); non sostituisce attestazioni server/hash definitivo freeze.',
  ]
  const start = text(periodoInizio)
  const end = text(periodoFine)
  const societaId = text(societa.id || societa.societaId)
  if (!societaId) blockers.push('societa_id_mancante')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    blockers.push('periodo_non_valido')
  }

  const sections = [
    sectionMeta(giornaleModel, 'giornale', 'Libro Giornale'),
    sectionMeta(partitariModel, 'partitari', 'Partitari clienti/fornitori'),
    sectionMeta(mastriniModel, 'mastrini', 'Mastrini / movimenti per conto'),
    sectionMeta(bilancioModel, 'bilancio', 'Bilancio di verifica (saldi periodo)'),
  ]
  const included = sections.filter((s) => s.included)
  if (!included.length) blockers.push('fascicolo_senza_sezioni_operative')

  for (const s of sections) {
    if (s.blockers?.length) {
      warnings.push(`${s.id}: ${s.blockers.join(', ')}`)
    }
  }

  const den = text(societa.denominazione || societa.nome || societaId || 'cliente')
  const safeName = den.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'cliente'
  const fileName = `fascicolo_${safeName}_${end || 'periodo'}.html`
  const generatedAt = new Date().toISOString()

  const bodySections = []
  if (sections[0].included) {
    bodySections.push(`<section class="break"><h2>1. Libro Giornale</h2>${renderGiornaleRows(giornaleModel)}</section>`)
  }
  if (sections[1].included) {
    bodySections.push(`<section class="break"><h2>2. Partitari</h2>${renderPartitariRows(partitariModel)}</section>`)
  }
  if (sections[2].included) {
    bodySections.push(`<section class="break"><h2>3. Mastrini</h2>${renderContiRows(mastriniModel)}</section>`)
  }
  if (sections[3].included) {
    bodySections.push(`<section class="break"><h2>4. Bilancio di verifica</h2>${renderContiRows(bilancioModel, {
      dareKey: 'dare',
      avereKey: 'avere',
      saldoKey: 'saldoFinale',
    })}</section>`)
  }

  const toc = sections.map((s) => `<li>${escHtml(s.title)} — ${s.included ? `incluso (${s.count})` : `escluso (${s.reason})`}</li>`).join('')

  const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Fascicolo cliente ${escHtml(den)} ${escHtml(start)}–${escHtml(end)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: system-ui, Segoe UI, Roboto, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 12px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    h2 { font-size: 14px; margin: 0 0 10px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .badge { display: inline-block; background: #fffbeb; border: 1px solid #fde68a; color: #b45309; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 16px; margin: 12px 0 18px; color: #475569; }
    .meta strong { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
    th { background: #f8fafc; font-size: 10px; text-transform: uppercase; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .center { text-align: center; }
    .mono { font-family: ui-monospace, monospace; font-size: 10px; }
    .break { page-break-before: always; margin-top: 18px; }
    .break:first-of-type { page-break-before: auto; }
    .empty { color: #64748b; font-style: italic; }
    .warn { background: #fff5f5; border: 1px solid #feb2b2; color: #9b2c2c; padding: 8px; border-radius: 6px; margin-top: 16px; font-size: 10px; }
    .footer { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #64748b; }
  </style>
</head>
<body>
  <header>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div>
        <h1>Fascicolo cliente — fine periodo</h1>
        <div>${escHtml(den)}</div>
      </div>
      <div class="badge">Provvisorio</div>
    </div>
    <div class="meta">
      <div><strong>Società ID:</strong> ${escHtml(societaId)}</div>
      <div><strong>P.IVA:</strong> ${escHtml(societa.partita_iva || '—')}</div>
      <div><strong>Periodo:</strong> ${escHtml(fmtDateIT(start))} – ${escHtml(fmtDateIT(end))}</div>
      <div><strong>Generato:</strong> ${escHtml(generatedAt)}</div>
    </div>
    <ol>${toc}</ol>
  </header>
  ${bodySections.join('\n')}
  <div class="warn">${warnings.map((w) => escHtml(w)).join('<br/>')}</div>
  <div class="footer">FiscoSim fascicolo cliente · basis=modelli_canonici_periodo · definitive=false · file=${escHtml(fileName)}</div>
</body>
</html>`

  return {
    ok: blockers.length === 0,
    definitive: false,
    kind: 'fascicolo_cliente_periodo',
    basis: 'modelli_canonici_periodo',
    blockers,
    warnings,
    sections,
    fileName,
    mimeType: 'text/html;charset=utf-8',
    html,
    period: { societaId, inizio: start, fine: end },
    generatedAt,
  }
}

export function fascicoloHtmlToBytes(html) {
  return new TextEncoder().encode(String(html || ''))
}
