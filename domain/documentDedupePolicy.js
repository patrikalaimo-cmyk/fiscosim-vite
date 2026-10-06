function hasValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

export function buildDocumentDedupeRequest(plan, ctx = {}) {
  const doc = plan?.documentiContabilita || {}
  const key = {
    societaId: doc.societa_id ?? ctx?.societaId ?? null,
    numeroDocumento: doc.numero_documento ?? null,
    dataDocumento: doc.data_documento ?? null,
    soggettoPiva: doc.soggetto_piva ?? null,
    soggettoCf: doc.soggetto_cf ?? null,
    soggettoDenominazione: doc.soggetto_denominazione ?? null,
    totale: doc.totale ?? null,
  }

  const blockers = []
  if (!hasValue(key.societaId)) blockers.push({ code: 'P7_MISSING_SOCIETA', message: 'societaId mancante per dedupe.' })
  if (!hasValue(key.numeroDocumento)) blockers.push({ code: 'P7_MISSING_DOCUMENT_NUMBER', message: 'numero documento mancante per dedupe.' })
  if (!hasValue(key.dataDocumento)) blockers.push({ code: 'P7_MISSING_DOCUMENT_DATE', message: 'data documento mancante per dedupe.' })
  if (!hasValue(key.soggettoPiva) && !hasValue(key.soggettoCf) && !hasValue(key.soggettoDenominazione)) {
    blockers.push({ code: 'P7_MISSING_COUNTERPARTY', message: 'identificativo soggetto mancante per dedupe.' })
  }
  if (!hasValue(key.totale)) blockers.push({ code: 'P7_MISSING_TOTAL', message: 'totale mancante per dedupe.' })

  return {
    required: true,
    strategy: 'documenti_contabilita_functional_key',
    key,
    blockIf: [
      'workflow_status=registered',
      'prima_nota_id not null',
      'registered_at not null',
      'workflow_status=registering',
    ],
    status: blockers.length > 0 ? 'blocked' : 'not_executed',
    blockers,
  }
}