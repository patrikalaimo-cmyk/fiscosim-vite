import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const sql=readFileSync(new URL('../sql/security_p0/23_stage3f_role_only_READ_ONLY.sql', import.meta.url),'utf8')
const report=readFileSync(new URL('../REPORT/FISCOSIM_STAGE3F_RISK_MAP.md', import.meta.url),'utf8')

test('Stage3F audit inspects additional role-only and sensitive data metadata',()=>{
 for(const x of [
  'RISK_ROLE_ONLY_AUTHENTICATED_TABLES',
  'RISK_TRUE_POLICY_AUTH_TABLES',
  'RISK_NULLABLE_LEGACY_FISCAL_STUDIO_IDS',
  'RISK_AUTH_CAN_SELECT_STAFF_PASSWORD_HASH',
  'RISK_OWNER_ADMIN_GLOBAL_COMPANY_FALLBACK',
  'ROLE_ONLY_AUTH',
  'TRUE_AUTH',
  'NULLABLE_STUDIO_ID'
 ]) assert.ok(sql.includes(x),x)
 assert.match(sql,/auth\[.\]role\[\(\]\[\)\]/)
 assert.match(sql,/has_column_privilege\('authenticated','public\.utenti_studio','password_hash','SELECT'\)/)
 assert.match(sql,/pg_policies/)
 assert.match(sql,/information_schema\.columns/)
 for(const dml of [/\bDELETE\s+FROM\b/i,/\bDROP\s+POLICY\b/i,/\bALTER\s+TABLE\b/i,/\bINSERT\s+INTO\b/i,/\bUPDATE\s+public[.]/i,/\bCOMMIT\s*;/i]) {
  assert.doesNotMatch(sql.replace(/--[^\n]*/g,''),dml)
 }
})
test('Stage3F risk map guards against false closure from eight TRUE-policy metric',()=>{
 for(const x of [
  'f24_righe', 'f24_scadenze', 'liquidazioni_iva', 'revisioni_dichiarativi',
  'invii_log','test_cases','test_datasets','test_runs',
  'studios', 'clients', 'password_hash',
  'auth.role()', 'non', 'E2E', 'NULL'
 ])assert.ok(report.includes(x),x)
})
