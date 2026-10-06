/**
 * Precondizioni archivio Import Fatture senza dipendenza da `importRepo` (Supabase).
 * Stessa logica del bridge; esportata per test e per barrel `importFattureArchivioBridge.js`.
 */

import { FISCOSIM_IMPORT_AI_META as META } from '../../import_unificato/data/importFiscosimMeta.js'
import { validateImportFattureStructuralForArchivio } from './importFattureWorkingViewGuards.js'

function normalizeAiRaw(doc) {
  let raw = doc?.ai_raw_response
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return typeof p === 'object' && p && !Array.isArray(p) ? { ...p } : {}
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * @returns {{ ok: true } | { ok: false, message: string, code?: string }}
 */
export function validateImportFattureArchivioBridgePreconditions(doc, pianoConti = [], historicalTopCodice = '', causaliIva = []) {
  void historicalTopCodice
  if (!doc?.id) return { ok: false, message: 'Documento non valido.', code: 'doc' }
  const tipo = String(doc.tipo_documento || '').toLowerCase()
  if (!tipo.includes('fattura_passiva') && !tipo.includes('fattura_attiva')) {
    return { ok: false, message: 'Solo fattura passiva o attiva possono essere inviate in archivio.', code: 'tipo' }
  }
  const raw = normalizeAiRaw(doc)
  if (raw[META.FINAL_STEP_CONFIRMATION] !== true) {
    return { ok: false, message: 'Conferma prima «Conferma per passo finale».', code: 'final_flag' }
  }
  const structural = validateImportFattureStructuralForArchivio(doc, pianoConti, causaliIva)
  if (!structural.ok) {
    return {
      ok: false,
      message: structural.message,
      code: structural.code || 'structural_guards',
    }
  }
  return { ok: true }
}
