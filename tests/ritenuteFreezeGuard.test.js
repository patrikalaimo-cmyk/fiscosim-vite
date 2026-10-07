import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveRegistrazioneRitenutaDefaults } from '../src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneRitenutaDefaults.js'
import { validateRegistrazioneRitenutaDraft } from '../src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneRitenutaDraft.js'

test('vista ritenute e scadenzario non espone write contabili diretti', async () => {
  const source=await readFile(new URL('../src/modules/contabilita/views/TaxComplianceView.jsx',import.meta.url),'utf8')
  const start=source.indexOf('function RitenuteView({societa}){')
  assert.ok(start>=0)
  const view=source.slice(start)
  for(const forbidden of ['insertRitenuta(','deleteRitenuta(','updateDocumentoContabilita(','salvaRitenuta','openNuovaRitenuta']){
    assert.equal(view.includes(forbidden),false,`Percorso legacy vietato: ${forbidden}`)
  }
  assert.match(view,/sola lettura/i)
  assert.match(view,/workflow contabile dedicato/i)
})

test('query ritenute operative sono tenant scoped', async () => {
  const source=await readFile(new URL('../src/modules/contabilita/data/contabilitaRepo.js',import.meta.url),'utf8')
  for(const name of ['getRitenuteByAnnoPerPercipiente','getRitenuteByAnnoPerData','getRitenuteDaMaturare']){
    const start=source.indexOf(`export function ${name}`)
    assert.ok(start>=0)
    const next=source.indexOf('\nexport function ',start+1)
    const block=source.slice(start,next>start?next:source.length)
    assert.match(block,/\.eq\(['"]societa_id['"],\s*societaId\)/)
  }
})

test('aliquota ritenuta mancante non viene inferita', () => {
  const percipiente={id:'perc-1',ragione_sociale:'Studio Professionista',codice_fiscale:'RSSMRA80A01H501U',causale_prevalente:'A'}
  const current={percipienteId:'perc-1',percipienteNome:'Studio Professionista',codiceFiscale:percipiente.codice_fiscale,causaleReddituale:'A',importoCompenso:1000,baseRitenuta:1000,ritenuta:0,compensoResolved:true}
  const behavior={showRitenute:true,ritenuteMode:'documento'}
  const defaults=resolveRegistrazioneRitenutaDefaults({header:{clienteFornitoreNome:'Studio Professionista'},currentRitenutaDraft:current,percipienti:[percipiente],behavior})
  assert.equal(defaults.aliquotaRitenuta,0)
  const validation=validateRegistrazioneRitenutaDraft({header:{clienteFornitoreNome:'Studio Professionista'},ritenutaData:current,behavior},{percipienti:[percipiente],behavior})
  assert.equal(validation.status,'blocked')
  assert.ok(validation.blockers.includes('aliquota ritenuta non definita'))
})
