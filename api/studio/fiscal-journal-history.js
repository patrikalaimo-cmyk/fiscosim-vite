/**
 * LAB-only HTTP facade: read Stage3W fiscal journal claim history.
 * Companion to fiscal-journal-post — no LIVE, no anon grants.
 */
import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin } from '../../lib/db.js'
import { scopedCompanyIds } from '../../lib/fiscalReadScope.js'
import { isIsolatedStudioEnvironment } from '../../lib/isolatedStudioLab.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SOURCE_MODULES = new Set(['import_contabilita', 'riconciliazione_bancaria'])

export function parseFiscalJournalHistoryQuery(input = {}) {
  const societa_id = String(input.societa_id || input.societaId || '').trim()
  const source_module = String(input.source_module || input.sourceModule || '').trim()
  const limitRaw = Number(input.limit)
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200)
  if (!UUID.test(societa_id)) return null
  if (!SOURCE_MODULES.has(source_module)) return null
  return { societa_id, source_module, limit }
}

function mapClaimRow(row = {}) {
  const payload = row.request_payload && typeof row.request_payload === 'object'
    ? row.request_payload
    : {}
  const header = payload.header && typeof payload.header === 'object' ? payload.header : {}
  return {
    request_id: String(row.request_id || ''),
    prima_nota_id: String(row.prima_nota_id || ''),
    created_at: String(row.created_at || ''),
    source_module: String(payload.source_module || ''),
    contract_kind: String(row.contract_kind || payload.contract_kind || ''),
    motivazione: String(payload.reason || payload.motivazione || ''),
    descrizione: String(header.descrizione || ''),
    numero_documento: String(header.numero_documento || ''),
    data_registrazione: String(header.data_registrazione || ''),
  }
}

export default async function handler(req, res) {
  if (!isIsolatedStudioEnvironment()
    || !String(process.env.VITE_SUPABASE_URL || '').trim()
    || process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED !== 'true') {
    return res.status(503).json({ error: 'FISCAL_JOURNAL_LAB_ONLY_DISABLED' })
  }
  const ctx = await requireApiAuth(req, res, { methods: 'GET, OPTIONS', roles: ['owner', 'admin'] })
  if (!ctx) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })

  const plan = parseFiscalJournalHistoryQuery(req.query || {})
  if (!plan) return res.status(400).json({ error: 'FISCAL_HISTORY_QUERY_INVALID' })
  if (!scopedCompanyIds(ctx).includes(plan.societa_id)) {
    return res.status(403).json({ error: 'SOCIETA_NON_AUTORIZZATA' })
  }

  try {
    const db = await getSupabaseAdmin()
    // Fetch a buffer then filter by source_module (JSONB path filters vary by PostgREST).
    const fetchLimit = Math.min(plan.limit * 4, 400)
    const { data, error } = await db
      .from('fiscosim_fiscal_journal_claim')
      .select('request_id, prima_nota_id, created_at, contract_kind, request_payload')
      .eq('societa_id', plan.societa_id)
      .order('created_at', { ascending: false })
      .limit(fetchLimit)
    if (error) throw error

    const rows = (Array.isArray(data) ? data : [])
      .map(mapClaimRow)
      .filter((row) => row.source_module === plan.source_module)
      .slice(0, plan.limit)

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      societa_id: plan.societa_id,
      source_module: plan.source_module,
      count: rows.length,
      rows,
    })
  } catch (error) {
    console.error('Isolated fiscal journal history rejected', { code: error?.code || 'UNKNOWN' })
    return res.status(503).json({ error: 'FISCAL_HISTORY_UNAVAILABLE' })
  }
}
