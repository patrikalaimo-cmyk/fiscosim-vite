import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin,hasSupabaseServiceRoleConfigured } from '../../lib/db.js'
import { scopedCompanyIds } from '../../lib/fiscalReadScope.js'
import { sanitizeNewClientData } from './client-create.js'

// Edit is deliberately narrower than create: never accept ownership,
// account state, audit, module permissions or client identifier here.
const EDITABLE = new Set([
  'nome','cognome','ragione_sociale','tipo_cliente','email','email_cc',
  'codice_fiscale','partita_iva','note','codice_cliente','telefono','indirizzo',
])
const MODULES = new Set(['iva','f24','ammortamenti','adempimenti','simulatore'])

export function normalizeCrmUpdate(action,raw){
 if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
 if(action==='deactivate') return Object.keys(raw).length===0?{}:null
 if(action==='modules'){
  const keys=Object.keys(raw)
  if(keys.length!==1 || keys[0]!=='moduli_attivi' || !Array.isArray(raw.moduli_attivi)
   || raw.moduli_attivi.length>MODULES.size ||
   new Set(raw.moduli_attivi).size!==raw.moduli_attivi.length ||
   !raw.moduli_attivi.every(x=>MODULES.has(x)))return null
  return {moduli_attivi:raw.moduli_attivi}
 }
 if(action!=='edit')return null
 if(Object.keys(raw).length===0 || Object.keys(raw).some(k=>!EDITABLE.has(k)))return null
 // Reuse strict per-field size/shape checks from atomic create.
 return sanitizeNewClientData({nome:String(raw.nome??'__validation_only__'),...raw}) &&
   Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,
     Array.isArray(v)?v:typeof v==='string'?v.trim():v]))
}

export default async function handler(req,res){
 const ctx=await requireApiAuth(req,res,{methods:'PATCH, OPTIONS',roles:['owner','admin']})
 if(!ctx)return
 if(req.method!=='PATCH')return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 if(!hasSupabaseServiceRoleConfigured()){
  return res.status(503).json({error:'Servizio modifica CRM non configurato'})
 }
 let body
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return res.status(400).json({error:'JSON non valido'})}
 if(!body||typeof body!=='object'||Array.isArray(body)){
  return res.status(400).json({error:'Payload non valido'})
 }
 const id=String(body.id||'').trim()
 const action=String(body.action||'').trim()
 const reason=String(body.motivazione||'').trim()
 const normalized=normalizeCrmUpdate(action,body.data||{})
 if(!/^[a-f0-9-]{36}$/i.test(id)||!normalized||
  reason.length<12||reason.length>500 || !scopedCompanyIds(ctx).length){
  return res.status(400).json({error:'Modifica CRM incompleta o non consentita'})
 }
 try{
  const admin=await getSupabaseAdmin()
  // This SQL RPC locks the customer and checks *every* current company link
  // within one transaction, preventing cross-company edits on shared records.
  const {data,error}=await admin.rpc('fiscosim_studio_update_cliente',{
   p_cliente_id:id,p_auth_user_id:ctx.user.id,
   p_action:action,p_data:normalized,p_reason:reason,
  })
  if(error)throw error
  if(data!==id)throw new Error('CRM update returned unexpected ID')
  res.setHeader('Cache-Control','no-store')
  return res.status(200).json({ok:true,id})
 }catch(error){
  console.error('Scoped CRM update failed',{code:error?.code||'UNEXPECTED'})
  return res.status(409).json({error:'Operazione non completata: verificare tutte le società collegate e riprovare'})
 }
}
