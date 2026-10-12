/**
 * SG-L4 Livello B — resolve studio rules inside the target società.
 * Never inject foreign account/causale UUIDs from another company.
 */

function text(value) {
  return String(value ?? '').trim()
}

function normalizeCode(value) {
  return text(value).toUpperCase()
}

function normalizeNatura(value) {
  return text(value).toLowerCase()
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function looksLikeUuid(value) {
  return UUID_RE.test(text(value))
}

/**
 * @param {object} rule studio-authorized rule (codes/natura only for cross-company safety)
 * @param {object} targetSocietaCatalog { pianoConti, causaliContabili, causaliIva }
 */
export function resolveStudioRuleToSocietaTargets(rule = {}, targetSocietaCatalog = {}) {
  const blockers = []
  const warnings = []

  const alienAccountId = text(rule.accountId || rule.contoId || rule.conto_id)
  const alienCausaleId = text(rule.causaleId || rule.causale_id)
  const alienCausaleIvaId = text(rule.causaleIvaId || rule.causale_iva_id)

  if (alienAccountId && looksLikeUuid(alienAccountId)) {
    blockers.push('studio_rule_forbids_foreign_account_uuid')
  }
  if (alienCausaleId && looksLikeUuid(alienCausaleId)) {
    blockers.push('studio_rule_forbids_foreign_causale_uuid')
  }
  if (alienCausaleIvaId && looksLikeUuid(alienCausaleIvaId)) {
    blockers.push('studio_rule_forbids_foreign_causale_iva_uuid')
  }

  const pianoConti = Array.isArray(targetSocietaCatalog.pianoConti) ? targetSocietaCatalog.pianoConti : []
  const causaliContabili = Array.isArray(targetSocietaCatalog.causaliContabili)
    ? targetSocietaCatalog.causaliContabili
    : []
  const causaliIva = Array.isArray(targetSocietaCatalog.causaliIva) ? targetSocietaCatalog.causaliIva : []

  const accountCode = normalizeCode(rule.accountCode || rule.contoCodice || rule.conto_codice)
  const accountNatura = normalizeNatura(rule.accountNatura || rule.natura)
  const causaleCode = normalizeCode(rule.causaleCode || rule.causale_codice)
  const causaleIvaCode = normalizeCode(rule.causaleIvaCode || rule.causale_iva_codice)
  const aliquota = Number(rule.aliquota)

  let account = null
  if (!blockers.includes('studio_rule_forbids_foreign_account_uuid')) {
    if (accountCode) {
      account = pianoConti.find((row) => normalizeCode(row?.codice) === accountCode) || null
      if (!account) warnings.push('studio_rule_account_code_not_found_in_target')
    } else if (accountNatura) {
      const matches = pianoConti.filter((row) => {
        const natura = normalizeNatura(row?.natura || row?.tipo)
        const economico = text(row?.tipo).toLowerCase() === 'economico' || Boolean(row?.isEconomico)
        return economico && (natura === accountNatura || normalizeNatura(row?.descrizione).includes(accountNatura))
      })
      account = matches[0] || null
      if (!account) warnings.push('studio_rule_account_natura_not_found_in_target')
      if (matches.length > 1) warnings.push('studio_rule_account_natura_ambiguous')
    }
  }

  let causale = null
  if (!blockers.includes('studio_rule_forbids_foreign_causale_uuid') && causaleCode) {
    causale = causaliContabili.find((row) => (
      normalizeCode(row?.codice) === causaleCode
      || normalizeCode(row?.codiceInterno) === causaleCode
    )) || null
    if (!causale) warnings.push('studio_rule_causale_code_not_found_in_target')
  }

  let causaleIva = null
  if (!blockers.includes('studio_rule_forbids_foreign_causale_iva_uuid')) {
    if (causaleIvaCode) {
      causaleIva = causaliIva.find((row) => (
        normalizeCode(row?.codice) === causaleIvaCode
        || normalizeCode(row?.codiceInterno) === causaleIvaCode
      )) || null
      if (!causaleIva) warnings.push('studio_rule_causale_iva_code_not_found_in_target')
    } else if (Number.isFinite(aliquota)) {
      const defaults = causaliIva.filter((row) => {
        const aliq = Number(row?.aliquota)
        const isDefault = row?.is_default_per_aliquota === true || row?.is_default_per_aliquota === 1
        return isDefault && Math.round(aliq) === Math.round(aliquota)
      })
      causaleIva = defaults[0] || null
      if (!causaleIva) warnings.push('studio_rule_default_iva_not_found_in_target')
    }
  }

  return {
    ok: blockers.length === 0,
    source: 'studio_rule',
    ruleId: text(rule.id || rule.ruleId) || null,
    account,
    causale,
    causaleIva,
    blockers,
    warnings,
    resolvedBy: {
      account: accountCode ? 'code' : accountNatura ? 'natura' : null,
      causale: causaleCode ? 'code' : null,
      causaleIva: causaleIvaCode ? 'code' : Number.isFinite(aliquota) ? 'aliquota_default' : null,
    },
  }
}

/**
 * Apply studio rule only when no stronger suggestion exists (manual/history/feedback).
 */
export function applyStudioRuleFallback({
  hasSuggestion = false,
  rule = null,
  targetSocietaCatalog = {},
} = {}) {
  if (hasSuggestion || !rule) {
    return { applied: false, reason: hasSuggestion ? 'stronger_suggestion_present' : 'no_rule' }
  }
  const resolved = resolveStudioRuleToSocietaTargets(rule, targetSocietaCatalog)
  if (!resolved.ok || (!resolved.account && !resolved.causale && !resolved.causaleIva)) {
    return { applied: false, reason: 'rule_unresolved', resolved }
  }
  return { applied: true, reason: 'studio_rule_fallback', resolved }
}
