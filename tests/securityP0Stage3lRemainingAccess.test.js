import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../sql/security_p0/34_stage3l_remaining_access_READ_ONLY.sql',import.meta.url),
  'utf8'
)
const source = sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n')

test('Stage 3L examines the eight remaining exposed tables',()=>{
 for (const table of [
   'avvisi_ade','client_modules','client_responsabili','invii_log',
   'revisioni_dichiarativi','test_cases','test_datasets','test_runs'
 ]) assert.ok(sql.includes("'" + table + "'"),table)
 for (const catalog of [
   'pg_policies','pg_constraint','information_schema.columns',
   'information_schema.role_table_grants','pg_indexes','has_table_privilege'
 ]) assert.ok(sql.includes(catalog),catalog)
 for (const marker of ['3L_TABLE','3L_COLUMN','3L_FK','3L_POLICY','3L_GRANT','3L_INDEX'])
  assert.ok(sql.includes(marker),marker)
})

test('Stage 3L stays readonly without any DML/DDL',()=>{
 for (const mutation of [
  /\bINSERT\s+INTO\b/i, /\bUPDATE\s+(?:public[.]|[a-z_]+\s+SET)/i,
  /\bDELETE\s+FROM\b/i, /\bALTER\s+TABLE\b/i, /\bCREATE\s+(?:TABLE|POLICY|FUNCTION)\b/i,
  /\bDROP\s+(?:TABLE|POLICY|FUNCTION)\b/i, /\bREVOKE\s+(?:ALL|SELECT|INSERT|UPDATE)/i,
  /\bGRANT\s+(?:ALL|SELECT|INSERT|UPDATE)/i, /\bCOMMIT\s*;/i
 ]) assert.doesNotMatch(source,mutation)
})
