/**
 * Stage3V READ-ONLY: inspect the REAL pinned P0 LAB on 127.0.0.1:55321.
 * 127.0.0.1:54321 belongs to a different local Supabase project and MUST NOT
 * be used as evidence for the isolated accounting laboratory.
 * No credentials, signed login, SQL mutation, or Docker lifecycle operations.
 */
import {execFileSync} from 'node:child_process'
import {existsSync,writeFileSync} from 'node:fs'
import {resolve,join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
 STAGE3V_LAB,STAGE3V_LAB_ORIGIN,STAGE3V_LAB_PORT,STAGE3V_LAB_NETWORK,
 inspectStage3vLocalStack,
} from './stage3v-local-stack.mjs'

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const SHA=/^[a-f0-9]{40}$/i
const arg=process.argv
const pos=arg.indexOf('--expected-commit')
const expected=pos>=0?String(arg[pos+1]||''):''
if(!SHA.test(expected))throw Error('STAGE3V_REQUIRES_PINNED_SHA')
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()
if(head!==expected)throw Error('STAGE3V_GIT_COMMIT_MISMATCH')
const home=process.env.USERPROFILE
if(process.platform!=='win32'||!home)throw Error('STAGE3V_WINDOWS_LAB_ONLY')
const lab=join(home,'FiscoSim-P0-LAB-20261008-164658')
if(!existsSync(lab))throw Error('STAGE3V_ISOLATED_LAB_PATH_MISSING')
const run=(cmd,args,options={})=>execFileSync(cmd,args,{
 encoding:'utf8',timeout:10000,windowsHide:true,...options,
}).trim()
if(run('docker',['inspect','--format','{{.State.Running}}',STAGE3V_LAB.db])!=='true')
 throw Error('STAGE3V_PINNED_DB_CONTAINER_NOT_RUNNING')

const stack=inspectStage3vLocalStack()
const inspectionSQL=`
BEGIN READ ONLY;
SELECT 'STAGE3V_INSTALLED|'||
 (to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL)::text||
 '|CLAIM_RLS|'||
 coalesce((SELECT relrowsecurity::text FROM pg_catalog.pg_class
 WHERE oid=to_regclass('public.fiscosim_general_journal_claim')),'false');
ROLLBACK;
`
const output=run('docker',[
 'exec','-i',STAGE3V_LAB.db,'psql','-X','-v','ON_ERROR_STOP=1',
 '-U','postgres','-d','postgres','-A','-t','-F','|','-P','pager=off',
],{input:inspectionSQL})
const installed=output.includes('STAGE3V_INSTALLED|true|CLAIM_RLS|true')
async function ping(path){
 try{
  const response=await fetch(STAGE3V_LAB_ORIGIN+path,{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(2500),
  })
  await response.body?.cancel()
  return response.status
 }catch{return 'UNREACHABLE'}
}
const [authHttp,restHttp]=await Promise.all([
 ping('/auth/v1/health'),ping('/rest/v1/'),
])
const endpoints=authHttp===200&&Number.isInteger(restHttp)&&
 restHttp>=200&&restHttp<500
const status=installed&&stack.ready&&endpoints
 ? 'STAGE3V_PINNED_LAB_NETWORK_HTTP_DISCOVERED_NOT_JWT_VERIFIED'
 : 'STAGE3V_PINNED_LAB_PREREQUISITES_INCOMPLETE'
const formatBinding=(b)=>b.name+'@'+b.hostIp+':'+b.hostPort+
 '->'+b.containerPort
const report=[
 'STAGE3V_READ_ONLY_INFRASTRUCTURE_DISCOVERY',
 'COMMIT='+head,
 'LAB_ONLY='+STAGE3V_LAB.db,
 'LAB_DOCKER_NETWORK='+STAGE3V_LAB_NETWORK,
 'LAB_GATEWAY='+STAGE3V_LAB.kong,
 'LAB_GATEWAY_PORT='+STAGE3V_LAB_PORT,
 'OTHER_FISCOSIM_LOCAL_STACK_PRESENT='+stack.otherLocalStackPresent,
 'DB_RPC_INSTALLED='+installed,
 'LAB_REQUIRED_SERVICES_PRESENT='+stack.mandatoryPresent,
 'LAB_SERVICES_ONLY_ON_PINNED_NETWORK='+stack.correctNetwork,
 'GATEWAY_55321_PUBLISHED='+stack.gatewayPublished,
 'LAB_ALL_PUBLISHED_PORTS_LOOPBACK='+stack.allLabPortsLoopback,
 'LAB_UNSAFE_HOST_BINDINGS='+(stack.unsafeBindings.map(formatBinding).join(';')||'NONE'),
 'LAB_HOST_BINDINGS='+(stack.portBindings.map(formatBinding).join(';')||'NONE'),
 'AUTH_PINNED_LAB_HEALTH_HTTP='+authHttp,
 'REST_PINNED_LAB_GATEWAY_HTTP='+restHttp,
 'REAL_SIGNED_JWT_E2E=false',
 'ACCOUNTING_HTTP_POST_E2E=false',
 'NOTE=Auth/PostgREST HTTP is from 55321 only; 54321 belongs to a separate stack.',
 'NOTE=Network and gateway status alone do NOT verify the database connection and signed JWT identity.',
 'NOTE=No credentials, tokens, account identities or production URLs queried.',
 'RESULT='+status,
]
const file=join(lab,'STAGE3V_INFRA_DISCOVERY_'+new Date().toISOString()
 .replace(/[-:]/g,'').replace(/[.]/g,'-')+'.txt')
writeFileSync(file,report.join('\n')+'\n',{encoding:'utf8',flag:'wx'})
console.log(status)
console.log('Report: '+file)
