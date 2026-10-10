import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin,hasSupabaseServiceRoleConfigured } from '../../lib/db.js'
import { scopedCompanyIds } from '../../lib/fiscalReadScope.js'

const CREATE_FIELDS=new Set(['cliente_id','tipo_avviso','modello','importo','contenuto',
 'data_ricezione_cliente','data_scadenza','data_ricezione_studio','attivita','esito',
 'responsabile_id','note','dati_estratti'])
const EDIT_FIELDS=new Set([...CREATE_FIELDS].filter(x=>!['cliente_id','tipo_avviso'].includes(x)))
const STATES=new Set(['','confermato','sgravio_totale','sgravio_parziale','rateazione','chiuso'])
const DATES=new Set(['data_ricezione_cliente','data_scadenza','data_ricezione_studio'])

export function sanitizeAvvisoWrite(action,raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 if(action==='close')return Object.keys(raw).length===0?{}:null
 const allowed=action==='create'?CREATE_FIELDS:action==='update'?EDIT_FIELDS:null
 if(!allowed||Object.keys(raw).some(key=>!allowed.has(key)))return null
 const data={}
 for(const [key,value] of Object.entries(raw)){
  if(key==='dati_estratti'){
   if(value!==null && (typeof value!=='object'||Array.isArray(value)))return null
   if(value && JSON.stringify(value).length>30000)return null
   data[key]=value
  }else{
   if(value!==null&&typeof value!=='string'&&typeof value!=='number')return null
   const clean=String(value??'').trim()
   if(clean.length>2000)return null
   if(DATES.has(key)&&clean&&!/^\d{4}-\d{2}-\d{2}$/.test(clean))return null
   if(key==='esito'&&!STATES.has(clean))return null
   if(key==='importo'&&clean&&!/^\d{1,12}(?:\.\d{1,2})?$/.test(clean))return null
   data[key]=clean
  }
 }
 if(action==='create' && (!data.cliente_id||!data.tipo_avviso))return null
 return data
}

export default async function handler(req,res){
 const ctx=await requireApiAuth(req,res,{methods:'POST, PATCH, OPTIONS'})
 if(!ctx)return
 if(!['POST','PATCH'].includes(req.method))return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 const manager=['owner','admin'].includes(ctx.profile?.ruolo)
 const permitted=manager||(ctx.profile?.ruolo==='collaboratore' &&
   ctx.profile?.permessi?.agecon?.modifica===true)
 if(!permitted)return res.status(403).json({error:'Scrittura AgeCon non autorizzata'})
 if(!hasSupabaseServiceRoleConfigured())return res.status(503).json({error:'AgeCon non configurato sul server'})
 let body
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}
 catch{return res.status(400).json({error:'JSON non valido'})}
 if(!body||typeof body!=='object'||Array.isArray(body)){
  return res.status(400).json({error:'Payload non valido'})
 }
 const action=String(body.action||'')
 const id=String(body.id||'').trim()
 const societaId=String(body.societa_id||'').trim()
 const reason=String(body.motivazione||'').trim()
 const data=sanitizeAvvisoWrite(action,body.data||{})
 if(!data||!scopedCompanyIds(ctx).includes(societaId) ||
    (req.method==='POST')!==(action==='create') ||
    (action!=='create'&&!/^[0-9a-f-]{36}$/i.test(id)) ||
    reason.length<12||reason.length>500){
  return res.status(400).json({error:'Dati, società o motivazione AgeCon non validi'})
 }
 try{
  const admin=await getSupabaseAdmin()
  const {data:result,error}=await admin.rpc('fiscosim_studio_write_avviso',{
   p_action:action,p_avviso_id:action==='create'?null:id,
   p_societa_id:societaId,p_auth_user_id:ctx.user.id,
   p_data:data,p_reason:reason,
  })
  if(error)throw error
  if(typeof result!=='string'||!result)throw new Error('Missing committed notice id')
  res.setHeader('Cache-Control','no-store')
  return res.status(action==='create'?201:200).json({ok:true,id:result})
 }catch(error){
  console.error('Scoped AgeCon write failed',{code:error?.code||'UNEXPECTED'})
  return res.status(409).json({error:'Salvataggio AgeCon non eseguito: verificare società, cliente e responsabile'})
 }
}
