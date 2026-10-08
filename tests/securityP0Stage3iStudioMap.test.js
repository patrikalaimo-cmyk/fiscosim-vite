import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const path = new URL('../sql/security_p0/27_stage3i_studio_mapping_READ_ONLY.sql', import.meta.url)
const sql = readFileSync(path, 'utf8')
test('P0 Stage3I is metadata-only and exposes legacy FK/tenancy catalog', () => {
  for (const value of ['STAGE3I_COLUMN','STAGE3I_RELATION','STAGE3I_POLICY',
    'STAGE3I_ACL','STAGE3I_HELPER','f24_righe','f24_scadenze','liquidazioni_iva',
    'utenti_studio_societa','user_has_societa_access','pg_get_constraintdef',
    'pg_get_functiondef','information_schema.columns','pg_policies']) {
    assert.ok(sql.includes(value), value)
  }
  const body = sql.replace(/--[^\n]*/g, '')
  for (const mutation of [/\bINSERT\s+INTO\b/i, /\bUPDATE\s+[a-z_]/i,
    /\bDELETE\s+FROM\b/i, /\bALTER\s+TABLE\b/i, /\bDROP\s+POLICY\b/i,
    /\bGRANT\s+\w/i, /\bREVOKE\s+\w/i, /\bCOMMIT\s*;/i]) {
    assert.doesNotMatch(body,mutation)
  }
})
