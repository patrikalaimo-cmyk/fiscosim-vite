import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sanitizeNewClientData } from '../api/studio/client-create.js'
import { canReadFiscalResource } from '../lib/fiscalReadScope.js'

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const ddl=read('sql/security_p0/47_stage3r_atomic_client_create_LAB_ONLY.sql')
const dbTransition=read('sql/security_p0/45_stage3q_fiscal_owner_rls_LAB_ONLY.sql')
const createApi=read('api/studio/client-create.js')
const readerApi=read('api/studio/fiscal-read.js')
const ui=read('src/modules/clienti/index.jsx')
const agecon=read('src/modules/agecon/index.jsx')
const revisions=read('src/modules/revisione_dich/index.jsx')

test('Stage3R user-supplied CRM data is strictly allowlisted',()=>{
 assert.deepEqual(sanitizeNewClientData({nome:' Ada ',email_cc:[],moduli_attivi:['iva']}),
  {nome:'Ada',email_cc:[],moduli_attivi:['iva']})
 assert.equal(sanitizeNewClientData({nome:'A',id:'foreign'}),null)
 assert.equal(sanitizeNewClientData({nome:'A',societa_id:'injected'}),null)
 assert.equal(sanitizeNewClientData({nome:'A',auth_user_id:'injected'}),null)
 assert.equal(sanitizeNewClientData({nome:'A',attivo:false}),null)
 assert.equal(sanitizeNewClientData({nome:'A',email_cc:'not-array'}),null)
 assert.equal(sanitizeNewClientData({nome:''}),null)
 assert.equal(sanitizeNewClientData(null),null)
})

test('Stage3R atomic RPC has one transaction boundary and no browser permissions',()=>{
 for(const snippet of [
  "local-atomic-crm-link-rpc-only",
  "clienti_company_boundary",
  "INSERT INTO public.clienti",
  "INSERT INTO public.crm_cliente_societa_link",
  "RETURNING id INTO v_cliente_id",
  "assigned_by,decision_reason",
  "SECURITY INVOKER",
  "m.auth_user_id=us.auth_user_id",
  "us.auth_user_id=p_auth_user_id",
  "us.attivo IS TRUE",
  "company.attiva IS TRUE",
  "us.ruolo IN ('owner','admin')",
  "ON FUNCTION public.fiscosim_studio_create_cliente",
  "FROM PUBLIC,anon,authenticated",
  "TO service_role",
  "COMMIT;",
 ]) assert.ok(ddl.includes(snippet),snippet)
 assert.doesNotMatch(ddl,/\bSECURITY DEFINER\b/)
 assert.doesNotMatch(ddl,/\bUPDATE\s+public\.clienti/i)
 assert.doesNotMatch(ddl,/\bDELETE\s+FROM\s+public\.clienti/i)
})

test('Stage3R server verifies session and company before calling atomic service RPC',()=>{
 for(const snippet of [
  "roles:['owner','admin']",
  "hasSupabaseServiceRoleConfigured()",
  "scopedCompanyIds(ctx)",
  "allowed.includes(societaId)",
  "sanitizeNewClientData",
  "reason.length<12",
  "admin.rpc('fiscosim_studio_create_cliente'",
  "p_auth_user_id:ctx.user.id",
  "p_societa_id:societaId",
  "p_data:data",
  "p_reason:reason",
 ]) assert.ok(createApi.includes(snippet),snippet)
 assert.doesNotMatch(createApi,/\.from\('clienti'\)\.insert/)
 assert.doesNotMatch(createApi,/\.from\('crm_cliente_societa_link'\)\.insert/)
})

test('Stage3R studio CRM UI requires explicit society and ownership reason',()=>{
 assert.match(ui,/fetchScopedFiscalData\('clienti'\)/)
 assert.match(ui,/apiFetch\('\/api\/studio\/client-create'/)
 assert.match(ui,/societaOptions\.some\(s=>s\.id===data\.societa_id\)/)
 assert.match(ui,/motivazione/)
 assert.match(ui,/Società contabile proprietaria \*/)
 assert.match(ui,/Motivazione dell’assegnazione \*/)
 assert.doesNotMatch(ui,/sb\.from\("clienti"\)\.insert/)
 assert.match(ui,/Modifica cliente temporaneamente bloccata/)
 assert.match(dbTransition,/ALTER TABLE public\.clienti\s+ADD COLUMN telefono text,\s+ADD COLUMN indirizzo text/)
})

test('Stage3R fiscal modules use the protected reads, with writes explicitly pending migration',()=>{
 assert.match(agecon,/fetchScopedFiscalData\('avvisi_ade'\)/)
 assert.match(agecon,/fetchScopedFiscalData\('clienti'\)/)
 assert.match(agecon,/fetchScopedFiscalData\('utenti'\)/)
 assert.match(revisions,/fetchScopedFiscalData\('revisioni_dichiarativi'/)
 assert.match(revisions,/fetchScopedFiscalData\('clienti'\)/)
 assert.match(readerApi,/canReadFiscalResource\(ctx\.profile,resource\)/)
 assert.equal(canReadFiscalResource({ruolo:'collaboratore',permessi:{}},'avvisi_ade'),false)
 // Not deployed: direct fiscal writes still require the next safe API migration.
 assert.match(agecon,/sb\.from\('avvisi_ade'\)\.insert/)
 assert.match(revisions,/sb\.from\('revisioni_dichiarativi'\)\.insert/)
})
