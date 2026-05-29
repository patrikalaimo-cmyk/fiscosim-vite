import { normalizeConsultazioneFilters } from './normalizeConsultazioneFilters.js'

function yearBounds(esercizio) {
  if (!esercizio) return { from: '', to: '' }
  const y = Number(esercizio)
  if (!Number.isFinite(y)) return { from: '', to: '' }
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

export function buildConsultazioneQueryParams(filters = {}, { page = 1, pageSize = 50 } = {}) {
  const normalized = normalizeConsultazioneFilters(filters)
  const bounds = yearBounds(normalized.esercizio)
  return {
    server: {
      dateFrom: normalized.dataRegistrazioneDa || bounds.from || null,
      dateTo: normalized.dataRegistrazioneA || bounds.to || null,
      contoLike: normalized.conto || '',
      soggettoLike: normalized.soggetto || '',
      numeroDocumentoLike: normalized.numeroDocumento || '',
      causaleContabile: normalized.causaleContabile || '',
      causaleIva: normalized.causaleIva || '',
      testoLibero: normalized.testoLibero || '',
      importoPreciso: normalized.importoPreciso || '',
      importoDa: normalized.importoDa || '',
      importoA: normalized.importoA || '',
      registroIva: normalized.registroIva || '',
      protocolloIva: normalized.protocolloIva || '',
      tipoScrittureOrdinarie: normalized.tipoScrittureOrdinarie,
      tipoScrittureStornate: normalized.tipoScrittureStornate,
      tipoScrittureSimulate: normalized.tipoScrittureSimulate,
      page,
      pageSize,
    },
    client: normalized,
  }
}
