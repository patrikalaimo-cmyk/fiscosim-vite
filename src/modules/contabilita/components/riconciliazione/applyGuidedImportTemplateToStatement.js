/**
 * applyGuidedImportTemplateToStatement
 *
 * Applicazione CONSERVATIVA di un template a uno statement.
 * NON modifica movimenti, importi, parseStatus certificato.
 * Aggiunge solo metadata suggeriti (mode: "suggested_only").
 */

export function applyGuidedImportTemplateToStatement(statement, templateMatch) {
  if (!statement || !templateMatch?.matched || !templateMatch?.template) {
    return statement
  }

  const tpl = templateMatch.template

  return {
    ...statement,
    guidedTemplateMatch: {
      templateId: tpl.templateId,
      templateLabel: tpl.templateLabel,
      score: templateMatch.score,
      scoreLevel: templateMatch.scoreLevel || 'medium',
      reasons: templateMatch.reasons || [],
      certificationMode: tpl.certificationMode,
      reliability: tpl.reliability,
      usageCount: tpl.usageCount || 1,
      lastUsedAt: tpl.lastUsedAt || null,
      matchedAt: new Date().toISOString(),
    },
    suggestedColumnPreset: tpl.columnPreset || null,
    suggestedIgnoreSections: Array.isArray(tpl.ignoreSections)
      ? tpl.ignoreSections
      : [],
    suggestedMultilineAttached: tpl.multilineAttached || false,
    templateAppliedMode: 'suggested_only',
  }
}
