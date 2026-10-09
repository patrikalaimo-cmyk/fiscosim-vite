import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin, hasSupabaseServiceRoleConfigured } from '../../lib/db.js'
import { scopedCompanyIds } from '../../lib/fiscalReadScope.js'

const FIELDS=new Set([
 'nome','cognome','ragione_sociale','tipo_cliente','email','email_cc',
 'codice_fiscale','partita_iva','note','codice_cliente','telefono','indirizzo',
 'moduli_attivi',
])

export function sanitizeNewClientData(data){
 if(!data || typeof data!=='object' || Array.isArray(data))return null
 if(Object.keys(data).some(key=>!FIELDS.has(key)))return null
 const result={}
 for(const [name,value] of Object.entries(data)){
  if(['email_cc','moduli_attivi'].includes(name)){
   if(!Array.isArray(value)||!value.every(x=>typeof x==='string'&&x.length<=100)){
    return null
   }
   result[name]=value
  }else{
   if(typeof value!=='string'||value.length>2000)return null
   result[name]=value.trim()
  }
 }
 if(!String(result.nome||result.ragione_sociale||'').trim())return null
 return result
}

export default async function handler(req,res){
 const ctx=await requireApiAuth(req,res,{methods:'POST, OPTIONS',roles:['owner','admin']})
 if(!ctx)return
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 if(!hasSupabaseServiceRoleConfigured()){
  return res.status(503).json({error:'Provisioning clienti non configurato sul server'})
 }
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{}
 const societaId=String(body.societa_id||'').trim()
 const reason=String(body.motivazione||'').trim()
 const allowed=scopedCompanyIds(ctx)
 if(!societaId||!allowed.includes(societaId)){
  return res.status(403).json({error:'Società non assegnata al responsabile'})
 }
 const data=sanitizeNewClientData(body.data)
 if(!data||reason.length<12||reason.length>500){
  return res.status(400).json({error:'Dati cliente o motivazione di assegnazione non validi'})
 }
 try{
  const admin=await getSupabaseAdmin()
  // Atomic PostgreSQL RPC; never INSERT cliente and link in separate requests.
  // If Stage3R migration is unavailable this fails closed with HTTP 503.
  const {data:customerId,error}=await admin.rpc('fiscosim_studio_create_cliente',{
   p_societa_id:societaId,
   p_auth_user_id:ctx.user.id,
   p_data:data,
   p_reason:reason,
  })
  if(error)throw error
  if(typeof customerId!=='string'||!customerId){
   throw new Error('RPC did not return committed customer id')
  }
  res.setHeader('Cache-Control','no-store')
  return res.status(201).json({ok:true,id:customerId})
 }catch(error){
  console.error('Atomic CRM create failed',{code:error?.code||'UNEXPECTED'})
  return res.status(503).json({error:'Creazione cliente atomica non disponibile o non completata'})
 }
}
