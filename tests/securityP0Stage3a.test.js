import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const patch=readFileSync(new URL('../sql/security_p0/07_stage3a_societa_LAB_ONLY.sql',import.meta.url),'utf8')
const qa=readFileSync(new URL('../sql/security_p0/08_stage3a_negative_fixture_TEST_ONLY.sql',import.meta.url),'utf8')
test('Stage 3A is an opt-in four-table transactional candidate',()=>{
 assert.match(patch,/^BEGIN;/m)
 assert.match(patch,/^COMMIT;/m)
 assert.match(patch,/fiscosim\.p0_stage3a_approval/)
 assert.match(patch,/isolated-local-p0-only/)
 assert.match(patch,/user_has_societa_access/)
 for(const t of ['corrispettivi_giornalieri','intrastat_operazioni','liquidazioni_iva_societa','ritenute_dacconto']){
   assert.ok(patch.includes('DROP POLICY "Accesso autenticati" ON public.'+t+';'))
 }
 assert.match(patch,/policy baseline mismatch/)
 assert.doesNotMatch(patch,/\bDROP TABLE\b|\bTRUNCATE TABLE\b|\bDELETE FROM\b/i)
})
test('Stage 3A QA uses synthetic company, real role switch and rolls back',()=>{
 assert.match(qa,/^BEGIN;/m)
 assert.match(qa,/^ROLLBACK;/m)
 assert.match(qa,/SET LOCAL ROLE authenticated/)
 assert.match(qa,/request\.jwt\.claim\.sub/)
 assert.match(qa,/SECURITY FAILURE/)
 assert.match(qa,/fiscosim\.p0_stage3a_test_approval/)
 assert.doesNotMatch(qa,/COMMIT;/)
})

test('Stage 3A policy names match PostgreSQL canonical lowercase catalog names',()=>{
  const policyName='p0_societa_member_all_lab_only'
  const created=[...patch.matchAll(/CREATE POLICY (\w+) ON public\./g)].map(m=>m[1])
  assert.equal(created.length,3)
  for(const name of created){
    assert.equal(name,policyName)
    assert.equal(name,name.toLowerCase())
  }
  assert.ok(patch.includes("policyname='"+policyName+"'"))
  assert.ok(qa.includes("policyname='"+policyName+"'"))
  assert.doesNotMatch(qa,/policyname='[^']*[A-Z][^']*'/)
})
