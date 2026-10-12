/**
 * Browser/Node client for LAB Stage3W fiscal claim history (read-only).
 */

const SOURCE_MODULES = new Set(['import_contabilita', 'riconciliazione_bancaria'])

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

/**
 * @returns {Promise<{ ok: true, rows: object[], count: number } | { ok: false, error: string, status?: number }>}
 */
export async function fetchFiscalJournalCommitHistory({
  societaId,
  sourceModule,
  limit = 50,
  db = null,
  getAccessToken = null,
  accessToken = null,
  fetchImpl = globalThis.fetch,
  apiBase = '',
} = {}) {
  const societa_id = String(societaId || '').trim()
  const source_module = String(sourceModule || '').trim()
  if (!societa_id || !SOURCE_MODULES.has(source_module)) {
    return { ok: false, error: 'FISCAL_HISTORY_QUERY_INVALID' }
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'FISCAL_HISTORY_FETCH_UNAVAILABLE' }
  }

  const token = accessToken || (await resolveAccessToken(getAccessToken, db))
  const params = new URLSearchParams({
    societa_id,
    source_module,
    limit: String(Math.min(Math.max(Number(limit) || 50, 1), 200)),
  })
  const base = String(apiBase || '').replace(/\/$/, '')
  const url = `${base}/api/studio/fiscal-journal-history?${params.toString()}`
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetchImpl(url, { method: 'GET', headers })
  } catch {
    return { ok: false, error: 'FISCAL_HISTORY_NETWORK' }
  }

  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  if (!response.ok) {
    return {
      ok: false,
      error: (json && json.error) || `FISCAL_HISTORY_HTTP_${response.status}`,
      status: response.status,
    }
  }
  const rows = Array.isArray(json?.rows) ? json.rows : []
  return {
    ok: true,
    rows,
    count: Number(json?.count) || rows.length,
    source_module: json?.source_module || source_module,
    societa_id: json?.societa_id || societa_id,
  }
}
