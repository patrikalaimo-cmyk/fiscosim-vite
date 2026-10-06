import { calculatePrimaNotaDraftTotals } from './canonical_mapper/calculatePrimaNotaDraftTotals.js'
import { normalizeText, round2 } from './canonical_mapper/utils.js'

function resolveDraftContext(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const draft = source.draft && typeof source.draft === 'object' ? source.draft : source
  const persisted = source.persistResult && typeof source.persistResult === 'object' ? source.persistResult : {}
  const righeSource = Array.isArray(source.righeCreate)
    ? source.righeCreate
    : Array.isArray(persisted.righeIns?.data)
      ? persisted.righeIns.data
      : Array.isArray(draft.righePayload)
        ? draft.righePayload
        : Array.isArray(draft.draft?.rows)
          ? draft.draft.rows
          : []

  return {
    draft,
    persisted,
    righeSource,
    validation: draft.validation || persisted.validation || null,
  }
}

function buildPrimaNotaSummary(draft, persisted) {
  const pnPayload = draft?.pnPayload && typeof draft.pnPayload === 'object' ? draft.pnPayload : {}
  const data = persisted?.data && typeof persisted.data === 'object' ? persisted.data : {}
  const innerDraft = draft?.draft && typeof draft.draft === 'object' ? draft.draft : {}
  const totals = calculatePrimaNotaDraftTotals(Array.isArray(draft?.righePayload) ? draft.righePayload : innerDraft.rows || [])
  const primaNotaId = normalizeText(data.prima_nota_id || persisted?.pn?.id || persisted?.data?.primaNotaId || '')

  return {
    id: primaNotaId || null,
    societaId: normalizeText(pnPayload.societa_id || innerDraft?.header?.societa_id || ''),
    dataRegistrazione: normalizeText(pnPayload.data_registrazione || innerDraft?.header?.data_registrazione || ''),
    dataDocumento: normalizeText(pnPayload.data_documento || innerDraft?.header?.data_documento || ''),
    numeroDocumento: normalizeText(pnPayload.numero_documento || innerDraft?.header?.numero_documento || ''),
    causale: {
      id: normalizeText(pnPayload.causale_id || ''),
      code: normalizeText(pnPayload.causale_codice || ''),
      description: normalizeText(pnPayload.descrizione || ''),
    },
    totaleDare: round2(pnPayload.totale_dare ?? totals.dare),
    totaleAvere: round2(pnPayload.totale_avere ?? totals.avere),
    isBalanced: Boolean(data.isBalanced ?? totals.isBalanced),
  }
}

function buildRigheSummary(righeSource = []) {
  return (Array.isArray(righeSource) ? righeSource : []).map((row, index) => ({
    id: row?.id || null,
    contoId: normalizeText(row?.conto_id || row?.accountId || ''),
    descrizione: normalizeText(row?.descrizione_riga || row?.descrizione || row?.description || ''),
    dare: round2(row?.importo_dare ?? row?.dare ?? 0),
    avere: round2(row?.importo_avere ?? row?.avere ?? 0),
    causaleIvaId: normalizeText(row?.causale_iva_id || row?.causaleIvaId || ''),
    rigaNumero: Number.isFinite(Number(row?.riga_numero)) ? Number(row.riga_numero) : index + 1,
  }))
}

function buildIvaCandidate(draft) {
  const normalized = draft?.normalized && typeof draft.normalized === 'object' ? draft.normalized : {}
  const vat = normalized.vat && typeof normalized.vat === 'object' ? normalized.vat : {}
  const rows = Array.isArray(vat.rows) ? vat.rows : []
  const firstRow = rows[0] || {}
  const document = normalized.document && typeof normalized.document === 'object' ? normalized.document : {}
  const counterparty = document.counterparty && typeof document.counterparty === 'object' ? document.counterparty : {}

  return {
    enabled: Boolean(vat.enabled || rows.length > 0),
    registerType: normalizeText(vat.registerType || ''),
    causaleIvaId: normalizeText(firstRow.causaleIvaId || firstRow.causale_iva_id || ''),
    imponibile: round2(vat.totals?.taxable ?? firstRow.taxable ?? 0),
    iva: round2(vat.totals?.tax ?? firstRow.tax ?? 0),
    aliquota: firstRow.rate ?? null,
    natura: firstRow.nature ?? null,
    competenzaIva: normalizeText(vat.competenceDate || document.registrationDate || document.documentDate || ''),
    soggetto: normalizeText(counterparty.name || ''),
  }
}

function buildLedgerCandidate(draft, summary) {
  const normalized = draft?.normalized && typeof draft.normalized === 'object' ? draft.normalized : {}
  const ledger = normalized.ledger && typeof normalized.ledger === 'object' ? normalized.ledger : {}
  const document = normalized.document && typeof normalized.document === 'object' ? normalized.document : {}
  const counterparty = document.counterparty && typeof document.counterparty === 'object' ? document.counterparty : {}

  return {
    enabled: Boolean(ledger.enabled ?? Boolean(ledger.accountId || counterparty.accountId)),
    type: normalizeText(ledger.type || (document.direction === 'vendita' ? 'cliente' : 'fornitore')),
    contoId: normalizeText(ledger.accountId || counterparty.accountId || ''),
    importoOriginale: round2(ledger.amount ?? summary.totaleAvere ?? summary.totaleDare ?? 0),
    residuoIniziale: round2(ledger.amount ?? summary.totaleAvere ?? summary.totaleDare ?? 0),
    dataDocumento: normalizeText(ledger.documentDate || document.documentDate || ''),
    numeroDocumento: normalizeText(ledger.documentNumber || document.number || ''),
  }
}

function buildBilancioCandidate(righe = []) {
  const list = Array.isArray(righe) ? righe : []
  const totals = calculatePrimaNotaDraftTotals(list.map((row) => ({
    dare: row?.dare ?? row?.importo_dare ?? 0,
    avere: row?.avere ?? row?.importo_avere ?? 0,
  })))

  return {
    righe: list.map((row) => ({
      id: row?.id || null,
      contoId: normalizeText(row?.conto_id || row?.accountId || ''),
      descrizione: normalizeText(row?.descrizione || row?.descrizione_riga || row?.description || ''),
      dare: round2(row?.dare ?? row?.importo_dare ?? 0),
      avere: round2(row?.avere ?? row?.importo_avere ?? 0),
      causaleIvaId: normalizeText(row?.causale_iva_id || row?.causaleIvaId || ''),
    })),
    totals,
  }
}

export function buildContabilitaPostPersistOutput(input = {}) {
  const resolved = resolveDraftContext(input)
  const summary = buildPrimaNotaSummary(resolved.draft, resolved.persisted)
  const righe = buildRigheSummary(resolved.righeSource)
  const validation = {
    blockers: Array.from(new Set([
      ...(Array.isArray(resolved.validation?.blockers) ? resolved.validation.blockers : []),
      ...(Array.isArray(resolved.persisted?.validation?.blockers) ? resolved.persisted.validation.blockers : []),
    ])),
    warnings: Array.from(new Set([
      ...(Array.isArray(resolved.validation?.warnings) ? resolved.validation.warnings : []),
      ...(Array.isArray(resolved.persisted?.validation?.warnings) ? resolved.persisted.validation.warnings : []),
    ])),
  }

  return {
    primaNota: summary,
    righe,
    ivaCandidate: buildIvaCandidate(resolved.draft),
    ledgerCandidate: buildLedgerCandidate(resolved.draft, summary),
    bilancioCandidate: buildBilancioCandidate(righe),
    validation,
  }
}
