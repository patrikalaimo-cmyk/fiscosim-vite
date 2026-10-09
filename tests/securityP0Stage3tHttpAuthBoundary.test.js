import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {
 isIsolatedStudioEnvironment,
 matchesStudioRoute,
 handleStudioDevRoute,
} from '../lib/devStudioHttp.js'

const LAB_ENV={
 FISCOSIM_ISOLATED_LAB_API:'true',
 SUPABASE_URL:'http://127.0.0.1:54321',
 VITE_SUPABASE_URL:'http://127.0.0.1:54321',
 SUPABASE_SERVICE_ROLE_KEY:'not-a-real-key-for-negative-tests',
}

async function requestStudio({env={},path='/api/studio/fiscal-read?resource=clienti',
 method='GET',headers={},body=null}={}){
 const server=http.createServer(async(req,res)=>{
  const claimed=await handleStudioDevRoute(req,res,{env})
  if(!claimed){res.statusCode=404;res.end('unknown route')}
 })
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',err=>err?reject(err):resolve()))
 try{
  const address=server.address()
  const response=await fetch('http://127.0.0.1:'+address.port+path,{
   method,headers, ...(body!==null?{body}:{}),
  })
  const raw=await response.text()
  return {status:response.status,headers:response.headers,body:raw?JSON.parse(raw):null}
 }finally{
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))
 }
}

test('Stage3T exact routing includes existing users plus every new Studio endpoint',()=>{
 for(const path of [
  '/api/auth/users','/api/studio/fiscal-read',
  '/api/studio/client-create','/api/studio/client-update',
  '/api/studio/agecon-write','/api/studio/revision-archive',
 ]) assert.equal(matchesStudioRoute(path),true,path)
 for(const path of [
  '/api/studio/fiscal-read/other','/api/studio/new',
  '/api/supabase/admin','/api/ai',
 ]) assert.equal(matchesStudioRoute(path),false,path)
})

test('Stage3T production and ambiguous frontend URLs are never eligible for local privileged HTTP',()=>{
 assert.equal(isIsolatedStudioEnvironment({}),false)
 assert.equal(isIsolatedStudioEnvironment({...LAB_ENV,SUPABASE_SERVICE_ROLE_KEY:''}),false)
 assert.equal(isIsolatedStudioEnvironment({...LAB_ENV,SUPABASE_URL:'https://example.supabase.co'}),false)
 assert.equal(isIsolatedStudioEnvironment({...LAB_ENV,VITE_SUPABASE_URL:'https://example.supabase.co'}),false)
 assert.equal(isIsolatedStudioEnvironment({...LAB_ENV,FISCOSIM_ISOLATED_LAB_API:'false'}),false)
 assert.equal(isIsolatedStudioEnvironment(LAB_ENV),true)
})

test('Stage3T real HTTP refuses studio access without an isolated Auth lab',async()=>{
 const response=await requestStudio({env:process.env})
 assert.equal(response.status,503)
 assert.match(response.body.error,/loopback-only Auth laboratory/)
})

test('Stage3T real HTTP 401 for missing signed bearer; no database calls',async()=>{
 const response=await requestStudio({env:LAB_ENV})
 assert.equal(response.status,401)
 assert.equal(response.body.error,'UNAUTHORIZED')
 assert.equal(response.headers.get('cache-control'),'no-store')
})

test('Stage3T real HTTP rejects cross-origin browser before Auth',async()=>{
 const response=await requestStudio({
  env:LAB_ENV,
  headers:{Origin:'https://attacker.example'},
 })
 assert.equal(response.status,403)
 assert.match(response.body.error,/Cross-origin/)
 assert.equal(response.headers.get('access-control-allow-origin'),null)
})

test('Stage3T real HTTP rejects malformed and oversized JSON before calling privileged handlers',async()=>{
 const malformed=await requestStudio({
  env:LAB_ENV,path:'/api/studio/client-create',method:'POST',
  headers:{'Content-Type':'application/json'},body:'{"bad":',
 })
 assert.equal(malformed.status,400)
 const large=await requestStudio({
  env:LAB_ENV,path:'/api/studio/client-create',method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({blob:'x'.repeat(750100)}),
 })
 assert.equal(large.status,413)
})

test('Stage3T guarded OPTIONS invokes real Vercel handler adapter without credentials',async()=>{
 const response=await requestStudio({
  env:LAB_ENV,path:'/api/studio/fiscal-read?resource=clienti',method:'OPTIONS',
  headers:{Origin:'http://localhost:5173'},
 })
 assert.equal(response.status,200)
 assert.equal(response.headers.get('access-control-allow-origin'),'http://localhost:5173')
})

test('Stage3T actual dev-api registers studio routes before wildcard OPTIONS',async()=>{
 const {readFileSync}=await import('node:fs')
 const src=readFileSync(new URL('../scripts/dev-api.mjs',import.meta.url),'utf8')
 assert.ok(src.includes("import { handleStudioDevRoute, matchesStudioRoute } from '../lib/devStudioHttp.js'"))
 assert.ok(src.indexOf('if (matchesStudioRoute(path))')<src.indexOf("if (req.method === 'OPTIONS')"))
 assert.ok(src.includes('await handleStudioDevRoute(req,res)'))
})

test('Stage3T signed-JWT E2E harness requires real Auth, two distinct A/B fixtures and no mutations',async()=>{
 const {readFileSync}=await import('node:fs')
 const harness=readFileSync(new URL('../scripts/security_p0/stage3t-signed-jwt-read-e2e.mjs',import.meta.url),'utf8')
 for(const fragment of [
  "FISCOSIM_ISOLATED_LAB_API",
  "FISCOSIM_E2E_AUTH_URL",
  "FISCOSIM_E2E_API_URL",
  "FISCOSIM_E2E_A_EMAIL",
  "FISCOSIM_E2E_B_EMAIL",
  "FISCOSIM_E2E_SHARED_CLIENT",
  "signInWithPassword",
  "client.auth.getUser(token)",
  "Stage3T requires explicit isolated lab opt-in",
  "Tampered signed JWT must be denied",
  "foreign fiscal notice leaked",
  "foreign declaration leaked",
  "REAL SIGNED JWT HTTP READ E2E PASS",
 ]) assert.ok(harness.includes(fragment),fragment)
 assert.doesNotMatch(harness,/auth\.admin\.(createUser|deleteUser)/)
 assert.doesNotMatch(harness,/method:\s*['"](?:POST|PATCH|PUT|DELETE)/)
 assert.doesNotMatch(harness,/SUPABASE_SERVICE_ROLE_KEY/)
 const dev=readFileSync(new URL('../scripts/dev-api.mjs',import.meta.url),'utf8')
 assert.match(dev,/listenHost = process\.env\.FISCOSIM_ISOLATED_LAB_API === 'true'/)
 assert.match(dev,/\? '127\.0\.0\.1' : undefined/)
})
