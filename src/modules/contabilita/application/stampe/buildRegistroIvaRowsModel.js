/**
 * Helper per costruire il view model dei registri IVA per le stampe (provvisorie o definitive).
 * Riceve le righe grezze caricate da public.registri_iva e le mappa in una struttura uniforme,
 * calcolando totalizzazioni e ordinamento stabile.
 */

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function buildRegistroIvaRowsModel(rows = [], options = {}) {
  const list = Array.isArray(rows) ? rows : []
  
  // 1. Applica ordinamento stabile: data registrazione, data documento, numero documento, id riga
  const sorted = [...list].sort((a, b) => {
    const da = String(a.data || '')
    const db = String(b.data || '')
    if (da !== db) return da.localeCompare(db)
    
    const dda = String(a.data_documento || '')
    const ddb = String(b.data_documento || '')
    if (dda !== ddb) return dda.localeCompare(ddb)
    
    const numA = String(a.numero_documento || '')
    const numB = String(b.numero_documento || '')
    if (numA !== numB) return numA.localeCompare(numB, undefined, { numeric: true })
    
    return String(a.id || '').localeCompare(String(b.id || ''))
  })

  // 2. Mappa le righe e calcola il progressivoProvvisorio
  const mappedRows = sorted.map((row, index) => {
    const multiplier = row.tipo === 'acquisto' && row.segnoRegistro === '-' ? -1 : 1
    
    // Assicuriamoci che detraibile/indetraibile siano risolti correttamente
    const imponibile = round2(row.imponibile)
    const iva = round2(row.iva)
    const ivaDetraibile = round2(row.iva_detraibile)
    const ivaIndetraibile = round2(row.iva_indetraibile)
    
    return {
      id: row.id,
      data_registrazione: row.data,
      data_documento: row.data_documento || row.data,
      numero_documento: row.numero_documento || '—',
      soggetto_denominazione: row.soggetto_denominazione || '—',
      soggetto_piva: row.soggetto_piva || '—',
      imponibile,
      aliquota: row.aliquota != null ? Number(row.aliquota) : null,
      iva,
      iva_detraibile: ivaDetraibile,
      iva_indetraibile: ivaIndetraibile,
      tipo_registro: row.tipo === 'acquisto' ? 'acquisti' : 'vendite',
      esigibilita: row.esigibilita || 'immediata',
      split_payment: row.split_payment === true || row.splitPayment === true,
      prima_nota_id: row.prima_nota_id || null,
      causale_iva_codice: row.causale_codice || '',
      causale_iva_descrizione: row.causale_descrizione || '',
      progressivoProvvisorio: index + 1 // Progressivo temporaneo per la stampa provvisoria
    }
  })

  // 3. Calcola i totalizzatori
  let totaleImponibile = 0
  let totaleIva = 0
  let totaleDetraibile = 0
  let totaleIndetraibile = 0

  for (const r of mappedRows) {
    totaleImponibile += r.imponibile
    totaleIva += r.iva
    totaleDetraibile += r.iva_detraibile
    totaleIndetraibile += r.iva_indetraibile
  }

  // Riepilogo per aliquota/causale
  const riepilogoAliquota = {}
  for (const r of mappedRows) {
    const key = `${r.aliquota || 0}_${r.causale_iva_codice || 'N/A'}`
    if (!riepilogoAliquota[key]) {
      riepilogoAliquota[key] = {
        aliquota: r.aliquota,
        causale_iva_codice: r.causale_iva_codice,
        causale_iva_descrizione: r.causale_iva_descrizione,
        imponibile: 0,
        iva: 0,
        iva_detraibile: 0,
        iva_indetraibile: 0
      }
    }
    riepilogoAliquota[key].imponibile += r.imponibile
    riepilogoAliquota[key].iva += r.iva
    riepilogoAliquota[key].iva_detraibile += r.iva_detraibile
    riepilogoAliquota[key].iva_indetraibile += r.iva_indetraibile
  }

  const riepilogoList = Object.values(riepilogoAliquota).map(item => ({
    aliquota: item.aliquota,
    causale_iva_codice: item.causale_iva_codice,
    causale_iva_descrizione: item.causale_iva_descrizione,
    imponibile: round2(item.imponibile),
    iva: round2(item.iva),
    iva_detraibile: round2(item.iva_detraibile),
    iva_indetraibile: round2(item.iva_indetraibile)
  }))

  return {
    rows: mappedRows,
    totaleImponibile: round2(totaleImponibile),
    totaleIva: round2(totaleIva),
    totaleDetraibile: round2(totaleDetraibile),
    totaleIndetraibile: round2(totaleIndetraibile),
    riepilogo: riepilogoList
  }
}
