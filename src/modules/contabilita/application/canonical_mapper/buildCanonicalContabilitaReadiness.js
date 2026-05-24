import { normalizeText } from './utils.js'

export function buildCanonicalContabilitaReadiness(validation = {}, classification = null) {
  const blockers = Array.isArray(validation?.blockers) ? validation.blockers : []
  const warnings = Array.isArray(validation?.warnings) ? validation.warnings : []
  const unsupportedBlockerMatches = [
    'ritenuta presente ma non supportata',
    'reverse/estero presente ma non supportato',
    'iva per cassa non supportata',
  ]
  const hasUnsupportedCase =
    blockers.some((item) => unsupportedBlockerMatches.some((match) => String(item || '').toLowerCase().includes(match))) ||
    Boolean(classification && classification.managed === false && (
      classification.code === 'ritenuta_professionista' ||
      classification.code === 'reverse_o_autofattura_estera' ||
      classification.code === 'iva_per_cassa'
    ))

  if (hasUnsupportedCase) {
    return {
      status: 'bloccato_per_casistica_non_gestita',
      label: 'Bloccato per casistica non gestita',
      blockers,
      warnings,
    }
  }

  if (blockers.length || warnings.length) {
    return {
      status: 'incompleto',
      label: normalizeText('Incompleto'),
      blockers,
      warnings,
    }
  }

  return {
    status: 'pronto_per_contabilita',
    label: 'Pronto per contabilità',
    blockers,
    warnings,
  }
}
