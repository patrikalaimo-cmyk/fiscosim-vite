import { buildPrimaNotaHeaderPayload } from '../../../../../domain/primaNotaPayloadBuilder.js'

function isUuid(val) {
  if (typeof val !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

export function buildPrimaNotaHeaderFromCanonicalPayload(normalized = {}, classification = null) {
  const document = normalized?.document && typeof normalized.document === 'object' ? normalized.document : {}
  const accounting = normalized?.accounting && typeof normalized.accounting === 'object' ? normalized.accounting : {}
  const counterparty = document.counterparty && typeof document.counterparty === 'object' ? document.counterparty : {}
  const handoff = normalized?.handoff && typeof normalized.handoff === 'object' ? normalized.handoff : {}
  const cls = classification && typeof classification === 'object' ? classification : normalized?.classification || {}

  return buildPrimaNotaHeaderPayload({
    societa_id: normalized?.company?.societaId || null,
    data_registrazione: document.registrationDate || null,
    data_documento: document.documentDate || null,
    numero_documento: document.number || null,
    causale_id: accounting?.causaleContabile?.id || null,
    causale_codice: accounting?.causaleContabile?.code || null,
    descrizione: `${counterparty.name || 'Documento'} n.${document.number || '?'}`.trim(),
    cliente_fornitore_id: counterparty.accountId || null,
    cliente_fornitore_nome: counterparty.name || '',
    totale_dare: accounting?.totals?.debit || document?.totals?.gross || 0,
    totale_avere: accounting?.totals?.credit || document?.totals?.gross || 0,
    stato: normalized?.readiness?.status === 'pronto_per_contabilita' ? 'confermato' : 'bozza',
    documento_import_id: isUuid(handoff.sourceRowKey) ? handoff.sourceRowKey : null,
    scope: {
      source_module: handoff.sourceModule || 'import_contabilita',
      source_batch_id: handoff.sourceBatchId || null,
      source_row_key: handoff.sourceRowKey || null,
      source_file_name: handoff.sourceFileName || null,
      classification_code: cls.code || 'ordinario',
      classification_label: cls.label || 'Ordinario',
    },
  })
}
