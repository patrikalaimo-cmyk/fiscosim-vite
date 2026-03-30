// ─── UTILS FATTURE XML ───────────────────────────────────────────
// Usate da: ModuloContabilita, ModuloF24
// Non importare direttamente tra moduli — via shared/utils/fatture.js

export function parseXMLFattura(xmlText) {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml')
  const get = sel => xmlDoc.querySelector(sel)?.textContent?.trim() || ''

  const cedente     = xmlDoc.querySelector('CedentePrestatore')
  const cessionario = xmlDoc.querySelector('CessionarioCommittente')
  const linee       = xmlDoc.querySelectorAll('DettaglioLinee')
  const riepiloghi  = xmlDoc.querySelectorAll('DatiRiepilogo')
  const pagamenti   = xmlDoc.querySelectorAll('DettaglioPagamento')

  const getNome = el => {
    if (!el) return ''
    const denom = el.querySelector('Denominazione')?.textContent?.trim()
    if (denom) return denom
    const nome    = el.querySelector('Nome')?.textContent?.trim()    || ''
    const cognome = el.querySelector('Cognome')?.textContent?.trim() || ''
    return `${cognome} ${nome}`.trim()
  }
  const getPiva = el => {
    if (!el) return ''
    return el.querySelector('IdCodice')?.textContent?.trim() || ''
  }
  const getCF = el => {
    if (!el) return ''
    return el.querySelector('CodiceFiscale')?.textContent?.trim() || ''
  }
  const getIndirizzo = el => {
    if (!el) return ''
    const sede = el.querySelector('Sede')
    if (!sede) return ''
    const ind  = sede.querySelector('Indirizzo')?.textContent?.trim() || ''
    const cap  = sede.querySelector('CAP')?.textContent?.trim()       || ''
    const com  = sede.querySelector('Comune')?.textContent?.trim()    || ''
    const prov = sede.querySelector('Provincia')?.textContent?.trim() || ''
    const naz  = sede.querySelector('Nazione')?.textContent?.trim()   || ''
    return [ind, cap+' '+com+(prov?' ('+prov+')':''), naz !== 'IT' ? naz : ''].filter(Boolean).join(' — ')
  }

  let totImponibile = 0, totImposta = 0
  const riepilogoArr = [...riepiloghi].map(r => {
    const imp  = parseFloat(r.querySelector('ImponibileImporto')?.textContent || '0')
    const iva  = parseFloat(r.querySelector('Imposta')?.textContent           || '0')
    const aliq = r.querySelector('AliquotaIVA')?.textContent?.trim()  || '0'
    const nat  = r.querySelector('Natura')?.textContent?.trim()        || ''
    totImponibile += imp
    totImposta    += iva
    return { aliquota: aliq, imponibile: imp, imposta: iva, natura: nat }
  })

  const linesArr = [...linee].map(l => {
    const sconto = l.querySelector('ScontoMaggiorazione')
    return {
      num:      l.querySelector('NumeroLinea')?.textContent?.trim()  || '',
      desc:     l.querySelector('Descrizione')?.textContent?.trim()  || '',
      codice_art: l.querySelector('CodiceValore')?.textContent?.trim() || '',
      qty:      parseFloat(l.querySelector('Quantita')?.textContent  || '1'),
      um:       l.querySelector('UnitaMisura')?.textContent?.trim()  || '',
      prezzo:   parseFloat(l.querySelector('PrezzoUnitario')?.textContent || '0'),
      totale:   parseFloat(l.querySelector('PrezzoTotale')?.textContent   || '0'),
      iva:      l.querySelector('AliquotaIVA')?.textContent?.trim()  || '',
      natura:   l.querySelector('Natura')?.textContent?.trim()        || '',
      sconto:   sconto ? parseFloat(sconto.querySelector('Percentuale')?.textContent || '0') : null,
    }
  })

  const pagArr = [...pagamenti].map(p => ({
    modalita: p.querySelector('ModalitaPagamento')?.textContent?.trim() || '',
    scadenza: p.querySelector('DataScadenzaPagamento')?.textContent?.trim() || '',
    importo:  parseFloat(p.querySelector('ImportoPagamento')?.textContent || '0'),
    iban:     p.querySelector('IBAN')?.textContent?.trim() || '',
  }))

  const bolloEl = xmlDoc.querySelector('DatiBollo')
  const totaleDoc = parseFloat(get('ImportoTotaleDocumento') || '0') || (totImponibile + totImposta)

  return {
    // Compatibilità vecchi campi
    fornitore:    getNome(cedente),
    fornitore_cf: getCF(cedente),
    cliente:      getNome(cessionario),
    cliente_cf:   getCF(cessionario),
    numero:       get('Numero'),
    data:         get('Data'),
    tipo_documento: get('TipoDocumento'),
    totale:       totaleDoc,
    imponibile:   totImponibile,
    imposta:      totImposta,
    imponibili:   riepilogoArr.map(r => ({imp:r.imponibile, aliq:r.aliquota, nat:r.natura})),
    linee:        linesArr.map(l => ({
      descrizione: l.desc, quantita: l.qty, prezzoUnitario: l.prezzo,
      prezzoTotale: l.totale, aliquotaIVA: l.iva, natura: l.natura,
    })),
    // Campi nuovi per FatturaViewer
    tipo:               get('TipoDocumento'),
    nome_cedente:       getNome(cedente),
    piva_cedente:       getPiva(cedente),
    cf_cedente:         getCF(cedente),
    indirizzo_cedente:  getIndirizzo(cedente),
    regime_fiscale:     cedente?.querySelector('RegimeFiscale')?.textContent?.trim() || '',
    nome_cessionario:   getNome(cessionario),
    piva_cessionario:   getPiva(cessionario),
    cf_cessionario:     getCF(cessionario),
    indirizzo_cessionario: getIndirizzo(cessionario),
    divisa:             get('Divisa') || 'EUR',
    causale:            get('Causale'),
    progressivo_invio:  get('ProgressivoInvio'),
    formato:            xmlDoc.querySelector('FatturaElettronica')?.getAttribute('versione') || 'FPR12',
    totale_doc:         totaleDoc,
    riepilogo:          riepilogoArr,
    lines:              linesArr,
    pagamenti:          pagArr,
    bollo_virtuale:     !!bolloEl,
    bollo_importo:      bolloEl ? parseFloat(bolloEl.querySelector('ImportoBollo')?.textContent || '0') : null,
  }
}

export function formattaXML(xmlText) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'application/xml')
    const serializer = new XMLSerializer()
    let formatted = serializer.serializeToString(doc)
    // Basic indent
    formatted = formatted.replace(/></g, '>\n<')
    return formatted
  } catch {
    return xmlText
  }
}

// ─── CATEGORIE CESPITI ───────────────────────────────────────────
export const CATEGORIE_CESPITI = [
  { cat: 'Automezzi', aliquota: 25, desc: 'Autovetture, furgoni, motocicli' },
  { cat: 'Macchine d\'ufficio elettroniche', aliquota: 20, desc: 'PC, stampanti, server, tablet' },
  { cat: 'Mobili e arredi', aliquota: 12, desc: 'Mobili ufficio, scaffalature' },
  { cat: 'Impianti generici', aliquota: 15, desc: 'Impianti elettrici, idraulici' },
  { cat: 'Fabbricati strumentali', aliquota: 3, desc: 'Immobili strumentali' },
  { cat: 'Software', aliquota: 33.33, desc: 'Programmi e licenze' },
  { cat: 'Attrezzature varie', aliquota: 15, desc: 'Strumenti e attrezzature' },
  { cat: 'Beni immateriali', aliquota: 20, desc: 'Brevetti, marchi, avviamento' },
]

export function suggerisciCespiteDeterministico(descrizione) {
  const d = (descrizione || '').toLowerCase()
  if (/auto|veicol|furgon|moto|camion|macchina/.test(d)) return CATEGORIE_CESPITI[0]
  if (/pc|computer|server|stampant|tablet|monitor|notebook|laptop/.test(d)) return CATEGORIE_CESPITI[1]
  if (/mobil|arredi|scrivania|sedia|scaffal/.test(d)) return CATEGORIE_CESPITI[2]
  if (/impianto|elettrico|idraulic|condizion/.test(d)) return CATEGORIE_CESPITI[3]
  if (/fabbricat|immobil|capannone|ufficio/.test(d)) return CATEGORIE_CESPITI[4]
  if (/software|programm|licenz|app/.test(d)) return CATEGORIE_CESPITI[5]
  if (/attrezzat|strument|macchinar/.test(d)) return CATEGORIE_CESPITI[6]
  return null
}
