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
  env:{PATH:process.env.PATH||'',USERPROFILE:'C:\\\\Users\\\\lab'},
 })
 assert.notEqual(run.status,0)
 assert.match(run.stderr,/STAGE3V_REQUIRES_PINNED_SHA/)
})

test('Stage3V readiness probes ONLY the P0 LAB 55321 and its pinned Docker services',()=>{
 for(const marker of [
  'STAGE3V_LAB.db',
  'STAGE3V_LAB.kong',
  'STAGE3V_LAB_NETWORK',
  'STAGE3V_LAB_ORIGIN+path',
  'inspectStage3vLocalStack()',
  '/auth/v1/health','/rest/v1/',
  'BEGIN READ ONLY;','ROLLBACK;',
  'STAGE3V_INSTALLED|',
  'LAB_REQUIRED_SERVICES_PRESENT',
  'LAB_SERVICES_ONLY_ON_PINNED_NETWORK',
  'GATEWAY_55321_PUBLISHED',
  'LAB_ALL_PUBLISHED_PORTS_LOOPBACK',
  'LAB_UNSAFE_HOST_BINDINGS',
  'OTHER_FISCOSIM_LOCAL_STACK_PRESENT',
  'REAL_SIGNED_JWT_E2E=false',
  'ACCOUNTING_HTTP_POST_E2E=false',
  'STAGE3V_PINNED_LAB_PREREQUISITES_INCOMPLETE',
 ])assert.ok(code.includes(marker),marker)
 assert.doesNotMatch(code,/fetch\('http:\/\/127\.0\.0\.1:54321/)
 assert.doesNotMatch(code,/\.rpc\(|signInWithPassword|auth\.admin|Authorization|Bearer/)
 assert.doesNotMatch(code,/\b(?:DROP|CREATE|ALTER|TRUNCATE|INSERT|DELETE|UPDATE)\s+(?:TABLE|INTO|FROM|public\.)/i)
 assert.doesNotMatch(code,/execFileSync\(\s*['"]docker['"]\s*,\s*\[\s*['"](?:run|rm|stop|start|restart)['"]/i)
})

test('Read-only infrastructure status does not imply JWT E2E or fiscal posting PASS',()=>{
 assert.match(code,/network and gateway status alone do NOT verify/i)
 assert.ok(code.includes('REAL_SIGNED_JWT_E2E=false'))
 assert.ok(code.includes('ACCOUNTING_HTTP_POST_E2E=false'))
 assert.doesNotMatch(code,/STAGE3V_REAL_SIGNED_JWT_PERSISTENT_POSTING_PASS/)
})
