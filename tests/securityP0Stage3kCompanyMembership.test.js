import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = name => readFileSync(new URL('../sql/security_p0/' + name, import.meta.url), 'utf8')
const patch = read('31_stage3k_explicit_company_membership_LAB_ONLY.sql')
const qa = read('32_stage3k_company_membership_TEST_ONLY.sql')
const rollback = read('33_stage3k_rollback_TEST_ONLY.sql')

test('P0 Stage3K owner/admin require explicit active company membership', () => {
 for (const input of [
   'local-explicit-company-memberships-only',
   'CREATE OR REPLACE FUNCTION public.user_has_societa_access',
   'SECURITY INVOKER',
   'us.attivo IS TRUE',
   'uss.societa_id = target_societa',
   'us.auth_user_id = requester',
   'uss.auth_user_id = requester',
   'SET search_path = pg_catalog',
   'Stage3K requires Stage3J legacy quarantine',
   'COMMIT;'
 ]) assert.ok(patch.includes(input), input)
 assert.doesNotMatch(patch, /IF\s+user_role\s+IN\s*\(\s*'owner'/i)
 assert.doesNotMatch(patch, /GRANT\s+ALL\s+PRIVILEGES/i)
 assert.doesNotMatch(patch, /INSERT\s+INTO\s+public\./i)
 assert.doesNotMatch(patch, /UPDATE\s+public\./i)
 assert.doesNotMatch(patch, /DELETE\s+FROM\s+public\./i)
})

test('P0 Stage3K matrix covers owner, admin, collaborator, disabled, outsider A/B', () => {
 for (const principal of ['owner','admin','collab','disabled','outsider']) {
  assert.ok(qa.includes('stage3k-' + principal + '@example.invalid'), principal)
 }
 assert.match(qa, /SET LOCAL ROLE authenticated/)
 assert.match(qa, /request\.jwt\.claim\.sub/)
 assert.match(qa, /auth\.users/)
 assert.match(qa, /INSERT INTO public\.utenti_studio_societa/)
 assert.match(qa, /GET DIAGNOSTICS n=ROW_COUNT/)
 assert.match(qa, /SECURITY FAILURE: owner updated company B/)
 assert.match(qa, /SECURITY FAILURE: admin updated company B/)
 assert.match(qa, /ROLLBACK;/)
 assert.doesNotMatch(qa, /\bCOMMIT\s*;/i)
})

test('P0 Stage3K rollback is intentionally unsafe and specifically gated', () => {
 assert.match(rollback, /unsafe-lab-restore-global-company-fallback/)
 assert.match(rollback, /IF user_role IN \('owner','admin'\)/)
 assert.match(rollback, /LAB ONLY/)
})
