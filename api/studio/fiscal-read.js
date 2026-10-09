import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin, hasSupabaseServiceRoleConfigured } from '../../lib/db.js'
import {
 resolveFiscalScope, parseQueryCompany,
 listScopedClients, listScopedFiscalRows, listScopedStaff,
} from '../../lib/fiscalReadScope.js'

const RESOURCES=new Set(['clienti','avvisi_ade','revisioni_dichiarativi','utenti'])
export default async function handler(req,res){
 const ctx=await requireApiAuth(req,res,{methods:'GET, OPTIONS'})
 if(!ctx)return
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 if(!hasSupabaseServiceRoleConfigured()){
  return res.status(503).json({error:'Servizio di lettura protetta non configurato'})
 }
 const resource=String(req.query?.resource||'').trim()
 if(!RESOURCES.has(resource))return res.status(400).json({error:'Risorsa non supportata'})
 try{
  const admin=await getSupabaseAdmin()
  const scope=await resolveFiscalScope(admin,ctx)
  if(!scope.companies.length)return res.status(403).json({error:'Nessuna società assegnata'})
  const companies=parseQueryCompany(req,scope)
  if(!companies.length)return res.status(403).json({error:'Società fuori dall’ambito autorizzato'})
  let data=[]
  if(resource==='clienti'){
    const allowed=new Set(companies)
    const filteredScope={
      ...scope,
      clientIds:scope.clientIds.filter(clientId=>
        scope.links.some(link=>link.cliente_id===clientId&&allowed.has(link.societa_id))),
    }
    data=await listScopedClients(admin,filteredScope)
  } else if(resource==='utenti'){
    data=await listScopedStaff(admin,companies)
  } else {
    data=await listScopedFiscalRows(admin,resource,scope,ctx.profile,companies)
    // The notices table never permits anonymous/unlinked client ownership.
    if(resource==='avvisi_ade')data=data.filter(row=>Boolean(row.cliente_id))
  }
  res.setHeader('Cache-Control','no-store')
  return res.status(200).json({ok:true,data})
 }catch(error){
  console.error('Fiscal scoped read failed',{resource,code:error?.code||'UNEXPECTED'})
  return res.status(503).json({error:'Lettura protetta non disponibile'})
 }
}
