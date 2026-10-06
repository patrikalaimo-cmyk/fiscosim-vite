/**
 * Helper per costruire il view model del Libro Giornale per le stampe.
 * Riceve le testate di Prima Nota con le relative righe e calcola totalizzazioni
 * e un ordinamento progressivo provvisorio.
 */

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function buildLibroGiornaleModel(entries = [], options = {}) {
  const list = Array.isArray(entries) ? entries : []

  // 1. Ordinamento stabile per data registrazione, numero registrazione, id
  const sorted = [...list].sort((a, b) => {
    const da = String(a.data_registrazione || '')
    const db = String(b.data_registrazione || '')
    if (da !== db) return da.localeCompare(db)

    const numA = Number(a.numero_registrazione || 0)
    const numB = Number(b.numero_registrazione || 0)
    if (numA !== numB) return numA - numB

    return String(a.id || '').localeCompare(String(b.id || ''))
  })

  // 2. Mappa le registrazioni e calcola i totali Dare/Avere delle righe
  let totaleDare = 0
  let totaleAvere = 0

  const mappedEntries = sorted.map((entry, index) => {
    const rawRows = Array.isArray(entry.righe) ? entry.righe : []
    
    // Ordina le righe contabili per riga_numero
    const sortedRows = [...rawRows].sort((a, b) => Number(a.riga_numero || 0) - Number(b.riga_numero || 0))

    const righe = sortedRows.map(r => {
      const dare = round2(r.importo_dare ?? r.dare)
      const avere = round2(r.importo_avere ?? r.avere)
      totaleDare += dare
      totaleAvere += avere

      return {
        id: r.id,
        riga_numero: r.riga_numero,
        conto_id: r.conto_id,
        conto_codice: r.conto_codice,
        conto_descrizione: r.conto_descrizione,
        descrizione_riga: r.descrizione_riga || '',
        importo_dare: dare,
        importo_avere: avere
      }
    })

    return {
      id: entry.id,
      numero_registrazione: entry.numero_registrazione,
      data_registrazione: entry.data_registrazione,
      data_documento: entry.data_documento || null,
      numero_documento: entry.numero_documento || null,
      causale_codice: entry.causale_codice || 'GEN',
      descrizione: entry.descrizione || '',
      cliente_fornitore_nome: entry.cliente_fornitore_nome || null,
      stato: entry.stato || 'provvisoria',
      totale_dare: round2(entry.totale_dare),
      totale_avere: round2(entry.totale_avere),
      righe,
      progressivoProvvisorio: index + 1 // Progressivo temporaneo per l'ordinamento provvisorio
    }
  })

  return {
    entries: mappedEntries,
    totaleDare: round2(totaleDare),
    totaleAvere: round2(totaleAvere),
    righeCount: mappedEntries.reduce((acc, curr) => acc + curr.righe.length, 0)
  }
}
