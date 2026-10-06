export async function parseXML(file) {
  const xmlText = await file.text()
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')

  const pickText = (el, tag) => {
    const n = el?.getElementsByTagName(tag)?.[0]
    return n?.textContent?.trim() || ''
  }

  const parseNum = (v) => {
    if (v == null) return null
    const s = String(v).trim().replace(',', '.')
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }

  // CedentePrestatore → Denominazione (fornitore)
  const cedente = doc.getElementsByTagName('CedentePrestatore')?.[0]
  const datiAnagCed = cedente?.getElementsByTagName('DatiAnagrafici')?.[0]
  const anagCed = cedente?.getElementsByTagName('Anagrafica')?.[0]
  const fornitore = pickText(anagCed, 'Denominazione') || pickText(anagCed, 'Nome') || ''
  const cedente_piva =
    pickText(datiAnagCed?.getElementsByTagName('IdFiscaleIVA')?.[0], 'IdCodice') ||
    pickText(datiAnagCed, 'CodiceFiscale') ||
    ''

  // DatiGeneraliDocumento → Numero + Data
  const datiGenDoc = doc.getElementsByTagName('DatiGeneraliDocumento')?.[0]
  const numero_documento = pickText(datiGenDoc, 'Numero') || ''
  const data_documento = pickText(datiGenDoc, 'Data') || ''

  // DatiRiepilogo (IVA)
  const riepiloghi = Array.from(doc.getElementsByTagName('DatiRiepilogo') || [])
  const riepilogo_iva = riepiloghi.map(r => {
    const aliquota = pickText(r, 'AliquotaIVA')
    const imponibile = parseNum(pickText(r, 'ImponibileImporto'))
    const imposta = parseNum(pickText(r, 'Imposta'))
    return { aliquota, imponibile, imposta }
  }).filter(r => r.aliquota !== '' || r.imponibile != null || r.imposta != null)

  const totale = riepilogo_iva.reduce((s, r) => s + (r.imponibile || 0) + (r.imposta || 0), 0)

  return {
    riepilogo_iva,
    totale,
    fornitore,
    cedente_piva,
    numero_documento,
    data_documento,
  }
}

