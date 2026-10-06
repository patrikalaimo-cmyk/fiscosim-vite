import { runFiscalKnowledgePlaceholderScan } from '../../services/fiscalKnowledgeScanService.js'

export async function fiscalKnowledgeScanHandler() {
  try {
    const out = await runFiscalKnowledgePlaceholderScan()
    if (!out.ok) {
      return { status: 500, json: { error: out.error || 'Scan failed' } }
    }
    return { status: 200, json: { ok: true, batchId: out.batchId, itemsCount: out.itemsCount } }
  } catch (e) {
    return { status: 500, json: { error: e?.message || String(e) } }
  }
}
