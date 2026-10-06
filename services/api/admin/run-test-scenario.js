import { getSupabaseAdmin } from '../../../lib/db.js'
import { assertSocietaAccess } from '../../../lib/authorization.js'
import { runTestScenario } from '../../../services/testScenarioEngine.js'

export async function runTestScenarioHandler({ body, auth }) {
  try {
    const scenarioId = body?.scenarioId
    const societaId = body?.societaId
    const xmlText = body?.xmlText != null ? String(body.xmlText) : ''
    const filename = body?.filename || 'fattura.xml'
    const pipelineOptions = body?.pipelineOptions && typeof body.pipelineOptions === 'object' ? body.pipelineOptions : {}
    let xmlBatch = undefined
    if (Array.isArray(body?.xmlBatch)) {
      xmlBatch = body.xmlBatch.map((x) => ({
        xmlText: x?.xmlText != null ? String(x.xmlText) : '',
        filename: x?.filename || 'fattura.xml',
      }))
    }

    if (!scenarioId) return { status: 400, json: { error: 'scenarioId richiesto' } }
    if (!societaId) return { status: 400, json: { error: 'societaId richiesto' } }
    const authUserId = String(auth?.user?.id || '').trim()
    if (!authUserId) return { status: 401, json: { error: 'Utente non autenticato' } }
    try {
      await assertSocietaAccess({ authUserId, societaId })
    } catch (e) {
      if (String(e?.code || '').startsWith('FORBIDDEN')) {
        return { status: 403, json: { error: e?.message || 'Accesso non autorizzato alla società' } }
      }
      throw e
    }

    const db = await getSupabaseAdmin()
    const out = await runTestScenario(scenarioId, {
      db,
      societaId,
      xmlText,
      filename,
      xmlBatch,
      pipelineOptions,
      onStep: (event, payload) => console.log(`[test-scenario] ${event}`, payload || ''),
    })

    return { status: 200, json: out }
  } catch (error) {
    console.error('[runTestScenarioHandler]', error)
    return {
      status: 500,
      json: {
        error: error?.message || String(error),
        pass: false,
      },
    }
  }
}
