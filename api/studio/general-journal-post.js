import { requireApiAuth } from '../../lib/auth.js'
import { getSupabaseAdmin } from '../../lib/db.js'
import { scopedCompanyIds } from '../../lib/fiscalReadScope.js'
import { isIsolatedStudioEnvironment } from '../../lib/isolatedStudioLab.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE=/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
const WHITELIST_HEADER=new Set(['data_registrazione','descrizione','causale_id'])
const WHITELIST_ROW=new Set(['conto_id','dare','avere','descrizione'])
const CENTS=99999999999999

export function validateGeneralJournalRequest(payload) {
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return null
 const fields=Object.keys(payload)
 if(fields.some(k=>!new Set(['societa_id','request_id','header','rows','motivazione']).has(k)))return null
 const societa_id=String(payload.societa_id||'')
 const request_id=String(payload.request_id||'')
 const header=payload.header
 const rows=payload.rows
 const motivazione=String(payload.motivazione||'').trim()
 if(!UUID.test(societa_id)||!UUID.test(request_id)||!header||
    typeof header!=='object'||Array.isArray(header)||
    Object.keys(header).some(k=>!WHITELIST_HEADER.has(k))||
    !ISO_DATE.test(String(header.data_registrazione||''))||
    String(header.descrizione||'').trim().length<5||
    String(header.descrizione||'').trim().length>500||
    (header.causale_id!==undefined&&header.causale_id!==null&&!UUID.test(String(header.causale_id)))||
    motivazione.length<12||motivazione.length>500||
    !Array.isArray(rows)||rows.length<2||rows.length>100||
    JSON.stringify(rows).length>100000)return null
 let dare=0,avere=0
 const parsed=[]
 for(const r of rows){
  if(!r||typeof r!=='object'||Array.isArray(r)||
    Object.keys(r).some(k=>!WHITELIST_ROW.has(k))||
    !UUID.test(String(r.conto_id||''))||
    typeof r.dare!=='number'||typeof r.avere!=='number'||
    !Number.isFinite(r.dare)||!Number.isFinite(r.avere)||
    r.dare<0||r.avere<0||r.dare*100>CENTS||r.avere*100>CENTS||
    Math.abs(r.dare*100-Math.round(r.dare*100))>0.00001||
    Math.abs(r.avere*100-Math.round(r.avere*100))>0.00001||
    (r.dare===0&&r.avere===0)||(r.dare>0&&r.avere>0)||
    String(r.descrizione??'').length>500)return null
  const d=Math.round(r.dare*100),a=Math.round(r.avere*100)
  dare+=d;avere+=a
  if(!Number.isSafeInteger(dare)||!Number.isSafeInteger(avere))return null
  parsed.push({conto_id:r.conto_id,dare:d/100,avere:a/100,
   ...(r.descrizione===undefined?{}:{descrizione:String(r.descrizione)})})
 }
 if(dare<=0||dare!==avere)return null
 return {
  societa_id,request_id,
  header:{
   data_registrazione:header.data_registrazione,
   descrizione:String(header.descrizione).trim(),
   ...(header.causale_id?{causale_id:header.causale_id}:{}),
  },
  rows:parsed,motivazione,
 }
}

export default async function handler(req,res) {
 // This is not enabled for live development/production. Isolated LAB only,
 // until period locks, fiscal posting, JWT and PostgreSQL E2E are certified.
 if(!isIsolatedStudioEnvironment()||
  !String(process.env.VITE_SUPABASE_URL||'').trim()||
  process.env.FISCOSIM_GENERAL_JOURNAL_POST_LAB_ENABLED!=='true'){
  return res.status(503).json({error:'GENERAL_JOURNAL_LAB_ONLY_DISABLED'})
 }
 const ctx=await requireApiAuth(req,res,{methods:'POST, OPTIONS',roles:['owner','admin']})
 if(!ctx)return
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 let body
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return res.status(400).json({error:'JSON_NON_VALIDO'})}
 const plan=validateGeneralJournalRequest(body)
 if(!plan)return res.status(400).json({error:'JOURNAL_PAYLOAD_INVALIDO'})
 if(!scopedCompanyIds(ctx).includes(plan.societa_id)){
  return res.status(403).json({error:'SOCIETA_NON_AUTORIZZATA'})
 }
 try{
  const db=await getSupabaseAdmin()
  const {data:id,error}=await db.rpc('fiscosim_post_general_journal',{
   p_societa_id:plan.societa_id,
   p_auth_user_id:ctx.user.id,
   p_request_id:plan.request_id,
   p_header:plan.header,p_rows:plan.rows,p_reason:plan.motivazione,
  })
  if(error)throw error
  if(typeof id!=='string'||!UUID.test(id))throw Error('Missing journal id')
  res.setHeader('Cache-Control','no-store')
  return res.status(201).json({ok:true,id,request_id:plan.request_id})
 }catch(error){
  console.error('Isolated atomic general journal rejected',{code:error?.code||'UNKNOWN'})
  return res.status(409).json({error:'JOURNAL_ATOMIC_POST_FAILED'})
 }
}
