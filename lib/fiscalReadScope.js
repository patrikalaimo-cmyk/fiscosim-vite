import { normalizeSocietaIds } from './authMembership.js'
import { normalizeClienteIds } from './tenantClientAssignments.js'

const LIMIT=500

export function scopedCompanyIds(ctx){
 const profile=ctx?.profile
 if(!ctx?.user?.id || String(ctx.user.id)!==String(profile?.auth_user_id || '') ||
    profile?.attivo!==true)return []
 return normalizeSocietaIds(profile?.societa_assegnate)
}

export function clientSelectionLimited(profile){
 return profile?.ruolo!=='owner' && profile?.ruolo!=='admin' &&
  profile?.permessi?.clienti?.solo_assegnati===true
}

export function allowedClientIds(linkRows,companyIds,profile){
 const companySet=new Set(normalizeSocietaIds(companyIds))
 const onlyAssigned=clientSelectionLimited(profile)
 const selected=new Set(normalizeClienteIds(profile?.clienti_assegnati))
 const ids=[]
 for(const row of Array.isArray(linkRows)?linkRows:[]){
  const id=String(row?.cliente_id||'').trim()
  if(id && companySet.has(String(row?.societa_id||'').trim()) &&
     (!onlyAssigned||selected.has(id)) && !ids.includes(id))ids.push(id)
 }
 return ids
}

export async function resolveFiscalScope(admin,ctx){
 const companies=scopedCompanyIds(ctx)
 if(!companies.length)return {companies:[],clientIds:[],links:[]}
 const links=[]
 for(let i=0;i<companies.length;i+=80){
  const {data,error}=await admin.from('crm_cliente_societa_link')
    .select('cliente_id,societa_id')
    .in('societa_id',companies.slice(i,i+80))
  if(error)throw error
  links.push(...(Array.isArray(data)?data:[]))
 }
 return {companies,links,clientIds:allowedClientIds(links,companies,ctx.profile)}
}

export function rowIsAuthorized(row,scope,profile){
 const company=String(row?.societa_id||'').trim()
 if(!scope.companies.includes(company))return false
 const client=String(row?.cliente_id||'').trim()
 if(client){
  return scope.clientIds.includes(client) &&
   scope.links.some(link=>String(link.societa_id)===company && String(link.cliente_id)===client)
 }
 // A revision with no CRM client is not automatically shared with all staff.
 return profile?.ruolo==='owner'||profile?.ruolo==='admin'||
  (Boolean(profile?.id)&&String(row?.created_by||'')===String(profile.id))
}

export function parseQueryCompany(req,scope){
 const query=req?.query||{}
 const requested=typeof query.societa_id==='string'?query.societa_id.trim():''
 if(!requested)return scope.companies
 return scope.companies.includes(requested)?[requested]:[]
}

export async function listScopedClients(admin,scope){
 if(!scope.clientIds.length)return []
 const result=[]
 for(let i=0;i<scope.clientIds.length;i+=80){
  const {data,error}=await admin.from('clienti').select('*')
   .in('id',scope.clientIds.slice(i,i+80)).eq('attivo',true).limit(LIMIT)
  if(error)throw error
  result.push(...(Array.isArray(data)?data:[]))
 }
 return result.slice(0,LIMIT)
}

export async function listScopedFiscalRows(admin,table,scope,profile,companies){
 if(!companies.length)return []
 const items=[]
 for(let i=0;i<companies.length;i+=80){
  const {data,error}=await admin.from(table).select('*')
   .in('societa_id',companies.slice(i,i+80)).limit(LIMIT)
  if(error)throw error
  items.push(...(Array.isArray(data)?data:[]))
 }
 return items.filter(row=>rowIsAuthorized(row,scope,profile)).slice(0,LIMIT)
}

export async function listScopedStaff(admin,companyIds){
 if(!companyIds.length)return []
 const records=[]
 for(let i=0;i<companyIds.length;i+=80){
  const {data,error}=await admin.from('utenti_studio_societa')
   .select('utente_id,auth_user_id,societa_id')
   .in('societa_id',companyIds.slice(i,i+80))
  if(error)throw error
  records.push(...(Array.isArray(data)?data:[]))
 }
 const distinct=[...new Set(records.map(r=>r.utente_id).filter(Boolean))]
 if(!distinct.length)return []
 const users=[]
 for(let i=0;i<distinct.length;i+=80){
  const {data,error}=await admin.from('utenti_studio')
   .select('id,auth_user_id,nome,cognome,ruolo,attivo')
   .in('id',distinct.slice(i,i+80)).eq('attivo',true)
  if(error)throw error
  users.push(...(Array.isArray(data)?data:[]))
 }
 return users.filter(user=>records.some(r=>
  r.utente_id===user.id&&r.auth_user_id===user.auth_user_id))
  .map(({id,nome,cognome,ruolo})=>({id,nome,cognome,ruolo}))
  .slice(0,LIMIT)
}
