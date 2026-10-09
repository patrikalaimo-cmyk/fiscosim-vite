/**
 * Only the real Auth-backed studio HTTP handlers are exposed here.
 * No token fabrication and no service-role fallback.
 * The development adapter is deliberately disabled unless an isolated
 * loopback-only Supabase Auth + PostgREST stack is explicitly configured.
 */
import users from '../api/auth/users.js'
import read from '../api/studio/fiscal-read.js'
import clientCreate from '../api/studio/client-create.js'
import clientUpdate from '../api/studio/client-update.js'
import ageconWrite from '../api/studio/agecon-write.js'
import revisionArchive from '../api/studio/revision-archive.js'

const ROUTES = new Map([
  ['/api/auth/users', users],
  ['/api/studio/fiscal-read', read],
  ['/api/studio/client-create', clientCreate],
  ['/api/studio/client-update', clientUpdate],
  ['/api/studio/agecon-write', ageconWrite],
  ['/api/studio/revision-archive', revisionArchive],
])
const MAX_BODY_BYTES = 750_000
const DEV_ORIGINS = new Set([
 'http://localhost:5173', 'http://127.0.0.1:5173',
])

export function isIsolatedStudioEnvironment(env = process.env) {
 if (env.FISCOSIM_ISOLATED_LAB_API !== 'true') return false
 if (!String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) return false
 try {
  const url = new URL(env.SUPABASE_URL || '')
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) {
   return false
  }
  // The frontend must not accidentally authenticate against the real project
  // while its privileged backend is pointed at a local laboratory.
  if (env.VITE_SUPABASE_URL) {
   const frontend = new URL(env.VITE_SUPABASE_URL)
   if (frontend.protocol !== 'http:' ||
       !['127.0.0.1','localhost','[::1]'].includes(frontend.hostname)) return false
  }
  return true
 } catch { return false }
}

export function matchesStudioRoute(pathname) {
 return ROUTES.has(pathname)
}

function respondJson(res, status, body) {
 if (res.writableEnded) return
 res.statusCode=status
 res.setHeader('Content-Type','application/json; charset=utf-8')
 res.setHeader('Cache-Control','no-store')
 res.end(JSON.stringify(body))
}

async function parseLimitedBody(req) {
 if (!['POST','PATCH','PUT','DELETE'].includes(req.method)) return {}
 let bytes=0
 const chunks=[]
 for await (const chunk of req) {
  bytes+=chunk.length
  if(bytes>MAX_BODY_BYTES) {
   const error=new Error('Request body exceeds local studio limit')
   error.httpStatus=413
   throw error
  }
  chunks.push(chunk)
 }
 const raw=Buffer.concat(chunks).toString('utf8').trim()
 if(!raw)return {}
 try {return JSON.parse(raw)}
 catch {
  const error=new Error('Malformed JSON')
  error.httpStatus=400
  throw error
 }
}

export async function handleStudioDevRoute(req,res,{env=process.env}={}){
 const url=new URL(req.url || '/', 'http://localhost:3001')
 const handler=ROUTES.get(url.pathname)
 if(!handler)return false

 if(!isIsolatedStudioEnvironment(env)){
  respondJson(res,503,{error:'Studio local API requires explicit loopback-only Auth laboratory'})
  return true
 }
 const origin=String(req.headers.origin||'')
 if(origin && !DEV_ORIGINS.has(origin)){
  respondJson(res,403,{error:'Cross-origin studio request not allowed'})
  return true
 }
 if(origin){
  res.setHeader('Access-Control-Allow-Origin',origin)
  res.setHeader('Vary','Origin')
 }
 res.setHeader('Cache-Control','no-store')
 // Provide the Vercel handler's status()/json() response contract while
 // keeping the actual Node response and real Authorization header intact.
 res.status=(code)=>{res.statusCode=code;return res}
 res.json=(body)=>{respondJson(res,res.statusCode||200,body);return res}
 req.query=Object.fromEntries(url.searchParams.entries())
 try{
  req.body=await parseLimitedBody(req)
  await handler(req,res)
  if(!res.writableEnded)respondJson(res,500,{error:'Studio API did not complete'})
 }catch(error){
  respondJson(res,error.httpStatus||500,{error:
   error.httpStatus===413?'Request too large':
   error.httpStatus===400?'Invalid JSON':'Studio API execution failed'})
 }
 return true
}
