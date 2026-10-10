import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const base=new URL('../sql/security_p0/',import.meta.url)
const read=(name)=>readFileSync(new URL(name,base),'utf8')
const patch=read('20_stage3e_xml_queue_LAB_ONLY.sql')
const qa=read('21_stage3e_xml_queue_TEST_ONLY.sql')
const rollback=read('22_stage3e_rollback_TEST_ONLY.sql')
test('P0 Stage3E is local-only, preserves schema and has scoped XML/queue policies',()=>{
 assert.match(patch,/^BEGIN;/m)
 assert.match(patch,/^COMMIT;/m)
 assert.match(patch,/p0-local-xml-queue-only/)
 assert.match(patch,/Stage3C prerequisite absent/)
 assert.match(patch,/DROP POLICY allow_all_fatture_xml/)
 assert.match(patch,/DROP POLICY allow_all_coda ON/)
 assert.match(patch,/DROP POLICY allow_all_coda_import/)
 assert.match(patch,/CREATE POLICY p0_xml_company_member_all_lab_only/)
 assert.match(patch,/CREATE POLICY p0_import_queue_company_member_all_lab_only/)
 assert.equal((patch.match(/CREATE POLICY /g)||[]).length,2)
 assert.equal((patch.match(/DROP POLICY /g)||[]).length,3)
 assert.match(patch,/societa_id IS NOT NULL AND public\.user_has_societa_access\(societa_id\)/)
 assert.doesNotMatch(patch,/\b(?:DROP TABLE|TRUNCATE TABLE|DELETE FROM|ALTER TABLE)\b/i)
})
test('P0 Stage3E negative/positive SQL fixture is transactional with no persisted test rows',()=>{
 assert.match(qa,/^BEGIN;/m)
 assert.match(qa,/^ROLLBACK;/m)
 assert.doesNotMatch(qa,/^COMMIT;/m)
 assert.match(qa,/p0-local-two-company-fixtures-only/)
 assert.match(qa,/SET LOCAL ROLE authenticated/)
 assert.match(qa,/INSERT INTO public\.societa/)
 assert.match(qa,/INSERT INTO auth\.users/)
 assert.match(qa,/INSERT INTO public\.utenti_studio_societa/)
 assert.match(qa,/INSERT INTO public\.fatture_xml/)
 assert.match(qa,/INSERT INTO public\.coda_import_fatture/)
 assert.match(qa,/WHEN insufficient_privilege THEN NULL/)
 for(const phrase of [
   'PASS: A reads/writes own XML+queue',
   'PASS: B reads only B company XML and queue',
   'PASS: unaffiliated authenticated identity sees no XML or queue',
   'SECURITY FAILURE: null-scope XML INSERT allowed',
   'SECURITY FAILURE: null-scope queue INSERT allowed',
   'SECURITY FAILURE: cross-company XML INSERT allowed',
   'SECURITY FAILURE: cross-company queue INSERT allowed'
 ])assert.ok(qa.includes(phrase),phrase)
})
test('P0 Stage3E rollback is explicit and unsafe for production',()=>{
 assert.match(rollback,/unsafe-p0-lab-rollback-only/)
 assert.match(rollback,/^BEGIN;/m)
 assert.match(rollback,/^COMMIT;/m)
 assert.equal((rollback.match(/CREATE POLICY /g)||[]).length,3)
})
