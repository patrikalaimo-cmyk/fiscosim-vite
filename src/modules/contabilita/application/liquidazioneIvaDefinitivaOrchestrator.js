import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { calcoloLiquidazioneIvaDefinitiva } from '../domain/iva/calcoloLiquidazioneIvaDefinitiva.js'

/**
 * Validates input parameters for the consolidation.
 */
function validateInputs({ societaId, periodoInizio, periodoFine, tipoPeriodicita, operatoreStudioId }) {
  const errors = []
  if (!societaId) errors.push('societaId è obbligatorio')
  if (!periodoInizio) errors.push('periodoInizio è obbligatorio')
  if (!periodoFine) errors.push('periodoFine è obbligatorio')
  if (!tipoPeriodicita || (tipoPeriodicita !== 'mensile' && tipoPeriodicita !== 'trimestrale')) {
    errors.push('tipoPeriodicita deve essere "mensile" o "trimestrale"')
  }
  if (!operatoreStudioId) errors.push('operatoreStudioId è obbligatorio')
  return errors
}

/**
 * Prepares the complete payload context for consolidation.
 */
export async function preparaConsolidamentoLiquidazioneIvaDefinitiva({
  societaId,
  periodoInizio,
  periodoFine,
  tipoPeriodicita,
  operatoreStudioId,
  motivo = 'Consolidamento liquidazione IVA definitiva',
  options = {}
}) {
  const validationErrors = validateInputs({ societaId, periodoInizio, periodoFine, tipoPeriodicita, operatoreStudioId })
  if (validationErrors.length > 0) {
    throw new Error(`Errori di validazione input: ${validationErrors.join(', ')}`)
  }

  const { data: rows, error: rowsErr } = await contabilitaRepo.getRegistriIvaByPeriodo(societaId, periodoInizio, periodoFine)
  if (rowsErr) {
    throw new Error(`Errore durante la lettura delle righe registri IVA: ${rowsErr.message || rowsErr}`)
  }

  let risultatoCalcolo
  try {
    risultatoCalcolo = calcoloLiquidazioneIvaDefinitiva(rows || [], {
      societaId,
      periodoInizio,
      periodoFine,
      periodicita: tipoPeriodicita,
      ...options
    })
  } catch (err) {
    throw new Error(`Errore durante il calcolo della liquidazione: ${err.message || err}`)
  }

  // Map snapshot rows for the RPC JSON format
  const mappedRighe = [
    ...risultatoCalcolo.righeIncluse.map(r => ({
      ...r,
      inclusa_in_liquidazione: true,
      motivo_esclusione: null
    })),
    ...risultatoCalcolo.righeEscluse.map(r => ({
      ...r.row,
      inclusa_in_liquidazione: false,
      motivo_esclusione: r.motivo
    }))
  ].map(r => ({
    id: r.id,
    tipo: r.tipo,
    descrizione: r.descrizione || r.descrizione_riga || '',
    descrizione_riga: r.descrizione_riga || r.descrizione || '',
    registro: r.registro_codice || r.registro || '',
    registro_codice: r.registro_codice || r.registro || '',
    aliquota: Number(r.aliquota) || 0,
    natura: r.natura || null,
    imponibile: Number(r.imponibile) || 0,
    iva: Number(r.iva) || 0,
    iva_detraibile: Number(r.iva_detraibile) || 0,
    iva_indetraibile: Number(r.iva_indetraibile) || 0,
    data_documento: r.data || r.data_documento || null,
    numero_documento: r.numero_documento || '',
    metadata: r.metadata || {},
    registro_iva_id: r.id,
    prima_nota_id: r.prima_nota_id,
    tipo_riga: r.tipo_riga || r.tipo || '',
    registro_tipo: r.registro_tipo || r.tipo || '',
    split_payment: !!r.split_payment,
    esigibilita: r.esigibilita || 'immediata',
    inclusa_in_liquidazione: r.inclusa_in_liquidazione,
    motivo_esclusione: r.motivo_esclusione || null
  }))

  const payloadCalcoloRpc = {
    ivaVenditeLorda: risultatoCalcolo.ivaVenditeLorda,
    ivaSplitEsclusa: risultatoCalcolo.ivaSplitEsclusa,
    ivaDebitoEffettiva: risultatoCalcolo.ivaDebitoEffettiva,
    ivaAcquistiDetraibile: risultatoCalcolo.ivaAcquistiDetraibile,
    ivaAcquistiIndetraibile: risultatoCalcolo.ivaAcquistiIndetraibile,
    ivaReverseDebito: risultatoCalcolo.ivaReverseDebito,
    ivaReverseCredito: risultatoCalcolo.ivaReverseCredito,
    ivaPerCassaDifferita: risultatoCalcolo.ivaPerCassaDifferita,
    ivaPerCassaRilasciata: risultatoCalcolo.ivaPerCassaRilasciata,
    creditoPeriodoPrecedente: risultatoCalcolo.creditoPeriodoPrecedente,
    creditoAnnoPrecedente: risultatoCalcolo.creditoAnnoPrecedente,
    creditoCompensatoF24: risultatoCalcolo.creditoCompensatoF24,
    accontoIvaVersato: risultatoCalcolo.accontoIvaVersato,
    interessiTrimestrali: risultatoCalcolo.interessiTrimestrali,
    debitoPeriodo: risultatoCalcolo.debitoPeriodo,
    debitoDaVersare: risultatoCalcolo.debitoDaVersare,
    creditoPeriodo: risultatoCalcolo.creditoPeriodo,
    creditoDaRiportare: risultatoCalcolo.creditoDaRiportare,
    righe: mappedRighe
  }

  return {
    societaId,
    periodoInizio,
    periodoFine,
    tipoPeriodicita,
    operatoreStudioId,
    motivo,
    righeLiquidabili: rows || [],
    risultatoCalcolo,
    payloadCalcoloRpc
  }
}

/**
 * Orchestrates fetching, calculation, payload preparation, and saving.
 */
export async function consolidaLiquidazioneIvaDefinitivaDaPeriodo({
  societaId,
  periodoInizio,
  periodoFine,
  tipoPeriodicita,
  operatoreStudioId,
  motivo = 'Consolidamento liquidazione IVA definitiva',
  options = {}
}) {
  let prep
  try {
    prep = await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId,
      periodoInizio,
      periodoFine,
      tipoPeriodicita,
      operatoreStudioId,
      motivo,
      options
    })
  } catch (err) {
    return { data: null, error: err }
  }

  const { data, error } = await contabilitaRepo.consolidaLiquidazioneIvaDefinitiva({
    societaId,
    periodoInizio,
    periodoFine,
    tipoPeriodicita,
    operatoreStudioId,
    motivo,
    payloadCalcolo: prep.payloadCalcoloRpc
  })

  return { data, error }
}
