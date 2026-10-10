/**
 * Map Manuale/Import persistence plan → Stage3W HTTP body.
 * Does not call PostgREST. Returns null when unsupported / incomplete.
 */
import { validateFiscalJournalRequest } from '../../../../../lib/fiscalJournalRequest.js'
import { resolveFiscalContractKind } from './resolveFiscalContractKind.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isoDate(value) {
  const s = String(value || '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function money(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return Math.round(v * 100) / 100
}

function pickWhInsert(row = {}) {
  const out = {}
  const set = (k, v) => {
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  set('percipiente_id', row.percipiente_id)
  set('percipiente_cf', row.percipiente_cf)
  set('percipiente_denominazione', row.percipiente_denominazione)
  set('data_documento', isoDate(row.data_documento))
  set('numero_documento', row.numero_documento)
  out.compenso_lordo = money(row.compenso_lordo ?? 0) ?? 0
  set('imponibile_ritenuta', money(row.imponibile_ritenuta))
  set('aliquota_ritenuta', money(row.aliquota_ritenuta))
  out.importo_ritenuta = money(row.importo_ritenuta ?? row.ritenuta ?? 0) ?? 0
  set('compenso_netto', money(row.compenso_netto))
  set('contributo_cassa_prev', money(row.contributo_cassa_prev))
  set('codice_tributo', row.codice_tributo || '1040')
  set('stato', row.stato || 'aperta')
  set('causale_prestazione', row.causale_prestazione)
  return out
}

function pickWhUpdate(row = {}) {
  if (!UUID.test(String(row.id || ''))) return null
  const out = { id: row.id }
  const set = (k, v) => {
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  set('data_pagamento', isoDate(row.data_pagamento))
  set('data_scadenza', isoDate(row.data_scadenza))
  set('periodo_riferimento', row.periodo_riferimento)
  if (row.anno_riferimento != null) out.anno_riferimento = Number(row.anno_riferimento)
  set('codice_tributo', row.codice_tributo)
  set('stato', row.stato || 'da_versare')
  return out
}

/**
 * @returns {{ ok: true, request: object } | { ok: false, reason: string }}
 */
export function mapPersistencePlanToFiscalJournalRequest({
  policy = {},
  pnPayload = {},
  righePayload = [],
  vatEntries = [],
  partEntries = [],
  ritenutaEntries = [],
  ritenutaUpdates = [],
  sourceModule = 'registrazione_manual',
  requestId = null,
  motivazione = null,
} = {}) {
  const societa_id = String(pnPayload.societa_id || '')
  if (!UUID.test(societa_id)) {
    return { ok: false, reason: 'FISCAL_LAB_SOCIETA_UUID_REQUIRED' }
  }

  const contract_kind = resolveFiscalContractKind({
    policy, vatEntries, partEntries, ritenutaEntries, ritenutaUpdates,
  })
  if (!contract_kind) {
    return { ok: false, reason: 'FISCAL_LAB_CONTRACT_UNSUPPORTED' }
  }

  const dataReg = isoDate(pnPayload.data_registrazione)
  if (!dataReg) return { ok: false, reason: 'FISCAL_LAB_DATE_INVALID' }

  const descrizione = String(pnPayload.descrizione || '').trim()
    || String(pnPayload.numero_documento || 'Registrazione fiscale LAB').trim()
  if (descrizione.length < 5) return { ok: false, reason: 'FISCAL_LAB_DESCRIZIONE_TOO_SHORT' }

  const rows = []
  for (const r of righePayload) {
    if (!UUID.test(String(r.conto_id || ''))) {
      return { ok: false, reason: 'FISCAL_LAB_CONTO_UUID_REQUIRED' }
    }
    const dare = money(r.importo_dare ?? r.dare ?? 0)
    const avere = money(r.importo_avere ?? r.avere ?? 0)
    if (dare == null || avere == null) return { ok: false, reason: 'FISCAL_LAB_ROW_AMOUNT_INVALID' }
    const row = { conto_id: r.conto_id, dare, avere }
    const d = String(r.descrizione_riga || r.descrizione || '').trim()
    if (d) row.descrizione = d.slice(0, 500)
    rows.push(row)
  }
  if (rows.length < 2) return { ok: false, reason: 'FISCAL_LAB_ROWS_TOO_FEW' }

  let vat = null
  if (vatEntries.length > 0) {
    vat = { rows: vatEntries.map((vr, idx) => {
      const imponibile = money(vr.imponibile)
      const iva = money(vr.iva ?? vr.imposta)
      const out = {
        tipo: String(vr.tipo || 'acquisto'),
        imponibile: imponibile ?? 0,
        iva: iva ?? 0,
        split_payment: Boolean(vr.split_payment),
        esigibilita: ['immediata', 'differita', 'rilascio'].includes(String(vr.esigibilita || ''))
          ? String(vr.esigibilita)
          : 'immediata',
        documento_id: String(vr.documento_id || pnPayload.numero_documento || requestId || 'doc'),
        riga_idx: Number.isFinite(Number(vr.riga_idx)) ? Number(vr.riga_idx) : idx,
      }
      if (vr.aliquota != null && money(vr.aliquota) != null) out.aliquota = money(vr.aliquota)
      if (vr.percentuale_detraibilita != null) out.percentuale_detraibilita = Number(vr.percentuale_detraibilita)
      if (vr.iva_detraibile != null) out.iva_detraibile = money(vr.iva_detraibile)
      if (vr.iva_indetraibile != null) out.iva_indetraibile = money(vr.iva_indetraibile)
      if (vr.soggetto_denominazione) out.soggetto_denominazione = String(vr.soggetto_denominazione)
      if (vr.soggetto_piva) out.soggetto_piva = String(vr.soggetto_piva)
      if (vr.causale_iva_id && UUID.test(String(vr.causale_iva_id))) out.causale_iva_id = vr.causale_iva_id
      const dd = isoDate(vr.data_documento || pnPayload.data_documento)
      if (dd) out.data_documento = dd
      if (vr.numero_documento || pnPayload.numero_documento) {
        out.numero_documento = String(vr.numero_documento || pnPayload.numero_documento)
      }
      return out
    }) }
  }

  const openings = []
  const closures = []
  for (const p of partEntries) {
    if (p.documento_id || p.tipo_movimento === 'chiusura') {
      const partita_id = String(p.documento_id || p.partita_id || '')
      const importo_chiuso = money(p.importo_chiuso)
      if (!UUID.test(partita_id) || importo_chiuso == null || importo_chiuso === 0) {
        return { ok: false, reason: 'FISCAL_LAB_CLOSURE_INVALID' }
      }
      closures.push({ partita_id, importo_chiuso })
    } else {
      const importo_originale = money(p.importo_originale)
      if (importo_originale == null) return { ok: false, reason: 'FISCAL_LAB_OPENING_INVALID' }
      const o = {
        tipo: p.tipo === 'fornitore' ? 'fornitore' : 'cliente',
        importo_originale,
        iva_per_cassa: Boolean(p.iva_per_cassa),
      }
      if (p.conto_id && UUID.test(String(p.conto_id))) o.conto_id = p.conto_id
      if (p.numero_documento || pnPayload.numero_documento) {
        o.numero_documento = String(p.numero_documento || pnPayload.numero_documento)
      }
      const dd = isoDate(p.data_documento || pnPayload.data_documento)
      if (dd) o.data_documento = dd
      const ds = isoDate(p.data_scadenza)
      if (ds) o.data_scadenza = ds
      openings.push(o)
    }
  }

  let ledger = { mode: 'none', openings: [], closures: [] }
  if (openings.length && closures.length) ledger = { mode: 'mixed', openings, closures }
  else if (openings.length) ledger = { mode: 'open', openings, closures: [] }
  else if (closures.length) ledger = { mode: 'close', openings: [], closures }

  let withholding = { eventType: 'none', inserts: [], updates: [] }
  if (ritenutaEntries.length > 0) {
    withholding = {
      eventType: 'documento',
      inserts: ritenutaEntries.map(pickWhInsert),
      updates: [],
    }
  } else if (ritenutaUpdates.length > 0) {
    const updates = ritenutaUpdates.map(pickWhUpdate).filter(Boolean)
    if (!updates.length) return { ok: false, reason: 'FISCAL_LAB_WITHHOLDING_UPDATE_INVALID' }
    withholding = { eventType: 'pagamento', inserts: [], updates }
  }

  const request_id = UUID.test(String(requestId || ''))
    ? String(requestId)
    : (UUID.test(String(pnPayload.documento_import_id || ''))
      ? String(pnPayload.documento_import_id)
      : (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : null))
  if (!request_id) return { ok: false, reason: 'FISCAL_LAB_REQUEST_ID_REQUIRED' }

  const header = {
    data_registrazione: dataReg,
    descrizione: descrizione.slice(0, 500),
  }
  if (pnPayload.causale_id && UUID.test(String(pnPayload.causale_id))) {
    header.causale_id = pnPayload.causale_id
  }
  const dataDoc = isoDate(pnPayload.data_documento)
  if (dataDoc) header.data_documento = dataDoc
  if (pnPayload.numero_documento != null && String(pnPayload.numero_documento).trim() !== '') {
    header.numero_documento = String(pnPayload.numero_documento).slice(0, 80)
  }
  if (pnPayload.cliente_fornitore_nome) {
    header.cliente_fornitore_nome = String(pnPayload.cliente_fornitore_nome).slice(0, 200)
  }

  const reason = String(motivazione || '').trim()
    || `LAB Stage3W atomic fiscal post (${contract_kind})`
  const source_module = sourceModule === 'import_contabilita'
    ? 'import_contabilita'
    : 'registrazione_manual'

  const candidate = {
    societa_id,
    request_id,
    contract_kind,
    source_module,
    header,
    rows,
    motivazione: reason.slice(0, 500),
  }
  if (vat) candidate.vat = vat
  if (ledger.mode !== 'none') candidate.ledger = ledger
  if (withholding.eventType !== 'none') candidate.withholding = withholding

  const plan = validateFiscalJournalRequest(candidate)
  if (!plan) return { ok: false, reason: 'FISCAL_LAB_PAYLOAD_REJECTED_BY_VALIDATOR' }
  return { ok: true, request: candidate, plan }
}
