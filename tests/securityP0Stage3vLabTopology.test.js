import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
 STAGE3V_LAB,STAGE3V_LAB_ORIGIN,STAGE3V_LAB_NETWORK,
 assessStage3vLabSnapshots,assertStage3vLocalStackIsolated,
} from '../scripts/security_p0/stage3v-local-stack.mjs'

const base=Object.values(STAGE3V_LAB).map(name=>({
 name,running:true,networks:[STAGE3V_LAB_NETWORK],bindings:[],
}))
const copy=()=>structuredClone(base)
const published=(name,hostIp,hostPort,containerPort)=>({
 name,running:true,networks:[STAGE3V_LAB_NETWORK],
 bindings:[{hostIp,hostPort,containerPort}],
})
const good=()=>{
 const rows=copy()
 rows[1]=published(STAGE3V_LAB.kong,'127.0.0.1','55321','8000/tcp')
 rows[0]=published(STAGE3V_LAB.db,'127.0.0.1','55322','5432/tcp')
 return rows
}
test('Stage3V requires the actual P0 local port 55321, never 54321',()=>{
 assert.equal(STAGE3V_LAB_ORIGIN,'http://127.0.0.1:55321')
 assert.equal(assessStage3vLabSnapshots(good()).ready,true)
 const wrong=good()
 wrong[1].bindings[0].hostPort='54321'
 assert.equal(assessStage3vLabSnapshots(wrong).ready,false)
})
test('Stage3V refuses wildcard Kong publication IPv4 and IPv6',()=>{
 for(const ip of ['0.0.0.0','::']){
  const rows=good()
  rows[1].bindings[0].hostIp=ip
  const result=assessStage3vLabSnapshots(rows)
  assert.equal(result.ready,false)
  assert.equal(result.unsafeBindings.length,1)
 }
})
test('Stage3V refuses exposed DB even when Kong is safe',()=>{
 const rows=good()
 rows[0].bindings[0].hostIp='0.0.0.0'
 const result=assessStage3vLabSnapshots(rows)
 assert.equal(result.gatewayPublished,true)
 assert.equal(result.allLabPortsLoopback,false)
 assert.equal(result.ready,false)
})
test('Stage3V requires services pinned exclusively to same P0 network',()=>{
 const rows=good()
 rows[2].networks=['supabase_network_fiscosim-local']
 assert.equal(assessStage3vLabSnapshots(rows).ready,false)
 rows[2].networks=[STAGE3V_LAB_NETWORK,'supabase_network_fiscosim-local']
 assert.equal(assessStage3vLabSnapshots(rows).ready,false)
 assert.equal(assessStage3vLabSnapshots(good().slice(0,3)).ready,false)
})
test('Stage3V rejects an unexpected Kong publication and other LAB service exposure',()=>{
 const rows=good()
 rows[1].bindings.push({hostIp:'127.0.0.1',hostPort:'54321',containerPort:'8000/tcp'})
 assert.equal(assessStage3vLabSnapshots(rows).ready,false)
 const more=good()
 more.push(published('supabase_studio_FiscoSim-P0-LAB-20261008-164658',
  '0.0.0.0','55323','3000/tcp'))
 assert.equal(assessStage3vLabSnapshots(more).ready,false)
})
test('Stage3V signed E2E fails closed before any SQL mutation if LAB exposure unsafe',()=>{
 let calls=0
 const testDocker=(...args)=>{
  calls++
  if(args[0]==='ps')return Object.values(STAGE3V_LAB).join('\n')
  const name=args.at(-1)
  if(args[1]==='--format' && args[2]==='{{.State.Running}}')return 'true'
  if(args[1]==='--format' && args[2].includes('NetworkSettings.Networks'))
   return JSON.stringify({[STAGE3V_LAB_NETWORK]:{}})
  if(args[1]==='--format' && args[2].includes('NetworkSettings.Ports')){
   if(name===STAGE3V_LAB.kong)
    return JSON.stringify({'8000/tcp':[{HostIp:'0.0.0.0',HostPort:'55321'}]})
   return '{}'
  }
  throw Error('Unexpected mocked Docker read')
 }
 assert.throws(()=>assertStage3vLocalStackIsolated(testDocker),
  /STAGE3V_PINNED_LAB_NETWORK_OR_BINDING_UNSAFE/)
 assert.ok(calls>0)
})
