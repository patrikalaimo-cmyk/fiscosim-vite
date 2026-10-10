import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin,hasSupabaseServiceRoleConfigured } from '../../lib/db.js'
import { scopedCompanyIds } from '../../lib/fiscalReadScope.js'
import { sanitizeNewClientData } from './client-create.js'

export function sanitizeArchiveRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return null
 const report=body.report
 if(!report||typeof report!=='object'||Array.isArray(report))return null
 if(JSON.stringify(report).length>480000)return null
 const docCount=body.num_documenti
 if(!Number.isInteger(docCount)||docCount<0||docCount>50)return null
 const existing=String(body.cliente_id||'').trim()
 const create=body.nuovo_cliente!==null && body.nuovo_cliente!==undefined
 if(create&&existing || !create&&!existing)return null
 const newClient=create?sanitizeNewClientData(body.nuovo_cliente):null
 if(create&&!newClient)return null
 const newReason=create?String(body.motivazione_cliente||'').trim():''
 if(create&&(newReason.length<12||newReason.length>500))return null
 const archiveReason=String(body.motivazione||'').trim()
 if(archiveReason.length<12||archiveReason.length>500)return null
 return {report,docCount,existing:existing||null,newClient,newReason,archiveReason}
}

export default async function handler(req,res){
 const ctx=await requireApiAuth(req,res,{methods:'POST, OPTIONS'})
 if(!ctx)return
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 const profile=ctx.profile
 const permitted=['owner','admin'].includes(profile?.ruolo) ||
   (profile?.ruolo==='collaboratore' && profile?.permessi?.revisione_dich?.modifica===true)
 if(!permitted)return res.status(403).json({error:'Archiviazione dichiarativi non autorizzata'})
 if(!hasSupabaseServiceRoleConfigured())return res.status(503).json({error:'Archivio dichiarativi non configurato'})
 let body
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return res.status(400).json({error:'JSON non valido'})}
 const societaId=String(body?.societa_id||'').trim()
 const input=sanitizeArchiveRequest(body)
 if(!input)return res.status(400).json({error:'Archiviazione incompleta o non valida'})
 if(input.newClient&&!['owner','admin'].includes(profile?.ruolo)){
  return res.status(403).json({error:'Nuove anagrafiche riservate al responsabile'})
 }
 if(!scopedCompanyIds(ctx).includes(societaId)){
  return res.status(403).json({error:'Società non autorizzata'})
 }
 try{
  const admin=await getSupabaseAdmin()
  const {data:id,error}=await admin.rpc('fiscosim_studio_archive_revisione',{
   p_auth_user_id:ctx.user.id,
   p_societa_id:societaId,
   p_cliente_id:input.existing,
   p_new_cliente:input.newClient,
   p_new_cliente_reason:input.newReason,
   p_report:input.report,
   p_num_documenti:input.docCount,
   p_reason:input.archiveReason,
  })
  if(error)throw error
  if(typeof id!=='string'||!id)throw new Error('Missing declaration ID')
  res.setHeader('Cache-Control','no-store')
  return res.status(201).json({ok:true,id})
 }catch(error){
  console.error('Atomic revision archive failed',{code:error?.code||'UNEXPECTED'})
  return res.status(409).json({error:'Archiviazione annullata: verificare società, cliente e autorizzazioni'})
 }
}
