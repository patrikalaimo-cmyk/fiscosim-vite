import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read=(name)=>readFileSync(
 new URL('../sql/security_p0/' + name, import.meta.url),'utf8'
)
const patch=read('38_stage3n_staff_write_acl_LAB_ONLY.sql')
const qa=read('39_stage3n_staff_write_acl_TEST_ONLY.sql')
const unsafe=read('40_stage3n_staff_write_rollback_TEST_ONLY.sql')

test('Stage3N requires only-server staff writes and retains projected reads',()=>{
 for(const fragment of [
   'local-server-only-staff-writes',
   'REVOKE INSERT (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati)',
   'UPDATE (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati)',
   'FROM authenticated',
   'has_column_privilege',
   "'service_role'",
   "'password_hash'",
   "'SELECT'",
   'COMMIT;',
 ]) assert.ok(patch.includes(fragment),fragment)
 assert.doesNotMatch(patch,/\bUPDATE\s+public[.]/i)
 assert.doesNotMatch(patch,/\bDELETE\s+FROM\s+public[.]/i)
 assert.doesNotMatch(patch,/\bINSERT\s+INTO\s+public[.]/i)
})

test('Stage3N probes authenticated SQL role without persisting staff writes',()=>{
 assert.match(qa,/SET LOCAL ROLE authenticated/)
 assert.match(qa,/LIMIT 0/)
 assert.match(qa,/WHERE false/)
 assert.match(qa,/insufficient_privilege/)
 assert.match(qa,/ROLLBACK;/)
 assert.doesNotMatch(qa,/\bCOMMIT\s*;/i)
})

test('Stage3N unsafe rollback is separately guarded and never automatic',()=>{
 assert.match(unsafe,/unsafe-restore-browser-staff-column-writes/)
 assert.match(unsafe,/GRANT INSERT/)
 assert.match(unsafe,/TO authenticated/)
 assert.match(unsafe,/NEVER run on production/)
})

test('Stage3N runner pins actual Git HEAD and checks SQL exit status',()=>{
 const runner=readFileSync(new URL('../scripts/security_p0/run-stage3n.ps1',import.meta.url),'utf8')
 for(const snippet of [
  '$ExpectedCommit','rev-parse HEAD',
  'Stage3N: refusing unexpected container',
  '$code=$LASTEXITCODE',
  "($apply -contains 'COMMIT')",
  "($test -contains 'ROLLBACK')",
  'STAGE3N LAB SQL PASS',
  'RISK_ROLE_ONLY_AUTHENTICATED_TABLES|1',
  'RISK_TRUE_POLICY_AUTH_TABLES|1'
 ]) assert.ok(runner.includes(snippet),snippet)
 assert.ok(!runner.includes('Tee-Object'))
})

test('Stage3N patch can be rerun safely on an already-hardened LAB database',()=>{
 assert.match(patch,/already-applied Stage3N/)
 assert.match(patch,/IS DISTINCT FROM/)
 assert.match(patch,/Stage3N inconsistent staff ACL: partial prior patch/)
 assert.match(patch,/FOREACH op IN ARRAY ARRAY\['INSERT','UPDATE'\]/)
 assert.match(patch,/has_column_privilege\('authenticated'/)
 assert.match(patch,/REVOKE INSERT/)
 assert.match(patch,/COMMIT;/)
})

test('Stage3N diagnostic runner must preserve earlier PASS evidence',()=>{
 const runner=readFileSync(new URL('../scripts/security_p0/run-stage3n.ps1',import.meta.url),'utf8')
 assert.match(runner,/Test-Path -LiteralPath \$report/)
 assert.match(runner,/STAGE3N_RECHECK_/)
 assert.match(runner,/report name collision/)
 assert.match(runner,/git -C \$repo rev-parse HEAD/)
})
