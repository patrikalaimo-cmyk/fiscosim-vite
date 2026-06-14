import * as XLSX from 'xlsx'

function escapeCsv(value) {
  const text = String(value ?? '')
  if (/[",\r\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function fmt(n) {
  const val = Number(n || 0)
  return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function grVal(val) {
  return val || 0
}

export function buildLiquidazioneIvaExportModel(prospettoModel, meta = {}) {
  const {
    dettaglioVendite = [],
    totaliVendite = {},
    dettaglioAcquisti = [],
    totaliAcquisti = {},
    ivaPerCassa = [],
    riepilogoLiquidazione = {},
    creditoCompensabile = {},
    controlliWarning = {}
  } = prospettoModel

  return {
    testata: {
      societa: meta.societa || '—',
      periodo: meta.periodo || '—',
      periodicita: meta.periodicita || '—',
      stato: meta.stato || '—',
      operatore: meta.operatore || '—',
      dataElaborazione: meta.data || new Date().toLocaleString('it-IT')
    },
    riepilogoKpi: {
      ivaVendite: riepilogoLiquidazione.ivaVendite || 0,
      ivaCorrispettivi: riepilogoLiquidazione.ivaCorrispettivi || 0,
      ivaSplitPayment: riepilogoLiquidazione.ivaSplitPayment || 0,
      totaleImpostaEsigibile: riepilogoLiquidazione.totaleImpostaEsigibile || 0,
      ivaAcquistiDetraibile: riepilogoLiquidazione.ivaAcquistiDetraibile || 0,
      ivaAcquistiIndetraibile: riepilogoLiquidazione.ivaAcquistiIndetraibile || 0,
      totaleImpostaDetraibile: riepilogoLiquidazione.totaleImpostaDetraibile || 0,
      creditoIvaPrecedente: riepilogoLiquidazione.creditoIvaPrecedente || 0,
      creditoCompensabileUsato: riepilogoLiquidazione.creditoCompensabileUsato || 0,
      accontoIva: riepilogoLiquidazione.accontoIva || 0,
      interessiTrimestrali: riepilogoLiquidazione.interessiTrimestrali || 0,
      risultatoFinale: riepilogoLiquidazione.risultatoFinale || 0,
      risultatoTipo: riepilogoLiquidazione.risultatoTipo || 'credito'
    },
    registroVendite: {
      dettaglio: dettaglioVendite,
      totali: totaliVendite
    },
    registroAcquisti: {
      dettaglio: dettaglioAcquisti,
      totali: totaliAcquisti
    },
    ivaPerCassa,
    creditoCompensabile,
    controlliWarning
  }
}

export function buildLiquidazioneIvaExportCsv(model, meta = {}) {
  const exportModel = buildLiquidazioneIvaExportModel(model, meta)
  const { testata, riepilogoKpi, registroVendite, registroAcquisti, ivaPerCassa, creditoCompensabile, controlliWarning } = exportModel
  const lines = []

  // Metadata
  lines.push(`# PROSPETTO LIQUIDAZIONE IVA PERIODICA`)
  lines.push(`# Società: ${testata.societa}`)
  lines.push(`# Periodo: ${testata.periodo}`)
  lines.push(`# Periodicità: ${testata.periodicita}`)
  lines.push(`# Stato: ${testata.stato}`)
  lines.push(`# Operatore: ${testata.operatore}`)
  lines.push(`# Data elaborazione: ${testata.dataElaborazione}`)
  lines.push('')

  // 1. Riepilogo
  lines.push('1. RIEPILOGO LIQUIDAZIONE')
  lines.push('Voce;Importo')
  lines.push(`IVA da registro vendite;${escapeCsv(fmt(riepilogoKpi.ivaVendite))}`)
  lines.push(`IVA da registro corrispettivi;${escapeCsv(fmt(riepilogoKpi.ivaCorrispettivi))}`)
  lines.push(`IVA split payment detratta;${escapeCsv(fmt(riepilogoKpi.ivaSplitPayment))}`)
  lines.push(`Totale imposta esigibile;${escapeCsv(fmt(riepilogoKpi.totaleImpostaEsigibile))}`)
  lines.push(`IVA detraibile da registro acquisti;${escapeCsv(fmt(riepilogoKpi.ivaAcquistiDetraibile))}`)
  lines.push(`IVA indetraibile da registro acquisti;${escapeCsv(fmt(riepilogoKpi.ivaAcquistiIndetraibile))}`)
  lines.push(`Totale imposta detraibile;${escapeCsv(fmt(riepilogoKpi.totaleImpostaDetraibile))}`)
  lines.push(`Credito IVA periodo precedente;${escapeCsv(fmt(riepilogoKpi.creditoIvaPrecedente))}`)
  lines.push(`Credito compensabile usato;${escapeCsv(fmt(riepilogoKpi.creditoCompensabileUsato))}`)
  lines.push(`Acconto IVA versato;${escapeCsv(fmt(riepilogoKpi.accontoIva))}`)
  if (riepilogoKpi.interessiTrimestrali > 0) {
    lines.push(`Interessi trimestrali (1%);${escapeCsv(fmt(riepilogoKpi.interessiTrimestrali))}`)
  }
  lines.push(`Risultato finale (${riepilogoKpi.risultatoTipo === 'debito' ? 'Debito' : 'Credito'});${escapeCsv(fmt(riepilogoKpi.risultatoFinale))}`)
  lines.push('')

  // 2. Registro Vendite
  lines.push('2. DETTAGLIO REGISTRO VENDITE')
  lines.push('Codice/Aliquota;Descrizione;Imponibile;IVA Vendite Lorda;IVA Split payment;IVA Debito Effettiva;Esenti/Escluse;Non Imponibili;Righe')
  for (const g of registroVendite.dettaglio) {
    lines.push([
      g.codiceIva,
      g.descrizione,
      fmt(g.imponibile),
      fmt(grVal(g.ivaDebitoLorda)),
      fmt(grVal(g.ivaSplitEsclusa)),
      fmt(grVal(g.ivaDebitoEffettiva)),
      fmt(grVal(g.operazioniEsentiEscluse)),
      fmt(grVal(g.operazioniNonImponibili)),
      g.righe
    ].map(escapeCsv).join(';'))
  }
  lines.push(`TOTALE;;${fmt(registroVendite.totali.imponibile)};${fmt(registroVendite.totali.ivaDebitoLorda)};${fmt(registroVendite.totali.ivaSplitEsclusa)};${fmt(registroVendite.totali.ivaDebitoEffettiva)};;;`)
  lines.push('')

  // 3. Registro Acquisti
  lines.push('3. DETTAGLIO REGISTRO ACQUISTI')
  lines.push('Codice/Aliquota;Descrizione;Imponibile;IVA Acquisti;IVA Detraibile;IVA Indetraibile;% Detrazione;Esenti/Escluse;Non Imponibili;Righe')
  for (const g of registroAcquisti.dettaglio) {
    lines.push([
      g.codiceIva,
      g.descrizione,
      fmt(g.imponibile),
      fmt(grVal(g.ivaAcquisti)),
      fmt(grVal(g.ivaDetraibile)),
      fmt(grVal(g.ivaIndetraibile)),
      `${g.percentualeDetrazione}%`,
      fmt(grVal(g.operazioniEsentiEscluse)),
      fmt(grVal(g.operazioniNonImponibili)),
      g.righe
    ].map(escapeCsv).join(';'))
  }
  lines.push(`TOTALE;;${fmt(registroAcquisti.totali.imponibile)};${fmt(registroAcquisti.totali.ivaAcquisti)};${fmt(registroAcquisti.totali.ivaDetraibile)};${fmt(registroAcquisti.totali.ivaIndetraibile)};;;;`)
  lines.push('')

  // 4. IVA per cassa
  lines.push('4. IVA PER CASSA / ESIGIBILITÀ DIFFERITA')
  if (ivaPerCassa.length === 0) {
    lines.push('Nessuna operazione IVA per cassa o a esigibilità differita nel periodo.')
  } else {
    lines.push('Documento;Soggetto;Data;Totale Documento;IVA Sospesa;IVA Rilasciata;Residuo;Stato')
    for (const r of ivaPerCassa) {
      lines.push([
        r.documento,
        r.clienteFornitore,
        r.dataDocumento,
        fmt(r.totaleDocumento),
        fmt(r.ivaSospesa),
        fmt(r.ivaRilasciata),
        fmt(r.residuoIvaSospesa),
        r.motivo
      ].map(escapeCsv).join(';'))
    }
  }
  lines.push('')

  // 5. Credito compensabile
  lines.push('5. CREDITI E COMPENSAZIONI')
  lines.push('Voce;Importo')
  lines.push(`Credito inizio periodo;${escapeCsv(fmt(creditoCompensabile.inizioPeriodo))}`)
  lines.push(`Credito usato in liquidazione;${escapeCsv(fmt(creditoCompensabile.usatoInLiquidazione))}`)
  lines.push(`Credito usato con F24;${escapeCsv(fmt(creditoCompensabile.usatoF24))}`)
  lines.push(`Credito compensabile finale;${escapeCsv(fmt(creditoCompensabile.finale))}`)
  lines.push(`Credito da riportare;${escapeCsv(fmt(creditoCompensabile.daRiportare))}`)
  lines.push('')

  // 6. Controlli
  lines.push('6. CONTROLLI E WARNING')
  lines.push(`Registri inclusi;${escapeCsv(controlliWarning.registriInclusi)}`)
  lines.push(`Registri esclusi;${escapeCsv(controlliWarning.registriEsclusi)}`)
  lines.push(`Righe escluse per competenza;${escapeCsv(controlliWarning.righeEscluse)}`)
  lines.push(`Righe escluse per esigibilità;${escapeCsv(controlliWarning.righeEscluseCassa)}`)
  lines.push(`Operazioni in split payment;${escapeCsv(controlliWarning.operazioniSplit)}`)
  lines.push(`Operazioni in reverse charge;${escapeCsv(controlliWarning.operazioniReverse)}`)
  lines.push(`IVA indetraibile rilevata;${escapeCsv(fmt(controlliWarning.ivaIndetraibileRilevata))}`)
  lines.push(`Stato quadratura controlli;${escapeCsv(controlliWarning.squadrature)}`)

  return lines.join('\r\n')
}

export function buildLiquidazioneIvaExportHtml(model, meta = {}) {
  const exportModel = buildLiquidazioneIvaExportModel(model, meta)
  const { testata, riepilogoKpi, registroVendite, registroAcquisti, ivaPerCassa, creditoCompensabile, controlliWarning } = exportModel

  const vRows = registroVendite.dettaglio.map(g => `
    <tr>
      <td>${g.codiceIva}</td>
      <td>${g.descrizione}</td>
      <td class="num">${fmt(g.imponibile)}</td>
      <td class="num">${fmt(g.ivaDebitoLorda)}</td>
      <td class="num">${fmt(g.ivaSplitEsclusa)}</td>
      <td class="num">${fmt(g.ivaDebitoEffettiva)}</td>
      <td class="num">${fmt(g.operazioniEsentiEscluse)}</td>
      <td class="num">${fmt(g.operazioniNonImponibili)}</td>
      <td>${g.righe}</td>
    </tr>
  `).join('')

  const aRows = registroAcquisti.dettaglio.map(g => `
    <tr>
      <td>${g.codiceIva}</td>
      <td>${g.descrizione}</td>
      <td class="num">${fmt(g.imponibile)}</td>
      <td class="num">${fmt(g.ivaAcquisti)}</td>
      <td class="num">${fmt(g.ivaDetraibile)}</td>
      <td class="num">${fmt(g.ivaIndetraibile)}</td>
      <td>${g.percentualeDetrazione}%</td>
      <td class="num">${fmt(g.operazioniEsentiEscluse)}</td>
      <td class="num">${fmt(g.operazioniNonImponibili)}</td>
      <td>${g.righe}</td>
    </tr>
  `).join('')

  const cassaRows = ivaPerCassa.length === 0
    ? `<tr><td colspan="8" class="empty">Nessuna operazione IVA per cassa o a esigibilità differita nel periodo.</td></tr>`
    : ivaPerCassa.map(r => `
      <tr>
        <td>${r.documento}</td>
        <td>${r.clienteFornitore}</td>
        <td>${r.dataDocumento ? new Date(r.dataDocumento).toLocaleDateString('it-IT') : '—'}</td>
        <td class="num">${fmt(r.totaleDocumento)}</td>
        <td class="num">${fmt(r.ivaSospesa)}</td>
        <td class="num">${fmt(r.ivaRilasciata)}</td>
        <td class="num">${fmt(r.residuoIvaSospesa)}</td>
        <td>${r.motivo}</td>
      </tr>
    `).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Prospetto Liquidazione IVA - ${testata.societa}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.4; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 15px; }
    .header h1 { font-size: 18px; margin: 0 0 4px; font-weight: 700; color: #0f172a; }
    .header .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 10px; color: #64748b; }
    .section-title { font-size: 12px; font-weight: 700; margin: 15px 0 6px; text-transform: uppercase; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; vertical-align: middle; }
    th { background: #f8fafc; font-weight: 600; font-size: 10px; color: #475569; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row { font-weight: 700; background: #f1f5f9; }
    .empty { text-align: center; color: #94a3b8; padding: 12px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .card-box { border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px; background: #fafafa; }
    .footer { margin-top: 20px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>PROSPETTO LIQUIDAZIONE IVA PERIODICA</h1>
    <div class="meta">
      <div><strong>Società:</strong> ${testata.societa}</div>
      <div><strong>Periodo:</strong> ${testata.periodo} (${testata.periodicita})</div>
      <div><strong>Stato:</strong> ${testata.stato}</div>
      <div><strong>Operatore Studio:</strong> ${testata.operatore}</div>
    </div>
  </div>

  <div class="grid-2">
    <div>
      <div class="section-title">1. Riepilogo Contabile</div>
      <table>
        <thead>
          <tr><th>Voce liquidazione</th><th class="num">Importo</th></tr>
        </thead>
        <tbody>
          <tr><td>IVA a debito (da registro vendite)</td><td class="num">${fmt(riepilogoKpi.ivaVendite)}</td></tr>
          <tr><td>IVA split payment (esclusa)</td><td class="num">- ${fmt(riepilogoKpi.ivaSplitPayment)}</td></tr>
          <tr class="total-row"><td>Totale imposta esigibile</td><td class="num">${fmt(riepilogoKpi.totaleImpostaEsigibile)}</td></tr>
          <tr><td>IVA detraibile (da registro acquisti)</td><td class="num">- ${fmt(riepilogoKpi.ivaAcquistiDetraibile)}</td></tr>
          <tr><td>Credito IVA periodo precedente</td><td class="num">- ${fmt(riepilogoKpi.creditoIvaPrecedente)}</td></tr>
          <tr><td>Credito compensabile usato</td><td class="num">- ${fmt(riepilogoKpi.creditoCompensabileUsato)}</td></tr>
          <tr><td>Acconto IVA versato</td><td class="num">- ${fmt(riepilogoKpi.accontoIva)}</td></tr>
          ${riepilogoKpi.interessiTrimestrali > 0 ? `<tr><td>Interessi liquidazione trimestrale (1%)</td><td class="num">${fmt(riepilogoKpi.interessiTrimestrali)}</td></tr>` : ''}
          <tr class="total-row" style="background:#f8fafc; color:${riepilogoKpi.risultatoTipo === 'debito' ? '#b91c1c' : '#15803d'}">
            <td><strong>RISULTATO FINALE (${riepilogoKpi.risultatoTipo === 'debito' ? 'DEBITO' : 'CREDITO'})</strong></td>
            <td class="num"><strong>${fmt(riepilogoKpi.risultatoFinale)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div>
      <div class="section-title">2. Crediti e Compensazioni</div>
      <table>
        <thead>
          <tr><th>Credito compensabile</th><th class="num">Valore</th></tr>
        </thead>
        <tbody>
          <tr><td>Credito inizio periodo</td><td class="num">${fmt(creditoCompensabile.inizioPeriodo)}</td></tr>
          <tr><td>Credito usato in liquidazione</td><td class="num">${fmt(creditoCompensabile.usatoInLiquidazione)}</td></tr>
          <tr><td>Credito usato con F24</td><td class="num">${fmt(creditoCompensabile.usatoF24)}</td></tr>
          <tr class="total-row"><td>Credito da riportare al periodo succ.</td><td class="num">${fmt(creditoCompensabile.daRiportare)}</td></tr>
        </tbody>
      </table>

      <div class="section-title">3. Controlli FiscoSim</div>
      <div class="card-box">
        <div style="margin-bottom:4px"><strong>Registri inclusi:</strong> ${controlliWarning.registriInclusi}</div>
        <div style="margin-bottom:4px"><strong>Registri esclusi:</strong> ${controlliWarning.registriEsclusi}</div>
        <div style="margin-bottom:4px"><strong>Righe escluse competenza:</strong> ${controlliWarning.righeEscluse}</div>
        <div style="margin-bottom:4px"><strong>Righe differite per cassa:</strong> ${controlliWarning.righeEscluseCassa}</div>
        <div style="margin-bottom:4px"><strong>Operazioni split payment:</strong> ${controlliWarning.operazioniSplit}</div>
        <div style="margin-bottom:4px"><strong>Operazioni reverse charge:</strong> ${controlliWarning.operazioniReverse}</div>
        <div style="margin-bottom:4px"><strong>IVA indetraibile:</strong> ${fmt(controlliWarning.ivaIndetraibileRilevata)}</div>
        <div style="margin-top:8px; font-weight:700; color:#15803d">Quadratura: ${controlliWarning.squadrature}</div>
      </div>
    </div>
  </div>

  <div style="page-break-before: always;"></div>

  <div class="section-title">4. Registro IVA Vendite - Dettaglio Aliquote</div>
  <table>
    <thead>
      <tr>
        <th>Codice</th>
        <th>Descrizione aliquota/natura</th>
        <th class="num">Imponibile</th>
        <th class="num">IVA Lorda</th>
        <th class="num">Split Payment</th>
        <th class="num">Debito Effettivo</th>
        <th class="num">Esenti/Escluse</th>
        <th class="num">Non Imponibili</th>
        <th>Righe</th>
      </tr>
    </thead>
    <tbody>
      ${vRows}
      <tr class="total-row">
        <td colspan="2">TOTALE</td>
        <td class="num">${fmt(registroVendite.totali.imponibile)}</td>
        <td class="num">${fmt(registroVendite.totali.ivaDebitoLorda)}</td>
        <td class="num">${fmt(registroVendite.totali.ivaSplitEsclusa)}</td>
        <td class="num">${fmt(registroVendite.totali.ivaDebitoEffettiva)}</td>
        <td colspan="2"></td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">5. Registro IVA Acquisti - Dettaglio Aliquote</div>
  <table>
    <thead>
      <tr>
        <th>Codice</th>
        <th>Descrizione aliquota/natura</th>
        <th class="num">Imponibile</th>
        <th class="num">IVA Acquisti</th>
        <th class="num">IVA Detraibile</th>
        <th class="num">IVA Indetraibile</th>
        <th>% Detr.</th>
        <th class="num">Esenti/Escluse</th>
        <th class="num">Non Imponibili</th>
        <th>Righe</th>
      </tr>
    </thead>
    <tbody>
      ${aRows}
      <tr class="total-row">
        <td colspan="2">TOTALE</td>
        <td class="num">${fmt(registroAcquisti.totali.imponibile)}</td>
        <td class="num">${fmt(registroAcquisti.totali.ivaAcquisti)}</td>
        <td class="num">${fmt(registroAcquisti.totali.ivaDetraibile)}</td>
        <td class="num">${fmt(registroAcquisti.totali.ivaIndetraibile)}</td>
        <td colspan="3"></td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">6. Operazioni IVA per Cassa / Esigibilità Differita</div>
  <table>
    <thead>
      <tr>
        <th>Documento</th>
        <th>Soggetto</th>
        <th>Data doc.</th>
        <th class="num">Totale</th>
        <th class="num">IVA Sospesa</th>
        <th class="num">IVA Rilasciata</th>
        <th class="num">Residuo Sospesa</th>
        <th>Motivo/Stato</th>
      </tr>
    </thead>
    <tbody>
      ${cassaRows}
    </tbody>
  </table>

  <div class="footer">
    Elaborato il ${testata.dataElaborazione} · Operatore: ${testata.operatore} · FiscoSim Liquidazioni IVA · Stato: ${testata.stato}
  </div>
</body>
</html>`
}

export function buildLiquidazioneIvaExportXlsx(model, meta = {}) {
  const exportModel = buildLiquidazioneIvaExportModel(model, meta)
  const { testata, riepilogoKpi, registroVendite, registroAcquisti, ivaPerCassa, creditoCompensabile, controlliWarning } = exportModel

  const wb = XLSX.utils.book_new()

  // 1. Riepilogo Sheet
  const riepAoa = [
    ["PROSPETTO LIQUIDAZIONE IVA PERIODICA - RIEPILOGO"],
    [],
    ["Società", testata.societa],
    ["Periodo", testata.periodo],
    ["Periodicità", testata.periodicita],
    ["Stato", testata.stato],
    ["Operatore Studio", testata.operatore],
    ["Data elaborazione", testata.dataElaborazione],
    [],
    ["VOCE LIQUIDAZIONE", "IMPORTO"],
    ["IVA a debito (da registro vendite)", riepilogoKpi.ivaVendite],
    ["IVA split payment (esclusa)", riepilogoKpi.ivaSplitPayment],
    ["Totale imposta esigibile", riepilogoKpi.totaleImpostaEsigibile],
    ["IVA detraibile (da registro acquisti)", riepilogoKpi.ivaAcquistiDetraibile],
    ["IVA indetraibile (da registro acquisti)", riepilogoKpi.ivaAcquistiIndetraibile],
    ["Totale imposta detraibile", riepilogoKpi.totaleImpostaDetraibile],
    ["Credito IVA periodo precedente", riepilogoKpi.creditoIvaPrecedente],
    ["Credito compensabile usato", riepilogoKpi.creditoCompensabileUsato],
    ["Acconto IVA versato", riepilogoKpi.accontoIva]
  ]
  if (riepilogoKpi.interessiTrimestrali > 0) {
    riepAoa.push(["Interessi liquidazione trimestrale (1%)", riepilogoKpi.interessiTrimestrali])
  }
  riepAoa.push([
    `RISULTATO FINALE (${riepilogoKpi.risultatoTipo === 'debito' ? 'DEBITO' : 'CREDITO'})`,
    riepilogoKpi.risultatoFinale
  ])

  const wsRiepilogo = XLSX.utils.aoa_to_sheet(riepAoa)

  // 2. Registro vendite Sheet
  const venditeAoa = [
    ["REGISTRO IVA VENDITE - DETTAGLIO ALIQUOTE"],
    [],
    ["Codice/Aliquota", "Descrizione", "Imponibile", "IVA Vendite Lorda", "IVA Split payment", "IVA Debito Effettiva", "Esenti/Escluse", "Non Imponibili", "Righe"]
  ]
  for (const g of registroVendite.dettaglio) {
    venditeAoa.push([
      g.codiceIva,
      g.descrizione,
      g.imponibile,
      g.ivaDebitoLorda,
      g.ivaSplitEsclusa,
      g.ivaDebitoEffettiva,
      g.operazioniEsentiEscluse,
      g.operazioniNonImponibili,
      g.righe
    ])
  }
  venditeAoa.push([
    "TOTALE",
    "",
    registroVendite.totali.imponibile || 0,
    registroVendite.totali.ivaDebitoLorda || 0,
    registroVendite.totali.ivaSplitEsclusa || 0,
    registroVendite.totali.ivaDebitoEffettiva || 0,
    0,
    0,
    ""
  ])
  const wsVendite = XLSX.utils.aoa_to_sheet(venditeAoa)

  // 3. Registro acquisti Sheet
  const acquistiAoa = [
    ["REGISTRO IVA ACQUISTI - DETTAGLIO ALIQUOTE"],
    [],
    ["Codice/Aliquota", "Descrizione", "Imponibile", "IVA Acquisti", "IVA Detraibile", "IVA Indetraibile", "% Detrazione", "Esenti/Escluse", "Non Imponibili", "Righe"]
  ]
  for (const g of registroAcquisti.dettaglio) {
    acquistiAoa.push([
      g.codiceIva,
      g.descrizione,
      g.imponibile,
      g.ivaAcquisti,
      g.ivaDetraibile,
      g.ivaIndetraibile,
      `${g.percentualeDetrazione}%`,
      g.operazioniEsentiEscluse,
      g.operazioniNonImponibili,
      g.righe
    ])
  }
  acquistiAoa.push([
    "TOTALE",
    "",
    registroAcquisti.totali.imponibile || 0,
    registroAcquisti.totali.ivaAcquisti || 0,
    registroAcquisti.totali.ivaDetraibile || 0,
    registroAcquisti.totali.ivaIndetraibile || 0,
    "",
    0,
    0,
    ""
  ])
  const wsAcquisti = XLSX.utils.aoa_to_sheet(acquistiAoa)

  // 4. IVA per cassa Sheet
  const cassaAoa = [
    ["OPERAZIONI IVA PER CASSA / ESIGIBILITÀ DIFFERITA"],
    [],
    ["Documento", "Soggetto", "Data documento", "Totale documento", "IVA sospesa / non esigibile", "IVA rilasciata nel periodo", "Residuo IVA sospesa", "Motivo esclusione/rilascio"]
  ]
  if (ivaPerCassa.length === 0) {
    cassaAoa.push(["Nessuna operazione IVA per cassa o a esigibilità differita nel periodo."])
  } else {
    for (const r of ivaPerCassa) {
      cassaAoa.push([
        r.documento,
        r.clienteFornitore,
        r.dataDocumento,
        r.totaleDocumento,
        r.ivaSospesa,
        r.ivaRilasciata,
        r.residuoIvaSospesa,
        r.motivo
      ])
    }
  }
  const wsCassa = XLSX.utils.aoa_to_sheet(cassaAoa)

  // 5. Crediti Sheet
  const creditiAoa = [
    ["GESTIONE CREDITO COMPENSABILE"],
    [],
    ["Credito compensabile", "Importo"],
    ["Credito compensabile inizio periodo", creditoCompensabile.inizioPeriodo || 0],
    ["Credito usato in liquidazione", creditoCompensabile.usatoInLiquidazione || 0],
    ["Credito usato con F24", creditoCompensabile.usatoF24 || 0],
    ["Credito compensabile finale residuo", creditoCompensabile.finale || 0],
    ["Credito da riportare al periodo successivo", creditoCompensabile.daRiportare || 0]
  ]
  const wsCrediti = XLSX.utils.aoa_to_sheet(creditiAoa)

  // 6. Controlli Sheet
  const controlliAoa = [
    ["CONTROLLI DIAGNOSTICI FISCOSIM"],
    [],
    ["Controllo diagnostico", "Dettaglio"],
    ["Registri inclusi", controlliWarning.registriInclusi || ""],
    ["Registri esclusi", controlliWarning.registriEsclusi || ""],
    ["Righe escluse competenza", controlliWarning.righeEscluse || 0],
    ["Righe differite per cassa", controlliWarning.righeEscluseCassa || 0],
    ["Operazioni split payment", controlliWarning.operazioniSplit || 0],
    ["Operazioni reverse charge", controlliWarning.operazioniReverse || 0],
    ["IVA indetraibile rilevata", controlliWarning.ivaIndetraibileRilevata || 0],
    ["Quadratura", controlliWarning.squadrature || ""]
  ]
  const wsControlli = XLSX.utils.aoa_to_sheet(controlliAoa)

  XLSX.utils.book_append_sheet(wb, wsRiepilogo, 'Riepilogo')
  XLSX.utils.book_append_sheet(wb, wsVendite, 'Registro vendite')
  XLSX.utils.book_append_sheet(wb, wsAcquisti, 'Registro acquisti')
  XLSX.utils.book_append_sheet(wb, wsCassa, 'IVA per cassa')
  XLSX.utils.book_append_sheet(wb, wsCrediti, 'Crediti')
  XLSX.utils.book_append_sheet(wb, wsControlli, 'Controlli')

  return wb
}

// FASE 3: FUNZIONI CENTRALIZZATE PROSPETTO CLIENTE / COMUNICAZIONE CLIENTE
export function resolveLiquidazioneIvaTributo(periodicita, periodoNumero) {
  const p = String(periodicita).toLowerCase()
  const n = Number(periodoNumero)
  if (p === 'mensile') {
    if (n >= 1 && n <= 12) {
      return String(6000 + n)
    }
  } else if (p === 'trimestrale') {
    if (n >= 1 && n <= 4) {
      return String(6030 + n)
    }
  }
  return ''
}

export function resolveLiquidazioneIvaDueDate(periodicita, anno, periodoNumero) {
  const p = String(periodicita).toLowerCase()
  const y = Number(anno)
  const n = Number(periodoNumero)

  if (p === 'mensile') {
    let nextMonth = n + 1
    let nextYear = y
    if (nextMonth > 12) {
      nextMonth = 1
      nextYear += 1
    }
    return formatDueDate(nextYear, nextMonth, 16)
  } else if (p === 'trimestrale') {
    // Q1 -> 16 Maggio, Q2 -> 20 Agosto, Q3 -> 16 Novembre, Q4 -> 16 Marzo del successivo
    if (n === 1) return formatDueDate(y, 5, 16)
    if (n === 2) return formatDueDate(y, 8, 20)
    if (n === 3) return formatDueDate(y, 11, 16)
    if (n === 4) return formatDueDate(y + 1, 3, 16)
  }
  return ''
}

function formatDueDate(year, month, day) {
  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ]
  return `${day} ${months[month - 1]} ${year}`
}

export function buildLiquidazioneIvaClienteModel(prospettoModel, meta = {}) {
  const {
    riepilogoLiquidazione = {},
    totaliVendite = {},
    totaliAcquisti = {},
    ivaPerCassa = []
  } = prospettoModel

  const periodicita = String(meta.periodicita || 'mensile').toLowerCase()
  const periodoNum = Number(meta.periodoNum || 1)
  const anno = Number(meta.anno || new Date().getFullYear())

  // A. Testata
  const testata = {
    societa: meta.societa || '—',
    partitaIva: meta.partitaIva || '—',
    codiceFiscale: meta.codiceFiscale || '—',
    periodoLabel: meta.periodoLabel || '—',
    periodicitaLabel: meta.periodicitaLabel || '—',
    operatore: meta.operatore || '—',
    dataElaborazione: meta.data || new Date().toLocaleString('it-IT')
  }

  // B. IVA esigibile
  const ivaVenditeLorda = totaliVendite.ivaDebitoLorda || 0
  const ivaDifferitaIncassata = ivaPerCassa.reduce((s, r) => s + (r.ivaRilasciata || 0), 0)
  const totaleIvaDebito = ivaVenditeLorda + ivaDifferitaIncassata

  // C. IVA detratta
  const ivaAcquistiDetraibile = totaliAcquisti.ivaDetraibile || 0
  const ivaDifferitaPagata = 0.00
  const totaleIvaDetratta = ivaAcquistiDetraibile + ivaDifferitaPagata

  // D. Risultato
  const saldoPeriodo = riepilogoLiquidazione.risultatoFinale || 0
  const isDebito = riepilogoLiquidazione.risultatoTipo === 'debito'

  const risultato = {
    ivaDebito: isDebito ? (riepilogoLiquidazione.ivaDebitoPeriodo || 0) : 0,
    ivaDebitoSpeciale: 0.00,
    creditoPrecedente: riepilogoLiquidazione.creditoIvaPrecedente || 0,
    creditoCompensabileUsato: riepilogoLiquidazione.creditoCompensabileUsato || 0,
    differenzaDebito: isDebito ? saldoPeriodo : 0,
    differenzaCredito: !isDebito ? saldoPeriodo : 0
  }

  // E. Versamento
  const interessiTrimestrali = isDebito ? (riepilogoLiquidazione.interessiTrimestrali || 0) : 0
  const totaleDaVersare = isDebito ? (saldoPeriodo + interessiTrimestrali) : 0
  const impostaArrotondata = Math.round(totaleDaVersare * 100) / 100

  const tributo = resolveLiquidazioneIvaTributo(periodicita, periodoNum)
  const scadenza = resolveLiquidazioneIvaDueDate(periodicita, anno, periodoNum)

  // F. Sezione Erario F24
  const sezioneErario = {
    codiceTributo: tributo,
    rateazione: '',
    annoRiferimento: String(anno),
    importoDebito: isDebito ? impostaArrotondata : 0,
    importoCredito: 0.00,
    totaleA: isDebito ? impostaArrotondata : 0,
    totaleB: 0,
    saldoAB: isDebito ? impostaArrotondata : 0
  }

  return {
    testata,
    ivaEsigibile: {
      fattureEmesse: ivaVenditeLorda,
      documentiNonFatturati: 0.00,
      ivaDifferitaIncassata,
      totaleIvaDebito
    },
    ivaDetraitta: {
      acquistiBeniServizi: ivaAcquistiDetraibile,
      ivaDifferitaPagata,
      prorata: '100%',
      totaleIvaDetratta
    },
    risultato,
    versamento: {
      isDebito,
      impostaArrotondata,
      interessiTrimestrali,
      totaleDaVersare,
      scadenza,
      tributo
    },
    sezioneErario
  }
}

export function buildLiquidazioneIvaClienteHtml(clienteModel) {
  const { testata, ivaEsigibile, ivaDetraitta, risultato, versamento, sezioneErario } = clienteModel

  const formatEuro = (n) => {
    return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  }

  const isDebito = versamento.isDebito

  const f24Row = isDebito ? `
    <tr>
      <td><strong>IMPOSTE DIRETTE - IVA</strong></td>
      <td class="center">${sezioneErario.codiceTributo}</td>
      <td class="center">${sezioneErario.rateazione || '—'}</td>
      <td class="center">${sezioneErario.annoRiferimento}</td>
      <td class="num">${formatEuro(sezioneErario.importoDebito)}</td>
      <td class="num">${formatEuro(sezioneErario.importoCredito)}</td>
    </tr>
  ` : `
    <tr>
      <td colspan="6" class="empty">Nessun importo da esporre in delega F24.</td>
    </tr>
  `

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Comunicazione Liquidazione IVA - ${testata.societa}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #111827; line-height: 1.5; padding: 20px; }
    .letterhead { border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; }
    .studio-info { font-size: 9px; color: #374151; text-align: right; }
    .client-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 20px; }
    .client-card h3 { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #111827; }
    .title { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 15px; text-transform: uppercase; border-bottom: 2px solid #111827; padding-bottom: 4px; }
    p { margin: 0 0 10px; color: #111827; }
    .section-title { font-size: 11px; font-weight: 700; margin: 15px 0 6px; text-transform: uppercase; color: #111827; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; vertical-align: middle; color: #111827; }
    th { background: #f8fafc; font-weight: 600; font-size: 10px; color: #374151; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .center { text-align: center; }
    .total-row { font-weight: 700; background: #f1f5f9; }
    .empty { text-align: center; color: #374151; padding: 12px; }
    .alert-box { border-radius: 6px; padding: 12px; font-size: 11px; margin-top: 15px; line-height: 1.5; }
    .alert-box-debito { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .alert-box-credito { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
    .f24-title { font-size: 11px; font-weight: 700; margin-top: 25px; text-transform: uppercase; color: #111827; background: #e2e8f0; padding: 4px 8px; border-radius: 4px; }
    .footer { margin-top: 40px; font-size: 9px; color: #374151; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="letterhead">
    <div>
      <strong style="font-size: 14px; color: #0f172a;">FiscoSim</strong><br/>
      <span style="font-size: 10px; color: #64748b;">Software Gestionale Studio Commercialista</span>
    </div>
    <div class="studio-info">
      <strong>STUDIO ASSOCIAZIONE PROFESSIONALE</strong><br/>
      Elaborazione del prospetto periodico IVA<br/>
      Operatore: ${testata.operatore}<br/>
      Data: ${testata.dataElaborazione}
    </div>
  </div>

  <div class="client-card">
    <h3>Documento per:</h3>
    <strong>${testata.societa}</strong><br/>
    ${testata.partitaIva !== '—' ? `Partita IVA: ${testata.partitaIva}` : ''}
    ${testata.codiceFiscale !== '—' && testata.codiceFiscale !== testata.partitaIva ? ` · Codice Fiscale: ${testata.codiceFiscale}` : ''}
  </div>

  <div class="title">Comunicazione Risultato Liquidazione IVA</div>

  <p>
    Si comunica che l'elaborazione dei registri contabili IVA per la periodicità <strong>${testata.periodicitaLabel}</strong> 
    relativa al periodo <strong>${testata.periodoLabel}</strong> presenta il seguente saldo contabile:
  </p>

  <div class="section-title">A. Dettaglio Calcolo Esigibilità ed Acquisti</div>
  <table>
    <thead>
      <tr>
        <th>Voce / Descrizione</th>
        <th class="num">Importo</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Per fatture emesse / registro corrispettivi giornalieri</td>
        <td class="num">${formatEuro(ivaEsigibile.fattureEmesse)}</td>
      </tr>
      <tr>
        <td>Per IVA differita incassata nel periodo</td>
        <td class="num">${formatEuro(ivaEsigibile.ivaDifferitaIncassata)}</td>
      </tr>
      <tr class="total-row">
        <td>Totale IVA a debito esigibile nel periodo</td>
        <td class="num">${formatEuro(ivaEsigibile.totaleIvaDebito)}</td>
      </tr>
      <tr>
        <td>Acquisti di beni e servizi detraibili (compresi CEE/Importazioni)</td>
        <td class="num">${formatEuro(ivaDetraitta.acquistiBeniServizi)}</td>
      </tr>
      <tr>
        <td>Per IVA differita pagata nel periodo</td>
        <td class="num">${formatEuro(ivaDetraitta.ivaDifferitaPagata)}</td>
      </tr>
      <tr class="total-row">
        <td>Totale IVA detratta nel periodo (Pro-rata: ${ivaDetraitta.prorata})</td>
        <td class="num">${formatEuro(ivaDetraitta.totaleIvaDetratta)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">B. Risultato Periodico e Compensazioni</div>
  <table>
    <thead>
      <tr>
        <th>Voce</th>
        <th class="num">Importo</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>IVA a debito risultante</td>
        <td class="num">${formatEuro(risultato.ivaDebito)}</td>
      </tr>
      <tr>
        <td>IVA a debito da regimi speciali</td>
        <td class="num">${formatEuro(risultato.ivaDebitoSpeciale)}</td>
      </tr>
      <tr>
        <td>Riporto credito IVA da periodo precedente</td>
        <td class="num">${formatEuro(risultato.creditoPrecedente)}</td>
      </tr>
      <tr>
        <td>Credito IVA compensabile usato in F24</td>
        <td class="num">${formatEuro(risultato.creditoCompensabileUsato)}</td>
      </tr>
      <tr class="total-row" style="color: ${isDebito ? '#991b1b' : '#166534'}">
        <td>Differenza IVA a debito da versare</td>
        <td class="num">${formatEuro(risultato.differenzaDebito)}</td>
      </tr>
      <tr class="total-row" style="color: ${!isDebito ? '#166534' : 'inherit'}">
        <td>Differenza IVA a credito da portare a nuovo</td>
        <td class="num">${formatEuro(risultato.differenzaCredito)}</td>
      </tr>
    </tbody>
  </table>

  ${isDebito ? `
    <div class="alert-box alert-box-debito">
      <strong>DISPOSIZIONE DI VERSAMENTO:</strong><br/>
      L'importo di <strong>${formatEuro(versamento.impostaArrotondata)}</strong> 
      ${versamento.interessiTrimestrali > 0 ? `(di cui interessi trimestrali 1% pari a ${formatEuro(versamento.interessiTrimestrali)})` : ''} 
      dovrà essere versato entro il <strong>${versamento.scadenza}</strong> tramite modello F24 come riportato nella delega di compilazione seguente.
    </div>
  ` : `
    <div class="alert-box alert-box-credito">
      <strong>RISULTATO A CREDITO:</strong><br/>
      La liquidazione evidenzia un credito IVA di <strong>${formatEuro(risultato.differenzaCredito)}</strong> da riportare al periodo successivo, salvo diversa gestione del credito. Non è dovuto alcun versamento per il periodo elaborato.
    </div>
  `}

  <div class="f24-title">Sezione Erario - Prospetto di delega di compilazione F24</div>
  <table>
    <thead>
      <tr>
        <th>Sezione / Tributo</th>
        <th class="center">Codice tributo</th>
        <th class="center">Rateazione/reg./prov</th>
        <th class="center">Anno rif.</th>
        <th class="num">Importi a debito</th>
        <th class="num">Importi a credito</th>
      </tr>
    </thead>
    <tbody>
      ${f24Row}
      ${isDebito ? `
        <tr class="total-row">
          <td colspan="4">TOTALE A (Importi a debito)</td>
          <td class="num">${formatEuro(sezioneErario.totaleA)}</td>
          <td></td>
        </tr>
        <tr class="total-row">
          <td colspan="4">TOTALE B (Importi a credito)</td>
          <td></td>
          <td class="num">${formatEuro(sezioneErario.totaleB)}</td>
        </tr>
        <tr class="total-row" style="background: #e2e8f0;">
          <td colspan="4">SALDO FINALE (A - B)</td>
          <td class="num" colspan="2" style="text-align: right; font-size: 12px; color: #991b1b;">
            ${formatEuro(sezioneErario.saldoAB)}
          </td>
        </tr>
      ` : ''}
    </tbody>
  </table>

  <div class="footer">
    Documento informativo ad uso interno dello studio e del cliente · Stato liquidazione: ${testata.periodoLabel} (${testata.operatore})
  </div>
</body>
</html>`
}

export function buildLiquidazioneIvaClienteXlsx(clienteModel) {
  const { testata, ivaEsigibile, ivaDetraitta, risultato, versamento, sezioneErario } = clienteModel
  const wb = XLSX.utils.book_new()

  const isDebito = versamento.isDebito

  const f24Rows = isDebito ? [
    ["E. COMPILAZIONE MODELLO F24 (SEZIONE ERARIO)"],
    ["Codice Tributo", "Rateazione", "Anno Riferimento", "Debito Versato", "Credito Compensato"],
    [sezioneErario.codiceTributo, sezioneErario.rateazione, sezioneErario.annoRiferimento, sezioneErario.importoDebito, sezioneErario.importoCredito],
    ["TOTALE A", "", "", sezioneErario.totaleA, ""],
    ["TOTALE B", "", "", "", sezioneErario.totaleB],
    ["SALDO (A - B)", "", "", sezioneErario.saldoAB, ""]
  ] : [
    ["E. COMPILAZIONE MODELLO F24 (SEZIONE ERARIO)"],
    ["Nessun importo da esporre in delega F24."]
  ]

  const aoa = [
    ["COMUNICAZIONE RISULTATO LIQUIDAZIONE IVA PERIODICA"],
    [],
    ["Spett.le", testata.societa],
    ["Partita IVA", testata.partitaIva],
    ["Codice Fiscale", testata.codiceFiscale],
    ["Periodo", testata.periodoLabel],
    ["Periodicità", testata.periodicitaLabel],
    ["Data elaborazione", testata.dataElaborazione],
    [],
    ["A. IVA ESIGIBILE NEL PERIODO"],
    ["Fatture emesse / corrispettivi", ivaEsigibile.fattureEmesse],
    ["IVA differita incassata", ivaEsigibile.ivaDifferitaIncassata],
    ["Totale IVA a debito", ivaEsigibile.totaleIvaDebito],
    [],
    ["B. IVA DETRAIBILE NEL PERIODO"],
    ["Acquisti beni e servizi", ivaDetraitta.acquistiBeniServizi],
    ["IVA differita pagata", ivaDetraitta.ivaDifferitaPagata],
    ["Totale IVA detratta", ivaDetraitta.totaleIvaDetratta],
    [],
    ["C. RISULTATO DELLA LIQUIDAZIONE"],
    ["IVA a debito del periodo", risultato.ivaDebito],
    ["Riporto credito periodo precedente", risultato.creditoPrecedente],
    ["Credito compensabile usato F24", risultato.creditoCompensabileUsato],
    ["Differenza IVA a debito da versare", risultato.differenzaDebito],
    ["Differenza IVA a credito a nuovo", risultato.differenzaCredito],
    [],
    ["D. INDICAZIONI PER IL VERSAMENTO"],
    ["Scadenza versamento", isDebito ? versamento.scadenza : "Nessun versamento dovuto"],
    ["Codice Tributo", isDebito ? versamento.tributo : "—"],
    ["Importo da versare (con interessi)", isDebito ? versamento.impostaArrotondata : 0],
    [],
    ...f24Rows
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  XLSX.utils.book_append_sheet(wb, ws, "Prospetto Cliente")
  return wb
}
