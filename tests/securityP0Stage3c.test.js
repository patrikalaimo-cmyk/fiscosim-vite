import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const path=new URL('../sql/security_p0/',import.meta.url)
const read=name=>readFileSync(new URL(name,path),'utf8')
test('Stage3C local patch is gated and removes staff public access and user roles recursion',()=>{
 const sql=read('14_stage3c_staff_roles_LAB_ONLY.sql')
 assert.match(sql,/^BEGIN;/m)
 assert.match(sql,/^COMMIT;/m)
 assert.match(sql,/fiscosim\.p0_stage3c_approval/)
 assert.match(sql,/DROP POLICY public_access ON public\.utenti_studio/)
 assert.match(sql,/DROP POLICY "Lettura autenticati" ON public\.user_roles/)
 assert.match(sql,/DROP POLICY "Gestione solo owner" ON public\.user_roles/)
 assert.match(sql,/CREATE POLICY p0_user_roles_self_owner_select_lab_only/)
 assert.match(sql,/CREATE POLICY p0_user_roles_owner_manage_lab_only/)
 assert.match(sql,/user_id = \(SELECT auth\.uid\(\)\)/)
 assert.match(sql,/current_utente_ruolo\(\) = 'owner'/)
 assert.doesNotMatch(sql,/\bDROP TABLE\b|\bTRUNCATE TABLE\b|\bDELETE FROM\b/i)
})
test('Stage3C integration fixture checks owner admin collaborator and rollback',()=>{
 const sql=read('15_stage3c_staff_roles_TEST_ONLY.sql')
 for(const x of ['owner can read/manage','admin reads staff/roles','collaborator sees own profile/role']){
  assert.ok(sql.includes(x),x)
 }
 assert.match(sql,/SET LOCAL ROLE authenticated/)
 assert.match(sql,/INSERT INTO auth\.users/)
 assert.match(sql,/INSERT INTO public\.utenti_studio/)
 assert.match(sql,/INSERT INTO public\.user_roles/)
 assert.match(sql,/^ROLLBACK;/m)
 assert.doesNotMatch(sql,/^COMMIT;/m)
})
test('Stage3C unsafe rollback is protected by a unique lab approval',()=>{
 const sql=read('16_stage3c_rollback_TEST_ONLY.sql')
 assert.match(sql,/fiscosim\.p0_stage3c_rollback_approval/)
 assert.match(sql,/unsafe-lab-rollback-only/)
})
