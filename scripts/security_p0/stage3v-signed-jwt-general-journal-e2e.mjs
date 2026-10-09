/**
 * Stage3V — REAL, opt-in, PERSISTENT signed-JWT accounting E2E.
 *
 * Requires a privately provisioned localhost Auth + PostgREST lab attached
 * to the Stage3U PostgreSQL container, and *synthetic* STAGE3V-prefixed
 * company/chart fixtures. NEVER point this at live Supabase.
 *
 * No mocked DB, no fake JWT, no token/password output, no automatic cleanup.
 * Intentionally persists exactly one journal per A and B to prove COMMIT.
 * A rerun requires a new explicit operator review and new UUIDs; do not loop.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env=process.env
const required=(name)=>{
 const value=String(env[name]||'').trim()
 if(!value)throw Error('STAGE3V_PRECONDITION_MISSING:'+name)
 return value
}
const uuid=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i
function requireUUID(name){
 const value=required(name)
 if(!uuid.test(value))throw Error('STAGE3V_INVALID_UUID:'+name)
 return value
}
function loopbackUrl(raw,name){
 const url=new URL(raw)
 if(url.protocol!=='http:' ||
  !['127.0.0.1','localhost','[::1]'].includes(url.hostname) ||
  url.username||url.password||url.search||url.hash||url.pathname!=='/'){
  throw Error('STAGE3V_NOT_LOOPBACK:'+name)
 }
 return url.origin
}
if(env.FISCOSIM_ISOLATED_LAB_API!=='true'){
 throw Error('STAGE3V_ISOLATED_LAB_OPT_IN_REQUIRED')
}
const authUrl=loopbackUrl(required('SUPABASE_URL'),'SUPABASE_URL')
const frontendUrl=loopbackUrl(required('VITE_SUPABASE_URL'),'VITE_SUPABASE_URL')
const apiUrl=loopbackUrl(required('FISCOSIM_E2E_API_URL'),'FISCOSIM_E2E_API_URL')
if(authUrl!==frontendUrl)throw Error('STAGE3V_FRONTEND_AUTH_MISMATCH')
if(env.FISCOSIM_GENERAL_JOURNAL_POST_LAB_ENABLED!=='true'){
 throw Error('STAGE3V_JOURNAL_API_NOT_ENABLED')
}
const publishableKey=required('FISCOSIM_E2E_PUBLISHABLE_KEY')
const serviceKey=required('SUPABASE_SERVICE_ROLE_KEY')
const fixture={
 A:{
  email:required('FISCOSIM_E2E_A_EMAIL'),
  password:required('FISCOSIM_E2E_A_PASSWORD'),
  company:requireUUID('FISCOSIM_E2E_COMPANY_A'),
  debit:requireUUID('FISCOSIM_E2E_A_DEBIT_ACCOUNT'),
  credit:requireUUID('FISCOSIM_E2E_A_CREDIT_ACCOUNT'),
 },
 B:{
  email:required('FISCOSIM_E2E_B_EMAIL'),
  password:required('FISCOSIM_E2E_B_PASSWORD'),
  company:requireUUID('FISCOSIM_E2E_COMPANY_B'),
  debit:requireUUID('FISCOSIM_E2E_B_DEBIT_ACCOUNT'),
  credit:requireUUID('FISCOSIM_E2E_B_CREDIT_ACCOUNT'),
 },
}
assert.notEqual(fixture.A.company,fixture.B.company)
assert.notEqual(fixture.A.email.toLowerCase(),fixture.B.email.toLowerCase())
for(const f of Object.values(fixture))assert.notEqual(f.debit,f.credit)
const clientOpts={auth:{
 persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
}}
const admin=createClient(authUrl,serviceKey,clientOpts)
async function ensureSyntheticFixtures(){
 const companies=Object.values(fixture).map(x=>x.company)
 const {data:companiesRows,error:ce}=await admin.from('societa')
  .select('id,codice,attiva').in('id',companies)
 if(ce||companiesRows?.length!==2)throw Error('STAGE3V_COMPANY_FIXTURES_NOT_FOUND')
 for(const row of companiesRows){
  if(row.attiva!==true || !String(row.codice||'').startsWith('STAGE3V-')){
   throw Error('STAGE3V_COMPANY_NOT_MARKED_SYNTHETIC')
  }
 }
 for(const f of Object.values(fixture)){
  const {data,error}=await admin.from('piano_conti')
   .select('id,societa_id,attivo')
   .in('id',[f.debit,f.credit])
  if(error||data?.length!==2||!data.every(a=>
    a.societa_id===f.company&&a.attivo===true)){
   throw Error('STAGE3V_ACCOUNTS_INVALID_OR_CROSS_COMPANY')
  }
 }
}
async function login(f){
 const client=createClient(authUrl,publishableKey,clientOpts)
 const {data,error}=await client.auth.signInWithPassword({
  email:f.email,password:f.password,
 })
 if(error||!data?.session?.access_token||!data?.user?.id)
  throw Error('STAGE3V_SIGNED_AUTH_LOGIN_FAILED')
 const token=data.session.access_token
 if(token.split('.').length!==3)throw Error('STAGE3V_NOT_A_SIGNED_JWT')
 const {data:verified,error:checkError}=await client.auth.getUser(token)
 if(checkError||verified?.user?.id!==data.user.id)
  throw Error('STAGE3V_AUTH_GET_USER_VERIFICATION_FAILED')
 return {token,authUserId:data.user.id}
}
async function post(token,body){
 const headers={'Content-Type':'application/json','Accept':'application/json'}
 if(token)headers.Authorization='Bearer '+token
 const response=await fetch(apiUrl+'/api/studio/general-journal-post',{
  method:'POST',headers,body:JSON.stringify(body),
  redirect:'error',signal:AbortSignal.timeout(15000),
 })
 const result=await response.json().catch(()=>null)
 return {status:response.status,result}
}
const movement=(f,key,amount)=>({
 societa_id:f.company,request_id:key,
 header:{
  data_registrazione:new Date().toISOString().slice(0,10),
  descrizione:'STAGE3V synthetic cash to bank transfer',
 },
 rows:[
  {conto_id:f.debit,dare:amount,avere:0},
  {conto_id:f.credit,dare:0,avere:amount},
 ],
 motivazione:'STAGE3V authenticated synthetic accounting cycle',
})
async function inspectCommitted(f,key,id,authUserId,amount){
 const [h,l,a,c]=await Promise.all([
  admin.from('prima_nota').select('id,societa_id,stato,totale_dare,totale_avere')
   .eq('id',id).single(),
  admin.from('prima_nota_righe')
   .select('prima_nota_id,conto_id,importo_dare,importo_avere')
   .eq('prima_nota_id',id),
  admin.from('audit_contabile').select('entity_id,societa_id,operation_type')
   .eq('entity_id',id),
  admin.from('fiscosim_general_journal_claim')
   .select('prima_nota_id,societa_id,request_id,auth_user_id')
   .eq('societa_id',f.company).eq('request_id',key),
 ])
 for(const result of [h,l,a,c])if(result.error)throw Error('STAGE3V_SQL_POSTCOMMIT_READ_FAILED')
 assert.equal(h.data?.societa_id,f.company)
 assert.equal(Math.round(Number(h.data?.totale_dare)*100),Math.round(amount*100))
 assert.equal(Math.round(Number(h.data?.totale_avere)*100),Math.round(amount*100))
 assert.equal(h.data?.stato,'confermata')
 assert.equal(l.data?.length,2)
 assert.deepEqual(new Set(l.data.map(x=>x.conto_id)),new Set([f.debit,f.credit]))
 assert.equal(l.data.reduce((n,x)=>n+Math.round(Number(x.importo_dare)*100),0),Math.round(amount*100))
 assert.equal(l.data.reduce((n,x)=>n+Math.round(Number(x.importo_avere)*100),0),Math.round(amount*100))
 assert.equal(a.data?.filter(x=>x.operation_type==='INSERT'&&x.societa_id===f.company).length,1)
 assert.equal(c.data?.length,1)
 assert.equal(c.data[0].prima_nota_id,id)
 assert.equal(c.data[0].auth_user_id,authUserId)
}
async function inspectRejected(f,key){
 const result=await admin.from('fiscosim_general_journal_claim')
  .select('request_id').eq('societa_id',f.company).eq('request_id',key)
 if(result.error||result.data?.length!==0)throw Error('STAGE3V_REJECTED_OPERATION_LEFT_CLAIM')
}
await ensureSyntheticFixtures()
const a=await login(fixture.A)
const b=await login(fixture.B)
assert.notEqual(a.authUserId,b.authUserId)
const unsigned=await post(null,{})
assert.equal(unsigned.status,401,'unsigned request should be rejected')
const tampered=a.token.split('.')
tampered[1]='eyJzdWIiOiJmb3JnZWQifQ'
assert.equal((await post(tampered.join('.'),{})).status,401,'tampered JWT should fail')
const foreignKey=randomUUID()
const foreign=await post(a.token,movement(fixture.B,foreignKey,20))
assert.equal(foreign.status,403,'A must not post into company B')
await inspectRejected(fixture.B,foreignKey)
const unbalancedKey=randomUUID()
const unbalanced=movement(fixture.A,unbalancedKey,100)
unbalanced.rows[1].avere=99.99
assert.equal((await post(a.token,unbalanced)).status,400)
await inspectRejected(fixture.A,unbalancedKey)

if(env.FISCOSIM_STAGE3V_PERSISTENT_WRITE_APPROVAL!=='LAB_SYNTHETIC_WRITE_APPROVED'){
 console.log('STAGE3V_JWT_NEGATIVE_PREFLIGHT_PASS; actual accounting COMMIT not executed (opt-in absent)')
 process.exit(0)
}
// Ensure absence of prior persisted marker data; reruns are prohibited.
for(const f of Object.values(fixture)){
 const {data,error}=await admin.from('prima_nota').select('id')
  .eq('societa_id',f.company)
 if(error||data?.length)throw Error('STAGE3V_LAB_NOT_EMPTY_NO_RETRY')
}
const outcomes=[]
for(const [label,f,identity,amount] of [
 ['A',fixture.A,a,100.25],['B',fixture.B,b,205.10],
]){
 const key=randomUUID()
 const body=movement(f,key,amount)
 const first=await post(identity.token,body)
 assert.equal(first.status,201,label+' posting did not commit')
 const journalId=first.result?.id
 assert.ok(uuid.test(journalId||''),label+' missing persisted journal ID')
 const replay=await post(identity.token,body)
 assert.equal(replay.status,201)
 assert.equal(replay.result?.id,journalId,label+' idempotent replay changed journal')
 const changed=movement(f,key,amount+1)
 assert.equal((await post(identity.token,changed)).status,409,'divergent replay must fail')
 await inspectCommitted(f,key,journalId,identity.authUserId,amount)
 outcomes.push({company:label,requestId:key,journalId,amount})
}
console.log(JSON.stringify({
 result:'STAGE3V_REAL_SIGNED_JWT_PERSISTENT_POSTING_PASS',
 labOnly:true,cleanupRequired:true,records:outcomes,
}))
