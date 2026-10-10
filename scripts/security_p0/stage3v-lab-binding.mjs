/**
 * Stage3V: compare the signed-JWT HTTP fixture graph against the *pinned*
 * local PostgreSQL LAB. Read-only SQL; no Docker lifecycle operations.
 * This compares independently read data, not merely Docker network overlap.
 * A byte-identical database clone cannot be distinguished by row comparison.
 */
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {existsSync,readdirSync,readFileSync} from 'node:fs'
import {resolve,join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import { STAGE3V_LAB,assertStage3vLocalStackIsolated } from './stage3v-local-stack.mjs'

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const BRANCH='security/p0-isolated-hardening-20261008'
const CONTAINER=STAGE3V_LAB.db
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const SHA=/^[0-9a-f]{40}$/i
const FIELDS=new Set(['RPC','COMPANY','ACCOUNT','AUTH','MEMBERSHIP'])
const run=(command,args,options={})=>execFileSync(command,args,{
 encoding:'utf8',windowsHide:true,timeout:12000,...options,
}).trim()
const asUUID=(v)=>{assert.match(String(v||''),UUID);return String(v).toLowerCase()}

export function isStage3vAllowedCheckout({root,branch,userProfile}) {
 if(branch===BRANCH)return true
 return branch==='' && resolve(root).toLowerCase()===
  resolve(join(userProfile,'FiscoSim-P0-Stage3V-ReadOnly')).toLowerCase()
}


export function parseStage3vBindingOutput(output) {
 const result={RPC:[],COMPANY:[],ACCOUNT:[],AUTH:[],MEMBERSHIP:[]}
 for(const line of String(output||'').split(/\r?\n/)){
  if(!line.startsWith('STAGE3V_'))continue
  const parts=line.split('|')
  const kind=parts[0].slice('STAGE3V_'.length)
  if(!FIELDS.has(kind))throw Error('STAGE3V_UNEXPECTED_DB_MARKER')
  result[kind].push(parts.slice(1))
 }
 return result
}

export function assertStage3vFixtureParity(local,companies,accounts,authIds=[]) {
 assert.deepEqual(local.RPC,[['true']],'Stage3U service-role RPC/RLS/ACL absent')
 assert.equal(local.COMPANY.length,2,'expected exactly two pinned LAB companies')
 assert.equal(local.ACCOUNT.length,4,'expected exactly four LAB accounts')
 for(const company of companies){
  const rows=local.COMPANY.filter(x=>x.length===3 && x[0]===asUUID(company.id))
  assert.equal(rows.length,1,'LAB company differs from PostgREST company')
  assert.equal(rows[0][1],company.codice,'LAB company code mismatches HTTP')
  assert.equal(rows[0][2],String(company.attiva),'LAB company state mismatches HTTP')
  assert.match(rows[0][1],/^STAGE3V-[A-Za-z0-9_-]{1,80}$/)
  assert.equal(rows[0][2],'true')
 }
 for(const account of accounts){
  const rows=local.ACCOUNT.filter(x=>x.length===3 && x[0]===asUUID(account.id))
  assert.equal(rows.length,1,'LAB account missing or differs from HTTP')
  assert.equal(rows[0][1],asUUID(account.societa_id))
  assert.equal(rows[0][2],String(account.attivo))
  assert.equal(rows[0][2],'true')
 }
 if(authIds.length){
  assert.equal(authIds.length,2)
  assert.equal(local.AUTH.length,2,'signed identities not present in pinned DB auth.users')
  assert.equal(local.MEMBERSHIP.length,2,'signed identities have no verified A/B memberships')
  for(const {id,company} of authIds){
   assert.equal(local.AUTH.filter(x=>x.length===1&&x[0]===asUUID(id)).length,1)
   assert.equal(local.MEMBERSHIP.filter(x=>x.length===2&&
    x[0]===asUUID(id)&&x[1]===asUUID(company)).length,1)
  }
 }
}

export async function assertStage3vPinnedLab({expectedCommit,fixture,admin,authIds=[]}) {
 if(!SHA.test(String(expectedCommit||'')))throw Error('STAGE3V_REQUIRES_PINNED_SHA')
 if(process.platform!=='win32'||!process.env.USERPROFILE)
  throw Error('STAGE3V_WINDOWS_LAB_ONLY')
 const lab=join(process.env.USERPROFILE,'FiscoSim-P0-LAB-20261008-164658')
 if(!existsSync(lab))throw Error('STAGE3V_ISOLATED_LAB_PATH_MISSING')
 // A detached worktree is the intended operator setup. Accept it ONLY at
 // the fixed isolated P0 path, with the exact pinned SHA and clean tree.
 const checkoutBranch=run('git',['branch','--show-current'],{cwd:ROOT})
 if(run('git',['rev-parse','HEAD'],{cwd:ROOT})!==expectedCommit ||
    !isStage3vAllowedCheckout({
     root:ROOT,branch:checkoutBranch,userProfile:process.env.USERPROFILE,
    }))
  throw Error('STAGE3V_UNEXPECTED_GIT_CHECKOUT')
 if(run('git',['status','--porcelain'],{cwd:ROOT}))
  throw Error('STAGE3V_DIRTY_WORKTREE')
 const proofs=readdirSync(lab).filter(n=>/^STAGE3U_PERSISTENT_LAB_INSTALL_.*\.txt$/i.test(n))
 if(!proofs.some(name=>{
  const content=readFileSync(join(lab,name),'utf8')
  return content.includes('STAGE3U_PERSISTENT_LAB_INSTALL_PASS') &&
   content.includes('LAB_ONLY='+CONTAINER) &&
   content.includes('3U_PERSISTENT_INSTALL|SCHEMA_PRESENT|NO_FIXTURE_ROWS|ACL_PASS')
 }))throw Error('STAGE3V_PRIOR_STAGE3U_LAB_PROOF_MISSING')
 if(run('docker',['inspect','--format','{{.State.Running}}',CONTAINER])!=='true')
  throw Error('STAGE3V_PINNED_DB_NOT_RUNNING')
 // Reject a wrongly-targeted 54321 stack and any wildcard-published LAB port.
 // Runs BEFORE service-role queries, authentication, or persistent HTTP POST.
 assertStage3vLocalStackIsolated()

 const companies=Object.values(fixture).map(f=>asUUID(f.company))
 const accounts=Object.values(fixture).flatMap(f=>[asUUID(f.debit),asUUID(f.credit)])
 assert.equal(new Set(companies).size,2)
 assert.equal(new Set(accounts).size,4)
 const auth=authIds.map(x=>({id:asUUID(x.id),company:asUUID(x.company)}))
 const set=(values)=>values.map(x=>"'"+x+"'::uuid").join(',')
 const sql=[
  'BEGIN READ ONLY;',
  "SELECT 'STAGE3V_RPC|'||(to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL AND coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.fiscosim_general_journal_claim')),false) AND has_function_privilege('service_role','public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE') AND NOT has_function_privilege('anon','public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE'))::text;",
  "SELECT 'STAGE3V_COMPANY|'||id||'|'||codice||'|'||attiva::text FROM public.societa WHERE id IN ("+set(companies)+");",
  "SELECT 'STAGE3V_ACCOUNT|'||id||'|'||societa_id||'|'||attivo::text FROM public.piano_conti WHERE id IN ("+set(accounts)+");",
  ...(auth.length?[
   "SELECT 'STAGE3V_AUTH|'||id FROM auth.users WHERE id IN ("+set(auth.map(x=>x.id))+");",
   "SELECT DISTINCT 'STAGE3V_MEMBERSHIP|'||us.auth_user_id||'|'||m.societa_id FROM public.utenti_studio us JOIN public.utenti_studio_societa m ON m.utente_id=us.id AND m.auth_user_id=us.auth_user_id WHERE us.auth_user_id IN ("+set(auth.map(x=>x.id))+") AND m.societa_id IN ("+set(companies)+") AND us.attivo IS TRUE AND us.ruolo IN ('owner','admin') AND m.ruolo IN ('owner','admin');",
  ]:[]),
  'ROLLBACK;',
 ].join('\n')
 let raw
 try{
  raw=run('docker',['exec','-i',CONTAINER,'psql','-X','-v','ON_ERROR_STOP=1',
   '-U','postgres','-d','postgres','-A','-t','-P','pager=off'],{input:sql})
 }catch{throw Error('STAGE3V_PINNED_DB_READ_ONLY_PROBE_FAILED')}
 const local=parseStage3vBindingOutput(raw)
 const companyRead=await admin.from('societa').select('id,codice,attiva').in('id',companies)
 const accountRead=await admin.from('piano_conti').select('id,societa_id,attivo').in('id',accounts)
 if(companyRead.error||accountRead.error)throw Error('STAGE3V_HTTP_DB_READ_FAILED')
 assertStage3vFixtureParity(local,companyRead.data||[],accountRead.data||[],auth)
 // The local and HTTP queries must contain precisely the intended fixture IDs.
 assert.deepEqual(new Set((companyRead.data||[]).map(x=>x.id)),new Set(companies))
 assert.deepEqual(new Set((accountRead.data||[]).map(x=>x.id)),new Set(accounts))
 console.log('STAGE3V_PINNED_LAB_HTTP_FIXTURE_PARITY_PASS (read-only; not signed-JWT E2E)')
}
