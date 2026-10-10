import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL('../sql/security_p0/05_stage2_views_rls_LAB_ONLY.sql',import.meta.url),'utf8')
const rollback = readFileSync(new URL('../sql/security_p0/06_stage2_rollback_TEST_ONLY.sql',import.meta.url),'utf8')
test('P0 stage2 is opt-in and scoped to exact 5 views / 4 legacy tables',()=>{
 assert.match(sql,/^BEGIN;/m)
 assert.match(sql,/^COMMIT;/m)
 assert.match(sql,/fiscosim\.p0_stage2_lab_approval/)
 assert.match(sql,/local-only-views-rls/)
 assert.match(sql,/table count %/)
 for (const view of ['v_accounting_entry_righe','mastrini','bilancio_stato_patrimoniale','bilancio_conto_economico','bilancio']) {
   assert.ok(sql.includes('ALTER VIEW public.'+view+' SET (security_invoker = true);'))
 }
 for (const table of ['ai_feedback_log','ai_learning','partitari','test_scenarios']){
   assert.ok(sql.includes('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY;'))
 }
 assert.match(sql,/REVOKE SELECT ON TABLE[\s\S]*?FROM PUBLIC, anon, authenticated;/)
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE TABLE|DELETE FROM|UPDATE public\./i)
})
test('P0 stage2 rollback explicitly restores insecure state only for test',()=>{
 assert.match(rollback,/fiscosim\.p0_stage2_lab_rollback_approval/)
 assert.match(rollback,/local-test-rollback-only/)
 assert.match(rollback,/RESET \(security_invoker\)/)
 assert.match(rollback,/DISABLE ROW LEVEL SECURITY/)
})
