/**
 * Stage3V — READ-ONLY local infrastructure discovery, never an E2E PASS.
 * Inspects ONLY pinned local P0 Docker and http://127.0.0.1:54321.
 * No credentials, no token, no Supabase hosted contact, no DB writes.
 */
import {execFileSync} from 'node:child_process'
import {existsSync,writeFileSync} from 'node:fs'
import {resolve,join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const CONTAINER='supabase_db_FiscoSim-P0-LAB-20261008-164658'
const SHA=/^[a-f0-9]{40}$/i
const arg=process.argv
const pos=arg.indexOf('--expected-commit')
const expected=pos>=0?String(arg[pos+1]||''):''
if(!SHA.test(expected))throw Error('STAGE3V_REQUIRES_PINNED_SHA')
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()
if(head!==expected)throw Error('STAGE3V_GIT_COMMIT_MISMATCH')
const home=process.env.USERPROFILE
if(!home)throw Error('STAGE3V_WINDOWS_LAB_ONLY')
const lab=join(home,'FiscoSim-P0-LAB-20261008-164658')
if(!existsSync(lab))throw Error('STAGE3V_ISOLATED_LAB_PATH_MISSING')

function docker(...params) {
 return execFileSync('docker',params,{encoding:'utf8',timeout:10000,windowsHide:true}).trim()
}
function networks(name) {
 const raw=docker('inspect','--format','{{json .NetworkSettings.Networks}}',name)
 return new Set(Object.keys(JSON.parse(raw||'{}')))
}
function linked(a,b){return [...a].some(n=>b.has(n))}
function matchingContainer(names,pattern,dbNets){
 const matches=names.filter(name=>pattern.test(name))
 const connected=[]
 for(const name of matches){
  try {
   const state=docker('inspect','--format','{{.State.Running}}',name)
   if(state==='true' && linked(networks(name),dbNets))connected.push(name)
  }catch { /* Unknown names do not establish trust */ }
 }
 return connected.length
}
function inspectGatewayLoopbackBindings(names,dbNets){
 const bindings=[]
 for(const name of names){
  try{
   if(!linked(networks(name),dbNets))continue
   const ports=JSON.parse(docker('inspect','--format','{{json .NetworkSettings.Ports}}',name)||'{}')
   for(const [containerPort,published] of Object.entries(ports||{})){
    for(const binding of published||[]){
     if(String(binding.HostPort)!=='54321')continue
     bindings.push({
      container:name,containerPort,
      hostIp:String(binding.HostIp),hostPort:String(binding.HostPort),
     })
    }
   }
  }catch{ /* Uninspectable container never establishes a safe binding */ }
 }
 const safe=bindings.length>0 &&
  bindings.every(b=>['127.0.0.1','::1'].includes(b.hostIp))
 return {safe,details:bindings.length
  ? bindings.map(b=>b.container+'@'+b.hostIp+':'+b.hostPort+'->'+b.containerPort).join(';')
  : 'NONE_ON_PINNED_DB_NETWORK'}
}
async function ping(path){
 try{
  const response=await fetch('http://127.0.0.1:54321'+path,{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(2500),
  })
  await response.body?.cancel()
  return response.status
 }catch{return 'UNREACHABLE'}
}
if(docker('inspect','--format','{{.State.Running}}',CONTAINER)!=='true'){
 throw Error('STAGE3V_PINNED_DB_CONTAINER_NOT_RUNNING')
}
const dbNetworks=networks(CONTAINER)
const names=docker('ps','--format','{{.Names}}').split(/\r?\n/).filter(Boolean)
const authCount=matchingContainer(names,/(?:^|[-_])(?:auth|gotrue)(?:[-_]|$)/i,dbNetworks)
const restCount=matchingContainer(names,/(?:^|[-_])(?:rest|postgrest)(?:[-_]|$)/i,dbNetworks)

const inspectionSQL=`
BEGIN READ ONLY;
SELECT 'STAGE3V_INSTALLED|'||
 (to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL)::text||
 '|CLAIM_RLS|'||
 coalesce((SELECT relrowsecurity::text FROM pg_catalog.pg_class
 WHERE oid=to_regclass('public.fiscosim_general_journal_claim')),'false');
ROLLBACK;
`
const output=execFileSync('docker',[
 'exec','-i',CONTAINER,'psql','-X','-v','ON_ERROR_STOP=1',
 '-U','postgres','-d','postgres','-A','-t','-F','|','-P','pager=off',
],{input:inspectionSQL,encoding:'utf8',timeout:10000,windowsHide:true})
const installed=output.includes('STAGE3V_INSTALLED|true|CLAIM_RLS|true')
const [authHttp,restHttp]=await Promise.all([
 ping('/auth/v1/health'),ping('/rest/v1/'),
])
const connected=authCount>0 && restCount>0
const gateway=inspectGatewayLoopbackBindings(names,dbNetworks)
const safeBinding=gateway.safe
const endpoints=authHttp===200 && Number.isInteger(restHttp) && restHttp>=200 && restHttp<500
const status=installed&&connected&&safeBinding&&endpoints
 ? 'STAGE3V_LOCAL_NETWORK_AND_HTTP_DISCOVERED_NOT_JWT_VERIFIED'
 : 'STAGE3V_LOCAL_AUTH_POSTGREST_PREREQUISITES_INCOMPLETE'
const report=[
 'STAGE3V_READ_ONLY_INFRASTRUCTURE_DISCOVERY',
 'COMMIT='+head,
 'LAB_ONLY='+CONTAINER,
 'DB_RPC_INSTALLED='+installed,
 'AUTH_CONTAINER_ON_DB_NETWORK='+(authCount>0),
 'POSTGREST_CONTAINER_ON_DB_NETWORK='+(restCount>0),
 'GATEWAY_54321_BOUND_ONLY_TO_LOOPBACK='+safeBinding,
 'GATEWAY_54321_HOST_BINDINGS='+gateway.details,
 'AUTH_LOCAL_HEALTH_HTTP='+authHttp,
 'REST_LOCAL_GATEWAY_HTTP='+restHttp,
 'REAL_SIGNED_JWT_E2E=false',
 'ACCOUNTING_HTTP_POST_E2E=false',
 'NOTE=Container network and gateway status alone do NOT verify Auth/PostgREST are connected to the intended database.',
 'NOTE=No credentials, tokens, account identities or production URLs queried.',
 'RESULT='+status,
]
const file=join(lab,'STAGE3V_INFRA_DISCOVERY_'+new Date().toISOString()
 .replace(/[-:]/g,'').replace(/[.]/g,'-')+'.txt')
writeFileSync(file,report.join('\n')+'\n',{encoding:'utf8',flag:'wx'})
console.log(status)
console.log('Report: '+file)
