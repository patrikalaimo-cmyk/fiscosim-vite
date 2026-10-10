import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasSupabaseServiceRoleConfigured } from '../lib/db.js'
import usersApi from '../api/auth/users.js'
import readApi from '../api/studio/fiscal-read.js'
import createApi from '../api/studio/client-create.js'

test('Stage3R actual ESM imports of server handlers are valid',()=>{
 assert.equal(typeof usersApi,'function')
 assert.equal(typeof readApi,'function')
 assert.equal(typeof createApi,'function')
 assert.equal(typeof hasSupabaseServiceRoleConfigured,'function')
})

test('Stage3R privileged endpoints never accept VITE-prefixed keys as server proof',()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY
 const viteKey=process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
 try{
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY='must-not-authorize'
  assert.equal(hasSupabaseServiceRoleConfigured(),false)
  process.env.SUPABASE_SERVICE_ROLE_KEY='server-only-test-value'
  assert.equal(hasSupabaseServiceRoleConfigured(),true)
 }finally{
  if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY=previous
  if(viteKey===undefined)delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  else process.env.VITE_SUPABASE_SERVICE_ROLE_KEY=viteKey
 }
})
