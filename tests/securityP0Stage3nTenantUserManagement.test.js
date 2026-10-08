import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
 authorizedManagerSocietaIds,
 areRequestedSocietaIdsAllowed,
 areTargetMembershipsFullyAllowed,
 visibleMembershipsForManager,
} from '../lib/tenantUserManagement.js'

const actor = {
 user:{id:'auth-a'},
 profile:{auth_user_id:'auth-a',attivo:true,societa_assegnate:['company-a']}
}
const members = [
 {utente_id:'staff-1',societa_id:'company-a'},
 {utente_id:'staff-1',societa_id:'company-b'},
]

test('P0 management scope comes exclusively from verified linked active profile',()=>{
 assert.deepEqual(authorizedManagerSocietaIds(actor),['company-a'])
 assert.deepEqual(authorizedManagerSocietaIds({...actor,user:{id:'other'}}),[])
 assert.deepEqual(authorizedManagerSocietaIds({...actor,profile:{...actor.profile,attivo:false}}),[])
 assert.deepEqual(authorizedManagerSocietaIds({...actor,profile:{...actor.profile,societa_assegnate:[]}}),[])
 assert.deepEqual(authorizedManagerSocietaIds({...actor,profile:{...actor.profile,auth_user_id:''}}),[])
})

test('P0 manager must specify assigned companies without cross-company escalation',()=>{
 assert.equal(areRequestedSocietaIdsAllowed(['company-a'],['company-a']),true)
 assert.equal(areRequestedSocietaIdsAllowed(['company-a','company-b'],['company-a']),false)
 assert.equal(areRequestedSocietaIdsAllowed([],['company-a']),false)
 assert.equal(areRequestedSocietaIdsAllowed(['company-a'],[]),false)
})

test('P0 manager cannot mutate a user with any membership outside its scope',()=>{
 assert.equal(areTargetMembershipsFullyAllowed(members,['company-a']),false)
 assert.equal(areTargetMembershipsFullyAllowed([members[0]],['company-a']),true)
 assert.equal(areTargetMembershipsFullyAllowed([],['company-a']),false)
 assert.deepEqual(visibleMembershipsForManager(members,['company-a']),[members[0]])
})

test('P0 service-role users API filters GET and checks scope before CRUD',()=>{
 const source = readFileSync(new URL('../api/auth/users.js',import.meta.url),'utf8')
 const guard = source.indexOf('const managedSocietaIds = authorizedManagerSocietaIds(ctx)')
 const get = source.indexOf("if (req.method === 'GET')")
 const post = source.indexOf("if (req.method === 'POST')")
 const patch = source.indexOf("if (req.method === 'PATCH')")
 const remove = source.indexOf("if (req.method === 'DELETE')")
 assert.ok(guard >= 0 && guard < get)
 assert.ok(source.includes('visibleMembershipsForManager'))
 assert.ok(source.indexOf('visibleMembershipsForManager(linkedMemberships') > get)
 assert.ok(source.indexOf('areRequestedSocietaIdsAllowed',post) < patch)
 assert.ok(source.indexOf('areTargetMembershipsFullyAllowed',patch) < remove)
 assert.ok(source.indexOf('areTargetMembershipsFullyAllowed',remove) > remove)
 assert.ok(source.includes('Indirizzo email già associato'))
 assert.ok(!source.includes('resolveProvisionedSocietaIds'))
})

test('P0 session profile cannot be resolved by email or stale staff membership',()=>{
 const source=readFileSync(new URL('../lib/authMembership.js',import.meta.url),'utf8')
 const section=source.slice(source.indexOf('export async function buildSessionProfile'),source.indexOf('export async function syncAuthUserMetadata'))
 assert.ok(!section.includes('readStudioUserByEmail('))
 assert.ok(section.includes('if (membershipRows.length === 0) return null'))
 assert.ok(section.includes('linkedProfile.auth_user_id'))
 const rows=source.slice(source.indexOf('export async function readMembershipRows'),source.indexOf('export async function listMembershipRowsForUtenteIds'))
 assert.ok(rows.includes('deny-unlinked-membership'))
 assert.ok(rows.includes('row?.utente_id'))
})
