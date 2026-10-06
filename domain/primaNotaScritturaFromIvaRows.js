/**
 * Generazione righe prima nota guidata da ivaRows (unica fonte importi).
 * Nessun fallback silenzioso: conti obbligatori o errore esplicito.
 */

export function isCausaleAcquistoPassiva(causaleContabile) {
  if (!causaleContabile) return true
  const code = String(causaleContabile.codice || '').trim().toUpperCase()
  if (code === 'FF') return true
  if (code === 'FC') return false
  const txt = `${causaleContabile.codice || ''} ${causaleContabile.descrizione || ''}`.toLowerCase()
  if (/forn|acquist|passiv|fattura\s+forn|fattura\s+acquisto/.test(txt)) return true
  if (/vendita|attiv|cliente|corrispett|fattura\s+vendita/.test(txt)) return false
  return true
}

function findContoClienteFornitore({ pianoConti, cliente, isPassiva }) {
  if (!cliente) return null
  // If the "cliente" already is a piano_conti row (preferred model), use it directly.
  if (cliente?.id && cliente?.livello != null && (cliente?.codice || cliente?.descrizione)) {
    return cliente
  }
  const piva = cliente.partita_iva ? String(cliente.partita_iva).trim() : ''
  const denom = cliente.ragione_sociale || `${cliente.nome || ''} ${cliente.cognome || ''}`.trim()
  const byPiva = piva
    ? pianoConti.find(c =>
      (c?.partita_iva === piva || c?.anagrafica_piva === piva) && c?.livello >= 3
    )
    : null
  const byDen = denom
    ? pianoConti.find(c =>
      String(c?.descrizione || '').trim() === String(denom).trim() && c?.livello >= 3
    )
    : null
  const fallback = pianoConti.find(c =>
    (isPassiva ? c?.is_fornitore : c?.is_cliente) && c?.livello >= 4
  )
  return byPiva || byDen || fallback || null
}

function findContoCostiPlaceholder(pianoConti) {
  return pianoConti.find(c => String(c?.codice || '').trim().toUpperCase() === 'COSTI_DA_CLASSIFICARE') || null
}

function findContoRicaviPlaceholder(pianoConti) {
  return pianoConti.find(c => String(c?.codice || '').trim().toUpperCase() === 'RICAVI_DA_CLASSIFICARE') || null
}

function findContoIvaDefault({ pianoConti, isPassiva }) {
  return pianoConti.find(c =>
    c?.is_iva && c?.livello >= 3 &&
    (isPassiva ? /credito/i.test(c?.descrizione || '') : /debito/i.test(c?.descrizione || ''))
  ) || null
}

function resolveContoIvaPerCausale({ causale, pianoConti, isPassiva }) {
  if (!causale) return null
  const explicit = causale.conto_id || causale.conto_iva_id
  if (explicit) {
    const byId = pianoConti.find(c => String(c.id) === String(explicit))
    return byId || null
  }
  return findContoIvaDefault({ pianoConti, isPassiva })
}

function parsePercent(p) {
  if (p == null) return 0
  if (typeof p === 'number') return Number.isFinite(p) ? p : 0
  const s = String(p).trim().toLowerCase()
  const m = s.match(/(\d+(?:[.,]\d+)?)/)
  if (!m) return 0
  const x = parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

function isDetraibileFalse(v) {
  if (v === false || v === 0) return true
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'false' || s === '0' || s === 'no' || s === 'n' || s === 'off' || s === 'f'
}

function getPercDetraibileFromCausale(c) {
  if (!c) return 100
  if (isDetraibileFalse(c.detraibile)) return 0
  const det = parsePercent(c.percentuale_detraibilita)
  if (String(c.percentuale_detraibilita ?? '').trim() !== '') {
    return Math.max(0, Math.min(100, det))
  }
  const ind = parsePercent(c.percentuale_indetraibilita)
  return Math.max(0, Math.min(100, 100 - ind))
}

export function buildScritturaRowsFromIvaRows({
  ivaRows,
  pianoConti = [],
  causaliIva = [],
  clientiFornitori = [],
  clienteFornitoreId,
  causaleContabile,
  soggettoNomeFallback = '',
  newRow
}) {
  if (!Array.isArray(ivaRows) || ivaRows.length === 0) {
    return { rows: null, error: null }
  }

  const isPassiva = isCausaleAcquistoPassiva(causaleContabile)
  const cli = clienteFornitoreId
    ? clientiFornitori.find(c => String(c.id) === String(clienteFornitoreId))
    : null
  const nomeSoggetto = cli
    ? (cli.descrizione || cli.ragione_sociale || `${cli.nome || ''} ${cli.cognome || ''}`.trim())
    : String(soggettoNomeFallback || '').trim() || (isPassiva ? 'Fornitore' : 'Cliente')

  const contoSoggetto = findContoClienteFornitore({ pianoConti, cliente: cli, isPassiva: isPassiva })
  if (!contoSoggetto?.id) {
    return {
      rows: null,
      error:
        'Manca il conto nel piano dei conti per il soggetto selezionato. Collega cliente/fornitore a un sottoconto oppure seleziona un\'anagrafica con P.IVA corrispondente.'
    }
  }

  const contoCosti = findContoCostiPlaceholder(pianoConti)
  const contoRicavi = findContoRicaviPlaceholder(pianoConti)

  if (isPassiva && !contoCosti?.id) {
    return {
      rows: null,
      error: 'Manca il conto costi: crea un conto con codice COSTI_DA_CLASSIFICARE nel piano dei conti.'
    }
  }
  if (!isPassiva && !contoRicavi?.id) {
    return {
      rows: null,
      error: 'Manca il conto ricavi: crea un conto con codice RICAVI_DA_CLASSIFICARE nel piano dei conti.'
    }
  }

  const sorted = [...ivaRows].sort((a, b) => a.aliquota - b.aliquota)
  const out = []
  let tot = 0

  for (const ir of sorted) {
    tot += toNum(ir.imponibile) + toNum(ir.iva)
  }

  if (isPassiva) {
    for (const ir of sorted) {
      const imp = toNum(ir.imponibile)
      const tax = toNum(ir.iva)
      let percDet = 100
      let taxDet = tax
      let taxInd = 0
      if (tax > 0) {
        if (!ir.causale_iva_id) {
          return {
            rows: null,
            error: `Manca la causale IVA per l'aliquota ${ir.aliquota}% (IVA ${tax}).`
          }
        }
        const causale = causaliIva.find(c => String(c.id) === String(ir.causale_iva_id))
        if (!causale) {
          return { rows: null, error: `Causale IVA non trovata in anagrafica (aliquota ${ir.aliquota}%).` }
        }
        percDet = getPercDetraibileFromCausale(causale)
        taxDet = Math.round((tax * percDet / 100) * 100) / 100
        taxInd = Math.round((tax - taxDet) * 100) / 100
      }
      if (imp > 0 || taxInd > 0) {
        out.push({
          ...newRow(),
          conto_id: contoCosti.id,
          descrizione: `Costi (${ir.aliquota}%)`,
          dare: Math.round((imp + taxInd) * 100) / 100,
          avere: '',
          iva_row_id: ir.id,
          tipo_riga_auto: 'costo'
        })
      }
      if (taxDet > 0) {
        const causale = causaliIva.find(c => String(c.id) === String(ir.causale_iva_id))
        const contoIva = resolveContoIvaPerCausale({ causale, pianoConti, isPassiva: true })
        if (!contoIva?.id) {
          return {
            rows: null,
            error:
              'Manca il conto IVA: imposta il conto sulla causale IVA in Impostazioni oppure un conto IVA (credito) nel piano dei conti.'
          }
        }
        out.push({
          ...newRow(),
          conto_id: contoIva.id,
          descrizione: `IVA a credito (${ir.aliquota}%)`,
          dare: taxDet,
          avere: '',
          causale_iva_id: ir.causale_iva_id,
          iva_row_id: ir.id,
          tipo_riga_auto: 'iva'
        })
      }
    }
    out.push({
      ...newRow(),
      conto_id: contoSoggetto.id,
      descrizione: nomeSoggetto,
      dare: '',
      avere: tot,
      tipo_riga_auto: 'soggetto'
    })
  } else {
    out.push({
      ...newRow(),
      conto_id: contoSoggetto.id,
      descrizione: nomeSoggetto,
      dare: tot,
      avere: '',
      tipo_riga_auto: 'soggetto'
    })
    for (const ir of sorted) {
      const imp = toNum(ir.imponibile)
      if (imp > 0) {
        out.push({
          ...newRow(),
          conto_id: contoRicavi.id,
          descrizione: `Ricavi (${ir.aliquota}%)`,
          dare: '',
          avere: imp,
          iva_row_id: ir.id,
          tipo_riga_auto: 'ricavo'
        })
      }
      const tax = toNum(ir.iva)
      if (tax > 0) {
        if (!ir.causale_iva_id) {
          return {
            rows: null,
            error: `Manca la causale IVA per l'aliquota ${ir.aliquota}% (IVA ${tax}).`
          }
        }
        const causale = causaliIva.find(c => String(c.id) === String(ir.causale_iva_id))
        if (!causale) {
          return { rows: null, error: `Causale IVA non trovata in anagrafica (aliquota ${ir.aliquota}%).` }
        }
        const contoIva = resolveContoIvaPerCausale({ causale, pianoConti, isPassiva: false })
        if (!contoIva?.id) {
          return {
            rows: null,
            error:
              'Manca il conto IVA: imposta il conto sulla causale IVA in Impostazioni oppure un conto IVA (debito) nel piano dei conti.'
          }
        }
        out.push({
          ...newRow(),
          conto_id: contoIva.id,
          descrizione: `IVA a debito (${ir.aliquota}%)`,
          dare: '',
          avere: tax,
          causale_iva_id: ir.causale_iva_id,
          iva_row_id: ir.id,
          tipo_riga_auto: 'iva'
        })
      }
    }
  }

  return { rows: out, error: null }
}

function toNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
