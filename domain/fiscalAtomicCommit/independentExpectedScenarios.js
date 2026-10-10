/**
 * Independent expected amounts for SG-P0-01 fiscal atomic commit scenarios.
 * Pure arithmetic at cent precision. Must NOT import FiscoSim mappers/services.
 */

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function cents(n) {
  return Math.round(Number(n) * 100)
}

function fromCents(c) {
  return c / 100
}

/** IVA 22% on taxable base, banker's-safe via cents. */
export function iva22(imponibile) {
  return fromCents(Math.round(cents(imponibile) * 22 / 100))
}

/** Ordinary active invoice (vendita) 22%. */
export function expectedFatturaAttiva22({ imponibile = 1000 } = {}) {
  const base = round2(imponibile)
  const iva = iva22(base)
  const totale = round2(base + iva)
  return {
    id: 'SG-SC-FA22',
    contractKind: 'fattura_attiva',
    imponibile: base,
    iva,
    totale,
    aliquota: 22,
    lines: [
      { role: 'cliente', dare: totale, avere: 0 },
      { role: 'ricavo', dare: 0, avere: base },
      { role: 'iva_debito', dare: 0, avere: iva },
    ],
    totalDare: totale,
    totalAvere: totale,
    partita: {
      tipo: 'cliente',
      importo_originale: totale,
      importo_pagato: 0,
      importo_residuo: totale,
      stato: 'aperta',
    },
    registroIva: {
      tipo: 'vendita',
      imponibile: base,
      iva,
      aliquota: 22,
      esigibilita: 'immediata',
      split_payment: false,
      iva_in_debito_liquidazione: iva,
    },
    ritenuta: null,
  }
}

/** Ordinary passive invoice (acquisto) 22%. */
export function expectedFatturaPassiva22({ imponibile = 1000, percentualeDetraibile = 100 } = {}) {
  const base = round2(imponibile)
  const iva = iva22(base)
  const totale = round2(base + iva)
  const detPct = round2(percentualeDetraibile)
  const ivaDet = fromCents(Math.round(cents(iva) * detPct / 100))
  const ivaIndet = round2(iva - ivaDet)
  return {
    id: 'SG-SC-FP22',
    contractKind: 'fattura_passiva',
    imponibile: base,
    iva,
    totale,
    aliquota: 22,
    lines: [
      { role: 'costo', dare: base, avere: 0 },
      { role: 'iva_credito', dare: iva, avere: 0 },
      { role: 'fornitore', dare: 0, avere: totale },
    ],
    totalDare: totale,
    totalAvere: totale,
    partita: {
      tipo: 'fornitore',
      importo_originale: totale,
      importo_pagato: 0,
      importo_residuo: totale,
      stato: 'aperta',
    },
    registroIva: {
      tipo: 'acquisto',
      imponibile: base,
      iva,
      aliquota: 22,
      esigibilita: 'immediata',
      split_payment: false,
      percentuale_detraibilita: detPct,
      iva_detraibile: ivaDet,
      iva_indetraibile: ivaIndet,
      iva_in_credito_liquidazione: ivaDet,
    },
    ritenuta: null,
  }
}

/**
 * Active credit note reversing a 22% sale on the same base.
 * VAT register signs are negative; partita opens with negative residual.
 */
export function expectedNotaCreditoAttiva22({ imponibile = 1000 } = {}) {
  const base = round2(imponibile)
  const iva = iva22(base)
  const totale = round2(base + iva)
  return {
    id: 'SG-SC-NCA22',
    contractKind: 'nota_credito_attiva',
    imponibile: base,
    iva,
    totale,
    aliquota: 22,
    lines: [
      { role: 'ricavo', dare: base, avere: 0 },
      { role: 'iva_debito', dare: iva, avere: 0 },
      { role: 'cliente', dare: 0, avere: totale },
    ],
    totalDare: totale,
    totalAvere: totale,
    partita: {
      tipo: 'cliente',
      importo_originale: round2(-totale),
      importo_pagato: 0,
      importo_residuo: round2(-totale),
      stato: 'aperta',
    },
    registroIva: {
      tipo: 'vendita',
      imponibile: round2(-base),
      iva: round2(-iva),
      aliquota: 22,
      esigibilita: 'immediata',
      split_payment: false,
      iva_in_debito_liquidazione: round2(-iva),
    },
    ritenuta: null,
  }
}

/**
 * Partial collection against an open customer invoice residual.
 * Does not recompute VAT; only bank/client and partita residual.
 */
export function expectedPagamentoParzialeCliente({
  importoOriginale = 1220,
  importoGiaPagato = 0,
  importoIncasso = 500,
} = {}) {
  const originale = round2(importoOriginale)
  const gia = round2(importoGiaPagato)
  const incasso = round2(importoIncasso)
  const residuoPrima = round2(originale - gia)
  if (Math.abs(incasso) > Math.abs(residuoPrima) + 0.001) {
    throw new Error('Independent scenario: collection exceeds residual')
  }
  const pagatoDopo = round2(gia + incasso)
  const residuoDopo = round2(originale - pagatoDopo)
  const chiusa = Math.abs(residuoDopo) <= 0.01
  return {
    id: 'SG-SC-PAY-P',
    contractKind: 'pagamento',
    lines: [
      { role: 'banca', dare: incasso, avere: 0 },
      { role: 'cliente', dare: 0, avere: incasso },
    ],
    totalDare: incasso,
    totalAvere: incasso,
    partitaBefore: {
      importo_originale: originale,
      importo_pagato: gia,
      importo_residuo: residuoPrima,
      stato: 'aperta',
    },
    partitaAfter: {
      importo_originale: originale,
      importo_pagato: chiusa ? originale : pagatoDopo,
      importo_residuo: chiusa ? 0 : residuoDopo,
      stato: chiusa ? 'chiusa' : 'aperta',
    },
    registroIva: null,
    ritenuta: null,
    overpayRejected: round2(residuoPrima + 0.01),
  }
}

/**
 * Professional invoice with 4% cassa and 20% withholding (cod. 1040).
 * IVA on (compenso + cassa). Net payable = lordo + cassa + IVA − ritenuta.
 */
export function expectedParcellaRitenuta({
  compenso = 1000,
  aliquotaCassa = 4,
  aliquotaIva = 22,
  aliquotaRitenuta = 20,
} = {}) {
  const lordo = round2(compenso)
  const cassa = fromCents(Math.round(cents(lordo) * aliquotaCassa / 100))
  const baseIva = round2(lordo + cassa)
  const iva = fromCents(Math.round(cents(baseIva) * aliquotaIva / 100))
  const imponibileRitenuta = lordo
  const ritenuta = fromCents(Math.round(cents(imponibileRitenuta) * aliquotaRitenuta / 100))
  const netto = round2(lordo + cassa + iva - ritenuta)
  const totaleDocumento = round2(lordo + cassa + iva)
  return {
    id: 'SG-SC-PARC',
    contractKind: 'parcella_documento',
    compenso_lordo: lordo,
    contributo_cassa_prev: cassa,
    imponibile_iva: baseIva,
    iva,
    totale_documento: totaleDocumento,
    imponibile_ritenuta: imponibileRitenuta,
    aliquota_ritenuta: aliquotaRitenuta,
    importo_ritenuta: ritenuta,
    codice_tributo: '1040',
    compenso_netto: netto,
    lines: [
      { role: 'cliente', dare: netto, avere: 0 },
      { role: 'erario_ritenuta', dare: ritenuta, avere: 0 },
      { role: 'ricavo', dare: 0, avere: lordo },
      { role: 'cassa_prev', dare: 0, avere: cassa },
      { role: 'iva_debito', dare: 0, avere: iva },
    ],
    totalDare: round2(netto + ritenuta),
    totalAvere: round2(lordo + cassa + iva),
    partita: {
      tipo: 'cliente',
      importo_originale: netto,
      importo_pagato: 0,
      importo_residuo: netto,
      stato: 'aperta',
    },
    registroIva: {
      tipo: 'vendita',
      imponibile: baseIva,
      iva,
      aliquota: aliquotaIva,
      esigibilita: 'immediata',
      split_payment: false,
      iva_in_debito_liquidazione: iva,
    },
    ritenuta: {
      eventType: 'documento',
      stato: 'aperta',
      importo_ritenuta: ritenuta,
      codice_tributo: '1040',
      maturata_su_pagamento: false,
    },
  }
}

/**
 * Active split-payment invoice: customer owes imponibile only;
 * VAT is registered with split_payment=true and excluded from liquidazione debito.
 */
export function expectedSplitPaymentAttiva22({ imponibile = 1000 } = {}) {
  const base = round2(imponibile)
  const iva = iva22(base)
  return {
    id: 'SG-SC-SPLIT',
    contractKind: 'split_attiva',
    imponibile: base,
    iva,
    totale_esposto: round2(base + iva),
    lines: [
      { role: 'cliente', dare: base, avere: 0 },
      { role: 'ricavo', dare: 0, avere: base },
      { role: 'iva_debito_tecnico', dare: iva, avere: 0 },
      { role: 'iva_split_tecnico', dare: 0, avere: iva },
    ],
    totalDare: round2(base + iva),
    totalAvere: round2(base + iva),
    partita: {
      tipo: 'cliente',
      importo_originale: base,
      importo_pagato: 0,
      importo_residuo: base,
      stato: 'aperta',
    },
    registroIva: {
      tipo: 'vendita',
      imponibile: base,
      iva,
      aliquota: 22,
      esigibilita: 'immediata',
      split_payment: true,
      iva_in_debito_liquidazione: 0,
    },
    ritenuta: null,
  }
}

export const INDEPENDENT_SCENARIO_BUILDERS = {
  fattura_attiva_22: expectedFatturaAttiva22,
  fattura_passiva_22: expectedFatturaPassiva22,
  nota_credito_attiva_22: expectedNotaCreditoAttiva22,
  pagamento_parziale_cliente: expectedPagamentoParzialeCliente,
  parcella_ritenuta: expectedParcellaRitenuta,
  split_payment_attiva_22: expectedSplitPaymentAttiva22,
}
