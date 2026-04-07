import { buildScritturaRowsFromIvaRows } from './primaNotaScritturaFromIvaRows.js'
import {
  buildPrimaNotaHeaderPayload,
  buildPrimaNotaRighePayload,
  buildPrimaNotaPartitarioPayload,
} from './primaNotaPayloadBuilder.js'

export function buildScritturaContabileFromDraft({
  ivaRows,
  pianoConti = [],
  causaliIva = [],
  clientiFornitori = [],
  clienteFornitoreId,
  causaleContabile,
  soggettoNomeFallback = '',
  newRow,
}) {
  return buildScritturaRowsFromIvaRows({
    ivaRows,
    pianoConti,
    causaliIva,
    clientiFornitori,
    clienteFornitoreId,
    causaleContabile,
    soggettoNomeFallback,
    newRow,
  })
}

export function buildPrimaNotaPayloadFromState({
  societaId,
  header,
  rows,
  progressivo,
  partitarioClosedMap,
  defaultDataRegistrazione,
  filterRiga,
  mapRiga,
  mapPartitarioEntry,
  filterPartitarioEntry,
}) {
  const pnPayload = buildPrimaNotaHeaderPayload({
    societa_id: societaId,
    data_registrazione: header?.data_registrazione || defaultDataRegistrazione,
    causale_id: header?.causale_id || null,
    cliente_fornitore_id: header?.cliente_fornitore_id || null,
    progressivo: progressivo ?? null,
    stato: 'confermato',
  })

  const righePayload = buildPrimaNotaRighePayload(rows || [], {
    filterRow: filterRiga,
    mapRow: mapRiga,
  })

  const rawPartitarioEntries = Object.entries(partitarioClosedMap || {}).map(([documento_id, importo_chiuso]) => ({
    documento_id,
    importo_chiuso,
  }))

  const partEntries = buildPrimaNotaPartitarioPayload(rawPartitarioEntries, {
    mapEntry: mapPartitarioEntry,
    filterEntry: filterPartitarioEntry,
  })

  return {
    pnPayload,
    righePayload,
    partEntries,
  }
}

