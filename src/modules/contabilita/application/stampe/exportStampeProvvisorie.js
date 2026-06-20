import * as XLSX from 'xlsx'

// Helper per escape HTML
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Formattazione data italiana dd/mm/yyyy
export function fmtDateIT(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return escHtml(isoStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return '—';
  }
}

// Formattazione importo Euro italiano
export function fmtEur(num) {
  if (num === null || num === undefined) return '—';
  const val = Number(num);
  if (isNaN(val)) return '—';
  return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// Helper per escape CSV
function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\r\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// Genera stringa CSV per Registri IVA
export function buildRegistroIvaCsv(registroModel, { registroTipo, periodoInizio, periodoFine, societa }) {
  const lines = [];
  const tipoLabel = registroTipo === 'vendite' ? 'Vendite' : registroTipo === 'acquisti' ? 'Acquisti' : 'Corrispettivi';
  
  lines.push(`# REGISTRO IVA ${tipoLabel.toUpperCase()} - ANTEPRIMA PROVVISORIA`);
  lines.push(`# Società: ${societa?.denominazione || '—'}`);
  lines.push(`# Periodo: dal ${fmtDateIT(periodoInizio)} al ${fmtDateIT(periodoFine)}`);
  lines.push(`# Data generazione: ${new Date().toLocaleString('it-IT')}`);
  lines.push(`# Nota: Stampa provvisoria di controllo. I progressivi visualizzati non costituiscono protocollo definitivo e il periodo non risulta chiuso.`);
  lines.push('');
  
  lines.push('Data;Protocollo provvisorio;Numero documento;Cliente/Controparte;Imponibile;IVA;Aliquota;Totale');
  
  if (registroModel && Array.isArray(registroModel.rows)) {
    // Sort rows consistently as shown in UI
    const sortedRows = [...registroModel.rows].sort((a, b) => {
      const dataA = a.data_documento || '';
      const dataB = b.data_documento || '';
      return dataA.localeCompare(dataB);
    });

    for (const r of sortedRows) {
      const prefix = registroTipo === 'vendite' ? 'V' : registroTipo === 'acquisti' ? 'A' : 'C';
      const anno = r.data_registrazione ? new Date(r.data_registrazione).getFullYear() : new Date().getFullYear();
      const protocollo = `${prefix}/${anno}/${String(r.progressivoProvvisorio).padStart(6, '0')}`;
      const totaleRiga = (r.imponibile || 0) + (r.iva || 0);
      const controparteFormatted = r.soggetto_piva && r.soggetto_piva !== '—'
        ? `${r.soggetto_denominazione || '—'} (P.IVA/CF: ${r.soggetto_piva})`
        : (r.soggetto_denominazione || '—');

      lines.push([
        fmtDateIT(r.data_documento),
        protocollo,
        r.numero_documento || '—',
        controparteFormatted,
        fmtEur(r.imponibile),
        fmtEur(r.iva),
        r.aliquota != null ? `${r.aliquota}%` : '—',
        fmtEur(totaleRiga)
      ].map(escapeCsv).join(';'));
    }
  }

  // Totali finali
  lines.push('');
  lines.push(`TOTALE IMPONIBILE;;;;${escapeCsv(fmtEur(registroModel?.totaleImponibile))}`);
  lines.push(`TOTALE IVA;;;;;${escapeCsv(fmtEur(registroModel?.totaleIva))}`);
  lines.push(`TOTALE COMPLESSIVO;;;;;;;${escapeCsv(fmtEur((registroModel?.totaleImponibile || 0) + (registroModel?.totaleIva || 0)))}`);
  lines.push(`NUMERO RIGHE;;;;;;;${registroModel?.rows?.length || 0}`);
  
  return '\uFEFF' + lines.join('\r\n');
}

// Genera file Excel (XLSX) per Registri IVA
export function buildRegistroIvaXlsx(registroModel, { registroTipo, periodoInizio, periodoFine, societa }) {
  const wb = XLSX.utils.book_new();
  const tipoLabel = registroTipo === 'vendite' ? 'Vendite' : registroTipo === 'acquisti' ? 'Acquisti' : 'Corrispettivi';
  
  const infoAoa = [
    [`REGISTRO IVA ${tipoLabel.toUpperCase()} - ANTEPRIMA PROVVISORIA`],
    [],
    ["Società", societa?.denominazione || '—'],
    ["Periodo", `dal ${fmtDateIT(periodoInizio)} al ${fmtDateIT(periodoFine)}`],
    ["Data generazione", new Date().toLocaleString('it-IT')],
    ["Nota", "Stampa provvisoria di controllo. I progressivi visualizzati non costituiscono protocollo definitivo e il periodo non risulta chiuso."],
    [],
    ["Data Doc", "Protocollo provvisorio", "Numero doc", "Cliente/Controparte", "Imponibile", "IVA", "Aliquota", "Totale"]
  ];

  if (registroModel && Array.isArray(registroModel.rows)) {
    const sortedRows = [...registroModel.rows].sort((a, b) => {
      const dataA = a.data_documento || '';
      const dataB = b.data_documento || '';
      return dataA.localeCompare(dataB);
    });

    for (const r of sortedRows) {
      const prefix = registroTipo === 'vendite' ? 'V' : registroTipo === 'acquisti' ? 'A' : 'C';
      const anno = r.data_registrazione ? new Date(r.data_registrazione).getFullYear() : new Date().getFullYear();
      const protocollo = `${prefix}/${anno}/${String(r.progressivoProvvisorio).padStart(6, '0')}`;
      const totaleRiga = (r.imponibile || 0) + (r.iva || 0);
      const controparteFormatted = r.soggetto_piva && r.soggetto_piva !== '—'
        ? `${r.soggetto_denominazione || '—'} (P.IVA/CF: ${r.soggetto_piva})`
        : (r.soggetto_denominazione || '—');

      infoAoa.push([
        fmtDateIT(r.data_documento),
        protocollo,
        r.numero_documento || '—',
        controparteFormatted,
        r.imponibile || 0,
        r.iva || 0,
        r.aliquota != null ? `${r.aliquota}%` : '—',
        totaleRiga
      ]);
    }
  }

  // Aggiungiamo i totali
  infoAoa.push([]);
  infoAoa.push(["TOTALE IMPONIBILE", "", "", "", registroModel?.totaleImponibile || 0]);
  infoAoa.push(["TOTALE IVA", "", "", "", "", registroModel?.totaleIva || 0]);
  infoAoa.push(["TOTALE COMPLESSIVO", "", "", "", "", "", "", (registroModel?.totaleImponibile || 0) + (registroModel?.totaleIva || 0)]);

  const ws = XLSX.utils.aoa_to_sheet(infoAoa);
  XLSX.utils.book_append_sheet(wb, ws, `Registro IVA ${tipoLabel}`);
  return wb;
}

// Genera stringa CSV per Libro Giornale
export function buildGiornaleCsv(flatRows, { periodoInizio, periodoFine, societa }) {
  const lines = [];
  lines.push(`# LIBRO GIORNALE - ANTEPRIMA PROVVISORIA`);
  lines.push(`# Società: ${societa?.denominazione || '—'}`);
  lines.push(`# Periodo: dal ${fmtDateIT(periodoInizio)} al ${fmtDateIT(periodoFine)}`);
  lines.push(`# Data generazione: ${new Date().toLocaleString('it-IT')}`);
  lines.push(`# Nota: Stampa provvisoria di controllo. Il libro giornale definitivo sarà disponibile solo dopo la fase di chiusura e stampa definitiva.`);
  lines.push('');
  
  lines.push('Data;N. PN;Causale;Descrizione;Conto;Descrizione conto;Dare;Avere;Stato');

  if (Array.isArray(flatRows)) {
    for (const r of flatRows) {
      lines.push([
        fmtDateIT(r.data),
        r.numero_pn || '—',
        r.causale || '—',
        r.descrizione || '—',
        r.conto || '—',
        r.descrizione_conto || '—',
        fmtEur(r.dare),
        fmtEur(r.avere),
        r.stato || 'confermata'
      ].map(escapeCsv).join(';'));
    }
  }

  // Totali
  const totDare = Array.isArray(flatRows) ? flatRows.reduce((s, r) => s + (r.dare || 0), 0) : 0;
  const totAvere = Array.isArray(flatRows) ? flatRows.reduce((s, r) => s + (r.avere || 0), 0) : 0;
  const sbilancio = totDare - totAvere;

  lines.push('');
  lines.push(`TOTALE DARE;;;;;;${escapeCsv(fmtEur(totDare))}`);
  lines.push(`TOTALE AVERE;;;;;;;${escapeCsv(fmtEur(totAvere))}`);
  lines.push(`SBILANCIO;;;;;;;;${escapeCsv(fmtEur(sbilancio))}`);
  lines.push(`STATO QUADRATURA;;;;;;;;${Math.abs(sbilancio) < 0.01 ? 'QUADRATO' : 'ATTENZIONE: SBILANCIATO'}`);
  lines.push(`NUMERO RIGHE;;;;;;;;${flatRows?.length || 0}`);

  return '\uFEFF' + lines.join('\r\n');
}

// Genera file Excel (XLSX) per Libro Giornale
export function buildGiornaleXlsx(flatRows, { periodoInizio, periodoFine, societa }) {
  const wb = XLSX.utils.book_new();
  
  const infoAoa = [
    [`LIBRO GIORNALE - ANTEPRIMA PROVVISORIA`],
    [],
    ["Società", societa?.denominazione || '—'],
    ["Periodo", `dal ${fmtDateIT(periodoInizio)} al ${fmtDateIT(periodoFine)}`],
    ["Data generazione", new Date().toLocaleString('it-IT')],
    ["Nota", "Stampa provvisoria di controllo. Il libro giornale definitivo sarà disponibile solo dopo la fase di chiusura e stampa definitiva."],
    [],
    ["Data", "N. PN", "Causale", "Descrizione", "Conto", "Descrizione conto", "Dare", "Avere", "Stato"]
  ];

  if (Array.isArray(flatRows)) {
    for (const r of flatRows) {
      infoAoa.push([
        fmtDateIT(r.data),
        r.numero_pn || '—',
        r.causale || '—',
        r.descrizione || '—',
        r.conto || '—',
        r.descrizione_conto || '—',
        r.dare || 0,
        r.avere || 0,
        r.stato || 'confermata'
      ]);
    }
  }

  const totDare = Array.isArray(flatRows) ? flatRows.reduce((s, r) => s + (r.dare || 0), 0) : 0;
  const totAvere = Array.isArray(flatRows) ? flatRows.reduce((s, r) => s + (r.avere || 0), 0) : 0;
  const sbilancio = totDare - totAvere;

  infoAoa.push([]);
  infoAoa.push(["TOTALE DARE", "", "", "", "", "", totDare]);
  infoAoa.push(["TOTALE AVERE", "", "", "", "", "", "", totAvere]);
  infoAoa.push(["SBILANCIO", "", "", "", "", "", "", "", sbilancio]);
  infoAoa.push(["STATO QUADRATURA", "", "", "", "", "", "", "", Math.abs(sbilancio) < 0.01 ? "QUADRATO" : "ATTENZIONE: SBILANCIATO"]);

  const ws = XLSX.utils.aoa_to_sheet(infoAoa);
  XLSX.utils.book_append_sheet(wb, ws, "Libro Giornale");
  return wb;
}

// Genera HTML di stampa per Registro IVA
export function buildRegistroIvaPrintHtml(registroModel, { registroTipo, periodoInizio, periodoFine, societa }) {
  const tipoLabel = registroTipo === 'vendite' ? 'Vendite' : registroTipo === 'acquisti' ? 'Acquisti' : 'Corrispettivi';
  const dataGenerazione = new Date().toLocaleString('it-IT');
  
  let rowsHtml = '';
  if (registroModel && Array.isArray(registroModel.rows)) {
    const sortedRows = [...registroModel.rows].sort((a, b) => {
      const dataA = a.data_documento || '';
      const dataB = b.data_documento || '';
      return dataA.localeCompare(dataB);
    });

    sortedRows.forEach(r => {
      const prefix = registroTipo === 'vendite' ? 'V' : registroTipo === 'acquisti' ? 'A' : 'C';
      const anno = r.data_registrazione ? new Date(r.data_registrazione).getFullYear() : new Date().getFullYear();
      const protocollo = `${prefix}/${anno}/${String(r.progressivoProvvisorio).padStart(6, '0')}`;
      const totaleRiga = (r.imponibile || 0) + (r.iva || 0);

      const controparteFormatted = escHtml(r.soggetto_denominazione || '—') +
        (r.soggetto_piva && r.soggetto_piva !== '—'
          ? `<br/><span style="font-size: 8px; color: #64748b;">P.IVA/CF: ${escHtml(r.soggetto_piva)}</span>`
          : '');

      rowsHtml += `
        <tr>
          <td>${fmtDateIT(r.data_documento)}</td>
          <td class="mono">${escHtml(protocollo)}</td>
          <td>${escHtml(r.numero_documento || '—')}</td>
          <td>${controparteFormatted}</td>
          <td class="num">${fmtEur(r.imponibile)}</td>
          <td class="num">${fmtEur(r.iva)}</td>
          <td class="center">${r.aliquota != null ? escHtml(r.aliquota) + '%' : '—'}</td>
          <td class="num font-bold">${fmtEur(totaleRiga)}</td>
        </tr>
      `;
    });
  }

  const totaleImponibile = registroModel?.totaleImponibile || 0;
  const totaleIva = registroModel?.totaleIva || 0;
  const totaleComplessivo = totaleImponibile + totaleIva;
  const totaleDetraibile = registroModel?.totaleDetraibile || 0;
  const totaleIndetraibile = registroModel?.totaleIndetraibile || 0;
  const numDocumenti = registroModel ? new Set(registroModel.rows.map(r => r.numero_documento + '_' + r.soggetto_denominazione)).size : 0;
  const hasSplitPayment = registroModel?.rows?.some(r => r.split_payment) || false;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Registro IVA ${tipoLabel} - Provvisorio</title>
  <style>
    @page { size: A4 landscape; margin: 15mm 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.4; margin: 0; padding: 10px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 20px; }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .header h1 { font-size: 18px; margin: 0 0 6px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-provvisorio { background: #fffbeb; border: 1px solid #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 10px; text-transform: uppercase; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; font-size: 10px; color: #475569; margin-top: 10px; }
    .meta-item strong { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: middle; }
    th { background: #f8fafc; font-weight: 700; font-size: 10px; color: #334155; text-transform: uppercase; border-bottom: 2px solid #94a3b8; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .center { text-align: center; }
    .mono { font-family: monospace; font-size: 10px; }
    .font-bold { font-weight: 700; }
    .totali-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 20px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .totale-card { display: flex; flex-direction: column; }
    .totale-card .label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .totale-card .value { font-size: 14px; font-weight: 800; color: #0f172a; font-family: monospace; }
    .nota-obbligatoria { background: #fff5f5; border: 1px solid #fed7d7; color: #c53030; padding: 12px; border-radius: 6px; font-weight: 600; font-size: 10px; margin-top: 20px; text-align: center; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div>
        <h1>Registro IVA ${tipoLabel}</h1>
      </div>
      <div class="badge-provvisorio">Anteprima Provvisoria</div>
    </div>
    <div class="meta-grid">
      <div class="meta-item"><strong>Società:</strong> ${escHtml(societa?.denominazione || '—')}</div>
      <div class="meta-item"><strong>P.IVA:</strong> ${escHtml(societa?.partita_iva || '—')}</div>
      <div class="meta-item"><strong>Periodo:</strong> dal ${fmtDateIT(periodoInizio)} al ${fmtDateIT(periodoFine)}</div>
      <div class="meta-item"><strong>Elaborato il:</strong> ${escHtml(dataGenerazione)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 80px;">Data doc.</th>
        <th style="width: 140px;">Protocollo provv.</th>
        <th style="width: 100px;">Numero doc.</th>
        <th>Cliente/Controparte</th>
        <th class="num" style="width: 110px;">Imponibile</th>
        <th class="num" style="width: 110px;">IVA</th>
        <th class="center" style="width: 70px;">Aliquota</th>
        <th class="num" style="width: 110px;">Totale riga</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="8" class="center" style="padding: 20px; color: #64748b;">Nessun dato presente nel periodo selezionato.</td></tr>'}
    </tbody>
  </table>

  <div class="totali-grid">
    <div class="totale-card">
      <span class="label">Totale Imponibile</span>
      <span class="value">${fmtEur(totaleImponibile)}</span>
    </div>
    <div class="totale-card">
      <span class="label">Totale IVA</span>
      <span class="value">${fmtEur(totaleIva)}</span>
    </div>
    <div class="totale-card">
      <span class="label">Totale Complessivo</span>
      <span class="value">${fmtEur(totaleComplessivo)}</span>
    </div>
    <div class="totale-card">
      <span class="label">Totale IVA Detraibile</span>
      <span class="value">${fmtEur(totaleDetraibile)}</span>
    </div>
    <div class="totale-card">
      <span class="label">Totale IVA Indetraibile</span>
      <span class="value">${fmtEur(totaleIndetraibile)}</span>
    </div>
    <div class="totale-card">
      <span class="label">Righe / Documenti</span>
      <span class="value">${registroModel?.rows?.length || 0} righe / ${numDocumenti} doc.</span>
    </div>
    ${hasSplitPayment ? `
      <div class="totale-card">
        <span class="label">Operazioni Split Payment</span>
        <span class="value">Presenti</span>
      </div>
    ` : ''}
  </div>

  <div class="nota-obbligatoria">
    Stampa provvisoria di controllo. I progressivi visualizzati non costituiscono protocollo definitivo e il periodo non risulta chiuso.
  </div>

  <div class="footer">
    <span>FiscoSim Studio Contabile - Modulo Stampe</span>
    <span>Pagina 1 di 1</span>
  </div>
</body>
</html>`;
}

// Genera HTML di stampa per Libro Giornale
export function buildGiornalePrintHtml(flatRows, { periodoInizio, periodoFine, societa }) {
  const dataGenerazione = new Date().toLocaleString('it-IT');
  
  let rowsHtml = '';
  if (Array.isArray(flatRows)) {
    flatRows.forEach(r => {
      rowsHtml += `
        <tr>
          <td>${fmtDateIT(r.data)}</td>
          <td class="center mono">${escHtml(r.numero_pn || '—')}</td>
          <td class="mono">${escHtml(r.causale || '—')}</td>
          <td>${escHtml(r.descrizione || '—')}</td>
          <td class="mono">${escHtml(r.conto || '—')}</td>
          <td>${escHtml(r.descrizione_conto || '—')}</td>
          <td class="num color-dare">${r.dare > 0 ? fmtEur(r.dare) : '—'}</td>
          <td class="num color-avere">${r.avere > 0 ? fmtEur(r.avere) : '—'}</td>
          <td class="center"><span class="badge-stato badge-${r.stato}">${escHtml(r.stato || 'confermata')}</span></td>
        </tr>
      `;
    });
  }

  const totDare = Array.isArray(flatRows) ? flatRows.reduce((s, r) => s + (r.dare || 0), 0) : 0;
  const totAvere = Array.isArray(flatRows) ? flatRows.reduce((s, r) => s + (r.avere || 0), 0) : 0;
  const sbilancio = totDare - totAvere;
  const isQuadrato = Math.abs(sbilancio) < 0.01;
  const numRegistrazioni = new Set(flatRows?.map(r => r.numero_pn)).size;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Libro Giornale - Provvisorio</title>
  <style>
    @page { size: A4 landscape; margin: 15mm 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 10px; color: #1e293b; line-height: 1.4; margin: 0; padding: 10px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 20px; }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .header h1 { font-size: 18px; margin: 0 0 6px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-provvisorio { background: #fffbeb; border: 1px solid #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 10px; text-transform: uppercase; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; font-size: 10px; color: #475569; margin-top: 10px; }
    .meta-item strong { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: middle; }
    th { background: #f8fafc; font-weight: 700; font-size: 9px; color: #334155; text-transform: uppercase; border-bottom: 2px solid #94a3b8; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .center { text-align: center; }
    .mono { font-family: monospace; }
    .font-bold { font-weight: 700; }
    .color-dare { color: #16a34a; }
    .color-avere { color: #ca8a04; }
    .badge-stato { font-size: 8px; padding: 2px 4px; border-radius: 4px; font-weight: 700; text-transform: uppercase; display: inline-block; }
    .badge-confermata { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
    .badge-simulata { background: #e3f2fd; color: #1565c0; border: 1px solid #90caf9; }
    .badge-stornata { background: #fafafa; color: #616161; border: 1px solid #e0e0e0; }
    .totali-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 20px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .totale-card { display: flex; flex-direction: column; }
    .totale-card .label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .totale-card .value { font-size: 14px; font-weight: 800; color: #0f172a; font-family: monospace; }
    .quadratura-status { font-weight: 700; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
    .quadratura-ok { color: #16a34a; }
    .quadratura-err { color: #dc2626; }
    .nota-obbligatoria { background: #fff5f5; border: 1px solid #fed7d7; color: #c53030; padding: 12px; border-radius: 6px; font-weight: 600; font-size: 10px; margin-top: 20px; text-align: center; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div>
        <h1>Libro Giornale</h1>
      </div>
      <div class="badge-provvisorio">Anteprima Provvisoria</div>
    </div>
    <div class="meta-grid">
      <div class="meta-item"><strong>Società:</strong> ${escHtml(societa?.denominazione || '—')}</div>
      <div class="meta-item"><strong>P.IVA:</strong> ${escHtml(societa?.partita_iva || '—')}</div>
      <div class="meta-item"><strong>Periodo:</strong> dal ${fmtDateIT(periodoInizio)} al ${fmtDateIT(periodoFine)}</div>
      <div class="meta-item"><strong>Elaborato il:</strong> ${escHtml(dataGenerazione)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 70px;">Data</th>
        <th style="width: 50px;" class="center">N. PN</th>
        <th style="width: 50px;">Causale</th>
        <th>Descrizione</th>
        <th style="width: 75px;">Conto</th>
        <th>Descrizione conto</th>
        <th class="num" style="width: 100px;">Dare</th>
        <th class="num" style="width: 100px;">Avere</th>
        <th class="center" style="width: 70px;">Stato</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="9" class="center" style="padding: 20px; color: #64748b;">Nessun dato presente nel periodo selezionato.</td></tr>'}
    </tbody>
  </table>

  <div class="totali-grid">
    <div class="totale-card">
      <span class="label">Totale Dare</span>
      <span class="value color-dare">${fmtEur(totDare)}</span>
    </div>
    <div class="totale-card">
      <span class="label">Totale Avere</span>
      <span class="value color-avere">${fmtEur(totAvere)}</span>
    </div>
    <div class="totale-card">
      <span class="label">Sbilancio</span>
      <span class="value" style="color: ${isQuadrato ? '#1e293b' : '#dc2626'}">${fmtEur(sbilancio)}</span>
    </div>
    <div class="totale-card">
      <span class="label">Quadratura</span>
      <span class="value">
        ${isQuadrato 
          ? '<span class="quadratura-status quadratura-ok">✓ QUADRATO</span>' 
          : '<span class="quadratura-status quadratura-err">⚠ SBILANCIATO</span>'}
      </span>
    </div>
    <div class="totale-card">
      <span class="label">Registrazioni / Righe</span>
      <span class="value">${numRegistrazioni} PN / ${flatRows?.length || 0} righe</span>
    </div>
  </div>

  <div class="nota-obbligatoria">
    Stampa provvisoria di controllo. Il libro giornale definitivo sarà disponibile solo dopo la fase di chiusura e stampa definitiva.
  </div>

  <div class="footer">
    <span>FiscoSim Studio Contabile - Modulo Stampe</span>
    <span>Pagina 1 di 1</span>
  </div>
</body>
</html>`;
}

// Funzione generica per scaricare CSV client-side
export function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Funzione generica per scaricare Excel client-side
export function downloadXlsx(wb, filename) {
  XLSX.writeFile(wb, filename);
}

// Funzione per aprire la finestra di stampa browser in modo sicuro
export function openPrintWindow(htmlString) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Impossibile aprire l'anteprima di stampa. Assicurati che il blocco pop-up sia disattivato.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(htmlString);
  printWindow.document.close();
  printWindow.focus();
  // Ritardo per assicurarsi che l'HTML sia caricato prima del print
  setTimeout(() => {
    printWindow.print();
  }, 350);
}
