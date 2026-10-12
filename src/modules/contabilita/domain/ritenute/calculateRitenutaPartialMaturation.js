/**
 * Split an open withholding position into matured (da_versare) + residual (aperta)
 * using payment / partita residual ratio. Round matured first; residual absorbs delta.
 */
function toAmount(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function round2(value) {
  return Math.round(toAmount(value) * 100) / 100
}

function scalePair(total, ratioNumerator, ratioDenominator) {
  const whole = round2(total)
  if (!(whole > 0) || !(ratioDenominator > 0)) {
    return { matured: 0, residual: whole }
  }
  if (Math.abs(ratioNumerator - ratioDenominator) <= 0.01) {
    return { matured: whole, residual: 0 }
  }
  const matured = round2((whole * ratioNumerator) / ratioDenominator)
  const residual = round2(whole - matured)
  return { matured, residual }
}

export function calculateRitenutaPartialMaturation({
  importoPagamento,
  importoResiduoPartita,
  importoRitenuta,
  imponibileRitenuta,
  compensoLordo,
  contributoCassaPrev = 0,
} = {}) {
  const paid = round2(Math.abs(toAmount(importoPagamento)))
  const residuo = round2(Math.abs(toAmount(importoResiduoPartita)))
  const rit = round2(Math.abs(toAmount(importoRitenuta)))
  const imponibile = round2(Math.abs(toAmount(imponibileRitenuta)))
  const compenso = round2(Math.abs(toAmount(compensoLordo)))
  const cassa = round2(Math.abs(toAmount(contributoCassaPrev)))

  if (!(paid > 0) || !(residuo > 0) || !(rit > 0)) {
    return { kind: 'invalid', paid, residuo }
  }
  if (paid > residuo + 0.01) {
    return { kind: 'overpay', paid, residuo }
  }

  const ritSplit = scalePair(rit, paid, residuo)
  const impSplit = scalePair(imponibile, paid, residuo)
  const compSplit = scalePair(compenso || imponibile, paid, residuo)
  const cassaSplit = scalePair(cassa, paid, residuo)
  const nettoMatured = round2(compSplit.matured - ritSplit.matured)
  const nettoResidual = round2(compSplit.residual - ritSplit.residual)

  if (Math.abs(paid - residuo) <= 0.01) {
    return {
      kind: 'integrale',
      ratio: 1,
      paid,
      residuo,
      matured: {
        importo_ritenuta: ritSplit.matured,
        imponibile_ritenuta: impSplit.matured,
        compenso_lordo: compSplit.matured,
        contributo_cassa_prev: cassaSplit.matured,
        compenso_netto: nettoMatured,
      },
      residual: {
        importo_ritenuta: 0,
        imponibile_ritenuta: 0,
        compenso_lordo: 0,
        contributo_cassa_prev: 0,
        compenso_netto: 0,
      },
    }
  }

  return {
    kind: 'parziale',
    ratio: round2(paid / residuo),
    paid,
    residuo,
    matured: {
      importo_ritenuta: ritSplit.matured,
      imponibile_ritenuta: impSplit.matured,
      compenso_lordo: compSplit.matured,
      contributo_cassa_prev: cassaSplit.matured,
      compenso_netto: nettoMatured,
    },
    residual: {
      importo_ritenuta: ritSplit.residual,
      imponibile_ritenuta: impSplit.residual,
      compenso_lordo: compSplit.residual,
      contributo_cassa_prev: cassaSplit.residual,
      compenso_netto: nettoResidual,
    },
  }
}
