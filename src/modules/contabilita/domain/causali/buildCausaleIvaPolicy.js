import { normalizeText } from '../../application/canonical_mapper/utils.js'
import { buildCausaleContabilePolicy } from './buildCausaleContabilePolicy.js'
import {
  pickPolicyBoolean,
  pickPolicyNumber,
  pickPolicyText,
} from './causalePolicyUtils.js'

function resolveIvaMode({ causaleIva = {}, contabilePolicy = {}, causaleBehavior = {} } = {}) {
  const behaviorMode = String(causaleBehavior?.ivaMode || causaleBehavior?.documentMode || '').trim().toLowerCase()
  const regimeIva = String(pickPolicyText(causaleIva, ['tipo', 'modo', 'categoria', 'regime_iva', 'regimeIva'])).trim().toLowerCase()

  if (contabilePolicy.ivaPerCassa || behaviorMode.includes('differita') || regimeIva.includes('differita')) return 'differita'
  if (contabilePolicy.isCee || behaviorMode.includes('cee') || regimeIva.includes('cee')) return 'cee'
  if (contabilePolicy.isAutofattura || behaviorMode.includes('autofattura') || regimeIva.includes('autofattura')) return 'autofattura'
  if (contabilePolicy.isSolaIva || behaviorMode.includes('sola_iva') || regimeIva.includes('solaiva') || regimeIva.includes('soloiva')) return 'sola_iva'
  if (contabilePolicy.isCorrispettivo || behaviorMode.includes('corrispettivo')) return 'corrispettivo'
  return 'normale'
}

function resolveRegistroIva({ causaleIva = {}, contabilePolicy = {}, ivaMode = 'normale' } = {}) {
  const direct = pickPolicyText(causaleIva, ['registroIva', 'registro_iva', 'codice_registro_iva', 'registro'])
  if (direct) return direct
  if (contabilePolicy.registroIva) return contabilePolicy.registroIva
  if (ivaMode === 'differita') return 'IVA-DIFF'
  if (ivaMode === 'cee') return 'IVA-CEE'
  if (ivaMode === 'corrispettivo') return 'CORRISP'
  if (ivaMode === 'sola_iva') return 'SOLO-IVA'
  
  // Smart fallbacks based on invoice type
  if (contabilePolicy.isFatturaPassiva || contabilePolicy.isNotaCreditoPassiva || contabilePolicy.isAcquistoCeeBeni || contabilePolicy.isAcquistoCeeServizi || contabilePolicy.isReverseCharge) {
    return 'ACQ'
  }
  if (contabilePolicy.isFatturaAttiva || contabilePolicy.isNotaCreditoAttiva) {
    return 'VEN'
  }
  
  return 'da assegnare'
}

function resolveSegnoRegistroIva({ causaleIva = {}, contabilePolicy = {} } = {}) {
  const direct = pickPolicyText(causaleIva, ['segnoRegistro', 'segno_registro', 'segno_registro_iva', 'segno'])
  if (direct) return direct
  if (contabilePolicy.notaCredito) return '-'
  if (contabilePolicy.segnoRegistroIva) return contabilePolicy.segnoRegistroIva
  return '+'
}

function resolvePercentualeDetraibilita({ causaleIva = {} } = {}) {
  const detraibile = pickPolicyBoolean(causaleIva, ['detraibile'])
  if (detraibile === false) return 0

  const percentualeIndetraibilita = pickPolicyNumber(causaleIva, ['percentualeIndetraibilita', 'percentuale_indetraibilita'])
  if (percentualeIndetraibilita != null) return Math.max(0, Math.min(100, 100 - percentualeIndetraibilita))

  const percentualeDetraibilita = pickPolicyNumber(causaleIva, ['percentualeDetraibilita', 'percentuale_detraibilita'])
  if (percentualeDetraibilita != null) return Math.max(0, Math.min(100, percentualeDetraibilita))

  return 100
}

export function buildCausaleIvaPolicy(causaleIva = {}, options = {}) {
  const iva = causaleIva && typeof causaleIva === 'object' ? causaleIva : {}
  const contabilePolicy = options?.contabilePolicy || buildCausaleContabilePolicy(options?.causaleContabile || {})
  const causaleBehavior = options?.causaleBehavior && typeof options.causaleBehavior === 'object' ? options.causaleBehavior : {}
  const aliquota = pickPolicyNumber(iva, ['aliquota', 'percentuale_imposta', 'aliquotaIva'])
  const natura = normalizeText(pickPolicyText(iva, ['natura', 'codice_natura', 'codiceNatura', 'natura_iva']))
  const regimeIva = normalizeText(pickPolicyText(iva, ['regime_iva', 'regimeIva', 'tipo', 'modo', 'categoria']))
  const ivaMode = resolveIvaMode({ causaleIva: iva, contabilePolicy, causaleBehavior })
  const registroIva = resolveRegistroIva({ causaleIva: iva, contabilePolicy, ivaMode })
  const segnoRegistroIva = resolveSegnoRegistroIva({ causaleIva: iva, contabilePolicy })
  const percentualeDetraibilita = resolvePercentualeDetraibilita({ causaleIva: iva })
  const percentualeIndetraibilita = Math.max(0, 100 - percentualeDetraibilita)
  const splitPayment = pickPolicyBoolean(iva, ['split_payment', 'splitPayment']) === true || regimeIva.toLowerCase() === 'split_payment'
  const reverseCharge = pickPolicyBoolean(iva, ['reverse_charge', 'reverseCharge']) === true || regimeIva.toLowerCase() === 'reverse_charge'
  const notaCredito = pickPolicyBoolean(iva, ['nota_di_variazione', 'notaDiVariazione']) === true
  const ivaPerCassa = contabilePolicy.ivaPerCassa || regimeIva.toLowerCase().includes('cassa')

  return {
    code: normalizeText(iva?.codice || iva?.code || iva?.sigla || iva?.id || '').toUpperCase(),
    descrizione: normalizeText(iva?.descrizione || iva?.description || iva?.denominazione || iva?.nome || ''),
    operazioneGestita: contabilePolicy.operazioneGestita || '',
    operazioneGestitaGroup: contabilePolicy.operazioneGestitaGroup || '',
    aliquota,
    natura,
    regimeIva,
    registroIva,
    segnoRegistroIva,
    ivaMode,
    percentualeDetraibilita,
    percentualeIndetraibilita,
    detraibile: percentualeDetraibilita > 0,
    contoIva: normalizeText(pickPolicyText(iva, ['contoIva', 'conto_iva', 'conto_iva_id', 'contoIvaId'])),
    ivaPerCassa,
    splitPayment,
    reverseCharge: reverseCharge || contabilePolicy.reverseCharge,
    notaCredito: notaCredito || contabilePolicy.notaCredito,
    integrazioneDocumento: contabilePolicy.integrazioneDocumento,
    isDocumentoIva: contabilePolicy.isDocumentoIva,
  }
}
