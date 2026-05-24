function escapeCsv(value) {
  const text = String(value ?? '')
  if (/[",\r\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function exportConsultazioneResults(rows = [], { mode = 'compact', meta = {} } = {}) {
  const compactHeaders = [
    'Data registrazione',
    'Documento',
    'Conto',
    'Descrizione',
    'Dare',
    'Avere',
    'Saldo progressivo',
  ]
  const fullHeaders = [
    'Data registrazione',
    'Data documento',
    'Numero documento',
    'Conto',
    'Descrizione conto',
    'Descrizione riga',
    'Causale',
    'Causale IVA',
    'Dare',
    'Avere',
    'Saldo progressivo',
    'Soggetto',
    'Stato quadratura',
    'Registro IVA',
    'Protocollo IVA',
  ]
  const headers = mode === 'full' ? fullHeaders : compactHeaders
  const lines = [headers.join(';')]

  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
    lines.unshift(
      Object.entries(meta)
        .map(([key, value]) => `# ${key}: ${value}`)
        .join('\n')
    )
  }

  for (const row of rows || []) {
    const cells = mode === 'full'
      ? [
          row.dataRegistrazione,
          row.dataDocumento,
          row.numeroDocumento,
          `${row.contoCodice || ''}`.trim(),
          row.contoDescrizione,
          row.descrizioneRiga,
          row.causaleContabile,
          row.causaleIva,
          row.dare,
          row.avere,
          row.saldoProgressivo ?? 0,
          row.soggetto,
          row.statoQuadratura,
          row.registroIva,
          row.protocolloIva,
        ]
      : [
          row.dataRegistrazione,
          row.numeroDocumento,
          `${row.contoCodice || ''}`.trim(),
          row.descrizione,
          row.dare,
          row.avere,
          row.saldoProgressivo ?? 0,
        ]
    lines.push(cells.map(escapeCsv).join(';'))
  }

  const csv = lines.join('\r\n')
  return {
    filename: `consultazione_prima_nota_${mode}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    csv,
    rowsCount: (rows || []).length,
  }
}
