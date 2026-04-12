import { createClient } from '@supabase/supabase-js'

function readEnv(name) {
  const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
  const nodeEnv = typeof process !== 'undefined' && process?.env ? process.env : {}
  return viteEnv[name] || nodeEnv[name] || ''
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL') || readEnv('SUPABASE_URL')
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY') || readEnv('SUPABASE_ANON_KEY')

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] Missing configuration: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const sb = createClient(supabaseUrl || 'http://127.0.0.1:54321', supabaseAnonKey || 'missing-key')
