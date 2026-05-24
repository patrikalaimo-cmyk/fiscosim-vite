/**
 * Fixture credibili per test sui blocchi strutturali Import Fatture (fattura passiva acquisto, piano minimale).
 * Valori ispirati a estratti FE tipici: imponibile + IVA 22%, conti economici / IVA a credito / debiti verso fornitori.
 */

import { FISCOSIM_IMPORT_AI_META as M } from '../../../import_unificato/data/importFiscosimMeta.js'

/** Piano conti minimale (livello ≥3, codici come in anagrafica reale). */
export const PIANO_CONTI_FIXTURE_MIN = [
  { id: 'pc-600', codice: '600.01', descrizione: 'Acquisto merci e materie', livello: 3, is_iva: false },
  {
    id: 'pc-263',
    codice: '26.3.01',
    descrizione: 'IVA a credito',
    livello: 3,
    is_iva: true,
    causale_iva_id: 'caus-iva-22',
  },
  { id: 'pc-330', codice: '330.01', descrizione: 'Debiti verso fornitori', livello: 4, is_fornitore: true },
]

export const CAUSALI_IVA_FIXTURE_MIN = [
  { id: 'caus-iva-22', codice: 'F22', aliquota: 22, codice_interno: 'A22', descrizione: 'IVA 22% detraibile' },
  { id: 'caus-iva-10', codice: 'F10', aliquota: 10, codice_interno: 'A10', descrizione: 'IVA 10% detraibile' },
]

const LBL = {
  costo: '600.01 · Acquisto merci e materie',
  iva: '26.3.01 · IVA a credito',
  fornitore: '330.01 · Debiti verso fornitori — Fornitore Alfa Srl',
}

/**
 * Documento import con estratto FE + metadata operatore (stesso schema persistito in `documenti_import.ai_raw_response`).
 *
 * @param {object} opts
 * @param {string} [opts.totale] es. "1220,00"
 * @param {string} [opts.iva_totale] es. "220"
 * @param {Array} [opts.riepilogo_iva]
 */
export function buildFatturaPassivaDocBase(opts = {}) {
  const {
    totale = '1220,00',
    iva_totale = '220,00',
    riepilogo_iva = [{ imponibile: 1000, imposta: 220, aliquota: 22 }],
    numero = '45/FE',
    data = '2026-03-15',
    cedente = 'Fornitore Alfa Srl',
    cedente_piva = '01234567890',
  } = opts

  return {
    id: 'doc-import-test-001',
    tipo_documento: 'fattura_passiva',
    ai_raw_response: {
      tipo_documento: 'fattura_passiva',
      numero,
      data,
      totale,
      iva_totale,
      riepilogo_iva,
      cedente_denom: cedente,
      cedente_piva,
      [M.FINAL_STEP_CONFIRMATION]: true,
      [M.OPERATIVE_OVERRIDES]: {
        controparte: cedente,
        numero_documento: numero,
        data_documento: data,
        totale,
      },
    },
  }
}

/** Griglia PN coerente con totale 1220 € (1000 + 220 dare, 1220 avere fornitore). */
export function pnGridBalanced() {
  return [
    { id: 'pn1', conto: LBL.costo, dare: '1.000,00', avere: '', nota: 'Imponibile' },
    { id: 'pn2', conto: LBL.iva, dare: '220,00', avere: '', nota: 'IVA' },
    { id: 'pn3', conto: LBL.fornitore, dare: '', avere: '1.220,00', nota: 'Chiusura' },
  ]
}

/** Stessa struttura ma Dare non chiude (manca 20 € in avere). */
export function pnGridUnbalanced() {
  return [
    { id: 'pn1', conto: LBL.costo, dare: '1000', avere: '', nota: '' },
    { id: 'pn2', conto: LBL.iva, dare: '220', avere: '', nota: '' },
    { id: 'pn3', conto: LBL.fornitore, dare: '', avere: '1200', nota: '' },
  ]
}

/** Riga completamente vuota (solo indice). */
export function pnGridWithEmptyRow() {
  return [
    ...pnGridBalanced().slice(0, 2),
    { id: 'pn-empty', conto: '', dare: '', avere: '', nota: '' },
    { id: 'pn3', conto: LBL.fornitore, dare: '', avere: '1220,00', nota: '' },
  ]
}

/** Conto testo libero non nel piano. */
export function pnGridBadConto() {
  return [
    { id: 'pn1', conto: '999.99 · Conto inventato', dare: '1000', avere: '', nota: '' },
    { id: 'pn2', conto: LBL.iva, dare: '220', avere: '', nota: '' },
    { id: 'pn3', conto: LBL.fornitore, dare: '', avere: '1220', nota: '' },
  ]
}

export function ivaGridOkSingleRow(causaleId = 'caus-iva-22') {
  return [{ id: 'iv1', causale_iva_id: causaleId, imponibile: '1000,00', iva: '220,00' }]
}

export function ivaGridMissingCausale() {
  return [{ id: 'iv1', causale_iva_id: '', imponibile: '1000', iva: '220' }]
}

export function ivaGridUnknownCausale() {
  return [{ id: 'iv1', causale_iva_id: 'caus-fantasma', imponibile: '1000', iva: '220' }]
}

/** Somma IVA griglia 200 vs documento 220 (simula errore su quota indetraibile / totale IVA riga). */
export function ivaGridMismatchDetraibile() {
  return [{ id: 'iv1', causale_iva_id: 'caus-iva-22', imponibile: '1000,00', iva: '200,00' }]
}

/** Due riepiloghi 10%: 500+50 + 400+40 = totale documento 990 € (900 imponibile + 90 IVA). */
export function buildDocMultiRiepilogo() {
  return buildFatturaPassivaDocBase({
    totale: '990,00',
    iva_totale: '90,00',
    riepilogo_iva: [
      { imponibile: 500, imposta: 50, aliquota: 10 },
      { imponibile: 400, imposta: 40, aliquota: 10 },
    ],
  })
}

export function ivaGridMultiOk() {
  return [
    { id: 'i1', causale_iva_id: 'caus-iva-10', imponibile: '500,00', iva: '50,00' },
    { id: 'i2', causale_iva_id: 'caus-iva-10', imponibile: '400,00', iva: '40,00' },
  ]
}

export function opDraftFromDoc(doc) {
  const raw = doc.ai_raw_response
  const op = raw[M.OPERATIVE_OVERRIDES] || {}
  return {
    controparte: op.controparte,
    numero_documento: op.numero_documento,
    data_documento: op.data_documento,
    totale: op.totale,
  }
}

/**
 * Blob completo come dopo salvataggio working view (griglie in `_fiscosim*`).
 */
export function docWithPersistedGrids(docBase, pnGrid, ivaGrid, ivaOverrideStrings = {}) {
  const raw = { ...docBase.ai_raw_response }
  raw[M.ACCOUNTING_PROPOSALS] = {
    ...(raw[M.ACCOUNTING_PROPOSALS] && typeof raw[M.ACCOUNTING_PROPOSALS] === 'object' ? raw[M.ACCOUNTING_PROPOSALS] : {}),
    conto_codice: '600.01',
    causale_iva_id: 'caus-iva-22',
    working_pn_grid: pnGrid,
  }
  raw[M.IVA_OVERRIDES] = {
    ...(raw[M.IVA_OVERRIDES] && typeof raw[M.IVA_OVERRIDES] === 'object' ? raw[M.IVA_OVERRIDES] : {}),
    imponibile: ivaOverrideStrings.imponibile ?? '1000',
    iva: ivaOverrideStrings.iva ?? '220',
    working_iva_grid: ivaGrid,
  }
  return { ...docBase, ai_raw_response: raw }
}

/** PN per totale 990 € (due imponibili + IVA 10% + 10%). */
export function pnGridBalanced990() {
  return [
    { id: 'p1', conto: LBL.costo, dare: '900,00', avere: '', nota: 'Imponibili' },
    { id: 'p2', conto: LBL.iva, dare: '90,00', avere: '', nota: 'IVA' },
    { id: 'p3', conto: LBL.fornitore, dare: '', avere: '990,00', nota: 'Chiusura' },
  ]
}
