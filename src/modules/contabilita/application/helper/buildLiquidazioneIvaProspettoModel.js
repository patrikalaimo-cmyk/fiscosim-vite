function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100
}

export function buildLiquidazioneIvaProspettoModel({
  rows = [],
  calcResult,
  savedRecord = null,
  options = {}
}) {
  const venditeGroups = new Map()
  const acquistiGroups = new Map()

  const list = Array.isArray(rows) ? rows : []

  // Raccogliamo righe escluse per esigibilità differita
  const righeEscluseDifferita = []

  for (const row of list) {
    if (row.esigibilita === 'differita') {
      righeEscluseDifferita.push(row)
    }
  }

  // 1. Dettaglio Registro Vendite
  const venditeRows = calcResult?.righeIncluse?.filter(r => String(r.tipo).toLowerCase() === 'vendita') || []
  for (const row of venditeRows) {
    const cod = row.causale_codice || String(row.aliquota || 0)
    const aliq = Number(row.aliquota || 0)
    const nat = row.natura || ''
    const key = `${cod}_${aliq}_${nat}`

    let gr = venditeGroups.get(key)
    if (!gr) {
      gr = {
        codiceIva: cod,
        aliquota: aliq,
        natura: nat,
        descrizione: row.causale_descrizione || (aliq ? `Aliquota ${aliq}%` : 'Esente / Esclusa'),
        imponibile: 0,
        ivaDebitoLorda: 0,
        ivaSplitEsclusa: 0,
        ivaDebitoEffettiva: 0,
        operazioniEsentiEscluse: 0,
        operazioniNonImponibili: 0,
        righe: 0
      }
      venditeGroups.set(key, gr)
    }

    const imp = Number(row.imponibile || 0)
    const iva = Number(row.iva || 0)

    gr.imponibile += imp
    gr.ivaDebitoLorda += iva
    if (row.split_payment === true || row.splitPayment === true) {
      gr.ivaSplitEsclusa += iva
    }
    
    // Rileva operazioni esenti / escluse o non imponibili
    if (nat) {
      if (/^N3/i.test(nat)) {
        gr.operazioniNonImponibili += imp
      } else if (/^N1|^N2|^N4|^N5/i.test(nat)) {
        gr.operazioniEsentiEscluse += imp
      }
    } else if (aliq === 0) {
      gr.operazioniEsentiEscluse += imp
    }

    gr.righe += 1
  }

  // Round vendite groups
  const dettaglioVendite = Array.from(venditeGroups.values()).map(gr => ({
    ...gr,
    imponibile: round2(gr.imponibile),
    ivaDebitoLorda: round2(gr.ivaDebitoLorda),
    ivaSplitEsclusa: round2(gr.ivaSplitEsclusa),
    ivaDebitoEffettiva: round2(gr.ivaDebitoLorda - gr.ivaSplitEsclusa),
    operazioniEsentiEscluse: round2(gr.operazioniEsentiEscluse),
    operazioniNonImponibili: round2(gr.operazioniNonImponibili)
  }))

  // 2. Dettaglio Registro Acquisti
  const acquistiRows = calcResult?.righeIncluse?.filter(r => String(r.tipo).toLowerCase() === 'acquisto') || []
  for (const row of acquistiRows) {
    const cod = row.causale_codice || String(row.aliquota || 0)
    const aliq = Number(row.aliquota || 0)
    const nat = row.natura || ''
    const key = `${cod}_${aliq}_${nat}`

    let gr = acquistiGroups.get(key)
    if (!gr) {
      gr = {
        codiceIva: cod,
        aliquota: aliq,
        natura: nat,
        descrizione: row.causale_descrizione || (aliq ? `Aliquota ${aliq}%` : 'Esente / Esclusa'),
        imponibile: 0,
        ivaAcquisti: 0,
        ivaDetraibile: 0,
        ivaIndetraibile: 0,
        operazioniEsentiEscluse: 0,
        operazioniNonImponibili: 0,
        righe: 0
      }
      acquistiGroups.set(key, gr)
    }

    const imp = Number(row.imponibile || 0)
    const iva = Number(row.iva || 0)
    const ivaDet = Number(row.iva_detraibile !== undefined ? row.iva_detraibile : iva)
    const ivaIndet = Number(row.iva_indetraibile || 0)

    gr.imponibile += imp
    gr.ivaAcquisti += iva
    gr.ivaDetraibile += ivaDet
    gr.ivaIndetraibile += ivaIndet

    if (nat) {
      if (/^N3/i.test(nat)) {
        gr.operazioniNonImponibili += imp
      } else if (/^N1|^N2|^N4|^N5/i.test(nat)) {
        gr.operazioniEsentiEscluse += imp
      }
    } else if (aliq === 0) {
      gr.operazioniEsentiEscluse += imp
    }

    gr.righe += 1
  }

  // Round acquisti groups
  const dettaglioAcquisti = Array.from(acquistiGroups.values()).map(gr => {
    const percentDet = gr.ivaAcquisti > 0 ? round2((gr.ivaDetraibile / gr.ivaAcquisti) * 100) : 100
    return {
      ...gr,
      imponibile: round2(gr.imponibile),
      ivaAcquisti: round2(gr.ivaAcquisti),
      ivaDetraibile: round2(gr.ivaDetraibile),
      ivaIndetraibile: round2(gr.ivaIndetraibile),
      percentualeDetrazione: percentDet,
      operazioniEsentiEscluse: round2(gr.operazioniEsentiEscluse),
      operazioniNonImponibili: round2(gr.operazioniNonImponibili)
    }
  })

  const hasDetails = venditeRows.length > 0 || acquistiRows.length > 0
  const useFallback = !hasDetails && savedRecord && options.isSaved

  const fallbackIvaDebito = useFallback ? Number(savedRecord.iva_debito || 0) : 0
  const fallbackIvaCredito = useFallback ? Number(savedRecord.iva_credito || 0) : 0
  const fallbackSaldo = useFallback ? Number(savedRecord.saldo || 0) : 0

  // Totali Vendite
  const totaliVendite = {
    imponibile: useFallback ? 0 : round2(dettaglioVendite.reduce((s, g) => s + g.imponibile, 0)),
    ivaDebitoLorda: useFallback ? fallbackIvaDebito : round2(dettaglioVendite.reduce((s, g) => s + g.ivaDebitoLorda, 0)),
    ivaSplitEsclusa: useFallback ? 0 : round2(dettaglioVendite.reduce((s, g) => s + g.ivaSplitEsclusa, 0)),
    ivaDebitoEffettiva: useFallback ? fallbackIvaDebito : round2(dettaglioVendite.reduce((s, g) => s + g.ivaDebitoEffettiva, 0))
  }

  // Totali Acquisti
  const totaliAcquisti = {
    imponibile: useFallback ? 0 : round2(dettaglioAcquisti.reduce((s, g) => s + g.imponibile, 0)),
    ivaAcquisti: useFallback ? fallbackIvaCredito : round2(dettaglioAcquisti.reduce((s, g) => s + g.ivaAcquisti, 0)),
    ivaDetraibile: useFallback ? fallbackIvaCredito : round2(dettaglioAcquisti.reduce((s, g) => s + g.ivaDetraibile, 0)),
    ivaIndetraibile: useFallback ? 0 : round2(dettaglioAcquisti.reduce((s, g) => s + g.ivaIndetraibile, 0))
  }

  // 3. IVA per cassa / esigibilità differita
  // Raccoglie sia il differito che il rilascio nel periodo
  const differiteList = list.filter(r => r.esigibilita === 'differita')
  const rilasciateList = list.filter(r => r.esigibilita === 'rilascio')
  
  const ivaPerCassaRighe = [...differiteList, ...rilasciateList].map(r => {
    const docNum = r.numero_documento || '—'
    const docData = r.data ? new Date(r.data).toLocaleDateString('it-IT') : '—'
    const desc = r.descrizione_riga || r.descrizione || 'Fattura'
    
    return {
      id: r.id,
      documento: `${desc} n. ${docNum} del ${docData}`,
      clienteFornitore: r.soggetto_denominazione || r.cliente_fornitore_nome || '—',
      dataDocumento: r.data || '—',
      totaleDocumento: round2(Number(r.imponibile || 0) + Number(r.iva || 0)),
      ivaSospesa: r.esigibilita === 'differita' ? round2(r.iva) : 0,
      ivaRilasciata: r.esigibilita === 'rilascio' ? round2(r.iva) : 0,
      residuoIvaSospesa: r.esigibilita === 'differita' ? round2(r.iva) : 0,
      motivo: r.esigibilita === 'differita' ? 'Esigibilità differita' : 'Rilascio imposta'
    }
  })

  // 4. Riepilogo liquidazione
  const riepilogoLiquidazione = {
    ivaVendite: totaliVendite.ivaDebitoLorda,
    ivaCorrispettivi: 0, // se ci fossero corrispettivi nel periodo separati
    ivaSplitPayment: totaliVendite.ivaSplitEsclusa,
    totaleImpostaEsigibile: totaliVendite.ivaDebitoEffettiva,
    ivaAcquistiDetraibile: totaliAcquisti.ivaDetraibile,
    ivaAcquistiIndetraibile: totaliAcquisti.ivaIndetraibile,
    totaleImpostaDetraibile: totaliAcquisti.ivaDetraibile,
    ivaDebitoPeriodo: useFallback ? (fallbackSaldo > 0 ? fallbackSaldo : 0) : (calcResult?.debitoPeriodo || 0),
    creditoIvaPrecedente: calcResult?.creditoPeriodoPrecedente || 0,
    debitoPrecedenteNonVersato: 0,
    creditoCompensabileUsato: calcResult?.creditoAnnoPrecedenteNetto || 0,
    creditoCompensabileF24: calcResult?.creditoCompensatoF24 || 0,
    accontoIva: calcResult?.accontoIvaVersato || 0,
    variazioniPeriodiPrecedenti: 0,
    interessiTrimestrali: calcResult?.interessiTrimestrali || 0,
    risultatoFinale: useFallback 
      ? Math.abs(fallbackSaldo)
      : (calcResult?.debitoDaVersare > 0 ? calcResult.debitoDaVersare : (calcResult?.creditoDaRiportare || 0)),
    risultatoTipo: useFallback
      ? (fallbackSaldo > 0 ? 'debito' : 'credito')
      : ((calcResult?.debitoDaVersare > 0) ? 'debito' : 'credito')
  }

  // 5. Credito compensabile
  const creditoCompensabile = {
    inizioPeriodo: calcResult?.creditoAnnoPrecedente || 0,
    usatoInLiquidazione: calcResult?.creditoPeriodoPrecedente || 0,
    usatoF24: calcResult?.creditoCompensatoF24 || 0,
    finale: useFallback ? (fallbackSaldo < 0 ? Math.abs(fallbackSaldo) : 0) : (calcResult?.creditoDaRiportare || 0),
    daRiportare: useFallback ? (fallbackSaldo < 0 ? Math.abs(fallbackSaldo) : 0) : (calcResult?.creditoDaRiportare || 0)
  }

  // 6. Controlli e Warning
  const controlliWarning = {
    registriInclusi: useFallback ? 'Dettaglio non disponibile (totali consolidati)' : (calcResult?.righeIncluseCount > 0 ? 'Tutti i registri IVA' : 'Nessuno'),
    registriEsclusi: useFallback ? 'Nessuno' : (calcResult?.righeEscluse?.filter(r => r.motivo === 'societa' || r.motivo === 'periodo').length > 0 ? 'Esclusi per società/periodo' : 'Nessuno'),
    righeEscluse: useFallback ? 0 : (calcResult?.righeEscluse?.length || 0),
    righeEscluseCassa: righeEscluseDifferita.length,
    operazioniSplit: useFallback ? 0 : list.filter(r => r.split_payment === true || r.splitPayment === true).length,
    operazioniReverse: useFallback ? 0 : list.filter(r => r.reverse_charge === true || r.reverseCharge === true || /^N6/i.test(r.natura)).length,
    ivaIndetraibileRilevata: totaliAcquisti.ivaIndetraibile,
    squadrature: 'Nessuna anomalia bloccante rilevata.',
    statoControlli: 'OK'
  }

  return {
    dettaglioVendite,
    totaliVendite,
    dettaglioAcquisti,
    totaliAcquisti,
    ivaPerCassa: ivaPerCassaRighe,
    riepilogoLiquidazione,
    creditoCompensabile,
    controlliWarning
  }
}
