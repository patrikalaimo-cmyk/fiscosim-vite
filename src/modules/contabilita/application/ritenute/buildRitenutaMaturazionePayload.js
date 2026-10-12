import { calculateRitenutaPartialMaturation } from '../../domain/ritenute/calculateRitenutaPartialMaturation.js'

function text(value) {
  return String(value ?? '').trim()
}

function toAmount(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

/**
 * Build persistence plan for payment-time withholding maturation.
 * Integrale → single update to da_versare.
 * Parziale → residual update (aperta, reduced amounts) + insert matured da_versare slice.
 */
export function buildRitenutaMaturazionePayload(ritenuta = {}) {
  const id = text(ritenuta.ritenutaId || ritenuta.id)
  const linked = ritenuta.linkedRitenutaRecord || {}
  const paymentMeta = {
    data_pagamento: text(ritenuta.dataPagamento) || null,
    data_scadenza: text(ritenuta.dataScadenza) || null,
    periodo_riferimento: text(ritenuta.periodoRiferimento) || null,
    anno_riferimento: Number(ritenuta.annoRiferimento) || null,
    codice_tributo: text(ritenuta.codiceTributo || linked.codice_tributo) || '1040',
  }

  const openImporto = toAmount(linked.importo_ritenuta ?? linked.ritenuta ?? ritenuta.ritenuta)
  const openImponibile = toAmount(linked.imponibile_ritenuta ?? ritenuta.baseImponibile ?? ritenuta.baseRitenuta)
  const openCompenso = toAmount(linked.compenso_lordo ?? ritenuta.importoCompenso)
  const openCassa = toAmount(linked.contributo_cassa_prev ?? ritenuta.importoCassa ?? 0)
  const residuoPartita = toAmount(
    ritenuta.linkedPartitaRecord?.importo_residuo
      ?? ritenuta.linkedPartitaRecord?.importoResiduo
      ?? ritenuta.linkedPartitaRecord?.saldo_residuo
      ?? ritenuta.importoPagamento
  )
  const paid = toAmount(ritenuta.importoPagamento)

  const split = calculateRitenutaPartialMaturation({
    importoPagamento: paid,
    importoResiduoPartita: residuoPartita,
    importoRitenuta: openImporto,
    imponibileRitenuta: openImponibile,
    compensoLordo: openCompenso,
    contributoCassaPrev: openCassa,
  })

  if (split.kind === 'parziale' && id) {
    return {
      kind: 'parziale',
      updates: [
        {
          id,
          stato: 'aperta',
          importo_ritenuta: split.residual.importo_ritenuta,
          ritenuta: split.residual.importo_ritenuta,
          imponibile_ritenuta: split.residual.imponibile_ritenuta,
          compenso_lordo: split.residual.compenso_lordo,
          compenso_netto: split.residual.compenso_netto,
          contributo_cassa_prev: split.residual.contributo_cassa_prev,
          codice_tributo: paymentMeta.codice_tributo,
        },
      ],
      inserts: [
        {
          percipiente_id: text(linked.percipiente_id || ritenuta.percipienteId) || null,
          percipiente_cf: text(linked.percipiente_cf || ritenuta.codiceFiscale) || null,
          percipiente_denominazione: text(linked.percipiente_denominazione || ritenuta.percipienteNome || ritenuta.percipiente) || null,
          prima_nota_id: text(linked.prima_nota_id) || null,
          partitario_id: text(linked.partitario_id) || null,
          data_documento: text(linked.data_documento) || null,
          numero_documento: text(linked.numero_documento || ritenuta.numeroDocumento) || null,
          compenso_lordo: split.matured.compenso_lordo,
          imponibile_ritenuta: split.matured.imponibile_ritenuta,
          aliquota_ritenuta: toAmount(linked.aliquota_ritenuta ?? ritenuta.aliquotaRitenuta),
          importo_ritenuta: split.matured.importo_ritenuta,
          ritenuta: split.matured.importo_ritenuta,
          compenso_netto: split.matured.compenso_netto,
          contributo_cassa_prev: split.matured.contributo_cassa_prev,
          codice_tributo: paymentMeta.codice_tributo,
          stato: 'da_versare',
          causale_prestazione: text(linked.causale_prestazione || ritenuta.causaleCu || ritenuta.causaleReddituale) || null,
          inclusa_cu: true,
          ...paymentMeta,
        },
      ],
      split,
    }
  }

  return {
    kind: 'integrale',
    updates: [
      {
        id,
        ...paymentMeta,
        stato: 'da_versare',
        inclusa_cu: true,
      },
    ],
    inserts: [],
    split,
  }
}

/** @deprecated Prefer buildRitenutaMaturazionePayload(...).updates[0] for integrale. */
export function buildRitenutaMaturazioneUpdateRow(ritenuta = {}) {
  const plan = buildRitenutaMaturazionePayload(ritenuta)
  return plan.updates[0] || {
    id: text(ritenuta.ritenutaId || ritenuta.id),
    data_pagamento: text(ritenuta.dataPagamento) || null,
    data_scadenza: text(ritenuta.dataScadenza) || null,
    periodo_riferimento: text(ritenuta.periodoRiferimento) || null,
    anno_riferimento: Number(ritenuta.annoRiferimento) || null,
    codice_tributo: text(ritenuta.codiceTributo) || null,
    stato: 'da_versare',
    inclusa_cu: true,
  }
}
