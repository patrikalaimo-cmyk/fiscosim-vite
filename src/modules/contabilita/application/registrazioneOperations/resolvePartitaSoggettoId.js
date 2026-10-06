export function resolvePartitaSoggettoId(partita) {
  if (!partita) return ''
  return String(
    partita.conto_id || 
    partita.contoId || 
    partita.soggettoId || 
    partita.soggetto_id || 
    partita.clienteFornitoreId || 
    partita.cliente_fornitore_id || 
    ''
  ).trim()
}
