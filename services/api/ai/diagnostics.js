import { runAiDiagnostics, startLocalAi } from '../../../services/aiDiagnosticsService.js'

export async function diagnosticsHandler({ body }) {
  const scope = String(body?.scope || 'all').trim().toLowerCase()
  const data = await runAiDiagnostics({ scope })
  return { status: 200, json: data }
}

export async function startLocalHandler() {
  const allowSpawn = process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  const data = await startLocalAi({ allowSpawn })
  return { status: 200, json: { ok: true, local: data } }
}
