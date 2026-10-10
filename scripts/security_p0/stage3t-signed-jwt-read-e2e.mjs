/**
 * REAL signed-JWT read-only Studio E2E, requiring an independently running
 * localhost Supabase Auth+PostgREST lab and pre-seeded A/B test accounts.
 *
 * NOT a mock, NOT an offline unit test. Do NOT run against live Supabase.
 * Does not create users, mutate PostgreSQL, print tokens or log passwords.
 * Prints PASS only after the Auth service issued and verified both JWTs.
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const env=process.env
const need=(name)=>{
 const value=String(env[name]||'').trim()
 if(!value)throw Error('Stage3T requires '+name+' (no call executed)')
 return value
}
const loopback=(value,label)=>{
 const u=new URL(value)
 if(u.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||
    u.username||u.password||u.search||u.hash)throw Error(label+' must be loopback HTTP')
 return u.origin
}
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function requiredUUID(name){const value=need(name);if(!uid.test(value))throw Error('Invalid UUID for '+name);return value}

if(env.FISCOSIM_ISOLATED_LAB_API!=='true')throw Error('Stage3T requires explicit isolated lab opt-in')
const authUrl=loopback(need('FISCOSIM_E2E_AUTH_URL'),'Auth')
const apiUrl=loopback(need('FISCOSIM_E2E_API_URL'),'Studio API')
if(env.SUPABASE_URL && loopback(env.SUPABASE_URL,'Server Supabase')!==authUrl){
 throw Error('Server Supabase URL does not match local Auth lab')
}
const publicKey=need('FISCOSIM_E2E_PUBLISHABLE_KEY')
const creds={
 a:{email:need('FISCOSIM_E2E_A_EMAIL'),password:need('FISCOSIM_E2E_A_PASSWORD'),
    company:requiredUUID('FISCOSIM_E2E_COMPANY_A'),notice:requiredUUID('FISCOSIM_E2E_NOTICE_A'),
    revision:requiredUUID('FISCOSIM_E2E_REVISION_A')},
 b:{email:need('FISCOSIM_E2E_B_EMAIL'),password:need('FISCOSIM_E2E_B_PASSWORD'),
    company:requiredUUID('FISCOSIM_E2E_COMPANY_B'),notice:requiredUUID('FISCOSIM_E2E_NOTICE_B'),
    revision:requiredUUID('FISCOSIM_E2E_REVISION_B')},
}
const shared=requiredUUID('FISCOSIM_E2E_SHARED_CLIENT')
assert.notEqual(creds.a.email.toLowerCase(),creds.b.email.toLowerCase())
assert.notEqual(creds.a.company,creds.b.company)
assert.notEqual(creds.a.notice,creds.b.notice)
assert.notEqual(creds.a.revision,creds.b.revision)

async function login({email,password}){
 const client=createClient(authUrl,publicKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 })
 const {data,error}=await client.auth.signInWithPassword({email,password})
 if(error||!data?.session?.access_token||!data?.user?.id){
  throw Error('Local Auth sign-in failed')
 }
 const token=data.session.access_token
 assert.equal(token.split('.').length,3,'Local Auth must issue a signed JWT')
 const checked=await client.auth.getUser(token)
 if(checked.error||checked.data?.user?.id!==data.user.id){
  throw Error('Local Auth failed JWT signature/user verification')
 }
 return token
}

async function invoke(path,token){
 const headers={'Accept':'application/json'}
 if(token)headers.Authorization='Bearer '+token
 const response=await fetch(apiUrl+path,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(8000)})
 const body=await response.json().catch(()=>null)
 return {status:response.status,body}
}
function rows(result,label){
 assert.equal(result.status,200,label+' HTTP must be successful')
 assert.equal(result.body?.ok,true,label+' API payload must confirm ok')
 assert.ok(Array.isArray(result.body.data),label+' must contain real rows')
 return result.body.data
}
async function checkTenant(label,actor,other,token){
 const pref='/api/studio/fiscal-read?'
 const clients=rows(await invoke(pref+'resource=clienti',token),label+' customers')
 const notices=rows(await invoke(pref+'resource=avvisi_ade',token),label+' notices')
 const revisions=rows(await invoke(pref+'resource=revisioni_dichiarativi',token),label+' declarations')
 assert.ok(clients.some(c=>c.id===shared),label+' shared CRM customer absent')
 assert.ok(clients.every(c=>
  Array.isArray(c.societa_assegnate) &&
  c.societa_assegnate.every(id=>id===actor.company)),label+' exposes unauthorized customer links')
 assert.ok(notices.some(x=>x.id===actor.notice),label+' own fiscal notice absent')
 assert.ok(!notices.some(x=>x.id===other.notice),label+' foreign fiscal notice leaked')
 assert.ok(notices.every(x=>x.societa_id===actor.company),label+' foreign notice company leaked')
 assert.ok(revisions.some(x=>x.id===actor.revision),label+' own declaration absent')
 assert.ok(!revisions.some(x=>x.id===other.revision),label+' foreign declaration leaked')
 assert.ok(revisions.every(x=>x.societa_id===actor.company),label+' foreign declaration company leaked')
 const foreign=await invoke(pref+'resource=clienti&societa_id='+other.company,token)
 assert.equal(foreign.status,403,label+' querying other company must be denied')
}

const missing=await invoke('/api/studio/fiscal-read?resource=clienti',null)
assert.equal(missing.status,401,'Unauthenticated access must be denied')
const tokenA=await login(creds.a)
const tokenB=await login(creds.b)
const sections=tokenA.split('.')
sections[1]='eyJzdWIiOiJmb3JnZWQifQ'
const forged=await invoke('/api/studio/fiscal-read?resource=clienti',sections.join('.'))
assert.equal(forged.status,401,'Tampered signed JWT must be denied')
await checkTenant('A',creds.a,creds.b,tokenA)
await checkTenant('B',creds.b,creds.a,tokenB)
console.log('STAGE3T REAL SIGNED JWT HTTP READ E2E PASS (A/B + shared CRM + notices + declarations)')
