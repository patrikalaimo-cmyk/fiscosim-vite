import { normalizeSocietaIds } from './authMembership.js'

// CRM-client -> accounting-company ownership is explicit and externally
// audited. An arbitrary client UUID supplied by the browser is never proof
// of a valid assignment. This helper works ONLY with server-fetched links.
export function normalizeClienteIds(values) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))]
}

export function scopedClienteIds(requestedClientIds, linkRows, assignedCompanyIds) {
  const ids = normalizeClienteIds(requestedClientIds)
  const allowedCompanies = new Set(normalizeSocietaIds(assignedCompanyIds))
  if (!ids.length || !allowedCompanies.size) return []
  const mapped = new Set()
  for (const link of Array.isArray(linkRows) ? linkRows : []) {
    if (allowedCompanies.has(String(link?.societa_id || '').trim())) {
      mapped.add(String(link?.cliente_id || '').trim())
    }
  }
  return ids.filter((id) => mapped.has(id))
}

export function areClienteAssignmentsWithinScope(clientIds, linkRows, companyIds) {
  const requested = normalizeClienteIds(clientIds)
  if (!requested.length) return true
  return scopedClienteIds(requested, linkRows, companyIds).length === requested.length
}

export async function loadClientCompanyLinks(admin, clientIds) {
  const ids = normalizeClienteIds(clientIds)
  if (!ids.length) return []
  // Chunk requests to avoid exceeding PostgREST URL limits in larger studios.
  const result = []
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await admin
      .from('crm_cliente_societa_link')
      .select('cliente_id,societa_id')
      .in('cliente_id', ids.slice(i, i + 80))
    if (error) throw error
    result.push(...(Array.isArray(data) ? data : []))
  }
  return result
}
