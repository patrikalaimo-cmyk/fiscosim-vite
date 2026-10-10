import { apiFetch } from './auth'

const resources=new Set(['clienti','avvisi_ade','revisioni_dichiarativi','utenti'])
export async function fetchScopedFiscalData(resource,filters={}){
 if(!resources.has(resource))throw new Error('Risorsa fiscale non ammessa')
 const params=new URLSearchParams({resource})
 for(const [key,value] of Object.entries(filters||{})){
  if(!['societa_id','codice_fiscale'].includes(key))continue
  if(value!==null&&value!==undefined&&String(value).trim()){
   params.set(key,String(value).trim())
  }
 }
 const response=await apiFetch('/api/studio/fiscal-read?'+params.toString(),{method:'GET'})
 const json=await response.json().catch(()=>({}))
 if(!response.ok){
  throw new Error(json.error||'Lettura fiscale protetta non disponibile')
 }
 if(!Array.isArray(json.data))throw new Error('Risposta fiscale incompleta')
 return json.data
}
