import { buildRitenutaPagamentoRows } from './buildRitenutaPagamentoRows.js'

export function applyRegistrazioneRitenutaRows(rows = [], ritenutaDraft = {}, options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : []
  if (ritenutaDraft?.active && ritenutaDraft?.mode === 'pagamento') {
    return buildRitenutaPagamentoRows({
      rows: sourceRows,
      ritenutaDraft,
      causale: options?.causale || options?.selectedCausale || {},
    })
  }
  return {
    rows: sourceRows,
    applied: false,
    blockers: [],
    pendingPaymentPosting: false,
  }
}
