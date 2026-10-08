import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const folder=new URL('../sql/security_p0/',import.meta.url)
const read=n=>readFileSync(new URL(n,folder),'utf8')
test('Stage3G explicit column grants are guarded and transactional',()=>{
 const sql=read('24_stage3g_staff_secret_acl_LAB_ONLY.sql')
 assert.ok(sql.includes('local-staff-secret-column-only'))
 assert.ok(sql.includes('password_hash'))
 assert.ok(sql.includes('auth_user_id'))
 assert.ok(sql.includes('REVOKE ALL PRIVILEGES'))
 assert.ok(sql.includes('GRANT SELECT ('))
 assert.ok(sql.includes('GRANT UPDATE ('))
 assert.ok(sql.includes('GRANT INSERT ('))
 assert.ok(sql.includes('TRUNCATE'))
 assert.ok(sql.includes('COMMIT;'))
})
test('Stage3G isolated SQL test ends with rollback',()=>{
 const sql=read('25_stage3g_staff_secret_acl_TEST_ONLY.sql')
 assert.ok(sql.includes('local-staff-acl-test-only'))
 assert.ok(sql.includes('SET LOCAL ROLE authenticated'))
 assert.ok(sql.includes('ROLLBACK;'))
})
test('Stage3G rollback cannot run without explicit local approval',()=>{
 const sql=read('26_stage3g_rollback_TEST_ONLY.sql')
 assert.ok(sql.includes('unsafe-p0-lab-revert-staff-acl'))
})
