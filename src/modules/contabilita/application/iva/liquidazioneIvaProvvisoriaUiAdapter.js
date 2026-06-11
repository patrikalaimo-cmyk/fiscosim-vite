import { buildLiquidazioneIvaProvvisoria } from './buildLiquidazioneIvaProvvisoria.js'

export function getLiquidazioneIvaProvvisoriaProspetto(rows = [], options = {}) {
  const result = buildLiquidazioneIvaProvvisoria(rows, options)
  
  return {
    stato: result.stato,
    periodoLabel: result.periodicita === 'trimestrale' 
      ? `${options.periodo || ''}° Trimestre` 
      : `Mese ${options.periodo || ''}`,
    periodicita: result.periodicita,
    ivaVenditeLorda: result.ivaVenditeLordo,
    ivaSplitPayment: result.ivaSplitPayment,
    ivaDebitoEffettiva: result.ivaDebitoEffettivo,
    ivaAcquisti: result.ivaAcquistiCredito,
    saldoPeriodo: result.saldoPeriodo,
    saldoADebito: result.saldoADebito,
    saldoACredito: result.saldoACredito,
    righeIncluseCount: result.righeIncluseCount,
    righeEscluseCount: result.righeEscluseCount,
    warnings: result.warnings || [],
    breakdown: result.breakdownRegistri
  }
}
