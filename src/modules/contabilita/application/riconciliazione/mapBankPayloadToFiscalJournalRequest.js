/**
 * Map a bank reconciliation canonical payment/close payload → Stage3W fiscal journal body.
 * Supports partita chiusura (totale/parziale) without Manuale multi-step path.
 */
import { validateFiscalJournalRequest } from '../../../../../lib/fiscalJournalRequest.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function text(value) {
  return String(value ?? '').trim()
}

function money(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100) / 100
}

function isoDate(value) {
  const s = text(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function mapRow(row = {}) {
  const conto_id = text(row.contoId || row.conto_id || row.accountId)
  const dare = money(row.dare ?? row.debit ?? (row.sezione === 'dare' ? row.importo : 0)) ?? 0
  const avere = money(row.avere ?? row.credit ?? (row.sezione === 'avere' ? row.importo : 0)) ?? 0
  if (!UUID.test(conto_id)) return null
  if (!(dare > 0 || avere > 0) || (dare > 0 && avere > 0)) return null
  const out = { conto_id, dare, avere }
  const desc = text(row.descrizione || row.description)
  if (desc) out.descrizione = desc.slice(0, 500)
  return out
}

function mapClosure(movement = {}) {
  const partita_id = text(movement.partitaId || movement.partita_id || movement.openItemId)
  const importo = money(
    movement.importoChiusura
      ?? movement.importo_chiuso
      ?? movement.amount
      ?? movement.importo
  )
  if (!UUID.test(partita_id) || !(importo > 0)) return null
  return { partita_id, importo_chiuso: importo }
}

/**
 * @returns {{ ok: true, request: object } | { ok: false, reason: string, blockers?: string[] }}
 */
export function mapBankPayloadToFiscalJournalRequest({
  payload = {},
  context = {},
  requestId = null,
} = {}) {
  const societa_id = text(context.societaId || payload.societaId)
  if (!UUID.test(societa_id)) return { ok: false, reason: 'BANK_LAB_SOCIETA_REQUIRED' }

  const rows = (Array.isArray(payload.primaNotaRighe) ? payload.primaNotaRighe : [])
    .map(mapRow)
    .filter(Boolean)
  if (rows.length < 2) return { ok: false, reason: 'BANK_LAB_ROWS_REQUIRED' }

  const closures = (Array.isArray(payload.partitarioMovements) ? payload.partitarioMovements : [])
    .filter((m) => ['chiusura_totale', 'chiusura_parziale', 'close', 'chiusura'].includes(text(m.action || m.tipo).toLowerCase()))
    .map(mapClosure)
    .filter(Boolean)

  if (!closures.length) {
    return { ok: false, reason: 'BANK_LAB_PARTITA_CLOSURE_REQUIRED' }
  }

  const dataReg = isoDate(
    context.registrationDate
      || context.operationDate
      || payload.registrationDate
      || payload.operationDate
      || payload.primaNota?.dataRegistrazione
  )
  if (!dataReg) return { ok: false, reason: 'BANK_LAB_DATE_REQUIRED' }

  const request_id = UUID.test(String(requestId || ''))
    ? String(requestId)
    : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null)
  if (!request_id) return { ok: false, reason: 'BANK_LAB_REQUEST_ID_REQUIRED' }

  const movementId = text(payload.movementId || context.movementId || context.sourceDocumentId)
  const descrizione = text(
    payload.primaNota?.descrizione
      || payload.description
      || `Riconciliazione bancaria ${movementId || request_id}`
  ).slice(0, 500)
  if (descrizione.length < 5) return { ok: false, reason: 'BANK_LAB_DESCRIZIONE_SHORT' }

  const candidate = {
    societa_id,
    request_id,
    contract_kind: 'pagamento',
    source_module: 'riconciliazione_bancaria',
    header: {
      data_registrazione: dataReg,
      data_documento: dataReg,
      descrizione,
      ...(movementId ? { numero_documento: `BANK-${movementId}`.slice(0, 80) } : {}),
    },
    rows,
    ledger: {
      mode: 'close',
      openings: [],
      closures,
    },
    motivazione: text(
      context.motivazione
        || `Commit riconciliazione bancaria LAB movement=${movementId || request_id}`
    ).slice(0, 500),
  }

  if (candidate.motivazione.length < 12) {
    candidate.motivazione = 'Commit riconciliazione bancaria LAB atomico Stage3W'
  }

  const plan = validateFiscalJournalRequest(candidate)
  if (!plan) return { ok: false, reason: 'BANK_LAB_PAYLOAD_REJECTED', blockers: ['fiscal_validator'] }
  return { ok: true, request: candidate, plan }
}
