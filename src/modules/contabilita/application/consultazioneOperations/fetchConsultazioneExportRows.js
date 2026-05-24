import * as contabilitaRepo from '../../data/contabilitaRepo.js'
import { buildConsultazioneRowViewModel } from './buildConsultazioneRowViewModel.js'
import { filterConsultazioneRows } from './filterConsultazioneRows.js'
import { calculateConsultazioneSaldoProgressivo } from './calculateConsultazioneSaldoProgressivo.js'

export async function fetchConsultazioneExportRows({ societaId, serverFilters = {}, clientFilters = {} } = {}) {
  const pageSize = 500
  let page = 1
  let allRows = []

  while (true) {
    const { data, error } = await contabilitaRepo.getPrimaNotaConsultazioneRowsAdvanced(societaId, {
      ...serverFilters,
      page,
      pageSize,
    })
    if (error) throw error
    const chunk = Array.isArray(data) ? data : []
    if (!chunk.length) break
    allRows = allRows.concat(chunk)
    if (chunk.length < pageSize) break
    page += 1
  }

  const rowVMs = allRows.map((row, index) => buildConsultazioneRowViewModel(row, index))
  const filtered = filterConsultazioneRows(rowVMs, clientFilters)
  return calculateConsultazioneSaldoProgressivo(filtered)
}
