const BASE_REQUIRED_FIELDS = ['dataRegistrazione', 'causaleContabile']

function normalizeTabs(tabs = []) {
  return Array.from(new Set(['rows', ...Array.isArray(tabs) ? tabs : []].filter(Boolean)))
}

function resolveDefaultTabs(behavior = {}) {
  const tabs = ['rows']
  if (behavior?.showIvaPanel) tabs.push('iva')
  if (behavior?.showPartitario) tabs.push('partitario')
  if (behavior?.showRitenute) tabs.push('ritenute')
  return tabs
}

export function buildRegistrazioneManualeUiPolicy(behavior = {}) {
  const showDocumentPanel = Boolean(behavior?.showDocumentPanel)
  const showIvaPanel = Boolean(behavior?.showIvaPanel)
  const showIvaPerCassaPreview = Boolean(behavior?.showIvaPerCassaPreview)
  const showPartitario = Boolean(behavior?.showPartitario)
  const showRitenute = Boolean(behavior?.showRitenute)

  const requiresSoggetto = Boolean(behavior?.requiresSoggetto ?? (showDocumentPanel || showPartitario || showRitenute))
  const requiresDocumentDate = Boolean(showDocumentPanel || behavior?.requiresDocumentDate)
  const requiresDocumentNumber = Boolean(showDocumentPanel || behavior?.requiresDocumentNumber)
  const requiresDocumentTotal = Boolean(showDocumentPanel || behavior?.requiresDocumentTotal)
  const requiresRitenuteData = Boolean(showRitenute || behavior?.requiresRitenuteData)

  const activeTabs = normalizeTabs(
    Array.isArray(behavior?.activeTabs)
      ? behavior.activeTabs
      : resolveDefaultTabs({ showIvaPanel, showPartitario, showRitenute })
  )

  const requiredFields = Array.from(
    new Set([
      ...BASE_REQUIRED_FIELDS,
      ...(Array.isArray(behavior?.requiredFields) ? behavior.requiredFields : []),
      ...(requiresDocumentDate ? ['dataDocumento'] : []),
      ...(requiresDocumentNumber ? ['numeroDocumento'] : []),
    ])
  )

  return {
    ...behavior,
    showDocumentPanel,
    showIvaPanel,
    showIvaPerCassaPreview,
    showPartitario,
    showRitenute,
    requiresSoggetto,
    requiresDocumentDate,
    requiresDocumentNumber,
    requiresDocumentTotal,
    requiresRitenuteData,
    activeTabs,
    requiredFields,
  }
}
