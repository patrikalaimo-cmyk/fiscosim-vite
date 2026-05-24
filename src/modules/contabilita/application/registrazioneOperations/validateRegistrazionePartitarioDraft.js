import { normalizeText } from '../canonical_mapper/utils.js'

function toAmount(value) {
  const parsed = Number.parseFloat(String(normalizeText(value)).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function validateRegistrazionePartitarioDraft(draft = {}, options = {}) {
  const behavior = options?.behavior && typeof options.behavior === 'object' ? options.behavior : {}
  const documentData = draft?.documentData && typeof draft.documentData === 'object' ? draft.documentData : {}
  const partitarioData = draft?.partitarioData && typeof draft.partitarioData === 'object' ? draft.partitarioData : {}
  const openItems = Array.isArray(options?.openItems) ? options.openItems : Array.isArray(partitarioData.partite) ? partitarioData.partite : []
  const blockers = []
  const warnings = []
  const info = []

  if (!behavior?.showPartitario) {
    return { status: 'idle', blockers, warnings, info }
  }

  const soggetto = normalizeText(draft?.header?.soggetto || draft?.header?.clienteFornitoreNome || draft?.header?.cliente_fornitore_nome)
  const soggettoId = normalizeText(draft?.header?.clienteFornitoreId || draft?.header?.cliente_fornitore_id)
  const tipoMovimento = normalizeText(partitarioData.tipoMovimento || partitarioData.tipo_movimento || behavior?.partitarioMode)
  const isApertura = tipoMovimento === 'apertura'
  const isChiusura = tipoMovimento === 'chiusura'

  if (!soggetto && !soggettoId) blockers.push('cliente / fornitore mancante')

  if (isChiusura && !openItems.length) {
    warnings.push('Partite aperte non ancora collegate al read model reale')
  }

  if (isChiusura && !String(partitarioData.selectedPartitaId || '').trim()) {
    warnings.push('nessuna partita selezionata per la chiusura')
  }

  if (isApertura && !String(partitarioData.numeroDocumento || documentData.numeroDocumento || draft?.header?.numeroDocumento || '').trim()) {
    warnings.push('numero documento da predisporre per l apertura partite')
  }

  if (isApertura && !String(partitarioData.dataDocumento || documentData.dataDocumento || draft?.header?.dataDocumento || draft?.header?.dataRegistrazione || '').trim()) {
    warnings.push('data documento da predisporre per l apertura partite')
  }

  if (partitarioData.importoChiusura != null && toAmount(partitarioData.importoChiusura) < 0) {
    blockers.push('importo chiusura partitario negativo non ammesso')
  }

  if (isChiusura && partitarioData.selectedPartitaId) {
    info.push('Partita predisposta in bozza, chiusura reale non eseguita in questa fase')
  }

  if (isApertura && partitarioData.importoAperto != null && toAmount(partitarioData.importoAperto) <= 0) {
    warnings.push('importo apertura partitario da completare')
  }

  if (isChiusura && partitarioData.selectedPartitaId) {
    const saldoResiduo = Math.abs(toAmount(partitarioData.selectedPartitaSaldoResiduo || partitarioData.residuo || 0))
    const importoChiusura = Math.abs(toAmount(partitarioData.importoChiusura))
    if (saldoResiduo > 0 && importoChiusura - saldoResiduo > 0.01) {
      warnings.push('importo chiusura superiore al saldo residuo della partita selezionata')
    }
  }

  const status = blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ok'

  return {
    status,
    blockers,
    warnings,
    info,
  }
}
