import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('P0 residual audit reads only metadata, no DDL and no business rows', () => {
  const source = readFileSync(new URL('../sql/security_p0/04_residuals_READ_ONLY.sql', import.meta.url), 'utf8')
  const sql = source.replace(/--[^\n]*/g, '').trim()
  const withoutLiterals = sql.replace(/'(?:''|[^'])*'/g, "''")
  assert.match(sql, /^SELECT\s+/i)
  assert.equal((sql.match(/;\s*$/g) || []).length, 1)
  assert.doesNotMatch(withoutLiterals, /\b(?:ALTER|DROP|REVOKE|GRANT|DELETE|INSERT|UPDATE|TRUNCATE|COPY|CALL)\b/i)
  assert.doesNotMatch(withoutLiterals, /(?:FROM|JOIN)\s+(?:public\.|auth\.|storage\.)/i)
  for (const gate of [
    'P0_ANON_SECURITY_DEFINER_RPC',
    'P0_ANON_TRUE_POLICY_TABLES',
    'RESIDUAL_ANON_VIEW_SELECT',
    'RESIDUAL_AUTH_VIEW_SELECT',
    'RESIDUAL_DEFINER_VIEWS',
    'RESIDUAL_TABLES_RLS_DISABLED',
    'RESIDUAL_AUTH_RLS_DISABLED_SELECT',
    'RESIDUAL_AUTH_TRUE_POLICY_TABLES'
  ]) {
    assert.ok(sql.includes(gate), gate)
  }
})
