import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
 scopedCompanyIds,allowedClientIds,rowIsAuthorized,canReadFiscalResource,
 clientSelectionLimited,listScopedClients,listScopedFiscalRows,listScopedStaff,
} from '../lib/fiscalReadScope.js'

const links=[
 {cliente_id:'a',societa_id:'company-a'},
 {cliente_id:'shared',societa_id:'company-a'},
 {cliente_id:'shared',societa_id:'company-b'},
 {cliente_id:'b',societa_id:'company-b'},
]
const context={user:{id:'auth-a'},profile:{
 auth_user_id:'auth-a',attivo:true,ruolo:'owner',
 societa_assegnate:['company-a']
}}

test('Stage3R verified company scope denies forged actor or disabled session',()=>{
 assert.deepEqual(scopedCompanyIds(context),['company-a'])
 assert.deepEqual(scopedCompanyIds({...context,user:{id:'auth-b'}}),[])
 assert.deepEqual(scopedCompanyIds({...context,profile:{...context.profile,attivo:false}}),[])
 assert.deepEqual(scopedCompanyIds({...context,profile:{...context.profile,societa_assegnate:[]}}),[])
})

test('Stage3R CRM A/B shared customer cannot share its fiscal records',()=>{
 const scope={companies:['company-a'],links,clientIds:['a','shared']}
 assert.deepEqual(allowedClientIds(links,scope.companies,context.profile),['a','shared'])
 assert.equal(rowIsAuthorized({societa_id:'company-a',cliente_id:'shared'},scope,context.profile),true)
 assert.equal(rowIsAuthorized({societa_id:'company-b',cliente_id:'shared'},scope,context.profile),false)
 assert.equal(rowIsAuthorized({societa_id:'company-a',cliente_id:'b'},scope,context.profile),false)
 assert.equal(rowIsAuthorized({societa_id:'company-a',cliente_id:null,created_by:'x'},scope,context.profile),true)
 assert.equal(rowIsAuthorized({societa_id:'company-a',cliente_id:null,created_by:'x'},scope,{id:'different',ruolo:'collaboratore'}),false)
 assert.equal(rowIsAuthorized({societa_id:'company-a',cliente_id:null,created_by:'staff'},scope,{id:'staff',ruolo:'collaboratore'}),true)
})

test('Stage3R limited collaborator can see only explicitly assigned CRM ID',()=>{
 const profile={...context.profile,ruolo:'collaboratore',permessi:{clienti:{solo_assegnati:true}},clienti_assegnati:['shared']}
 assert.equal(clientSelectionLimited(profile),true)
 assert.deepEqual(allowedClientIds(links,['company-a'],profile),['shared'])
 assert.deepEqual(allowedClientIds(links,['company-b'],profile),['shared'])
 assert.deepEqual(allowedClientIds(links,['company-a'],{...profile,clienti_assegnati:['b']}),[])
})

function dbMock(datasets){
 const calls=[]
 const client={
  calls,
  from(table){
   let col='',ids=[],active=false
   const query={
    select(){return query},
    in(name,values){col=name;ids=values;return query},
    eq(name,value){if(name==='attivo')active=value;return query},
    limit(){return query},
    then(resolve,reject){
     let rows=(datasets[table]||[])
     if(ids.length)rows=rows.filter(x=>ids.includes(x[col]))
     else rows=[]
     if(active)rows=rows.filter(x=>x.attivo===true)
     calls.push({table,col,ids})
     return Promise.resolve({data:rows,error:null}).then(resolve,reject)
    }
   }
   return query
  }
 }
 return client
}

test('Stage3R scoped read functions query only allowed IDs/companies',async()=>{
 const db=dbMock({
  clienti:[{id:'a',attivo:true},{id:'shared',attivo:true},{id:'b',attivo:true}],
  avvisi_ade:[
   {societa_id:'company-a',cliente_id:'a'},
   {societa_id:'company-a',cliente_id:'shared'},
   {societa_id:'company-b',cliente_id:'shared'},
  ],
 })
 const scope={companies:['company-a'],links,clientIds:['a','shared']}
 assert.deepEqual((await listScopedClients(db,scope)).map(x=>x.id),['a','shared'])
 assert.equal((await listScopedFiscalRows(db,'avvisi_ade',scope,context.profile,scope.companies)).length,2)
 assert.equal(db.calls.some(c=>c.table==='avvisi_ade'&&c.ids.includes('company-b')),false)
})

test('Stage3R staff selectors require verified auth linkage and return minimal projection',async()=>{
 const db=dbMock({
  utenti_studio_societa:[
   {utente_id:'staff-a',auth_user_id:'auth-a',societa_id:'company-a'},
   {utente_id:'staff-b',auth_user_id:'auth-b',societa_id:'company-b'},
  ],
  utenti_studio:[
   {id:'staff-a',auth_user_id:'auth-a',nome:'A',cognome:'One',ruolo:'owner',attivo:true,password_hash:'private'},
   {id:'staff-b',auth_user_id:'auth-b',nome:'B',cognome:'Two',ruolo:'admin',attivo:true},
  ],
 })
 const users=await listScopedStaff(db,['company-a'])
 assert.deepEqual(users,[{id:'staff-a',nome:'A',cognome:'One',ruolo:'owner'}])
 assert.equal(JSON.stringify(users).includes('password_hash'),false)
})

test('Stage3R read endpoint is GET-only, service-scoped and never writes',()=>{
 const src=readFileSync(new URL('../api/studio/fiscal-read.js',import.meta.url),'utf8')
 for(const x of ["methods:'GET, OPTIONS'","req.method!=='GET'",'hasSupabaseServiceRoleConfigured',
  'resolveFiscalScope','listScopedClients','listScopedFiscalRows','listScopedStaff','Cache-Control'])
  assert.ok(src.includes(x),x)
 assert.doesNotMatch(src,/\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
 assert.match(src,/clienti:byId\.get\(row\.cliente_id\)\|\|null/)
})

test('Stage3R server enforces module read privilege, regardless of UI routing',()=>{
 const owner={ruolo:'owner'}
 const collab={ruolo:'collaboratore',permessi:{clienti:{leggi:true},revisione_dich:{leggi:false}}}
 assert.equal(canReadFiscalResource(owner,'avvisi_ade'),true)
 assert.equal(canReadFiscalResource(collab,'clienti'),true)
 assert.equal(canReadFiscalResource(collab,'avvisi_ade'),false)
 assert.equal(canReadFiscalResource(collab,'revisioni_dichiarativi'),false)
 assert.equal(canReadFiscalResource({ruolo:'collaboratore',permessi:{agecon:{leggi:true}}},'avvisi_ade'),true)
 assert.equal(canReadFiscalResource(null,'clienti'),false)
 const api=readFileSync(new URL('../api/studio/fiscal-read.js',import.meta.url),'utf8')
 assert.match(api,/canReadFiscalResource\(ctx\.profile,resource\)/)
 assert.match(api,/status\(403\)/)
})
