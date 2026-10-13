/**
 * Browser/Node client for LAB Stage3W HTTP facade.
 * Avoids importing src/lib/auth.js (Node ESM cannot resolve its extensionless
 * supabase import when Import suite loads persistPrimaNotaDraft).
 */

async function resolveAccessToken(getAccessToken, db) {
  if (typeof getAccessToken === 'function') {
    return String((await getAccessToken()) || '')
  }
  if (db?.auth?.getSession) {
    const { data } = await db.auth.getSession()
    return String(data?.session?.access_token || '')
  }
  return ''
}

export async function postFiscalJournalAtomicViaStudioApi(body, {
  db = null,
  getAccessToken = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    const err = new Error('FISCAL_LAB_FETCH_UNAVAILABLE')
    err.code = 'FISCAL_LAB_FETCH_UNAVAILABLE'
    throw err
  }
  const token = await resolveAccessToken(getAccessToken, db)
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetchImpl('/api/studio/fiscal-journal-post', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  if (!response.ok) {
    const err = new Error(
      (json && json.error) || `FISCAL_LAB_HTTP_${response.status}`,
    )
    err.code = (json && json.error) || `FISCAL_LAB_HTTP_${response.status}`
    err.status = response.status
    err.details = json
    throw err
  }
  const id = json?.id
  if (typeof id !== 'string' || !id) {
    const err = new Error('FISCAL_LAB_MISSING_PRIMA_NOTA_ID')
    err.code = 'FISCAL_LAB_MISSING_PRIMA_NOTA_ID'
    throw err
  }
  return { id, request_id: json.request_id, contract_kind: json.contract_kind, raw: json }
}
