// API per generazione stampe PDF contabili
// Registro IVA, Giornale, Mastrini, Bilancio, Partitari

export const config = {
  api: { bodyParser: true },
  maxDuration: 60
};

// Genera HTML per PDF
function generateHTML(title, content, options = {}) {
  const { orientation = 'portrait', showHeader = true } = options;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #1a1a2e; padding: 20px; }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #c8a45e; }
    .header h1 { font-size: 18px; color: #1a1a2e; margin-bottom: 5px; }
    .header .sub { font-size: 11px; color: #666; }
    .company { margin-bottom: 15px; padding: 10px; background: #f8f8f8; border-radius: 5px; }
    .company .name { font-size: 14px; font-weight: bold; }
    .company .info { font-size: 9px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    th { background: #1a1a2e; color: white; padding: 8px 5px; text-align: left; font-size: 9px; font-weight: 600; }
    td { padding: 6px 5px; border-bottom: 1px solid #e0e0e0; font-size: 9px; }
    tr:nth-child(even) { background: #fafafa; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .total-row { background: #f0f0f0 !important; font-weight: bold; }
    .total-row td { border-top: 2px solid #1a1a2e; }
    .amount { font-family: 'Courier New', monospace; }
    .amount-positive { color: #2e7d32; }
    .amount-negative { color: #c62828; }
    .section { margin-top: 20px; padding-top: 15px; border-top: 1px solid #ddd; }
    .section-title { font-size: 12px; font-weight: bold; margin-bottom: 10px; color: #1a1a2e; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 8px; color: #999; text-align: center; }
    .page-break { page-break-after: always; }
    @media print {
      body { padding: 10px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  ${showHeader ? `
  <div class="header">
    <h1>${title}</h1>
    <div class="sub">Generato da FiscoSim · ${new Date().toLocaleDateString('it-IT')}</div>
  </div>
  ` : ''}
  ${content}
  <div class="footer">
    FiscoSim v3.0 · Studio Envisioning Srl · Documento generato automaticamente
  </div>
</body>
</html>`;
}

// Formatta numero
const fmt = (n) => n != null ? Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('it-IT') : '—';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tipo, societa, dati, periodo } = req.body;

  try {
    let html = '';
    let title = '';

    // ═══════════════════════════════════════════
    // REGISTRO IVA
    // ═══════════════════════════════════════════
    if (tipo === 'registro_iva') {
      const { registroTipo, movimenti } = dati; // vendite, acquisti, corrispettivi
      title = `Registro IVA ${registroTipo === 'vendite' ? 'Vendite' : registroTipo === 'acquisti' ? 'Acquisti' : 'Corrispettivi'}`;
      
      let totImponibile = 0, totImposta = 0;
      
      let rows = movimenti.map(m => {
        totImponibile += parseFloat(m.imponibile || 0);
        totImposta += parseFloat(m.imposta || 0);
        return `
          <tr>
            <td class="text-center">${m.protocollo || ''}</td>
            <td>${fmtDate(m.data_registrazione)}</td>
            <td>${fmtDate(m.data_documento)}</td>
            <td>${m.numero_documento || ''}</td>
            <td>${m.cliente_fornitore_nome || ''}</td>
            <td>${m.causale_iva_codice || ''}</td>
            <td class="text-right amount">${fmt(m.imponibile)}</td>
            <td class="text-right amount">${fmt(m.imposta)}</td>
          </tr>
        `;
      }).join('');

      const content = `
        <div class="company">
          <div class="name">${societa?.denominazione || 'Società'}</div>
          <div class="info">P.IVA: ${societa?.partita_iva || '—'} · CF: ${societa?.codice_fiscale || '—'}</div>
        </div>
        <div class="section-title">Periodo: ${periodo || 'Completo'}</div>
        <table>
          <thead>
            <tr>
              <th class="text-center" style="width:60px">Prot.</th>
              <th style="width:80px">Data Reg.</th>
              <th style="width:80px">Data Doc.</th>
              <th style="width:80px">N° Doc.</th>
              <th>Cliente/Fornitore</th>
              <th style="width:60px">Cod.IVA</th>
              <th class="text-right" style="width:100px">Imponibile</th>
              <th class="text-right" style="width:100px">Imposta</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="6" class="text-right"><strong>TOTALI</strong></td>
              <td class="text-right amount"><strong>${fmt(totImponibile)}</strong></td>
              <td class="text-right amount"><strong>${fmt(totImposta)}</strong></td>
            </tr>
          </tbody>
        </table>
      `;
      
      html = generateHTML(title, content);
    }

    // ═══════════════════════════════════════════
    // GIORNALE CONTABILE
    // ═══════════════════════════════════════════
    else if (tipo === 'giornale') {
      const { scritture } = dati;
      title = 'Giornale Contabile';
      
      let totDare = 0, totAvere = 0;
      
      let rows = scritture.map(s => {
        totDare += parseFloat(s.totale_dare || 0);
        totAvere += parseFloat(s.totale_avere || 0);
        return `
          <tr>
            <td class="text-center">${s.numero_registrazione}</td>
            <td>${fmtDate(s.data_registrazione)}</td>
            <td><strong>${s.causale_codice}</strong></td>
            <td>${s.descrizione || s.cliente_fornitore_nome || ''}</td>
            <td>${s.numero_documento || ''}</td>
            <td class="text-right amount amount-positive">${s.totale_dare > 0 ? fmt(s.totale_dare) : ''}</td>
            <td class="text-right amount amount-negative">${s.totale_avere > 0 ? fmt(s.totale_avere) : ''}</td>
          </tr>
        `;
      }).join('');

      const content = `
        <div class="company">
          <div class="name">${societa?.denominazione || 'Società'}</div>
          <div class="info">P.IVA: ${societa?.partita_iva || '—'}</div>
        </div>
        <div class="section-title">Periodo: ${periodo || 'Completo'} · Scritture: ${scritture.length}</div>
        <table>
          <thead>
            <tr>
              <th class="text-center" style="width:50px">N°</th>
              <th style="width:80px">Data</th>
              <th style="width:60px">Causale</th>
              <th>Descrizione</th>
              <th style="width:80px">N° Doc.</th>
              <th class="text-right" style="width:100px">Dare</th>
              <th class="text-right" style="width:100px">Avere</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="5" class="text-right"><strong>TOTALI</strong></td>
              <td class="text-right amount"><strong>${fmt(totDare)}</strong></td>
              <td class="text-right amount"><strong>${fmt(totAvere)}</strong></td>
            </tr>
          </tbody>
        </table>
      `;
      
      html = generateHTML(title, content);
    }

    // ═══════════════════════════════════════════
    // MASTRINO
    // ═══════════════════════════════════════════
    else if (tipo === 'mastrino') {
      const { conto, movimenti } = dati;
      title = `Mastrino - ${conto.codice} ${conto.descrizione}`;
      
      let saldo = parseFloat(conto.saldo_iniziale || 0);
      
      let rows = movimenti.map(m => {
        const dare = parseFloat(m.importo_dare || 0);
        const avere = parseFloat(m.importo_avere || 0);
        saldo += dare - avere;
        return `
          <tr>
            <td>${fmtDate(m.data_registrazione)}</td>
            <td>${m.causale_codice}</td>
            <td>${m.descrizione_riga || m.descrizione || ''}</td>
            <td class="text-right amount">${dare > 0 ? fmt(dare) : ''}</td>
            <td class="text-right amount">${avere > 0 ? fmt(avere) : ''}</td>
            <td class="text-right amount ${saldo >= 0 ? 'amount-positive' : 'amount-negative'}">${fmt(saldo)}</td>
          </tr>
        `;
      }).join('');

      const content = `
        <div class="company">
          <div class="name">${societa?.denominazione || 'Società'}</div>
        </div>
        <div class="section-title">
          Conto: <strong>${conto.codice}</strong> - ${conto.descrizione}<br>
          Saldo iniziale: ${fmt(conto.saldo_iniziale || 0)}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:80px">Data</th>
              <th style="width:60px">Causale</th>
              <th>Descrizione</th>
              <th class="text-right" style="width:100px">Dare</th>
              <th class="text-right" style="width:100px">Avere</th>
              <th class="text-right" style="width:100px">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="5" class="text-right"><strong>SALDO FINALE</strong></td>
              <td class="text-right amount ${saldo >= 0 ? 'amount-positive' : 'amount-negative'}"><strong>${fmt(saldo)}</strong></td>
            </tr>
          </tbody>
        </table>
      `;
      
      html = generateHTML(title, content);
    }

    // ═══════════════════════════════════════════
    // BILANCIO DI VERIFICA
    // ═══════════════════════════════════════════
    else if (tipo === 'bilancio_verifica') {
      const { conti } = dati;
      title = 'Bilancio di Verifica';
      
      let totDare = 0, totAvere = 0, totSaldoDare = 0, totSaldoAvere = 0;
      
      let rows = conti.filter(c => c.saldo_dare > 0 || c.saldo_avere > 0).map(c => {
        const saldoD = parseFloat(c.saldo_dare || 0);
        const saldoA = parseFloat(c.saldo_avere || 0);
        const saldo = saldoD - saldoA;
        totDare += saldoD;
        totAvere += saldoA;
        if (saldo > 0) totSaldoDare += saldo;
        else totSaldoAvere += Math.abs(saldo);
        
        return `
          <tr>
            <td><code>${c.codice}</code></td>
            <td>${c.descrizione}</td>
            <td class="text-right amount">${saldoD > 0 ? fmt(saldoD) : ''}</td>
            <td class="text-right amount">${saldoA > 0 ? fmt(saldoA) : ''}</td>
            <td class="text-right amount amount-positive">${saldo > 0 ? fmt(saldo) : ''}</td>
            <td class="text-right amount amount-negative">${saldo < 0 ? fmt(Math.abs(saldo)) : ''}</td>
          </tr>
        `;
      }).join('');

      const content = `
        <div class="company">
          <div class="name">${societa?.denominazione || 'Società'}</div>
        </div>
        <div class="section-title">Periodo: ${periodo || 'Completo'}</div>
        <table>
          <thead>
            <tr>
              <th style="width:100px">Codice</th>
              <th>Descrizione Conto</th>
              <th class="text-right" style="width:100px">Tot. Dare</th>
              <th class="text-right" style="width:100px">Tot. Avere</th>
              <th class="text-right" style="width:100px">Saldo Dare</th>
              <th class="text-right" style="width:100px">Saldo Avere</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="2" class="text-right"><strong>TOTALI</strong></td>
              <td class="text-right amount"><strong>${fmt(totDare)}</strong></td>
              <td class="text-right amount"><strong>${fmt(totAvere)}</strong></td>
              <td class="text-right amount"><strong>${fmt(totSaldoDare)}</strong></td>
              <td class="text-right amount"><strong>${fmt(totSaldoAvere)}</strong></td>
            </tr>
          </tbody>
        </table>
      `;
      
      html = generateHTML(title, content);
    }

    // ═══════════════════════════════════════════
    // SITUAZIONE PATRIMONIALE/ECONOMICA
    // ═══════════════════════════════════════════
    else if (tipo === 'situazione_contabile') {
      const { conti, tipoSituazione } = dati; // patrimoniale o economico
      title = tipoSituazione === 'patrimoniale' ? 'Situazione Patrimoniale' : 'Situazione Economica';
      
      const filteredConti = conti.filter(c => 
        tipoSituazione === 'patrimoniale' ? c.tipo === 'patrimoniale' : c.tipo === 'economico'
      );
      
      // Raggruppa per natura
      const gruppi = {};
      filteredConti.forEach(c => {
        const natura = c.natura || 'altro';
        if (!gruppi[natura]) gruppi[natura] = [];
        gruppi[natura].push(c);
      });

      let content = `
        <div class="company">
          <div class="name">${societa?.denominazione || 'Società'}</div>
        </div>
      `;

      Object.entries(gruppi).forEach(([natura, lista]) => {
        const totale = lista.reduce((s, c) => s + (parseFloat(c.saldo_dare || 0) - parseFloat(c.saldo_avere || 0)), 0);
        content += `
          <div class="section">
            <div class="section-title">${natura.toUpperCase()}</div>
            <table>
              <thead><tr><th>Codice</th><th>Descrizione</th><th class="text-right">Saldo</th></tr></thead>
              <tbody>
                ${lista.map(c => `
                  <tr>
                    <td><code>${c.codice}</code></td>
                    <td>${c.descrizione}</td>
                    <td class="text-right amount">${fmt(parseFloat(c.saldo_dare || 0) - parseFloat(c.saldo_avere || 0))}</td>
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td colspan="2" class="text-right"><strong>Totale ${natura}</strong></td>
                  <td class="text-right amount"><strong>${fmt(totale)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      });

      html = generateHTML(title, content);
    }

    // ═══════════════════════════════════════════
    // PARTITARIO
    // ═══════════════════════════════════════════
    else if (tipo === 'partitario') {
      const { partite, tipoPartitario } = dati; // clienti o fornitori
      title = `Partitario ${tipoPartitario === 'clienti' ? 'Clienti' : 'Fornitori'}`;
      
      let totAperte = 0, totParziali = 0, totChiuse = 0;
      
      let rows = partite.map(p => {
        if (p.stato === 'aperta') totAperte += parseFloat(p.importo_residuo || p.importo_originale || 0);
        else if (p.stato === 'parziale') totParziali += parseFloat(p.importo_residuo || 0);
        
        return `
          <tr>
            <td>${fmtDate(p.data_documento)}</td>
            <td>${p.numero_documento || ''}</td>
            <td>${p.conto_descrizione || ''}</td>
            <td class="text-right amount">${fmt(p.importo_originale)}</td>
            <td class="text-right amount">${fmt(p.importo_pagato)}</td>
            <td class="text-right amount ${p.importo_residuo > 0 ? 'amount-negative' : ''}">${fmt(p.importo_residuo)}</td>
            <td class="text-center">${fmtDate(p.data_scadenza)}</td>
            <td class="text-center"><span style="color:${p.stato === 'aperta' ? '#c62828' : p.stato === 'parziale' ? '#f9a825' : '#2e7d32'}">${p.stato}</span></td>
          </tr>
        `;
      }).join('');

      const content = `
        <div class="company">
          <div class="name">${societa?.denominazione || 'Società'}</div>
        </div>
        <div class="section-title">
          Partite: ${partite.length} · 
          Aperte: ${fmt(totAperte)} · 
          Parziali: ${fmt(totParziali)}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:80px">Data Doc.</th>
              <th style="width:80px">N° Doc.</th>
              <th>Cliente/Fornitore</th>
              <th class="text-right" style="width:90px">Importo</th>
              <th class="text-right" style="width:90px">Pagato</th>
              <th class="text-right" style="width:90px">Residuo</th>
              <th class="text-center" style="width:80px">Scadenza</th>
              <th class="text-center" style="width:70px">Stato</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      
      html = generateHTML(title, content);
    }

    // ═══════════════════════════════════════════
    // LIQUIDAZIONE IVA
    // ═══════════════════════════════════════════
    else if (tipo === 'liquidazione_iva') {
      const { liquidazione, dettaglio } = dati;
      title = `Liquidazione IVA - ${liquidazione.tipo_periodo === 'mensile' ? 'Mese' : 'Trimestre'} ${liquidazione.periodo}/${liquidazione.anno}`;
      
      const content = `
        <div class="company">
          <div class="name">${societa?.denominazione || 'Società'}</div>
          <div class="info">P.IVA: ${societa?.partita_iva || '—'}</div>
        </div>
        
        <table>
          <tr><td style="width:60%"><strong>IVA a debito (vendite)</strong></td><td class="text-right amount">${fmt(liquidazione.iva_vendite)}</td></tr>
          <tr><td><strong>IVA a credito (acquisti)</strong></td><td class="text-right amount">${fmt(liquidazione.iva_acquisti)}</td></tr>
          <tr><td>Credito periodo precedente</td><td class="text-right amount">${fmt(liquidazione.credito_periodo_precedente)}</td></tr>
          <tr class="total-row">
            <td><strong>${liquidazione.iva_da_versare > 0 ? 'IVA DA VERSARE' : 'CREDITO DA RIPORTARE'}</strong></td>
            <td class="text-right amount ${liquidazione.iva_da_versare > 0 ? 'amount-negative' : 'amount-positive'}">
              <strong>${fmt(liquidazione.iva_da_versare > 0 ? liquidazione.iva_da_versare : liquidazione.credito_da_riportare)}</strong>
            </td>
          </tr>
        </table>

        ${dettaglio ? `
        <div class="section">
          <div class="section-title">Dettaglio per aliquota</div>
          <table>
            <thead><tr><th>Aliquota</th><th class="text-right">Imponibile</th><th class="text-right">Imposta</th></tr></thead>
            <tbody>
              ${dettaglio.map(d => `
                <tr>
                  <td>${d.aliquota}%</td>
                  <td class="text-right amount">${fmt(d.imponibile)}</td>
                  <td class="text-right amount">${fmt(d.imposta)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}
      `;
      
      html = generateHTML(title, content);
    }

    else {
      return res.status(400).json({ error: 'Tipo stampa non valido' });
    }

    // Restituisci HTML (il client può convertirlo in PDF)
    return res.status(200).json({ 
      success: true, 
      html,
      title
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Errore generazione stampa', message: error.message });
  }
}
