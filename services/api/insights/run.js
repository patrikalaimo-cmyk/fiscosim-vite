import { getSupabaseAdmin } from '../../lib/db.js'
import { runProactiveInsightEngine } from '../../services/proactiveInsightEngine.js'

export async function insightsRunHandler({ societaId, log }) {
  if (!societaId) {
    return { status: 400, json: { error: 'societaId richiesto' } }
  }

  const db = await getSupabaseAdmin()
  const out = await runProactiveInsightEngine(db, {
    societaId,
    log: (e, p) => log?.(e, p || ''),
  })

  if (!out.ok) {
    return {
      status: 500,
      json: {
        error: 'Persistenza insight fallita (vedi byTipo)',
        ...out,
      },
    }
  }

  return { status: 200, json: out }
}
