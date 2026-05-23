import { normalizeText } from '../../application/canonical_mapper/utils.js'
import { buildCausaleContabilePolicy } from '../causali/buildCausaleContabilePolicy.js'
import { buildCausaleIvaPolicy } from '../causali/buildCausaleIvaPolicy.js'

export function resolveRegistrazioneCausaleIvaBehavior({
  causaleIva = null,
  causaleContabile = null,
  causaleBehavior = null,
  documentData = null,
} = {}) {
  const iva = causaleIva && typeof causaleIva === 'object' ? causaleIva : null
  const contabile = causaleContabile && typeof causaleContabile === 'object' ? causaleContabile : null
  const behavior = causaleBehavior && typeof causaleBehavior === 'object' ? causaleBehavior : {}
  const warnings = []
  const reasons = []
  const contabilePolicy = buildCausaleContabilePolicy(contabile || {})
  const policy = buildCausaleIvaPolicy(iva || {}, {
    causaleContabile: contabile || {},
    contabilePolicy,
    causaleBehavior: behavior,
  })
  const source = iva ? 'causale_iva' : 'fallback'

  if (iva) {
    reasons.push('Causale IVA selezionata dalla lista disponibile.')
  } else {
    warnings.push('Causale IVA non selezionata: comportamento predisposto in modo neutro.')
    reasons.push('Fallback neutro per assenza di causale IVA.')
  }

  if (!policy.registroIva || policy.registroIva === 'da assegnare') warnings.push('registro IVA non definito sulla causale IVA')
  if (!policy.aliquota && !policy.natura) warnings.push('aliquota/natura IVA non definita sulla causale IVA')
  if (!normalizeText(documentData?.totaleDocumento) && !normalizeText(documentData?.totale_documento)) warnings.push('totale documento non ancora disponibile per il calcolo IVA')

  return {
    codice: policy.code,
    descrizione: policy.descrizione,
    aliquota: policy.aliquota,
    natura: policy.natura,
    registroIva: policy.registroIva,
    segnoRegistro: policy.segnoRegistroIva,
    percentualeDetraibilita: policy.percentualeDetraibilita,
    percentualeIndetraibilita: policy.percentualeIndetraibilita,
    detraibile: policy.detraibile,
    ivaMode: policy.ivaMode,
    contoIva: policy.contoIva,
    ivaPerCassa: policy.ivaPerCassa,
    splitPayment: policy.splitPayment,
    reverseCharge: policy.reverseCharge,
    notaCredito: policy.notaCredito,
    integrazioneDocumento: policy.integrazioneDocumento,
    isDocumentoIva: policy.isDocumentoIva,
    source,
    warnings,
    reasons,
  }
}
