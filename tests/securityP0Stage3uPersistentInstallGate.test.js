import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const script=readFileSync(new URL('../scripts/security_p0/run-stage3u-persistent-lab-install.ps1',import.meta.url),'utf8')
const workflow=readFileSync(new URL('../.github/workflows/fiscosim-test-baseline.yml',import.meta.url),'utf8')

test('Stage3U durable lab install explicitly opts in, binds isolated identity and rehearsed immutable SQL',()=>{
 for(const marker of [
  'ApproveLabSchemaInstall',
  'ExpectedCommit',
  'git -C $repo rev-parse HEAD',
  'git -C $repo hash-object',
  '93a3f66503d4680b4c72007d20fe49dcab63370c',
  'a2302c91f170dd377cc03379793959010c80bd4b',
  '65f9b6738a2e0be8ac4d677289f3544a3bb10805',
  'supabase_db_FiscoSim-P0-LAB-20261008-164658',
  'STAGE3U_LAB_MATRIX|PASS|FIXTURE_ROLLBACK',
  'STAGE3U_ROLLBACK_VERIFIED|NO_SCHEMA_OR_ACCOUNTING_ROWS_PERSISTED',
  '3U_INSTALL_BASELINE|EMPTY|NO_EXISTING_RPC',
  '3U_PERSISTENT_INSTALL|SCHEMA_PRESENT|NO_FIXTURE_ROWS|ACL_PASS',
  'STAGE3U_PERSISTENT_LAB_INSTALL_PASS',
  'STAGE3U_PERSISTENT_LAB_INSTALL_BLOCKED',
 ])assert.ok(script.includes(marker),marker)
 assert.ok(script.indexOf('migration 54 (PERSISTENT DDL)')<script.indexOf('matrix 55 (fixture ROLLBACK)'))
 assert.ok(script.indexOf("Invoke-LabSql 'preflight READ ONLY'")<script.indexOf("Invoke-LabSql 'migration 54"))
 assert.match(script,/ON_ERROR_STOP=1/)
 assert.match(script,/if\(\$exitCode -ne 0\)/)
 assert.ok(!script.includes('mlydfspmrkaedsocubku'))
 assert.ok(workflow.includes('run-stage3u-persistent-lab-install.ps1'))
})
