import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  normalizeClienteIds,
  scopedClienteIds,
  areClienteAssignmentsWithinScope,
  loadClientCompanyLinks,
} from '../lib/tenantClientAssignments.js'

const links = [
 {cliente_id:'client-a',societa_id:'company-a'},
 {cliente_id:'client-b',societa_id:'company-b'},
 {cliente_id:'client-shared',societa_id:'company-a'},
 {cliente_id:'client-shared',societa_id:'company-b'},
]

test('P0 client assignment scope cannot be created from a guessed or foreign UUID',()=>{
 assert.deepEqual(normalizeClienteIds(['client-a','client-a','client-b','']),['client-a','client-b'])
 assert.equal(areClienteAssignmentsWithinScope(['client-a'],links,['company-a']),true)
 assert.equal(areClienteAssignmentsWithinScope(['client-b'],links,['company-a']),false)
 assert.equal(areClienteAssignmentsWithinScope(['client-a','client-b'],links,['company-a']),false)
 assert.equal(areClienteAssignmentsWithinScope(['client-shared'],links,['company-a']),true)
 assert.equal(areClienteAssignmentsWithinScope(['client-shared'],links,['company-b']),true)
 assert.equal(areClienteAssignmentsWithinScope(['unknown'],links,['company-a']),false)
 assert.equal(areClienteAssignmentsWithinScope(['client-a'],[],['company-a']),false)
 assert.equal(areClienteAssignmentsWithinScope(['client-a'],links,[]),false)
 assert.equal(areClienteAssignmentsWithinScope([],[],[]),true)
})

test('P0 returned profile only exposes clients linked to that user own companies',()=>{
 assert.deepEqual(
  scopedClienteIds(['client-a','client-b','client-shared'],links,['company-a']),
  ['client-a','client-shared']
 )
 assert.deepEqual(
  scopedClienteIds(['client-a','client-b','client-shared'],links,['company-b']),
  ['client-b','client-shared']
 )
 assert.deepEqual(scopedClienteIds(['client-a'],links,[]),[])
})

test('P0 client link lookup uses service-only link and fails closed on DB errors',async()=>{
 const calls=[]
 const admin={
  from(name) {
   calls.push(name)
   assert.equal(name,'crm_cliente_societa_link')
   return {
    select(cols){
     assert.equal(cols,'cliente_id,societa_id')
     return {
      in(column,ids){
       assert.equal(column,'cliente_id')
       return Promise.resolve({data:links.filter((link)=>ids.includes(link.cliente_id)),error:null})
      },
     }
    },
   }
  },
 }
 const result=await loadClientCompanyLinks(admin,['client-a','client-b'])
 assert.equal(result.length,2)
 assert.deepEqual(calls,['crm_cliente_societa_link'])
 await assert.rejects(
  loadClientCompanyLinks({
   from(){return {select(){return {in(){return Promise.resolve({data:null,error:Error('RLS mismatch')})}}}}},
  },['client-a']),
  /RLS mismatch/
 )
})

test('P0 users API filters GET and validates both POST and PATCH client IDs',()=>{
 const source=readFileSync(new URL('../api/auth/users.js',import.meta.url),'utf8')
 assert.match(source,/visibleUsers\.flatMap\(\(user\) => user\.clienti_assegnati/)
 assert.match(source,/clienti_assegnati: scopedClienteIds\(user\.clienti_assegnati, links, user\.societa_assegnate\)/)
 assert.equal((source.match(/areClienteAssignmentsWithinScope\(/g)||[]).length,2)
 assert.equal((source.match(/loadClientCompanyLinks\(admin, payload\.clienti_assegnati\)/g)||[]).length,2)
 const post=source.slice(source.indexOf("if (req.method === 'POST')"),source.indexOf("if (req.method === 'PATCH')"))
 const patch=source.slice(source.indexOf("if (req.method === 'PATCH')"),source.indexOf("if (req.method === 'DELETE')"))
 assert.ok(post.indexOf('areClienteAssignmentsWithinScope(')<post.indexOf('createAuthUser(admin, payload)'))
 assert.ok(patch.indexOf('areClienteAssignmentsWithinScope(')<patch.indexOf('updateAuthUser(admin, existing.auth_user_id'))
})
