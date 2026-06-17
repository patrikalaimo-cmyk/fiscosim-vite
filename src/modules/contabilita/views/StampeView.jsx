import { useState, Fragment } from 'react'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { buildRegistroIvaRowsModel } from '../application/stampe/buildRegistroIvaRowsModel.js'
import { buildLibroGiornaleModel } from '../application/stampe/buildLibroGiornaleModel.js'

const fmt = (n) => n != null ? Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('it-IT') : '—';

export default function StampeView({ contTab, societaAttiva, scritture, pianoConti, causaliIva }) {
  if (!societaAttiva) return null
  if (!['registri_iva', 'partitari', 'giornale', 'mastrini', 'bilancio'].includes(contTab)) return null
  return (
    <StampeDetailView
      tipoStampa={contTab}
      societa={societaAttiva}
      scritture={scritture}
      pianoConti={pianoConti}
      causaliIva={causaliIva}
    />
  )
}

function StampeDetailView({tipoStampa,societa,scritture,pianoConti,causaliIva}){
  const [loading,setLoading]=useState(false);
  const [periodoInizio,setPeriodoInizio]=useState(new Date().getFullYear()+'-01-01');
  const [periodoFine,setPeriodoFine]=useState(new Date().toISOString().split('T')[0]);
  const [selectedConto,setSelectedConto]=useState('');
  const [registroTipo,setRegistroTipo]=useState('vendite');
  const [partitarioTipo,setPartitarioTipo]=useState('clienti');
  const [situazioneTipo,setSituazioneTipo]=useState('patrimoniale');
  const [previewHtml,setPreviewHtml]=useState('');
  const [registroModel,setRegistroModel]=useState(null);
  const [giornaleModel,setGiornaleModel]=useState(null);
  const [error,setError]=useState('');

  const titoli={
    registri_iva:'📖 Registri IVA',
    partitari:'💳 Partitari Clienti/Fornitori',
    giornale:'📰 Giornale Contabile',
    mastrini:'📚 Mastrini',
    bilancio:'⚖️ Bilancio di Verifica'
  };

  const generaStampa=async()=>{
    setLoading(true);
    setError('');
    setPreviewHtml('');
    setRegistroModel(null);
    setGiornaleModel(null);
    
    try{
      if(tipoStampa==='registri_iva'){
        const { data: rawRows, error: fetchError } = await contabilitaRepo.getRegistriIvaPerStampa(societa.id, periodoInizio, periodoFine, registroTipo);
        if(fetchError) throw fetchError;
        
        const model = buildRegistroIvaRowsModel(rawRows);
        if (!model.rows || model.rows.length === 0) {
          setError('Nessuna riga IVA trovata per il periodo selezionato.');
          setLoading(false);
          return;
        }
        setRegistroModel(model);
      }
      else if(tipoStampa==='giornale'){
        const { data: rawEntries, error: fetchError } = await contabilitaRepo.getLibroGiornalePerStampa(societa.id, periodoInizio, periodoFine);
        if(fetchError) throw fetchError;
        
        const model = buildLibroGiornaleModel(rawEntries);
        if (!model.entries || model.entries.length === 0) {
          setError('Nessuna scrittura trovata per il periodo selezionato.');
          setLoading(false);
          return;
        }
        setGiornaleModel(model);
      }
      else if(['partitari', 'mastrini', 'bilancio'].includes(tipoStampa)){
        setError('Funzione in preparazione.');
      }
    }catch(err){
      setError(err.message || String(err));
    }finally{
      setLoading(false);
    }
  };

  const stampaPDF=()=>{
    if(!previewHtml)return;
    const printWindow=window.open('','_blank');
    printWindow.document.write(previewHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(()=>printWindow.print(),250);
  };

  const scaricaHTML=()=>{
    if(!previewHtml)return;
    const blob=new Blob([previewHtml],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`${tipoStampa}_${societa?.denominazione||'stampa'}_${periodoFine}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>{titoli[tipoStampa]||tipoStampa}</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Genera e stampa report contabili ufficiali</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:'1rem',alignItems:'flex-end'}}>
          {/* Periodo */}
          <div className="fg" style={{minWidth:140}}>
            <label>Data inizio</label>
            <input type="date" value={periodoInizio} onChange={e=>setPeriodoInizio(e.target.value)}/>
          </div>
          <div className="fg" style={{minWidth:140}}>
            <label>Data fine</label>
            <input type="date" value={periodoFine} onChange={e=>setPeriodoFine(e.target.value)}/>
          </div>

          {/* Opzioni specifiche per tipo */}
          {tipoStampa==='registri_iva'&&(
            <div className="fg" style={{minWidth:150}}>
              <label>Tipo registro</label>
              <select value={registroTipo} onChange={e=>setRegistroTipo(e.target.value)}>
                <option value="vendite">Vendite</option>
                <option value="acquisti">Acquisti</option>
                <option value="corrispettivi">Corrispettivi</option>
              </select>
            </div>
          )}

          {tipoStampa==='mastrini'&&(
            <div className="fg" style={{minWidth:250}}>
              <label>Conto</label>
              <select value={selectedConto} onChange={e=>setSelectedConto(e.target.value)}>
                <option value="">-- Seleziona conto --</option>
                {pianoConti.map(c=><option key={c.id} value={c.id}>{c.codice} - {c.descrizione}</option>)}
              </select>
            </div>
          )}

          {tipoStampa==='partitari'&&(
            <div className="fg" style={{minWidth:150}}>
              <label>Tipo partitario</label>
              <select value={partitarioTipo} onChange={e=>setPartitarioTipo(e.target.value)}>
                <option value="clienti">Clienti</option>
                <option value="fornitori">Fornitori</option>
              </select>
            </div>
          )}

          <button className="btn" onClick={generaStampa} disabled={loading} style={{marginBottom:'.25rem'}}>
            {loading?'⏳ Generazione...':'📄 Genera Anteprima'}
          </button>
        </div>
      </div>

      {error&&<div className="alert alert-err" style={{marginBottom:'1rem'}}>{error}</div>}

      {/* Anteprima Registri IVA */}
      {registroModel && (
        <div className="card" style={{ marginTop: '1rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>📋 Registro IVA {registroTipo === 'vendite' ? 'Vendite' : registroTipo === 'acquisti' ? 'Acquisti' : 'Corrispettivi'}</span>
              <span className="badge" style={{ background: '#f59e0b', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Anteprima provvisoria</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-sec" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>💾 Salva HTML (Disattivato)</button>
              <button className="btn" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>🖨️ Stampa / PDF (Disattivato)</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem', background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Numero Righe</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{registroModel.rows.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Numero Documenti</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{new Set(registroModel.rows.map(r => r.numero_documento + '_' + r.soggetto_denominazione)).size}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Totale Imponibile</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>€ {fmt(registroModel.totaleImponibile)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Totale Imposta (IVA)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>€ {fmt(registroModel.totaleIva)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Tot. IVA Detraibile</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>€ {fmt(registroModel.totaleDetraibile)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Tot. IVA Indetraibile</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>€ {fmt(registroModel.totaleIndetraibile)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Split Payment</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{registroModel.rows.filter(r => r.split_payment).length > 0 ? 'Sì' : 'No'}</div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem' }}>Prot.</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem' }}>Data Reg.</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem' }}>Data Doc.</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem' }}>N° Doc.</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem' }}>Cliente/Fornitore</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem' }}>Cod. IVA</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem' }}>Imponibile</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem' }}>Imposta</th>
                </tr>
              </thead>
              <tbody>
                {registroModel.rows.map((r, index) => (
                  <tr key={r.id || index} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.progressivoProvvisorio}</td>
                    <td style={{ padding: '0.75rem' }}>{fmtDate(r.data_registrazione)}</td>
                    <td style={{ padding: '0.75rem' }}>{fmtDate(r.data_documento)}</td>
                    <td style={{ padding: '0.75rem' }}>{r.numero_documento}</td>
                    <td style={{ padding: '0.75rem' }}>
                      {r.soggetto_denominazione}
                      {r.soggetto_piva && r.soggetto_piva !== '—' && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--mu)', display: 'block' }}>P.IVA: {r.soggetto_piva}</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}><code>{r.causale_iva_codice}</code></td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.imponibile)}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.iva)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--bg-surface)', fontWeight: 'bold' }}>
                  <td colSpan="6" style={{ padding: '0.75rem', textAlign: 'right' }}>TOTALI</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(registroModel.totaleImponibile)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(registroModel.totaleIva)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: '0.8rem', background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: '6px', borderLeft: '4px solid #f59e0b' }}>
            ℹ️ <strong>Anteprima provvisoria.</strong> I progressivi visualizzati non costituiscono protocollo definitivo.
          </div>
        </div>
      )}

      {/* Anteprima Giornale */}
      {giornaleModel && (
        <div className="card" style={{ marginTop: '1rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyStyle: 'space-between', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>📰 Libro Giornale</span>
              <span className="badge" style={{ background: '#f59e0b', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Anteprima provvisoria</span>
              {Math.abs(giornaleModel.totaleDare - giornaleModel.totaleAvere) < 0.01 ? (
                <span className="badge" style={{ background: '#10b981', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Quadrato</span>
              ) : (
                <span className="badge" style={{ background: '#ef4444', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Sbilanciato</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-sec" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>💾 Salva HTML (Disattivato)</button>
              <button className="btn" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>🖨️ Stampa / PDF (Disattivato)</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem', background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Registrazioni</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{giornaleModel.entries.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Numero Righe</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{giornaleModel.righeCount}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Totale Dare</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>€ {fmt(giornaleModel.totaleDare)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Totale Avere</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>€ {fmt(giornaleModel.totaleAvere)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Sbilancio</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: Math.abs(giornaleModel.totaleDare - giornaleModel.totaleAvere) < 0.01 ? 'var(--text-main)' : '#ef4444' }}>
                € {fmt(giornaleModel.totaleDare - giornaleModel.totaleAvere)}
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', width: '50px' }}>N°</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', width: '90px' }}>Data</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', width: '80px' }}>Causale</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem' }}>Descrizione</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', width: '90px' }}>N° Doc.</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', width: '110px' }}>Dare</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', width: '110px' }}>Avere</th>
                </tr>
              </thead>
              <tbody>
                {giornaleModel.entries.map((entry, eIdx) => {
                  return (
                    <Fragment key={'entry_frag_' + (entry.id || eIdx)}>
                      {/* Riga principale registrazione */}
                      <tr key={'entry_' + (entry.id || eIdx)} style={{ background: 'var(--bg-surface)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>{entry.numero_registrazione}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>{fmtDate(entry.data_registrazione)}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}><code>{entry.causale_codice}</code></td>
                        <td style={{ padding: '0.5rem 0.75rem' }} colSpan="2">
                          {entry.descrizione}
                          {entry.cliente_fornitore_nome && <span style={{ color: 'var(--mu)', fontStyle: 'italic', fontSize: '0.8rem' }}> — {entry.cliente_fornitore_nome}</span>}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                          {entry.totale_dare > 0 ? fmt(entry.totale_dare) : ''}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                          {entry.totale_avere > 0 ? fmt(entry.totale_avere) : ''}
                        </td>
                      </tr>
                      {/* Righe dei conti (mastrini) associati */}
                      {entry.righe && entry.righe.map((r, rIdx) => (
                        <tr key={'riga_' + (r.id || rIdx)} style={{ borderBottom: '1px dashed var(--border-subtle)', opacity: 0.9 }}>
                          <td colSpan="3"></td>
                          <td style={{ padding: '0.4rem 0.75rem', paddingLeft: '2rem', fontSize: '0.85rem' }}>
                            <strong>{r.conto_codice}</strong> — {r.conto_descrizione}
                            {r.descrizione_riga && <span style={{ color: 'var(--mu)', display: 'block', fontSize: '0.75rem' }}>{r.descrizione_riga}</span>}
                          </td>
                          <td></td>
                          <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {r.importo_dare > 0 ? fmt(r.importo_dare) : ''}
                          </td>
                          <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {r.importo_avere > 0 ? fmt(r.importo_avere) : ''}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
                <tr style={{ background: 'var(--bg-surface)', fontWeight: 'bold', borderTop: '2px solid var(--border-subtle)' }}>
                  <td colSpan="5" style={{ padding: '0.75rem', textAlign: 'right' }}>TOTALI GIORNALE</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: '#10b981' }}>{fmt(giornaleModel.totaleDare)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: '#ef4444' }}>{fmt(giornaleModel.totaleAvere)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: '0.8rem', background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: '6px', borderLeft: '4px solid #f59e0b' }}>
            ℹ️ <strong>Anteprima provvisoria.</strong> I progressivi visualizzati non costituiscono protocollo definitivo.
          </div>
        </div>
      )}

      {/* Vecchio Iframe (non usato) */}
      {previewHtml&&(
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
            <div style={{fontWeight:600}}>📋 Anteprima documento</div>
            <div style={{display:'flex',gap:'.5rem'}}>
              <button className="btn-sec" onClick={scaricaHTML}>💾 Salva HTML</button>
              <button className="btn" onClick={stampaPDF}>🖨️ Stampa / PDF</button>
            </div>
          </div>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'1rem',maxHeight:500,overflow:'auto'}}>
            <iframe 
              srcDoc={previewHtml} 
              style={{width:'100%',height:450,border:'none',borderRadius:8,background:'var(--bg-card)'}}
              title="Anteprima stampa"
            />
          </div>
        </div>
      )}

      {!previewHtml&&!registroModel&&!giornaleModel&&!loading&&(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>🖨️</div>
          <div style={{color:'var(--mu)'}}>Seleziona il periodo e clicca "Genera Anteprima" per visualizzare il documento</div>
        </div>
      )}
    </div>
  );
}
