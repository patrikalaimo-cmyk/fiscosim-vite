export async function insertAdminResetAudit(db, {
  action,
  auth,
  societaId = '',
  scopeType = '',
  scopeId = '',
  dryRun = true,
  status = 'ok',
  touchedCount = 0,
  blockedCount = 0,
  skippedCount = 0,
  resultSummary = '',
  payload = {},
}) {
  const profile = auth?.profile || {}
  let payloadJson = {}
  try {
    payloadJson = JSON.parse(JSON.stringify(payload ?? {}))
  } catch {
    payloadJson = { error: 'payload_json_serialize_failed' }
  }
  const record = {
    performed_by: profile?.id || null,
    role: profile?.ruolo || null,
    societa_id: societaId || null,
    action,
    scope_type: scopeType || null,
    scope_id: scopeId || null,
    dry_run: Boolean(dryRun),
    status,
    touched_count: Number(touchedCount || 0),
    blocked_count: Number(blockedCount || 0),
    skipped_count: Number(skippedCount || 0),
    result_summary: String(resultSummary || ''),
    payload_json: payloadJson,
  }
  return db.from('admin_reset_operations').insert([record]).select('id').maybeSingle()
}

export async function writeAdminResetAuditSafe(db, payload) {
  if (!db) {
    console.error('[adminReset:audit]', {
      event: 'audit_db_unavailable',
      action: payload?.action || null,
      status: payload?.status || null,
      scopeType: payload?.scopeType || null,
      scopeId: payload?.scopeId || null,
      societaId: payload?.societaId || null,
      dryRun: payload?.dryRun ?? null,
      resultSummary: payload?.resultSummary || '',
    })
    return { data: null, error: new Error('audit_db_unavailable') }
  }

  try {
    return await insertAdminResetAudit(db, payload)
  } catch (error) {
    console.error('[adminReset:audit]', {
      event: 'audit_insert_failed',
      action: payload?.action || null,
      status: payload?.status || null,
      scopeType: payload?.scopeType || null,
      scopeId: payload?.scopeId || null,
      societaId: payload?.societaId || null,
      dryRun: payload?.dryRun ?? null,
      resultSummary: payload?.resultSummary || '',
      error: error?.message || String(error),
    })
    return { data: null, error }
  }
}
