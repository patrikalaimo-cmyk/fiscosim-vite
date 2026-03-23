// ─── UTILS FATTURE XML ───────────────────────────────────────────
// Usate da: ModuloContabilita, ModuloF24
// Non importare direttamente tra moduli — via shared/utils/fatture.js

export function parseXMLFattura(xmlText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  const get = sel => doc.querySelector(sel)?.textContent?.trim() || ''
  const getAll = sel => [...doc.querySelectorAll(sel)].map(n => n.textContent?.trim())

  const cedente = doc.querySelector('CedentePrestatore')
  const cessionario = doc.querySelector('CessionarioCommittente')
  const dati = doc.querySelector('DatiGeneraliDocumento')
  const linee = doc.querySelectorAll('DettaglioLinee')
  const riepiloghi = doc.querySelectorAll('DatiRiepilogo')

  const getNome = el => {
    if (!el) return ''
    const denom = el.querySelector('Denominazione')?.textContent?.trim()
    if (denom) return denom
    const nome = el.querySelector('Nome')?.textContent?.trim() || ''
    const cognome = el.querySelector('Cognome')?.textContent?.trim() || ''
    return `${cognome} ${nome}`.trim()
  }

  const getCF = el => {
    if (!el) return ''
    return el.querySelector('CodiceFiscale')?.textContent?.trim() ||
      el.querySelector('IdCodice')?.textContent?.trim() || ''
  }

  const imponibili = []
  const imposte = []
  let totImponibile = 0
  let totImposta = 0

  riepiloghi.forEach(r => {
    const imp = parseFloat(r.querySelector('ImponibileImporto')?.textContent || '0')
    const iva = parseFloat(r.querySelector('Imposta')?.textContent || '0')
    const aliq = r.querySelector('AliquotaIVA')?.textContent?.trim() || ''
    const nat = r.querySelector('Natura')?.textContent?.trim() || ''
    imponibili.push({ imp, aliq, nat })
    imposte.push(iva)
    totImponibile += imp
    totImposta += iva
  })

  return {
    fornitore: getNome(cedente),
    fornitore_cf: getCF(cedente),
    cliente: getNome(cessionario),
    cliente_cf: getCF(cessionario),
    numero: get('Numero'),
    data: get('Data'),
    tipo_documento: get('TipoDocumento'),
    totale: parseFloat(get('ImportoTotaleDocumento') || '0') || (totImponibile + totImposta),
    imponibile: totImponibile,
    imposta: totImposta,
    imponibili,
    linee: [...linee].map(l => ({
      descrizione: l.querySelector('Descrizione')?.textContent?.trim() || '',
      quantita: parseFloat(l.querySelector('Quantita')?.textContent || '1'),
      prezzoUnitario: parseFloat(l.querySelector('PrezzoUnitario')?.textContent || '0'),
      prezzoTotale: parseFloat(l.querySelector('PrezzoTotale')?.textContent || '0'),
      aliquotaIVA: l.querySelector('AliquotaIVA')?.textContent?.trim() || '',
      natura: l.querySelector('Natura')?.textContent?.trim() || '',
    }))
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
