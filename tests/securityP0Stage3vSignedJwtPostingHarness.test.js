import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const path=new URL('../scripts/security_p0/stage3v-signed-jwt-general-journal-e2e.mjs',import.meta.url)
const script=readFileSync(path,'utf8')

test('Stage3V signed JWT real-DB E2E harness fails closed without localhost opt-in',()=>{
 const run=spawnSync(process.execPath,[fileURLToPath(path)],{
  encoding:'utf8',timeout:8000,
  env:{FISCOSIM_ISOLATED_LAB_API:'false',PATH:process.env.PATH||''},
 })
 assert.notEqual(run.status,0)
 assert.match(run.stderr,/STAGE3V_ISOLATED_LAB_OPT_IN_REQUIRED/)
})

test('Stage3V E2E refuses non-synthetic companies and non-loopback services',()=>{
 for(const needle of [
  'STAGE3V_NOT_LOOPBACK',
  'STAGE3V_FRONTEND_AUTH_MISMATCH',
  "startsWith('STAGE3V-')",
  'STAGE3V_COMPANY_NOT_MARKED_SYNTHETIC',
  'STAGE3V_ACCOUNTS_INVALID_OR_CROSS_COMPANY',
  'STAGE3V_LAB_NOT_EMPTY_NO_RETRY',
  'FISCOSIM_STAGE3V_PERSISTENT_WRITE_APPROVAL',
  'LAB_SYNTHETIC_WRITE_APPROVED',
 ])assert.ok(script.includes(needle),needle)
 assert.match(script,/FISCOSIM_ISOLATED_LAB_API/)
 assert.match(script,/VITE_SUPABASE_URL/)
 assert.match(script,/SUPABASE_SERVICE_ROLE_KEY/)
 assert.doesNotMatch(script,/https:\/\/.*supabase\.co/)
})

test('Stage3V verifies real token and persisted PostgreSQL side effects with exact replay',()=>{
 for(const needle of [
  'signInWithPassword','auth.getUser(token)',
  'STAGE3V_SIGNED_AUTH_LOGIN_FAILED',
  'STAGE3V_AUTH_GET_USER_VERIFICATION_FAILED',
  "tampered.join('.')",
  'foreign.status,403',
  'unbalanced)).status,400',
  'await inspectRejected(fixture.B,foreignKey)',
  'await inspectRejected(fixture.A,unbalancedKey)',
  'admin.from(\'prima_nota\')',
  'admin.from(\'prima_nota_righe\')',
  'admin.from(\'audit_contabile\')',
  'admin.from(\'fiscosim_general_journal_claim\')',
  'idempotent replay changed journal',
  'divergent replay must fail',
  'STAGE3V_REAL_SIGNED_JWT_PERSISTENT_POSTING_PASS',
 ]) assert.ok(script.includes(needle),needle)
 assert.doesNotMatch(script,/auth\.admin\.(?:createUser|deleteUser)/)
 assert.doesNotMatch(script,/\.delete\(\)|\.upsert\(/)
 assert.doesNotMatch(script,/console\.log\([^)]*(?:token|password|serviceKey)/)
})

test('Stage3V E2E default flow runs only non-mutating HTTP negatives',()=>{
 const gate=script.indexOf("if(env.FISCOSIM_STAGE3V_PERSISTENT_WRITE_APPROVAL")
 const write=script.indexOf("for(const [label,f,identity,amount] of")
 assert.ok(gate>0)
 assert.ok(write>gate)
 assert.match(script,/STAGE3V_JWT_NEGATIVE_PREFLIGHT_PASS/)
})
