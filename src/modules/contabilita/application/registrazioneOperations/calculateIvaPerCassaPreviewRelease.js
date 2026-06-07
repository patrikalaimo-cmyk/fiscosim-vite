import { round2 } from '../canonical_mapper/utils.js'

function amount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

function absoluteAmount(value) {
  return Math.abs(amount(value))
}

function partitaIdOf(row = {}) {
  return String(row.partitaId || row.partita_id || row.id || '').trim()
}

function originIdOf(row = {}) {
  return String(row.origin_registro_iva_id || row.originRegistroIvaId || row.id || '').trim()
}

function belongsToPartita(row = {}, partitaId, primaNotaId) {
  const rowPartitaId = String(row.partitaId || row.partita_id || '').trim()
  const rowPrimaNotaId = String(row.prima_nota_id || row.primaNotaId || '').trim()
  return Boolean((rowPartitaId && rowPartitaId === partitaId) || (rowPrimaNotaId && rowPrimaNotaId === primaNotaId))
}

function sumRows(rows = [], field) {
  return round2(rows.reduce((total, row) => total + absoluteAmount(row?.[field]), 0))
}

function releaseForOrigin(originalRow, releasedRows, ratio, isFinalPayment) {
  const originRegistroIvaId = originIdOf(originalRow)
  const matchingReleasedRows = releasedRows.filter((row) => {
    const releasedOriginId = String(row.origin_registro_iva_id || row.originRegistroIvaId || '').trim()
    return releasedOriginId === originRegistroIvaId
  })
  const imponibileOriginario = absoluteAmount(originalRow.imponibile)
  const ivaOriginaria = absoluteAmount(originalRow.iva)
  const imponibileGiaRilasciato = sumRows(matchingReleasedRows, 'imponibile')
  const ivaGiaRilasciata = sumRows(matchingReleasedRows, 'iva')
  const imponibileResiduoPrima = round2(Math.max(0, imponibileOriginario - imponibileGiaRilasciato))
  const ivaResiduaPrima = round2(Math.max(0, ivaOriginaria - ivaGiaRilasciata))
  const imponibileProporzionale = round2(imponibileOriginario * ratio)
  const ivaProporzionale = round2(ivaOriginaria * ratio)
  const imponibileDaRilasciare = isFinalPayment
    ? imponibileResiduoPrima
    : round2(Math.min(imponibileResiduoPrima, imponibileProporzionale))
  const ivaDaRilasciareOra = isFinalPayment
    ? ivaResiduaPrima
    : round2(Math.min(ivaResiduaPrima, ivaProporzionale))

  return {
    originRegistroIvaId,
    tipo: String(originalRow.tipo || '').trim(),
    causaleIvaId: String(originalRow.causale_iva_id || originalRow.causaleIvaId || '').trim() || null,
    contoIva: String(originalRow.conto_iva_id || originalRow.contoIva || '').trim() || null,
    aliquota: Number.isFinite(Number(originalRow.aliquota)) ? Number(originalRow.aliquota) : null,
    imponibileOriginario,
    imponibileGiaRilasciato,
    imponibileResiduoPrima,
    imponibileDaRilasciare,
    imponibileResiduoDopo: round2(Math.max(0, imponibileResiduoPrima - imponibileDaRilasciare)),
    ivaOriginaria,
    ivaGiaRilasciata,
    ivaResiduaPrima,
    ivaDaRilasciareOra,
    ivaResiduaDopo: round2(Math.max(0, ivaResiduaPrima - ivaDaRilasciareOra)),
    arrotondamento: round2(ivaDaRilasciareOra - (ivaOriginaria * ratio)),
  }
}

export function calculateIvaPerCassaPreviewRelease({
  partitarioRows = [],
  originalVatRows = [],
  releasedVatRows = [],
  roundingTolerance = 0.01,
} = {}) {
  return (Array.isArray(partitarioRows) ? partitarioRows : [])
    .filter((row) => row?.selected && Boolean(row?.iva_per_cassa ?? row?.ivaPerCassa))
    .map((partita) => {
      const partitaId = partitaIdOf(partita)
      const primaNotaId = String(partita.prima_nota_id || partita.primaNotaId || '').trim()
      const importoOriginale = absoluteAmount(
        partita.importoOriginale ?? partita.importoOriginario ?? partita.importo_originale
      )
      const importoChiusura = absoluteAmount(partita.importoChiusura ?? partita.importo_chiuso)
      const residuoCommercialePrima = absoluteAmount(
        partita.residuo ?? partita.importo_residuo ?? partita.saldoResiduo ?? importoOriginale
      )
      const residuoCommercialeDopo = round2(Math.max(0, residuoCommercialePrima - importoChiusura))
      const rawRatio = importoOriginale > 0 ? importoChiusura / importoOriginale : 0
      const ratio = Math.min(1, Math.max(0, rawRatio))
      const importoOriginaleIvaPerCassa = importoOriginale
      const importoChiusuraIvaPerCassa = importoChiusura
      const residuoIvaPerCassaPrima = residuoCommercialePrima
      const residuoIvaPerCassaDopo = residuoCommercialeDopo
      const percentualeChiusuraIvaPerCassa = round2(ratio * 100)
      const isFinalPayment = residuoCommercialePrima > 0 &&
        importoChiusura >= round2(residuoCommercialePrima - roundingTolerance)
      const righeIvaOriginarie = (Array.isArray(originalVatRows) ? originalVatRows : [])
        .filter((row) => belongsToPartita(row, partitaId, primaNotaId))
        .map((originalRow) => releaseForOrigin(originalRow, releasedVatRows, ratio, isFinalPayment))

      const imponibileOriginario = sumRows(righeIvaOriginarie, 'imponibileOriginario')
      const imponibileGiaRilasciato = sumRows(righeIvaOriginarie, 'imponibileGiaRilasciato')
      const imponibileResiduoPrima = sumRows(righeIvaOriginarie, 'imponibileResiduoPrima')
      const imponibileDaRilasciare = sumRows(righeIvaOriginarie, 'imponibileDaRilasciare')
      const imponibileResiduoDopo = sumRows(righeIvaOriginarie, 'imponibileResiduoDopo')
      const ivaOriginaria = sumRows(righeIvaOriginarie, 'ivaOriginaria')
      const ivaGiaRilasciata = sumRows(righeIvaOriginarie, 'ivaGiaRilasciata')
      const ivaResiduaPrima = sumRows(righeIvaOriginarie, 'ivaResiduaPrima')
      const ivaDaRilasciareOra = sumRows(righeIvaOriginarie, 'ivaDaRilasciareOra')
      const ivaResiduaDopo = sumRows(righeIvaOriginarie, 'ivaResiduaDopo')
      const expectedIvaRelease = isFinalPayment
        ? ivaResiduaPrima
        : round2(Math.min(ivaResiduaPrima, ivaOriginaria * ratio))
      const exceedsCommercialAmount = rawRatio > 1 + 0.000001
      const hasVatRows = righeIvaOriginarie.length > 0
      const commercialClosureCoherent = Math.abs(importoChiusura - importoChiusuraIvaPerCassa) <= roundingTolerance
      const commercialResidualCoherent = Math.abs(residuoCommercialeDopo - residuoIvaPerCassaDopo) <= roundingTolerance
      const commercialRatioCoherent = Math.abs(round2(ratio * 100) - percentualeChiusuraIvaPerCassa) <= roundingTolerance
      const vatDoesNotExceedOriginal = ivaGiaRilasciata + ivaDaRilasciareOra <= ivaOriginaria + roundingTolerance
      const coerente = hasVatRows &&
        !exceedsCommercialAmount &&
        commercialClosureCoherent &&
        commercialResidualCoherent &&
        commercialRatioCoherent &&
        vatDoesNotExceedOriginal &&
        Math.abs(ivaDaRilasciareOra - expectedIvaRelease) <= roundingTolerance

      return {
        partitaId,
        primaNotaId: primaNotaId || null,
        soggettoTipo: String(
          partita.soggettoTipo ||
          partita.soggetto_tipo ||
          partita.clienteFornitoreTipo ||
          partita.cliente_fornitore_tipo ||
          ''
        ).trim(),
        partitaNome: String(
          partita.partitaNome ||
          partita.numeroDocumento ||
          partita.numero_documento ||
          partita.soggettoNome ||
          partita.soggetto_nome ||
          partitaId
        ).trim(),
        iva_per_cassa: true,
        importoOriginale,
        importoChiusura,
        importoResiduoPrima: residuoCommercialePrima,
        importoResiduoDopo: residuoCommercialeDopo,
        residuoCommercialeDopo,
        percentualeChiusura: round2(ratio * 100),
        importoOriginaleIvaPerCassa,
        importoChiusuraIvaPerCassa,
        residuoIvaPerCassaPrima,
        residuoIvaPerCassaDopo,
        percentualeChiusuraIvaPerCassa,
        imponibileOriginario,
        imponibileGiaRilasciato,
        imponibileDaRilasciare,
        imponibileResiduoPrima,
        imponibileResiduoDopo,
        ivaOriginaria,
        ivaGiaRilasciata,
        ivaResiduaPrima,
        ivaDaRilasciareOra,
        ivaResiduaDopo,
        isFinalPayment,
        arrotondamento: round2(righeIvaOriginarie.reduce((total, row) => total + row.arrotondamento, 0)),
        coerente,
        originRegistroIvaId: righeIvaOriginarie.length === 1
          ? righeIvaOriginarie[0].originRegistroIvaId
          : null,
        stato: !hasVatRows
          ? 'dati_iva_mancanti'
          : exceedsCommercialAmount
            ? 'chiusura_superiore_all_originale'
            : coerente
              ? (isFinalPayment ? 'rilascio_finale_coerente' : 'rilascio_proporzionale_coerente')
              : 'incoerente',
        righeIvaOriginarie,
      }
    })
}
