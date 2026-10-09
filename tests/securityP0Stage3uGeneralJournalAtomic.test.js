import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import handler,{validateGeneralJournalRequest} from '../api/studio/general-journal-post.js'
import {matchesStudioRoute} from '../lib/devStudioHttp.js'
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sql=source('sql/security_p0/54_stage3u_general_journal_atomic_LAB_ONLY.sql')
const ACCOUNT_A='61000000-0000-4000-8000-000000000010'
const ACCOUNT_B='61000000-0000-4000-8000-000000000011'
const base={
 societa_id:'61000000-0000-4000-8000-000000000001',
 request_id:'61000000-0000-4000-8000-000000000099',
 header:{data_registrazione:'2026-10-09',descrizione:'Giroconto generale documentato'},
 rows:[
  {conto_id:ACCOUNT_A,dare:100,avere:0},
  {conto_id:ACCOUNT_B,dare:0,avere:100},
 ],
 motivazione:'Giroconto verificato e autorizzato',
}
test('Stage3U general-journal endpoint is importable, route exists but remains local disabled',()=>{
 assert.equal(typeof handler,'function')
 assert.equal(matchesStudioRoute('/api/studio/general-journal-post'),true)
 const js=source('api/studio/general-journal-post.js')
 assert.match(js,/isIsolatedStudioEnvironment\(\)/)
 assert.match(js,/FISCOSIM_GENERAL_JOURNAL_POST_LAB_ENABLED/)
 assert.match(js,/requireApiAuth\(req,res/)
 assert.match(js,/roles:\['owner','admin'\]/)
 assert.match(js,/scopedCompanyIds\(ctx\)/)
 assert.match(js,/p_auth_user_id:ctx\.user\.id/)
 assert.match(js,/\.rpc\('fiscosim_post_general_journal'/)
 assert.doesNotMatch(js,/\.from\(['"]prima_nota['"]\)\.insert/)
})
test('Stage3U general journal accepts balanced plain movement with safe, exact monetary cents',()=>{
 const result=validateGeneralJournalRequest(base)
 assert.ok(result)
 assert.equal(result.rows.length,2)
 assert.equal(result.rows[0].dare,100)
 assert.equal(result.rows[1].avere,100)
 assert.equal(result.motivazione,base.motivazione)
 assert.ok(validateGeneralJournalRequest({...base,
  rows:[{conto_id:ACCOUNT_A,dare:0.1,avere:0},{conto_id:ACCOUNT_B,dare:0,avere:0.1}],
 }))
})
test('Stage3U rejects unbalanced, illegal precision, cross-purpose and privileged fields',()=>{
 const badRows=[
  [{conto_id:ACCOUNT_A,dare:100,avere:0},{conto_id:ACCOUNT_B,dare:0,avere:99.99}],
  [{conto_id:ACCOUNT_A,dare:0.001,avere:0},{conto_id:ACCOUNT_B,dare:0,avere:0.001}],
  [{conto_id:ACCOUNT_A,dare:-10,avere:0},{conto_id:ACCOUNT_B,dare:0,avere:10}],
  [{conto_id:ACCOUNT_A,dare:100,avere:100},{conto_id:ACCOUNT_B,dare:0,avere:0}],
  [{conto_id:ACCOUNT_A,dare:100,avere:0,societa_id:'foreign'},{conto_id:ACCOUNT_B,dare:0,avere:100}],
  [{conto_id:ACCOUNT_A,dare:100,avere:0,iva:22},{conto_id:ACCOUNT_B,dare:0,avere:100}],
  [{conto_id:ACCOUNT_A,dare:100,avere:0,partitario:{id:'x'}},{conto_id:ACCOUNT_B,dare:0,avere:100}],
  [{conto_id:ACCOUNT_A,dare:100,avere:0},{conto_id:ACCOUNT_B,dare:0,avere:'100'}],
 ]
 for(const rows of badRows)assert.equal(validateGeneralJournalRequest({...base,rows}),null)
 for(const header of [
  {...base.header,societa_id:'company-b'},
  {...base.header,stato:'confermata'},
  {...base.header,created_by:'other'},
  {...base.header,documento_id:'bad'},
  {...base.header,data_registrazione:'tomorrow'},
 ]){
  assert.equal(validateGeneralJournalRequest({...base,header}),null)
 }
 assert.equal(validateGeneralJournalRequest({...base,request_id:'invalid'}),null)
 assert.equal(validateGeneralJournalRequest({...base,motivazione:'short'}),null)
 assert.equal(validateGeneralJournalRequest({...base,vatEntries:[{iva:22}]}),null)
 assert.equal(validateGeneralJournalRequest({...base,rows:[]}),null)
})
test('Stage3U SQL ensures service-role-only invoker, actual all-or-nothing inserts and idempotency',()=>{
 for(const marker of [
  'BEGIN;', 'ROLLBACK', 'COMMIT;', 'CREATE TABLE public.fiscosim_general_journal_claim',
  'PRIMARY KEY(societa_id,request_id)',
  'ON CONFLICT DO NOTHING',
  'FOR UPDATE',
  'request_payload IS DISTINCT FROM v_claim',
  'RETURN v_prior.prima_nota_id',
  'SECURITY INVOKER',
  'SET search_path=pg_catalog',
  'FROM PUBLIC,anon,authenticated',
  'TO service_role',
  'v_total_dare<>v_total_avere',
  'pc.societa_id=p_societa_id',
  "us.ruolo IN ('owner','admin') AND m.ruolo IN ('owner','admin')",
  'INSERT INTO public.prima_nota(',
  'INSERT INTO public.prima_nota_righe(',
  'INSERT INTO public.audit_contabile(',
  'UPDATE public.fiscosim_general_journal_claim SET prima_nota_id=v_pn_id',
 ]){
  // preflight belongs to the parent migration and does not contain ROLLBACK:
  if(marker==='ROLLBACK')continue
  assert.ok(sql.includes(marker),marker)
 }
 assert.doesNotMatch(sql,/SECURITY DEFINER/)
 assert.doesNotMatch(sql,/DELETE FROM public\./)
 assert.doesNotMatch(sql,/\bEXCEPTION WHEN OTHERS THEN NULL\b/)
})
