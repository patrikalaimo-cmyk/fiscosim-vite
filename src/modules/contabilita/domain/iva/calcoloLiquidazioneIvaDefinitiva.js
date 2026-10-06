function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return round2(value);
  const parsed = Number.parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? round2(parsed) : 0;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function isOutsidePeriod(row, periodoInizio, periodoFine) {
  const data = String(row?.data || '').slice(0, 10);
  if (!data) return false;
  if (periodoInizio && data < periodoInizio) return true;
  if (periodoFine && data > periodoFine) return true;
  return false;
}

export function calcoloLiquidazioneIvaDefinitiva(rows = [], options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const societaId = String(options.societaId || '').trim();
  const periodoInizio = String(options.periodoInizio || '').slice(0, 10);
  const periodoFine = String(options.periodoFine || '').slice(0, 10);
  const periodicita = normalizeText(options.periodicita || 'mensile');
  const trimestraleOrdinaria = Boolean(options.trimestraleOrdinaria);
  const minThreshold = options.minThreshold !== undefined ? Number(options.minThreshold) : 25.82;

  // Crediti e acconti inseriti
  const creditoPeriodoPrecedente = round2(options.creditoPeriodoPrecedente || 0);
  const creditoAnnoPrecedente = round2(options.creditoAnnoPrecedente || 0);
  const creditoCompensatoF24 = round2(options.creditoCompensatoF24 || 0);
  const accontoIvaVersato = round2(options.accontoIvaVersato || 0);

  const righeIncluse = [];
  const righeEscluse = [];

  let ivaVenditeLorda = 0;
  let ivaSplitEsclusa = 0;
  let ivaAcquistiDetraibile = 0;
  let ivaAcquistiIndetraibile = 0;
  let ivaReverseDebito = 0;
  let ivaReverseCredito = 0;
  let ivaPerCassaDifferitaVendite = 0;
  let ivaPerCassaDifferitaAcquisti = 0;
  let ivaPerCassaRilasciataVendite = 0;
  let ivaPerCassaRilasciataAcquisti = 0;

  for (const row of list) {
    // 1. Isolamento societario
    if (societaId && String(row?.societa_id || '').trim() !== societaId) {
      righeEscluse.push({ row, motivo: 'societa' });
      continue;
    }

    // 2. Filtro temporale
    if (isOutsidePeriod(row, periodoInizio, periodoFine)) {
      righeEscluse.push({ row, motivo: 'periodo' });
      continue;
    }

    const tipo = normalizeText(row?.tipo);
    const esigibilita = normalizeText(row?.esigibilita);
    const isRC = Boolean(
      row?.reverse_charge === true ||
      row?.reverseCharge === true ||
      (row?.natura && /^N6/i.test(row.natura)) ||
      (row?.nature && /^N6/i.test(row.nature))
    );

    // 3. Controllo IVA per cassa differita non ancora esigibile
    if (esigibilita === 'differita') {
      if (tipo === 'vendita') {
        ivaPerCassaDifferitaVendite += toNumber(row?.iva);
      } else if (tipo === 'acquisto') {
        ivaPerCassaDifferitaAcquisti += toNumber(row?.iva_detraibile || row?.iva);
      }
      righeEscluse.push({ row, motivo: 'esigibilita_differita' });
      continue;
    }

    // 4. Tipo di riga
    if (tipo === 'vendita') {
      const iva = toNumber(row?.iva);
      ivaVenditeLorda += iva;

      if (row?.split_payment === true || row?.splitPayment === true) {
        ivaSplitEsclusa += iva;
      }
      if (isRC) {
        ivaReverseDebito += iva;
      }
      if (esigibilita === 'rilascio') {
        ivaPerCassaRilasciataVendite += iva;
      }

      righeIncluse.push({ ...row, inclusa_in_liquidazione: true });
    } else if (tipo === 'acquisto') {
      const ivaDet = toNumber(row?.iva_detraibile || row?.iva);
      const ivaIndet = toNumber(row?.iva_indetraibile || 0);
      ivaAcquistiDetraibile += ivaDet;
      ivaAcquistiIndetraibile += ivaIndet;

      if (isRC) {
        ivaReverseCredito += ivaDet;
      }
      if (esigibilita === 'rilascio') {
        ivaPerCassaRilasciataAcquisti += ivaDet;
      }

      righeIncluse.push({ ...row, inclusa_in_liquidazione: true });
    } else {
      righeEscluse.push({ row, motivo: 'tipo_non_iva' });
    }
  }

  // Rounding dei subtotali
  ivaVenditeLorda = round2(ivaVenditeLorda);
  ivaSplitEsclusa = round2(ivaSplitEsclusa);
  ivaAcquistiDetraibile = round2(ivaAcquistiDetraibile);
  ivaAcquistiIndetraibile = round2(ivaAcquistiIndetraibile);
  ivaReverseDebito = round2(ivaReverseDebito);
  ivaReverseCredito = round2(ivaReverseCredito);
  ivaPerCassaDifferitaVendite = round2(ivaPerCassaDifferitaVendite);
  ivaPerCassaDifferitaAcquisti = round2(ivaPerCassaDifferitaAcquisti);
  ivaPerCassaRilasciataVendite = round2(ivaPerCassaRilasciataVendite);
  ivaPerCassaRilasciataAcquisti = round2(ivaPerCassaRilasciataAcquisti);

  // Debito effettivo da registri (lordo meno split payment)
  const ivaDebitoEffettiva = round2(ivaVenditeLorda - ivaSplitEsclusa);

  // Calcolo saldo pre-interessi, crediti e acconti
  const creditoAnnoPrecedenteNetto = round2(creditoAnnoPrecedente - creditoCompensatoF24);
  const creditoTotaleApplicato = round2(creditoPeriodoPrecedente + creditoAnnoPrecedenteNetto);
  
  const risultatoPreInteressi = round2(ivaDebitoEffettiva - ivaAcquistiDetraibile - creditoTotaleApplicato - accontoIvaVersato);

  let interessiTrimestrali = 0;
  if (periodicita === 'trimestrale' && trimestraleOrdinaria && risultatoPreInteressi > 0) {
    interessiTrimestrali = round2(risultatoPreInteressi * 0.01);
  }

  let debitoPeriodo = 0;
  let debitoDaVersare = 0;
  let creditoPeriodo = 0;
  let creditoDaRiportare = 0;

  if (risultatoPreInteressi > 0) {
    debitoPeriodo = risultatoPreInteressi;
    debitoDaVersare = round2(debitoPeriodo + interessiTrimestrali);
  } else if (risultatoPreInteressi < 0) {
    creditoPeriodo = round2(Math.abs(risultatoPreInteressi));
    creditoDaRiportare = creditoPeriodo;
  }

  // Soglia minima F24
  const f24Dovuto = debitoDaVersare >= minThreshold ? debitoDaVersare : 0;
  const rimandoSottoSoglia = debitoDaVersare > 0 && debitoDaVersare < minThreshold;

  const warnings = [];
  if (rimandoSottoSoglia) {
    warnings.push(`Importo a debito (${debitoDaVersare} €) inferiore alla soglia minima di ${minThreshold} €: il versamento viene rimandato al periodo successivo.`);
  }

  return {
    // Dati periodo
    societaId,
    periodoInizio,
    periodoFine,
    periodicita,
    
    // Totali IVA
    ivaVenditeLorda,
    ivaSplitEsclusa,
    ivaDebitoEffettiva,
    ivaAcquistiDetraibile,
    ivaAcquistiIndetraibile,
    ivaReverseDebito,
    ivaReverseCredito,
    ivaPerCassaDifferita: round2(ivaPerCassaDifferitaVendite + ivaPerCassaDifferitaAcquisti),
    ivaPerCassaDifferitaVendite,
    ivaPerCassaDifferitaAcquisti,
    ivaPerCassaRilasciata: round2(ivaPerCassaRilasciataVendite - ivaPerCassaRilasciataAcquisti),
    ivaPerCassaRilasciataVendite,
    ivaPerCassaRilasciataAcquisti,

    // Crediti, acconti, interessi
    creditoPeriodoPrecedente,
    creditoAnnoPrecedente,
    creditoCompensatoF24,
    creditoAnnoPrecedenteNetto,
    accontoIvaVersato,
    interessiTrimestrali,

    // Saldi finali
    saldoPeriodo: round2(ivaDebitoEffettiva - ivaAcquistiDetraibile),
    debitoPeriodo,
    debitoDaVersare,
    creditoPeriodo,
    creditoDaRiportare,
    f24Dovuto,
    rimandoSottoSoglia,

    // Righe
    righeIncluse,
    righeEscluse,
    righeIncluseCount: righeIncluse.length,
    righeEscluseCount: righeEscluse.length,
    warnings,
  };
}
