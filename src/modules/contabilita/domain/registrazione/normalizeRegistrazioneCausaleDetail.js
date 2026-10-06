import { normalizeCausaleOperazioneGestita } from '../causali/causaleOperazioneGestita.js'

const CAUSALE_TIPO_CAUSALE_OPTIONS = [
  'Movimento di generale',
  'Doc. IVA normale',
  'Doc. IVA esig. differita',
  'Autofattura',
  'Doc. Corrispettivo',
  'Doc. IVA Acq. CEE',
  'Movimento sola IVA',
  'Pag./Inc. IVA esig. diff.',
]

const CAUSALE_OPERAZIONE_PARTITE_OPTIONS = ['Ignora', 'Apre', 'Chiude']
const CAUSALE_RITENUTE_OPTIONS = ['Ignora', 'Documento', 'Pagamento']
const CAUSALE_STATO_DOCUMENTO_OPTIONS = ['Facoltativo', 'Obbligatorio']
const CAUSALE_TIPO_DOCUMENTO_OPTIONS = [
  '',
  'Fattura',
  'Autofattura',
  'Doc. IVA normale',
  'Doc. IVA esig. differita',
  'Doc. Corrispettivo',
  'Doc. IVA Acq. CEE',
  'Movimento sola IVA',
  'Pag./Inc. IVA esig. diff.',
  'Movimento di generale',
]

const CAUSALE_RIGHE_TEMPLATE_RUOLI = [
  'soggetto',
  'iva',
  'costo',
  'ricavo',
  'banca',
  'cassa',
  'conto_fisso',
  'conto_da_storico_soggetto',
  'conto_manualizzato',
  'iva_split',
  'iva_split_payment',
  'split_payment',
  'ritenuta',
  'erario_ritenute',
  'sbilancio',
]

const CAUSALE_RIGHE_TEMPLATE_LATI = ['dare', 'avere']

const CAUSALE_RIGHE_TEMPLATE_FORMULE = [
  'totale_documento',
  'imponibile',
  'compenso',
  'cassa_previdenziale',
  'iva_detraibile',
  'iva_indetraibile',
  'netto',
  'ritenuta',
  'netto_pagabile',
  'residuo_sbilancio',
  'manuale',
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function normalizeEnum(value, options = []) {
  const text = normalizeText(value)
  if (!text) return ''
  const normalized = normalizeKey(text)
  const match = options.find((option) => normalizeKey(option) === normalized)
  return match || text
}

function normalizeChoice(value, options = [], fallback = '') {
  const text = normalizeText(value)
  if (!text) return fallback
  const normalized = normalizeKey(text)
  const match = options.find((option) => normalizeKey(option) === normalized)
  return match || fallback || text
}

function toBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 'SI' || value === 'S' || value === 'X') return true
  if (value === false || value === 'false' || value === 0 || value === '0' || value === 'NO' || value === 'N') return false
  return fallback
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function normalizeRegistrazioneCausaleRighePrimaNotaTemplateRow(row = {}, index = 0) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    ordine: toInteger(source.ordine, index + 1),
    ruolo: normalizeChoice(source.ruolo, CAUSALE_RIGHE_TEMPLATE_RUOLI, 'conto_manualizzato'),
    hierarchyType: normalizeChoice(source.hierarchyType || source.hierarchy_type, ['mastro', 'conto', 'sottoconto'], ''),
    isTemplateScope: toBoolean(source.isTemplateScope || source.is_template_scope, false),
    lato: normalizeChoice(source.lato, CAUSALE_RIGHE_TEMPLATE_LATI, 'dare'),
    formula_importo: normalizeChoice(source.formula_importo, CAUSALE_RIGHE_TEMPLATE_FORMULE, 'manuale'),
    conto_id: normalizeText(source.conto_id),
    conto_codice: normalizeText(source.conto_codice),
    conto_descrizione: normalizeText(source.conto_descrizione),
    mastrino_hint: normalizeText(source.mastrino_hint),
    descrizione_riga: normalizeText(source.descrizione_riga),
    obbligatoria: toBoolean(source.obbligatoria, false),
    modificabile: toBoolean(source.modificabile, true),
    attiva: toBoolean(source.attiva, true),
  }
}

export function normalizeRegistrazioneCausaleRighePrimaNotaTemplate(value) {
  return parseJsonArray(value).map((row, index) => normalizeRegistrazioneCausaleRighePrimaNotaTemplateRow(row, index))
}

export function normalizeRegistrazioneCausaleContabileValue(field, value) {
  if (field === 'tipo_causale') return normalizeEnum(value, CAUSALE_TIPO_CAUSALE_OPTIONS)
  if (field === 'operazione_partite') return normalizeEnum(value, CAUSALE_OPERAZIONE_PARTITE_OPTIONS)
  if (field === 'gestione_partite') return normalizeEnum(value, CAUSALE_OPERAZIONE_PARTITE_OPTIONS)
  if (field === 'op_ritenute') return normalizeEnum(value, CAUSALE_RITENUTE_OPTIONS)
  if (field === 'tipo_documento') return normalizeEnum(value, CAUSALE_TIPO_DOCUMENTO_OPTIONS)
  if (field === 'data_documento' || field === 'numero_documento') return normalizeEnum(value, CAUSALE_STATO_DOCUMENTO_OPTIONS)
  return normalizeText(value)
}

export function hydrateRegistrazioneCausaleContabileForm(causale = {}, { isIva = false } = {}) {
  const source = causale && typeof causale === 'object' ? causale : {}
  const tipoCausale = source.tipo_causale || source.tipoCausale || 'Movimento di generale'

  if (isIva) {
    const aliquota = source.aliquota ?? source.percentuale_imposta ?? 0
    const percentualeIndetraibilita = source.percentuale_indetraibilita ?? source.percentualeIndetraibilita ?? 0
    return {
      codice: normalizeText(source.codice),
      descrizione: normalizeText(source.descrizione),
      aliquota,
      percentuale_imposta: aliquota,
      regime_iva: normalizeText(source.regime_iva) || 'Imponibile',
      percentuale_compensazione: source.percentuale_compensazione ?? 0,
      tipo_trattamento: normalizeText(source.tipo_trattamento) || 'Normale',
      nota_di_variazione: toBoolean(source.nota_di_variazione, false),
      detraibile: toBoolean(source.detraibile, true),
      percentuale_indetraibilita: percentualeIndetraibilita,
      volume_affari: toBoolean(source.volume_affari, false),
      volume_affari_plafond: toBoolean(source.volume_affari_plafond, false),
      concorre_plafond: toBoolean(source.concorre_plafond, false),
      utilizzo_plafond_interno: toBoolean(source.utilizzo_plafond_interno, false),
      utilizzo_plafond_import: toBoolean(source.utilizzo_plafond_import, false),
      monte_acquisti: toBoolean(source.monte_acquisti, false),
      operazione_attiva: toBoolean(source.operazione_attiva, false),
      cessione_intra: toBoolean(source.cessione_intra, false),
      operazione_passiva: toBoolean(source.operazione_passiva, false),
      acquisto_intra: toBoolean(source.acquisto_intra, false),
      op_attive_spesometro: toBoolean(source.op_attive_spesometro, false),
      op_passive_spesometro: toBoolean(source.op_passive_spesometro, true),
      op_attive_liquidazione: toBoolean(source.op_attive_liquidazione, false),
      op_passive_liquidazione: toBoolean(source.op_passive_liquidazione, false),
      reverse_charge: toBoolean(source.reverse_charge, false),
      incluso_quadro_vt: toBoolean(source.incluso_quadro_vt, false),
      imponibile_quadro_vt: toBoolean(source.imponibile_quadro_vt, false),
      imposta_quadro_vt: toBoolean(source.imposta_quadro_vt, false),
      op_esenti_prorata: toBoolean(source.op_esenti_prorata, false),
      volume_affari_prorata: toBoolean(source.volume_affari_prorata, false),
      ripartizione_acquisti: toBoolean(source.ripartizione_acquisti, false),
      no_riparto_spese_acc: toBoolean(source.no_riparto_spese_acc, false),
      acquisto_soggetti_minimi: toBoolean(source.acquisto_soggetti_minimi, false),
      acquisti_art17_c2: toBoolean(source.acquisti_art17_c2, false),
      no_calcolo_bolli: toBoolean(source.no_calcolo_bolli, false),
      acquisti_regime_forfetario: toBoolean(source.acquisti_regime_forfetario, false),
      oro_argento: toBoolean(source.oro_argento, false),
      rottami_recupero: toBoolean(source.rottami_recupero, false),
      subappalto_edile: toBoolean(source.subappalto_edile, false),
      fabbricati_strumentali: toBoolean(source.fabbricati_strumentali, false),
      telefoni_cellulari: toBoolean(source.telefoni_cellulari, false),
      prodotti_elettronici: toBoolean(source.prodotti_elettronici, false),
      servizi_pulizia: toBoolean(source.servizi_pulizia, false),
      demolizione: toBoolean(source.demolizione, false),
      installazione_impianti: toBoolean(source.installazione_impianti, false),
      completamento_edifici: toBoolean(source.completamento_edifici, false),
      trasf_quote: toBoolean(source.trasf_quote, false),
      trasf_unita_certif: toBoolean(source.trasf_unita_certif, false),
      gas_energia: toBoolean(source.gas_energia, false),
      natura_aliquota_iva_pa: normalizeText(source.natura_aliquota_iva_pa),
      codice_efat_passive: toBoolean(source.codice_efat_passive, false),
      codice_efat_attive: toBoolean(source.codice_efat_attive, false),
      aliquota_ventilazione_no_acq: toBoolean(source.aliquota_ventilazione_no_acq, false),
      note: normalizeText(source.note),
    }
  }

  return {
    codice: normalizeText(source.codice),
    descrizione: normalizeText(source.descrizione),
    descrizione_tabulati: normalizeText(source.descrizione_tabulati),
    tipo: normalizeText(source.tipo) || 'generico',
    tipo_causale: normalizeRegistrazioneCausaleContabileValue('tipo_causale', source.tipo_causale || source.tipoCausale || 'Movimento di generale'),
    operazione_partite: normalizeRegistrazioneCausaleContabileValue('operazione_partite', source.operazione_partite || source.operazionePartite || source.gestione_partite || source.gestionePartite || 'Ignora'),
    gestione_partite: normalizeRegistrazioneCausaleContabileValue('gestione_partite', source.operazione_partite || source.operazionePartite || source.gestione_partite || source.gestionePartite || 'Ignora'),
    tipo_pagamento: normalizeText(source.tipo_pagamento),
    codice_registro_iva: normalizeText(source.codice_registro_iva),
    protocollo_numerazione: toInteger(source.protocollo_numerazione, 0),
    segno_registro_iva: normalizeText(source.segno_registro_iva),
    codice_aliquota_iva: normalizeText(source.codice_aliquota_iva),
    op_ritenute: normalizeRegistrazioneCausaleContabileValue('op_ritenute', source.op_ritenute || source.opRitenute || 'Ignora'),
    tipo_documento: normalizeCausaleOperazioneGestita(
      tipoCausale,
      source.operazione_partite || source.operazionePartite || source.gestione_partite || source.gestionePartite || 'Ignora',
      source.tipo_documento || source.tipoDocumento,
      source
    ),
    data_documento: normalizeRegistrazioneCausaleContabileValue('data_documento', source.data_documento || source.dataDocumento || 'Facoltativo'),
    numero_documento: normalizeRegistrazioneCausaleContabileValue('numero_documento', source.numero_documento || source.numeroDocumento || 'Facoltativo'),
    tipo_doc_comunicaz_ft: normalizeText(source.tipo_doc_comunicaz_ft),
    tipo_doc_ft_elettroniche: normalizeText(source.tipo_doc_ft_elettroniche),
    conto_iva_esig_differita: normalizeText(source.conto_iva_esig_differita),
    conto_iva_split_payment: normalizeText(source.conto_iva_split_payment || source.contoIvaSplitPayment),
    registro_iva_differita: normalizeText(source.registro_iva_differita),
    registro_iva_cee: normalizeText(source.registro_iva_cee),
    protocollo_iva_cee: toInteger(source.protocollo_iva_cee, 0),
    segno_iva_registro_cee: normalizeText(source.segno_iva_registro_cee),
    trascina_descrizione: toBoolean(source.trascina_descrizione, true),
    trascina_sbilancio: toBoolean(source.trascina_sbilancio, false),
    data_competenza: toBoolean(source.data_competenza, false),
    rateo_risconti: toBoolean(source.rateo_risconti, false),
    disattivato: toBoolean(source.disattivato, false),
    integrazione_documento: toBoolean(source.integrazione_documento, false),
    causale_giro_iva_cassa: toBoolean(source.causale_giro_iva_cassa, false),
    competenza_iva_anno_prec: toBoolean(source.competenza_iva_anno_prec, false),
    causale_standard_efat: toBoolean(source.causale_standard_efat, false),
    ventilazione_corrispettivi: toBoolean(source.ventilazione_corrispettivi, false),
    esclusa_integrazioni: toBoolean(source.esclusa_integrazioni, false),
    note: normalizeText(source.note),
    righe_prima_nota_template: normalizeRegistrazioneCausaleRighePrimaNotaTemplate(
      source.righe_prima_nota_template || source.righePrimaNotaTemplate || source.righe_prima_nota || []
    ),
  }
}

export function buildRegistrazioneCausaleContabilePayload(form = {}, { isIva = false } = {}) {
  const hydrated = hydrateRegistrazioneCausaleContabileForm(form, { isIva })
  const partitePersistite = hydrated.operazione_partite || hydrated.gestione_partite
  if (isIva) {
    return {
      codice: hydrated.codice,
      descrizione: hydrated.descrizione,
      aliquota: hydrated.percentuale_imposta ?? hydrated.aliquota,
      regime_iva: hydrated.regime_iva,
      percentuale_compensazione: hydrated.percentuale_compensazione,
      tipo_trattamento: hydrated.tipo_trattamento,
      nota_di_variazione: hydrated.nota_di_variazione,
      detraibile: hydrated.detraibile,
      percentuale_indetraibilita: hydrated.percentuale_indetraibilita ?? 0,
      volume_affari: hydrated.volume_affari,
      volume_affari_plafond: hydrated.volume_affari_plafond,
      concorre_plafond: hydrated.concorre_plafond,
      utilizzo_plafond_interno: hydrated.utilizzo_plafond_interno,
      utilizzo_plafond_import: hydrated.utilizzo_plafond_import,
      monte_acquisti: hydrated.monte_acquisti,
      operazione_attiva: hydrated.operazione_attiva,
      cessione_intra: hydrated.cessione_intra,
      operazione_passiva: hydrated.operazione_passiva,
      acquisto_intra: hydrated.acquisto_intra,
      op_attive_spesometro: hydrated.op_attive_spesometro,
      op_passive_spesometro: hydrated.op_passive_spesometro,
      op_attive_liquidazione: hydrated.op_attive_liquidazione,
      op_passive_liquidazione: hydrated.op_passive_liquidazione,
      reverse_charge: hydrated.reverse_charge,
      incluso_quadro_vt: hydrated.incluso_quadro_vt,
      imponibile_quadro_vt: hydrated.imponibile_quadro_vt,
      imposta_quadro_vt: hydrated.imposta_quadro_vt,
      op_esenti_prorata: hydrated.op_esenti_prorata,
      volume_affari_prorata: hydrated.volume_affari_prorata,
      ripartizione_acquisti: hydrated.ripartizione_acquisti,
      no_riparto_spese_acc: hydrated.no_riparto_spese_acc,
      acquisto_soggetti_minimi: hydrated.acquisto_soggetti_minimi,
      acquisti_art17_c2: hydrated.acquisti_art17_c2,
      no_calcolo_bolli: hydrated.no_calcolo_bolli,
      acquisti_regime_forfetario: hydrated.acquisti_regime_forfetario,
      oro_argento: hydrated.oro_argento,
      rottami_recupero: hydrated.rottami_recupero,
      subappalto_edile: hydrated.subappalto_edile,
      fabbricati_strumentali: hydrated.fabbricati_strumentali,
      telefoni_cellulari: hydrated.telefoni_cellulari,
      prodotti_elettronici: hydrated.prodotti_elettronici,
      servizi_pulizia: hydrated.servizi_pulizia,
      demolizione: hydrated.demolizione,
      installazione_impianti: hydrated.installazione_impianti,
      completamento_edifici: hydrated.completamento_edifici,
      trasf_quote: hydrated.trasf_quote,
      trasf_unita_certif: hydrated.trasf_unita_certif,
      gas_energia: hydrated.gas_energia,
      natura_aliquota_iva_pa: hydrated.natura_aliquota_iva_pa,
      codice_efat_passive: hydrated.codice_efat_passive,
      codice_efat_attive: hydrated.codice_efat_attive,
      aliquota_ventilazione_no_acq: hydrated.aliquota_ventilazione_no_acq,
      note: hydrated.note,
    }
  }

  return {
    codice: hydrated.codice,
    descrizione: hydrated.descrizione,
    descrizione_tabulati: hydrated.descrizione_tabulati,
    tipo: hydrated.tipo,
    tipo_causale: hydrated.tipo_causale,
    operazione_partite: partitePersistite,
    tipo_pagamento: hydrated.tipo_pagamento,
    codice_registro_iva: hydrated.codice_registro_iva,
    protocollo_numerazione: hydrated.protocollo_numerazione,
    segno_registro_iva: hydrated.segno_registro_iva,
    codice_aliquota_iva: hydrated.codice_aliquota_iva,
    op_ritenute: hydrated.op_ritenute,
    tipo_documento: hydrated.tipo_documento,
    data_documento: hydrated.data_documento,
    numero_documento: hydrated.numero_documento,
    tipo_doc_comunicaz_ft: hydrated.tipo_doc_comunicaz_ft,
    tipo_doc_ft_elettroniche: hydrated.tipo_doc_ft_elettroniche,
    conto_iva_esig_differita: hydrated.conto_iva_esig_differita,
    conto_iva_split_payment: hydrated.conto_iva_split_payment,
    registro_iva_differita: hydrated.registro_iva_differita,
    registro_iva_cee: hydrated.registro_iva_cee,
    protocollo_iva_cee: hydrated.protocollo_iva_cee,
    segno_iva_registro_cee: hydrated.segno_iva_registro_cee,
    trascina_descrizione: hydrated.trascina_descrizione,
    trascina_sbilancio: hydrated.trascina_sbilancio,
    data_competenza: hydrated.data_competenza,
    rateo_risconti: hydrated.rateo_risconti,
    disattivato: hydrated.disattivato,
    integrazione_documento: hydrated.integrazione_documento,
    causale_giro_iva_cassa: hydrated.causale_giro_iva_cassa,
    competenza_iva_anno_prec: hydrated.competenza_iva_anno_prec,
    causale_standard_efat: hydrated.causale_standard_efat,
    ventilazione_corrispettivi: hydrated.ventilazione_corrispettivi,
    esclusa_integrazioni: hydrated.esclusa_integrazioni,
    note: hydrated.note,
    righe_prima_nota_template: hydrated.righe_prima_nota_template,
  }
}

export {
  CAUSALE_TIPO_CAUSALE_OPTIONS,
  CAUSALE_OPERAZIONE_PARTITE_OPTIONS,
  CAUSALE_RITENUTE_OPTIONS,
  CAUSALE_STATO_DOCUMENTO_OPTIONS,
  CAUSALE_TIPO_DOCUMENTO_OPTIONS,
  CAUSALE_RIGHE_TEMPLATE_RUOLI,
  CAUSALE_RIGHE_TEMPLATE_LATI,
  CAUSALE_RIGHE_TEMPLATE_FORMULE,
}
