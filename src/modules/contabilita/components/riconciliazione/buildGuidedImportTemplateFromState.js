/**
 * buildGuidedImportTemplateFromState
 *
 * Costruisce un template locale da uno stato Guida FiscoSim reale + dry run result.
 * NON modifica movimenti, NON tocca staging, NON chiama API.
 *
 * Criteri certificationMode:
 * - certified_balanced: difference=0, saldi ufficiali presenti, no blockers → reliability high
 * - non_certifying_review: movimenti presenti, no blockers gravi, ma saldi assenti o non verificati → reliability medium
 * - import_only: tutto il resto (non salvabile come template stabile)
 */

function buildLayoutFingerprint({ statement, guidedState }) {
  const bankName = String(
    statement.documentAccount?.bankName ||
      statement.documentMeta?.bankName ||
      statement.bankName ||
      statement.profileLabel ||
      ''
  )
    .toLowerCase()
    .replace(/\s+/g, '_')
    .trim()

  const ibanPrefix = String(
    statement.documentAccount?.iban ||
      statement.documentMeta?.iban ||
      statement.iban ||
      ''
  )
    .replace(/\s/g, '')
    .slice(0, 12)
    .toUpperCase()

  const bic = String(
    statement.documentAccount?.bic || statement.documentMeta?.bic || ''
  )
    .trim()
    .toUpperCase()

  const profile = String(statement.profile || '').trim()
  const preset = String(guidedState?.columnPreset || '').trim()

  return [bankName, ibanPrefix, bic, profile, preset].filter(Boolean).join('|')
}

/**
 * Valuta se il dry run result consente il salvataggio automatico di un template.
 * Restituisce { canSave, certifying, reason }.
 */
export function canAutoSaveTemplate(dryRunResult) {
  if (!dryRunResult) return { canSave: false, reason: 'no_dry_run' }

  const movementsExtracted = Number(dryRunResult.movementsExtracted ?? 0)
  if (movementsExtracted <= 0) return { canSave: false, reason: 'no_movements' }

  const hasBlockers = (dryRunResult.blockers || []).length > 0
  if (hasBlockers) return { canSave: false, reason: 'has_blockers' }

  const hasOfficialBalances =
    dryRunResult.openingBalance != null && dryRunResult.closingBalanceOfficial != null

  if (hasOfficialBalances) {
    const diff = dryRunResult.difference
    if (diff != null && Math.abs(Number(diff)) > 0.01) {
      return { canSave: false, reason: 'difference_not_zero' }
    }
    // certified_balanced
    return { canSave: true, certifying: true }
  }

  // no official balances → non_certifying_review allowed if warnings are few
  const warningCount = (dryRunResult.warnings || []).length
  if (warningCount > 5) return { canSave: false, reason: 'too_many_warnings' }

  return { canSave: true, certifying: false }
}

/**
 * Costruisce il template dal guided state.
 */
export function buildGuidedImportTemplateFromState({
  statement,
  guidedState,
  dryRunResult,
  auditMeta,
  scope = 'studio_local',
}) {
  const hasOfficialBalances =
    dryRunResult?.openingBalance != null && dryRunResult?.closingBalanceOfficial != null
  const diff = dryRunResult?.difference
  const certifying =
    hasOfficialBalances && diff != null && Math.abs(Number(diff)) <= 0.01

  const reliability = certifying ? 'high' : 'medium'
  const certificationMode = certifying ? 'certified_balanced' : 'non_certifying_review'

  const bankName = String(
    statement.documentAccount?.bankName ||
      statement.documentMeta?.bankName ||
      statement.bankName ||
      statement.profileLabel ||
      ''
  ).trim()

  const ibanPrefix = String(
    statement.documentAccount?.iban ||
      statement.documentMeta?.iban ||
      statement.iban ||
      ''
  )
    .replace(/\s/g, '')
    .slice(0, 12)
    .toUpperCase()

  const bic = String(
    statement.documentAccount?.bic || statement.documentMeta?.bic || ''
  )
    .trim()
    .toUpperCase()

  const fingerprint = buildLayoutFingerprint({ statement, guidedState })

  const certLabel = certifying ? '(certificato)' : '(non certificante)'
  const profilePart = statement.profile ? ` · ${statement.profile}` : ''
  const templateLabel = `${bankName || 'Banca sconosciuta'}${profilePart} ${certLabel}`

  // Raccoglie fieldMappings dai campi operatore (solo quelli con valore)
  const fieldMappings = {}
  const fields = guidedState?.fieldsByKey || {}
  Object.entries(fields).forEach(([key, field]) => {
    if (field.finalValue != null && String(field.finalValue).trim() !== '') {
      fieldMappings[key] = {
        finalValue: field.finalValue,
        source: field.source || 'unknown',
        status: field.status || 'unknown',
      }
    }
  })

  return {
    templateId: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    templateVersion: 1,
    templateLabel,
    scope,
    bankName,
    bankAliases: [],
    ibanPrefix,
    bic,
    documentType: statement.documentType || statement.profile || '',
    sourceProfile: statement.profile || '',
    layoutFingerprint: fingerprint,
    columnPreset: guidedState?.columnPreset || '',
    ignoreSections: Array.isArray(guidedState?.ignoredSections)
      ? [...guidedState.ignoredSections]
      : [],
    multilineAttached: Boolean(guidedState?.multiline?.attached),
    fieldMappings,
    reliability,
    certificationMode,
    createdFromAuditId: auditMeta?.auditId || '',
    createdFromImportId: auditMeta?.importId || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 1,
    lastUsedAt: null,
    autoLearned: true,
  }
}
