/**
 * Snapshot compatto da form import per salvataggio correzioni operatore (API server).
 */

/**
 * @param {Record<string, unknown>} form
 * @param {string} tipo
 * @returns {Record<string, unknown>}
 */
export function buildParsingSnapshotFromImportForm(form, tipo) {
  if (!form || typeof form !== 'object') return {}
  return {
    tipo_documento: tipo,
    numero: form.numero ?? null,
    data: form.data ?? null,
    tipo_doc: form.tipo_doc ?? null,
    cedente_denom: form.cedente_denom ?? null,
    cedente_piva: form.cedente_piva ?? null,
    cedente_cf: form.cedente_cf ?? null,
    cessionario_denom: form.cessionario_denom ?? null,
    cessionario_piva: form.cessionario_piva ?? null,
    imponibile: form.imponibile ?? null,
    iva_totale: form.iva_totale ?? null,
    totale: form.totale ?? null,
    riepilogo_iva: form.riepilogo_iva ?? null,
    causale: form.causale ?? null,
    linee: form.linee ?? null,
  }
}

/**
 * @param {Record<string, unknown>} form
 * @param {Array<{ id: string, codice?: string, descrizione?: string }>} pianoConti
 * @returns {Record<string, unknown>}
 */
export function buildAccountingSnapshotFromImportForm(form, pianoConti) {
  if (!form || typeof form !== 'object') return {}
  const c = form.conto_id && Array.isArray(pianoConti) ? pianoConti.find((x) => x.id === form.conto_id) : null
  return {
    conto_id: form.conto_id ?? null,
    conto_codice: c?.codice ?? null,
    conto_descrizione: c?.descrizione ?? null,
    conto_search: form.conto_search ?? null,
  }
}
