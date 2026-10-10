/**
 * LAB-only HTTP facade for Stage3W fiscal atomic commit.
 * Optional Manuale/Import path only when FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED
 * (or VITE_…) is true AND this endpoint is lab-enabled. Default remains createPrimaNotaCompleta.
 */
import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin } from '../../lib/db.js'
import { scopedCompanyIds } from '../../lib/fiscalReadScope.js'
import { isIsolatedStudioEnvironment } from '../../lib/isolatedStudioLab.js'
import { validateFiscalJournalRequest } from '../../lib/fiscalJournalRequest.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export { validateFiscalJournalRequest }

export default async function handler(req, res) {
  if (!isIsolatedStudioEnvironment()
    || !String(process.env.VITE_SUPABASE_URL || '').trim()
    || process.env.FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED !== 'true') {
    return res.status(503).json({ error: 'FISCAL_JOURNAL_LAB_ONLY_DISABLED' })
  }
  const ctx = await requireApiAuth(req, res, { methods: 'POST, OPTIONS', roles: ['owner', 'admin'] })
  if (!ctx) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'JSON_NON_VALIDO' })
  }
  const plan = validateFiscalJournalRequest(body)
  if (!plan) return res.status(400).json({ error: 'FISCAL_PAYLOAD_INVALIDO' })
  if (!scopedCompanyIds(ctx).includes(plan.societa_id)) {
    return res.status(403).json({ error: 'SOCIETA_NON_AUTORIZZATA' })
  }
  try {
    const db = await getSupabaseAdmin()
    const { data, error } = await db.rpc('fiscosim_post_fiscal_journal', {
      p_societa_id: plan.societa_id,
      p_auth_user_id: ctx.user.id,
      p_request_id: plan.request_id,
      p_contract_kind: plan.contract_kind,
      p_source_module: plan.source_module,
      p_header: plan.header,
      p_rows: plan.rows,
      p_vat: plan.vat,
      p_ledger: plan.ledger,
      p_withholding: plan.withholding,
      p_reason: plan.motivazione,
    })
    if (error) throw error
    const id = typeof data === 'string' ? data : data?.prima_nota_id
    if (typeof id !== 'string' || !UUID.test(id)) throw Error('Missing fiscal journal id')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(201).json({ ok: true, id, request_id: plan.request_id, contract_kind: plan.contract_kind })
  } catch (error) {
    console.error('Isolated atomic fiscal journal rejected', { code: error?.code || 'UNKNOWN' })
    return res.status(409).json({ error: 'FISCAL_ATOMIC_POST_FAILED' })
  }
}
