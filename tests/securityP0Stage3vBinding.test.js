import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 parseStage3vBindingOutput,assertStage3vFixtureParity,
} from '../scripts/security_p0/stage3v-lab-binding.mjs'

const A='61000000-0000-4000-8000-000000000001'
const B='61000000-0000-4000-8000-000000000002'
const DA='61000000-0000-4000-8000-000000000011'
const CA='61000000-0000-4000-8000-000000000012'
const DB='61000000-0000-4000-8000-000000000021'
const CB='61000000-0000-4000-8000-000000000022'
const UA='61000000-0000-4000-8000-000000000031'
const UB='61000000-0000-4000-8000-000000000032'
const companies=[
 {id:A,codice:'STAGE3V-A',attiva:true},
 {id:B,codice:'STAGE3V-B',attiva:true},
]
const accounts=[
 {id:DA,societa_id:A,attivo:true},{id:CA,societa_id:A,attivo:true},
 {id:DB,societa_id:B,attivo:true},{id:CB,societa_id:B,attivo:true},
]
const ids=[{id:UA,company:A},{id:UB,company:B}]
const sqlOutput=[
 'BEGIN','STAGE3V_RPC|true',
 ...companies.map(x=>'STAGE3V_COMPANY|'+x.id+'|'+x.codice+'|'+x.attiva),
 ...accounts.map(x=>'STAGE3V_ACCOUNT|'+x.id+'|'+x.societa_id+'|'+x.attivo),
 ...ids.map(x=>'STAGE3V_AUTH|'+x.id),
 ...ids.map(x=>'STAGE3V_MEMBERSHIP|'+x.id+'|'+x.company),
 'ROLLBACK',
].join('\n')

test('Stage3V compares real rows retrieved independently from Docker and PostgREST',()=>{
 const proof=parseStage3vBindingOutput(sqlOutput)
 assert.doesNotThrow(()=>assertStage3vFixtureParity(proof,companies,accounts,ids))
 assert.throws(()=>assertStage3vFixtureParity(proof,[
  {...companies[0],codice:'STAGE3V-CHANGED'},companies[1],
 ],accounts,ids))
 assert.throws(()=>assertStage3vFixtureParity(proof,companies,[
  {...accounts[0],societa_id:B},...accounts.slice(1),
 ],ids))
 assert.throws(()=>assertStage3vFixtureParity(proof,companies,accounts,[
  ids[0],{...ids[1],company:A},
 ]))
})

test('Stage3V fails closed on ambiguous or missing local database proof',()=>{
 const valid=parseStage3vBindingOutput(sqlOutput)
 assert.throws(()=>parseStage3vBindingOutput(sqlOutput+'\nSTAGE3V_OTHER|value'))
 assert.throws(()=>assertStage3vFixtureParity({...valid,RPC:[['false']]},companies,accounts,ids))
 assert.throws(()=>assertStage3vFixtureParity({...valid,AUTH:[]},companies,accounts,ids))
 assert.throws(()=>assertStage3vFixtureParity({...valid,COMPANY:[valid.COMPANY[0]]},companies,accounts))
 assert.throws(()=>assertStage3vFixtureParity({...valid,ACCOUNT:[...valid.ACCOUNT,valid.ACCOUNT[0]]},companies,accounts))
})

test('Stage3V signed JWT runner requires explicit opt-in before any Auth login or HTTP POST',()=>{
 const source=readFileSync(new URL('../scripts/security_p0/stage3v-signed-jwt-general-journal-e2e.mjs',import.meta.url),'utf8')
 const opt=source.indexOf("if(env.FISCOSIM_STAGE3V_PERSISTENT_WRITE_APPROVAL!=='LAB_SYNTHETIC_WRITE_APPROVED')")
 const login=source.indexOf('const a=await login(fixture.A)')
 const firstPost=source.indexOf('const unsigned=await post(null,{})')
 assert.ok(opt>0 && login>opt && firstPost>login)
 assert.match(source,/await assertStage3vPinnedLab\(\{expectedCommit,fixture,admin\}\)/)
 assert.match(source,/await assertStage3vPinnedLab\(\{expectedCommit,fixture,admin,authIds:/)
 assert.match(source,/STAGE3V_PINNED_LAB_READ_ONLY_PREFLIGHT_PASS/)
 const binding=readFileSync(new URL('../scripts/security_p0/stage3v-lab-binding.mjs',import.meta.url),'utf8')
 for(const marker of [
  'STAGE3U_PERSISTENT_LAB_INSTALL_PASS',
  'STAGE3V_UNEXPECTED_GIT_CHECKOUT',
  'STAGE3V_DIRTY_WORKTREE',
  'BEGIN READ ONLY;',
  'ROLLBACK;',
  'auth.users',
  'utenti_studio_societa',
  'STAGE3V_PINNED_DB_NOT_RUNNING',
 ])assert.ok(binding.includes(marker),marker)
 assert.doesNotMatch(binding,/run\('docker',\['(?:run|start|stop|rm|restart)'/i)
})
