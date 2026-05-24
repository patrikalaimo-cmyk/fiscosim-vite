function num(value) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function contains(haystack, needle) {
  const a = String(haystack ?? '').toLowerCase()
  const b = String(needle ?? '').toLowerCase()
  return !b || a.includes(b)
}

function normalizeDate(value) {
  const v = String(value ?? '').trim()
  return v ? v.slice(0, 10) : ''
}

export function filterConsultazioneRows(rows = [], filters = {}) {
  const dateRegDa = normalizeDate(filters.dataRegistrazioneDa)
  const dateRegA = normalizeDate(filters.dataRegistrazioneA)
  const dateDocDa = normalizeDate(filters.dataDocumentoDa)
  const dateDocA = normalizeDate(filters.dataDocumentoA)
  const conto = String(filters.conto || '').trim().toLowerCase()
  const soggetto = String(filters.soggetto || '').trim().toLowerCase()
  const numDoc = String(filters.numeroDocumento || '').trim().toLowerCase()
  const causaleContabile = String(filters.causaleContabile || '').trim().toLowerCase()
  const causaleIva = String(filters.causaleIva || '').trim().toLowerCase()
  const statoQuadratura = String(filters.statoQuadratura || 'tutti').trim().toLowerCase()
  const importoPreciso = filters.importoPreciso === '' ? null : num(filters.importoPreciso)
  const tolleranzaImporto = Math.abs(num(filters.tolleranzaImporto))
  const importoDa = filters.importoDa === '' ? null : num(filters.importoDa)
  const importoA = filters.importoA === '' ? null : num(filters.importoA)
  const registroIva = String(filters.registroIva || '').trim().toLowerCase()
  const protocolloIva = String(filters.protocolloIva || '').trim().toLowerCase()
  const testoLibero = String(filters.testoLibero || '').trim().toLowerCase()
  const descrizioneRiga = String(filters.descrizioneRiga || '').trim().toLowerCase()

  return (rows || []).filter((row) => {
    const rowDateReg = String(row.dataRegistrazione || '').slice(0, 10)
    const rowDateDoc = String(row.dataDocumento || '').slice(0, 10)
    const rowAmount = Math.max(Math.abs(num(row.dare)), Math.abs(num(row.avere)), Math.abs(num(row.saldoRiga)))
    const rowText = String(row.textSearch || `${row.numeroRegistrazione} ${row.numeroDocumento} ${row.contoCodice} ${row.contoDescrizione} ${row.descrizioneRiga} ${row.causaleContabile} ${row.causaleIva} ${row.soggetto}`)
      .toLowerCase()

    if (dateRegDa && rowDateReg && rowDateReg < dateRegDa) return false
    if (dateRegA && rowDateReg && rowDateReg > dateRegA) return false
    if (dateDocDa && rowDateDoc && rowDateDoc < dateDocDa) return false
    if (dateDocA && rowDateDoc && rowDateDoc > dateDocA) return false
    if (conto && !contains(`${row.contoId} ${row.contoCodice} ${row.contoDescrizione}`, conto)) return false
    if (soggetto && !contains(row.soggetto, soggetto)) return false
    if (numDoc && !contains(row.numeroDocumento, numDoc)) return false
    if (causaleContabile && !contains(row.causaleContabile, causaleContabile)) return false
    if (causaleIva && !contains(row.causaleIva, causaleIva)) return false
    if (statoQuadratura && statoQuadratura !== 'tutti' && String(row.statoQuadratura || '').toLowerCase() !== statoQuadratura) return false
    if (importoPreciso != null && Math.abs(rowAmount - importoPreciso) > tolleranzaImporto) return false
    if (importoDa != null && rowAmount < importoDa) return false
    if (importoA != null && rowAmount > importoA) return false
    if (registroIva && !contains(row.registroIva, registroIva)) return false
    if (protocolloIva && !contains(row.protocolloIva, protocolloIva)) return false
    if (testoLibero && !contains(rowText, testoLibero)) return false
    if (descrizioneRiga && !contains(row.descrizioneRiga, descrizioneRiga)) return false
    return true
  })
}
