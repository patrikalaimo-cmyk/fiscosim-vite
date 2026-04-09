import { useState, useEffect, useRef, useMemo } from 'react'
import { useAIStatus } from '../../../context/AIStatusContext'
import { TagInput, ModuleHeader } from '../../../shared/components'
import { ACCOUNTING_UI_TEXT, COMMON_UI_TEXT, deleteAllLabel, deleteSelectedLabel } from '../../../shared/constants'
import { parseXMLFattura } from '../../../../domain/fatture.js'
import { trace } from '../../../core/debug/trace'
import { traceStep, traceDiff, traceIva, insertCausaleIvaMeta } from '../../../utils/pipelineLogger.js'
import { extractTextFromPDFBrowser } from '../../../shared/utils'
import { triggerAutoPipeline } from '../../../utils/autoPipeline.js'
import * as contabilitaRepo from '../data/contabilitaRepo.js'

export default function AnagraficheContabiliView({
  contTab,
  societaAttiva,
  pianoConti,
  causaliContabili,
  causaliIva,
  caricaTutto,
}) {
  const [modalImportPDF, setModalImportPDF] = useState(null)

  if (!societaAttiva) return null

  return (
    <>
      {contTab === 'societa' && (
        <SocietaConfigView societa={societaAttiva} onRefresh={caricaTutto} />
      )}

      {contTab === 'piano_conti' && (
        <PianoContiView
          pianoConti={pianoConti}
          societaId={societaAttiva.id}
          onImport={() => setModalImportPDF('piano_conti')}
          onRefresh={caricaTutto}
        />
      )}

      {contTab === 'causali' && (
        <CausaliView
          causali={causaliContabili}
          tipo="contabili"
          societaId={societaAttiva.id}
          onImport={() => setModalImportPDF('causali')}
          onRefresh={caricaTutto}
        />
      )}

      {contTab === 'causali_iva' && (
        <CausaliView
          causali={causaliIva}
          tipo="iva"
          societaId={societaAttiva.id}
          onImport={() => setModalImportPDF('causali_iva')}
          onRefresh={caricaTutto}
        />
      )}

      {modalImportPDF && (
        <ModalImportPDF
          tipo={modalImportPDF}
          societaId={societaAttiva?.id}
          onComplete={() => {
            setModalImportPDF(null)
            caricaTutto()
          }}
          onClose={() => setModalImportPDF(null)}
        />
      )}
    </>
  )
}

function SocietaConfigView({ societa, onRefresh }) {
  const createInitialForm = useMemo(
    () => current => ({
      ragione_sociale: current?.denominazione || '',
      partita_iva: current?.partita_iva || '',
      codice_fiscale: current?.codice_fiscale || '',
      forma_giuridica: current?.forma_giuridica || '',
      data_costituzione: current?.data_costituzione || '',
      stato_attivita: current?.attiva === false ? 'inattiva' : 'attiva',
      regime_fiscale: current?.regime_fiscale || current?.regime_contabile || 'ordinario',
      regime_iva: current?.regime_iva || '',
      liquidazione_iva: current?.tipo_liquidazione_iva || 'trimestrale',
      ateco: current?.ateco || '',
      opzioni_fiscali: current?.opzioni_fiscali || '',
      esercizio_inizio: current?.esercizio_inizio || '',
      esercizio_fine: current?.esercizio_fine || '',
      valuta: current?.valuta || 'EUR',
      schema_bilancio: current?.schema_bilancio || 'civilistico',
      default_scritture: current?.default_scritture || '',
      indirizzo: current?.indirizzo || '',
      cap: current?.cap || '',
      citta: current?.citta || '',
      provincia: current?.provincia || '',
      pec: current?.pec || '',
      email: current?.email || '',
      telefono: current?.telefono || '',
      ai_attiva_default: typeof current?.ai_attiva_default === 'boolean' ? current.ai_attiva_default : true,
      comportamento_import: current?.comportamento_import || 'revisione_guidata',
      automatismi_base: current?.automatismi_base || 'controllo_documentale',
    }),
    []
  )

  const [form, setForm] = useState(() => createInitialForm(societa))
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    setForm(createInitialForm(societa))
    setFeedback(null)
  }, [societa, createInitialForm])

  const updateField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const resetForm = () => {
    setForm(createInitialForm(societa))
    setFeedback(null)
  }

  const availableColumns = useMemo(() => new Set(Object.keys(societa || {})), [societa])

  const dirty = useMemo(() => {
    const baseline = createInitialForm(societa)
    return Object.keys(baseline).some(key => baseline[key] !== form[key])
  }, [createInitialForm, form, societa])

  const saveSocieta = async () => {
    if (!societa?.id || !form.ragione_sociale.trim()) return

    const updates = {
      denominazione: form.ragione_sociale.trim(),
      partita_iva: form.partita_iva.trim(),
      codice_fiscale: form.codice_fiscale.trim().toUpperCase(),
      indirizzo: form.indirizzo.trim(),
      cap: form.cap.trim(),
      citta: form.citta.trim(),
      provincia: form.provincia.trim().toUpperCase(),
      email: form.email.trim(),
      telefono: form.telefono.trim(),
      regime_contabile: form.regime_fiscale || 'ordinario',
      tipo_liquidazione_iva: form.liquidazione_iva || 'trimestrale',
      attiva: form.stato_attivita !== 'inattiva',
    }

    const optionalMappings = {
      forma_giuridica: form.forma_giuridica.trim(),
      data_costituzione: form.data_costituzione || null,
      regime_fiscale: form.regime_fiscale || null,
      regime_iva: form.regime_iva || null,
      ateco: form.ateco.trim(),
      opzioni_fiscali: form.opzioni_fiscali.trim(),
      esercizio_inizio: form.esercizio_inizio || null,
      esercizio_fine: form.esercizio_fine || null,
      valuta: form.valuta || null,
      schema_bilancio: form.schema_bilancio || null,
      default_scritture: form.default_scritture.trim(),
      pec: form.pec.trim(),
      ai_attiva_default: form.ai_attiva_default,
      comportamento_import: form.comportamento_import || null,
      automatismi_base: form.automatismi_base || null,
    }

    Object.entries(optionalMappings).forEach(([key, value]) => {
      if (availableColumns.has(key)) updates[key] = value
    })

    setSaving(true)
    setFeedback(null)
    const { error } = await contabilitaRepo.updateSocieta(societa.id, updates)
    setSaving(false)

    if (error) {
      setFeedback({ type: 'error', message: error.message || 'Impossibile salvare le modifiche.' })
      return
    }

    setFeedback({ type: 'ok', message: 'Anagrafica società aggiornata correttamente.' })
    onRefresh?.()
  }

  const primaryAction = useMemo(
    () => (
      <button className="btn" onClick={saveSocieta} disabled={saving || !dirty || !form.ragione_sociale.trim()}>
        {saving ? 'Salvo...' : 'Salva modifiche'}
      </button>
    ),
    [dirty, form.ragione_sociale, saveSocieta, saving]
  )

  const secondaryAction = useMemo(
    () => (
      <button className="btn-sec" onClick={resetForm} disabled={saving || !dirty}>
        Reset
      </button>
    ),
    [dirty, saving]
  )

  const sectionCard = (title, subtitle, content) => (
    <section className="card">
      <div className="card-hdr">
        <div className="card-title-wrap">
          <div className="card-title">{title}</div>
          {subtitle ? <div className="card-subtitle">{subtitle}</div> : null}
        </div>
      </div>
      <div className="card-body">{content}</div>
    </section>
  )

  return (
    <>
      <ModuleHeader
        sectionLabel="Contabilità"
        title="Anagrafica società"
        context={societa?.denominazione || ''}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
      />

      <div style={{ display: 'grid', gap: '1rem' }}>
        {feedback ? <div className={`alert ${feedback.type === 'error' ? 'alert-err' : 'alert-ok'}`}>{feedback.message}</div> : null}

        {sectionCard(
          'Dati anagrafici',
          'Identità giuridica e stato della società.',
          <div className="form-grid">
            <div className="fg full"><label>Ragione sociale</label><input value={form.ragione_sociale} onChange={e => updateField('ragione_sociale', e.target.value)} /></div>
            <div className="fg"><label>Partita IVA</label><input value={form.partita_iva} onChange={e => updateField('partita_iva', e.target.value)} maxLength={11} /></div>
            <div className="fg"><label>Codice fiscale</label><input value={form.codice_fiscale} onChange={e => updateField('codice_fiscale', e.target.value.toUpperCase())} maxLength={16} /></div>
            <div className="fg"><label>Forma giuridica</label><input value={form.forma_giuridica} onChange={e => updateField('forma_giuridica', e.target.value)} placeholder="Es. SRL" /></div>
            <div className="fg"><label>Data costituzione</label><input type="date" value={form.data_costituzione} onChange={e => updateField('data_costituzione', e.target.value)} /></div>
            <div className="fg"><label>Stato attività</label><select value={form.stato_attivita} onChange={e => updateField('stato_attivita', e.target.value)}><option value="attiva">Attiva</option><option value="inattiva">Inattiva</option></select></div>
          </div>
        )}

        {sectionCard(
          'Dati fiscali',
          'Regimi e opzioni che guidano il trattamento fiscale della società.',
          <div className="form-grid">
            <div className="fg"><label>Regime fiscale</label><select value={form.regime_fiscale} onChange={e => updateField('regime_fiscale', e.target.value)}><option value="ordinario">Ordinario</option><option value="semplificato">Semplificato</option><option value="forfettario">Forfettario</option></select></div>
            <div className="fg"><label>Regime IVA</label><select value={form.regime_iva} onChange={e => updateField('regime_iva', e.target.value)}><option value="">Non specificato</option><option value="ordinario">Ordinario</option><option value="split_payment">Split payment</option><option value="reverse_charge">Reverse charge</option><option value="esente">Esente</option></select></div>
            <div className="fg"><label>Liquidazione IVA</label><select value={form.liquidazione_iva} onChange={e => updateField('liquidazione_iva', e.target.value)}><option value="mensile">Mensile</option><option value="trimestrale">Trimestrale</option></select></div>
            <div className="fg"><label>Codice attività (ATECO)</label><input value={form.ateco} onChange={e => updateField('ateco', e.target.value)} placeholder="Es. 62.01.00" /></div>
            <div className="fg full"><label>Opzioni fiscali</label><textarea value={form.opzioni_fiscali} onChange={e => updateField('opzioni_fiscali', e.target.value)} rows={3} placeholder="Annotazioni, opzioni o regimi particolari." /></div>
          </div>
        )}

        {sectionCard(
          'Impostazioni contabili',
          'Parametri base per l’esercizio e la gestione delle scritture.',
          <div className="form-grid">
            <div className="fg"><label>Esercizio contabile dal</label><input type="date" value={form.esercizio_inizio} onChange={e => updateField('esercizio_inizio', e.target.value)} /></div>
            <div className="fg"><label>Esercizio contabile al</label><input type="date" value={form.esercizio_fine} onChange={e => updateField('esercizio_fine', e.target.value)} /></div>
            <div className="fg"><label>Valuta</label><select value={form.valuta} onChange={e => updateField('valuta', e.target.value)}><option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div>
            <div className="fg"><label>Schema bilancio</label><select value={form.schema_bilancio} onChange={e => updateField('schema_bilancio', e.target.value)}><option value="civilistico">Civilistico</option><option value="abbreviato">Abbreviato</option><option value="micro">Microimpresa</option></select></div>
            <div className="fg full"><label>Default scritture</label><textarea value={form.default_scritture} onChange={e => updateField('default_scritture', e.target.value)} rows={3} placeholder="Regole operative di default per registrazioni e contropartite." /></div>
          </div>
        )}

        {sectionCard(
          'Contatti e riferimenti',
          'Recapiti e indirizzi usati nei flussi documentali e amministrativi.',
          <div className="form-grid">
            <div className="fg full"><label>Indirizzo</label><input value={form.indirizzo} onChange={e => updateField('indirizzo', e.target.value)} /></div>
            <div className="fg"><label>CAP</label><input value={form.cap} onChange={e => updateField('cap', e.target.value)} maxLength={5} /></div>
            <div className="fg"><label>Città</label><input value={form.citta} onChange={e => updateField('citta', e.target.value)} /></div>
            <div className="fg"><label>Provincia</label><input value={form.provincia} onChange={e => updateField('provincia', e.target.value.toUpperCase())} maxLength={2} placeholder="RM" /></div>
            <div className="fg"><label>PEC</label><input type="email" value={form.pec} onChange={e => updateField('pec', e.target.value)} placeholder="pec@azienda.it" /></div>
            <div className="fg"><label>Email</label><input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} placeholder="amministrazione@azienda.it" /></div>
            <div className="fg"><label>Telefono</label><input value={form.telefono} onChange={e => updateField('telefono', e.target.value)} placeholder="+39 06 1234567" /></div>
          </div>
        )}

        {sectionCard(
          'Parametri operativi',
          'Comportamenti predefiniti per AI, import documenti e automatismi di base.',
          <div className="form-grid">
            <div className="fg"><label>AI attiva di default</label><select value={form.ai_attiva_default ? 'attiva' : 'disattiva'} onChange={e => updateField('ai_attiva_default', e.target.value === 'attiva')}><option value="attiva">Attiva</option><option value="disattiva">Non attiva</option></select></div>
            <div className="fg"><label>Comportamento import documenti</label><select value={form.comportamento_import} onChange={e => updateField('comportamento_import', e.target.value)}><option value="revisione_guidata">Revisione guidata</option><option value="proposta_automatica">Proposta automatica</option><option value="manuale">Solo manuale</option></select></div>
            <div className="fg"><label>Automatismi base</label><select value={form.automatismi_base} onChange={e => updateField('automatismi_base', e.target.value)}><option value="controllo_documentale">Controllo documentale</option><option value="match_anagrafica">Match anagrafica</option><option value="match_conto_ai">Match conto AI</option></select></div>
          </div>
        )}
      </div>
    </>
  )
}

function ImportFattureView({societaId,onComplete}){
  const [uploading,setUploading]=useState(false);
  const [progress,setProgress]=useState(null);
  const [aiEnabled,setAiEnabled]=useState(true);
  const fileRef=useRef();
  const ai=useAIStatus();

  // Load AI setting
  useEffect(()=>{
    contabilitaRepo.getImpostazioneStudio('ai_enabled')
      .then(({data})=>setAiEnabled(data?.valore!=='false'));
  },[]);

  // Deterministic XML fattura parser (no AI needed)
  const parseXMLFile=async(file)=>{
    const text=await file.text();
    const parsed=parseXMLFattura(text);
    const isPassiva=parsed.tipo==='TD01'||parsed.tipo==='TD02'||parsed.tipo==='TD04';
    const aliquota=parsed.lines?.[0]?.iva||22;
    const iva=parsed.imponibile*(aliquota/100);
    return {
      tipo_fattura:isPassiva?'fattura_passiva':'fattura_attiva',
      numero_documento:parsed.numero,
      data_documento:parsed.data,
      cedente:{denominazione:parsed.nome_cedente,partita_iva:parsed.piva_cedente},
      cessionario:{denominazione:parsed.nome_cessionario,partita_iva:parsed.piva_cessionario},
      imponibile:parsed.imponibile,
      iva:Math.round(iva*100)/100,
      totale:parsed.totale_doc||parsed.imponibile+iva,
      aliquota_iva:aliquota,
      is_transitorio:true, // senza AI, sempre transitorio (operatore conferma conto)
      motivo_transitorio:'Classificazione manuale richiesta',
      confidence:0,
      proposta_contabile:{
        causale_codice:isPassiva?'FF':'FC',
        causale_descrizione:isPassiva?'Fattura Fornitore':'Fattura Cliente',
      }
    };
  };

  const handleUpload=async(e)=>{
    const files=Array.from(e.target.files);
    if(!files.length)return;
    if(!societaId){alert('Nessuna società selezionata. Seleziona una società prima di importare.');return;}
    
    setUploading(true);
    setProgress({current:0,total:files.length});
    const method=aiEnabled?'ai':'local';
    if(aiEnabled)ai.setAI('processing','Import fatture','ai');

    for(let i=0;i<files.length;i++){
      const file=files[i];
      setProgress({current:i+1,total:files.length,file:file.name});

      try{
        let analysis={tipo_fattura:'fattura_passiva',is_transitorio:true};
        const isXML=file.name.toLowerCase().endsWith('.xml');

        if(aiEnabled){
          // â”â”â” AI MODE: send to Claude for full analysis â”â”â”
          const base64=await new Promise((res,rej)=>{
            const reader=new FileReader();
            reader.onload=()=>res(reader.result.split(',')[1]);
            reader.onerror=rej;
            reader.readAsDataURL(file);
          });
          const analyzeRes=await fetch('/api/accounting/ai',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({action:'proposta_contabile',fileBase64:base64,filename:file.name,mimeType:file.type})
          });
          if(analyzeRes.ok){
            const data=await analyzeRes.json();
            analysis=data.analysis||analysis;
          }
        }else if(isXML){
          // â”â”â” LOCAL MODE (XML): deterministic parsing â”â”â”
          analysis=await parseXMLFile(file);
        }else{
          // â”â”â” LOCAL MODE (PDF): save as manual_pending â”â”â”
          analysis={tipo_fattura:'fattura_passiva',is_transitorio:true,
            motivo_transitorio:'PDF senza AI - classificazione manuale',confidence:0};
        }

        // Upload file a storage
        const filePath=`contabilita/${societaId}/${Date.now()}_${file.name}`;
        await contabilitaRepo.uploadDocumento(filePath,file);
        const{data:urlData}=contabilitaRepo.getDocumentoPublicUrl(filePath);

        // Salva documento (con validazione societaId)
        if(!societaId){console.error('ERRORE: societaId è null/undefined!');throw new Error('Società non selezionata');}
        const docUploadPayload={
          societa_id:societaId,
          filename:file.name,
          file_path:filePath,
          file_url:urlData?.publicUrl,
          mime_type:file.type,
          file_size:file.size,
          tipo_documento:analysis.tipo_fattura,
          numero_documento:analysis.numero_documento,
          data_documento:analysis.data_documento,
          soggetto_denominazione:analysis.cedente?.denominazione||analysis.cessionario?.denominazione,
          soggetto_piva:analysis.cedente?.partita_iva||analysis.cessionario?.partita_iva,
          soggetto_cf:analysis.cedente?.codice_fiscale||analysis.cessionario?.codice_fiscale,
          imponibile:analysis.imponibile,
          iva:analysis.iva,
          totale:analysis.totale,
          workflow_status:aiEnabled?'proposed':'manual',
          validation_status:analysis.is_transitorio?'error':'pending',
          ai_confidence:analysis.confidence||0
        }
        traceIva('PRE_INSERT_DOCUMENTI_CONT_UPLOAD', 'DB', docUploadPayload.causale_iva_id ?? analysis.causale_iva_id ?? null)
        traceStep('INSERT_PAYLOAD', docUploadPayload, { table: 'documenti_contabilita', ...insertCausaleIvaMeta(docUploadPayload) })
        traceDiff('DB_MAPPING_DIFF', { causale_iva_id: analysis.causale_iva_id ?? null }, { causale_iva_id: docUploadPayload.causale_iva_id ?? null })
        const uploadIns=await contabilitaRepo.insertDocumentoContabilita(docUploadPayload);
        traceStep('INSERT_RESULT', { table: 'documenti_contabilita', data: uploadIns.data, error: uploadIns.error })
        const insertErr=uploadIns.error
        if(insertErr){console.error('Insert error:',insertErr);throw insertErr;}
        const newDocId = uploadIns.data?.[0]?.id
        if (newDocId) triggerAutoPipeline(newDocId, { source: 'contabilita_import_fatture' })

      }catch(err){
        console.error('Import error:',err);
      }
    }

    ai.setAI('done','Import fatture',method);
    setUploading(false);
    setProgress(null);
    fileRef.current.value='';
    onComplete();
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.5rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>Import fatture</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>
            {aiEnabled?'AI analizza e propone registrazione':'XML: parsing locale · PDF: classificazione manuale'}
          </div>
        </div>
        <span className={'bdg '+(aiEnabled?'bdg-green':'bdg-orange')} style={{fontSize:'.65rem'}}>
          {aiEnabled?'AI':'Locale'}
        </span>
      </div>

      <div className="card">
        <div className="upload-zone" onClick={()=>!uploading&&fileRef.current.click()} style={{cursor:uploading?'wait':'pointer'}}>
          {uploading?(
            <>
              <div className="upload-zone-ico">...</div>
              <div className="upload-zone-t">Elaborazione {progress?.file}...</div>
              <div className="upload-zone-s">{progress?.current}/{progress?.total} file</div>
            </>
          ):(
            <>
              <div className="upload-zone-ico">File</div>
              <div className="upload-zone-t">Carica fatture</div>
              <div className="upload-zone-s">PDF, XML · Trascina o clicca per selezionare</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.xml,.PDF,.XML" style={{display:'none'}} onChange={handleUpload}/>
      </div>

      <div className="alert alert-info" style={{marginTop:'1rem'}}>
        {aiEnabled?(
          <>L'AI analizzerà ogni fattura e proporrà la registrazione contabile.<br/>Proposta da confermare · Confermata · Richiede intervento</>
        ):(
          <><strong>Modalità locale:</strong> Le fatture XML vengono analizzate senza AI (dati estratti dal file). I PDF vengono salvati per classificazione manuale. Vai nelle impostazioni per attivare l'AI.</>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ PIANO CONTI VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ MODAL NUOVO CONTO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalNuovoConto({societaId, pianoConti, onSave, onClose}){
  const MASTRI = [
    {codice:'1',label:'1 — Attività'},
    {codice:'2',label:'2 — Passività'},
    {codice:'3',label:'3 — Ricavi'},
    {codice:'4',label:'4 — Costi'},
    {codice:'5',label:'5 — Costi diversi'},
    {codice:'6',label:'6 — Conti d\'ordine'},
  ];

  // Livelli del piano conti per scegliere dove inserire
  const nodiFiglio = (parentCodice) =>
    pianoConti.filter(c=>c.codice.startsWith(parentCodice+' ')&&c.codice.split(' ').length===parentCodice.split(' ').length+1);

  const [mastro,setMastro]   = useState('1');
  const [parentCode,setParentCode] = useState('');
  const [descrizione,setDesc] = useState('');
  const [saving,setSaving]   = useState(false);

  // Calcola prossimo codice disponibile
  const calcolaCodice = async (parent) => {
    const livello = parent.split(' ').length + 1;
    const {data} = await contabilitaRepo.getPianoContiCodiciByLike(societaId, parent)
      .eq('livello', livello)
      .order('codice',{ascending:false}).limit(1);
    if(!data?.length){
      if(livello===2) return `${parent} 00`;
      if(livello===3) return `${parent} 00`;
      return `${parent} 0001`;
    }
    const lastParts = data[0].codice.trim().split(' ');
    const lastNum = parseInt(lastParts[lastParts.length-1])||0;
    const pad = livello===4?4:2;
    return `${parent} ${String(lastNum+1).padStart(pad,'0')}`;
  };

  const handleSave = async () => {
    if(!descrizione.trim()) return alert('Inserisci la descrizione');
    const parent = parentCode || mastro;
    setSaving(true);
    const codice = await calcolaCodice(parent);
    const parts = codice.trim().split(' ');
    const livello = parts.length;
    const fd = parseInt(mastro);
    let tipo='patrimoniale', natura='attivo', sezione='dare';
    if(fd===3){tipo='economico';natura='ricavo';sezione='avere';}
    else if(fd<=5){tipo='economico';natura='costo';sezione='dare';}
    else if(fd===6){tipo='ordine';natura='ordine';}
    else if(fd===2){natura='passivo';sezione='avere';}
    await onSave({
      codice: codice.trim(),
      codice_mastro: parts[0]||null,
      codice_conto: livello>=3?`${parts[0]} ${parts[1]} ${parts[2]}`:null,
      codice_sottoconto: livello>=4?codice.trim():null,
      descrizione: descrizione.trim(),
      tipo, natura, sezione, livello,
    });
    setSaving(false);
  };

  // Lista conti del mastro scelto per scegliere il parent
  const contiFiglio = pianoConti.filter(c=>c.codice.startsWith(mastro+' ')&&c.livello<=3).sort((a,b)=>a.codice.localeCompare(b.codice));

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:520}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">Nuovo conto</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg full"><label>Descrizione *</label>
              <input value={descrizione} onChange={e=>setDesc(e.target.value)} autoFocus placeholder="Es. Spese telefoniche"/>
            </div>
            <div className="fg"><label>Mastro (sezione)</label>
              <select value={mastro} onChange={e=>{setMastro(e.target.value);setParentCode('');}}>
                {MASTRI.map(m=><option key={m.codice} value={m.codice}>{m.label}</option>)}
              </select>
            </div>
            <div className="fg"><label>Inserisci sotto (opzionale)</label>
              <select value={parentCode} onChange={e=>setParentCode(e.target.value)}>
                <option value="">— Direttamente sotto il mastro {mastro} —</option>
                {contiFiglio.map(c=><option key={c.id} value={c.codice}>{c.codice} — {c.descrizione}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginTop:'.75rem',padding:'.6rem .8rem',background:'var(--s2)',borderRadius:7,fontSize:'.75rem',color:'var(--mu)'}}>
            Il codice verrà calcolato automaticamente come progressivo nell'area selezionata
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving||!descrizione} onClick={handleSave}>{saving?'Salvo...':'Crea conto'}</button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ MODAL NUOVA CAUSALE (contabile o IVA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalNuovaCausale({tipo, societaId, onSave, onClose}){
  const isIva = tipo==='iva';
  const [form,setForm] = useState(isIva
    ? {codice:'',descrizione:'',aliquota:22,regime_iva:'Imponibile',tipo_trattamento:'Normale',detraibile:true,percentuale_indetraibilita:0,include_liquidazione:true,attivo:true}
    : {codice:'',descrizione:'',tipo:'generico',attivo:true}
  );
  const [saving,setSaving] = useState(false);
  const up = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if(!form.codice||!form.descrizione) return alert('Codice e descrizione obbligatori');
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">Nuova {isIva?'causale IVA':'causale contabile'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg"><label>Codice *</label>
              <input value={form.codice} onChange={e=>up('codice',e.target.value.toUpperCase())} placeholder={isIva?'es. A22':'es. VEN'} autoFocus/>
            </div>
            <div className="fg full"><label>Descrizione *</label>
              <input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} placeholder="Descrizione causale"/>
            </div>
            {isIva&&<>
              <div className="fg"><label>Aliquota %</label>
                <input type="number" value={form.aliquota} onChange={e=>up('aliquota',parseFloat(e.target.value)||0)} min={0} max={100} step={1}/>
              </div>
              <div className="fg"><label>Regime IVA</label>
                <select value={form.regime_iva} onChange={e=>up('regime_iva',e.target.value)}>
                  <option value="Imponibile">Imponibile</option>
                  <option value="Non imponibile">Non imponibile</option>
                  <option value="Esente">Esente</option>
                  <option value="Escluso">Escluso</option>
                </select>
              </div>
              <div className="fg"><label>% Indetraibilità</label>
                <input type="number" value={form.percentuale_indetraibilita} onChange={e=>up('percentuale_indetraibilita',parseFloat(e.target.value)||0)} min={0} max={100}/>
              </div>
            </>}
            {!isIva&&<>
              <div className="fg"><label>Tipo</label>
                <select value={form.tipo} onChange={e=>up('tipo',e.target.value)}>
                  <option value="generico">Generico</option>
                  <option value="vendite">Vendite</option>
                  <option value="acquisti">Acquisti</option>
                  <option value="finanziario">Finanziario</option>
                  <option value="rettifica">Rettifica/Storno</option>
                  <option value="personale">Personale</option>
                  <option value="ammortamento">Ammortamento</option>
                </select>
              </div>
            </>}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving||!form.codice||!form.descrizione} onClick={handleSave}>{saving?'Salvo...':'Crea causale'}</button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ MODAL IMPORT ANAGRAFICA NES â†’ PIANO DEI CONTI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Parser Excel NES clienti/fornitori â†’ aggiorna/crea conti in piano_conti
function ModalImportAnagraficaNESPianoConti({societaId, pianoConti, onComplete, onClose}){
  const [file,setFile]         = useState(null);
  const [loading,setLoading]   = useState(false);
  const [progress,setProgress] = useState('');
  const [preview,setPreview]   = useState(null); // {aggiornati, nuovi, records}
  const [importing,setImporting]= useState(false);
  const [done,setDone]         = useState(null);
  const fileRef = useRef();

  const parseExcelAnagrafica = async (file) => {
    if(!window._XLSX){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload=()=>{window._XLSX=window.XLSX;res();};s.onerror=rej;
        document.head.appendChild(s);
      });
    }
    const ab = await file.arrayBuffer();
    const wb = window._XLSX.read(ab,{type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = window._XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
    if(!rows.length) return [];

    const header = rows[0].map(h=>(h||'').toString().toLowerCase().trim());
    // Detecta se è clienti o fornitori dal header
    const isClienti = header.some(h=>h.includes('soggetto iva differita'));

    const idx = {
      codice:      header.findIndex(h=>h==='codice'),
      ragSoc:      header.findIndex(h=>h==='ragione sociale'),
      ragSoc2:     header.findIndex(h=>h.includes('ragione sociale aggiuntiva')),
      indirizzo:   header.findIndex(h=>h==='indirizzo'),
      cap:         header.findIndex(h=>h==='cap'),
      citta:       header.findIndex(h=>h==="città"),
      provincia:   header.findIndex(h=>h==='provincia'),
      nazione:     header.findIndex(h=>h==='nazione'),
      cf:          header.findIndex(h=>h.includes('codice fiscale')),
      piva:        header.findIndex(h=>h.includes('partita iva')||h.includes('partita iva')),
      iso:         header.findIndex(h=>h==='codice iso'),
      pec:         header.findIndex(h=>h.includes('pec')),
      codDest:     header.findIndex(h=>h.includes('codice destinatario')),
      splitPayment:header.findIndex(h=>h.includes('split payment')||h.includes('iva differita')),
      spesometro:  header.findIndex(h=>h.includes('includi in spesometro')),
      esterometro: header.findIndex(h=>h.includes('includi in esterometro')),
      b2b:         header.findIndex(h=>h.includes('elettronica b2b')),
      nome:        header.findIndex(h=>h==='nome'),
      cognome:     header.findIndex(h=>h==='cognome'),
      soggOpera:   header.findIndex(h=>h.includes('soggetto operazione')),
      tipoContr:   header.findIndex(h=>h.includes('tipo controparte')),
      gruppoIva:   header.findIndex(h=>h.includes('gruppo iva')),
    };

    const g = (row,i) => i>=0&&row[i]!=null ? String(row[i]).trim() : '';
    const bool = (row,i) => i>=0 ? ['s','si','1','true','x'].includes(String(row[i]||'').toLowerCase()) : false;

    const records = [];
    for(let i=1;i<rows.length;i++){
      const r = rows[i];
      const codice = g(r,idx.codice);
      if(!codice) continue;
      // Codice NES = numerico, converti in formato "1 02 20 0171"
      // Formato NES: 102200171 â†’ 1 02 20 0171
      const nesCode = codice.replace(/\D/g,'');
      let codicePiano = null;
      if(nesCode.length>=9){
        codicePiano = `${nesCode[0]} ${nesCode.substring(1,3)} ${nesCode.substring(3,5)} ${nesCode.substring(5).padStart(4,'0')}`;
      } else if(nesCode.length>=7){
        codicePiano = `${nesCode[0]} ${nesCode.substring(1,3)} ${nesCode.substring(3,5)} ${nesCode.substring(5).padStart(4,'0')}`;
      }

      records.push({
        codice_nes: codice,
        codice_piano: codicePiano,
        descrizione:      g(r,idx.ragSoc),
        rag_sociale_2:    g(r,idx.ragSoc2),
        indirizzo:        g(r,idx.indirizzo),
        cap:              g(r,idx.cap),
        citta:            g(r,idx.citta),
        provincia:        g(r,idx.provincia),
        nazione:          g(r,idx.nazione)||'Italia',
        codice_iso:       g(r,idx.iso)||'IT',
        codice_fiscale:   g(r,idx.cf).replace(/\s/g,''),
        partita_iva:      g(r,idx.piva).replace(/\s/g,''),
        anagrafica_piva:  g(r,idx.piva).replace(/\s/g,''),
        anagrafica_cf:    g(r,idx.cf).replace(/\s/g,''),
        email_pec:        g(r,idx.pec),
        codice_dest_efat: g(r,idx.codDest),
        split_payment:    bool(r,idx.splitPayment),
        includi_spesometro: bool(r,idx.spesometro),
        includi_esterometro:bool(r,idx.esterometro),
        richiede_efat_b2b:  bool(r,idx.b2b),
        soggetto_operaz:  g(r,idx.soggOpera),
        tipo_controparte: g(r,idx.tipoContr),
        partecipa_gruppo_iva: bool(r,idx.gruppoIva),
      });
    }
    return records;
  };

  const handleFile = async (f) => {
    if(!f) return;
    setFile(f);
    setLoading(true);
    setProgress('Lettura Excel...');
    try{
      const records = await parseExcelAnagrafica(f);
      // Confronta con piano conti esistente per codice NES
      const codicePianoMap = {};
      for(const c of pianoConti) codicePianoMap[c.codice] = c;

      const aggiornati = records.filter(r=>r.codice_piano&&codicePianoMap[r.codice_piano]);
      const nuovi      = records.filter(r=>r.codice_piano&&!codicePianoMap[r.codice_piano]);
      setPreview({aggiornati,nuovi,records});
    }catch(e){ alert('Errore: '+e.message); }
    setLoading(false);
    setProgress('');
  };

  const importa = async () => {
    if(!preview) return;
    setImporting(true);
    let ok=0, err=0;

    // Aggiorna conti esistenti
    for(const rec of preview.aggiornati){
      const {error} = await contabilitaRepo.updatePianoContoByCodiceSocieta({
        rag_sociale_2:    rec.rag_sociale_2||null,
        indirizzo:        rec.indirizzo||null,
        cap:              rec.cap||null,
        citta:            rec.citta||null,
        provincia:        rec.provincia||null,
        nazione:          rec.nazione||null,
        codice_iso:       rec.codice_iso||null,
        codice_fiscale:   rec.codice_fiscale||null,
        partita_iva:      rec.partita_iva||null,
        anagrafica_piva:  rec.anagrafica_piva||null,
        anagrafica_cf:    rec.anagrafica_cf||null,
        email_pec:        rec.email_pec||null,
        codice_dest_efat: rec.codice_dest_efat||null,
        split_payment:    rec.split_payment,
        includi_spesometro: rec.includi_spesometro,
        includi_esterometro: rec.includi_esterometro,
        richiede_efat_b2b: rec.richiede_efat_b2b,
        soggetto_operaz:  rec.soggetto_operaz||null,
        tipo_controparte: rec.tipo_controparte||null,
        partecipa_gruppo_iva: rec.partecipa_gruppo_iva,
      }, rec.codice_piano, societaId);
      error ? err++ : ok++;
    }

    setDone({aggiornati:ok,errori:err,nuovi:preview.nuovi.length});
    setImporting(false);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:640}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">Import Anagrafica NES → Piano dei Conti</div>
          <div className="modal-sub">Aggiorna CF, P.IVA, indirizzo, PEC, split payment dai file Excel NES</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {!file&&(
            <>
              <div className="alert alert-info" style={{marginBottom:'1rem',fontSize:'.8rem'}}>
                Carica il file Excel <strong>Anagrafica Clienti</strong> o <strong>Anagrafica Fornitori</strong> esportato da NES.<br/>
                Il sistema farà <strong>UPDATE</strong> sui conti già presenti nel piano (match per codice NES).
              </div>
              <div className="upload-zone" onClick={()=>fileRef.current.click()} style={{cursor:'pointer'}}>
                <div className="upload-zone-ico">Excel</div>
                <div className="upload-zone-t">Carica Excel NES</div>
                <div className="upload-zone-s">Anagraficaclienti.xlsx o Anagraficafornitori.xlsx</div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e=>handleFile(e.target.files?.[0])}/>
            </>
          )}
          {loading&&<div style={{textAlign:'center',padding:'1.5rem',color:'var(--mu)'}}>{progress}</div>}
          {done&&(
            <div className="alert alert-success">
              Completato — <strong>{done.aggiornati}</strong> conti aggiornati, <strong>{done.errori}</strong> errori
              {done.nuovi>0&&<div style={{marginTop:'.3rem',fontSize:'.8rem'}}>{done.nuovi} codici NES non trovati nel piano dei conti (conti non ancora importati)</div>}
              <div style={{marginTop:'.75rem'}}><button className="btn" onClick={onComplete}>Chiudi</button></div>
            </div>
          )}
          {preview&&!done&&(
            <>
              <div style={{display:'flex',gap:'.75rem',marginBottom:'1rem',flexWrap:'wrap'}}>
                <div style={{flex:1,padding:'.75rem',background:'rgba(52,194,122,.08)',border:'1px solid rgba(52,194,122,.3)',borderRadius:8,textAlign:'center'}}>
                  <div style={{fontWeight:700,fontSize:'1.2rem',color:'#34c27a'}}>{preview.aggiornati.length}</div>
                  <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Conti da aggiornare</div>
                </div>
                <div style={{flex:1,padding:'.75rem',background:'rgba(251,146,60,.08)',border:'1px solid rgba(251,146,60,.3)',borderRadius:8,textAlign:'center'}}>
                  <div style={{fontWeight:700,fontSize:'1.2rem',color:'#fb923c'}}>{preview.nuovi.length}</div>
                  <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Codici non trovati nel piano</div>
                </div>
              </div>
              <div style={{maxHeight:280,overflow:'auto',border:'1px solid var(--bd)',borderRadius:8}}>
                {preview.aggiornati.slice(0,50).map((r,i)=>(
                  <div key={i} style={{display:'flex',gap:'.5rem',padding:'.4rem .75rem',borderBottom:'1px solid rgba(33,40,58,.3)',fontSize:'.78rem'}}>
                    <code style={{color:'var(--gold)',minWidth:90,flexShrink:0}}>{r.codice_piano}</code>
                    <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.descrizione}</span>
                    <span style={{fontSize:'.7rem',color:'var(--mu)',flexShrink:0}}>{r.partita_iva||r.codice_fiscale}</span>
                    {r.split_payment&&<span className="bdg bdg-gold" style={{fontSize:'.55rem'}}>SP</span>}
                  </div>
                ))}
                {preview.aggiornati.length>50&&<div style={{padding:'.5rem',textAlign:'center',fontSize:'.72rem',color:'var(--mu)'}}>...e altri {preview.aggiornati.length-50}</div>}
              </div>
            </>
          )}
        </div>
        {preview&&!done&&(
          <div className="modal-foot">
            <button className="btn-sec" onClick={onClose}>Annulla</button>
            <button className="btn" disabled={importing||!preview.aggiornati.length} onClick={importa}>
              {importing?'Aggiorno...':'Aggiorna '+preview.aggiornati.length+' conti'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PianoContiView({pianoConti,societaId,onImport,onRefresh}){
  const [search,setSearch]=useState('');
  const [sel,setSel]=useState(new Set());
  const [open,setOpen]=useState(new Set()); // nodi espansi
  const [deleting,setDeleting]=useState(false);
  const [editConto,setEditConto]=useState(null);
  const [nuovoConto,setNuovoConto]=useState({open:false});
  const [importAnagrafica,setImportAnagrafica]=useState(false); // {id, codice, descrizione, ...}

  // Costruisce albero da array flat
  const tree=useMemo(()=>{
    const roots=[];
    const getParentCode=(codice)=>{
      if(!codice)return null;
      const parts=codice.trim().split(/\s+/);
      if(parts.length<=1)return null;
      return parts.slice(0,-1).join(' ');
    };
    const map={};
    const valid=pianoConti.filter(c=>c?.codice);
    // Prima passata: popola map con tutti i nodi reali
    for(const c of valid) map[c.codice.trim()]={...c,codice:c.codice.trim(),children:[]};
    // FIX: seconda passata â€” crea nodi placeholder per parent mancanti (nodi intermedi non importati)
    for(const c of valid){
      let par=getParentCode(c.codice.trim());
      while(par&&!map[par]){
        const parParts=par.split(' ');
        const lvl=parParts.length;
        map[par]={codice:par,descrizione:'['+par+']',livello:lvl,children:[],_placeholder:true};
        par=getParentCode(par);
      }
    }
    // Terza passata: collega figli ai parent
    for(const key of Object.keys(map)){
      const node=map[key];
      const par=getParentCode(key);
      if(par&&map[par]) map[par].children.push(node);
      else roots.push(node);
    }
    // Ordina figli per codice
    const sortChildren=(node)=>{node.children.sort((a,b)=>a.codice.localeCompare(b.codice,undefined,{numeric:true}));node.children.forEach(sortChildren);};
    roots.sort((a,b)=>a.codice.localeCompare(b.codice,undefined,{numeric:true}));
    roots.forEach(sortChildren);
    return roots;
  },[pianoConti]);

  const filtered=useMemo(()=>{
    if(!search) return tree;
    const s=search.toLowerCase();
    // Filtra flat e restituisce array senza struttura ad albero
    return pianoConti.filter(c=>(c.codice+' '+c.descrizione).toLowerCase().includes(s));
  },[search,tree,pianoConti]);

  const toggleOpen=(codice)=>setOpen(p=>{const n=new Set(p);n.has(codice)?n.delete(codice):n.add(codice);return n;});
  const toggleSel=(id)=>setSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>setSel(sel.size===pianoConti.length?new Set():new Set(pianoConti.map(c=>c.id)));

  const deleteSelected=async()=>{
    if(!sel.size||!confirm(`Eliminare ${sel.size} conti selezionati?`))return;
    setDeleting(true);
    const ids=[...sel];
    for(let i=0;i<ids.length;i+=100) await contabilitaRepo.bulkDeactivatePianoConti(ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  const deleteAll=async()=>{
    if(!confirm(`Eliminare TUTTI i ${pianoConti.length} conti del piano? Questa azione non è reversibile.`))return;
    setDeleting(true);
    // Elimina in batch da 100
    const ids=pianoConti.map(c=>c.id);
    for(let i=0;i<ids.length;i+=100) await contabilitaRepo.bulkDeactivatePianoConti(ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  const expandAll=()=>{const s=new Set();pianoConti.forEach(c=>c.livello<4&&s.add(c.codice));setOpen(s);};
  // Conta figli diretti per un nodo (per decidere se espandere di default)
  const childCount=(codice)=>pianoConti.filter(c=>{
    const parts=c.codice.split(' ');
    const parentParts=codice.split(' ');
    return parts.length===parentParts.length+1&&c.codice.startsWith(codice+' ');
  }).length;
  const collapseAll=()=>setOpen(new Set());

  // Render ricorsivo nodo albero
  const [nodePage,setNodePage]=useState({}); // paginazione nodi grandi
  const renderNode=(node,depth=0)=>{
    const hasChildren=node.children?.length>0;
    const isOpen=open.has(node.codice);
    // Paginazione per nodi con molti figli (es. 2 03 08 con 955 figli)
    const PAGE_SIZE=200;
    const currentPage=nodePage[node.codice]||1;
    const visibleChildren=hasChildren&&isOpen
      ?node.children.slice(0,currentPage*PAGE_SIZE)
      :[];
    const hasMore=hasChildren&&isOpen&&node.children.length>currentPage*PAGE_SIZE;
    const isSelected=sel.has(node.id);
    const indent=depth*20;
    const lvlColors=['var(--gold)','var(--cy)','var(--tx)','var(--mu)'];
    const lvlSize=['1rem','0.88rem','0.82rem','0.78rem'];
    return(
      <div key={node.codice}>
        <div
          style={{
            display:'flex',alignItems:'center',gap:'.4rem',
            padding:`.3rem .65rem .3rem ${indent+8}px`,
            borderBottom:'1px solid rgba(33,40,58,.35)',
            background:isSelected?'rgba(200,164,94,.07)':'transparent',
            cursor:'pointer',
          }}
          onMouseEnter={e=>e.currentTarget.style.background=isSelected?'rgba(200,164,94,.1)':'rgba(255,255,255,.03)'}
          onMouseLeave={e=>e.currentTarget.style.background=isSelected?'rgba(200,164,94,.07)':'transparent'}
        >
          {/* Checkbox */}
          <div onClick={e=>{e.stopPropagation();toggleSel(node.id);}} style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${isSelected?'var(--gold)':'var(--bd2)'}`,background:isSelected?'var(--gold)':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {isSelected&&<span style={{color:'#0d1117',fontSize:'.5rem',fontWeight:900}}>✓</span>}
          </div>
          {/* Toggle espansione */}
          {hasChildren?(
            <div onClick={()=>toggleOpen(node.codice)} style={{width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'var(--mu)',fontSize:'.7rem',transition:'transform .15s',transform:isOpen?'rotate(90deg)':'rotate(0deg)'}}>▶</div>
          ):<div style={{width:16,flexShrink:0}}/>}
          {/* Codice + Descrizione */}
          <code style={{fontSize:'.7rem',color:lvlColors[depth]||'var(--mu)',minWidth:depth===3?90:depth===2?70:depth===1?50:30,flexShrink:0}}>{node.codice}</code>
          <span style={{flex:1,fontSize:lvlSize[depth]||'.75rem',fontWeight:depth<2?600:400,color:depth<2?'var(--tx)':'var(--mu)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{node.descrizione}</span>
          {/* Flags */}
          <div style={{display:'flex',gap:'.2rem',flexShrink:0}}>
            {node.is_cliente&&<span className="bdg bdg-green" style={{fontSize:'.5rem',padding:'1px 4px'}}>C</span>}
            {node.is_fornitore&&<span className="bdg bdg-gold" style={{fontSize:'.5rem',padding:'1px 4px'}}>F</span>}
            {node.is_banca&&<span className="bdg bdg-blue" style={{fontSize:'.5rem',padding:'1px 4px'}}>B</span>}
          </div>
          {/* Matita edit */}
          <div onClick={e=>{e.stopPropagation();setEditConto(node);}} style={{width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:5,color:'var(--mu)',fontSize:'.75rem',cursor:'pointer',flexShrink:0}}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(200,164,94,.15)';e.currentTarget.style.color='var(--gold)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--mu)';}}>
            Modifica
          </div>
        </div>
        {isOpen&&hasChildren&&visibleChildren.map(child=>renderNode(child,depth+1))}
        {hasMore&&(
          <div onClick={e=>{e.stopPropagation();setNodePage(p=>({...p,[node.codice]:(p[node.codice]||1)+1}));}}
            style={{padding:'.4rem 1rem',cursor:'pointer',color:'var(--cy)',fontSize:'.75rem',background:'rgba(78,142,247,.05)',borderBottom:'1px solid var(--bd)'}}>
            ↓ Mostra altri {Math.min(PAGE_SIZE, node.children.length-currentPage*PAGE_SIZE)} di {node.children.length-currentPage*PAGE_SIZE} rimasti...
          </div>
        )}
      </div>
    );
  };

  // Render flat per ricerca
  const renderFlat=(items)=>items.map(c=>{
    const depth=c.livello-1;
    const lvlColors=['var(--gold)','var(--cy)','var(--tx)','var(--mu)'];
    return(
      <div key={c.codice} style={{display:'flex',alignItems:'center',gap:'.4rem',padding:'.3rem .65rem',borderBottom:'1px solid rgba(33,40,58,.35)'}}>
        <div onClick={()=>toggleSel(c.id)} style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${sel.has(c.id)?'var(--gold)':'var(--bd2)'}`,background:sel.has(c.id)?'var(--gold)':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
          {sel.has(c.id)&&<span style={{color:'#0d1117',fontSize:'.5rem',fontWeight:900}}>✓</span>}
        </div>
        <code style={{fontSize:'.7rem',color:lvlColors[depth]||'var(--mu)',minWidth:90,flexShrink:0}}>{c.codice}</code>
        <span style={{flex:1,fontSize:'.8rem',color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.descrizione}</span>
        <div onClick={()=>setEditConto(c)} style={{padding:'.15rem .35rem',borderRadius:5,color:'var(--mu)',fontSize:'.75rem',cursor:'pointer'}}
          onMouseEnter={e=>{e.currentTarget.style.color='var(--gold)';}}
          onMouseLeave={e=>{e.currentTarget.style.color='var(--mu)';}}>Modifica</div>
      </div>
    );
  });

  return(
    <div>
      <ModuleHeader
        sectionLabel="Contabilità"
        title="Piano dei conti"
        context={`${pianoConti.length} conti configurati`}
        primaryAction={<button className="btn-sec" onClick={()=>setNuovoConto({open:true})}>{ACCOUNTING_UI_TEXT.newAccount}</button>}
        secondaryAction={
          <>
            <button className="btn-sec" onClick={()=>setImportAnagrafica(true)}>Import anagrafica</button>
            <button className="btn" onClick={onImport}>{COMMON_UI_TEXT.importPdfExcel}</button>
            {pianoConti.length>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteAll}>{deleting?COMMON_UI_TEXT.deleting:deleteAllLabel(pianoConti.length)}</button>}
          </>
        }
      />
      {editConto&&<ModalEditConto conto={editConto} onSave={async(updates)=>{await contabilitaRepo.updatePianoConto(editConto.id,updates);setEditConto(null);onRefresh();}} onClose={()=>setEditConto(null)}/>}
      {nuovoConto.open&&<ModalNuovoConto societaId={societaId} pianoConti={pianoConti} onSave={async(rec)=>{const{error}=await contabilitaRepo.insertPianoConto({...rec,societa_id:societaId,attivo:true});if(error){alert('Errore: '+error.message);return;}setNuovoConto({open:false});onRefresh();}} onClose={()=>setNuovoConto({open:false})}/>}
      {importAnagrafica&&<ModalImportAnagraficaNESPianoConti societaId={societaId} pianoConti={pianoConti} onComplete={()=>{setImportAnagrafica(false);onRefresh();}} onClose={()=>setImportAnagrafica(false)}/>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div style={{fontSize:'.75rem',color:'var(--mu)'}}>
          {pianoConti.length} conti · <span style={{cursor:'pointer',color:'var(--cy)'}} onClick={expandAll}>{ACCOUNTING_UI_TEXT.expandAll}</span> · <span style={{cursor:'pointer',color:'var(--cy)'}} onClick={collapseAll}>{ACCOUNTING_UI_TEXT.collapseAll}</span>
        </div>
        <div style={{display:'flex',gap:'.5rem'}}>
          {sel.size>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteSelected}>{deleting?COMMON_UI_TEXT.deleting:deleteSelectedLabel(sel.size)}</button>}
        </div>
      </div>

      <input placeholder={ACCOUNTING_UI_TEXT.searchAccountPlaceholder} value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:'1rem',width:'100%'}}/>

      {pianoConti.length===0?(
        <div className="empty"><div className="empty-ico">□</div><div className="empty-t">{ACCOUNTING_UI_TEXT.noAccount}</div><div className="empty-s">Importa il piano dei conti da PDF</div></div>
      ):(
        <div className="card" style={{padding:0,maxHeight:'calc(100vh - 280px)',overflow:'auto'}}>
          {search
            ? renderFlat(filtered)
            : tree.map(node=>renderNode(node,0))
          }
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ MODAL EDIT CONTO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ CODICI ISO NAZIONI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ISO_NAZIONI = [
  ['IT','Italia'],['DE','Germania'],['FR','Francia'],['ES','Spagna'],['GB','Regno Unito'],
  ['AT','Austria'],['BE','Belgio'],['BG','Bulgaria'],['CY','Cipro'],['HR','Croazia'],
  ['DK','Danimarca'],['EE','Estonia'],['FI','Finlandia'],['GR','Grecia'],['HU','Ungheria'],
  ['IE','Irlanda'],['LV','Lettonia'],['LT','Lituania'],['LU','Lussemburgo'],['MT','Malta'],
  ['NL','Paesi Bassi'],['PL','Polonia'],['PT','Portogallo'],['CZ','Rep. Ceca'],['RO','Romania'],
  ['SK','Slovacchia'],['SI','Slovenia'],['SE','Svezia'],['CH','Svizzera'],['NO','Norvegia'],
  ['US','Stati Uniti'],['CN','Cina'],['JP','Giappone'],['BR','Brasile'],['AR','Argentina'],
  ['RU','Russia'],['TR','Turchia'],['AE','Emirati Arabi'],['SA','Arabia Saudita'],
  ['IN','India'],['AU','Australia'],['CA','Canada'],['MX','Messico'],['ZA','Sud Africa'],
];

// â”€â”€â”€ SELETTORE CONTROPARTITA (piano dei conti) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SelettoreContropartita({value, onChange, societaId}){
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [conti,setConti]=useState([]);
  const [loading,setLoading]=useState(false);
  const ref=useRef();

  useEffect(()=>{
    if(!open||!societaId) return;
    setLoading(true);
    contabilitaRepo.getPianoContiBasic(societaId) // tutto il piano conti, nessun filtro livello
      .then(({data})=>{ setConti(data||[]); setLoading(false); });
  },[open,societaId]);

  useEffect(()=>{
    if(!open) return;
    const handleClick=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',handleClick);
    return ()=>document.removeEventListener('mousedown',handleClick);
  },[open]);

  const filtered=search
    ? conti.filter(c=>(c.codice+' '+c.descrizione).toLowerCase().includes(search.toLowerCase())).slice(0,50)
    : conti.slice(0,50);

  const label=value?conti.find(c=>c.codice===value||c.id===value)?.let?.(c=>`${c.codice} — ${c.descrizione}`)||value:'-- Nessuna contropartita --';

  return(
    <div ref={ref} style={{position:'relative'}}>
      <div onClick={()=>setOpen(p=>!p)}
        style={{background:'var(--s1)',border:`1px solid ${open?'var(--gold)':'var(--bd)'}`,borderRadius:7,padding:'.45rem .7rem',cursor:'pointer',fontSize:'.8rem',color:value?'var(--tx)':'var(--mu)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.4rem'}}>
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{label}</span>
        <span style={{color:'var(--mu)',fontSize:'.65rem',flexShrink:0}}>{open?'▲':'▼'}</span>
      </div>
      {open&&(
        <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:200,background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,.4)',marginTop:2,maxHeight:300,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'.5rem .6rem',borderBottom:'1px solid var(--bd)'}}>
            <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Cerca per codice o descrizione..."
              style={{width:'100%',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:5,padding:'.35rem .55rem',fontSize:'.78rem',color:'var(--tx)'}}/>
          </div>
          <div style={{overflow:'auto',flex:1}}>
            <div onClick={()=>{onChange('');setOpen(false);}}
              style={{padding:'.4rem .7rem',cursor:'pointer',fontSize:'.75rem',color:'var(--mu)',borderBottom:'1px solid var(--bd)'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              -- Nessuna contropartita --
            </div>
            {loading?<div style={{padding:'.75rem',fontSize:'.75rem',color:'var(--mu)',textAlign:'center'}}>Caricamento...</div>
              :filtered.map(c=>(
              <div key={c.id} onClick={()=>{onChange(c.codice);setOpen(false);}}
                style={{padding:'.4rem .7rem',cursor:'pointer',display:'flex',gap:'.5rem',alignItems:'center',borderBottom:'1px solid rgba(33,40,58,.3)',background:value===c.codice?'rgba(200,164,94,.08)':'transparent'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}
                onMouseLeave={e=>e.currentTarget.style.background=value===c.codice?'rgba(200,164,94,.08)':'transparent'}>
                <code style={{fontSize:'.7rem',color:'var(--gold)',minWidth:80,flexShrink:0}}>{c.codice}</code>
                <span style={{fontSize:'.75rem',color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.descrizione}</span>
              </div>
            ))}
            {!loading&&filtered.length===0&&<div style={{padding:'.75rem',fontSize:'.75rem',color:'var(--mu)',textAlign:'center'}}>Nessun risultato</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ TAB ANAGRAFICA (estratta per leggibilitÃ ) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AnagraficaTab({form, up, conto, B}){
  // Causali IVA della societÃ  corrente (caricate lazy)
  const [causaliIva,setCausaliIva]=useState([]);
  useEffect(()=>{
    if(!conto.societa_id) return;
    contabilitaRepo.getCausaliIvaBasic()
      .then(({data})=>setCausaliIva(data||[]));
  },[conto.societa_id]);

  return(
    <>
      <div className="form-grid">
        <div className="fg full"><label>Ragione Sociale 2</label><input value={form.rag_sociale_2} onChange={e=>up('rag_sociale_2',e.target.value)}/></div>
        <div className="fg full"><label>Indirizzo</label><input value={form.indirizzo} onChange={e=>up('indirizzo',e.target.value)}/></div>
        <div className="fg"><label>CAP</label><input value={form.cap} onChange={e=>up('cap',e.target.value)} maxLength={5}/></div>
        <div className="fg"><label>Città</label><input value={form.citta} onChange={e=>up('citta',e.target.value)}/></div>
        <div className="fg"><label>Provincia</label><input value={form.provincia} onChange={e=>up('provincia',e.target.value)} maxLength={2} placeholder="RM"/></div>

        {/* Codice ISO â€” dropdown nazioni */}
        <div className="fg">
          <label>Nazione (ISO)</label>
          <select value={form.codice_iso||'IT'} onChange={e=>{up('codice_iso',e.target.value);up('nazione',ISO_NAZIONI.find(n=>n[0]===e.target.value)?.[1]||e.target.value);}}>
            {ISO_NAZIONI.map(([cod,nome])=><option key={cod} value={cod}>{cod} — {nome}</option>)}
          </select>
        </div>

        <div className="fg"><label>Codice Fiscale</label><input value={form.codice_fiscale} onChange={e=>up('codice_fiscale',e.target.value.toUpperCase())}/></div>
        <div className="fg"><label>Partita IVA</label><input value={form.partita_iva} onChange={e=>up('partita_iva',e.target.value)}/></div>

        <div className="fg"><label>Tipo soggetto</label>
          <select value={form.tipo_soggetto} onChange={e=>up('tipo_soggetto',e.target.value)}>
            <option value="Privato">Privato</option>
            <option value="Persona fisica">Persona fisica</option>
            <option value="Normale">Normale (Società/Ditta)</option>
            <option value="Dogana">Dogana</option>
            <option value="Estero">Estero</option>
          </select>
        </div>

        <div className="fg"><label>Tipo controparte</label>
          <select value={form.tipo_controparte} onChange={e=>up('tipo_controparte',e.target.value)}>
            <option value="1 = Persona fisica">1 = Persona fisica</option>
            <option value="2 = Persona giuridica">2 = Persona giuridica</option>
          </select>
        </div>

        <div className="fg"><label>Soggetto operaz.</label>
          <select value={form.soggetto_operaz} onChange={e=>up('soggetto_operaz',e.target.value)}>
            <option value="">-- Non specificato --</option>
            <option value="1">1 = Non titolare P.IVA</option>
            <option value="2">2 = Titolare P.IVA</option>
          </select>
        </div>

        {/* Aliquota IVA â€” dropdown causali IVA */}
        <div className="fg">
          <label>Aliquota IVA predefinita</label>
          <select value={form.causale_iva_id||''} onChange={e=>{
            const id=e.target.value
            const c=causaliIva.find(x=>x.id===id)
            up('causale_iva_id',id)
            up('aliquota_iva',c?String(c.aliquota??''):'')
          }}>
            <option value="">-- Standard (da causale) --</option>
            {causaliIva.map(c=><option key={c.id} value={c.id}>{c.codice} — {c.descrizione}{c.aliquota?` (${c.aliquota}%)`:''}</option>)}
          </select>
        </div>

        {/* Tipo pagamento â€” dropdown fisso */}
        <div className="fg">
          <label>Tipo pagamento</label>
          <select value={form.tipo_pagamento||''} onChange={e=>up('tipo_pagamento',e.target.value)}>
            <option value="">-- Non specificato --</option>
            <option value="Incasso">Incasso (cliente)</option>
            <option value="Pagamento">Pagamento (fornitore)</option>
            <option value="Rimessa diretta">Rimessa diretta</option>
            <option value="Bonifico">Bonifico bancario</option>
            <option value="Ri.Ba.">Ri.Ba.</option>
            <option value="RID">RID / SDD</option>
            <option value="Assegno">Assegno</option>
            <option value="Contanti">Contanti</option>
          </select>
        </div>

        {/* Contropartita â€” selettore piano dei conti */}
        <div className="fg full">
          <label>Contropartita predefinita
            <span style={{fontSize:'.68rem',color:'var(--mu)',marginLeft:'.5rem',fontWeight:400}}>
              conto proposto automaticamente nelle registrazioni di questo {form.is_cliente?'cliente':'fornitore'}
            </span>
          </label>
          <SelettoreContropartita
            value={form.contropartita}
            onChange={v=>up('contropartita',v)}
            societaId={conto.societa_id}
          />
        </div>

        <div className="fg"><label>Banca</label><input value={form.banca} onChange={e=>up('banca',e.target.value)}/></div>
        <div className="fg"><label>Regime fiscale</label>
          <select value={form.regime_fiscale} onChange={e=>up('regime_fiscale',e.target.value)}>
            <option value="">-- Non specificato --</option>
            <option value="RF01">RF01 - Ordinario</option>
            <option value="RF02">RF02 - Minimi</option>
            <option value="RF04">RF04 - Agricoltura</option>
            <option value="RF05">RF05 - Sali e tabacchi</option>
            <option value="RF10">RF10 - Agriturismo</option>
            <option value="RF19">RF19 - Forfettario</option>
            <option value="RF18">RF18 - Altro</option>
          </select>
        </div>
      </div>

      {/* Toggle Split Payment evidenziato */}
      <div style={{marginTop:'1.25rem',background:'rgba(200,164,94,.06)',border:'1px solid rgba(200,164,94,.2)',borderRadius:8,padding:'.75rem 1rem'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'.4rem'}}>
          <div>
            <div style={{fontWeight:700,fontSize:'.82rem',color:'var(--gold)'}}>Split Payment</div>
            <div style={{fontSize:'.72rem',color:'var(--mu)',marginTop:'.15rem'}}>
              L'IVA di questo cliente viene trattenuta dalla PA e non versata al fornitore (art. 17-ter DPR 633/72)
            </div>
          </div>
          <div onClick={()=>up('split_payment',!form.split_payment)}
            style={{width:40,height:22,borderRadius:11,background:form.split_payment?'var(--gold)':'var(--bd2)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
            <div style={{width:16,height:16,borderRadius:8,background:'#fff',position:'absolute',top:3,left:form.split_payment?21:3,transition:'left .2s'}}/>
          </div>
        </div>
        {form.split_payment&&(
          <div style={{fontSize:'.72rem',color:'#fb923c',marginTop:'.3rem',padding:'.35rem .6rem',background:'rgba(251,146,60,.08)',borderRadius:5}}>
            Attivo — nella liquidazione IVA l'imposta di questo cliente sarà dedotta dall'IVA a debito come "IVA Split Payment"
          </div>
        )}
      </div>

      {/* Altri toggle */}
      <div style={{marginTop:'1rem',display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
        <B k="consumatore_finale" lbl="Consumatore finale (B2C, no P.IVA)"/>
        <B k="includi_spesometro" lbl="Includi spesometro"/>
        <B k="soggetto_riepilogativo" lbl="Soggetto riepilogativo"/>
        <B k="proc_concorsuale" lbl="Procedura concorsuale"/>
        <B k="includi_esterometro" lbl="Includi esterometro"/>
        <B k="partecipa_gruppo_iva" lbl="Partecipa gruppo IVA"/>
      </div>
    </>
  );
}

function ModalEditConto({conto,onSave,onClose}){
  const [tab,setTab]=useState('generale');
  const B=({k,lbl})=>(<div style={{display:'flex',alignItems:'center',gap:'.5rem',cursor:'pointer',marginTop:'.35rem'}} onClick={()=>up(k,!form[k])}>
    <div style={{width:28,height:16,borderRadius:8,background:form[k]?'var(--gold)':'var(--bd2)',position:'relative',transition:'background .2s',flexShrink:0}}>
      <div style={{width:12,height:12,borderRadius:6,background:'#fff',position:'absolute',top:2,left:form[k]?14:2,transition:'left .2s'}}/>
    </div><span style={{fontSize:'.78rem',color:'var(--mu)'}}>{lbl}</span>
  </div>);
  const [form,setForm]=useState({
    // Generale
    descrizione:conto.descrizione||'',
    tipo:conto.tipo||'patrimoniale',
    natura:conto.natura||'',
    sezione:conto.sezione||'dare',
    is_cliente:conto.is_cliente||false,
    is_fornitore:conto.is_fornitore||false,
    is_banca:conto.is_banca||false,
    is_cassa:conto.is_cassa||false,
    is_professionista:conto.is_professionista||false,
    attivo:conto.attivo!==false,
    note:conto.note||'',
    // Anagrafica â€” nomi colonna DB (migration Opus)
    rag_sociale_2:conto.rag_sociale_2||'',
    indirizzo:conto.indirizzo||'',
    cap:conto.cap||'',
    citta:conto.citta||'',
    provincia:conto.provincia||'',
    nazione:conto.nazione||'Italia',
    codice_iso:conto.codice_iso||'IT',
    codice_fiscale:conto.codice_fiscale||'',
    partita_iva:conto.partita_iva||'',
    tipo_soggetto:conto.tipo_soggetto||'Privato',
    contropartita:conto.contropartita||'',
    tipo_pagamento:conto.tipo_pagamento||'',
    banca:conto.banca||'',
    aliquota_iva:conto.aliquota_iva||'',
    causale_iva_id:conto.causale_iva_id||'',
    soggetto_operaz:conto.soggetto_operaz||'',
    tipo_controparte:conto.tipo_controparte||'1 = Persona fisica',
    regime_fiscale:conto.regime_fiscale||'',
    email_pec:conto.email_pec||'',
    codice_dest_efat:conto.codice_dest_efat||'',
    consumatore_finale:conto.consumatore_finale||false,
    includi_spesometro:conto.includi_spesometro??true,
    soggetto_riepilogativo:conto.soggetto_riepilogativo||false,
    split_payment:conto.split_payment||false,
    proc_concorsuale:conto.proc_concorsuale||false,
    richiede_efat_b2b:conto.richiede_efat_b2b||false,
    singola_ft_elettronica:conto.singola_ft_elettronica||false,
    includi_esterometro:conto.includi_esterometro||false,
    partecipa_gruppo_iva:conto.partecipa_gruppo_iva||false,
  });
  const [saving,setSaving]=useState(false);
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);await onSave(form);setSaving(false);};
  const TABS=[['generale','Generale'],['anagrafica','Anagrafica'],['fattura','Fattura elett.']];
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">Modifica conto</div>
          <div className="modal-sub"><code style={{fontSize:'.8rem',color:'var(--gold)'}}>{conto.codice}</code> · Livello {conto.livello}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{display:'flex',borderBottom:'1px solid var(--bd)',padding:'0 1.25rem'}}>
          {TABS.map(([id,lbl])=>(
            <div key={id} onClick={()=>setTab(id)} style={{padding:'.5rem .85rem',fontSize:'.78rem',fontWeight:tab===id?700:400,color:tab===id?'var(--gold)':'var(--mu)',borderBottom:tab===id?'2px solid var(--gold)':'2px solid transparent',cursor:'pointer'}}>{lbl}</div>
          ))}
        </div>
        <div className="modal-body" style={{maxHeight:'65vh',overflowY:'auto'}}>

          {tab==='generale'&&<>
            <div className="form-grid">
              <div className="fg full"><label>Descrizione *</label><input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} autoFocus/></div>
              <div className="fg"><label>Tipo</label>
                <select value={form.tipo} onChange={e=>up('tipo',e.target.value)}>
                  <option value="patrimoniale">Patrimoniale</option>
                  <option value="economico">Economico</option>
                  <option value="ordine">D'ordine</option>
                </select>
              </div>
              <div className="fg"><label>Natura</label>
                <select value={form.natura} onChange={e=>up('natura',e.target.value)}>
                  <option value="attivo">Attivo</option>
                  <option value="passivo">Passivo</option>
                  <option value="ricavo">Ricavo</option>
                  <option value="costo">Costo</option>
                  <option value="ordine">Ordine</option>
                </select>
              </div>
              <div className="fg"><label>Sezione</label>
                <select value={form.sezione} onChange={e=>up('sezione',e.target.value)}>
                  <option value="dare">Dare</option>
                  <option value="avere">Avere</option>
                </select>
              </div>
              <div className="fg full"><label>Note</label><input value={form.note} onChange={e=>up('note',e.target.value)}/></div>
            </div>
            <div style={{marginTop:'1rem'}}>
              <div style={{fontSize:'.72rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',marginBottom:'.5rem'}}>Tipo anagrafica</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'.5rem'}}>
                {[['is_cliente','Cliente'],['is_fornitore','Fornitore'],['is_banca','Banca/C/C'],['is_cassa','Cassa'],['is_professionista','Professionista']].map(([k,l])=>(
                  <div key={k} onClick={()=>up(k,!form[k])} style={{padding:'.3rem .7rem',borderRadius:20,border:`1.5px solid ${form[k]?'var(--gold)':'var(--bd)'}`,background:form[k]?'rgba(200,164,94,.12)':'transparent',cursor:'pointer',fontSize:'.78rem',color:form[k]?'var(--gold)':'var(--mu)'}}>{l}</div>
                ))}
              </div>
            </div>
            <div style={{marginTop:'1rem',display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="attivo" lbl="Conto attivo"/>
            </div>
          </>}

          {tab==='anagrafica'&&<AnagraficaTab form={form} up={up} conto={conto} B={B}/>}

          {tab==='fattura'&&<>
            <div className="form-grid">
              <div className="fg full"><label>Email PEC</label><input value={form.email_pec} onChange={e=>up('email_pec',e.target.value)} type="email" placeholder="email@pec.it"/></div>
              <div className="fg full"><label>Codice destinatario fattura elettronica</label><input value={form.codice_dest_efat} onChange={e=>up('codice_dest_efat',e.target.value.toUpperCase())} maxLength={7} placeholder="7 caratteri"/></div>
            </div>
            <div style={{marginTop:'1rem',display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="richiede_efat_b2b" lbl="Richiede fattura elettronica B2B"/>
              <B k="singola_ft_elettronica" lbl="Singola fattura elettronica"/>
            </div>
          </>}

        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving||!form.descrizione} onClick={save}>{saving?'Salvo...':'Salva'}</button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ CAUSALI VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CausaliView({causali,tipo,societaId,onImport,onRefresh}){
  const [sel,setSel]=useState(new Set());
  const [deleting,setDeleting]=useState(false);
  const [editCausale,setEditCausale]=useState(null);
  const [nuovaCausale,setNuovaCausale]=useState(false);

  const toggleSel=(id)=>setSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>setSel(sel.size===causali.length?new Set():new Set(causali.map(c=>c.id)));

  const deleteSelected=async()=>{
    if(!sel.size||!confirm(`Eliminare ${sel.size} causali selezionate?`))return;
    setDeleting(true);
    const table=tipo==='iva'?'causali_iva':'causali_contabili';
    const ids=[...sel];
    for(let i=0;i<ids.length;i+=100) await contabilitaRepo.bulkDeactivateCausali(table, ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  const deleteAll=async()=>{
    const label=tipo==='iva'?'causali IVA':'causali contabili';
    if(!confirm(`Eliminare TUTTE le ${causali.length} ${label}? Questa azione non è reversibile.`))return;
    setDeleting(true);
    const table=tipo==='iva'?'causali_iva':'causali_contabili';
    const ids=causali.map(c=>c.id);
    for(let i=0;i<ids.length;i+=100) await contabilitaRepo.bulkDeactivateCausali(table, ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  return(
    <div>
      <ModuleHeader
        sectionLabel="Contabilità"
        title={tipo==='contabili' ? 'Causali contabili' : 'Causali IVA'}
        context={`${causali.length} causali configurate`}
        primaryAction={<button className="btn-sec" onClick={()=>setNuovaCausale(true)}>{ACCOUNTING_UI_TEXT.newCausale}</button>}
        secondaryAction={
          <>
            <button className="btn" onClick={onImport}>{COMMON_UI_TEXT.importPdfExcel}</button>
            {causali.length>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteAll}>{deleting?COMMON_UI_TEXT.deleting:deleteAllLabel(causali.length)}</button>}
          </>
        }
      />
      {editCausale&&<ModalEditCausale causale={editCausale} tipo={tipo} onSave={async(updates)=>{const table=tipo==='iva'?'causali_iva':'causali_contabili';await contabilitaRepo.updateCausale(table,editCausale.id,updates);setEditCausale(null);onRefresh();}} onClose={()=>setEditCausale(null)}/>}
      {nuovaCausale&&<ModalNuovaCausale tipo={tipo} societaId={societaId} onSave={async(rec)=>{const table=tipo==='iva'?'causali_iva':'causali_contabili';const row=tipo==='iva'?{...rec,attivo:true}:{...rec,societa_id:societaId,attivo:true};const{error}=await contabilitaRepo.insertCausale(table,row);if(error){alert('Errore: '+error.message);return;}setNuovaCausale(false);onRefresh();}} onClose={()=>setNuovaCausale(false)}/>}
      <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'.5rem'}}>
          {sel.size>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteSelected}>{deleting?COMMON_UI_TEXT.deleting:deleteSelectedLabel(sel.size)}</button>}
        </div>
      </div>

      {causali.length===0?(
        <div className="empty"><div className="empty-ico">□</div><div className="empty-t">{ACCOUNTING_UI_TEXT.noCausale}</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr>
              <th style={{width:32}}>
                <div onClick={toggleAll} style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${sel.size===causali.length?'var(--gold)':'var(--bd2)'}`,background:sel.size===causali.length?'var(--gold)':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {sel.size===causali.length&&<span style={{color:'#0d1117',fontSize:'.5rem',fontWeight:900}}>✓</span>}
                </div>
              </th>
              <th>Codice</th>
              <th>Descrizione</th>
              {tipo==='iva'&&<th>Aliquota</th>}
              {tipo==='iva'&&<th>Tipo</th>}
              {tipo==='contabili'&&<th>Tipo</th>}
              <th style={{width:40}}></th>
            </tr></thead>
            <tbody>{causali.map(c=>(
              <tr key={c.id} style={sel.has(c.id)?{background:'rgba(200,164,94,.06)'}:{}}>
                <td>
                  <div onClick={()=>toggleSel(c.id)} style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${sel.has(c.id)?'var(--gold)':'var(--bd2)'}`,background:sel.has(c.id)?'var(--gold)':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {sel.has(c.id)&&<span style={{color:'#0d1117',fontSize:'.5rem',fontWeight:900}}>✓</span>}
                  </div>
                </td>
                <td><code style={{fontSize:'.8rem'}}>{c.codice}</code></td>
                <td style={{fontSize:'.82rem'}}>{c.descrizione}</td>
                {tipo==='iva'&&<td><span className="bdg bdg-blue">{c.aliquota}%</span></td>}
                {tipo==='iva'&&<td><span style={{fontSize:'.72rem',color:'var(--mu)'}}>{c.tipo}</span></td>}
                {tipo==='contabili'&&<td style={{fontSize:'.75rem',color:'var(--mu)'}}>{c.tipo}</td>}
                <td>
                  <button className="btn-icon" style={{fontSize:'.75rem'}} onClick={()=>setEditCausale(c)}>Modifica</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ MODAL EDIT CAUSALE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalEditCausale({causale,tipo,onSave,onClose}){
  const isIva=tipo==='iva';
  const [tab,setTab]=useState('principale');
  const B=({k,lbl,small})=>(<div style={{display:'flex',alignItems:'center',gap:'.4rem',cursor:'pointer',marginTop:'.3rem'}} onClick={()=>up(k,!form[k])}>
    <div style={{width:26,height:14,borderRadius:7,background:form[k]?'var(--gold)':'var(--bd2)',position:'relative',flexShrink:0}}>
      <div style={{width:10,height:10,borderRadius:5,background:'#fff',position:'absolute',top:2,left:form[k]?14:2,transition:'left .15s'}}/>
    </div>
    <span style={{fontSize:small?'.72rem':'.78rem',color:'var(--mu)'}}>{lbl}</span>
  </div>);

  const [form,setForm]=useState(isIva?{
    // Principali
    codice:causale.codice||'',
    descrizione:causale.descrizione||'',
    percentuale_imposta:causale.aliquota??causale.percentuale_imposta??0,
    regime_iva:causale.regime_iva||'Imponibile',
    percentuale_compensazione:causale.percentuale_compensazione??0,
    tipo_trattamento:causale.tipo_trattamento||'Normale',
    // DetraibilitÃ 
    nota_di_variazione:causale.nota_di_variazione||false,
    detraibile:causale.detraibile??true,
    percentuale_indetraibilita:causale.percentuale_indetraibilita??0,
    // Volume e plafond
    volume_affari:causale.volume_affari||false,
    volume_affari_plafond:causale.volume_affari_plafond||false,
    concorre_plafond:causale.concorre_plafond||false,
    utilizzo_plafond_interno:causale.utilizzo_plafond_interno||false,
    utilizzo_plafond_import:causale.utilizzo_plafond_import||false,
    monte_acquisti:causale.monte_acquisti||false,
    // Operazioni
    operazione_attiva:causale.operazione_attiva||false,
    cessione_intra:causale.cessione_intra||false,
    operazione_passiva:causale.operazione_passiva||false,
    acquisto_intra:causale.acquisto_intra||false,
    // Liquidazione / dichiarazione
    op_attive_spesometro:causale.op_attive_spesometro||false,
    op_passive_spesometro:causale.op_passive_spesometro??true,
    op_attive_liquidazione:causale.op_attive_liquidazione||false,
    op_passive_liquidazione:causale.op_passive_liquidazione||false,
    reverse_charge:causale.reverse_charge||false,
    incluso_quadro_vt:causale.incluso_quadro_vt||false,
    imponibile_quadro_vt:causale.imponibile_quadro_vt||false,
    imposta_quadro_vt:causale.imposta_quadro_vt||false,
    op_esenti_prorata:causale.op_esenti_prorata||false,
    volume_affari_prorata:causale.volume_affari_prorata||false,
    ripartizione_acquisti:causale.ripartizione_acquisti||false,
    no_riparto_spese_acc:causale.no_riparto_spese_acc||false,
    acquisto_soggetti_minimi:causale.acquisto_soggetti_minimi||false,
    acquisti_art17_c2:causale.acquisti_art17_c2||false,
    no_calcolo_bolli:causale.no_calcolo_bolli||false,
    acquisti_regime_forfetario:causale.acquisti_regime_forfetario||false,
    // Reverse charge settori
    oro_argento:causale.oro_argento||false,
    rottami_recupero:causale.rottami_recupero||false,
    subappalto_edile:causale.subappalto_edile||false,
    fabbricati_strumentali:causale.fabbricati_strumentali||false,
    telefoni_cellulari:causale.telefoni_cellulari||false,
    prodotti_elettronici:causale.prodotti_elettronici||false,
    servizi_pulizia:causale.servizi_pulizia||false,
    demolizione:causale.demolizione||false,
    installazione_impianti:causale.installazione_impianti||false,
    completamento_edifici:causale.completamento_edifici||false,
    trasf_quote:causale.trasf_quote||false,
    trasf_unita_certif:causale.trasf_unita_certif||false,
    gas_energia:causale.gas_energia||false,
    // E-fattura
    natura_aliquota_iva_pa:causale.natura_aliquota_iva_pa||'',
    codice_efat_passive:causale.codice_efat_passive||false,
    codice_efat_attive:causale.codice_efat_attive||false,
    aliquota_ventilazione_no_acq:causale.aliquota_ventilazione_no_acq||false,
    note:causale.note||'',
  }:{
    // Causali contabili
    codice:causale.codice||'',
    descrizione:causale.descrizione||'',
    descrizione_tabulati:causale.descrizione_tabulati||'',
    tipo_causale:causale.tipo_causale||'Movimento di generale',
    operazione_partite:causale.operazione_partite||'Ignora',
    tipo_pagamento:causale.tipo_pagamento||'',
    codice_registro_iva:causale.codice_registro_iva||'',
    protocollo_numerazione:causale.protocollo_numerazione??0,
    segno_registro_iva:causale.segno_registro_iva||'',
    codice_aliquota_iva:causale.codice_aliquota_iva||'',
    op_ritenute:causale.op_ritenute||'Ignora',
    tipo_documento:causale.tipo_documento||'',
    data_documento:causale.data_documento||'Facoltativo',
    numero_documento:causale.numero_documento||'Facoltativo',
    tipo_doc_comunicaz_ft:causale.tipo_doc_comunicaz_ft||'',
    tipo_doc_ft_elettroniche:causale.tipo_doc_ft_elettroniche||'',
    conto_iva_esig_differita:causale.conto_iva_esig_differita||'',
    registro_iva_differita:causale.registro_iva_differita||'',
    registro_iva_cee:causale.registro_iva_cee||'',
    protocollo_iva_cee:causale.protocollo_iva_cee??0,
    segno_iva_registro_cee:causale.segno_iva_registro_cee||'',
    // Flag booleani
    trascina_descrizione:causale.trascina_descrizione??true,
    trascina_sbilancio:causale.trascina_sbilancio||false,
    data_competenza:causale.data_competenza||false,
    rateo_risconti:causale.rateo_risconti||false,
    disattivato:causale.disattivato||false,
    integrazione_documento:causale.integrazione_documento||false,
    causale_giro_iva_cassa:causale.causale_giro_iva_cassa||false,
    competenza_iva_anno_prec:causale.competenza_iva_anno_prec||false,
    causale_standard_efat:causale.causale_standard_efat||false,
    ventilazione_corrispettivi:causale.ventilazione_corrispettivi||false,
    esclusa_integrazioni:causale.esclusa_integrazioni||false,
    note:causale.note||'',
  });
  const [saving,setSaving]=useState(false);
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);await onSave(form);setSaving(false);};

  const TABS_IVA=[['principale','Principale'],['operazioni','Operazioni'],['rc','Rev. Charge'],['efat','E-Fattura']];
  const TABS_CONT=[['principale','Principale'],['iva','IVA'],['flags','Flag'],['cee','CEE/Differita']];
  const TABS=isIva?TABS_IVA:TABS_CONT;

  const TD_OPTIONS=[
    {v:'',l:'-- Non specificato --'},
    {v:'TD01',l:'TD01 - Fattura'},{v:'TD04',l:'TD04 - Nota di credito'},
    {v:'TD07',l:'TD07 - Fattura semplificata'},{v:'TD08',l:'TD08 - Nota credito semplificata'},
    {v:'TD09',l:'TD09 - Nota debito'},{v:'TD10',l:'TD10 - Fattura acquisto intra beni'},
    {v:'TD11',l:'TD11 - Fattura acquisto intra servizi'},
    {v:'TD16',l:'TD16 - Integrazione reverse charge'},{v:'TD17',l:'TD17 - Autofattura acquisto servizi'},
    {v:'TD18',l:'TD18 - Integrazione acquisto beni intra'},{v:'TD19',l:'TD19 - Integrazione acquisto beni art.17'},
    {v:'TD20',l:'TD20 - Autofattura regolarizzazione'},{v:'TD21',l:'TD21 - Autofattura splafonamento'},
    {v:'TD24',l:'TD24 - Fattura differita beni'},{v:'TD25',l:'TD25 - Fattura differita servizi'},
    {v:'TD26',l:'TD26 - Cessione beni ammortizzabili'},{v:'TD27',l:'TD27 - Autofattura autoconsumo'},
  ];

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">{isIva?'Causale IVA':'Causale contabile'}</div>
          <div className="modal-sub"><code style={{color:'var(--gold)'}}>{causale.codice}</code></div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{display:'flex',borderBottom:'1px solid var(--bd)',padding:'0 1.25rem'}}>
          {TABS.map(([id,lbl])=>(
            <div key={id} onClick={()=>setTab(id)} style={{padding:'.5rem .75rem',fontSize:'.75rem',fontWeight:tab===id?700:400,color:tab===id?'var(--gold)':'var(--mu)',borderBottom:tab===id?'2px solid var(--gold)':'2px solid transparent',cursor:'pointer'}}>{lbl}</div>
          ))}
        </div>
        <div className="modal-body" style={{maxHeight:'65vh',overflowY:'auto'}}>

          {/* â”€â”€ CAUSALE IVA â”€â”€ */}
          {isIva&&tab==='principale'&&<div className="form-grid">
            <div className="fg"><label>Codice</label><input value={form.codice} onChange={e=>up('codice',e.target.value.toUpperCase())} style={{fontFamily:'monospace'}}/></div>
            <div className="fg full"><label>Descrizione *</label><input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} autoFocus/></div>
            <div className="fg"><label>% Imposta</label><input type="number" value={form.percentuale_imposta} onChange={e=>up('aliquota',parseFloat(e.target.value)||0)} min={0} max={100} step={1}/></div>
            <div className="fg"><label>% Indetraibilità</label><input type="number" value={form.percentuale_indetraibilita} onChange={e=>up('percentuale_indetraibilita',parseFloat(e.target.value)||0)} min={0} max={100} step={1}/></div>
            <div className="fg"><label>% Compensazione</label><input type="number" value={form.percentuale_compensazione} onChange={e=>up('percentuale_compensazione',parseFloat(e.target.value)||0)} min={0} max={100} step={1}/></div>
            <div className="fg"><label>Regime IVA</label>
              <select value={form.regime_iva} onChange={e=>up('regime_iva',e.target.value)}>
                <option value="Imponibile">Imponibile</option>
                <option value="Esente">Esente</option>
                <option value="Non imponibile">Non imponibile</option>
                <option value="Escluso">Escluso</option>
              </select>
            </div>
            <div className="fg"><label>Tipo trattamento</label>
              <select value={form.tipo_trattamento} onChange={e=>up('tipo_trattamento',e.target.value)}>
                <option value="Normale">Normale</option>
                <option value="Acquisto Cee">Acquisto CEE</option>
              </select>
            </div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="detraibile" lbl="Detraibile"/>
              <B k="nota_di_variazione" lbl="Nota di variazione"/>
              <B k="no_calcolo_bolli" lbl="Non calcolare bolli"/>
              <B k="acquisto_soggetti_minimi" lbl="Acquisto sogg. minimi"/>
              <B k="acquisti_art17_c2" lbl="Acquisti art. 17 c.2"/>
              <B k="acquisti_regime_forfetario" lbl="Regime forfetario"/>
            </div>
            <div className="fg full"><label>Note</label><input value={form.note} onChange={e=>up('note',e.target.value)}/></div>
          </div>}

          {isIva&&tab==='operazioni'&&<div className="form-grid">
            <div className="fg full" style={{fontSize:'.75rem',fontWeight:600,color:'var(--mu)',textTransform:'uppercase',letterSpacing:'.05em'}}>Operazioni e liquidazione</div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="operazione_attiva" lbl="Operazione attiva"/>
              <B k="operazione_passiva" lbl="Operazione passiva"/>
              <B k="cessione_intra" lbl="Cessione intra"/>
              <B k="acquisto_intra" lbl="Acquisto intra"/>
              <B k="op_attive_liquidazione" lbl="Op. attive liquidazione"/>
              <B k="op_passive_liquidazione" lbl="Op. passive liquidazione"/>
              <B k="op_attive_spesometro" lbl="Op. attive spesometro"/>
              <B k="op_passive_spesometro" lbl="Op. passive spesometro"/>
              <B k="reverse_charge" lbl="Reverse charge"/>
            </div>
            <div className="fg full" style={{fontSize:'.75rem',fontWeight:600,color:'var(--mu)',textTransform:'uppercase',letterSpacing:'.05em',marginTop:'.5rem'}}>Volume d'affari e plafond</div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="volume_affari" lbl="Volume d'affari"/>
              <B k="volume_affari_plafond" lbl="Vol. affari plafond"/>
              <B k="concorre_plafond" lbl="Concorre plafond"/>
              <B k="utilizzo_plafond_interno" lbl="Utilizzo plafond interno"/>
              <B k="utilizzo_plafond_import" lbl="Utilizzo plafond import"/>
              <B k="monte_acquisti" lbl="Monte acquisti"/>
              <B k="volume_affari_prorata" lbl="Vol. affari pro-rata"/>
              <B k="op_esenti_prorata" lbl="Op. esenti pro-rata"/>
              <B k="ripartizione_acquisti" lbl="Ripartizione acquisti"/>
              <B k="no_riparto_spese_acc" lbl="No riparto spese access."/>
            </div>
            <div className="fg full" style={{fontSize:'.75rem',fontWeight:600,color:'var(--mu)',textTransform:'uppercase',letterSpacing:'.05em',marginTop:'.5rem'}}>Quadri dichiarazione</div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="incluso_quadro_vt" lbl="Incluso quadro VT"/>
              <B k="imponibile_quadro_vt" lbl="Imponibile quadro VT"/>
              <B k="imposta_quadro_vt" lbl="Imposta quadro VT"/>
            </div>
          </div>}

          {isIva&&tab==='rc'&&<div className="form-grid">
            <div className="fg full" style={{fontSize:'.75rem',color:'var(--mu)',marginBottom:'.5rem'}}>Settori con regime reverse charge specifico</div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="oro_argento" lbl="Oro ind. / Argento puro"/>
              <B k="rottami_recupero" lbl="Rottami e materiali recupero"/>
              <B k="subappalto_edile" lbl="Subappalto edile"/>
              <B k="fabbricati_strumentali" lbl="Fabbricati strumentali"/>
              <B k="telefoni_cellulari" lbl="Telefoni cellulari"/>
              <B k="prodotti_elettronici" lbl="Prodotti elettronici"/>
              <B k="servizi_pulizia" lbl="Servizi pulizia"/>
              <B k="demolizione" lbl="Demolizione"/>
              <B k="installazione_impianti" lbl="Installazione impianti"/>
              <B k="completamento_edifici" lbl="Completamento edifici"/>
              <B k="trasf_quote" lbl="Trasf. quote"/>
              <B k="trasf_unita_certif" lbl="Trasf. unità e certif."/>
              <B k="gas_energia" lbl="Gas ed energia elettrica"/>
            </div>
          </div>}

          {isIva&&tab==='efat'&&<div className="form-grid">
            <div className="fg full"><label>Natura aliquota IVA PA</label>
              <select value={form.natura_aliquota_iva_pa} onChange={e=>up('natura_aliquota_iva_pa',e.target.value)}>
                <option value="">-- Nessuna --</option>
                <option value="N1">N1 - Escluse ex art.15</option>
                <option value="N2.1">N2.1 - Non soggette art.7</option>
                <option value="N2.2">N2.2 - Non soggette altri casi</option>
                <option value="N3.1">N3.1 - Non imponibili esportazioni</option>
                <option value="N3.2">N3.2 - Non imponibili CEE beni</option>
                <option value="N3.3">N3.3 - Non imponibili CEE servizi</option>
                <option value="N3.4">N3.4 - Non imponibili assimilate</option>
                <option value="N3.5">N3.5 - Non imponibili dichiarazioni intento</option>
                <option value="N3.6">N3.6 - Non imponibili altre</option>
                <option value="N4">N4 - Esenti</option>
                <option value="N5">N5 - Regime del margine</option>
                <option value="N6.1">N6.1 - RC rottami</option>
                <option value="N6.2">N6.2 - RC edilizia</option>
                <option value="N6.3">N6.3 - RC sub-appalto</option>
                <option value="N6.4">N6.4 - RC cessione fabbricati</option>
                <option value="N6.5">N6.5 - RC cellulari</option>
                <option value="N6.6">N6.6 - RC prodotti elettronici</option>
                <option value="N6.7">N6.7 - RC gas/energia</option>
                <option value="N6.8">N6.8 - RC GNL</option>
                <option value="N6.9">N6.9 - RC altri casi</option>
                <option value="N7">N7 - IVA assolta in altro stato UE</option>
              </select>
            </div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="codice_efat_passive" lbl="Includi in e-fat passive"/>
              <B k="codice_efat_attive" lbl="Includi in e-fat attive"/>
              <B k="aliquota_ventilazione_no_acq" lbl="Ventilazione senza acquisti"/>
            </div>
          </div>}

          {/* â”€â”€ CAUSALE CONTABILE â”€â”€ */}
          {!isIva&&tab==='principale'&&<div className="form-grid">
            <div className="fg"><label>Codice</label><input value={form.codice} onChange={e=>up('codice',e.target.value.toUpperCase())} style={{fontFamily:'monospace'}}/></div>
            <div className="fg full"><label>Descrizione *</label><input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} autoFocus/></div>
            <div className="fg full"><label>Descrizione per tabulati</label><input value={form.descrizione_tabulati} onChange={e=>up('descrizione_tabulati',e.target.value)} placeholder="Descrizione breve per stampe NES"/></div>
            <div className="fg"><label>Tipo causale</label>
              <select value={form.tipo_causale} onChange={e=>up('tipo_causale',e.target.value)}>
                <option value="Movimento di generale">Movimento di generale</option>
                <option value="Doc. Iva normale">Doc. IVA normale</option>
                <option value="Doc. Iva esig. differita">Doc. IVA esig. differita</option>
                <option value="Autofattura">Autofattura</option>
                <option value="Doc. Corrispettivo">Doc. Corrispettivo</option>
                <option value="Doc. Iva Acq. CEE">Doc. IVA Acq. CEE</option>
                <option value="Movimento sola Iva">Movimento sola IVA</option>
                <option value="Pag./inc. Iva esig. diff.">Pag./Inc. IVA esig. diff.</option>
              </select>
            </div>
            <div className="fg"><label>Operazione partite</label>
              <select value={form.operazione_partite} onChange={e=>up('operazione_partite',e.target.value)}>
                <option value="Ignora">Ignora</option>
                <option value="Apre">Apre</option>
                <option value="Chiude">Chiude</option>
              </select>
            </div>
            <div className="fg"><label>Tipo documento</label>
              <select value={form.tipo_documento} onChange={e=>up('tipo_documento',e.target.value)}>
                <option value="">-- Non specificato --</option>
                <option value="Fattura">Fattura</option>
                <option value="Autofattura">Autofattura</option>
                <option value="Doc. Iva normale">Doc. IVA normale</option>
                <option value="Doc. Iva esig. differita">Doc. IVA esig. differita</option>
                <option value="Movimento di generale">Movimento di generale</option>
              </select>
            </div>
            <div className="fg"><label>Gestione partite</label>
              <select value={form.operazione_partite} onChange={e=>up('operazione_partite',e.target.value)}>
                <option value="Ignora">Ignora</option>
                <option value="Apre">Apre</option>
                <option value="Chiude">Chiude</option>
              </select>
            </div>
            <div className="fg"><label>Op. ritenute</label>
              <select value={form.op_ritenute} onChange={e=>up('op_ritenute',e.target.value)}>
                <option value="Ignora">Ignora</option>
                <option value="Documento">Documento</option>
                <option value="Pagamento">Pagamento</option>
              </select>
            </div>
            <div className="fg"><label>Data documento</label>
              <select value={form.data_documento} onChange={e=>up('data_documento',e.target.value)}>
                <option value="Facoltativo">Facoltativo</option>
                <option value="Obbligatorio">Obbligatorio</option>
              </select>
            </div>
            <div className="fg"><label>Numero documento</label>
              <select value={form.numero_documento} onChange={e=>up('numero_documento',e.target.value)}>
                <option value="Facoltativo">Facoltativo</option>
                <option value="Obbligatorio">Obbligatorio</option>
              </select>
            </div>
            <div className="fg"><label>Tipo pag.</label><input value={form.tipo_pagamento} onChange={e=>up('tipo_pagamento',e.target.value)} placeholder="es. Rimessa diretta"/></div>
            <div className="fg full"><label>Note</label><input value={form.note} onChange={e=>up('note',e.target.value)}/></div>
          </div>}

          {!isIva&&tab==='iva'&&<div className="form-grid">
            <div className="fg"><label>Registro IVA</label><input value={form.codice_registro_iva} onChange={e=>up('codice_registro_iva',e.target.value)} placeholder="es. 01, 02" style={{fontFamily:'monospace'}}/></div>
            <div className="fg"><label>Protocollo numerazione</label><input type="number" value={form.protocollo_numerazione} onChange={e=>up('protocollo_numerazione',parseInt(e.target.value)||0)} min={0}/></div>
            <div className="fg"><label>Segno registro IVA</label>
              <select value={form.segno_registro_iva} onChange={e=>up('segno_registro_iva',e.target.value)}>
                <option value="">-- --</option>
                <option value="Somma">Somma</option>
                <option value="Sottrae">Sottrae</option>
              </select>
            </div>
            <div className="fg"><label>Codice aliquota IVA</label><input value={form.codice_aliquota_iva} onChange={e=>up('codice_aliquota_iva',e.target.value.toUpperCase())} placeholder="es. A1IW" style={{fontFamily:'monospace'}}/></div>
            <div className="fg"><label>TD comunicaz. fatture</label>
              <select value={form.tipo_doc_comunicaz_ft} onChange={e=>up('tipo_doc_comunicaz_ft',e.target.value)}>
                {TD_OPTIONS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div className="fg"><label>TD fatture elettroniche</label>
              <select value={form.tipo_doc_ft_elettroniche} onChange={e=>up('tipo_doc_ft_elettroniche',e.target.value)}>
                {TD_OPTIONS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div className="fg full"><label>Conto IVA esig. differita</label><input value={form.conto_iva_esig_differita} onChange={e=>up('conto_iva_esig_differita',e.target.value)} placeholder="es. 600000011" style={{fontFamily:'monospace'}}/></div>
            <div className="fg"><label>Registro IVA differita</label><input value={form.registro_iva_differita} onChange={e=>up('registro_iva_differita',e.target.value)}/></div>
          </div>}

          {!isIva&&tab==='flags'&&<div className="form-grid">
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="trascina_descrizione" lbl="Trascina descrizione aggiuntiva"/>
              <B k="trascina_sbilancio" lbl="Trascina sbilancio"/>
              <B k="data_competenza" lbl="Data competenza"/>
              <B k="rateo_risconti" lbl="Rateo/Risconti"/>
              <B k="disattivato" lbl="Disattivato"/>
              <B k="integrazione_documento" lbl="Integrazione documento"/>
              <B k="causale_giro_iva_cassa" lbl="Causale giro IVA per cassa"/>
              <B k="competenza_iva_anno_prec" lbl="Competenza IVA anno prec."/>
              <B k="causale_standard_efat" lbl="Causale standard Efat"/>
              <B k="ventilazione_corrispettivi" lbl="Ventilazione corrispettivi"/>
              <B k="esclusa_integrazioni" lbl="Esclusa da integrazioni/autofatture"/>
            </div>
          </div>}

          {!isIva&&tab==='cee'&&<div className="form-grid">
            <div className="fg"><label>Registro IVA CEE</label><input value={form.registro_iva_cee} onChange={e=>up('registro_iva_cee',e.target.value)} placeholder="es. 02" style={{fontFamily:'monospace'}}/></div>
            <div className="fg"><label>Protocollo IVA CEE</label><input type="number" value={form.protocollo_iva_cee} onChange={e=>up('protocollo_iva_cee',parseInt(e.target.value)||0)} min={0}/></div>
            <div className="fg"><label>Segno registro CEE</label>
              <select value={form.segno_iva_registro_cee} onChange={e=>up('segno_iva_registro_cee',e.target.value)}>
                <option value="">-- --</option>
                <option value="Somma">Somma</option>
                <option value="Sottrae">Sottrae</option>
              </select>
            </div>
          </div>}

        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving||!form.descrizione} onClick={save}>{saving?'Salvo...':'Salva'}</button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ PRIMA NOTA VIEW â€” riga tabella scritture (log binding) â”€â”€

function ModalNuovaSocieta({onSave,onClose}){
  const [mode,setMode]=useState('select'); // 'select' | 'create'
  const [clienti,setClienti]=useState([]);
  const [societa,setSocieta]=useState([]); // lista societÃ  esistenti per duplicazione
  const [searchTerm,setSearchTerm]=useState('');
  const [selectedCliente,setSelectedCliente]=useState(null);
  const [loading,setLoading]=useState(true);
  const [formData,setFormData]=useState({
    denominazione:'',partita_iva:'',codice_fiscale:'',
    indirizzo:'',cap:'',citta:'',provincia:'',
    email:'',pec:'',telefono:'',
    regime_contabile:'ordinario',tipo_liquidazione_iva:'trimestrale',attiva:true
  });
  const [saving,setSaving]=useState(false);
  // Duplicazione
  const [duplicaDa,setDuplicaDa]=useState(null); // societÃ  sorgente selezionata
  const [showDuplica,setShowDuplica]=useState(false);

  useEffect(()=>{
    Promise.all([
      contabilitaRepo.getClientiAttiviCompleti(),
      contabilitaRepo.getSocietaAttiveBasic(),
    ]).then(([{data:cl},{data:soc}])=>{
      setClienti(cl||[]);
      setSocieta(soc||[]);
      setLoading(false);
    });
  },[]);

  const clientiFiltrati=clienti.filter(c=>{
    const t=searchTerm.toLowerCase();
    return (c.ragione_sociale||'').toLowerCase().includes(t)||(c.nome||'').toLowerCase().includes(t)||(c.partita_iva||'').includes(t)||(c.codice_fiscale||'').toLowerCase().includes(t);
  });

  const genCodice=(denom)=>(denom||'SOC').replace(/[^A-Za-z0-9]/g,'').toUpperCase().substring(0,6)+Date.now().toString().slice(-4);

  // Duplica piano conti + causali dalla societÃ  sorgente
  const duplicaDati=async(newSocietaId,sourceSocietaId)=>{
    const[{data:pc},{data:cc},{data:ci}]=await Promise.all([
      contabilitaRepo.getPianoContiSource(sourceSocietaId),
      contabilitaRepo.getCausaliContabiliSource(sourceSocietaId),
      contabilitaRepo.getCausaliIvaSource(sourceSocietaId),
    ]);
    const strip=(arr)=>arr.map(({id,created_at,updated_at,...r})=>({...r,societa_id:newSocietaId}));
    const BATCH=500;
    for(const[table,data] of [['piano_conti',pc||[]],['causali_contabili',cc||[]],['causali_iva',ci||[]]]){
      for(let i=0;i<data.length;i+=BATCH){
        const{error}=await contabilitaRepo.insertBatch(table, strip(data.slice(i,i+BATCH)));
        if(error)console.error(`Errore duplica ${table}:`,error);
      }
    }
  };

  const handleSelectCliente=async()=>{
    if(!selectedCliente){alert('Seleziona un cliente');return;}
    setSaving(true);
    const denom=selectedCliente.ragione_sociale||`${selectedCliente.nome||''} ${selectedCliente.cognome||''}`.trim();
    const societaData={codice:genCodice(denom),denominazione:denom,partita_iva:selectedCliente.partita_iva||'',codice_fiscale:selectedCliente.codice_fiscale||'',indirizzo:selectedCliente.indirizzo||'',citta:selectedCliente.comune||'',provincia:selectedCliente.provincia||'',regime_contabile:'ordinaria',attiva:true};
    const newSoc=await onSave(societaData);
    if(newSoc?.id&&duplicaDa) await duplicaDati(newSoc.id,duplicaDa);
    setSaving(false);
  };

  const handleSaveManual=async()=>{
    if(!formData.denominazione){alert('Inserisci denominazione');return;}
    setSaving(true);
    const datiDaSalvare={codice:genCodice(formData.denominazione),denominazione:formData.denominazione,partita_iva:formData.partita_iva||'',codice_fiscale:formData.codice_fiscale||'',indirizzo:formData.indirizzo||'',cap:formData.cap||'',citta:formData.citta||'',provincia:formData.provincia||'',regime_contabile:formData.regime_contabile||'ordinaria',attiva:true};
    const newSoc=await onSave(datiDaSalvare);
    if(newSoc?.id&&duplicaDa) await duplicaDati(newSoc.id,duplicaDa);
    setSaving(false);
  };

  // Sezione duplicazione (comune a entrambe le modalitÃ )
  const renderDuplicaSection=()=>(
    <div style={{background:'rgba(200,164,94,.06)',border:'1px solid rgba(200,164,94,.25)',borderRadius:10,padding:'.85rem 1rem',marginTop:'1rem'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'.5rem'}}>
        <div style={{fontSize:'.82rem',fontWeight:600,color:'var(--gold)'}}>Duplica piano conti e causali</div>
        <div onClick={()=>{setShowDuplica(p=>!p);if(!showDuplica)setDuplicaDa(null);}} className={'tgl'+(showDuplica?' on':'')} style={{cursor:'pointer'}}/>
      </div>
      {showDuplica&&(
        societa.length===0?(
          <div style={{fontSize:'.78rem',color:'var(--mu)'}}>Nessuna società esistente da cui duplicare.</div>
        ):(
          <>
            <div style={{fontSize:'.75rem',color:'var(--mu)',marginBottom:'.5rem'}}>Seleziona la società da cui copiare Piano dei Conti, Causali Contabili e Causali IVA:</div>
            <select value={duplicaDa||''} onChange={e=>setDuplicaDa(e.target.value||null)} style={{width:'100%',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,color:'var(--tx)',padding:'.45rem .7rem',fontSize:'.82rem'}}>
              <option value="">— Seleziona società —</option>
              {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione}</option>)}
            </select>
            {duplicaDa&&<div className="alert alert-info" style={{marginTop:'.5rem',padding:'.45rem .65rem',fontSize:'.72rem'}}>Verranno duplicati piano conti e causali da <strong>{societa.find(s=>s.id===duplicaDa)?.denominazione}</strong></div>}
          </>
        )
      )}
    </div>
  );

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:650,maxHeight:'85vh',overflow:'auto'}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">Nuova società</div><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div style={{display:'flex',gap:'.5rem',marginBottom:'1rem'}}>
            <button className={mode==='select'?'btn':'btn-sec'} onClick={()=>setMode('select')} style={{flex:1}}>Da Anagrafica Clienti</button>
            <button className={mode==='create'?'btn':'btn-sec'} onClick={()=>setMode('create')} style={{flex:1}}>Crea manualmente</button>
          </div>

          {mode==='select'?(
            <>
              <input placeholder="Cerca per nome, P.IVA o C.F..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{width:'100%',padding:'.6rem',borderRadius:6,border:'1px solid var(--bd)',background:'var(--s2)',color:'var(--tx)',marginBottom:'1rem'}}/>
              <div style={{maxHeight:260,overflowY:'auto',border:'1px solid var(--bd)',borderRadius:8}}>
                {loading?<div style={{padding:'2rem',textAlign:'center',color:'var(--mu)'}}>Caricamento...</div>
                :clientiFiltrati.length===0?<div style={{padding:'2rem',textAlign:'center',color:'var(--mu)'}}>Nessun cliente</div>
                :clientiFiltrati.map(c=>(
                  <div key={c.id} onClick={()=>setSelectedCliente(c)} style={{padding:'.75rem 1rem',borderBottom:'1px solid var(--bd)',cursor:'pointer',background:selectedCliente?.id===c.id?'rgba(200,164,94,.15)':'transparent',borderLeft:selectedCliente?.id===c.id?'3px solid var(--gold)':'3px solid transparent'}}>
                    <div style={{fontWeight:600,fontSize:'.85rem'}}>{c.ragione_sociale||`${c.nome} ${c.cognome}`.trim()}</div>
                    <div style={{fontSize:'.72rem',color:'var(--mu)',marginTop:'.2rem'}}>{c.partita_iva&&`P.IVA: ${c.partita_iva}`}{c.partita_iva&&c.codice_fiscale&&' · '}{c.codice_fiscale&&`C.F.: ${c.codice_fiscale}`}</div>
                  </div>
                ))}
              </div>
              {selectedCliente&&<div style={{marginTop:'1rem',padding:'.75rem',background:'rgba(52,194,122,.1)',borderRadius:8,border:'1px solid rgba(52,194,122,.3)'}}><div style={{fontSize:'.75rem',color:'var(--gr)',fontWeight:600}}>Selezionato:</div><div style={{fontWeight:600}}>{selectedCliente.ragione_sociale||`${selectedCliente.nome} ${selectedCliente.cognome}`}</div></div>}
            </>
          ):(
            <div className="form-grid">
              <div className="fg full"><label>Denominazione *</label><input value={formData.denominazione} onChange={e=>setFormData(p=>({...p,denominazione:e.target.value}))}/></div>
              <div className="fg"><label>P.IVA</label><input value={formData.partita_iva} onChange={e=>setFormData(p=>({...p,partita_iva:e.target.value}))} maxLength={11}/></div>
              <div className="fg"><label>Codice Fiscale</label><input value={formData.codice_fiscale} onChange={e=>setFormData(p=>({...p,codice_fiscale:e.target.value.toUpperCase()}))} maxLength={16}/></div>
              <div className="fg full"><label>Indirizzo</label><input value={formData.indirizzo} onChange={e=>setFormData(p=>({...p,indirizzo:e.target.value}))}/></div>
              <div className="fg"><label>CAP</label><input value={formData.cap} onChange={e=>setFormData(p=>({...p,cap:e.target.value}))} maxLength={5}/></div>
              <div className="fg"><label>Città</label><input value={formData.citta} onChange={e=>setFormData(p=>({...p,citta:e.target.value}))}/></div>
              <div className="fg"><label>Provincia</label><input value={formData.provincia} onChange={e=>setFormData(p=>({...p,provincia:e.target.value.toUpperCase()}))} maxLength={2}/></div>
              <div className="fg"><label>Regime Contabile</label><select value={formData.regime_contabile} onChange={e=>setFormData(p=>({...p,regime_contabile:e.target.value}))}><option value="ordinario">Ordinario</option><option value="semplificato">Semplificato</option><option value="forfettario">Forfettario</option></select></div>
              <div className="fg"><label>Liquidazione IVA</label><select value={formData.tipo_liquidazione_iva} onChange={e=>setFormData(p=>({...p,tipo_liquidazione_iva:e.target.value}))}><option value="mensile">Mensile</option><option value="trimestrale">Trimestrale</option></select></div>
            </div>
          )}

          {/* Sezione duplicazione â€” comune a entrambe le modalitÃ  */}
          {renderDuplicaSection()}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          {mode==='select'
            ?<button className="btn" onClick={handleSelectCliente} disabled={saving||!selectedCliente}>{saving?'Salvo...':'Crea società'}</button>
            :<button className="btn" onClick={handleSaveManual} disabled={saving||!formData.denominazione}>{saving?'Salvo...':'Crea società'}</button>
          }
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ MODAL IMPORT PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ BROWSER-SIDE PDF TEXT EXTRACTION + DETERMINISTIC PARSER â”€â”€â”€
// Piano dei conti: parsed entirely in the browser, zero API calls

// â”€â”€â”€ DETERMINISTIC PARSER: PIANO CONTI DA EXCEL NES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Formato colonne Excel NES: Codice, Descrizione, Mastro, Mastrino, Conto, Sottoconto, ...Tipo, Natura conto
// Questo parser Ã¨ deterministico al 100%: legge le colonne direttamente, niente regex su testo
function parsePianoContiFromExcel(workbook){
  const XLSX = window._XLSX; // SheetJS giÃ  caricato
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  if(!rows.length) return [];

  const accounts = [];
  const seen = new Set();

  for(let i=1; i<rows.length; i++){
    const r = rows[i];
    if(!r || !r[2]) continue; // mastro obbligatorio

    const mastro    = String(r[2]).trim();
    const mastrino  = r[3]!=null ? String(r[3]).trim().padStart(2,'0') : null;
    const conto     = r[4]!=null ? String(r[4]).trim().padStart(2,'0') : null;
    const sottoconto= r[5]!=null ? String(r[5]).trim().padStart(4,'0') : null;
    const descrizione = r[1] ? String(r[1]).trim() : null;
    if(!descrizione) continue;

    let codice, level;
    if(mastro && !mastrino)                           { codice=mastro;                                    level=1; }
    else if(mastro && mastrino && !conto)             { codice=`${mastro} ${mastrino}`;                   level=2; }
    else if(mastro && mastrino && conto && !sottoconto){ codice=`${mastro} ${mastrino} ${conto}`;         level=3; }
    else if(sottoconto)                               { codice=`${mastro} ${mastrino} ${conto} ${sottoconto}`; level=4; }
    else continue;

    codice = codice.trim();
    if(seen.has(codice)) continue;
    seen.add(codice);

    const tipoExcel  = r[7] ? String(r[7]).toLowerCase() : '';
    const naturaExcel= r[8] ? String(r[8]).toLowerCase() : '';
    const tipoSogg   = r[12]? String(r[12]).toLowerCase(): '';

    const fd = parseInt(mastro);
    let tipo='patrimoniale', natura='attivo', sezione='dare';
    if(tipoExcel.includes('economic'))    { tipo='economico'; }
    if(naturaExcel.includes('passiv'))    { natura='passivo'; sezione='avere'; }
    else if(naturaExcel.includes('ricav')){ natura='ricavo';  sezione='avere'; tipo='economico'; }
    else if(naturaExcel.includes('cost')) { natura='costo';   sezione='dare';  tipo='economico'; }
    else if(fd===1)                       { natura='attivo';  sezione='dare'; }
    else if(fd===2)                       { natura='passivo'; sezione='avere'; }
    else if(fd===3)                       { natura='ricavo';  sezione='avere'; tipo='economico'; }
    else if(fd<=5)                        { natura='costo';   sezione='dare';  tipo='economico'; }
    else                                  { natura='ordine';  tipo='ordine'; }

    const du = descrizione.toUpperCase();
    const is_cliente   = /^1 02 (10|15|20)/.test(codice) && level===4;
    const is_forn_it   = /^2 03 (07|08)/.test(codice) && level===4;
    const is_forn_ext  = /^2 03 09/.test(codice) && level===4;
    const is_prof      = /^2 03 10/.test(codice) && level===4 || tipoSogg.includes('profes');
    const is_fornitore = is_forn_it || is_forn_ext || is_prof;
    const is_banca     = /^1 02 60/.test(codice) && level===4 && /BANCA|C\/C|CRED.*COOPER|CREDEM|POSTA\s+C\/C/i.test(du);
    const is_cassa     = /^1 02 60/.test(codice) && level===4 && /CASSA\s+(CONTANTI|ASSEGNI|VALORI)/i.test(du);

    let anagrafica_tipo = null;
    if(is_prof)                                          anagrafica_tipo='professionista';
    else if(is_cliente && codice.startsWith('1 02 10'))  anagrafica_tipo='cliente_estero';
    else if(is_cliente)                                  anagrafica_tipo='cliente_italia';
    else if(is_forn_ext)                                 anagrafica_tipo='fornitore_estero';
    else if(is_forn_it)                                  anagrafica_tipo='fornitore_italia';

    const parts = codice.split(' ');
    accounts.push({
      codice,
      codice_mastro: parts[0]||null,
      codice_conto: level>=3 ? `${parts[0]} ${parts[1]} ${parts[2]}` : null,
      codice_sottoconto: level>=4 ? codice : null,
      descrizione, tipo, natura, sezione, livello: level,
      is_cliente:!!is_cliente, is_fornitore:!!is_fornitore,
      is_banca:!!is_banca, is_cassa:!!is_cassa,
      is_iva: /IVA\s+(NS|CREDITO|DEBITO|SOSPESO|VENDITE)/i.test(du),
      anagrafica_tipo, attivo: true
    });
  }
  return accounts;
}

function parsePianoContiFromText(text){
  // Il testo da pdfjs browser arriva senza newline tra i record â€” tutto su una riga.
  // Formato: "1 ATTIVITA'1 CREDITI V/SOCI001 SOCI C/SOTTOSCRIZIONE00 01..."
  // Strategia: inserisce \n prima di ogni "cifra_singola SPAZIO LETTERA_MAIUSCOLA"
  // preceduto da un carattere non-spazio (fine del codice/descrizione precedente)

  // Split per record: inserisce newline prima di ogni inizio record
  // FIX: rimuove timestamp pdfjs iniettati (es "20/03/2026 00:11:45"), poi
  // splitta SOLO quando preceduto da cifra o spazio â€” non da lettera/apostrofo
  // In questo modo "PASSIVITA'2 PASSIVO..." non genera uno split errato su '2
  const normalized = text
    .replace(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/g, ' ')
    .replace(/(?<=[\d\s])([1-9] [A-Z])/g, '\n$1');

  const lines = normalized.split('\n');
  const accounts = [];
  const skip = [/stampa piano/i, /codice.*descrizione/i, /pagina\s+\d+/i,
                /^\d{2}\/\d{2}\/\d{4}/, /^\s*$/, /^19NOVANTA/i,
                /^\d{2}:\d{2}:\d{2}$/, /^\d+$/ // FIX: salta timestamp isolati e numeri puri
                ];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (skip.some(p => p.test(line))) continue;

    const mBase = line.match(/^(\d)\s+(.+)$/);
    if (!mBase) continue;
    const mastro = mBase[1];
    const rest = mBase[2];
    let desc = '', codice = '', level = 1;

    // Cerca coda numerica alla FINE: "DESC[NN NN NNNN]" o "DESC[NN NN]" o "DESC[NN]"
    const m4 = rest.match(/^(.*\S)\s*(\d{2})\s(\d{2})\s(\d{4})$/);
    const m3 = !m4 && rest.match(/^(.*\S)\s*(\d{2})\s(\d{2})$/);
    const m2 = !m4 && !m3 && rest.match(/^(.*\S)\s*(\d{2})$/);

    if (m4)      { codice=`${mastro} ${m4[2]} ${m4[3]} ${m4[4]}`; desc=m4[1].trim(); level=4; }
    else if (m3) { codice=`${mastro} ${m3[2]} ${m3[3]}`;           desc=m3[1].trim(); level=3; }
    else if (m2) { codice=`${mastro} ${m2[2]}`;                    desc=m2[1].trim(); level=2; }
    else         { codice=mastro;                                   desc=rest.trim();  level=1; }

    if (!desc || /^\d+$/.test(desc)) continue;

    const parts = codice.trim().split(' ');
    const fd = parseInt(mastro);
    let tipo='patrimoniale', natura='attivo', sezione='dare';
    if (fd===1)      { natura='attivo';  sezione='dare';  }
    else if (fd===2) { natura='passivo'; sezione='avere'; }
    else if (fd===3) { natura='ricavo';  tipo='economico'; sezione='avere'; }
    else if (fd<=5)  { natura='costo';   tipo='economico'; sezione='dare';  }
    else             { natura='ordine';  tipo='ordine'; }

    const du = desc.toUpperCase();
    const is_cliente   = /^1 02 (10|15|20)/.test(codice) && level===4;
    const is_forn_it   = /^2 03 (07|08)/.test(codice) && level===4;
    const is_forn_ext  = /^2 03 09/.test(codice) && level===4;
    const is_prof      = /^2 03 10/.test(codice) && level===4;
    const is_fornitore = is_forn_it || is_forn_ext || is_prof;
    const is_banca     = /^1 02 60/.test(codice) && level===4 && /BANCA|C\/C|CRED.*COOPER|CREDEM|POSTA\s+C\/C/i.test(du);
    const is_cassa     = /^1 02 60/.test(codice) && level===4 && /CASSA\s+(CONTANTI|ASSEGNI|VALORI)/i.test(du);

    let anagrafica_tipo = null;
    if (is_prof)                              anagrafica_tipo = 'professionista';
    else if (is_cliente && codice.startsWith('1 02 10')) anagrafica_tipo = 'cliente_estero';
    else if (is_cliente)                      anagrafica_tipo = 'cliente_italia';
    else if (is_forn_ext)                     anagrafica_tipo = 'fornitore_estero';
    else if (is_forn_it)                      anagrafica_tipo = 'fornitore_italia';

    accounts.push({
      codice: codice.trim(),
      codice_mastro: parts[0] || null,
      codice_conto: level>=3 ? `${parts[0]} ${parts[1]} ${parts[2]}` : null,
      codice_sottoconto: level>=4 ? codice.trim() : null,
      descrizione: desc, tipo, natura, sezione, livello: level,
      is_cliente: !!is_cliente, is_fornitore: !!is_fornitore,
      is_banca: !!is_banca, is_cassa: !!is_cassa,
      is_iva: /IVA\s+(NS|CREDITO|DEBITO|SOSPESO|VENDITE)/i.test(du),
      anagrafica_tipo, attivo: true
    });
  }

  // Deduplicazione finale
  const seen = new Set();
  return accounts.filter(a => {
    if (seen.has(a.codice)) return false;
    seen.add(a.codice); return true;
  });
}

// â”€â”€â”€ DETERMINISTIC PARSER: CAUSALI IVA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Format: "A1 - IMPONIBILE 20%", "A17W - 22% AUTOF. ART.17 C.3 633/72", etc.
function parseCausaliIvaFromText(text){
  const lines=text.split('\n');
  const items=[];
  const skip=[/causali\s+iva/i,/codice.*descrizione/i,/pagina\s+\d+/i,/^\d{2}\/\d{2}\/\d{4}/,/^\s*$/,/stampa/i];
  
  for(const line of lines){
    const trimmed=line.trim();
    if(!trimmed)continue;
    if(skip.some(p=>p.test(trimmed)))continue;
    
    // Pattern: CODE - DESCRIPTION (or CODE  DESCRIPTION with multiple spaces)
    let m=trimmed.match(/^([A-Z0-9]{1,10})\s+[-â€“]\s+(.+)$/i);
    if(!m)m=trimmed.match(/^([A-Z0-9]{1,10})\s{2,}(.+)$/i);
    if(!m)continue;
    
    const codice=m[1].trim().toUpperCase();
    const descrizione=m[2].trim();
    
    // Skip if codice looks like a page number or date
    if(/^\d{1,2}$/.test(codice)&&parseInt(codice)>31)continue;
    
    // Extract aliquota from description (e.g., "IMPONIBILE 20%", "22% AUTOF...")
    let aliquota=0;
    const aliqMatch=descrizione.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    if(aliqMatch)aliquota=parseFloat(aliqMatch[1].replace(',','.'))||0;
    
    // Determine tipo from description
    let tipo='imponibile';
    const du=descrizione.toUpperCase();
    if(/NON\s*IMP|ART\s*\.?\s*8|ESPORTAZ/i.test(du))tipo='non_imponibile';
    else if(/ESENT|ART\s*\.?\s*10/i.test(du))tipo='esente';
    else if(/ESCLU|ART\s*\.?\s*15|FUORI\s*CAMPO/i.test(du))tipo='escluso';
    
    // Determine regime
    let regime='normale';
    if(/INTRA|CEE|REVERSE|REV\.?\s*CHARGE|AUTOFATT/i.test(du))regime='acquisto_cee';
    
    // DetraibilitÃ 
    let detraibile=true;
    let percentuale_detraibilita=100;
    if(/INDETR|NON\s*DETR|0\s*%\s*DET/i.test(du)){detraibile=false;percentuale_detraibilita=0;}
    else if(/50\s*%\s*DET|PARZ/i.test(du)){percentuale_detraibilita=50;}
    
    // Codice natura FE (for non-imponibili, esenti, esclusi)
    let codice_natura_fe=null;
    if(tipo==='escluso')codice_natura_fe='N1';
    else if(tipo==='non_imponibile')codice_natura_fe='N3';
    else if(tipo==='esente')codice_natura_fe='N4';
    
    items.push({
      codice,descrizione,aliquota,tipo,regime,detraibile,
      percentuale_detraibilita,codice_natura_fe,
      include_liquidazione:true,include_dichiarazione:true,attivo:true
    });
  }
  return items;
}

// â”€â”€â”€ DETERMINISTIC PARSER: CAUSALI CONTABILI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Format: "VEN - Vendita merce", "ACQ - Acquisto merce", etc.
function parseCausaliContabiliFromText(text){
  const lines=text.split('\n');
  const items=[];
  const skip=[/causali\s+contab/i,/codice.*descrizione/i,/pagina\s+\d+/i,/^\d{2}\/\d{2}\/\d{4}/,/^\s*$/,/stampa/i];
  
  for(const line of lines){
    const trimmed=line.trim();
    if(!trimmed)continue;
    if(skip.some(p=>p.test(trimmed)))continue;
    
    // Pattern: CODE - DESCRIPTION or CODE  DESCRIPTION
    let m=trimmed.match(/^([A-Z0-9]{1,10})\s+[-â€“]\s+(.+)$/i);
    if(!m)m=trimmed.match(/^([A-Z0-9]{1,10})\s{2,}(.+)$/i);
    if(!m)continue;
    
    const codice=m[1].trim().toUpperCase();
    const descrizione=m[2].trim();
    if(/^\d{1,2}$/.test(codice)&&parseInt(codice)>31)continue;
    
    // Determine tipo from description
    let tipo='generico';
    const du=descrizione.toUpperCase();
    if(/VENDITA|CESSIONE|FATTURA\s*ATT/i.test(du))tipo='vendite';
    else if(/ACQUIST|FATTURA\s*PASS/i.test(du))tipo='acquisti';
    else if(/PAGA|INCASSO|BANCA|CASSA/i.test(du))tipo='finanziario';
    else if(/GIRO|RETTIFIC|STORNO/i.test(du))tipo='rettifica';
    else if(/STIPEND|SALARI|PERSON/i.test(du))tipo='personale';
    else if(/AMMORT/i.test(du))tipo='ammortamento';
    
    items.push({codice,descrizione,tipo,attivo:true});
  }
  return items;
}


// â”€â”€â”€ DETERMINISTIC PARSER: CAUSALI CONTABILI DA EXCEL NES â”€â”€â”€â”€â”€
// Colonne: 0=Codice, 1=Descrizione, 2=Descr.tabulati, 3=Tipo causale, 6=Cod.registro IVA
function parseCausaliContabiliFromExcel(workbook){
  const XLSX = window._XLSX;
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const items = []; const seen = new Set();
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    const codice=(r[0]||'').toString().trim().toUpperCase();
    const descrizione=(r[1]||'').toString().trim();
    if(!codice||!descrizione)continue;
    if(seen.has(codice))continue; seen.add(codice);
    const disattivato=(r[27]||'').toString().trim().toUpperCase()==='T';
    if(disattivato)continue;
    const tipoRaw=(r[3]||'').toString().toLowerCase();
    let tipo='generico';
    if(/vendita|cessione|fattura.att/i.test(tipoRaw)||/fattura.att/i.test(descrizione))tipo='vendite';
    else if(/acquist|fattura.pass/i.test(tipoRaw)||/acquist/i.test(descrizione))tipo='acquisti';
    else if(/paga|incasso|banca|cassa/i.test(descrizione))tipo='finanziario';
    else if(/giro|rettific|storno/i.test(descrizione))tipo='rettifica';
    else if(/stipend|salari|person/i.test(descrizione))tipo='personale';
    else if(/ammort/i.test(descrizione))tipo='ammortamento';
    else if(/autofattura/i.test(tipoRaw))tipo='acquisti';
    const codice_registro_iva=(r[6]||null)?.toString().trim()||null;
    items.push({codice, descrizione, tipo, codice_registro_iva, attivo:true});
  }
  return items;
}


// â”€â”€â”€ DETERMINISTIC PARSER: CAUSALI IVA DA EXCEL NES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Colonne: 0=Codice, 1=Descrizione, 2=%imposta, 3=Operazione, 7=Detraibile, 8=%indetraibilitÃ 
function parseCausaliIvaFromExcel(workbook){
  const XLSX = window._XLSX;
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const items = []; const seen = new Set();
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    const codice=(r[0]||'').toString().trim().toUpperCase();
    const descrizione=(r[1]||'').toString().trim();
    if(!codice||!descrizione)continue;
    if(seen.has(codice))continue; seen.add(codice);
    const aliquota=parseFloat(r[2])||0;
    const operazione=(r[3]||'').toString().toLowerCase();
    const detraibileRaw=(r[7]||'').toString().trim().toUpperCase();
    const percIndetr=parseFloat(r[8])||0;
    const detraibile=detraibileRaw==='T';
    const percentuale_detraibilita=detraibile?(100-percIndetr):0;
    let tipo='imponibile';
    if(/non.imp|esportaz/i.test(operazione)||/non.imp/i.test(descrizione))tipo='non_imponibile';
    else if(/esent/i.test(operazione)||/esent/i.test(descrizione))tipo='esente';
    else if(/esclu|fuori.campo/i.test(operazione)||/esclu/i.test(descrizione))tipo='escluso';
    let regime='normale';
    if(/intra|cee/i.test(descrizione))regime='acquisto_cee';
    else if(/reverse|autof/i.test(descrizione))regime='reverse_charge';
    let codice_natura_fe=null;
    if(tipo==='escluso')codice_natura_fe='N1';
    else if(tipo==='non_imponibile')codice_natura_fe='N3';
    else if(tipo==='esente')codice_natura_fe='N4';
    // natura IVA PA col 44
    const naturaPa=(r[44]||'').toString().trim()||null;
    if(naturaPa)codice_natura_fe=naturaPa;
    items.push({
      codice, descrizione, aliquota, tipo, regime,
      detraibile, percentuale_detraibilita, codice_natura_fe,
      include_liquidazione:true, include_dichiarazione:true, attivo:true
    });
  }
  return items;
}

function ModalImportPDF({tipo,societaId,onComplete,onClose}){
  const [file,setFile]=useState(null);
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState('');
  const [result,setResult]=useState(null); // {records, nuovi, duplicati, aggiornati}
  const [error,setError]=useState(null);
  const [drag,setDrag]=useState(false);
  const fileRef=useRef();
  const ai=useAIStatus();

  const tipi={
    piano_conti:{title:'Piano dei Conti',icon:'PC',table:'piano_conti',keyField:'codice'},
    causali:{title:'Causali Contabili',icon:'CC',table:'causali_contabili',keyField:'codice'},
    causali_iva:{title:'Causali IVA',icon:'IVA',table:'causali_iva',keyField:'codice'}
  };
  const cfg=tipi[tipo];

  const handleFile=(f)=>{if(f&&(f.type==='application/pdf'||f.name?.endsWith('.xlsx')||f.name?.endsWith('.xls'))){setFile(f);setResult(null);setError(null);}};

  const handleUpload=async()=>{
    if(!file)return;
    setLoading(true);setError(null);
    ai.setAI('processing','Import '+cfg.title,'local');
    try{
      // BRANCH EXCEL: se file Ã¨ xlsx, usa parser Excel diretto (solo piano_conti)
      if(tipo==='piano_conti'&&(file.name?.endsWith('.xlsx')||file.name?.endsWith('.xls'))){
        setProgress('Caricamento Excel...');
        // Carica SheetJS se non giÃ  presente
        if(!window._XLSX){
          await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>{window._XLSX=window.XLSX;res();};s.onerror=rej;document.head.appendChild(s);});
        }
        const ab=await file.arrayBuffer();
        const wb=window._XLSX.read(ab,{type:'array'});
        setProgress('Parsing Excel...');
        const parsed=parsePianoContiFromExcel(wb);
        if(!parsed.length)throw new Error('Nessun conto trovato nel file Excel.');
        setProgress('Controllo duplicati...');
        const{data:esistenti}=await contabilitaRepo.getCodiciEsistenti(cfg.table, societaId);
        const esistentiSet=new Set((esistenti||[]).map(r=>r.codice?.toString().trim()));
        const nuovi=parsed.filter(r=>!esistentiSet.has(r.codice?.toString().trim()));
        const duplicati=parsed.filter(r=>esistentiSet.has(r.codice?.toString().trim()));
        const stats={
          mastri:nuovi.filter(i=>i.livello===1).length,
          gruppi:nuovi.filter(i=>i.livello===2).length,
          conti:nuovi.filter(i=>i.livello===3).length,
          sottoconti:nuovi.filter(i=>i.livello===4).length,
          clienti:nuovi.filter(i=>i.is_cliente).length,
          fornitori:nuovi.filter(i=>i.is_fornitore).length,
          banche:nuovi.filter(i=>i.is_banca).length,
        };
        setResult({parsed,nuovi,duplicati,stats,method:'excel'});
        setLoading(false);setProgress('');
        ai.setAI('done','Import '+cfg.title,'local');
        return;
      }
      // BRANCH EXCEL causali contabili e IVA
      if((tipo==='causali'||tipo==='causali_iva')&&(file.name?.endsWith('.xlsx')||file.name?.endsWith('.xls'))){
        setProgress('Caricamento Excel...');
        if(!window._XLSX){
          await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>{window._XLSX=window.XLSX;res();};s.onerror=rej;document.head.appendChild(s);});
        }
        const ab=await file.arrayBuffer();
        const wb=window._XLSX.read(ab,{type:'array'});
        setProgress('Parsing Excel...');
        const parsed=tipo==='causali_iva'?parseCausaliIvaFromExcel(wb):parseCausaliContabiliFromExcel(wb);
        if(!parsed.length)throw new Error('Nessuna causale trovata nel file Excel.');
        setProgress('Controllo duplicati...');
        const{data:esistenti}=await contabilitaRepo.getCodiciEsistenti(cfg.table, societaId);
        const esistentiSet=new Set((esistenti||[]).map(r=>r.codice?.toString().trim()));
        const nuovi=parsed.filter(r=>!esistentiSet.has(r.codice?.toString().trim()));
        const duplicati=parsed.filter(r=>esistentiSet.has(r.codice?.toString().trim()));
        setResult({parsed,nuovi,duplicati,stats:null,method:'excel'});
        setLoading(false);setProgress('');
        ai.setAI('done','Import '+cfg.title,'local');
        return;
      }
      // 1. Estrai testo nel browser (leggero, zero costi) â€” BRANCH PDF
      setProgress('Estrazione testo dal PDF...');
      const text=await extractTextFromPDFBrowser(file);
      console.log('TESTO ESTRATTO lunghezza:', text?.length, 'chars');
      console.log('PRIME 500 CHARS:', JSON.stringify(text?.substring(0,500)));
      if(!text||text.trim().length<20)throw new Error('Impossibile estrarre testo dal PDF.');

      // 2. Parsing locale deterministico
      setProgress('Parsing struttura...');
      let parsed=[];
      if(tipo==='piano_conti') parsed=parsePianoContiFromText(text);
      else if(tipo==='causali_iva') parsed=parseCausaliIvaFromText(text);
      else parsed=parseCausaliContabiliFromText(text);
      console.log('PARSED:', parsed.length, 'conti');

      if(!parsed.length)throw new Error('Nessun record trovato. Verifica il formato del PDF (NES, BLUENEXT, PROFIS).');

      // 4. Controllo doppioni
      setProgress('Controllo duplicati...');
      const {data:esistenti}=await contabilitaRepo.getCodiciEsistenti(cfg.table, societaId);
      const esistentiSet=new Set((esistenti||[]).map(r=>r.codice?.toString().trim()));
      const nuovi=parsed.filter(r=>!esistentiSet.has(r.codice?.toString().trim()));
      const duplicati=parsed.filter(r=>esistentiSet.has(r.codice?.toString().trim()));

      const stats=tipo==='piano_conti'?{
        mastri:nuovi.filter(i=>i.livello===1).length,
        gruppi:nuovi.filter(i=>i.livello===2).length,
        conti:nuovi.filter(i=>i.livello===3).length,
        sottoconti:nuovi.filter(i=>i.livello===4).length,
        clienti:nuovi.filter(i=>i.is_cliente).length,
        fornitori:nuovi.filter(i=>i.is_fornitore).length,
        banche:nuovi.filter(i=>i.is_banca).length,
      }:null;

      setResult({parsed,nuovi,duplicati,stats});
    }catch(e){setError(e.message);}
    finally{setLoading(false);setProgress('');ai.setAI('done','Import '+cfg.title,'local');}
  };

  const handleImport=async(soloNuovi=true)=>{
    if(!result)return;
    const toImport=soloNuovi?result.nuovi:result.parsed;
    if(!toImport.length){alert('Nessun record da importare.');return;}
    setLoading(true);setError(null);
    try{
      // Deduplica per codice prima di inviare (evita ON CONFLICT su stesso batch)
      const seen=new Set();
      const records=toImport
        .map(r=>({...r,societa_id:societaId}))
        .filter(r=>{
          const key=r.codice?.toString().trim();
          if(seen.has(key))return false;
          seen.add(key);return true;
        });
      const BATCH=500;
      for(let i=0;i<records.length;i+=BATCH){
        setProgress(`Inserimento ${Math.min(i+BATCH,records.length)}/${records.length}...`);
        const{error:err}=await contabilitaRepo.upsertBatch(cfg.table, records.slice(i,i+BATCH));
        if(err)throw err;
      }
      setProgress('');onComplete();
    }catch(e){setError(e.message);}
    finally{setLoading(false);setProgress('');}
  };

  const handleRetryAI=async()=>{
    if(!file)return;
    setLoading(true);setError(null);
    ai.setAI('processing','Import AI '+cfg.title,'ai');
    try{
      setProgress('Analisi AI in corso...');
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});
      const apiTipo=tipo==='causali'?'causali_contabili':tipo;
      const resp=await fetch('/api/document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdf:base64,tipo:apiTipo})});
      if(!resp.ok){const d=await resp.json();throw new Error(d.error||'Errore AI');}
      const data=await resp.json();
      if(!data.records?.length)throw new Error('AI non ha trovato risultati.');

      // controllo doppioni anche per AI
      const{data:esistenti}=await contabilitaRepo.getCodiciEsistenti(cfg.table, societaId);
      const esistentiSet=new Set((esistenti||[]).map(r=>r.codice?.toString().trim()));
      const nuovi=data.records.filter(r=>!esistentiSet.has(r.codice?.toString().trim()));
      const duplicati=data.records.filter(r=>esistentiSet.has(r.codice?.toString().trim()));
      setResult({parsed:data.records,nuovi,duplicati,stats:null,method:'ai'});
    }catch(e){setError(e.message);}
    finally{setLoading(false);setProgress('');ai.setAI('done','Import AI','ai');}
  };

  const s=result?.stats;

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:640}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">{cfg.icon} Import {cfg.title}</div>
          <div className="modal-sub">PDF o Excel NES · parsing locale · zero costi AI</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {!result?(
            <>
              <div className={'upload-zone'+(drag?' drag':'')}
                style={{marginBottom:'1rem'}}
                onDragOver={e=>{e.preventDefault();setDrag(true);}}
                onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}}
                onClick={()=>fileRef.current.click()}>
                <input ref={fileRef} type="file" accept='.pdf,.xlsx,.xls' hidden onChange={e=>handleFile(e.target.files[0])}/>
                <div className="upload-zone-ico">File</div>
                <div className="upload-zone-t">{file?file.name:'Trascina PDF qui o clicca'}</div>
                <div className="upload-zone-s">NES · BLUENEXT · PROFIS e altri formati contabili</div>
              </div>
              {progress&&<div style={{textAlign:'center',color:'var(--gold)',fontSize:'.8rem',padding:'.5rem'}}>{progress}</div>}
              {error&&<div className="alert alert-err">{error}</div>}
            </>
          ):(
            <div>
              {/* â”€â”€ RIEPILOGO â”€â”€ */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.65rem',marginBottom:'1rem'}}>
                <div style={{background:'rgba(52,194,122,.08)',border:'1px solid rgba(52,194,122,.25)',borderRadius:10,padding:'.85rem 1rem',textAlign:'center'}}>
                  <div style={{fontSize:'1.6rem',fontWeight:700,color:'var(--gr)'}}>{result.nuovi.length}</div>
                  <div style={{fontSize:'.72rem',color:'var(--gr)',fontWeight:600}}>Nuovi da importare</div>
                </div>
                <div style={{background:'rgba(200,164,94,.08)',border:'1px solid rgba(200,164,94,.25)',borderRadius:10,padding:'.85rem 1rem',textAlign:'center'}}>
                  <div style={{fontSize:'1.6rem',fontWeight:700,color:'var(--gold)'}}>{result.duplicati.length}</div>
                  <div style={{fontSize:'.72rem',color:'var(--gold)',fontWeight:600}}>Già presenti (skip)</div>
                </div>
              </div>

              {/* â”€â”€ STATS PIANO CONTI â”€â”€ */}
              {s&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:'.4rem',marginBottom:'1rem'}}>
                  {[['Mastri',s.mastri,'var(--gold)'],['Gruppi',s.gruppi,'var(--pu)'],['Conti',s.conti,'var(--cy)'],['Sottoconti',s.sottoconti,'var(--tx)'],['Clienti',s.clienti,'var(--gr)'],['Fornitori',s.fornitori,'var(--gold)'],['Banche',s.banche,'#60a5fa']].filter(([,v])=>v>0).map(([l,v,c])=>(
                    <div key={l} style={{background:'var(--s2)',borderRadius:8,padding:'.4rem .7rem',textAlign:'center',minWidth:60}}>
                      <div style={{fontSize:'1rem',fontWeight:700,color:c}}>{v}</div>
                      <div style={{fontSize:'.6rem',color:'var(--mu)'}}>{l}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* â”€â”€ ANTEPRIMA NUOVI â”€â”€ */}
              {result.nuovi.length>0&&(
                <div style={{marginBottom:'1rem'}}>
                  <div style={{fontSize:'.68rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',marginBottom:'.4rem'}}>Anteprima nuovi ({Math.min(result.nuovi.length,8)} di {result.nuovi.length})</div>
                  <div style={{background:'var(--s2)',borderRadius:8,maxHeight:160,overflowY:'auto'}}>
                    {result.nuovi.slice(0,8).map((r,i)=>(
                      <div key={i} style={{padding:'.35rem .65rem',borderBottom:'1px solid rgba(33,40,58,.4)',fontSize:'.78rem',display:'flex',gap:'.5rem',alignItems:'center'}}>
                        <code style={{color:'var(--gold)',fontSize:'.72rem',minWidth:70}}>{r.codice}</code>
                        <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.descrizione}</span>
                        {r.aliquota!=null&&<span className="bdg bdg-blue" style={{fontSize:'.55rem'}}>{r.aliquota}%</span>}
                        {r.is_cliente&&<span className="bdg bdg-green" style={{fontSize:'.55rem'}}>C</span>}
                        {r.is_fornitore&&<span className="bdg bdg-gold" style={{fontSize:'.55rem'}}>F</span>}
                        {r.is_banca&&<span className="bdg bdg-blue" style={{fontSize:'.55rem'}}>B</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* â”€â”€ DUPLICATI â”€â”€ */}
              {result.duplicati.length>0&&(
                <div className="alert alert-warn" style={{marginBottom:'1rem'}}>
                  <strong>{result.duplicati.length} codici già presenti</strong> verranno saltati automaticamente.
                  {result.duplicati.length<=5&&<span style={{opacity:.7}}> ({result.duplicati.map(d=>d.codice).join(', ')})</span>}
                </div>
              )}

              {progress&&<div style={{textAlign:'center',color:'var(--gold)',fontSize:'.8rem',padding:'.4rem'}}>{progress}</div>}
              {error&&<div className="alert alert-err">{error}</div>}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn-sec" onClick={()=>result?((setResult(null)||true)&&setError(null)):onClose()}>
            {result?'← Ricarica':'Annulla'}
          </button>
          {!result?(
            <button className="btn" onClick={handleUpload} disabled={!file||loading}>
              {loading?`${progress||'Analisi...'}`:'Analizza PDF'}
            </button>
          ):(
            <div style={{display:'flex',gap:'.5rem'}}>
              {tipo!=='piano_conti'&&(
                <button className="btn-sec" onClick={handleRetryAI} disabled={loading} title="Riprova con AI">
                  AI
                </button>
              )}
              {result.nuovi.length===0?(
                <button className="btn" disabled style={{opacity:.5}}>Nessun nuovo da importare</button>
              ):(
                <button className="btn" onClick={()=>handleImport(true)} disabled={loading}>
                  {loading?`${progress}`:`Importa ${result.nuovi.length} nuovi`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export { ModalNuovaSocieta }



