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

export function buildLiquidazioneIvaExportCsv(model, meta = {}) {
  const lines = []

  // Metadata
  lines.push(`# PROSPETTO LIQUIDAZIONE IVA PERIODICA`)
  lines.push(`# Società: ${meta.societa || '—'}`)
  lines.push(`# Periodo: ${meta.periodo || '—'}`)
  lines.push(`# Periodicità: ${meta.periodicita || '—'}`)
  lines.push(`# Stato: ${meta.stato || '—'}`)
  lines.push(`# Operatore: ${meta.operatore || '—'}`)
  lines.push(`# Data elaborazione: ${meta.data || '—'}`)
  lines.push('')

  // 1. Riepilogo
  lines.push('1. RIEPILOGO LIQUIDAZIONE')
  lines.push('Voce;Importo')
  const riep = model.riepilogoLiquidazione
  lines.push(`IVA da registro vendite;${escapeCsv(fmt(riep.ivaVendite))}`)
  lines.push(`IVA da registro corrispettivi;${escapeCsv(fmt(riep.ivaCorrispettivi))}`)
  lines.push(`IVA split payment detratta;${escapeCsv(fmt(riep.ivaSplitPayment))}`)
  lines.push(`Totale imposta esigibile;${escapeCsv(fmt(riep.totaleImpostaEsigibile))}`)
  lines.push(`IVA detraibile da registro acquisti;${escapeCsv(fmt(riep.ivaAcquistiDetraibile))}`)
  lines.push(`IVA indetraibile da registro acquisti;${escapeCsv(fmt(riep.ivaAcquistiIndetraibile))}`)
  lines.push(`Totale imposta detraibile;${escapeCsv(fmt(riep.totaleImpostaDetraibile))}`)
  lines.push(`Credito IVA periodo precedente;${escapeCsv(fmt(riep.creditoIvaPrecedente))}`)
  lines.push(`Credito compensabile usato;${escapeCsv(fmt(riep.creditoCompensabileUsato))}`)
  lines.push(`Acconto IVA versato;${escapeCsv(fmt(riep.accontoIva))}`)
  if (riep.interessiTrimestrali > 0) {
    lines.push(`Interessi trimestrali (1%);${escapeCsv(fmt(riep.interessiTrimestrali))}`)
  }
  lines.push(`Risultato finale (${riep.risultatoTipo === 'debito' ? 'Debito' : 'Credito'});${escapeCsv(fmt(riep.risultatoFinale))}`)
  lines.push('')

  // 2. Registro Vendite
  lines.push('2. DETTAGLIO REGISTRO VENDITE')
  lines.push('Codice/Aliquota;Descrizione;Imponibile;IVA Vendite Lorda;IVA Split payment;IVA Debito Effettiva;Esenti/Escluse;Non Imponibili;Righe')
  for (const g of model.dettaglioVendite) {
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
  lines.push(`TOTALE;;${fmt(model.totaliVendite.imponibile)};${fmt(model.totaliVendite.ivaDebitoLorda)};${fmt(model.totaliVendite.ivaSplitEsclusa)};${fmt(model.totaliVendite.ivaDebitoEffettiva)};;;`)
  lines.push('')

  // 3. Registro Acquisti
  lines.push('3. DETTAGLIO REGISTRO ACQUISTI')
  lines.push('Codice/Aliquota;Descrizione;Imponibile;IVA Acquisti;IVA Detraibile;IVA Indetraibile;% Detrazione;Esenti/Escluse;Non Imponibili;Righe')
  for (const g of model.dettaglioAcquisti) {
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
  lines.push(`TOTALE;;${fmt(model.totaliAcquisti.imponibile)};${fmt(model.totaliAcquisti.ivaAcquisti)};${fmt(model.totaliAcquisti.ivaDetraibile)};${fmt(model.totaliAcquisti.ivaIndetraibile)};;;;`)
  lines.push('')

  // 4. IVA per cassa
  lines.push('4. IVA PER CASSA / ESIGIBILITÀ DIFFERITA')
  if (model.ivaPerCassa.length === 0) {
    lines.push('Nessuna operazione IVA per cassa o a esigibilità differita nel periodo.')
  } else {
    lines.push('Documento;Soggetto;Data;Totale Documento;IVA Sospesa;IVA Rilasciata;Residuo;Stato')
    for (const r of model.ivaPerCassa) {
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
  const cred = model.creditoCompensabile
  lines.push(`Credito inizio periodo;${escapeCsv(fmt(cred.inizioPeriodo))}`)
  lines.push(`Credito usato in liquidazione;${escapeCsv(fmt(cred.usatoInLiquidazione))}`)
  lines.push(`Credito usato con F24;${escapeCsv(fmt(cred.usatoF24))}`)
  lines.push(`Credito compensabile finale;${escapeCsv(fmt(cred.finale))}`)
  lines.push(`Credito da riportare;${escapeCsv(fmt(cred.daRiportare))}`)
  lines.push('')

  // 6. Controlli
  lines.push('6. CONTROLLI E WARNING')
  const ctrl = model.controlliWarning
  lines.push(`Registri inclusi;${escapeCsv(ctrl.registriInclusi)}`)
  lines.push(`Registri esclusi;${escapeCsv(ctrl.registriEsclusi)}`)
  lines.push(`Righe escluse per competenza;${escapeCsv(ctrl.righeEscluse)}`)
  lines.push(`Righe escluse per esigibilità;${escapeCsv(ctrl.righeEscluseCassa)}`)
  lines.push(`Operazioni in split payment;${escapeCsv(ctrl.operazioniSplit)}`)
  lines.push(`Operazioni in reverse charge;${escapeCsv(ctrl.operazioniReverse)}`)
  lines.push(`IVA indetraibile rilevata;${escapeCsv(fmt(ctrl.ivaIndetraibileRilevata))}`)
  lines.push(`Stato quadratura controlli;${escapeCsv(ctrl.squadrature)}`)

  return lines.join('\r\n')
}

function grVal(val) {
  return val || 0
}

export function buildLiquidazioneIvaExportHtml(model, meta = {}) {
  const vRows = model.dettaglioVendite.map(g => `
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

  const aRows = model.dettaglioAcquisti.map(g => `
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

  const cassaRows = model.ivaPerCassa.length === 0
    ? `<tr><td colspan="8" class="empty">Nessuna operazione IVA per cassa o a esigibilità differita nel periodo.</td></tr>`
    : model.ivaPerCassa.map(r => `
      <tr>
        <td>${r.documento}</td>
        <td>${r.clienteFornitore}</td>
        <td>${r.dataDocumento}</td>
        <td class="num">${fmt(r.totaleDocumento)}</td>
        <td class="num">${fmt(r.ivaSospesa)}</td>
        <td class="num">${fmt(r.ivaRilasciata)}</td>
        <td class="num">${fmt(r.residuoIvaSospesa)}</td>
        <td>${r.motivo}</td>
      </tr>
    `).join('')

  const riep = model.riepilogoLiquidazione
  const cred = model.creditoCompensabile
  const ctrl = model.controlliWarning

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Prospetto Liquidazione IVA - ${meta.societa || ''}</title>
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
      <div><strong>Società:</strong> ${meta.societa || '—'}</div>
      <div><strong>Periodo:</strong> ${meta.periodo || '—'} (${meta.periodicita || '—'})</div>
      <div><strong>Stato:</strong> ${meta.stato || '—'}</div>
      <div><strong>Operatore Studio:</strong> ${meta.operatore || '—'}</div>
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
          <tr><td>IVA a debito (da registro vendite)</td><td class="num">${fmt(riep.ivaVendite)}</td></tr>
          <tr><td>IVA split payment (esclusa)</td><td class="num">- ${fmt(riep.ivaSplitPayment)}</td></tr>
          <tr class="total-row"><td>Totale imposta esigibile</td><td class="num">${fmt(riep.totaleImpostaEsigibile)}</td></tr>
          <tr><td>IVA detraibile (da registro acquisti)</td><td class="num">- ${fmt(riep.ivaAcquistiDetraibile)}</td></tr>
          <tr><td>Credito IVA periodo precedente</td><td class="num">- ${fmt(riep.creditoIvaPrecedente)}</td></tr>
          <tr><td>Credito compensabile usato</td><td class="num">- ${fmt(riep.creditoCompensabileUsato)}</td></tr>
          <tr><td>Acconto IVA versato</td><td class="num">- ${fmt(riep.accontoIva)}</td></tr>
          ${riep.interessiTrimestrali > 0 ? `<tr><td>Interessi liquidazione trimestrale (1%)</td><td class="num">${fmt(riep.interessiTrimestrali)}</td></tr>` : ''}
          <tr class="total-row" style="background:#f8fafc; color:${riep.risultatoTipo === 'debito' ? '#b91c1c' : '#15803d'}">
            <td><strong>RISULTATO FINALE (${riep.risultatoTipo === 'debito' ? 'DEBITO' : 'CREDITO'})</strong></td>
            <td class="num"><strong>${fmt(riep.risultatoFinale)}</strong></td>
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
          <tr><td>Credito inizio periodo</td><td class="num">${fmt(cred.inizioPeriodo)}</td></tr>
          <tr><td>Credito usato in liquidazione</td><td class="num">${fmt(cred.usatoInLiquidazione)}</td></tr>
          <tr><td>Credito usato con F24</td><td class="num">${fmt(cred.usatoF24)}</td></tr>
          <tr class="total-row"><td>Credito da riportare al periodo succ.</td><td class="num">${fmt(cred.daRiportare)}</td></tr>
        </tbody>
      </table>

      <div class="section-title">3. Controlli FiscoSim</div>
      <div class="card-box">
        <div style="margin-bottom:4px"><strong>Registri inclusi:</strong> ${ctrl.registriInclusi}</div>
        <div style="margin-bottom:4px"><strong>Registri esclusi:</strong> ${ctrl.registriEsclusi}</div>
        <div style="margin-bottom:4px"><strong>Righe escluse competenza:</strong> ${ctrl.righeEscluse}</div>
        <div style="margin-bottom:4px"><strong>Righe differite per cassa:</strong> ${ctrl.righeEscluseCassa}</div>
        <div style="margin-bottom:4px"><strong>Operazioni split payment:</strong> ${ctrl.operazioniSplit}</div>
        <div style="margin-bottom:4px"><strong>Operazioni reverse charge:</strong> ${ctrl.operazioniReverse}</div>
        <div style="margin-bottom:4px"><strong>IVA indetraibile:</strong> ${fmt(ctrl.ivaIndetraibileRilevata)}</div>
        <div style="margin-top:8px; font-weight:700; color:#15803d">Quadratura: ${ctrl.squadrature}</div>
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
        <td class="num">${fmt(model.totaliVendite.imponibile)}</td>
        <td class="num">${fmt(model.totaliVendite.ivaDebitoLorda)}</td>
        <td class="num">${fmt(model.totaliVendite.ivaSplitEsclusa)}</td>
        <td class="num">${fmt(model.totaliVendite.ivaDebitoEffettiva)}</td>
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
        <td class="num">${fmt(model.totaliAcquisti.imponibile)}</td>
        <td class="num">${fmt(model.totaliAcquisti.ivaAcquisti)}</td>
        <td class="num">${fmt(model.totaliAcquisti.ivaDetraibile)}</td>
        <td class="num">${fmt(model.totaliAcquisti.ivaIndetraibile)}</td>
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
    Elaborato il ${meta.data || ''} · Operatore: ${meta.operatore || ''} · FiscoSim Liquidazioni IVA · Stato: ${meta.stato || ''}
  </div>
</body>
</html>`
}
