/**
 * Parsing fattura elettronica in ambiente Node (DOMParser da linkedom — supporta querySelector su XML).
 * Stessa logica di domain/fatture.js `parseXMLFattura`.
 */

import { DOMParser } from 'linkedom'

export function parseXMLFatturaNode(xmlText) {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(String(xmlText || ''), 'application/xml')
  const get = (sel) => xmlDoc.querySelector(sel)?.textContent?.trim() || ''

  const cedente = xmlDoc.querySelector('CedentePrestatore')
  const cessionario = xmlDoc.querySelector('CessionarioCommittente')
  const linee = xmlDoc.querySelectorAll('DettaglioLinee')
  const riepiloghi = xmlDoc.querySelectorAll('DatiRiepilogo')
  const pagamenti = xmlDoc.querySelectorAll('DettaglioPagamento')

  const getNome = (el) => {
    if (!el) return ''
    const denom = el.querySelector('Denominazione')?.textContent?.trim()
    if (denom) return denom
    const nome = el.querySelector('Nome')?.textContent?.trim() || ''
    const cognome = el.querySelector('Cognome')?.textContent?.trim() || ''
    return `${cognome} ${nome}`.trim()
  }
  const getPiva = (el) => {
    if (!el) return ''
    return el.querySelector('IdCodice')?.textContent?.trim() || ''
  }
  const getCF = (el) => {
    if (!el) return ''
    return el.querySelector('CodiceFiscale')?.textContent?.trim() || ''
  }
  const getIndirizzo = (el) => {
    if (!el) return ''
    const sede = el.querySelector('Sede')
    if (!sede) return ''
    const ind = sede.querySelector('Indirizzo')?.textContent?.trim() || ''
    const cap = sede.querySelector('CAP')?.textContent?.trim() || ''
    const com = sede.querySelector('Comune')?.textContent?.trim() || ''
    const prov = sede.querySelector('Provincia')?.textContent?.trim() || ''
    const naz = sede.querySelector('Nazione')?.textContent?.trim() || ''
    return [ind, cap + ' ' + com + (prov ? ' (' + prov + ')' : ''), naz !== 'IT' ? naz : ''].filter(Boolean).join(' — ')
  }

  let totImponibile = 0
  let totImposta = 0
  const riepilogoArr = [...riepiloghi].map((r) => {
    const imp = parseFloat(r.querySelector('ImponibileImporto')?.textContent || '0')
    const iva = parseFloat(r.querySelector('Imposta')?.textContent || '0')
    const aliq = r.querySelector('AliquotaIVA')?.textContent?.trim() || '0'
    const nat = r.querySelector('Natura')?.textContent?.trim() || ''
    totImponibile += imp
    totImposta += iva
    return { aliquota: aliq, imponibile: imp, imposta: iva, natura: nat }
  })

  const linesArr = [...linee].map((l) => {
    const sconto = l.querySelector('ScontoMaggiorazione')
    return {
      num: l.querySelector('NumeroLinea')?.textContent?.trim() || '',
      desc: l.querySelector('Descrizione')?.textContent?.trim() || '',
      codice_art: l.querySelector('CodiceValore')?.textContent?.trim() || '',
      qty: parseFloat(l.querySelector('Quantita')?.textContent || '1'),
      um: l.querySelector('UnitaMisura')?.textContent?.trim() || '',
      prezzo: parseFloat(l.querySelector('PrezzoUnitario')?.textContent || '0'),
      totale: parseFloat(l.querySelector('PrezzoTotale')?.textContent || '0'),
      iva: l.querySelector('AliquotaIVA')?.textContent?.trim() || '',
      natura: l.querySelector('Natura')?.textContent?.trim() || '',
      sconto: sconto ? parseFloat(sconto.querySelector('Percentuale')?.textContent || '0') : null,
    }
  })

  const pagArr = [...pagamenti].map((p) => ({
    modalita: p.querySelector('ModalitaPagamento')?.textContent?.trim() || '',
    scadenza: p.querySelector('DataScadenzaPagamento')?.textContent?.trim() || '',
    importo: parseFloat(p.querySelector('ImportoPagamento')?.textContent || '0'),
    iban: p.querySelector('IBAN')?.textContent?.trim() || '',
  }))

  const bolloEl = xmlDoc.querySelector('DatiBollo')
  const totaleDoc = parseFloat(get('ImportoTotaleDocumento') || '0') || totImponibile + totImposta

  return {
    fornitore: getNome(cedente),
    fornitore_cf: getCF(cedente),
    cliente: getNome(cessionario),
    cliente_cf: getCF(cessionario),
    numero: get('Numero'),
    data: get('Data'),
    tipo_documento: get('TipoDocumento'),
    totale: totaleDoc,
    imponibile: totImponibile,
    imposta: totImposta,
    imponibili: riepilogoArr.map((r) => ({ imp: r.imponibile, aliq: r.aliquota, nat: r.natura })),
    linee: linesArr.map((l) => ({
      descrizione: l.desc,
      quantita: l.qty,
      prezzoUnitario: l.prezzo,
      prezzoTotale: l.totale,
      aliquotaIVA: l.iva,
      natura: l.natura,
    })),
    tipo: get('TipoDocumento'),
    nome_cedente: getNome(cedente),
    piva_cedente: getPiva(cedente),
    cf_cedente: getCF(cedente),
    indirizzo_cedente: getIndirizzo(cedente),
    regime_fiscale: cedente?.querySelector('RegimeFiscale')?.textContent?.trim() || '',
    nome_cessionario: getNome(cessionario),
    piva_cessionario: getPiva(cessionario),
    cf_cessionario: getCF(cessionario),
    indirizzo_cessionario: getIndirizzo(cessionario),
    divisa: get('Divisa') || 'EUR',
    causale: get('Causale'),
    progressivo_invio: get('ProgressivoInvio'),
    formato: xmlDoc.querySelector('FatturaElettronica')?.getAttribute('versione') || 'FPR12',
    totale_doc: totaleDoc,
    riepilogo: riepilogoArr,
    lines: linesArr,
    pagamenti: pagArr,
    bollo_virtuale: !!bolloEl,
    bollo_importo: bolloEl ? parseFloat(bolloEl.querySelector('ImportoBollo')?.textContent || '0') : null,
  }
}

/**
 * Allineato a ModuloContabilità `parseXMLFile` (modalità locale XML).
 */
export function buildPassiveAnalysisFromParsed(parsed) {
  const isPassiva = parsed.tipo === 'TD01' || parsed.tipo === 'TD02' || parsed.tipo === 'TD04'
  const aliquota = parsed.lines?.[0]?.iva || 22
  const iva = parsed.imponibile * (Number(aliquota) / 100)
  return {
    tipo_fattura: isPassiva ? 'fattura_passiva' : 'fattura_attiva',
    numero_documento: parsed.numero,
    data_documento: parsed.data,
    cedente: { denominazione: parsed.nome_cedente, partita_iva: parsed.piva_cedente },
    cessionario: { denominazione: parsed.nome_cessionario, partita_iva: parsed.piva_cessionario },
    imponibile: parsed.imponibile,
    iva: Math.round(iva * 100) / 100,
    totale: parsed.totale_doc || parsed.imponibile + iva,
    aliquota_iva: aliquota,
    is_transitorio: true,
    motivo_transitorio: 'Classificazione manuale richiesta (test scenario)',
    confidence: 0,
    proposta_contabile: {
      causale_codice: isPassiva ? 'FF' : 'FC',
      causale_descrizione: isPassiva ? 'Fattura Fornitore' : 'Fattura Cliente',
    },
  }
}

