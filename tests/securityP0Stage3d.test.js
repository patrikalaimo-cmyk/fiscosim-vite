import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const base=new URL('../sql/security_p0/',import.meta.url)
const read=name=>readFileSync(new URL(name,base),'utf8')
const patch=read('17_stage3d_six_role_bypass_LAB_ONLY.sql')
const qa=read('18_stage3d_role_matrix_TEST_ONLY.sql')
const rollback=read('19_stage3d_rollback_TEST_ONLY.sql')
const policies=[
 ['adempimenti_clienti','allow_all_adempimenti_clienti'],
 ['adempimenti_template','allow_all_adempimenti'],
 ['deleghe_uniche','allow_all_deleghe'],
 ['impostazioni_studio','allow_all'],
 ['impostazioni_studio','allow_all_impostazioni'],
 ['invii_schedulati','allow_all_invii'],
 ['richieste_fatture','allow_all_richieste_fatture'],
]
test('Stage3D requires Stage3C, checks 4 replacement policies and 6-table RLS',()=>{
 assert.match(patch,/^BEGIN;/m)
 assert.match(patch,/^COMMIT;/m)
 assert.match(patch,/local-six-role-gates-only/)
 assert.match(patch,/Stage3C is not installed/)
 assert.match(patch,/n<>4/)
 for(const [table,policy] of policies){
  assert.ok(patch.includes('DROP POLICY '+policy+' ON public.'+table+';'),table)
 }
 assert.equal((patch.match(/^DROP POLICY /gm)||[]).length,7)
 assert.doesNotMatch(patch,/\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DROP SCHEMA)\b/i)
})
test('Stage3D role tests use synthetic identities and rollback, never COMMIT',()=>{
 assert.match(qa,/^BEGIN;/m)
 assert.match(qa,/^ROLLBACK;/m)
 assert.doesNotMatch(qa,/^COMMIT;/m)
 assert.match(qa,/local-role-matrix-fixtures-only/)
 assert.match(qa,/SET LOCAL ROLE authenticated/)
 for(const name of ['Owner','Admin','collaborator','outsider']){
  assert.ok(qa.includes('PASS: '+name),name)
 }
 assert.match(qa,/WHEN insufficient_privilege THEN/)
 assert.match(qa,/GET DIAGNOSTICS n=ROW_COUNT/)
 assert.match(qa,/INSERT INTO auth\.users/)
 assert.match(qa,/INSERT INTO public\.utenti_studio/)
})
test('Stage3D unsafe rollback is opt-in and restores only seven guarded policies',()=>{
 assert.match(rollback,/unsafe-local-rollback-only/)
 assert.match(rollback,/^BEGIN;/m)
 assert.match(rollback,/^COMMIT;/m)
 assert.equal((rollback.match(/^CREATE POLICY /gm)||[]).length,7)
 assert.doesNotMatch(rollback,/\b(?:DELETE FROM|TRUNCATE|DROP TABLE)\b/i)
})
