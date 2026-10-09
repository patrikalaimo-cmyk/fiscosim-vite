import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const sql=readFileSync(new URL('../sql/security_p0/53_accounting_cycle_inventory_READ_ONLY.sql',import.meta.url),'utf8')
const report=readFileSync(new URL('../REPORT/FISCOSIM_REAL_ACCOUNTING_CYCLE_GATE_20261009.md',import.meta.url),'utf8')

test('Accounting cycle preflight can only read PostgreSQL metadata, never post a journal',()=>{
 assert.match(sql,/^BEGIN READ ONLY;/m)
 assert.match(sql,/^ROLLBACK;/m)
 assert.doesNotMatch(sql,/^COMMIT;/m)
 assert.match(sql,/local-canonical-accounting-inventory-readonly/)
 assert.match(sql,/ACCOUNTING_REAL_CYCLE\|NOT_TESTED_BY_PREFLIGHT/)
 for(const marker of ['ACCT_TABLE','ACCT_FIELD','ACCT_FUNCTION','pg_catalog.pg_class','pg_catalog.pg_attribute','pg_catalog.pg_proc']){
  assert.ok(sql.includes(marker),marker)
 }
 const stripped=sql.replace(/--[^\n]*/g,'')
 assert.doesNotMatch(stripped,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|CREATE|ALTER|GRANT|REVOKE|COPY|EXECUTE)\s+(?:INTO|FROM|TABLE|FUNCTION|SCHEMA|DATABASE|ROLE|POLICY|SEQUENCE|INDEX|VIEW|PUBLIC|ALL)\b/i)
 assert.doesNotMatch(stripped,/\bpg_sleep\s*\(/i)
})

test('Accounting E2E report cannot misrepresent safe Node tests as PostgreSQL posting',()=>{
 for(const marker of [
  'Stage3Q/R/S','GATE 0','GATE 1','GATE 2','GATE 3','GATE 4',
  'GATE 5','GATE 6','GATE 7','GATE 8',
  'NOT_EXECUTED','BLOCKED','NOT_IMPLEMENTED','NOT_FREEZE',
  'All safe 1150','Manuale 414','Bank 11','Import 231',
  'nessuna scrittura su un database reale',
 ]){
  assert.ok(report.includes(marker),marker)
 }
 assert.match(report,/GATE 0–8:[^\n]*NOT_EXECUTED/)
 assert.match(report,/BANK REAL COMMIT:[^\n]*BLOCKED/)
 assert.match(report,/RILASCIO A100:[^\n]*BLOCKED/)
})
