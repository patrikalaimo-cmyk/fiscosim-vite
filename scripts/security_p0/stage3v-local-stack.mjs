/**
 * Stage3V: identify the ONE immutable P0 laboratory service graph.
 * Docker inspection only; no lifecycle operations, secrets, or SQL writes.
 */
import {execFileSync} from 'node:child_process'

export const STAGE3V_LAB_SUFFIX='FiscoSim-P0-LAB-20261008-164658'
export const STAGE3V_LAB_NETWORK='fiscosim-p0-loopback'
export const STAGE3V_LAB_ORIGIN='http://127.0.0.1:55321'
export const STAGE3V_LAB_PORT='55321'
export const STAGE3V_LAB={
 db:'supabase_db_'+STAGE3V_LAB_SUFFIX,
 kong:'supabase_kong_'+STAGE3V_LAB_SUFFIX,
 auth:'supabase_auth_'+STAGE3V_LAB_SUFFIX,
 rest:'supabase_rest_'+STAGE3V_LAB_SUFFIX,
}
const safeHostIp=(ip)=>['127.0.0.1','::1'].includes(ip)
const execDocker=(...args)=>execFileSync('docker',args,{
 encoding:'utf8',timeout:10000,windowsHide:true,
}).trim()

export function assessStage3vLabSnapshots(snapshots) {
 const inspected=new Map(snapshots.map(x=>[x.name,x]))
 const mandatory=Object.values(STAGE3V_LAB)
 const mandatoryPresent=mandatory.every(name=>inspected.has(name))
 const labServices=snapshots.filter(x=>x.name.endsWith('_'+STAGE3V_LAB_SUFFIX))
 // More than the four essential services may be installed; all their
 // host-published ports must be constrained to loopback.
 const correctNetwork=mandatoryPresent&&labServices.length>=4&&
  labServices.every(x=>x.running===true &&
   x.networks.length===1 && x.networks[0]===STAGE3V_LAB_NETWORK)
 const ports=labServices.flatMap(x=>(x.bindings||[]).map(b=>({...b,name:x.name})))
 const gateway=ports.filter(x=>x.name===STAGE3V_LAB.kong &&
  x.hostPort===STAGE3V_LAB_PORT && x.containerPort==='8000/tcp')
 const unexpectedGateway=ports.some(x=>x.name===STAGE3V_LAB.kong &&
  (x.hostPort!==STAGE3V_LAB_PORT || x.containerPort!=='8000/tcp'))
 const gatewayPublished=gateway.length>=1&&!unexpectedGateway
 const unsafeBindings=ports.filter(x=>!safeHostIp(x.hostIp))
 const allLabPortsLoopback=ports.length>0 && unsafeBindings.length===0
 return {
  mandatoryPresent,correctNetwork,gatewayPublished,allLabPortsLoopback,
  ready:correctNetwork&&gatewayPublished&&allLabPortsLoopback,
  portBindings:ports,unsafeBindings,
 }
}
export function inspectStage3vLocalStack(docker=execDocker) {
 const names=docker('ps','--format','{{.Names}}').split(/\r?\n/).filter(Boolean)
 const labNames=names.filter(x=>x.endsWith('_'+STAGE3V_LAB_SUFFIX))
 const snapshots=labNames.map(name=>{
  const running=docker('inspect','--format','{{.State.Running}}',name)==='true'
  const net=JSON.parse(docker('inspect','--format',
   '{{json .NetworkSettings.Networks}}',name)||'{}')
  const networkNames=Object.keys(net||{})
  const ports=JSON.parse(docker('inspect','--format',
   '{{json .NetworkSettings.Ports}}',name)||'{}')
  const bindings=[]
  for(const [containerPort,published] of Object.entries(ports||{})){
   for(const p of published||[]){
    bindings.push({
     hostIp:String(p.HostIp),hostPort:String(p.HostPort),containerPort,
    })
   }
  }
  return {name,running,networks:networkNames,bindings}
 })
 return {...assessStage3vLabSnapshots(snapshots),otherLocalStackPresent:
  names.includes('supabase_kong_fiscosim-local')}
}
export function assertStage3vLocalStackIsolated(docker) {
 const inspection=inspectStage3vLocalStack(docker)
 if(!inspection.ready)throw Error('STAGE3V_PINNED_LAB_NETWORK_OR_BINDING_UNSAFE')
 return inspection
}
