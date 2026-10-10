/**
 * Browser/Node client for LAB Stage3W HTTP facade.
 * Does not embed the PostgreSQL RPC name (keeps persistPrimaNotaDraft CI clean).
 */
import { apiFetch } from '../../../../lib/auth.js'

export async function postFiscalJournalAtomicViaStudioApi(body) {
  const response = await apiFetch('/api/studio/fiscal-journal-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
