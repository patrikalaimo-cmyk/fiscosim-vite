/**
 * Thin LAB helper: map a chiusura/riapertura plan to Stage3U general-journal body
 * or RPC args. Does not enable LIVE posting.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function money(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return Math.round(v * 100) / 100
}

/** Map a close/reopen plan to Stage3U HTTP body. */
export function mapPlanToGeneralJournalRequest(plan, { societaId, requestId, motivazione } = {}) {
  if (!plan?.header || !Array.isArray(plan.rows) || plan.rows.length < 2) return null
  if (!UUID.test(String(societaId || '')) || !UUID.test(String(requestId || ''))) return null
  const reason = String(motivazione || '').trim()
  if (reason.length < 12 || reason.length > 500) return null
  const rows = []
  for (const r of plan.rows) {
    const dare = money(r.dare)
    const avere = money(r.avere)
    if (!UUID.test(String(r.conto_id || '')) || dare == null || avere == null) return null
    const row = { conto_id: r.conto_id, dare, avere }
    if (r.descrizione != null) row.descrizione = String(r.descrizione).slice(0, 500)
    rows.push(row)
  }
  const header = {
    data_registrazione: String(plan.header.data_registrazione || ''),
    descrizione: String(plan.header.descrizione || '').trim(),
  }
  if (plan.header.causale_id) header.causale_id = plan.header.causale_id
  return {
    societa_id: societaId,
    request_id: requestId,
    header,
    rows,
    motivazione: reason,
  }
}

/**
 * RPC args for fiscosim_post_general_journal (LAB docker / service_role).
 */
export function mapPlanToGeneralJournalRpcArgs(plan, {
  societaId, authUserId, requestId, motivazione,
} = {}) {
  const body = mapPlanToGeneralJournalRequest(plan, { societaId, requestId, motivazione })
  if (!body || !UUID.test(String(authUserId || ''))) return null
  return {
    p_societa_id: body.societa_id,
    p_auth_user_id: authUserId,
    p_request_id: body.request_id,
    p_header: body.header,
    p_rows: body.rows,
    p_reason: body.motivazione,
  }
}

/**
 * Optional HTTP POST to /api/studio/general-journal-post (LAB flag required on server).
 */
export async function postGeneralJournalLabHttp({
  apiUrl,
  token,
  body,
  fetchImpl = globalThis.fetch,
} = {}) {
  const origin = String(apiUrl || '').replace(/\/$/, '')
  const res = await fetchImpl(origin + '/api/studio/general-journal-post', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* keep */ }
  return { status: res.status, json, text }
}
