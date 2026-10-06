/**
 * Risoluzione e identificazione dei conti cespite (Immobilizzazioni).
 * Condiviso tra Registrazione Manuale (lato client/in-memory) e Import Contabilità (lato server/commit).
 */

const norm = (v) => String(v || '').trim()

/**
 * Determina se un conto è un cespite (Immobilizzazione Materiale o Immateriale).
 * @param {object} conto Il record del conto dal piano dei conti o una riga di prima nota
 * @returns {boolean}
 */
export function isCespiteAccount(conto) {
  if (!conto) return false

  const codice = norm(conto.codice || conto.code || conto.sigla || conto.conto_codice || conto.contoCodice)
  const descrizione = norm(conto.descrizione || conto.description || conto.denominazione || conto.nome || conto.conto_descrizione || conto.contoDescrizione || conto.descrizione_riga)
  const tipo = norm(conto.tipo || conto.type || conto.conto_tipo || conto.contoTipo || '').toLowerCase()
  const natura = norm(conto.natura || conto.nature || conto.conto_natura || conto.contoNatura || '').toLowerCase()

  // Normalizzazione codice: rimuove punti, spazi e trattini
  const cleanCode = codice.replace(/[\s.-]/g, '')

  // Regola 1: Prefissi standard contabilità italiana per Immobilizzazioni.
  // Classe 1 (Patrimoniale Attivo), nello specifico:
  // - 1.01 (Immobilizzazioni Immateriali)
  // - 1.02 (Immobilizzazioni Materiali)
  if (cleanCode.startsWith('101') || cleanCode.startsWith('102')) {
    return true
  }

  // Regola 2: Controllo euristico basato su tipo patrimoniale e parole chiave di cespiti.
  // Se non sono presenti tipo o natura, per tolleranza consideriamo patrimoniale attivo se c'è un match forte
  const isPatrimoniale = tipo === 'patrimoniale' || tipo === ''
  const isAttivo = natura === 'attivo' || natura === ''

  if (isPatrimoniale && isAttivo) {
    const keywords = [
      'cespite',
      'cespiti',
      'attrezzatur', // attrezzatura, attrezzature
      'macchinari',  // macchinario, macchinari
      'mobil',       // mobili, mobilio, mobilia
      'arredament',  // arredamento, arredamenti
      'automezz',    // automezzo, automezzi
      'software',
      'hardware',
      'fabbricat',   // fabbricato, fabbricati
      'terren',      // terreno, terreni
      'immobilizzazion', // immobilizzazioni immateriali/materiali
      'impiant',     // impianto, impianti
      'brevet'       // brevetto, brevetti
    ]
    const descLower = descrizione.toLowerCase()
    if (keywords.some(k => descLower.includes(k))) {
      return true
    }
  }

  return false
}

/**
 * Cerca se tra le righe contabili ce n'è almeno una imputata a un conto cespite.
 * @param {Array} rows Le righe contabili (Dare/Avere)
 * @param {Array} pianoConti Il piano dei conti per la risoluzione
 * @returns {object|null} La riga e il conto cespite identificati, oppure null.
 */
export function findCespiteRow(rows = [], pianoConti = []) {
  if (!Array.isArray(rows)) return null
  const catalog = Array.isArray(pianoConti) ? pianoConti : []

  for (const row of rows) {
    const contoId = norm(row.conto_id || row.accountId || row.contoId)
    const contoCodice = norm(row.conto_codice || row.accountCode || row.contoCodice)
    const query = norm(row.contoQuery || row.conto || '')

    // 1. Cerca nel piano dei conti per ID o codice
    let resolvedConto = null
    if (contoId) {
      resolvedConto = catalog.find(item => norm(item.id) === contoId)
    }
    if (!resolvedConto && contoCodice) {
      resolvedConto = catalog.find(item => norm(item.codice || item.code) === contoCodice)
    }
    if (!resolvedConto && query) {
      resolvedConto = catalog.find(item => norm(item.codice || item.code) === query)
    }

    // 2. Se trovato, controlla se è cespite
    if (resolvedConto) {
      if (isCespiteAccount(resolvedConto)) {
        return { row, conto: resolvedConto }
      }
    } else {
      // 3. Fallback in-memory sulle info della riga stessa (utile per stub/test)
      const tempConto = {
        codice: contoCodice || query,
        descrizione: row.conto_descrizione || row.accountDescription || row.contoDescrizione || '',
        tipo: row.conto_tipo || row.accountType || 'patrimoniale',
        natura: row.conto_natura || row.accountNature || 'attivo'
      }
      if (isCespiteAccount(tempConto)) {
        return { row, conto: tempConto }
      }
    }
  }

  return null
}
