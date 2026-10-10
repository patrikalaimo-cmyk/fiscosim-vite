import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const sql=readFileSync(new URL('../sql/security_p0/13_stage3b_two_companies_TEST_ONLY.sql',import.meta.url),'utf8')
test('stage3B fixture tests positive and negative tenants without committed data',()=>{
 assert.match(sql,/^BEGIN;/m)
 assert.match(sql,/^ROLLBACK;/m)
 assert.doesNotMatch(sql,/^COMMIT;/m)
 assert.match(sql,/fiscosim\.p0_stage3b_test_approval/)
 assert.match(sql,/SET LOCAL ROLE authenticated;/)
 assert.match(sql,/auth\.uid\(\) IS DISTINCT FROM/)
 assert.match(sql,/public\.user_has_societa_access\(a\)/)
 assert.match(sql,/public\.user_has_societa_access\(b\)/)
 assert.match(sql,/GET DIAGNOSTICS affected=ROW_COUNT/)
 assert.match(sql,/WHEN insufficient_privilege/)
 for(const table of ['corrispettivi_giornalieri','intrastat_operazioni','liquidazioni_iva_societa','ritenute_dacconto']){
  assert.ok(sql.includes('INSERT INTO public.'+table))
 }
 assert.match(sql,/INSERT INTO auth\.users/)
 assert.match(sql,/INSERT INTO public\.utenti_studio_societa/)
 assert.doesNotMatch(sql,/DELETE FROM|TRUNCATE|DROP TABLE/i)
})
