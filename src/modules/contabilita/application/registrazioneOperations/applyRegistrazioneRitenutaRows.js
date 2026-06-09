export function applyRegistrazioneRitenutaRows(rows = [], ritenutaDraft = {}) {
  const sourceRows = Array.isArray(rows) ? rows : []
  return {
    rows: sourceRows,
    applied: false,
    blockers: [],
    pendingPaymentPosting: Boolean(ritenutaDraft?.active && ritenutaDraft?.mode === 'pagamento'),
  }
}
