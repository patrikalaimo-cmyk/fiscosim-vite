import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('P0 Stage3H disallows client-side secret and bypass login', () => {
  const login = read('src/modules/login/index.jsx')
  assert.match(login, /auth\.signInWithPassword\(/)
  assert.match(login, /\.eq\("auth_user_id", authUserId\)/)
  assert.doesNotMatch(login, /password_hash|dev_bypass|isLocalAuthDisabled/)
})

test('P0 Stage3H never suppresses API bearer token for local bypass', () => {
  const auth = read('src/lib/auth.js')
  assert.doesNotMatch(auth, /VITE_DEV_LOCAL_AUTH_BYPASS|isLocalAuthDisabled/)
  assert.match(auth, /const token = await getAccessToken\(\)/)
})

test('P0 Stage3H UI logout signs out actual Supabase session', () => {
  const app = read('src/App.jsx')
  const part = app.slice(app.indexOf('const logout = async'), app.indexOf('const navigateTo'))
  assert.match(part, /await signOutSession\(\)/)
  assert.ok(part.indexOf('await signOutSession()') < part.indexOf('setUtente(null)'))
  assert.match(part, /if \(error\) throw error/)
})
