export const COMMON_UI_TEXT = {
  loading: 'Caricamento...',
  edit: 'Modifica',
  importPdfExcel: 'Import PDF/Excel',
  deleting: 'Eliminazione...',
}

export const ACCOUNTING_UI_TEXT = {
  newAccount: 'Nuovo conto',
  newCausale: 'Nuova causale',
  searchAccountPlaceholder: 'Cerca conto per codice o descrizione...',
  expandAll: 'espandi tutto',
  collapseAll: 'collassa tutto',
  noAccount: 'Nessun conto',
  noCausale: 'Nessuna causale',
}

export function deleteAllLabel(count) {
  return `Elimina tutto (${count})`
}

export function deleteSelectedLabel(count) {
  return `Elimina (${count})`
}
