import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const path=new URL('../scripts/security_p0/stage3v-local-auth-readiness.mjs',import.meta.url)
const code=readFileSync(path,'utf8')

test('Stage3V local infrastructure discovery never executes without immutable commit',()=>{
 const run=spawnSync(process.execPath,[fileURLToPath(path)],{
  encoding:'utf8',timeout:6000,
  env:{PATH:process.env.PATH||'',USERPROFILE:'C:\\Users\\lab'},
 })
 assert.notEqual(run.status,0)
 assert.match(run.stderr,/STAGE3V_REQUIRES_PINNED_SHA/)
})

test('Stage3V readiness scans only pinned Docker database and localhost services',()=>{
 for(const marker of [
  'supabase_db_FiscoSim-P0-LAB-20261008-164658',
  "http://127.0.0.1:54321",
  '/auth/v1/health',
  '/rest/v1/',
  'BEGIN READ ONLY;',
  'ROLLBACK;',
  'STAGE3V_INSTALLED|',
  'AUTH_CONTAINER_ON_DB_NETWORK',
  'POSTGREST_CONTAINER_ON_DB_NETWORK',
  'GATEWAY_54321_BOUND_ONLY_TO_LOOPBACK',
  "HostPort)!=='54321'",
  "'127.0.0.1','::1'",
  'REAL_SIGNED_JWT_E2E=false',
  'ACCOUNTING_HTTP_POST_E2E=false',
  'STAGE3V_LOCAL_AUTH_POSTGREST_PREREQUISITES_INCOMPLETE',
 ])assert.ok(code.includes(marker),marker)
 assert.doesNotMatch(code,/https:\/\//)
 assert.doesNotMatch(code,/\.rpc\(|signInWithPassword|auth\.admin|Authorization|Bearer/)
 assert.doesNotMatch(code,/\b(?:DROP|CREATE|ALTER|TRUNCATE|INSERT|DELETE|UPDATE)\s+(?:TABLE|INTO|FROM|public\.)/i)
 assert.doesNotMatch(code,/docker.*(?:run|rm|stop|start|restart)/i)
})

test('Stage3V readiness does not claim actual signed-JWT posting from infrastructure',()=>{
 assert.match(code,/network and gateway status alone do NOT verify/i)
 assert.ok(code.includes('REAL_SIGNED_JWT_E2E=false'))
 assert.ok(code.includes('ACCOUNTING_HTTP_POST_E2E=false'))
 assert.doesNotMatch(code,/STAGE3V_REAL_SIGNED_JWT_PERSISTENT_POSTING_PASS/)
})
