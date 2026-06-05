import { normalizeText } from '../canonical_mapper/utils.js'
import { resolvePartitaSoggettoId } from './resolvePartitaSoggettoId.js'


function toAmount(value) {
  const parsed = Number.parseFloat(String(normalizeText(value)).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function validateRegistrazionePartitarioDraft(draft = {}, options = {}) {
  const behavior = options?.behavior && typeof options.behavior === 'object' ? options.behavior : {}
  const documentData = draft?.documentData && typeof draft.documentData === 'object' ? draft.documentData : {}
  const partitarioData = draft?.partitarioData && typeof draft.partitarioData === 'object' ? draft.partitarioData : {}
  const openItems = Array.isArray(options?.openItems) ? options.openItems : Array.isArray(options?.partite) ? options.partite : Array.isArray(partitarioData.partite) ? partitarioData.partite : []
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

  const rawSelectedPartitaIds = Array.isArray(partitarioData.selectedPartitaIds) 
    ? partitarioData.selectedPartitaIds 
    : partitarioData.selectedPartitaId 
      ? [partitarioData.selectedPartitaId] 
      : []
  const selectedPartitaIds = rawSelectedPartitaIds.map(x => String(x || '').trim())


  if (isChiusura && !selectedPartitaIds.length) {
    blockers.push('Nessuna partita selezionata per la chiusura. Per registrazioni senza partitario utilizzare una causale semplice.')
  }

  if (isChiusura && Array.isArray(partitarioData.rows)) {
    const selectedRows = partitarioData.rows.filter(r => r.selected)
    const uniqueSoggettoIds = new Set(selectedRows.map(r => resolvePartitaSoggettoId(r)).filter(Boolean))
    if (uniqueSoggettoIds.size > 1) {
      blockers.push('Incassi/pagamenti multipli non ancora abilitati')
    }
  }

  if (isApertura && !String(partitarioData.numeroDocumento || documentData.numeroDocumento || draft?.header?.numeroDocumento || '').trim()) {
    warnings.push('numero documento da predisporre per l apertura partite')
  }

  if (isApertura && !String(partitarioData.dataDocumento || documentData.dataDocumento || draft?.header?.dataDocumento || draft?.header?.dataRegistrazione || '').trim()) {
    warnings.push('data documento da predisporre per l apertura partite')
  }

  // Check for any NC evidence: selected partite with negative importiChiusura
  const hasNcEvidence = (() => {
    const ids = Array.isArray(partitarioData.selectedPartitaIds) ? partitarioData.selectedPartitaIds : (partitarioData.selectedPartitaId ? [partitarioData.selectedPartitaId] : [])
    if (!ids.length) return false
    const importiMap = partitarioData.importiChiusura && typeof partitarioData.importiChiusura === 'object' ? partitarioData.importiChiusura : {}
    // negative importoChiusura at top level (single selection) or in importiChiusura map
    if (toAmount(partitarioData.importoChiusura) < 0) return true
    return ids.some(id => {
      const v = importiMap[String(id || '').trim()]
      return v !== undefined && v !== null && v !== '' && toAmount(v) < 0
    })
  })()

  if (!isChiusura && !hasNcEvidence && partitarioData.importoChiusura != null && toAmount(partitarioData.importoChiusura) < 0) {
    blockers.push('importo chiusura partitario negativo non ammesso')
  }

  if (isChiusura && selectedPartitaIds.length > 0) {
    info.push('Partita predisposta in bozza, chiusura reale non eseguita in questa fase')
  }

  if (isApertura && partitarioData.importoAperto != null && toAmount(partitarioData.importoAperto) <= 0) {
    warnings.push('importo apertura partitario da completare')
  }

  let netChiusura = 0
  if (isChiusura && Array.isArray(partitarioData.rows)) {
    partitarioData.rows.forEach(row => {
      if (row.selected) {
        const saldoResiduo = row.residuo || 0
        const importoChiusura = row.importoChiusura || 0
        netChiusura += importoChiusura

        // Validate sign
        if (saldoResiduo < 0 && importoChiusura > 0) {
          blockers.push(`l'importo di chiusura per la nota di credito n. ${row.numeroDocumento || 'selezionata'} deve essere negativo o zero`)
        }
        if (saldoResiduo > 0 && importoChiusura < 0) {
          blockers.push(`l'importo di chiusura per la fattura n. ${row.numeroDocumento || 'selezionata'} deve essere positivo o zero`)
        }

        // Validate overpayment in absolute value
        const absRes = Math.abs(saldoResiduo)
        const absChiusura = Math.abs(importoChiusura)
        if (absRes > 0 && absChiusura - absRes > 0.01) {
          warnings.push(`importo chiusura superiore al saldo residuo della partita n. ${row.numeroDocumento || 'selezionata'}`)
        }
      }
    })
  }

  // Blocco/Warning se il netto finanziario selezionato è negativo per il flusso (Vincolo 4)
  if (isChiusura) {
    const subjectAccount = Array.isArray(options?.pianoConti)
      ? options.pianoConti.find((item) => String(item?.id || '').trim() === soggettoId)
      : null
    const isCustomer = Boolean(subjectAccount?.is_cliente) || normalizeText(draft?.header?.clienteFornitoreTipo || draft?.header?.cliente_fornitore_tipo) === 'cliente'
    const isSupplier = Boolean(subjectAccount?.is_fornitore || subjectAccount?.is_professionista) || ['fornitore', 'professionista'].includes(normalizeText(draft?.header?.clienteFornitoreTipo || draft?.header?.cliente_fornitore_tipo))

    const selectedRows = Array.isArray(partitarioData.rows) ? partitarioData.rows.filter(r => r.selected) : []
    const hasNc = selectedRows.some(r => {
      const val = toAmount(r.importoChiusura)
      const residuo = toAmount(r.residuo ?? r.saldoResiduo ?? r.importo_residuo ?? r.saldo)
      return val < 0 || residuo < 0
    })

    if (!hasNc && isCustomer && netChiusura < 0) {
      blockers.push("L'incasso cliente non può essere negativo. Le note di credito superano le fatture da chiudere.")
    }
    if (!hasNc && isSupplier && netChiusura < 0) {
      blockers.push("Il pagamento fornitore non può essere negativo. Le note di credito superano le fatture da chiudere.")
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
