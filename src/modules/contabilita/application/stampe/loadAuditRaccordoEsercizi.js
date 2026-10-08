// Letture read-only per audit raccordo, incluse causali e conti storici inattivi.
// La paginazione e completa ma NON e uno snapshot DB: non autorizza stampe definitive.
import { fetchAllStampeRows, chunkStampeIds } from './fetchAllStampeRows.js'
import { auditRaccordoEserciziModel } from './auditRaccordoEserciziModel.js'

const safeId = v => String(v ?? '').trim()
const FIELDS_PN = 'id,societa_id,numero_registrazione,data_registrazione,causale_id,descrizione,stato,totale_dare,totale_avere'
const FIELDS_ROWS = 'id,prima_nota_id,riga_numero,conto_id,conto_codice,descrizione_riga,importo_dare,importo_avere'

function requireIds(list, label) {
  if (!Array.isArray(list) || list.length === 0
    || list.some(v => !safeId(v))
    || new Set(list.map(safeId)).size !== list.length) {
    throw new Error(label + ': identificativi assenti o duplicati')
  }
  return list.map(safeId)
}

async function rowsForHeaders(db, headers) {
  const byId = new Map()
  for (const batch of chunkStampeIds(headers.map(h => h.id))) {
    const result = await fetchAllStampeRows(() => db.from('prima_nota_righe')
      .select(FIELDS_ROWS)
      .in('prima_nota_id', batch)
      .order('prima_nota_id')
      .order('riga_numero')
      .order('id'), { label: 'Raccordo righe PN' })
    for (const row of result) {
      const pnId = safeId(row.prima_nota_id)
      if (!batch.map(String).includes(pnId)) {
        throw new Error('Raccordo: riga collegata a PN esterna al batch')
      }
      if (!byId.has(pnId)) byId.set(pnId, [])
      byId.get(pnId).push(row)
    }
  }
  if (headers.some(h => !byId.has(safeId(h.id)))) {
    throw new Error('Raccordo: PN priva di righe; lettura sospesa')
  }
  return headers.map(header => ({ ...header, righe: byId.get(safeId(header.id)) || [] }))
}

// Carica tutta la PN dell'anno precedente, senza troncare e senza eliminare
// gli stati non definitivi: l'audit li deve vedere e rifiutare esplicitamente.
export async function loadAuditRaccordoEsercizi(db, {
  societaId, esercizioCorrente, idChiusurePatrimoniali, idRiaperture,
} = {}) {
  const company = safeId(societaId)
  const year = safeId(esercizioCorrente)
  if (!db || typeof db.from !== 'function' || !company
    || !/^\d{4}$/.test(year) || Number(year) <= 1000) {
    throw new Error('Raccordo: societa, anno o connessione non validi')
  }
  const closing = requireIds(idChiusurePatrimoniali, 'Chiusure patrimoniali')
  const opening = requireIds(idRiaperture, 'Riaperture')
  const prevYear = String(Number(year) - 1)
  const yearStart = prevYear + '-01-01'
  const yearEnd = prevYear + '-12-31'
  const [previous, pianoConti, causaliContabili] = await Promise.all([
    fetchAllStampeRows(() => db.from('prima_nota')
      .select(FIELDS_PN)
      .eq('societa_id', company)
      .gte('data_registrazione', yearStart)
      .lte('data_registrazione', yearEnd)
      .order('data_registrazione')
      .order('numero_registrazione')
      .order('id'), { label: 'Raccordo PN anno precedente' }),
    fetchAllStampeRows(() => db.from('piano_conti')
      .select('id,societa_id,codice,descrizione,tipo,natura,parent_id,attivo')
      .eq('societa_id', company)
      .order('codice')
      .order('id'), { label: 'Raccordo piano conti storico' }),
    fetchAllStampeRows(() => db.from('causali_contabili')
      .select('id,societa_id,tipo,attivo')
      .eq('societa_id', company)
      .order('id'), { label: 'Raccordo causali storiche' }),
  ])
  const currentHeaders = []
  for (const ids of chunkStampeIds(opening)) {
    const subset = await fetchAllStampeRows(() => db.from('prima_nota')
      .select(FIELDS_PN)
      .eq('societa_id', company)
      .in('id', ids)
      .order('data_registrazione')
      .order('numero_registrazione')
      .order('id'), { label: 'Raccordo PN riapertura' })
    currentHeaders.push(...subset)
  }
  const received = new Set(currentHeaders.map(h => safeId(h.id)))
  if (received.size !== opening.length || opening.some(id => !received.has(id))) {
    throw new Error('Raccordo: riapertura richiesta assente o fuori societa')
  }
  const [primaNotaEsercizioPrecedente, scrittureRiapertura] = await Promise.all([
    rowsForHeaders(db, previous),
    rowsForHeaders(db, currentHeaders),
  ])
  const result = auditRaccordoEserciziModel({
    societaId: company, esercizioCorrente: year,
    pianoConti, causaliContabili,
    primaNotaEsercizioPrecedente, idChiusurePatrimoniali: closing,
    scrittureRiapertura,
  })
  return {
    ...result,
    evidence: {
      primaNotaAnnoPrecedenteLetta: previous.length,
      riapertureLette: currentHeaders.length,
      pianoContiStoricoLetto: pianoConti.length,
      causaliStoricheLette: causaliContabili.length,
      completenessCertified: false,
      snapshotCertified: false,
    },
  }
}
