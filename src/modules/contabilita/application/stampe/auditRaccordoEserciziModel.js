// Audit deterministico in SOLA LETTURA del raccordo chiusura/riapertura.
// Non deduce causali da descrizioni e non usa piano_conti.saldo_iniziale.
// Validita locale del raccordo != certificazione di completezza/snapshot dei dati.
import { buildSaldiPerContoEsercizioModel } from './buildSaldiPerContoEsercizioModel.js'

const str = value => String(value ?? '').trim()
const cents = value => Math.round(Number(value) * 100)
function add(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code)
}

export function auditRaccordoEserciziModel({
  societaId,
  esercizioCorrente,
  pianoConti = [],
  causaliContabili = [],
  primaNotaEsercizioPrecedente = [],
  idChiusurePatrimoniali = [],
  scrittureRiapertura = [],
} = {}) {
  const blockers = []
  const company = str(societaId)
  const currentYear = str(esercizioCorrente)
  const validYear = /^\d{4}$/.test(currentYear) && Number(currentYear) > 1000
  const previousYear = validYear ? String(Number(currentYear) - 1) : ''
  const options = (year) => ({
    societaId: company, esercizioInizio: year + '-01-01',
    periodoInizio: year + '-01-01', periodoFine: year + '-12-31',
  })
  if (!company || !validYear) add(blockers, 'identita_esercizi_non_valida')
  if (![pianoConti, causaliContabili, primaNotaEsercizioPrecedente,
    idChiusurePatrimoniali, scrittureRiapertura].every(Array.isArray)) {
    add(blockers, 'input_raccordo_non_valido')
  }
  const chart = Array.isArray(pianoConti) ? pianoConti : []
  const causes = Array.isArray(causaliContabili) ? causaliContabili : []
  const previous = Array.isArray(primaNotaEsercizioPrecedente) ? primaNotaEsercizioPrecedente : []
  const closingIds = Array.isArray(idChiusurePatrimoniali) ? idChiusurePatrimoniali.map(str) : []
  const openings = Array.isArray(scrittureRiapertura) ? scrittureRiapertura : []
  const causeById = new Map()
  for (const cause of causes) {
    const id = str(cause?.id)
    if (!id || causeById.has(id) || str(cause?.societa_id) !== company) {
      add(blockers, 'causali_raccordo_identita_non_coerente')
    } else {
      causeById.set(id, cause)
    }
  }
  if (!closingIds.length || !openings.length) add(blockers, 'raccordo_scritture_mancanti')
  if (closingIds.some(id => !id) || new Set(closingIds).size !== closingIds.length) {
    add(blockers, 'chiusure_selezionate_duplicate_o_senza_id')
  }
  const priorById = new Map()
  for (const entry of previous) {
    const id = str(entry?.id)
    if (!id || priorById.has(id)) add(blockers, 'prima_nota_precedente_id_non_univoco')
    else priorById.set(id, entry)
  }
  const closing = closingIds.map(id => priorById.get(id)).filter(Boolean)
  if (closing.length !== closingIds.length) add(blockers, 'chiusura_non_presente_nel_dataset_precedente')
  const previousIds = new Set(previous.map(entry => str(entry?.id)))
  const openingIds = new Set()
  for (const entry of openings) {
    const id = str(entry?.id)
    if (!id || openingIds.has(id) || previousIds.has(id)) add(blockers, 'riapertura_id_non_univoco')
    openingIds.add(id)
  }
  function verifyCausali(entries, expected, year) {
    for (const entry of entries) {
      const code = str(entry?.causale_id)
      const cause = causeById.get(code)
      if (!cause || str(cause.tipo).toLowerCase() !== expected) {
        add(blockers, 'causale_' + expected + '_non_verificata')
      }
      if (str(entry?.societa_id) !== company
        || !str(entry?.data_registrazione).startsWith(year + '-')
        || (entry?.esercizio != null && str(entry.esercizio) !== year)) {
        add(blockers, 'scrittura_' + expected + '_fuori_contesto')
      }
      if (!['confermata', 'definitiva'].includes(str(entry?.stato).toLowerCase())) {
        add(blockers, 'scrittura_' + expected + '_non_contabilizzata')
      }
    }
  }
  verifyCausali(closing, 'chiusura', previousYear)
  verifyCausali(openings, 'apertura', currentYear)

  const prior = buildSaldiPerContoEsercizioModel(previous, chart, options(previousYear))
  const close = buildSaldiPerContoEsercizioModel(closing, chart, options(previousYear))
  const open = buildSaldiPerContoEsercizioModel(openings, chart, options(currentYear))
  if (!prior.valid) add(blockers, 'prima_nota_precedente_non_valida')
  if (!close.valid) add(blockers, 'scritture_chiusura_non_valide')
  if (!open.valid) add(blockers, 'scritture_riapertura_non_valide')
  if (prior.primaNotaIncluse !== previous.length) add(blockers, 'prima_nota_precedente_esclusa')
  if (close.primaNotaIncluse !== closing.length) add(blockers, 'chiusura_non_interamente_contabilizzata')
  if (open.primaNotaIncluse !== openings.length) add(blockers, 'riapertura_non_interamente_contabilizzata')

  // Il precedente esercizio, comprensivo di tutte le scritture di chiusura,
  // deve risultare azzerato. Non e prova di completezza dei dati a monte.
  if (prior.conti.some(conto => cents(conto.saldoFinale) !== 0)) {
    add(blockers, 'esercizio_precedente_non_azzerato')
  }
  if ([...close.conti, ...open.conti].some(conto =>
    conto.tipo === 'economico' && (cents(conto.dare) !== 0 || cents(conto.avere) !== 0))) {
    add(blockers, 'conto_economico_in_chiusura_patrimoniale_o_riapertura')
  }
  const openById = new Map(open.conti.map(row => [row.contoId, row]))
  const raccordo = close.conti.filter(row => row.tipo === 'patrimoniale').map(row => {
    const opening = openById.get(row.contoId)
    const closed = cents(row.saldoFinale)
    const reopened = cents(opening?.saldoFinale ?? 0)
    const difference = closed + reopened
    if (!Number.isSafeInteger(closed) || !Number.isSafeInteger(reopened)
      || !Number.isSafeInteger(difference)) add(blockers, 'raccordo_importi_non_sicuri')
    if (difference !== 0) add(blockers, 'saldo_riapertura_non_corrispondente')
    return {
      contoId: row.contoId, codice: row.codice, natura: row.natura,
      saldoChiusura: row.saldoFinale,
      saldoRiapertura: opening?.saldoFinale ?? 0,
      differenza: difference / 100,
    }
  })
  const hasMovements = raccordo.some(row => cents(row.saldoChiusura) !== 0)
  if (!hasMovements) add(blockers, 'chiusura_patrimoniale_priva_di_movimenti')
  return {
    valid: blockers.length === 0,
    definitive: false,
    kind: 'audit_raccordo_chiusura_riapertura',
    basis: 'prima_nota_canonica_e_causali_contabili',
    period: { societaId: company, esercizioPrecedente: previousYear, esercizioCorrente: currentYear },
    blockers,
    detailBlockers: { precedente: prior.blockers, chiusura: close.blockers, apertura: open.blockers },
    warnings: [
      'Audit sui soli dataset consegnati: non certifica letture complete, snapshot transazionale o assenza di registrazioni omesse.',
      'Le chiusure patrimoniali devono essere selezionate con identificativi espliciti e causale chiusura; nessuna inferenza dal testo.',
      'Il raccordo non autorizza la generazione automatica di scritture né la stampa definitiva.',
    ],
    counts: {
      primaNotaPrecedente: prior.primaNotaIncluse,
      chiusurePatrimoniali: close.primaNotaIncluse,
      riaperture: open.primaNotaIncluse,
    },
    raccordo,
  }
}
