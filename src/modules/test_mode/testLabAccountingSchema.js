/**
 * Schema contabile reale — perimetro Test Lab (introspezione DB live 2026-06-26).
 */

export const TEST_LAB_ACCOUNTING_MARKER = '[TEST_LAB]'

export const PIANO_CONTI_LIVE_COLUMNS = Object.freeze([
  'id', 'societa_id', 'codice', 'codice_mastro', 'codice_conto', 'codice_sottoconto',
  'descrizione', 'tipo', 'natura', 'sezione', 'livello', 'attivo', 'is_fornitore',
  'is_cliente', 'is_iva', 'is_banca', 'is_cassa', 'anagrafica_tipo', 'partita_iva',
  'codice_fiscale', 'anagrafica_piva', 'anagrafica_cf', 'causale_iva_id',
])

export const CAUSALI_CONTABILI_LIVE_COLUMNS = Object.freeze([
  'id', 'societa_id', 'codice', 'descrizione', 'tipo', 'gestione_partite',
  'operazione_partite', 'tipo_causale', 'codice_registro_iva', 'segno_registro_iva',
  'tipo_documento', 'documento_direzione', 'attivo', 'righe_prima_nota_template', 'note',
])

export const CAUSALI_IVA_LIVE_COLUMNS = Object.freeze([
  'id', 'societa_id', 'codice', 'descrizione', 'aliquota', 'detraibile',
  'percentuale_detraibilita', 'attivo', 'codice_interno', 'note',
])

/** Codici piano allineati a testLabOrdinariaAcquistoCases (6.01.001 → 6 01 001). */
export const DEMO_PIANO_CODICE = Object.freeze({
  costoOrdinario: '6 01 001',
  costo10: '6 02 001',
  costo4: '6 03 001',
  costoSecondario: '6 05 001',
  ivaCredito: '1 02 40 0001',
  fornitoreGenerico: '2 04 02 0001',
  arrotondamenti: '6 99 001',
})

export const DEMO_CAUSALE_FF_CODICE = 'FF'
export const DEMO_CAUSALI_IVA_CODICI = Object.freeze({
  aliq22: 'TESTLAB22',
  aliq10: 'TESTLAB10',
  aliq4: 'TESTLAB04',
})

/**
 * @param {string} dottedOrSpaced
 * @returns {string}
 */
export function toDbPianoCodice(dottedOrSpaced) {
  return String(dottedOrSpaced || '')
    .trim()
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * @param {string} codice
 * @param {object} extra
 * @returns {object}
 */
export function buildPianoContoDbFields(codice, extra = {}) {
  const normalized = toDbPianoCodice(codice)
  const parts = normalized.split(' ').filter(Boolean)
  const livello = parts.length
  const codiceConto = livello >= 4
    ? parts.slice(0, 3).join(' ')
    : livello >= 3
      ? parts.slice(0, 2).join(' ')
      : parts[0] || normalized

  return {
    codice: normalized,
    codice_mastro: parts[0] || null,
    codice_conto: codiceConto,
    codice_sottoconto: normalized,
    livello,
    attivo: true,
    ...extra,
  }
}

/**
 * @returns {Array<object>}
 */
export function buildDemoPianoContiSeedDefs() {
  const M = TEST_LAB_ACCOUNTING_MARKER
  return [
    {
      key: 'costoOrdinario',
      ...buildPianoContoDbFields(DEMO_PIANO_CODICE.costoOrdinario, {
        descrizione: `${M} Acquisti merci/costi ordinari`,
        tipo: 'economico',
        natura: 'costo',
        sezione: 'dare',
      }),
    },
    {
      key: 'costo10',
      ...buildPianoContoDbFields(DEMO_PIANO_CODICE.costo10, {
        descrizione: `${M} Costo acquisti IVA 10%`,
        tipo: 'economico',
        natura: 'costo',
        sezione: 'dare',
      }),
    },
    {
      key: 'costo4',
      ...buildPianoContoDbFields(DEMO_PIANO_CODICE.costo4, {
        descrizione: `${M} Costo acquisti IVA 4%`,
        tipo: 'economico',
        natura: 'costo',
        sezione: 'dare',
      }),
    },
    {
      key: 'costoSecondario',
      ...buildPianoContoDbFields(DEMO_PIANO_CODICE.costoSecondario, {
        descrizione: `${M} Costo acquisti conto secondario`,
        tipo: 'economico',
        natura: 'costo',
        sezione: 'dare',
      }),
    },
    {
      key: 'ivaCredito',
      ...buildPianoContoDbFields(DEMO_PIANO_CODICE.ivaCredito, {
        descrizione: `${M} IVA ns credito`,
        tipo: 'patrimoniale',
        natura: 'attivo',
        sezione: 'dare',
        is_iva: true,
      }),
    },
    {
      key: 'fornitoreGenerico',
      ...buildPianoContoDbFields(DEMO_PIANO_CODICE.fornitoreGenerico, {
        descrizione: `${M} Fornitore generico demo`,
        tipo: 'patrimoniale',
        natura: 'passivo',
        sezione: 'avere',
        is_fornitore: true,
        anagrafica_tipo: 'fornitore_italia',
      }),
    },
    {
      key: 'arrotondamenti',
      ...buildPianoContoDbFields(DEMO_PIANO_CODICE.arrotondamenti, {
        descrizione: `${M} Arrotondamenti/spese accessorie`,
        tipo: 'economico',
        natura: 'costo',
        sezione: 'dare',
      }),
    },
  ]
}

/**
 * @param {string} societaId
 * @param {object|null} ivaConto
 * @returns {object}
 */
export function buildDemoCausaleFfPayload(societaId, ivaConto = null) {
  const M = TEST_LAB_ACCOUNTING_MARKER
  const ivaCodice = ivaConto?.codice || DEMO_PIANO_CODICE.ivaCredito
  const ivaId = ivaConto?.id || ''

  return {
    societa_id: societaId,
    codice: DEMO_CAUSALE_FF_CODICE,
    descrizione: `${M} FATTURA FORNITORE`,
    tipo: 'generico',
    gestione_partite: 'ignora',
    operazione_partite: 'Apre',
    tipo_causale: 'Doc. IVA normale',
    codice_registro_iva: '01',
    segno_registro_iva: 'Somma',
    tipo_documento: 'Fattura passiva',
    documento_direzione: 'passiva',
    data_documento: 'Obbligatorio',
    numero_documento: 'Obbligatorio',
    op_ritenute: 'Ignora',
    attivo: true,
    note: M,
    righe_prima_nota_template: [
      {
        lato: 'avere',
        ruolo: 'soggetto',
        attiva: true,
        ordine: 1,
        conto_id: '',
        conto_codice: '',
        modificabile: false,
        obbligatoria: true,
        formula_importo: 'totale_documento',
        descrizione_riga: 'Fornitore',
      },
      {
        lato: 'dare',
        ruolo: 'costo',
        attiva: true,
        ordine: 2,
        conto_id: '',
        conto_codice: '',
        modificabile: true,
        obbligatoria: true,
        formula_importo: 'imponibile',
        descrizione_riga: 'Costo/Acquisto',
      },
      {
        lato: 'dare',
        ruolo: 'iva',
        attiva: true,
        ordine: 3,
        conto_id: ivaId,
        conto_codice: ivaCodice,
        modificabile: false,
        obbligatoria: true,
        formula_importo: 'iva_detraibile',
        descrizione_riga: 'IVA ns credito',
        conto_descrizione: `${M} IVA ns credito`,
      },
    ],
  }
}

/**
 * @param {string} societaId
 * @returns {Array<object>}
 */
export function buildDemoCausaliIvaSeedDefs(societaId) {
  const M = TEST_LAB_ACCOUNTING_MARKER
  return [
    {
      key: 'aliq22',
      societa_id: societaId,
      codice: DEMO_CAUSALI_IVA_CODICI.aliq22,
      descrizione: `${M} IMPONIBILE 22%`,
      aliquota: 22,
      detraibile: true,
      percentuale_detraibilita: 100,
      attivo: true,
      codice_interno: 'TL22',
      note: M,
    },
    {
      key: 'aliq10',
      societa_id: societaId,
      codice: DEMO_CAUSALI_IVA_CODICI.aliq10,
      descrizione: `${M} IMPONIBILE 10%`,
      aliquota: 10,
      detraibile: true,
      percentuale_detraibilita: 100,
      attivo: true,
      codice_interno: 'TL10',
      note: M,
    },
    {
      key: 'aliq4',
      societa_id: societaId,
      codice: DEMO_CAUSALI_IVA_CODICI.aliq4,
      descrizione: `${M} IMPONIBILE 4%`,
      aliquota: 4,
      detraibile: true,
      percentuale_detraibilita: 100,
      attivo: true,
      codice_interno: 'TL04',
      note: M,
    },
  ]
}
