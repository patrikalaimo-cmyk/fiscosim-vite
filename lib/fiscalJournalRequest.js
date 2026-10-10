/**
 * LAB-only fiscal atomic commit request validator (SG-P0-01 / Stage3W).
 * Mirrors SQL whitelist rules. Does not call PostgREST or Manuale mappers.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
const CENTS_MAX = 99999999999999

export const FISCAL_CONTRACT_KINDS = Object.freeze([
  'fattura_attiva',
  'fattura_passiva',
  'nota_credito_attiva',
  'nota_credito_passiva',
  'pagamento',
  'parcella_documento',
  'split_attiva',
])

const TOP_KEYS = new Set([
  'societa_id',
  'request_id',
  'contract_kind',
  'source_module',
  'header',
  'rows',
  'vat',
  'ledger',
  'withholding',
  'motivazione',
])

const HEADER_KEYS = new Set([
  'data_registrazione',
  'data_documento',
  'numero_documento',
  'descrizione',
  'causale_id',
  'cliente_fornitore_nome',
])

const ROW_KEYS = new Set(['conto_id', 'dare', 'avere', 'descrizione'])

const VAT_ROW_KEYS = new Set([
  'tipo',
  'imponibile',
  'iva',
  'aliquota',
  'esigibilita',
  'split_payment',
  'percentuale_detraibilita',
  'iva_detraibile',
  'iva_indetraibile',
  'numero_documento',
  'data_documento',
  'soggetto_denominazione',
  'soggetto_piva',
  'causale_iva_id',
  'documento_id',
  'riga_idx',
])

const OPENING_KEYS = new Set([
  'tipo',
  'conto_id',
  'numero_documento',
  'data_documento',
  'data_scadenza',
  'importo_originale',
  'iva_per_cassa',
])

const CLOSURE_KEYS = new Set(['partita_id', 'importo_chiuso'])

const WH_INSERT_KEYS = new Set([
  'percipiente_id',
  'percipiente_cf',
  'percipiente_denominazione',
  'data_documento',
  'numero_documento',
  'compenso_lordo',
  'imponibile_ritenuta',
  'aliquota_ritenuta',
  'importo_ritenuta',
  'compenso_netto',
  'contributo_cassa_prev',
  'codice_tributo',
  'stato',
  'causale_prestazione',
])

const WH_UPDATE_KEYS = new Set([
  'id',
  'data_pagamento',
  'data_scadenza',
  'periodo_riferimento',
  'anno_riferimento',
  'codice_tributo',
  'stato',
])

const SOURCE_MODULES = new Set(['registrazione_manual', 'import_contabilita'])

function isCentsNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n * 100 <= CENTS_MAX
    && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001
}

function isSignedCentsNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) * 100 <= CENTS_MAX
    && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001
}

function onlyKeys(obj, allowed) {
  return obj && typeof obj === 'object' && !Array.isArray(obj)
    && Object.keys(obj).every((k) => allowed.has(k))
}

function parseMoneyRow(r) {
  if (!onlyKeys(r, ROW_KEYS) || !UUID.test(String(r.conto_id || ''))
    || !isCentsNumber(r.dare) || !isCentsNumber(r.avere)
    || (r.dare === 0 && r.avere === 0) || (r.dare > 0 && r.avere > 0)
    || String(r.descrizione ?? '').length > 500) return null
  return {
    conto_id: r.conto_id,
    dare: Math.round(r.dare * 100) / 100,
    avere: Math.round(r.avere * 100) / 100,
    ...(r.descrizione === undefined ? {} : { descrizione: String(r.descrizione) }),
  }
}

/**
 * @returns {object|null} normalized plan or null if invalid
 */
export function validateFiscalJournalRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (Object.keys(payload).some((k) => !TOP_KEYS.has(k))) return null

  const societa_id = String(payload.societa_id || '')
  const request_id = String(payload.request_id || '')
  const contract_kind = String(payload.contract_kind || '')
  const source_module = String(payload.source_module || 'registrazione_manual')
  const motivazione = String(payload.motivazione || '').trim()
  const header = payload.header
  const rows = payload.rows

  if (!UUID.test(societa_id) || !UUID.test(request_id)
    || !FISCAL_CONTRACT_KINDS.includes(contract_kind)
    || !SOURCE_MODULES.has(source_module)
    || motivazione.length < 12 || motivazione.length > 500
    || !onlyKeys(header, HEADER_KEYS)
    || !ISO_DATE.test(String(header.data_registrazione || ''))
    || String(header.descrizione || '').trim().length < 5
    || String(header.descrizione || '').trim().length > 500
    || (header.causale_id != null && !UUID.test(String(header.causale_id)))
    || (header.data_documento != null && !ISO_DATE.test(String(header.data_documento)))
    || String(header.numero_documento ?? '').length > 80
    || String(header.cliente_fornitore_nome ?? '').length > 200
    || !Array.isArray(rows) || rows.length < 2 || rows.length > 100
    || JSON.stringify(rows).length > 100000) {
    return null
  }

  let dareC = 0
  let avereC = 0
  const parsedRows = []
  for (const r of rows) {
    const row = parseMoneyRow(r)
    if (!row) return null
    dareC += Math.round(row.dare * 100)
    avereC += Math.round(row.avere * 100)
    if (!Number.isSafeInteger(dareC) || !Number.isSafeInteger(avereC)) return null
    parsedRows.push(row)
  }
  if (dareC <= 0 || dareC !== avereC) return null

  let vat = null
  if (payload.vat != null) {
    if (!payload.vat || typeof payload.vat !== 'object' || Array.isArray(payload.vat)
      || Object.keys(payload.vat).some((k) => k !== 'rows')
      || !Array.isArray(payload.vat.rows) || payload.vat.rows.length > 40) {
      return null
    }
    vat = { rows: [] }
    for (const vr of payload.vat.rows) {
      if (!onlyKeys(vr, VAT_ROW_KEYS)
        || !['acquisto', 'vendita'].includes(String(vr.tipo || ''))
        || !isSignedCentsNumber(vr.imponibile) || !isSignedCentsNumber(vr.iva)
        || (vr.aliquota != null && !isCentsNumber(vr.aliquota))
        || (vr.esigibilita != null && !['immediata', 'differita', 'rilascio'].includes(vr.esigibilita))
        || (vr.split_payment != null && typeof vr.split_payment !== 'boolean')
        || (vr.causale_iva_id != null && !UUID.test(String(vr.causale_iva_id)))
        || (vr.data_documento != null && !ISO_DATE.test(String(vr.data_documento)))) {
        return null
      }
      vat.rows.push({
        tipo: vr.tipo,
        imponibile: Math.round(vr.imponibile * 100) / 100,
        iva: Math.round(vr.iva * 100) / 100,
        aliquota: vr.aliquota == null ? null : Math.round(vr.aliquota * 100) / 100,
        esigibilita: vr.esigibilita || 'immediata',
        split_payment: Boolean(vr.split_payment),
        percentuale_detraibilita: vr.percentuale_detraibilita == null ? 100 : vr.percentuale_detraibilita,
        iva_detraibile: vr.iva_detraibile == null ? vr.iva : vr.iva_detraibile,
        iva_indetraibile: vr.iva_indetraibile == null ? 0 : vr.iva_indetraibile,
        numero_documento: vr.numero_documento ?? header.numero_documento ?? null,
        data_documento: vr.data_documento ?? header.data_documento ?? null,
        soggetto_denominazione: vr.soggetto_denominazione ?? null,
        soggetto_piva: vr.soggetto_piva ?? null,
        causale_iva_id: vr.causale_iva_id ?? null,
        documento_id: vr.documento_id ?? String(header.numero_documento || request_id),
        riga_idx: vr.riga_idx == null ? 0 : vr.riga_idx,
      })
    }
  }

  let ledger = { mode: 'none', openings: [], closures: [] }
  if (payload.ledger != null) {
    const L = payload.ledger
    if (!L || typeof L !== 'object' || Array.isArray(L)
      || Object.keys(L).some((k) => !['mode', 'openings', 'closures'].includes(k))
      || !['none', 'open', 'close', 'mixed'].includes(String(L.mode || ''))) {
      return null
    }
    ledger = { mode: L.mode, openings: [], closures: [] }
    for (const o of L.openings || []) {
      if (!onlyKeys(o, OPENING_KEYS)
        || !['cliente', 'fornitore'].includes(String(o.tipo || ''))
        || (o.conto_id != null && !UUID.test(String(o.conto_id)))
        || !isSignedCentsNumber(o.importo_originale)) return null
      ledger.openings.push({
        tipo: o.tipo,
        conto_id: o.conto_id ?? null,
        numero_documento: o.numero_documento ?? header.numero_documento ?? null,
        data_documento: o.data_documento ?? header.data_documento ?? null,
        data_scadenza: o.data_scadenza ?? null,
        importo_originale: Math.round(o.importo_originale * 100) / 100,
        iva_per_cassa: Boolean(o.iva_per_cassa),
      })
    }
    for (const c of L.closures || []) {
      if (!onlyKeys(c, CLOSURE_KEYS) || !UUID.test(String(c.partita_id || ''))
        || !isSignedCentsNumber(c.importo_chiuso) || c.importo_chiuso === 0) return null
      ledger.closures.push({
        partita_id: c.partita_id,
        importo_chiuso: Math.round(c.importo_chiuso * 100) / 100,
      })
    }
    if (ledger.mode === 'open' && ledger.openings.length < 1) return null
    if (ledger.mode === 'close' && ledger.closures.length < 1) return null
    if (ledger.mode === 'none' && (ledger.openings.length || ledger.closures.length)) return null
  }

  let withholding = { eventType: 'none', inserts: [], updates: [] }
  if (payload.withholding != null) {
    const W = payload.withholding
    if (!W || typeof W !== 'object' || Array.isArray(W)
      || Object.keys(W).some((k) => !['eventType', 'inserts', 'updates'].includes(k))
      || !['none', 'documento', 'pagamento'].includes(String(W.eventType || ''))) {
      return null
    }
    withholding = { eventType: W.eventType, inserts: [], updates: [] }
    for (const ins of W.inserts || []) {
      if (!onlyKeys(ins, WH_INSERT_KEYS)
        || (ins.percipiente_id != null && !UUID.test(String(ins.percipiente_id)))
        || !isCentsNumber(ins.importo_ritenuta ?? 0)
        || !isCentsNumber(ins.compenso_lordo ?? 0)) return null
      withholding.inserts.push({ ...ins })
    }
    for (const upd of W.updates || []) {
      if (!onlyKeys(upd, WH_UPDATE_KEYS) || !UUID.test(String(upd.id || ''))) return null
      withholding.updates.push({ ...upd })
    }
    if (withholding.eventType === 'documento' && withholding.inserts.length < 1) return null
    if (withholding.eventType === 'pagamento' && withholding.updates.length < 1) return null
  }

  // Contract kind coherence (lightweight; SQL enforces company ownership).
  if (['fattura_attiva', 'fattura_passiva', 'nota_credito_attiva', 'nota_credito_passiva', 'split_attiva', 'parcella_documento'].includes(contract_kind)) {
    if (!vat || vat.rows.length < 1) return null
    if (ledger.mode === 'none') return null
  }
  if (contract_kind === 'pagamento' && ledger.mode !== 'close' && ledger.mode !== 'mixed') return null
  if (contract_kind === 'parcella_documento' && withholding.eventType !== 'documento') return null
  if (contract_kind === 'split_attiva' && !vat.rows.every((r) => r.split_payment === true)) return null

  return {
    societa_id,
    request_id,
    contract_kind,
    source_module,
    motivazione,
    header: {
      data_registrazione: header.data_registrazione,
      descrizione: String(header.descrizione).trim(),
      ...(header.causale_id ? { causale_id: header.causale_id } : {}),
      ...(header.data_documento ? { data_documento: header.data_documento } : {}),
      ...(header.numero_documento != null ? { numero_documento: String(header.numero_documento) } : {}),
      ...(header.cliente_fornitore_nome != null ? { cliente_fornitore_nome: String(header.cliente_fornitore_nome) } : {}),
    },
    rows: parsedRows,
    vat,
    ledger,
    withholding,
  }
}
