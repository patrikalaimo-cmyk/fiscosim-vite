import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const dir=new URL('../sql/security_p0/',import.meta.url)
const read=name=>readFileSync(new URL(name,dir),'utf8')
test('P0 helper fix is local opt-in, narrow caller-bound and guard-checked',()=>{
 const sql=read('10_role_helpers_recursion_LAB_ONLY.sql')
 assert.match(sql,/p0-local-only-rls-recursion/)
 assert.match(sql,/current_utente_ruolo\(\) SECURITY DEFINER/)
 assert.match(sql,/current_utente_studio_id\(\) SECURITY DEFINER/)
 assert.match(sql,/SET search_path = pg_catalog;/)
 assert.match(sql,/REVOKE EXECUTE.*current_utente_ruolo\(\).*PUBLIC, anon/)
 assert.match(sql,/REVOKE EXECUTE.*current_utente_studio_id\(\).*PUBLIC, anon/)
 assert.match(sql,/proowner::regrole::text='postgres'/)
 assert.match(sql,/^COMMIT;/m)
 assert.doesNotMatch(sql,/\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/)
})
test('P0 role helper fixture exercises authenticated RLS with rollback',()=>{
 const sql=read('11_role_helpers_test_TEST_ONLY.sql')
 assert.match(sql,/SET LOCAL ROLE authenticated/)
 assert.match(sql,/current_utente_ruolo\(\)/)
 assert.match(sql,/current_utente_studio_id\(\)/)
 assert.match(sql,/user_has_societa_access/)
 assert.match(sql,/FROM public\.utenti_studio/)
 assert.match(sql,/^ROLLBACK;/m)
})
test('P0 rollback remains explicitly gated and unsafe',()=>{
 const sql=read('12_role_helpers_rollback_TEST_ONLY.sql')
 assert.match(sql,/p0-lab-rollback-only/)
 assert.match(sql,/SECURITY INVOKER/)
 assert.match(sql,/RESET search_path/)
})
