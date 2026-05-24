import { CONSULTAZIONE_FILTER_DEFAULTS } from '../../domain/consultazione/consultazioneDefaults.js'

function trim(value) {
  return String(value ?? '').trim()
}

function normalizeDate(value) {
  const v = trim(value)
  if (!v) return ''
  return v.slice(0, 10)
}

function normalizeNumberInput(value) {
  const v = trim(value)
  if (!v) return ''
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? String(n) : ''
}

function normalizeExercise(value) {
  const v = trim(value)
  if (!v) return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return String(Math.trunc(n))
}

export function normalizeConsultazioneFilters(filters = {}) {
  const merged = { ...CONSULTAZIONE_FILTER_DEFAULTS, ...filters }
  return {
    esercizio: normalizeExercise(merged.esercizio),
    dataRegistrazioneDa: normalizeDate(merged.dataRegistrazioneDa),
    dataRegistrazioneA: normalizeDate(merged.dataRegistrazioneA),
    dataDocumentoDa: normalizeDate(merged.dataDocumentoDa),
    dataDocumentoA: normalizeDate(merged.dataDocumentoA),
    conto: trim(merged.conto),
    soggetto: trim(merged.soggetto),
    numeroDocumento: trim(merged.numeroDocumento),
    causaleContabile: trim(merged.causaleContabile),
    causaleIva: trim(merged.causaleIva),
    statoQuadratura: trim(merged.statoQuadratura) || 'tutti',
    importoPreciso: normalizeNumberInput(merged.importoPreciso),
    tolleranzaImporto: normalizeNumberInput(merged.tolleranzaImporto),
    importoDa: normalizeNumberInput(merged.importoDa),
    importoA: normalizeNumberInput(merged.importoA),
    registroIva: trim(merged.registroIva),
    protocolloIva: trim(merged.protocolloIva),
    testoLibero: trim(merged.testoLibero),
    descrizioneRiga: trim(merged.descrizioneRiga),
  }
}
