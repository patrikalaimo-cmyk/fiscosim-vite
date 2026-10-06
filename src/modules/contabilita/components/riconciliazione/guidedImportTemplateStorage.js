/**
 * guidedImportTemplateStorage
 *
 * Gestisce il registry locale dei template Guida FiscoSim.
 * Storage separato dallo staging: chiave localStorage dedicata.
 * NON tocca mai il draft di staging.
 */

const TEMPLATE_STORAGE_KEY = 'fiscosim:riconciliazione:guided-import-templates:v1'

export function loadGuidedImportTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGuidedImportTemplates(templates) {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error?.message || 'storage_error' }
  }
}

/**
 * Aggiunge o aggiorna un template nel registry.
 * Match per fingerprint + bankName (stesso layout = update).
 * Incrementa usageCount solo sull'update (non sulla prima creazione).
 */
export function addOrUpdateGuidedImportTemplate(template) {
  const templates = loadGuidedImportTemplates()
  const existingIndex = templates.findIndex(
    (t) =>
      t.templateId === template.templateId ||
      (t.layoutFingerprint &&
        t.layoutFingerprint === template.layoutFingerprint &&
        t.bankName === template.bankName)
  )

  if (existingIndex >= 0) {
    const existing = templates[existingIndex]
    templates[existingIndex] = {
      ...existing,
      ...template,
      templateId: existing.templateId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      usageCount: (existing.usageCount || 1) + 1,
    }
    return saveGuidedImportTemplates(templates)
  }

  templates.push({ ...template, updatedAt: new Date().toISOString() })
  return saveGuidedImportTemplates(templates)
}

export function deleteGuidedImportTemplate(templateId) {
  const templates = loadGuidedImportTemplates()
  const filtered = templates.filter((t) => t.templateId !== templateId)
  return saveGuidedImportTemplates(filtered)
}

/**
 * Incrementa usageCount e aggiorna lastUsedAt per un template già salvato.
 * Da chiamare solo quando il template è effettivamente usato/confermato.
 */
export function markGuidedImportTemplateUsed(templateId) {
  const templates = loadGuidedImportTemplates()
  const idx = templates.findIndex((t) => t.templateId === templateId)
  if (idx < 0) return { ok: false, error: 'not_found' }
  templates[idx] = {
    ...templates[idx],
    usageCount: (templates[idx].usageCount || 1) + 1,
    lastUsedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return saveGuidedImportTemplates(templates)
}
