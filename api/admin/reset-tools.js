import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin } from '../../lib/db.js'
import { writeAdminResetAuditSafe } from '../../services/adminReset/resetAuditRepo.js'
import { runAdminReset } from '../../services/adminReset/index.js'
import { runTestScenarioHandler } from '../../services/api/admin/run-test-scenario.js'

export const config = {
  api: { bodyParser: true },
  maxDuration: 60,
}

export default async function handler(req, res) {
  const ctx = await requireApiAuth(req, res, { methods: 'POST, OPTIONS', roles: ['owner', 'admin'] })
  if (!ctx) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    let body = req.body || {}
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body)
      } catch (error) {
        const db = await getSupabaseAdmin().catch(() => null)
        await writeAdminResetAuditSafe(db, {
          action: 'invalid_json',
          auth: ctx,
          societaId: '',
          scopeType: null,
          scopeId: null,
          dryRun: true,
          status: 'error',
          touchedCount: 0,
          blockedCount: 0,
          skippedCount: 0,
          resultSummary: 'Body JSON non valido per admin reset tools',
          payload: {
            rawBody: req.body,
            error: error?.message || String(error),
          },
        })
        return res.status(400).json({
          ok: false,
          status: 'error',
          error: 'Body JSON non valido',
        })
      }
    }
    const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : ''
    if (action === 'run_test_scenario') {
      const result = await runTestScenarioHandler({ body, auth: ctx })
      return res.status(result.status).json(result.json)
    }

    const result = await runAdminReset({ body, auth: ctx })
    return res.status(200).json(result)
  } catch (error) {
    const message = error?.message || 'Reset admin non riuscito'
    const status =
      String(error?.code || '').startsWith('FORBIDDEN')
        ? 403
        : /non valido|obbligatoria|obbligatorio|supportata/i.test(message)
          ? 400
          : 500
    return res.status(status).json({
      ok: false,
      status: 'error',
      error: message,
    })
  }
}
