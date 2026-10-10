/**
 * Supabase DB client for backend (Vercel Serverless / Node.js).
 *
 * Use SERVICE ROLE key only on server-side code (never in the browser).
 * Env vars (recommended):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - SUPABASE_ANON_KEY (optional, only if you need anon client server-side)
 */
import { createClient } from '@supabase/supabase-js'
 
let _adminClient = null
let _anonClient = null

// Privileged endpoints must require a server-only service-role secret.
// VITE_* keys can be bundled into browser builds and cannot satisfy this guard.
export function hasSupabaseServiceRoleConfigured() {
  return Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim())
}
 
function firstEnv(names) {
  for (const n of names) {
    const v = process.env[n]
    if (v) return v
  }
  return null
}
 
function mustEnvAny(names, label) {
  const v = firstEnv(names)
  if (!v) throw new Error(`${label} is not set (tried: ${names.join(', ')})`)
  return v
}
 
/**
 * Returns a cached Supabase **admin** client (service role).
 * This is the default for backend pipelines that need to read/write data.
 */
export async function getSupabaseAdmin() {
  if (_adminClient) return _adminClient
  // Privileged backend access requires the server-only service role key.
  // An anon or VITE_* fallback can turn an authorization check into an
  // unauthenticated/incorrect RLS query and must never be silently accepted.
  const url = mustEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'], 'SUPABASE_URL')
  const key = mustEnvAny(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY')
  _adminClient = createClient(url, key, {
    auth: { persistSession: false },
  })
  return _adminClient
}
 
/**
 * Returns a cached Supabase **anon** client (optional).
 * Use it only if you intentionally want RLS to apply from server.
 */
export async function getSupabaseAnon() {
  if (_anonClient) return _anonClient
  const url = mustEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'], 'SUPABASE_URL')
  const key = mustEnvAny(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'], 'SUPABASE_ANON_KEY')
  _anonClient = createClient(url, key, {
    auth: { persistSession: false },
  })
  return _anonClient
}
 
