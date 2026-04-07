import { sb } from '../../lib/supabase.js'
import { analyzeIvaAnomalyEngine } from '../../../../services/ivaAnomalyEngine.js'
import { analyzeFiscalDeductibilityEngine } from '../../../../services/fiscalDeductibilityEngine.js'

export async function loadIvaInsightsForSocieta(societaId, options = {}) {
  if (!societaId) return { byDocId: {}, rows: [] }
  const db = options.db || sb
  const [iva, ded] = await Promise.all([
    analyzeIvaAnomalyEngine(db, societaId),
    analyzeFiscalDeductibilityEngine(db, societaId),
  ])
  const rows = [...(iva || []), ...(ded || [])]
  const byDocId = {}
  const filterIds = Array.isArray(options.docIds) ? new Set(options.docIds.map(String)) : null
  for (const r of rows) {
    const docId = r?.entity_ref?.document_id
    if (!docId) continue
    if (filterIds && !filterIds.has(String(docId))) continue
    const key = String(docId)
    if (!byDocId[key]) byDocId[key] = []
    byDocId[key].push(r)
  }
  return { byDocId, rows }
}

