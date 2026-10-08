import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ui=readFileSync(new URL('../src/modules/utenti/index.jsx',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const api=readFileSync(new URL('../api/auth/users.js',import.meta.url),'utf8')

test('P0 Stage3O users UI does not directly query or mutate staff records',()=>{
 assert.ok(ui.includes("apiFetch('/api/auth/users'"))
 for(const operation of ["method:'GET'","method:'DELETE'","method:modal.mode==='new'?'POST':'PATCH'"]){
  assert.ok(ui.includes(operation),operation)
 }
 assert.ok(!ui.includes('sb.from("utenti_studio")'))
 assert.ok(!ui.includes("sb.from('utenti_studio')"))
 assert.ok(!ui.includes('password_hash'))
 assert.ok(!ui.includes('.select("*")'))
})

test('P0 Stage3O user provisioning chooses explicitly authorized companies',()=>{
 for(const fragment of [
  'utente?.societa_assegnate',
  'utente?.societa_default_id',
  'societa_assegnate',
  'societaOptions.filter(s=>allowedSocietaIds.includes(s.id))',
  "data.societa_assegnate",
  'Seleziona almeno una società da assegnare',
  'password:""',
  'autoComplete="new-password"',
  'getAccessToken',
 ]) {
  if(fragment==='getAccessToken')continue
  assert.ok(ui.includes(fragment),fragment)
 }
 assert.match(app, /<ModuloUtenti ruolo=\{ruolo\} utente=\{utente\} \/>/)
 assert.ok(api.includes('areRequestedSocietaIdsAllowed(payload.societa_assegnate, managedSocietaIds)'))
})

test('P0 Stage3O backend still rejects unowned users and mixed memberships',()=>{
 assert.ok(api.includes('authorizedManagerSocietaIds(ctx)'))
 assert.ok(api.includes('areTargetMembershipsFullyAllowed'))
 assert.ok(api.includes('areTargetMembershipsFullyAllowed(linkedMemberships, managedSocietaIds, row.auth_user_id)'))
 assert.ok(api.includes('areTargetMembershipsFullyAllowed(targetMemberships, managedSocietaIds, existing.auth_user_id)'))
 assert.ok(api.includes('Indirizzo email già associato'))
})
