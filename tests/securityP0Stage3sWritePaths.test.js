import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import clientHandler,{normalizeCrmUpdate} from '../api/studio/client-update.js'
import ageconHandler,{sanitizeAvvisoWrite} from '../api/studio/agecon-write.js'
import reviewHandler,{sanitizeArchiveRequest} from '../api/studio/revision-archive.js'

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const crm=src('sql/security_p0/49_stage3s_shared_crm_update_LAB_ONLY.sql')
const age=src('sql/security_p0/50_stage3s_agecon_write_LAB_ONLY.sql')
const revision=src('sql/security_p0/51_stage3s_declaration_archive_LAB_ONLY.sql')

test('Stage3S all three handlers import and normalize write requests without DB access',()=>{
 for(const h of [clientHandler,ageconHandler,reviewHandler])assert.equal(typeof h,'function')
 assert.deepEqual(normalizeCrmUpdate('edit',{nome:' ABC ',note:'test'}),{nome:'ABC',note:'test'})
 assert.deepEqual(normalizeCrmUpdate('modules',{moduli_attivi:['iva','f24']}),{moduli_attivi:['iva','f24']})
 assert.deepEqual(normalizeCrmUpdate('deactivate',{}),{})
 for(const bad of [{societa_id:'company-b'},{created_by:'foreign'},{attivo:false},
  {id:'cross-company'},{moduli_attivi:['iva']}]){
  assert.equal(normalizeCrmUpdate('edit',bad),null)
 }
 assert.equal(normalizeCrmUpdate('modules',{moduli_attivi:['iva','iva']}),null)
 assert.equal(normalizeCrmUpdate('modules',{moduli_attivi:['never']}),null)
 assert.equal(normalizeCrmUpdate('deactivate',{attivo:false}),null)
 assert.equal(normalizeCrmUpdate('oops',{}),null)
})

test('Stage3S AgeCon refuses owner overrides and invalid dates/amounts',()=>{
 assert.deepEqual(sanitizeAvvisoWrite('create',{cliente_id:'one',tipo_avviso:'36-bis',importo:'101.23'}),
   {cliente_id:'one',tipo_avviso:'36-bis',importo:'101.23'})
 assert.equal(sanitizeAvvisoWrite('create',{cliente_id:'one',tipo_avviso:'36-bis',societa_id:'company-b'}),null)
 assert.equal(sanitizeAvvisoWrite('update',{cliente_id:'another'}),null)
 assert.equal(sanitizeAvvisoWrite('update',{created_by:'another'}),null)
 assert.equal(sanitizeAvvisoWrite('update',{data_scadenza:'tomorrow'}),null)
 assert.equal(sanitizeAvvisoWrite('create',{cliente_id:'one',tipo_avviso:'36-bis',importo:'-10'}),null)
 assert.deepEqual(sanitizeAvvisoWrite('close',{}),{})
 assert.equal(sanitizeAvvisoWrite('close',{id:'untrusted'}),null)
})

test('Stage3S declaration archive requires single client path and substantive reason',()=>{
 const valid={societa_id:'a',cliente_id:'client-a',report:{anno_imposta:2026},
   num_documenti:2,motivazione:'Revisione completata e verificata'}
 assert.ok(sanitizeArchiveRequest(valid))
 assert.equal(sanitizeArchiveRequest({...valid,cliente_id:null}),null)
 assert.equal(sanitizeArchiveRequest({...valid,nuovo_cliente:{nome:'N'}}),null)
 assert.equal(sanitizeArchiveRequest({...valid,num_documenti:52}),null)
 assert.equal(sanitizeArchiveRequest({...valid,motivazione:'short'}),null)
 assert.ok(sanitizeArchiveRequest({
  ...valid,cliente_id:null,nuovo_cliente:{nome:'Nuovo'},
  motivazione_cliente:'Nuovo incarico verificato'
 }))
})

test('Stage3S SQL RPCs guarded, SEC INVOKER, browser-execute denied, audit in transaction',()=>{
 for(const [ddl,name] of [
  [crm,'fiscosim_studio_update_cliente'],
  [age,'fiscosim_studio_write_avviso'],
  [revision,'fiscosim_studio_archive_revisione'],
 ]){
  assert.ok(ddl.includes(name),name)
  assert.match(ddl,/SECURITY INVOKER/)
  assert.doesNotMatch(ddl,/SECURITY DEFINER/)
  assert.match(ddl,/REVOKE ALL ON FUNCTION/)
  assert.match(ddl,/FROM PUBLIC,anon,authenticated/)
  assert.match(ddl,/TO service_role/)
  assert.match(ddl,/COMMIT;/)
  assert.match(ddl,/fiscosim_operational_audit/)
  assert.match(ddl,/p_auth_user_id/)
  assert.match(ddl,/p_societa_id|p_cliente_id/)
 }
 assert.match(crm,/FOR UPDATE/)
 assert.match(crm,/NOT EXISTS \(\s*SELECT 1 FROM public\.utenti_studio/)
 assert.match(crm,/FROM public\.crm_cliente_societa_link l/)
 assert.match(age,/UPDATE public\.avvisi_ade SET/)
 assert.match(age,/WHERE id=p_avviso_id AND societa_id=p_societa_id/)
 assert.match(age,/esito='chiuso'/)
 assert.doesNotMatch(age,/DELETE FROM public\.avvisi_ade/)
 assert.match(revision,/v_cliente_id:=public\.fiscosim_studio_create_cliente/)
 assert.match(revision,/p_report,p_num_documenti,v_staff\.id/)
})

test('Stage3S UI routes no longer issue direct AgeCon or declaration DML',()=>{
 const clientUi=src('src/modules/clienti/index.jsx')
 const ageUi=src('src/modules/agecon/index.jsx')
 const revUi=src('src/modules/revisione_dich/index.jsx')
 const importRepo=src('src/modules/import_unificato/data/importRepo.js')
 assert.match(clientUi,/apiFetch\('\/api\/studio\/client-update'/)
 assert.match(ageUi,/apiFetch\('\/api\/studio\/agecon-write'/)
 assert.match(revUi,/apiFetch\('\/api\/studio\/revision-archive'/)
 assert.doesNotMatch(ageUi,/sb\.from\('avvisi_ade'\)\.(insert|update|delete)/)
 assert.doesNotMatch(revUi,/sb\.from\('revisioni_dichiarativi'\)\.(insert|update|delete)/)
 assert.doesNotMatch(importRepo,/sb\.from\('avvisi_ade'\)\.insert/)
 assert.match(importRepo,/conferma società, cliente e motivazione/)
 assert.match(ageUi,/selezionalo esplicitamente/)
 assert.match(revUi,/societaSelId/)
})

test('Stage3S all service routes require signed session context, not arbitrary body identity',()=>{
 for(const p of ['api/studio/client-update.js','api/studio/agecon-write.js',
  'api/studio/revision-archive.js']){
  const s=src(p)
  assert.match(s,/requireApiAuth\(req,res/)
  assert.match(s,/hasSupabaseServiceRoleConfigured\(\)/)
  assert.match(s,/scopedCompanyIds\(ctx\)/)
  assert.match(s,/p_auth_user_id:ctx\.user\.id/)
  assert.doesNotMatch(s,/\.from\(['"](?:clienti|avvisi_ade|revisioni_dichiarativi)['"]\)\.insert/)
 }
})
