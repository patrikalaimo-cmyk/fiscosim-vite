// A privileged local experiment must never connect to hosted Supabase.
const HOSTS=new Set(['127.0.0.1','localhost','[::1]'])
function loopbackHttp(value) {
 try{
  const url=new URL(value||'')
  return url.protocol==='http:' && HOSTS.has(url.hostname) &&
    !url.username && !url.password && !url.search && !url.hash
 }catch{return false}
}
export function isIsolatedStudioEnvironment(env=process.env) {
 return env.FISCOSIM_ISOLATED_LAB_API==='true' &&
  Boolean(String(env.SUPABASE_SERVICE_ROLE_KEY||'').trim()) &&
  loopbackHttp(env.SUPABASE_URL) &&
  (!env.VITE_SUPABASE_URL || loopbackHttp(env.VITE_SUPABASE_URL))
}
