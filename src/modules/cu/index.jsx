import { useState, useEffect, useRef, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { loadScript } from '../../shared/utils'
import { TagInput } from '../../shared/components'
import { callBackend } from '../../core/workflow'

const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]

const EGE_DEFAULT = {
  piva:         '08792831003',
  cf:           '08792831003',
  denominazione:'EGE GROUP SRL',
  comune:       'ROMA',
  prov:         'RM',
  cap:          '00186',
  indirizzo:    'VIA DI MONTE GIORDANO 36',
  cod_attivita: '683100',
  cod_sede:     '001',
};

// ── Costruttori record TEL (lunghezza fissa 1898 char) ───────
function pad(s, len, right=true) {
  s = String(s||'');
  if(s.length>len) s=s.substring(0,len);
  return right ? s.padEnd(len,' ') : s.padStart(len,' ');
}

function fmtImporto(n) {
  // Formato TEL: "    1234,56" (16 chars, virgola decimale)
  const v = parseFloat(n)||0;
  const s = v.toFixed(2).replace('.',',');
  return s.padStart(16,' ');
}

function fmtData(d) {
  // ggmmaaaa da stringa ISO o dd/mm/yyyy
  if(!d) return '        ';
  const parts = d.includes('-') ? d.split('-').reverse() : d.split('/');
  return (parts[0]||'  ').padStart(2,'0')+(parts[1]||'  ').padStart(2,'0')+(parts[2]||'    ');
}

function buildRecordA(cfDichiarante) {
  // A + 14 spazi + CUR2610 + CF dichiarante
  let r = 'A' + ' '.repeat(14) + 'CUR2610' + pad(cfDichiarante,16);
  return r.padEnd(1898,' ');
}

function buildRecordB(sost, perc, progStr) {
  // Posizioni da analisi del file campione
  let r = new Array(1898).fill(' ');
  const set = (pos, val, len) => {
    const s = pad(val, len);
    for(let i=0;i<len&&pos+i<1898;i++) r[pos+i]=s[i];
  };
  r[0] = 'B';
  set(1,  sost.piva, 11);           // PIVA sostituto (codice file)
  set(12, ' '.repeat(5), 5);        // spazi
  set(17, progStr, 8);              // numero progressivo
  set(73, sost.piva, 11);           // PIVA sostituto
  set(84, '00', 2);
  set(136, sost.denominazione, 40); // denominazione sostituto
  set(310, perc.cf, 16);            // CF percipiente
  set(326, '01', 2);                // tipo
  set(328, pad(perc.cognome,25), 25);
  set(353, pad(perc.nome,20), 20);
  set(373, pad('00000000000',11),11);// importi B (zero, vanno in H)
  set(411, sost.cf, 16);            // CF dichiarante
  return r.join('');
}

function buildRecordD(sost, perc, progStr) {
  // Record D con tag DA
  const field = (tag, val, len=16) => tag + pad(val,len);
  let tags = '';
  tags += field('DA001001', sost.piva);
  tags += field('DA001002', sost.denominazione.substring(0,16));
  if(sost.denominazione.length>16)
    tags += 'DA001002+' + pad(sost.denominazione.substring(16), 16);
  tags += field('DA001004', sost.comune);
  tags += field('DA001005', sost.prov);
  tags += field('DA001006', sost.cap);
  tags += field('DA001007', sost.indirizzo.substring(0,16));
  if(sost.indirizzo.length>16)
    tags += 'DA001007+' + pad(sost.indirizzo.substring(16), 16);
  tags += field('DA001011', sost.cod_sede);
  tags += field('DA002001', perc.cf);
  tags += field('DA002002', (perc.cognome||'').toUpperCase());
  tags += field('DA002003', (perc.nome||'').toUpperCase());
  tags += field('DA002004', perc.sesso||'');
  tags += field('DA002005', fmtData(perc.data_nascita));
  tags += field('DA002006', (perc.comune_nascita||'').toUpperCase());
  tags += field('DA002007', (perc.prov_nascita||'').toUpperCase());
  tags += field('DA003001', fmtData(perc.data_pagamento));
  tags += field('DA003002', '1'); // tipo CU locazioni brevi

  let prefix = 'D' + pad(sost.piva,11) + '     ' + progStr + pad(perc.cf,16) +
    '00001' + '00000000000000000000000' + ' '.repeat(19) + '0';
  let r = prefix + tags;
  return r.padEnd(1898,' ');
}

function buildRecordH(sost, perc, progStr, importo, ritenuta) {
  const prefix = 'H' + pad(sost.piva,11) + '     ' + progStr + pad(perc.cf,16) +
    '00001' + '00000000000000000000000' + ' '.repeat(19) + '0';
  let tags = '';
  tags += 'AU001001' + pad('A',16);
  tags += 'AU001004' + fmtImporto(importo);
  tags += 'AU001008' + fmtImporto(importo);
  tags += 'AU001009' + fmtImporto(ritenuta);
  let r = prefix + tags;
  return r.padEnd(1898,' ');
}

function buildRecordZ(numPerc) {
  const n = String(numPerc).padStart(9,'0');
  let r = 'Z' + ' '.repeat(14) + n + '000000000' + n + '000000000' + n +
    '000000000' + n + '000000000';
  return r.padEnd(1898,' ');
}

function generaTEL(sostituto, percipienti) {
  const lines = [];
  lines.push(buildRecordA(sostituto.cf));
  percipienti.forEach((p, i) => {
    const prog = String(i+1).padStart(8,'0');
    lines.push(buildRecordB(sostituto, p, prog));
    lines.push(buildRecordD(sostituto, p, prog));
    lines.push(buildRecordH(sostituto, p, prog, p.importo, p.ritenuta));
  });
  lines.push(buildRecordZ(percipienti.length));
  return lines.join('\r\n') + '\r\n';
}

// ── Estrazione dati da immagine/PDF con Claude AI ────────────
async function estraiDatiRicevuta(base64, mimeType, useAI=true) {
  if(!useAI)return null; // Caller will show manual input form
  const isDoc = mimeType === 'application/pdf';
  const content = isDoc
    ? [{ type:'document', source:{ type:'base64', media_type:mimeType, data:base64 }},
       { type:'text', text:'Estrai i dati da questa ricevuta di affitto breve.' }]
    : [{ type:'image', source:{ type:'base64', media_type:mimeType, data:base64 }},
       { type:'text', text:'Estrai i dati da questa ricevuta di affitto breve.' }];

  const res = await fetch('/api/claude', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      model:'claude-haiku-4-5-20251001',
      max_tokens:500,
      system:`Sei un esperto contabile italiano. Analizza la ricevuta di affitto breve e rispondi SOLO con JSON valido, zero testo extra.`,
      messages:[{
        role:'user',
        content:[
          ...content.slice(0,-1),
          { type:'text', text:`Analizza questa ricevuta di affitto breve e rispondi SOLO con questo JSON (senza markdown):
{
  "cf": "codice fiscale percipiente 16 char",
  "cognome": "cognome percipiente",
  "nome": "nome percipiente",
  "sesso": "M o F",
  "data_nascita": "DD/MM/YYYY o vuoto",
  "comune_nascita": "comune nascita o vuoto",
  "prov_nascita": "provincia 2 lettere o vuoto",
  "importo_lordo": 0.00,
  "ritenuta": 0.00,
  "importo_netto": 0.00,
  "data_pagamento": "DD/MM/YYYY"
}` }
        ]
      }]
    })
  });
  const data = await res.json();
  const txt = data.content?.[0]?.text || '{}';
  return JSON.parse(txt.replace(/```json|```/g,'').trim());
}

// ── COMPONENTE MODULO TEL ─────────────────────────────────────
function ModuloTEL() {
  const [sostituto, setSostituto] = useState({...EGE_DEFAULT});
  const [ricevute, setRicevute] = useState([]); // {file, preview, loading, dati, err}
  const [drag, setDrag] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [telGenerato, setTelGenerato] = useState(null);
  const fileRef = useRef();

  // Carica dati sostituto da impostazioni se disponibili
  useEffect(()=>{
    sb.from('impostazioni_studio').select('chiave,valore').then(({data})=>{
      if(!data?.length) return;
      const m = Object.fromEntries(data.map(r=>[r.chiave,r.valore||'']));
      if(m.titolare_piva||m.studio_piva){
        // Per locazioni brevi usa dati studio (non titolare persona fisica)
      }
    });
  },[]);

  const processaSingoloFile = async(nome, base64, mimeType) => {
    const id = Date.now() + Math.random();
    setRicevute(p=>[...p, {id, nome, loading:true, dati:null, err:null}]);
    try {
      // Check AI setting
      const{data:aiSetting}=await sb.from('impostazioni_studio').select('valore').eq('chiave','ai_enabled');
      const useAI=(Array.isArray(aiSetting)?aiSetting[0]:aiSetting)?.valore!=='false';
      const dati = await estraiDatiRicevuta(base64, mimeType, useAI);
      if(dati){
        setRicevute(p=>p.map(r=>r.id===id?{...r,loading:false,dati,err:null}:r));
      }else{
        // AI disabled: empty form for manual input
        setRicevute(p=>p.map(r=>r.id===id?{...r,loading:false,dati:{
          cf:'',cognome:'',nome:'',sesso:'M',data_nascita:'',
          comune_nascita:'',prov_nascita:'',importo_lordo:0,
          ritenuta:0,importo_netto:0,data_pagamento:'',
          _manual:true
        },err:null}:r));
      }
    } catch(e) {
      setRicevute(p=>p.map(r=>r.id===id?{...r,loading:false,err:e.message}:r));
    }
  };

  const processaFile = async(file) => {
    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isZip = file.name.toLowerCase().endsWith('.zip');

    if(isZip){
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      const JSZip = window.JSZip;
      const ab = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const tuttiFile = Object.keys(zip.files);
      console.log('ZIP aperto, file totali:', tuttiFile);
      const nomi = tuttiFile.filter(n=>{
        const l=n.toLowerCase();
        return !zip.files[n].dir&&(l.endsWith('.pdf')||l.endsWith('.jpg')||l.endsWith('.jpeg')||l.endsWith('.png'));
      });
      if(!nomi.length){
        alert('Nello ZIP non sono stati trovati file PDF, JPG o PNG. File presenti: '+tuttiFile.join(', '));
        return;
      }
      console.log('ZIP: trovati '+nomi.length+' file da processare:', nomi);
      for(const nome of nomi){
        // Leggi come base64 direttamente da JSZip (evita stack overflow su file grandi)
        const base64 = await zip.files[nome].async('base64');
        const l = nome.toLowerCase();
        const mimeType = l.endsWith('.pdf')?'application/pdf':l.endsWith('.png')?'image/png':'image/jpeg';
        const nomeBreve = nome.split('/').pop();
        console.log('Processo:', nomeBreve, mimeType);
        await processaSingoloFile(nomeBreve, base64, mimeType);
      }
      return;
    }

    if(!isImg && !isPdf) return;
    const base64 = await new Promise((res,rej)=>{
      const r = new FileReader();
      r.onload = e => res(e.target.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    await processaSingoloFile(file.name, base64, file.type);
  };

  const handleFiles = async(files) => {
    for(const f of Array.from(files)) await processaFile(f);
  };

  const upDati = (id, campo, val) => {
    setRicevute(p=>p.map(r=>r.id===id?{...r,dati:{...r.dati,[campo]:val}}:r));
  };

  const rimuovi = (id) => setRicevute(p=>p.filter(r=>r.id!==id));

  const [validaModal,setValidaModal]=useState(false);
  const [problemi,setProblemi]=useState([]);

  const CAMPI_OBBLIGATORI=[
    {key:'cf',           label:'Codice Fiscale',   check:v=>v&&v.length===16},
    {key:'cognome',      label:'Cognome',           check:v=>v&&v.trim().length>0},
    {key:'nome',         label:'Nome',              check:v=>v&&v.trim().length>0},
    {key:'importo_lordo',label:'Importo lordo',     check:v=>parseFloat(v)>0},
    {key:'ritenuta',     label:'Ritenuta',          check:v=>parseFloat(v)>0},
    {key:'data_pagamento',label:'Data pagamento',   check:v=>v&&v.trim().length>=8},
  ];

  const valida = () => {
    const prob=[];
    ricevute.filter(r=>!r.loading&&!r.err).forEach(r=>{
      const mancanti=CAMPI_OBBLIGATORI.filter(c=>!c.check(r.dati?.[c.key]));
      if(mancanti.length>0) prob.push({id:r.id,nome:r.nome,mancanti,dati:{...r.dati}});
    });
    if(prob.length>0){
      setProblemi(prob);
      setValidaModal(true);
    } else {
      eseguiGenera();
    }
  };

  const eseguiGenera = () => {
    const percipienti = ricevute
      .filter(r=>r.dati&&r.dati.cf)
      .map(r=>({
        cf:           (r.dati.cf||'').toUpperCase(),
        cognome:      (r.dati.cognome||'').toUpperCase(),
        nome:         (r.dati.nome||'').toUpperCase(),
        sesso:        r.dati.sesso||'',
        data_nascita: r.dati.data_nascita||'',
        comune_nascita:(r.dati.comune_nascita||'').toUpperCase(),
        prov_nascita: (r.dati.prov_nascita||'').toUpperCase(),
        importo:      parseFloat(r.dati.importo_lordo)||0,
        ritenuta:     parseFloat(r.dati.ritenuta)||0,
        data_pagamento:r.dati.data_pagamento||'',
      }));
    if(!percipienti.length){ alert('Nessun percipiente valido'); return; }
    const tel = generaTEL(sostituto, percipienti);
    setTelGenerato({contenuto:tel, numPerc:percipienti.length});
    setValidaModal(false);
  };

  const genera = valida;

  const scaricaTEL = () => {
    if(!telGenerato) return;
    const data = new Date();
    const nome = `CUR${String(data.getFullYear()).slice(2)}${sostituto.piva}.TEL`;
    const blob = new Blob([telGenerato.contenuto], {type:'text/plain;charset=latin-1'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=nome; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  };

  const scaricaExcelTEL = async() => {
    if(!window.XLSX){
      await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
    }
    const XLSX = window.XLSX;
    const percipienti = ricevute.filter(r=>r.dati&&r.dati.cf);
    if(!percipienti.length) return;

    const totLordo = percipienti.reduce((s,r)=>s+parseFloat(r.dati.importo_lordo||0),0);
    const totRit   = percipienti.reduce((s,r)=>s+parseFloat(r.dati.ritenuta||0),0);
    const totNetto = percipienti.reduce((s,r)=>s+parseFloat(r.dati.importo_netto||0),0);

    const rows = percipienti.map((r,i)=>({
      'N.':          i+1,
      'Codice Fiscale': (r.dati.cf||'').toUpperCase(),
      'Cognome':     (r.dati.cognome||'').toUpperCase(),
      'Nome':        (r.dati.nome||'').toUpperCase(),
      'Sesso':       r.dati.sesso||'',
      'Data Nascita':r.dati.data_nascita||'',
      'Comune Nascita': r.dati.comune_nascita||'',
      'Prov.':       r.dati.prov_nascita||'',
      'Importo lordo (€)':  parseFloat(r.dati.importo_lordo)||0,
      'Ritenuta 21% (€)':   parseFloat(r.dati.ritenuta)||0,
      'Netto (€)':          parseFloat(r.dati.importo_netto)||0,
      'Data Pagamento':     r.dati.data_pagamento||'',
      'File origine':       r.nome,
    }));
    // Riga totali
    rows.push({
      'N.': 'TOTALE',
      'Codice Fiscale':'','Cognome':'','Nome':'','Sesso':'',
      'Data Nascita':'','Comune Nascita':'','Prov.':'',
      'Importo lordo (€)': totLordo,
      'Ritenuta 21% (€)':  totRit,
      'Netto (€)':         totNetto,
      'Data Pagamento':'','File origine':'',
    });

    if(XLSX){
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{wch:4},{wch:18},{wch:20},{wch:16},{wch:6},{wch:12},{wch:16},{wch:6},{wch:16},{wch:16},{wch:12},{wch:14},{wch:30}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Locazioni Brevi CU');
      const anno = new Date().getFullYear();
      XLSX.writeFile(wb, `Riepilogo_LocazioniBrevi_${anno}.xlsx`);
    } else {
      // Fallback CSV
      const hdr = Object.keys(rows[0]).join(';');
      const body = rows.map(r=>Object.values(r).join(';')).join('\n');
      const blob = new Blob([hdr+'\n'+body],{type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');a.href=url;a.download='Riepilogo_LocazioniBrevi.csv';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    }
  };

  const pronti = ricevute.filter(r=>r.dati&&r.dati.cf).length;
  const inCaricamento = ricevute.filter(r=>r.loading).length;

  return (
    <div>
      {/* Modal problemi */}
      {validaModal&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setValidaModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:680}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title" style={{color:'var(--gold)'}}>⚠️ Dati mancanti o non rilevati</div>
              <div className="modal-sub">{problemi.length} file con problemi — completa i campi evidenziati</div>
              <button className="modal-close" onClick={()=>setValidaModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {problemi.map((prob,pi)=>(
                <div key={prob.id} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:10,padding:'.85rem',marginBottom:'.75rem'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.65rem'}}>
                    <span style={{fontSize:'.85rem',fontWeight:700}}>{prob.nome}</span>
                    <div style={{display:'flex',gap:'.3rem',flexWrap:'wrap'}}>
                      {prob.mancanti.map(m=>(
                        <span key={m.key} className="bdg bdg-red">{m.label}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem'}}>
                    {CAMPI_OBBLIGATORI.map(campo=>{
                      const manca=!campo.check(prob.dati?.[campo.key]);
                      const IS={background:'var(--bg)',border:`1px solid ${manca?'var(--rd)':'var(--bd)'}`,borderRadius:7,color:'var(--tx)',padding:'.42rem .6rem',fontSize:'.8rem',width:'100%'};
                      return(
                        <div key={campo.key} className="fg" style={{marginBottom:0}}>
                          <label style={{color:manca?'#ff8585':'var(--mu)'}}>{campo.label}{manca&&' *'}</label>
                          <input
                            value={prob.dati?.[campo.key]||''}
                            style={IS}
                            placeholder={manca?'⚠ Mancante':''}
                            onChange={e=>{
                              const newVal=e.target.value;
                              setProblemi(ps=>ps.map((p,i)=>i===pi?{...p,dati:{...p.dati,[campo.key]:newVal}}:p));
                              // Aggiorna anche la ricevuta originale
                              setRicevute(rs=>rs.map(r=>r.id===prob.id?{...r,dati:{...r.dati,[campo.key]:newVal}}:r));
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="alert alert-warn" style={{marginTop:'.5rem'}}>
                💡 I file con tutti i campi compilati verranno inclusi nel .TEL. Quelli ancora incompleti verranno saltati.
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setValidaModal(false)}>Annulla</button>
              <button className="btn" onClick={eseguiGenera}>
                📄 Genera comunque ({ricevute.filter(r=>r.dati&&r.dati.cf).length} percipienti)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dati sostituto */}
      <div className="card" style={{marginBottom:'1.25rem'}}>
        <div className="card-hdr">
          <div className="card-title">🏢 Sostituto d'imposta</div>
          <span className="bdg bdg-gold">Locazioni brevi</span>
        </div>
        <div className="form-grid">
          <div className="fg"><label>Denominazione</label>
            <input value={sostituto.denominazione} onChange={e=>setSostituto(p=>({...p,denominazione:e.target.value}))}/>
          </div>
          <div className="fg"><label>P.IVA / CF</label>
            <input value={sostituto.piva} onChange={e=>setSostituto(p=>({...p,piva:e.target.value,cf:e.target.value}))}/>
          </div>
          <div className="fg"><label>Indirizzo</label>
            <input value={sostituto.indirizzo} onChange={e=>setSostituto(p=>({...p,indirizzo:e.target.value}))}/>
          </div>
          <div className="fg"><label>Comune / Prov / CAP</label>
            <div style={{display:'flex',gap:'.4rem'}}>
              <input value={sostituto.comune} onChange={e=>setSostituto(p=>({...p,comune:e.target.value}))} style={{flex:2}}/>
              <input value={sostituto.prov} onChange={e=>setSostituto(p=>({...p,prov:e.target.value}))} style={{flex:1,maxWidth:50}}/>
              <input value={sostituto.cap} onChange={e=>setSostituto(p=>({...p,cap:e.target.value}))} style={{flex:1,maxWidth:70}}/>
            </div>
          </div>
          <div className="fg"><label>Cod. Attività</label>
            <input value={sostituto.cod_attivita} onChange={e=>setSostituto(p=>({...p,cod_attivita:e.target.value}))}/>
          </div>
          <div className="fg"><label>Cod. Sede</label>
            <input value={sostituto.cod_sede} onChange={e=>setSostituto(p=>({...p,cod_sede:e.target.value}))}/>
          </div>
        </div>
      </div>

      {/* Upload ricevute */}
      <div className="card" style={{marginBottom:'1.25rem'}}>
        <div className="card-hdr">
          <div className="card-title">📎 Carica ricevute</div>
          <span style={{fontSize:'.72rem',color:'var(--mu)'}}>PDF, JPG, PNG · Claude AI estrae i dati automaticamente</span>
        </div>
        <div
          className={'upload-zone'+(drag?' drag':'')}
          style={{padding:'1.5rem'}}
          onDragOver={e=>{e.preventDefault();setDrag(true);}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files);}}
          onClick={()=>fileRef.current.click()}
        >
          <div className="upload-zone-ico">📄</div>
          <div className="upload-zone-t">Trascina le ricevute qui</div>
          <div className="upload-zone-s">PDF, JPG, PNG · oppure un singolo file <strong>.ZIP</strong> con tutte le ricevute dentro</div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,image/*,.zip,application/zip" multiple style={{display:'none'}}
          onChange={e=>handleFiles(e.target.files)}/>
      </div>

      {/* Tabella percipienti */}
      {ricevute.length>0&&(
        <div className="card" style={{padding:0,overflow:'hidden',marginBottom:'1.25rem'}}>
          <div style={{padding:'.75rem 1rem',borderBottom:'1px solid var(--bd)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700}}>
              Percipienti · <span style={{color:'var(--gr)'}}>{pronti} pronti</span>
              {inCaricamento>0&&<span style={{color:'var(--gold)',marginLeft:'.5rem'}}>⏳ {inCaricamento} in lettura...</span>}
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                <th>File</th><th>CF</th><th>Cognome</th><th>Nome</th>
                <th>Importo lordo</th><th>Ritenuta 21%</th><th>Data pag.</th><th>Azioni</th>
              </tr></thead>
              <tbody>{ricevute.map(r=>(
                <tr key={r.id} style={r.err?{background:'rgba(224,82,82,.04)'}:{}}>
                  <td style={{fontSize:'.72rem',color:'var(--mu)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nome}</td>
                  {r.loading?(
                    <td colSpan={6} style={{color:'var(--gold)',fontSize:'.78rem'}}>✨ Claude sta leggendo...</td>
                  ):r.err?(
                    <td colSpan={6} style={{color:'var(--rd)',fontSize:'.75rem'}}>⚠️ {r.err}</td>
                  ):(
                    <>
                      <td><input value={r.dati?.cf||''} onChange={e=>upDati(r.id,'cf',e.target.value)} style={{width:130,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem'}}/></td>
                      <td><input value={r.dati?.cognome||''} onChange={e=>upDati(r.id,'cognome',e.target.value)} style={{width:120,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem'}}/></td>
                      <td><input value={r.dati?.nome||''} onChange={e=>upDati(r.id,'nome',e.target.value)} style={{width:100,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem'}}/></td>
                      <td><input type="number" value={r.dati?.importo_lordo||0} onChange={e=>upDati(r.id,'importo_lordo',e.target.value)} style={{width:90,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem',textAlign:'right'}}/></td>
                      <td><input type="number" value={r.dati?.ritenuta||0} onChange={e=>upDati(r.id,'ritenuta',e.target.value)} style={{width:80,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--rd)',padding:'.3rem .5rem',fontSize:'.75rem',textAlign:'right'}}/></td>
                      <td><input value={r.dati?.data_pagamento||''} onChange={e=>upDati(r.id,'data_pagamento',e.target.value)} placeholder="DD/MM/YYYY" style={{width:95,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem'}}/></td>
                    </>
                  )}
                  <td><button className="btn-icon" style={{color:'var(--rd)',borderColor:'rgba(224,82,82,.3)'}} onClick={()=>rimuovi(r.id)}>🗑</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Azioni */}
      {pronti>0&&(
        <div style={{display:'flex',gap:'.75rem',alignItems:'center',flexWrap:'wrap'}}>
          <button className="btn" disabled={generating||inCaricamento>0} onClick={genera}>
            {generating?'Verifica...':'🔍 Verifica e genera .TEL ('+pronti+' percipienti)'}
          </button>
          {telGenerato&&(
            <>
              <button className="btn-sec" onClick={scaricaTEL}>⬇️ Scarica .TEL</button>
              <button className="btn-sec" onClick={scaricaExcelTEL}>📊 Riepilogo Excel</button>
              <span style={{fontSize:'.8rem',color:'var(--gr)',fontWeight:600}}>✅ File pronto · {telGenerato.numPerc} percipienti</span>
            </>
          )}
        </div>
      )}

      {!ricevute.length&&(
        <div className="alert alert-info">
          💡 Carica le ricevute PDF o foto JPG/PNG. Claude AI leggerà automaticamente CF, importi e date da ciascuna ricevuta. Potrai correggere i dati prima di generare il file .TEL per Teamsystem.
        </div>
      )}
    </div>
  );
}

// ─── WIP BANNER ──────────────────────────────────────────────
function WIPBanner({modulo="questo modulo"}){
  return(
    <div style={{background:"linear-gradient(135deg,rgba(167,139,250,.12),rgba(78,142,247,.08))",border:"1px solid rgba(167,139,250,.35)",borderRadius:12,padding:"1rem 1.25rem",marginBottom:"1.25rem",display:"flex",alignItems:"center",gap:"1rem"}}>
      <div style={{fontSize:"1.5rem",flexShrink:0}}>🚧</div>
      <div>
        <div style={{fontWeight:700,fontSize:".9rem",color:"#c4b5fd",marginBottom:".2rem"}}>Work in Progress</div>
        <div style={{fontSize:".75rem",color:"var(--mu)",lineHeight:1.5}}>
          {modulo} è in fase di sviluppo e potrebbe contenere funzionalità incomplete o dati di test. 
          Verificare sempre i risultati prima di utilizzarli operativamente.
        </div>
      </div>
      <span style={{marginLeft:"auto",fontSize:".65rem",fontWeight:700,background:"rgba(167,139,250,.15)",color:"#c4b5fd",border:"1px solid rgba(167,139,250,.3)",borderRadius:6,padding:".2rem .6rem",whiteSpace:"nowrap",flexShrink:0}}>BETA</span>
    </div>
  );
}

// ─── MODULO CERTIFICAZIONI UNICHE ────────────────────────────

export function ModuloCU(){
  const [step,setStep]=useState('upload'); // upload | processing | review | sending
  const [anno,setAnno]=useState(new Date().getFullYear().toString());
  const [drag,setDrag]=useState(false);
  const [loading,setLoading]=useState(false);
  const [errore,setErrore]=useState(null);
  const [progInfo,setProgInfo]=useState({fase:'',pct:0,dettaglio:''});
  const [risultati,setRisultati]=useState([]); // array CU splittate
  const [clienti,setClienti]=useState([]);
  const [mailMap,setMailMap]=useState({}); // sostitutoCF → { email, cc, note, selezionato }
  const [invioStato,setInvioStato]=useState({}); // fileName → 'pending'|'ok'|'err'
  const [invioInCorso,setInvioInCorso]=useState(false);
  const [progresso,setProgresso]=useState({done:0,tot:0});
  const fileRef=useRef();

  useEffect(()=>{
    sb.from('clienti').select('id,nome,cognome,ragione_sociale,email,email_cc,partita_iva,codice_fiscale').eq('attivo',true).order('nome')
      .then(({data})=>setClienti(data||[]));
  },[]);

  // Raggruppa CU per sostituto
  const cuPerSostituto=useMemo(()=>{
    const map={};
    risultati.forEach(cu=>{
      const k=cu.sostitutoCF||cu.sostitutoNome||'SCONOSCIUTO';
      if(!map[k])map[k]={sostitutoCF:cu.sostitutoCF,sostitutoNome:cu.sostitutoNome||cu.sostitutoCF||'Sconosciuto',cu:[]};
      map[k].cu.push(cu);
    });
    return map;
  },[risultati]);

  // Auto-match sostituto con anagrafica clienti
  useEffect(()=>{
    if(!risultati.length)return;
    const newMap={...mailMap};
    Object.keys(cuPerSostituto).forEach(k=>{
      if(newMap[k])return; // già mappato
      const {sostitutoCF}=cuPerSostituto[k];
      const match=clienti.find(c=>{
        const piva=(c.partita_iva||'').replace(/\D/g,'');
        const cf=(c.codice_fiscale||'').toUpperCase();
        const search=(sostitutoCF||'').replace(/\D/g,'');
        return (piva&&piva===search)||(cf&&cf===search.toUpperCase());
      });
      newMap[k]={
        email:match?.email||'',
        cc:match?.email_cc||[],
        nomeCliente:match?(match.ragione_sociale||`${match.nome} ${match.cognome||''}`.trim()):'',
        matched:!!match,
        selezionato:true,
      };
    });
    setMailMap(newMap);
  },[risultati,clienti]);

  const handleFile=async(file)=>{
    if(!file||!file.name.endsWith('.pdf')){setErrore('Carica un file PDF');return;}
    setErrore(null);setLoading(true);setStep('processing');
    try{
      // Carica librerie on-demand
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      const pdfLib=window.PDFLib;
      const pdfjsLib=window.pdfjsLib;
      if(!pdfLib||!pdfjsLib)throw new Error('Librerie PDF non disponibili. Controlla la connessione e riprova.');
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      setProgInfo({fase:'Lettura file...',pct:2,dettaglio:''});
      // Leggi file con FileReader — più compatibile cross-browser
      const arrayBuffer=await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=e=>res(e.target.result);
        r.onerror=rej;
        r.readAsArrayBuffer(file);
      });
      // Crea due copie separate — una per pdfjs, una per pdf-lib
      const uint8=new Uint8Array(arrayBuffer);
      const uint8Copy=new Uint8Array(arrayBuffer.slice(0));

      // Estrai testo pagina per pagina con pdfjs
      const loadingTask=pdfjsLib.getDocument({data:uint8});
      const pdfDoc=await loadingTask.promise;
      const numPages=pdfDoc.numPages;
      const pageTesti=[];
      for(let i=1;i<=numPages;i++){
        const page=await pdfDoc.getPage(i);
        const content=await page.getTextContent();
        pageTesti.push(content.items.map(item=>item.str).join(String.fromCharCode(10)));
        const pct=Math.round((i/numPages)*30)+5;
        setProgInfo({fase:'Lettura testo...',pct,dettaglio:`Pagina ${i} di ${numPages}`});
      }

      // Trova inizio ogni CU
      const boundaries=[];
      for(let i=0;i<pageTesti.length;i++){
        const t=pageTesti[i].toUpperCase();
        if(t.includes('CERTIFICAZIONE')&&t.includes('UNICA')&&t.includes('DATI ANAGRAFICI')&&
          (t.includes('DATORE DI LAVORO')||t.includes('SOSTITUTO'))){
          boundaries.push(i);
        }
      }
      if(!boundaries.length)throw new Error('Nessuna CU trovata. Verifica che il file sia un PDF di Certificazioni Uniche.');

      setProgInfo({fase:'Trovate '+boundaries.length+' CU — avvio split...',pct:36,dettaglio:'Caricamento documento...'});
      // Split con pdf-lib
      const srcDoc=await pdfLib.PDFDocument.load(uint8Copy);
      const risultatiArr=[];

      for(let b=0;b<boundaries.length;b++){
        const startPage=boundaries[b];
        const endPage=b+1<boundaries.length?boundaries[b+1]-1:numPages-1;
        const testo=pageTesti[startPage];
        const pctSplit=Math.round(37+(b/boundaries.length)*60);
        setProgInfo({fase:`Split CU ${b+1} di ${boundaries.length}`,pct:pctSplit,dettaglio:`Pagine ${startPage+1}–${endPage+1}`});

        // ── Estrai dati dalla CU ──
        // REGOLA: primo identificativo = sostituto, secondo = percipiente
        // Identificativo = CF persona fisica (16 char) OPPURE P.IVA azienda (11 cifre)
        const NL=String.fromCharCode(10);
        const testoCompleto=pageTesti.slice(startPage,endPage+1).join(NL);
        const lines2=testo.split(NL).map(l=>l.trim()).filter(Boolean);

        // Trova tutti gli identificativi fiscali in ordine di apparizione
        // Crea lista unificata: {tipo:'CF16'|'PIVA', valore, posizione}
        const CF16_RE=/([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])/gi;
        const PIVA_RE=/(?<![0-9])([0-9]{11})(?![0-9])/g;
        const idFiscali=[];
        for(const m of testo.matchAll(CF16_RE)) idFiscali.push({tipo:'CF16',val:m[1].toUpperCase(),pos:m.index});
        for(const m of testo.matchAll(PIVA_RE))  idFiscali.push({tipo:'PIVA', val:m[1],            pos:m.index});
        idFiscali.sort((a,b)=>a.pos-b.pos); // ordine di comparsa nel testo

        const idSostituto  = idFiscali[0]||null;
        const idPercipiente= idFiscali.find(x=>x.val!==idSostituto?.val)||idFiscali[1]||null;

        const sostitutoCF  = idSostituto?.val||'';
        const percipienteCF= idPercipiente?.val||'';

        // ── Nome sostituto ──
        let sostitutoNome='';

        // St.A: footer ADE — presente su ogni pagina in due formati:
        // Azienda:        "Codice fiscale 02425570823 Denominazione ITALKALI S.p.A."
        // Persona fisica: "Codice fiscale DTFNGL72A55D708Z Denominazione DI TOFANO" (a volte su riga separata)
        // Il campo si chiama "Cognome o Denominazione" nel modulo
        const footerM=testoCompleto.match(/Codice fiscale\s+[0-9A-Z]{11,16}\s+(?:Cognome o )?Denominazione\s+([^\n\r]{3,80})/i);
        if(footerM){
          sostitutoNome=footerM[1].trim().replace(/\s+/g,' ');
        } else {
          // Alternativo: cerca pattern "CF16 COGNOME NOME" o "PIVA DENOMINAZIONE" nel footer di pagina
          // Alcune versioni mettono CF e denominazione su righe separate con solo "Denominazione"
          const footerM2=testoCompleto.match(/([0-9A-Z]{11,16})\s*\n\s*([A-Z][A-Za-z\u00C0-\u024F\s\.,'&()-]{2,60})\s*\n/);
          if(footerM2&&footerM2[1]===sostitutoCF){
            sostitutoNome=footerM2[2].trim();
          }
        }

        // St.B: nome subito dopo l'identificativo sostituto nel testo
        if(!sostitutoNome&&sostitutoCF){
          const sIdx=testo.toUpperCase().indexOf(sostitutoCF);
          const dopoS=testo.substring(sIdx+sostitutoCF.length, sIdx+sostitutoCF.length+300);
          const dopoSLines=dopoS.split(NL).map(l=>l.trim()).filter(Boolean);
          // Raccoglie fino a 2 token nome (cognome + nome per persona fisica)
          const parti=[];
          for(const dl of dopoSLines.slice(0,5)){
            if(dl.length>=2&&dl.length<=50&&/^[A-Z\u00C0-\u024F]/.test(dl)&&
               !['DATI','CERTIF','COMUNE','DOMICILIO','TELEFONO','CODICE','INDIRIZZO',
                 'COGNOME','DENOMINAZIONE','NOME','SESSO','FISCALE'].some(k=>dl.toUpperCase().includes(k))){
              parti.push(dl);
              if(parti.length>=2)break;
            }
          }
          if(parti.length>0) sostitutoNome=parti.join(' ');
        }

        // St.C: P.IVA + denominazione sulla stessa riga
        if(!sostitutoNome){
          for(const l of lines2){
            const m=l.match(/^([0-9]{11})\s+(.{3,80})$/);
            if(m){sostitutoNome=m[2].trim();break;}
          }
        }

        sostitutoNome=(sostitutoNome||'').split(NL)[0].trim().replace(/\s+/g,' ');

        // ── Nome percipiente: subito dopo il suo identificativo ──
        let percipientiNome='';
        if(percipienteCF){
          const pIdx=testo.toUpperCase().indexOf(percipienteCF);
          const dopoP=testo.substring(pIdx+percipienteCF.length, pIdx+percipienteCF.length+400);
          const dopoPLines=dopoP.split(NL).map(l=>l.trim());
          for(const dl of dopoPLines){
            if(dl.length>=3&&dl.length<=60&&dl===dl.toUpperCase()&&/^[A-Z\u00C0-\u024F]/.test(dl)&&
               !/^[0-9]/.test(dl)&&
               !['DATI','CERTIF','COMUNE','DOMICILIO','FIRME','UNICA','SESSO',
                 'COGNOME','DENOMINAZIONE','FISCALE'].some(k=>dl.includes(k))){
              percipientiNome=dl;break;
            }
          }
          // Fallback: primo blocco maiuscolo significativo
          if(!percipientiNome){
            const m=dopoP.match(/([A-Z\u00C0-\u024F]{2,}(?:\s+[A-Z\u00C0-\u024F]{2,}){1,3})/);
            if(m&&!['DATI','CERTIF','AGENZIA','UNICA','DENOMINAZIONE'].some(k=>m[1].includes(k)))
              percipientiNome=m[1].trim();
          }
        }
        // Crea PDF con le pagine di questa CU
        const nuovoDoc=await pdfLib.PDFDocument.create();
        const indices=[];
        for(let p=startPage;p<=endPage;p++)indices.push(p);
        const copiate=await nuovoDoc.copyPages(srcDoc,indices);
        copiate.forEach(p=>nuovoDoc.addPage(p));
        const bytes=await nuovoDoc.save();
        const base64=btoa(String.fromCharCode(...bytes));

        const nomePulito=(percipientiNome||percipienteCF||'PERCIPIENTE')
          .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s]/g,'').trim()
          .replace(/\s+/g,'_').toUpperCase().substring(0,50);
        const fileName=`${nomePulito}_CU${anno}.pdf`;

        risultatiArr.push({fileName,base64,percipienteCF,percipientiNome,sostitutoNome,sostitutoCF,
          pagine:endPage-startPage+1,pageStart:startPage+1,pageEnd:endPage+1});
      }

      setProgInfo({fase:'Completato!',pct:100,dettaglio:risultatiArr.length+' CU estratte'});
      await new Promise(r=>setTimeout(r,400)); // breve pausa per mostrare 100%
      setRisultati(risultatiArr);
      setStep('review');
    }catch(e){
      console.error('CU split error:',e);
      setErrore(e.message);
      setStep('upload');
    }finally{setLoading(false);}
  };

  // Genera file riepilogo Excel/CSV
  const scaricaRiepilogo=async()=>{
    if(!window.XLSX){
      await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
    }
    const XLSX=window.XLSX;
    if(XLSX){
      // Excel con XLSX se disponibile
      const rows=[];
      const sostitutiOrdinati=Object.values(cuPerSostituto).sort((a,b)=>(a.sostitutoNome||'SCONOSCIUTO').localeCompare(b.sostitutoNome||'SCONOSCIUTO','it'));
      sostitutiOrdinati.forEach(gruppo=>{
        rows.push({
          'Sostituto d\'imposta': gruppo.sostitutoNome||'(non rilevato)',
          'P.IVA / CF': gruppo.sostitutoCF||'',
          'N. CU': gruppo.cu.length,
          'Percipienti': gruppo.cu.map(cu=>cu.percipientiNome||cu.percipienteCF||'—').join(', '),
        });
        gruppo.cu.sort((a,b)=>(a.percipientiNome||'').localeCompare(b.percipientiNome||'','it')).forEach(cu=>{
          rows.push({
            'Sostituto d\'imposta': '',
            'P.IVA / CF': cu.percipienteCF||'',
            'N. CU': '',
            'Percipienti': cu.percipientiNome||cu.percipienteCF||'—',
          });
        });
      });
      // Riga totale
      rows.push({'Sostituto d\'imposta':'TOTALE','P.IVA / CF':'','N. CU':risultati.length,'Percipienti':''});
      const ws=XLSX.utils.json_to_sheet(rows);
      ws['!cols']=[{wch:40},{wch:18},{wch:8},{wch:80}];
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Riepilogo CU '+anno);
      XLSX.writeFile(wb,'Riepilogo_CU'+anno+'_'+new Date().toISOString().split('T')[0]+'.xlsx');
    } else {
      // Fallback CSV
      let csv='Sostituto;P.IVA-CF;N.CU;Percipiente\n';
      Object.values(cuPerSostituto).sort((a,b)=>(a.sostitutoNome||'').localeCompare(b.sostitutoNome||'','it')).forEach(g=>{
        g.cu.sort((a,b)=>(a.percipientiNome||'').localeCompare(b.percipientiNome||'','it')).forEach((cu,i)=>{
          csv+=`${i===0?(g.sostitutoNome||'(non rilevato)'):''};"${g.sostitutoCF||''}";${i===0?g.cu.length:''};"${cu.percipientiNome||cu.percipienteCF||'—'}"\n`;
        });
      });
      csv+=`TOTALE;;;${risultati.length}\n`;
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='Riepilogo_CU'+anno+'.csv';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    }
  };

  const handleDrop=e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);};

  const downloadSingolo=(cu)=>{
    const bytes=Uint8Array.from(atob(cu.base64),c=>c.charCodeAt(0));
    const blob=new Blob([bytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=cu.fileName;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  };

  const nomeCartella=(s)=>(s.sostitutoNome&&s.sostitutoNome.trim()?s.sostitutoNome:s.sostitutoCF||'SCONOSCIUTO').replace(/[^A-Za-z0-9\u00C0-\u024F\s]/g,'').trim().replace(/\s+/g,'_').toUpperCase().substring(0,50);

  const downloadTutti=async()=>{
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const JSZip=window.JSZip;
    if(!JSZip){alert('Libreria ZIP non disponibile');return;}
    const zip=new JSZip();
    // Ordina sostituti per nome
    const sostitutiOrdinati=Object.values(cuPerSostituto).sort((a,b)=>(a.sostitutoNome||'').localeCompare(b.sostitutoNome||'','it'));
    for(const gruppo of sostitutiOrdinati){
      const cartella=nomeCartella(gruppo);
      // Ordina percipiente per cognome (primo token del nome)
      const cuOrdinati=[...gruppo.cu].sort((a,b)=>{
        const nA=(a.percipientiNome||a.percipienteCF||'').toUpperCase();
        const nB=(b.percipientiNome||b.percipienteCF||'').toUpperCase();
        return nA.localeCompare(nB,'it');
      });
      for(const cu of cuOrdinati){
        const bytes=Uint8Array.from(atob(cu.base64),c=>c.charCodeAt(0));
        zip.file(`${cartella}/${cu.fileName}`,bytes);
      }
    }
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`CU${anno}_${new Date().toISOString().split('T')[0]}.zip`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  };

  const downloadPerSostituto=async(chiave)=>{
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const JSZip=window.JSZip;
    const gruppo=cuPerSostituto[chiave];
    if(!gruppo)return;
    if(!JSZip){// fallback senza zip
      gruppo.cu.forEach(cu=>downloadSingolo(cu));return;
    }
    const zip=new JSZip();
    const cartella=nomeCartella(gruppo);
    const cuOrdinati=[...gruppo.cu].sort((a,b)=>(a.percipientiNome||'').localeCompare(b.percipientiNome||'','it'));
    for(const cu of cuOrdinati){
      const bytes=Uint8Array.from(atob(cu.base64),c=>c.charCodeAt(0));
      zip.file(`${cartella}/${cu.fileName}`,bytes);
    }
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`${cartella}_CU${anno}.zip`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  };

  const inviaMailSostituto=async(chiave)=>{
    const entry=mailMap[chiave];
    if(!entry?.email){alert('Inserisci email per '+cuPerSostituto[chiave].sostitutoNome);return;}
    const cuList=cuPerSostituto[chiave].cu;
    setInvioStato(p=>({...p,...Object.fromEntries(cuList.map(cu=>[cu.fileName,'pending']))}));
    try{
      // Prepara allegati come base64 per email
      const allegati=cuList.map(cu=>({fileName:cu.fileName,base64:cu.base64,mimeType:'application/pdf'}));
      const oggetto=`Certificazioni Uniche ${anno} — ${cuPerSostituto[chiave].sostitutoNome||chiave}`;
      const corpo=`Gentile Cliente,\n\nIn allegato le Certificazioni Uniche ${anno} relative ai Vostri dipendenti/collaboratori.\n\nCertificazioni allegate:\n${cuList.map(cu=>`• ${cu.percipientiNome||cu.percipienteCF} (${cu.pagine} pagine)`).join(String.fromCharCode(10))}\n\nCordiali saluti,\nStudio Envisioning`;
      const resp=await fetch('/api/send-email',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({to:[entry.email],cc:entry.cc||[],oggetto,corpo,allegati_cu:allegati}),
      });
      const data=await resp.json();
      if(!resp.ok)throw new Error(data.error);
      setInvioStato(p=>({...p,...Object.fromEntries(cuList.map(cu=>[cu.fileName,'ok']))}));
    }catch(e){
      setInvioStato(p=>({...p,...Object.fromEntries(cuPerSostituto[chiave].cu.map(cu=>[cu.fileName,'err']))}));
      alert('Errore invio: '+e.message);
    }
  };

  const invioMassivoTutti=async()=>{
    const chiavi=Object.keys(cuPerSostituto).filter(k=>mailMap[k]?.selezionato&&mailMap[k]?.email);
    if(!chiavi.length){alert('Nessun cliente con email configurata selezionato');return;}
    setInvioInCorso(true);
    setProgresso({done:0,tot:chiavi.length});
    for(let i=0;i<chiavi.length;i++){
      await inviaMailSostituto(chiavi[i]);
      setProgresso({done:i+1,tot:chiavi.length});
    }
    setInvioInCorso(false);
  };

  const upMail=(k,field,val)=>setMailMap(p=>({...p,[k]:{...p[k],[field]:val}}));

  // ── RENDER ────────────────────────────────────────────────
  const [cuTab,setCuTab]=useState('split'); // split | tel

  return(
    <div className="page">
      <div className="page-hdr">
        <div className="page-title">📜 Certificazioni Uniche</div>
        <div className="page-sub">Split CU · invio mail · generazione file .TEL locazioni brevi</div>
      </div>

      {/* TAB selector */}
      <div className="pills" style={{marginBottom:'1.25rem'}}>
        <span className={'pill'+(cuTab==='split'?' active':'')} onClick={()=>setCuTab('split')}>📄 Split e invio CU</span>
        <span className={'pill'+(cuTab==='tel'?' active':'')} onClick={()=>setCuTab('tel')}>🏠 Genera .TEL locazioni brevi</span>
      </div>

      {cuTab==='tel'&&<ModuloTEL/>}

      {cuTab==='split'&&<>

      {/* STEP UPLOAD */}
      {step==='upload'&&(
        <div className="card">
          <div className="card-hdr">
            <div className="card-title">1. Carica il PDF CU</div>
            <div className="fg" style={{margin:0,minWidth:120}}>
              <label style={{fontSize:'.62rem',textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',fontWeight:600}}>Anno CU</label>
              <input type="number" value={anno} onChange={e=>setAnno(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,color:'var(--tx)',padding:'.35rem .6rem',fontSize:'.84rem',width:90}}/>
            </div>
          </div>
          {errore&&<div className="alert alert-err" style={{marginBottom:'.85rem'}}>⚠️ {errore}</div>}
          <div
            className={'upload-zone'+(drag?' drag':'')}
            style={{padding:'2.5rem'}}
            onDragOver={e=>{e.preventDefault();setDrag(true);}}
            onDragLeave={()=>setDrag(false)}
            onDrop={handleDrop}
            onClick={()=>fileRef.current.click()}
          >
            <div className="upload-zone-ico">📄</div>
            <div className="upload-zone-t">Trascina il PDF delle Certificazioni Uniche</div>
            <div className="upload-zone-s">Anche massivo con più CU · solo .pdf · Anno: CU{anno}</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
          <div className="alert alert-info" style={{marginTop:'.85rem'}}>
            💡 Il sistema riconosce automaticamente ogni CU dal pattern "CERTIFICAZIONE UNICA + DATI ANAGRAFICI" e splitta per percipiente. File nominati: <strong>COGNOME_NOME_CU{anno}.pdf</strong>
          </div>
        </div>
      )}

      {/* STEP PROCESSING */}
      {step==='processing'&&(
        <div className="card" style={{padding:'2rem 2.5rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1.5rem'}}>
            <div style={{fontSize:'1.75rem'}}>📄</div>
            <div>
              <div style={{fontWeight:700,fontSize:'1rem',marginBottom:'.2rem'}}>{progInfo.fase||'Elaborazione in corso...'}</div>
              <div style={{fontSize:'.78rem',color:'var(--mu)'}}>{progInfo.dettaglio||'Attendere...'}</div>
            </div>
            <div style={{marginLeft:'auto',fontFamily:"'Playfair Display',serif",fontSize:'1.5rem',fontWeight:700,color:'var(--gold)'}}>{progInfo.pct}%</div>
          </div>
          {/* Barra progresso */}
          <div style={{height:10,background:'var(--bd)',borderRadius:5,overflow:'hidden',marginBottom:'.75rem'}}>
            <div style={{height:'100%',borderRadius:5,background:'linear-gradient(90deg,var(--gold),var(--gld2))',width:progInfo.pct+'%',transition:'width .3s ease',boxShadow:'0 0 8px rgba(200,164,94,.5)'}}>
            </div>
          </div>
          <div style={{fontSize:'.7rem',color:'var(--mu)',textAlign:'center'}}>
            {progInfo.pct<36?'Fase 1/3 — Lettura pagine PDF':progInfo.pct<97?'Fase 2/3 — Split certificazioni':'Fase 3/3 — Finalizzazione'}
          </div>
        </div>
      )}

      {/* STEP REVIEW */}
      {step==='review'&&(
        <>
          {/* Stats */}
          <div className="stats-grid" style={{marginBottom:'1rem'}}>
            <div className="stat-card">
              <div className="stat-ico">📜</div>
              <div className="stat-val" style={{color:'var(--gold)',fontSize:'1.8rem'}}>{risultati.length}</div>
              <div className="stat-lbl">CU estratte totali</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">🏢</div>
              <div className="stat-val" style={{color:'var(--pu)'}}>{Object.keys(cuPerSostituto).length}</div>
              <div className="stat-lbl">Sostituti d'imposta</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">✅</div>
              <div className="stat-val" style={{color:'var(--gr)'}}>{Object.values(mailMap).filter(m=>m.matched).length}</div>
              <div className="stat-lbl">Clienti trovati</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">⚠️</div>
              <div className="stat-val" style={{color:'var(--rd)'}}>{Object.values(mailMap).filter(m=>!m.matched).length}</div>
              <div className="stat-lbl">Email da inserire</div>
            </div>
          </div>

          {/* Azioni globali */}
          <div style={{display:'flex',gap:'.5rem',marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
            <button className="btn-sec" onClick={downloadTutti}>📦 Scarica ZIP (con sottocartelle)</button>
            <button className="btn-sec" onClick={scaricaRiepilogo}>📊 Riepilogo Excel</button>
            <button className="btn" disabled={invioInCorso} onClick={invioMassivoTutti}>
              {invioInCorso?`⏳ Invio ${progresso.done}/${progresso.tot}...`:'📤 Invia tutte le mail'}
            </button>
            <button className="btn-sec" onClick={()=>{setStep('upload');setRisultati([]);setMailMap({});setInvioStato({});}}>
              ↩️ Nuovo file
            </button>
          </div>

          {/* Barra progresso invio massivo */}
          {Object.values(cuPerSostituto).some(g=>!g.sostitutoNome||g.sostitutoNome.trim()===''||g.sostitutoNome==='SCONOSCIUTO')&&(
            <div className="alert alert-warn" style={{marginBottom:'.75rem'}}>
              ⚠️ <strong>{Object.values(cuPerSostituto).filter(g=>!g.sostitutoNome||g.sostitutoNome==='SCONOSCIUTO').length} sostituti</strong> con nome non rilevato automaticamente — verifica nel riepilogo Excel e aggiorna il nome manualmente nel campo sostituto.
            </div>
          )}
          {invioInCorso&&(
            <div style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:9,padding:'.75rem 1rem',marginBottom:'1rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'.78rem',marginBottom:'.4rem'}}>
                <span>Invio mail in corso...</span><span style={{color:'var(--gold)'}}>{progresso.done}/{progresso.tot}</span>
              </div>
              <div style={{height:6,background:'var(--bd)',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',background:'linear-gradient(90deg,var(--gold),var(--gld2))',borderRadius:3,width:(progresso.done/progresso.tot*100)+'%',transition:'width .3s'}}/>
              </div>
            </div>
          )}

          {/* Lista per sostituto */}
          {Object.entries(cuPerSostituto).map(([chiave,gruppo])=>{
            const mail=mailMap[chiave]||{};
            const cuDelGruppo=gruppo.cu;
            const tutteOk=cuDelGruppo.every(cu=>invioStato[cu.fileName]==='ok');
            const qualcunaErr=cuDelGruppo.some(cu=>invioStato[cu.fileName]==='err');
            return(
              <div key={chiave} className="card" style={{marginBottom:'1.25rem',border:tutteOk?'1px solid rgba(52,194,122,.35)':qualcunaErr?'1px solid rgba(224,82,82,.35)':'1px solid var(--bd)'}}>
                {/* Header sostituto */}
                <div style={{display:'flex',alignItems:'flex-start',gap:'.75rem',marginBottom:'1rem',flexWrap:'wrap'}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.2rem'}}>
                      <div onClick={()=>upMail(chiave,'selezionato',!mail.selezionato)} style={{width:16,height:16,borderRadius:3,border:`1.5px solid ${mail.selezionato?'var(--gold)':'var(--bd2)'}`,background:mail.selezionato?'var(--gold)':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        {mail.selezionato&&<span style={{color:'#0d1117',fontSize:'.6rem',fontWeight:700}}>✓</span>}
                      </div>
                      <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:'.95rem'}}>
                        {gruppo.sostitutoNome||chiave}
                      </div>
                      {mail.matched?<span className="bdg bdg-green">✓ In anagrafica</span>:<span className="bdg bdg-red">⚠ Non trovato</span>}
                      {tutteOk&&<span className="bdg bdg-green">✓ Mail inviata</span>}
                    </div>
                    <div style={{fontSize:'.72rem',color:'var(--mu)'}}>CF/P.IVA: {gruppo.sostitutoCF} · {cuDelGruppo.length} CU</div>
                  </div>
                  <div style={{display:'flex',gap:'.4rem',flexShrink:0}}>
                    <button className="btn-sec btn-sm" onClick={()=>downloadPerSostituto(chiave)}>📦 ZIP</button>
                    <button className="btn btn-sm" disabled={!mail.email||invioInCorso||tutteOk} onClick={()=>inviaMailSostituto(chiave)}>
                      {tutteOk?'✓ Inviato':'📤 Invia'}
                    </button>
                  </div>
                </div>

                {/* Email */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.65rem',marginBottom:'1rem'}}>
                  <div className="fg" style={{marginBottom:0}}>
                    <label>Email destinatario {!mail.email&&<span style={{color:'var(--rd)'}}>*</span>}</label>
                    <input type="email" value={mail.email||''} onChange={e=>upMail(chiave,'email',e.target.value)} placeholder="email@cliente.it" style={{background:'var(--s2)',border:`1px solid ${!mail.email?'rgba(224,82,82,.5)':'var(--bd)'}`,borderRadius:8,color:'var(--tx)',padding:'.45rem .7rem',fontSize:'.82rem',width:'100%'}}/>
                  </div>
                  <div className="fg" style={{marginBottom:0}}>
                    <label>CC (opzionale)</label>
                    <TagInput value={mail.cc||[]} onChange={v=>upMail(chiave,'cc',v)}/>
                  </div>
                </div>

                {/* Lista CU del sostituto */}
                <div style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:9,overflow:'hidden'}}>
                  <div style={{fontSize:'.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',padding:'.45rem .75rem',borderBottom:'1px solid var(--bd)',display:'grid',gridTemplateColumns:'1fr auto auto auto'}}>
                    <span>Percipiente</span><span>CF</span><span style={{textAlign:'right'}}>Pagine</span><span style={{textAlign:'right',marginLeft:'.75rem'}}>Stato</span>
                  </div>
                  {cuDelGruppo.map(cu=>{
                    const st=invioStato[cu.fileName];
                    return(
                      <div key={cu.fileName} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',alignItems:'center',padding:'.5rem .75rem',borderBottom:'1px solid rgba(33,40,58,.4)',gap:'.75rem'}}>
                        <div>
                          <div style={{fontSize:'.82rem',fontWeight:500}}>{cu.percipientiNome||'—'}</div>
                          <div style={{fontSize:'.68rem',color:'var(--mu)'}}>{cu.fileName}</div>
                        </div>
                        <div style={{fontSize:'.72rem',color:'var(--mu)',fontFamily:'monospace'}}>{cu.percipienteCF||'—'}</div>
                        <div style={{fontSize:'.75rem',color:'var(--mu)',textAlign:'right'}}>{cu.pagine}p</div>
                        <div style={{display:'flex',gap:'.3rem',justifyContent:'flex-end'}}>
                          {st==='ok'&&<span className="bdg bdg-green">✓</span>}
                          {st==='err'&&<span className="bdg bdg-red">Err</span>}
                          {st==='pending'&&<span className="bdg bdg-gray">⏳</span>}
                          <button className="btn-icon" style={{fontSize:'.7rem',padding:'.2rem .45rem'}} onClick={()=>downloadSingolo(cu)}>⬇️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
      </>}
    </div>
  );
}

// ─── SIMULATORE ──────────────────────────────────────────────
const ATECO=[{label:"Pubblicità, marketing, content creator (73)",coeff:.78},{label:"Attività professionali, commercialisti, avvocati (69-75)",coeff:.78},{label:"Informatica, software, web, IT (58-63)",coeff:.78},{label:"Sanità, medicina, psicologia (86-88)",coeff:.78},{label:"Istruzione, formazione, coaching (85)",coeff:.78},{label:"Arte, sport, intrattenimento (90-93)",coeff:.67},{label:"Commercio al dettaglio e ingrosso (45-47)",coeff:.40},{label:"Ristorazione e alloggio (55-56)",coeff:.40},{label:"Costruzioni e impiantistica (41-43)",coeff:.86}];
const CALENDARS={occasionale:[{month:"Febbraio",items:[{date:"28/02",title:"Ricezione CU",desc:"CU dai committenti con ritenuta 20%.",level:"nrm"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi PF",desc:"Dichiarazione redditi + versamento IRPEF.",level:"urg"}]},{month:"Novembre",items:[{date:"30/11",title:"2° Acconto IRPEF",desc:"Versamento F24 seconda rata.",level:"imp"}]}],forfettario:[{month:"Febbraio",items:[{date:"16/02",title:"IVS – IV rata",desc:"Versamento quarta rata IVS anno prec.",level:"nrm"},{date:"28/02",title:"Bolli fatture – IV trim.",desc:"Imposta di bollo IV trimestre.",level:"nrm"}]},{month:"Maggio",items:[{date:"16/05",title:"IVS – I rata",desc:"Prima rata contributi IVS.",level:"imp"},{date:"31/05",title:"Bolli fatture – I trim.",desc:"Imposta di bollo I trimestre.",level:"nrm"}]},{month:"Giugno",items:[{date:"30/06",title:"Saldo + 1° Acconto imp. sost.",desc:"Saldo anno prec. e prima rata acconto.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVS – II rata",desc:"Seconda rata IVS.",level:"imp"}]},{month:"Settembre",items:[{date:"30/09",title:"Bolli fatture – II trim.",desc:"Imposta di bollo II trimestre.",level:"nrm"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi PF",desc:"Presentazione dichiarazione.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVS – III rata",desc:"Terza rata IVS.",level:"imp"},{date:"30/11",title:"2° Acconto + Bolli III trim.",desc:"Acconto imp. sost. + bolli.",level:"urg"}]}],ordinario:[{month:"Marzo",items:[{date:"16/03",title:"IVA annuale + CU",desc:"Versamento IVA + invio CU.",level:"urg"}]},{month:"Maggio",items:[{date:"16/05",title:"IVA I trim.",desc:"Versamento IVA Q1.",level:"imp"},{date:"31/05",title:"Bolli I trim.",desc:"Imposta di bollo I trim.",level:"nrm"}]},{month:"Giugno",items:[{date:"30/06",title:"IRPEF saldo + acconto + INPS",desc:"Tutti i versamenti di giugno.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVA II trim.",desc:"Versamento IVA Q2.",level:"imp"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi PF",desc:"Dichiarazione dei redditi.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVA III trim.",desc:"Versamento IVA Q3.",level:"imp"},{date:"30/11",title:"2° Acconto IRPEF",desc:"Versamento F24.",level:"urg"}]},{month:"Dicembre",items:[{date:"27/12",title:"Acconto IVA",desc:"Acconto IVA dicembre.",level:"imp"}]}],srl:[{month:"Marzo",items:[{date:"16/03",title:"IVA IV trim.",desc:"Versamento IVA Q4.",level:"imp"}]},{month:"Aprile",items:[{date:"30/04",title:"Approvazione bilancio CDA",desc:"Riunione CDA progetto bilancio.",level:"urg"}]},{month:"Maggio",items:[{date:"16/05",title:"IVA I trim.",desc:"Versamento IVA Q1.",level:"imp"},{date:"29/05",title:"Assemblea soci",desc:"Approvazione bilancio.",level:"urg"}]},{month:"Giugno",items:[{date:"30/06",title:"IRES+IRAP saldo+acconto + CCIAA",desc:"Tutti i versamenti + deposito bilancio.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVA II trim.",desc:"Versamento IVA Q2.",level:"imp"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi SC",desc:"Dichiarazione societaria.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVA III trim.",desc:"Versamento IVA Q3.",level:"imp"},{date:"30/11",title:"Acconto IRES+IRAP",desc:"Seconda rata acconti.",level:"urg"}]},{month:"Dicembre",items:[{date:"27/12",title:"Acconto IVA",desc:"Acconto IVA dicembre.",level:"imp"}]}],snc:[{month:"Marzo",items:[{date:"16/03",title:"IVA annuale",desc:"Versamento IVA anno prec.",level:"urg"}]},{month:"Maggio",items:[{date:"16/05",title:"IVA I trim.",desc:"Versamento IVA Q1.",level:"imp"}]},{month:"Giugno",items:[{date:"16/06",title:"INPS artigiani – I rata",desc:"Prima rata contributi fissi.",level:"imp"},{date:"30/06",title:"IRPEF soci saldo+acconto",desc:"Versamenti in capo ai soci.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVA II trim.",desc:"Versamento IVA Q2.",level:"imp"}]},{month:"Settembre",items:[{date:"16/09",title:"INPS – II rata",desc:"Seconda rata.",level:"imp"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello SP + soci",desc:"Dichiarazione società+soci.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVA III trim. + INPS III",desc:"IVA Q3 + terza rata INPS.",level:"imp"},{date:"30/11",title:"2° Acconto IRPEF soci",desc:"Versamento acconti.",level:"urg"}]},{month:"Dicembre",items:[{date:"16/12",title:"INPS – IV rata",desc:"Quarta rata INPS.",level:"imp"},{date:"27/12",title:"Acconto IVA",desc:"Acconto IVA dicembre.",level:"imp"}]}]};
const LVL_COLOR={urg:"#e05252",imp:"#c8a45e",nrm:"#4e8ef7"};
const LVL_LABEL={urg:"Urgente",imp:"Importante",nrm:"Ordinario"};
const REGIME_LABELS={occasionale:"Prestazione Occasionale",forfettario:"Regime Forfettario",ordinario:"Professionista Ordinario",srl:"S.r.l.",snc:"SNC / SAS"};
function calcIRPEF(inc){if(inc<=0)return 0;if(inc<=28000)return inc*.23;if(inc<=50000)return 28000*.23+(inc-28000)*.35;return 28000*.23+22000*.35+(inc-50000)*.43;}
function margIRPEF(base,add){return Math.round(calcIRPEF(base+add)-calcIRPEF(base));}
function calcAll({fatturato:fat_,altri:altri_,altriTipo,ateco,primiAnni}){
  const fat=parseFloat(fat_)||0,altri=parseFloat(altri_)||0;
  const covered=altriTipo==="dipendente"||altriTipo==="pensione";
  const over30k=altriTipo==="dipendente"&&altri>30000,over85k=fat>85000;
  const coeff=ateco?.coeff||.78;
  const oi2=margIRPEF(altri,fat),oi3=Math.round(Math.max(0,fat-5000)*.24/3);
  const fi=fat*coeff,fi2=Math.round(fi*(covered?.24:.2623)),fi3=Math.round((fi-fi2)*(primiAnni?.05:.15));
  const fb=over30k||over85k,fw=over30k?"Escluso: RAL > €30.000":over85k?"Escluso: Fatturato > €85.000":null;
  const ol=fat*.85,oi=Math.round(ol*(covered?.24:.2598)),oir=margIRPEF(altri,Math.max(0,ol-oi));
  const sb2=Math.max(0,fat-630);
  const sl=fat*.88,si=Math.max(3900,Math.round(sl*.24)),snc_i=margIRPEF(altri,Math.max(0,sl-si));
  return{
    occasionale:{name:"Prestazione Occasionale",blocked:fat>5000,warn:fat>5000?"Escluso: Ricavi > €5.000":null,rows:[["IRPEF marginale",fmt0(oi2)],["INPS (1/3)",fmt0(oi3)]],tot:oi2+oi3,netto:fat-oi2-oi3,note:"Ritenuta 20%. INPS solo oltre €5.000."},
    forfettario:{name:"Regime Forfettario",blocked:fb,warn:fw,rows:[["Imp. sostitutiva",fmt0(fi3)],["INPS gest. sep.",fmt0(fi2)]],tot:fi2+fi3,netto:fat-fi2-fi3,note:`Coeff. ${Math.round(coeff*100)}%. Aliquota ${primiAnni?5:15}%.`},
    ordinario:{name:"Professionista Ordinario",blocked:false,warn:null,rows:[["IRPEF marginale",fmt0(oir)],["INPS",fmt0(oi)],["Gestione",fmt0(1200)]],tot:oir+oi+1200,netto:fat-oir-oi-1200,note:"IRPEF a scaglioni. IVA 22%."},
    srl:{name:"S.r.l.",blocked:false,warn:null,rows:[["IRES 24%",fmt0(Math.round(sb2*.24))],["IRAP 3,9%",fmt0(Math.round(sb2*.039))],["Costi fissi",fmt0(630)]],tot:Math.round(sb2*.24)+Math.round(sb2*.039)+630,netto:fat-Math.round(sb2*.24)-Math.round(sb2*.039)-630,note:"Schema ottimizzato: nessun INPS."},
    snc:{name:"SNC / SAS",blocked:false,warn:null,rows:[["IRPEF soci",fmt0(snc_i)],["INPS commercianti",fmt0(si)],["Gestione",fmt0(900)]],tot:snc_i+si+900,netto:fat-snc_i-si-900,note:"Trasparenza fiscale. Min. INPS ~€3.900."},
  };
}
function CalendarModal({regimeId,onClose}){
  const cal=CALENDARS[regimeId]||[];
  const allItems=cal.flatMap(m=>m.items.map(i=>({...i,month:m.month})));
  const [sel,setSel]=useState({});const [email,setEmail]=useState("");const [sent,setSent]=useState(false);const [loading,setLoading]=useState(false);const [err,setErr]=useState(null);
  const allSel=allItems.length>0&&allItems.every((_,i)=>sel[i]);
  const toggleAll=()=>{if(allSel)setSel({});else{const s={};allItems.forEach((_,i)=>s[i]=true);setSel(s);}};
  const toggle=i=>setSel(p=>({...p,[i]:!p[i]}));
  const countSel=Object.values(sel).filter(Boolean).length;
  const send=async()=>{if(!email||!countSel)return;setLoading(true);setErr(null);try{await callBackend('/api/send-email', {email,regimeName:REGIME_LABELS[regimeId],scadenze:allItems.filter((_,i)=>sel[i]),isTest:false});setSent(true);}catch(e){setErr(e.message);}finally{setLoading(false);}};
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr" style={{position:"relative"}}><div className="modal-drag"/><div className="modal-title">{REGIME_LABELS[regimeId]}</div><div className="modal-sub">Calendario scadenze 2025</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="leg">{[["urg","Urgente"],["imp","Importante"],["nrm","Ordinario"]].map(([k,l])=><div key={k} className="leg-item"><div className="leg-dot" style={{background:LVL_COLOR[k]}}/>{l}</div>)}</div>
          <div className="sel-bar"><span className="sel-count">{countSel} selezionate</span><button className="sel-all-btn" onClick={toggleAll}>{allSel?"Deseleziona":"Seleziona tutto"}</button></div>
          {cal.map(({month,items})=>(
            <div key={month} className="m-block">
              <div className="m-hdr">{month}</div>
              {items.map(item=>{const gi=allItems.findIndex(a=>a.date===item.date&&a.title===item.title&&a.month===month);return(
                <div key={gi} className={"dl"+(sel[gi]?" sel":"")} style={{borderLeft:"3px solid "+LVL_COLOR[item.level]}} onClick={()=>toggle(gi)}>
                  <div className="dl-check"><span className="dl-check-ico">✓</span></div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:".25rem",flexWrap:"wrap"}}>
                      <span className="dl-date">{item.date}</span><span className="dl-title">{item.title}</span>
                      <span className="dl-level" style={{color:LVL_COLOR[item.level],background:LVL_COLOR[item.level]+"18"}}>{LVL_LABEL[item.level]}</span>
                    </div>
                    <div className="dl-desc">{item.desc}</div>
                  </div>
                </div>
              );})}
            </div>
          ))}
        </div>
        <div className="modal-foot" style={{flexDirection:"column",gap:".5rem"}}>
          {!sent?(<div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:9,padding:".75rem"}}>
            <div style={{fontSize:".75rem",fontWeight:600,marginBottom:".4rem"}}>📧 Ricevi via email</div>
            <div style={{display:"flex",gap:".4rem"}}>
              <input style={{flex:1,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,color:"var(--tx)",padding:".45rem .65rem",fontSize:".8rem"}} value={email} onChange={e=>{setEmail(e.target.value);setErr(null);}} placeholder="email@example.it" type="email"/>
              <button className="btn" style={{padding:".45rem .85rem",fontSize:".78rem"}} disabled={!email||!countSel||loading} onClick={send}>{loading?"⏳":"Invia ("+countSel+")"}</button>
            </div>
            {err&&<div style={{fontSize:".7rem",color:"#ff8585",marginTop:".35rem"}}>⚠️ {err}</div>}
          </div>):(<div style={{background:"rgba(52,194,122,.1)",border:"1px solid rgba(52,194,122,.3)",borderRadius:9,padding:".75rem",textAlign:"center"}}><div style={{fontWeight:700,color:"var(--gr)"}}>✅ Inviato a {email}</div></div>)}
          <div style={{fontSize:".63rem",color:"var(--mu)"}}>⚠️ Scadenze indicative 2025, verificare proroghe.</div>
        </div>
      </div>
    </div>
  );
}
