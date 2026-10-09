import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const migration=read('sql/security_p0/54_stage3u_general_journal_atomic_LAB_ONLY.sql')
const matrix=read('sql/security_p0/55_stage3u_general_journal_matrix_TEST_ONLY.sql')
const runner=read('scripts/security_p0/run-stage3u-rehearsal-rollback.ps1')
const workflow=read('.github/workflows/fiscosim-test-baseline.yml')

test('Stage3U rehearsal SQL has exactly one strict transaction wrapper per file',()=>{
 assert.equal((migration.match(/^BEGIN;\s*$/gm)||[]).length,1)
 assert.equal((migration.match(/^COMMIT;\s*$/gm)||[]).length,1)
 assert.equal((matrix.match(/^BEGIN;\s*$/gm)||[]).length,1)
 assert.equal((matrix.match(/^ROLLBACK;\s*$/gm)||[]).length,1)
 const unwrap=(input,last)=>input.replace(/^BEGIN;\r?\n/m,'')
  .replace(new RegExp('^'+last+';\\s*$','m'),'')
 const combined='BEGIN;\n'+unwrap(migration,'COMMIT')+'\n'+unwrap(matrix,'ROLLBACK')+'\nROLLBACK;'
 assert.equal((combined.match(/^BEGIN;\s*$/gm)||[]).length,1)
 assert.equal((combined.match(/^ROLLBACK;\s*$/gm)||[]).length,1)
 assert.doesNotMatch(combined,/^COMMIT;\s*$/gm)
 assert.ok(combined.indexOf('CREATE FUNCTION public.fiscosim_post_general_journal')<
  combined.indexOf('DO $test$'))
})

test('Stage3U runner preserves evidence and verifies BOTH rollback and no persisted SQL artifacts',()=>{
 for(const marker of [
  'ExpectedCommit','rev-parse HEAD','supabase_db_FiscoSim-P0-LAB-20261008-164658',
  'Unwrap-PinnedSql','54_stage3u_general_journal_atomic_LAB_ONLY.sql',
  '55_stage3u_general_journal_matrix_TEST_ONLY.sql',
  "local-general-journal-atomic-candidate-only",
  "local-general-journal-matrix-rollback-only",
  'SET fiscosim.p0_stage3u_approval',
  'SET fiscosim.p0_stage3u_test_approval',
  'BEGIN READ ONLY;','STAGE3U_REHEARSAL_EXECUTED',
  'STAGE3U_ROLLBACK_VERIFIED|NO_SCHEMA_OR_ACCOUNTING_ROWS_PERSISTED',
  'STAGE3U_LAB_MATRIX|PASS|FIXTURE_ROLLBACK',
  'SINGLE_TRANSACTION_ROLLBACK=true','NO_REAL_JWT_OR_UI_TEST=true',
  'sequence nextval may advance despite ROLLBACK',
  'STAGE3U_REHEARSAL_',
  'psql -X -v ON_ERROR_STOP=1','DO NOT rerun',
 ]) assert.ok(runner.includes(marker),marker)
 assert.ok(runner.includes("$begins.Count -ne 1 -or $ends.Count -ne 1"))
 assert.ok(!runner.includes('mlydfspmrkaedsocubku'))
 assert.ok(!runner.includes('SUPABASE_SERVICE_ROLE_KEY'))
 assert.match(workflow,/run-stage3u-rehearsal-rollback\.ps1/)
})

test('Stage3U no claims of release or real fiscal posting; audit failure is late in the transaction',()=>{
 assert.match(matrix,/REVOKE INSERT ON public\.audit_contabile FROM service_role/)
 assert.match(matrix,/Stage3U failed audit left idempotency claim/)
 assert.match(matrix,/Stage3U failed audit left a posted PN/)
 assert.doesNotMatch(migration,/SECURITY DEFINER/)
 assert.match(migration,/CREATE TABLE public\.fiscosim_general_journal_claim/)
 assert.match(migration,/ON CONFLICT DO NOTHING/)
 assert.match(migration,/GET DIAGNOSTICS v_line_count = ROW_COUNT;/)
 assert.match(runner,/No schema or accounting rows installed/)
 assert.match(runner,/JWT \/ UI \/ fiscal cycle still not tested/)
})

test('Stage3U PowerShell wrapper does not duplicate its transaction or leave truncated syntax',()=>{
 assert.equal((runner.match(/\\$payload=@"/g)||[]).length,1)
 assert.equal((runner.match(/\\$migration=Unwrap-PinnedSql/g)||[]).length,1)
 assert.equal((runner.match(/\\$matrix=Unwrap-PinnedSql/g)||[]).length,1)
 assert.equal((runner.match(/STAGE3U_REHEARSAL_EXECUTED/g)||[]).length,1)
 assert.doesNotMatch(runner,/^\),''\)/m)
 assert.match(runner,/\\$withoutEnd=\\$withoutStart\\.Substring\\(0,\\$endOffset\\)/)
})
