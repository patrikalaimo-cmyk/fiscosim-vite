import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSessionProfile, readMembershipRows } from '../lib/authMembership.js'

function fakeAdmin({profile=null,assignments=[]}={}) {
 const calls=[]
 return {
  calls,
  from(table) {
   let filters=[]
   const query={
    select() {return query},
    eq(column,value){filters.push([column,value]);return query},
    order(){return query},
    then(resolve,reject){return Promise.resolve({data:assignments,error:null}).then(resolve,reject)},
    maybeSingle() {
     if(table==='utenti_studio') {
      const id=filters.find(([c])=>c==='auth_user_id')?.[1]
      const active=filters.find(([c])=>c==='attivo')?.[1]
      return Promise.resolve({data: id===profile?.auth_user_id && active===true ? profile : null,error:null})
     }
     return Promise.resolve({data:null,error:null})
    },
   }
   calls.push(table)
   return query
  }
 }
}

test('Stage3N membership lookup never adopts stale rows by staff profile ID',async()=>{
 const db=fakeAdmin({assignments:[
  {utente_id:'staff-a',auth_user_id:'old-auth',societa_id:'company-a'},
  {utente_id:'staff-b',auth_user_id:'new-auth',societa_id:'company-b'},
  {utente_id:'staff-a',auth_user_id:'new-auth',societa_id:'company-c'},
 ]})
 const rows=await readMembershipRows(db,{authUserId:'new-auth',utenteId:'staff-a'})
 assert.deepEqual(rows,[{utente_id:'staff-a',auth_user_id:'new-auth',societa_id:'company-c'}])
 assert.equal(db.calls.filter(t=>t==='utenti_studio_societa').length,1)
})

test('Stage3N session requires direct auth ID and matching persisted membership',async()=>{
 const profile={id:'staff-a',auth_user_id:'auth-a',attivo:true,nome:'Tester',ruolo:'owner'}
 const db=fakeAdmin({profile,assignments:[
  {utente_id:'staff-a',auth_user_id:'auth-a',societa_id:'company-a',is_default:true},
 ]})
 const session=await buildSessionProfile(db,{authUser:{id:'auth-a',email:'q@example.invalid'}})
 assert.deepEqual(session?.societa_assegnate,['company-a'])
 assert.equal(session?.societa_default_id,'company-a')
})

test('Stage3N refuses sessions with wrong auth ID, no memberships or stale auth link',async()=>{
 const profile={id:'staff-a',auth_user_id:'auth-a',attivo:true,ruolo:'owner'}
 const goodDb=fakeAdmin({profile,assignments:[]})
 assert.equal(await buildSessionProfile(goodDb,{authUser:{id:'auth-a'}}),null)
 const wrongDb=fakeAdmin({profile,assignments:[
  {utente_id:'staff-a',auth_user_id:'old-auth',societa_id:'company-a'}
 ]})
 assert.equal(await buildSessionProfile(wrongDb,{authUser:{id:'auth-a'}}),null)
 const noProfileDb=fakeAdmin({profile,assignments:[]})
 assert.equal(await buildSessionProfile(noProfileDb,{authUser:{id:'other-auth',email:'q@example.invalid'}}),null)
})
