function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const FORMULA_ALIASES = new Map([
  ['totaledocumento', 'totale_documento'],
  ['totale_documento', 'totale_documento'],
  ['imponibile', 'imponibile'],
  ['compenso', 'compenso'],
  ['base_ritenuta', 'base_ritenuta'],
  ['baseritenuta', 'base_ritenuta'],
  ['iva_detraibile', 'iva_detraibile'],
  ['ivadetraibile', 'iva_detraibile'],
  ['iva_indetraibile', 'iva_indetraibile'],
  ['ivaindetraibile', 'iva_indetraibile'],
  ['cassa_previdenziale', 'cassa_previdenziale'],
  ['cassaprevidenziale', 'cassa_previdenziale'],
])

export function normalizeRegistrazioneRowFormula(value) {
  const key = normalizeKey(value)
  return FORMULA_ALIASES.get(key) || key
}

export function resolveRegistrazioneRowFormula(row = {}) {
  const candidates = [
    row.formula_importo,
    row.formulaImporto,
    row.formula,
    row.formula_calcolo,
    row.tipoFormula,
    row.templateFormula,
  ]
  const formula = candidates.find((value) => String(value ?? '').trim() !== '')
  return normalizeRegistrazioneRowFormula(formula)
}

export function resolveRegistrazioneRowRole(row = {}) {
  const role = [row.ruolo, row.role, row.templateRole]
    .find((value) => String(value ?? '').trim() !== '')
  return normalizeKey(role)
}
