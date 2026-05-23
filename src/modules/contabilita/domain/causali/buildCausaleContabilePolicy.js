import { normalizeText } from '../../application/canonical_mapper/utils.js'
import {
  hasPolicyField,
  isPolicyOneOf,
  normalizePolicyKey,
  pickPolicyBoolean,
  pickPolicyText,
} from './causalePolicyUtils.js'

function hasIvaDifferitaFlag(item) {
  return (
    pickPolicyBoolean(item, ['registro_iva_differita', 'iva_differita', 'differita_iva', 'esigibilita_differita']) === true ||
    hasPolicyField(item, ['conto_iva_esig_differita', 'registro_iva_differita', 'tipo_doc_comunicaz_ft', 'tipo_doc_ft_elettroniche'])
  )
}

function hasCeeFlag(item) {
  return pickPolicyBoolean(item, ['registro_iva_cee', 'iva_cee', 'flag_cee', 'operazione_cee']) === true
}

function resolvePartitarioMode({ partiteOpen, partiteClose, partiteIgnore }) {
  if (partiteClose) return 'chiusura'
  if (partiteOpen) return 'apertura'
  if (partiteIgnore) return 'nessuno'
  return 'nessuno'
}

function resolveRitenuteMode({ ritenuteDocument, ritenutePayment, ritenuteIgnore }) {
  if (ritenuteDocument) return 'documento'
  if (ritenutePayment) return 'pagamento'
  if (ritenuteIgnore) return 'nessuna'
  return 'nessuna'
}

export function buildCausaleContabilePolicy(causale = {}) {
  const item = causale && typeof causale === 'object' ? causale : { codice: causale }
  const code = normalizeText(item?.code || item?.codice || item?.sigla || item?.id || '').toUpperCase()
  const typeCausale = pickPolicyText(item, ['tipo_causale', 'tipoCausale'])
  const operazionePartite = pickPolicyText(item, ['operazione_partite', 'operazionePartite'])
  const gestionePartite = pickPolicyText(item, ['gestione_partite', 'gestionePartite'])
  const opRitenute = pickPolicyText(item, ['op_ritenute', 'opRitenute', 'operazioneRitenute', 'operazione_ritenute'])
  const tipoDocumento = pickPolicyText(item, ['tipo_documento', 'tipoDocumento'])
  const dataDocumento = pickPolicyText(item, ['data_documento', 'dataDocumento'])
  const numeroDocumento = pickPolicyText(item, ['numero_documento', 'numeroDocumento'])
  const segnoRegistroIva = normalizeText(item?.segno_registro_iva || item?.segnoRegistroIva || '')
  const registroIva = normalizeText(item?.codice_registro_iva || item?.registro_iva || '')
  const normalizedType = normalizePolicyKey(typeCausale)
  const normalizedTipoDocumento = normalizePolicyKey(tipoDocumento)

  const partiteOpen = isPolicyOneOf(operazionePartite, ['apre', 'apertura', 'aperti']) || isPolicyOneOf(gestionePartite, ['apre', 'apertura'])
  const partiteClose = isPolicyOneOf(operazionePartite, ['chiude', 'chiusura']) || isPolicyOneOf(gestionePartite, ['chiude', 'chiusura'])
  const partiteIgnore = isPolicyOneOf(operazionePartite, ['ignora', 'nessuna', 'nessuno']) || isPolicyOneOf(gestionePartite, ['ignora', 'nessuna', 'nessuno'])

  const ritenuteDocument = isPolicyOneOf(opRitenute, ['documento', 'doc', 'document'])
  const ritenutePayment = isPolicyOneOf(opRitenute, ['pagamento', 'pag', 'payment'])
  const ritenuteIgnore = isPolicyOneOf(opRitenute, ['ignora', 'nessuna', 'nessuno'])

  const ivaPerCassa = hasIvaDifferitaFlag(item) || pickPolicyBoolean(item, ['causale_giro_iva_cassa', 'iva_per_cassa']) === true
  const isCee = hasCeeFlag(item) || normalizedType.includes('cee') || normalizedTipoDocumento.includes('cee')
  const isAutofattura = isPolicyOneOf(typeCausale, ['autofattura']) || isPolicyOneOf(tipoDocumento, ['autofattura'])
  const isCorrispettivo = isPolicyOneOf(typeCausale, ['doccorrispettivo', 'corrispettivo'])
  const isSolaIva = isPolicyOneOf(typeCausale, ['movimentosolaiva', 'solaiva', 'soloiva']) || isPolicyOneOf(tipoDocumento, ['movimentosolaiva', 'solaiva', 'soloiva'])
  const isMovimentoGenerico = isPolicyOneOf(typeCausale, ['movimentogenerale', 'movimentodigenerale', 'generale'])
  const isPagamentoIncasso =
    isPolicyOneOf(typeCausale, [
      'pagincivaesigdiff',
      'pagamentoincassivaesigdiff',
      'pagamentoincassoivaesigdifferita',
      'pagamentoincassivaesigibilitadifferita',
    ]) || (ivaPerCassa && (partiteOpen || partiteClose))

  const isDocumentoIva =
    isPolicyOneOf(typeCausale, [
      'docivanormale',
      'documentoiva',
      'fatturadocumentoiva',
      'docivaesigdifferita',
      'documentoivaesigdifferita',
      'autofattura',
      'docivaacqcee',
      'documentoivaacqcee',
      'movimentosolaiva',
      'solaiva',
      'soloiva',
    ]) ||
    isCorrispettivo ||
    isCee ||
    (ivaPerCassa && !isPagamentoIncasso)

  const richiedeDataDocumento =
    isPolicyOneOf(dataDocumento, ['obbligatorio']) ||
    (Boolean(dataDocumento) && isDocumentoIva) ||
    isAutofattura
  const richiedeNumeroDocumento =
    isPolicyOneOf(numeroDocumento, ['obbligatorio']) ||
    (Boolean(numeroDocumento) && isDocumentoIva) ||
    isAutofattura

  const hasConfiguredFields = Boolean(
    typeCausale ||
      operazionePartite ||
      gestionePartite ||
      opRitenute ||
      tipoDocumento ||
      dataDocumento ||
      numeroDocumento ||
      ivaPerCassa ||
      isCee ||
      registroIva ||
      segnoRegistroIva
  )

  const notaCredito =
    isPolicyOneOf(typeCausale, ['notacredito', 'nota credito']) ||
    isPolicyOneOf(tipoDocumento, ['notacredito', 'nota credito']) ||
    segnoRegistroIva === '-'

  return {
    code,
    typeCausale,
    operazionePartite,
    gestionePartite,
    opRitenute,
    tipoDocumento,
    dataDocumento,
    numeroDocumento,
    registroIva,
    segnoRegistroIva,
    hasConfiguredFields,
    isDocumentoIva,
    isMovimentoGenerico,
    isPagamentoIncasso,
    isAutofattura,
    isCorrispettivo,
    isSolaIva,
    isCee,
    gestionePartitario: resolvePartitarioMode({ partiteOpen, partiteClose, partiteIgnore }),
    gestioneRitenute: resolveRitenuteMode({ ritenuteDocument, ritenutePayment, ritenuteIgnore }),
    richiedeDataDocumento,
    richiedeNumeroDocumento,
    ivaPerCassa,
    splitPayment: pickPolicyBoolean(item, ['split_payment', 'splitPayment']) === true,
    reverseCharge: pickPolicyBoolean(item, ['reverse_charge', 'reverseCharge']) === true || isAutofattura || isCee,
    notaCredito,
    integrazioneDocumento: pickPolicyBoolean(item, ['integrazione_documento', 'integrazioneDocumento']) === true,
    partiteOpen,
    partiteClose,
    partiteIgnore,
    ritenuteDocument,
    ritenutePayment,
    ritenuteIgnore,
  }
}
