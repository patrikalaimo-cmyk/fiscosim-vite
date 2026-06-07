export function resolvePartitaImportoResiduo(partita = {}, fallback = null) {
  const source = partita && typeof partita === 'object' ? partita : {}
  const value =
    source.importo_residuo ??
    source.importoResiduo ??
    source.residuo ??
    source.saldoResiduo ??
    source.saldo_residuo ??
    source.saldo ??
    fallback

  return value
}
