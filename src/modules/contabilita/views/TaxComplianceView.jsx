import { useEffect, useMemo, useState } from 'react'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { fmtNumber } from '../ui/formatters.js'
import { getLiquidazioneBadgeClass, getLipeBadgeClass } from '../ui/viewMappers.js'
import { ModuleHeader } from '../../../shared/components'
import { CAUSALI_REDDITUALI_OPTIONS, CAUSALI_REDDITUALI_BY_CODE, SOMME_NON_SOGGETTE_OPTIONS } from '../../../shared/constants'
import { syncPercipientiRegistryForSocieta } from '../application/percipientiRegistryService.js'
import { BaseCombobox } from '../ui/BaseDropdown.jsx'
import {
  buildParcellaAudit,
  buildParcellaAuditNote,
  buildParcellaDecision,
  parseParcellaAuditNote,
} from '../application/parcellaDecisionEngine.js'
import {
  applyPaymentToParcellaWorkflow,
  readParcellaWorkflowState,
} from '../application/parcellaWorkflowState.js'
import {
  build770RowsFromPayments,
} from '../application/paymentDrivenFiscalViews.js'
import { buildRitenuteScadenzarioRows } from '../application/ritenute/ritenuteScadenzarioService.js'
import { sb } from '../../../lib/supabase.js'
import {
  aggregateRegistriIvaRows,
  buildLiquidazionePayload,
  mapLiquidazioneForUi,
  boundsMensile,
  boundsTrimestrale,
  preparaConsolidamentoLiquidazioneIvaDefinitiva,
  consolidaLiquidazioneIvaDefinitivaDaPeriodo,
} from '../application/liquidazioneIvaClient.js'
import { getLiquidazioneIvaProvvisoriaProspetto } from '../application/iva/liquidazioneIvaProvvisoriaUiAdapter.js'

const EMPTY_CELL = '\u2014'

export default function TaxComplianceView({
  contTab,
  societaAttiva,
  scritture,
  causaliIva,
  caricaTutto,
}) {
  if (!societaAttiva) return null

  return (
    <>
      {contTab === 'liquidazioni_iva' && (
        <LiquidazioniIVAView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva} />
      )}

      {contTab === 'lipe' && <LIPEView societa={societaAttiva} />}

      {contTab === 'corrispettivi' && <CorrispettiviView societa={societaAttiva} />}

      {contTab === 'f770' && <Modello770View societa={societaAttiva} />}

      {contTab === 'intrastat' && <IntrastatView societa={societaAttiva} />}

      {contTab === 'percipienti' && <PercipientiView societa={societaAttiva} onRefresh={caricaTutto} />}

      {contTab === 'ritenute' && <RitenuteView societa={societaAttiva} />}

      {contTab === 'iva_annuale' && (
        <IvaAnnualeView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva} />
      )}
    </>
  )
}

function parseUiJson(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function LiquidazioniIVAView({societa,scritture,causaliIva}){
  const [liquidazioni,setLiquidazioni]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modalNuova,setModalNuova]=useState(false);
  const [formData,setFormData]=useState({
    tipo_periodo:'trimestrale',
    anno:new Date().getFullYear(),
    periodo:Math.ceil((new Date().getMonth()+1)/3),
    iva_vendite:0,
    iva_acquisti:0,
    iva_split_payment:0,
    note:''
  });

  const [provvisoriaPeriod, setProvvisoriaPeriod] = useState({
    tipo_periodo: 'mensile',
    anno: new Date().getFullYear(),
    periodo: new Date().getMonth() + 1
  });
  const [provvisoriaData, setProvvisoriaData] = useState(null);
  const [loadingProvvisoria, setLoadingProvvisoria] = useState(false);

  // States for Liquidazione IVA Definitiva (Fase 2C)
  const [definitivaData, setDefinitivaData] = useState(null);
  const [loadingDefinitiva, setLoadingDefinitiva] = useState(false);
  const [definitivaStatus, setDefinitivaStatus] = useState('Non consolidata');
  const [definitivaError, setDefinitivaError] = useState(null);
  const [operatori, setOperatori] = useState([]);
  const [operatoreSel, setOperatoreSel] = useState('');
  const [motivoConsolidamento, setMotivoConsolidamento] = useState('Consolidamento liquidazione IVA definitiva');

  useEffect(()=>{
    if(societa?.id) {
      caricaLiquidazioni();
      caricaOperatori();
    }
  },[societa]);

  const caricaOperatori = async () => {
    try {
      const { data, error } = await sb.from('utenti_studio').select('id, nome, cognome, auth_user_id').eq('attivo', true).order('nome');
      if (!error && data) {
        setOperatori(data);
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          const profile = data.find(u => u.auth_user_id === user.id);
          if (profile) {
            setOperatoreSel(profile.id);
          } else if (data.length > 0) {
            setOperatoreSel(data[0].id);
          }
        } else if (data.length > 0) {
          setOperatoreSel(data[0].id);
        }
      }
    } catch (err) {
      console.error('Errore caricamento operatori:', err);
    }
  };

  const preparaAnteprimaDefinitiva = async () => {
    if (!operatoreSel) {
      setDefinitivaError('Selezionare l\'operatore prima di procedere.');
      setDefinitivaStatus('Errore');
      return;
    }
    setLoadingDefinitiva(true);
    setDefinitivaError(null);
    try {
      const anno = provvisoriaPeriod.anno;
      const periodo = provvisoriaPeriod.periodo;
      const isTrimestrale = provvisoriaPeriod.tipo_periodo === 'trimestrale';
      const bounds = isTrimestrale ? boundsTrimestrale(anno, periodo) : boundsMensile(anno, periodo);

      const prepResult = await preparaConsolidamentoLiquidazioneIvaDefinitiva({
        societaId: societa.id,
        periodoInizio: bounds.periodo_inizio,
        periodoFine: bounds.periodo_fine,
        tipoPeriodicita: provvisoriaPeriod.tipo_periodo,
        operatoreStudioId: operatoreSel,
        motivo: motivoConsolidamento
      });

      setDefinitivaData(prepResult);
      setDefinitivaStatus('Pronta per consolidamento');
    } catch (err) {
      console.error(err);
      setDefinitivaError(err.message || 'Errore durante la preparazione dell\'anteprima.');
      setDefinitivaStatus('Errore');
    } finally {
      setLoadingDefinitiva(false);
    }
  };

  const consolidaDefinitivamente = async () => {
    if (!definitivaData) return;
    if (!window.confirm(
      `La liquidazione IVA sarà consolidata come definitiva per il periodo selezionato.\n` +
      `Le registrazioni IVA del periodo saranno soggette a blocchi/warning di modifica.`
    )) {
      return;
    }

    setLoadingDefinitiva(true);
    setDefinitivaStatus('Consolidamento in corso');
    setDefinitivaError(null);

    try {
      const { data, error } = await consolidaLiquidazioneIvaDefinitivaDaPeriodo({
        societaId: definitivaData.societaId,
        periodoInizio: definitivaData.periodoInizio,
        periodoFine: definitivaData.periodoFine,
        tipoPeriodicita: definitivaData.tipoPeriodicita,
        operatoreStudioId: definitivaData.operatoreStudioId,
        motivo: definitivaData.motivo
      });

      if (error) {
        if (error.code === '42883' || error.message?.includes('function') || error.message?.includes('RPC') || error.message?.includes('does not exist')) {
          setDefinitivaError(
            'La funzione di consolidamento definitivo non è ancora disponibile nel database.\n' +
            'Applicare prima la migration RPC Fase 2A in ambiente controllato.'
          );
        } else {
          setDefinitivaError(error.message || 'Errore durante il consolidamento definitivo.');
        }
        setDefinitivaStatus('Errore');
        return;
      }

      if (data && data.success === false) {
        setDefinitivaError(data.error || 'Errore durante il consolidamento definitivo.');
        setDefinitivaStatus('Errore');
        return;
      }

      setDefinitivaStatus('Consolidata');
      alert('Consolidamento definitivo completato con successo!');
      caricaLiquidazioni();
      caricaProvvisoria();
      setDefinitivaData(null);
    } catch (err) {
      console.error(err);
      setDefinitivaError(err.message || 'Errore imprevisto durante il consolidamento.');
      setDefinitivaStatus('Errore');
    } finally {
      setLoadingDefinitiva(false);
    }
  };

  useEffect(() => {
    if (societa?.id) {
      caricaProvvisoria();
    }
  }, [societa?.id, provvisoriaPeriod]);

  const caricaProvvisoria = async () => {
    setLoadingProvvisoria(true);
    try {
      const anno = provvisoriaPeriod.anno;
      const periodo = provvisoriaPeriod.periodo;
      const isTrimestrale = provvisoriaPeriod.tipo_periodo === 'trimestrale';
      const bounds = isTrimestrale ? boundsTrimestrale(anno, periodo) : boundsMensile(anno, periodo);

      const { data, error } = await contabilitaRepo.getRegistriIvaByPeriodo(
        societa.id,
        bounds.periodo_inizio,
        bounds.periodo_fine
      );
      if (error) {
        console.error('Errore lettura registri per provvisoria:', error);
        setProvvisoriaData(null);
        return;
      }

      const options = {
        societaId: societa.id,
        periodoInizio: bounds.periodo_inizio,
        periodoFine: bounds.periodo_fine,
        periodicita: provvisoriaPeriod.tipo_periodo,
        periodo: periodo,
      };

      const prospetto = getLiquidazioneIvaProvvisoriaProspetto(data || [], options);
      setProvvisoriaData(prospetto);
    } catch (err) {
      console.error(err);
      setProvvisoriaData(null);
    } finally {
      setLoadingProvvisoria(false);
    }
  };

  const caricaLiquidazioni=async()=>{
    setLoading(true);
    const { data } = await contabilitaRepo.getLiquidazioniIvaCanoniche(societa.id);
    const mapped = (data || []).map(mapLiquidazioneForUi).filter(Boolean);
    setLiquidazioni(mapped);
    setLoading(false);
  };

  const calcolaDaRegistri=async()=>{
    const anno=formData.anno;
    const periodo=formData.periodo;
    const isTrimestrale=formData.tipo_periodo==='trimestrale';
    const bounds = isTrimestrale ? boundsTrimestrale(anno, periodo) : boundsMensile(anno, periodo);

    const { data, error } = await contabilitaRepo.getRegistriIvaByPeriodo(societa.id, bounds.periodo_inizio, bounds.periodo_fine);
    if (error) {
      alert('Errore lettura registri IVA: ' + error.message);
      return;
    }
    const agg = aggregateRegistriIvaRows(data || [], {
      societaId: societa.id,
      periodoInizio: bounds.periodo_inizio,
      periodoFine: bounds.periodo_fine,
    });
    setFormData(prev=>({
      ...prev,
      iva_vendite: (agg.iva_debito_registrata ?? agg.iva_debito ?? 0).toFixed(2),
      iva_acquisti: agg.iva_credito.toFixed(2),
      iva_split_payment: (agg.iva_split_payment ?? 0).toFixed(2),
    }));
  };

  const salvaLiquidazione=async()=>{
    const ivaDebito=parseFloat(formData.iva_vendite||0);
    const ivaSplitPayment=parseFloat(formData.iva_split_payment||0);
    const ivaCredito=parseFloat(formData.iva_acquisti||0);
    const ivaDebitoEffettiva=Math.round((ivaDebito-ivaSplitPayment)*100)/100;

    const agg = {
      iva_debito_effettiva: ivaDebitoEffettiva,
      iva_credito: ivaCredito,
      saldo: Math.round((ivaDebitoEffettiva - ivaCredito) * 100) / 100,
    };
    const record = buildLiquidazionePayload({
      societaId: societa.id,
      periodicita: formData.tipo_periodo,
      anno: formData.anno,
      mese: formData.tipo_periodo === 'mensile' ? formData.periodo : null,
      trimestre: formData.tipo_periodo === 'trimestrale' ? formData.periodo : null,
      agg,
      note: formData.note,
    });
    
    const{error}=await contabilitaRepo.upsertLiquidazioneIvaCanonica(record);
    if(error){
      // Se la tabella non esiste, la creiamo
      if(error.code==='42P01'){
        alert('Tabella liquidazione_iva non trovata. Crea la tabella nel database.');
      }else{
        alert('Errore: '+error.message);
      }
      return;
    }
    setModalNuova(false);
    caricaLiquidazioni();
  };

  const fmt = fmtNumber;
  const periodoLabel=l=>l.tipo_periodo==='trimestrale'?`${l.periodo}° Trim ${l.anno}`:`${l.periodo}/${l.anno}`;

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>Liquidazioni IVA</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Calcolo periodico IVA a debito/credito</div>
        </div>
        <button className="btn" onClick={()=>setModalNuova(true)}>+ Nuova Liquidazione</button>
      </div>

      {/* Sezione Liquidazione IVA Provvisoria (Read-only) */}
      <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--gold, #c8a45e)' }}>
        <div className="card-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bd)', paddingBottom: '0.75rem' }}>
          <div className="card-title-wrap">
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Liquidazione IVA provvisoria</span>
              <span className="bdg bdg-warn" style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(200, 164, 94, 0.2)', color: 'var(--gold, #c8a45e)' }}>
                Prospetto non definitivo
              </span>
            </div>
            <div className="card-subtitle" style={{ fontSize: '0.75rem', color: 'var(--mu)', marginTop: '2px' }}>
              Anteprima di calcolo in tempo reale basata sui registri IVA correnti (non salvata)
            </div>
          </div>
        </div>
        
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="fg" style={{ marginBottom: 0, minWidth: '130px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Periodicità</label>
              <BaseCombobox
                value={provvisoriaPeriod.tipo_periodo}
                onChange={(v) => {
                  const newTipo = v || 'mensile';
                  setProvvisoriaPeriod(p => ({
                    ...p,
                    tipo_periodo: newTipo,
                    periodo: 1
                  }));
                }}
                options={[{ id: 'trimestrale', label: 'Trimestrale' }, { id: 'mensile', label: 'Mensile' }]}
                getOptionId={o => o?.id}
                getOptionLabel={o => o?.label}
                searchable={false}
              />
            </div>
            
            <div className="fg" style={{ marginBottom: 0, minWidth: '100px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Anno</label>
              <input 
                type="number" 
                value={provvisoriaPeriod.anno} 
                onChange={e => setProvvisoriaPeriod(p => ({ ...p, anno: parseInt(e.target.value) || new Date().getFullYear() }))}
                style={{ width: '100%', height: '36px' }}
              />
            </div>
            
            <div className="fg" style={{ marginBottom: 0, minWidth: '150px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>
                {provvisoriaPeriod.tipo_periodo === 'trimestrale' ? 'Trimestre' : 'Mese'}
              </label>
              <BaseCombobox
                value={String(provvisoriaPeriod.periodo)}
                onChange={(v) => setProvvisoriaPeriod(p => ({ ...p, periodo: parseInt(v || '1') }))}
                options={
                  provvisoriaPeriod.tipo_periodo === 'trimestrale'
                    ? [1, 2, 3, 4].map(t => ({ id: String(t), label: `${t}° Trimestre` }))
                    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({ id: String(m), label: `Mese ${m}` }))
                }
                getOptionId={o => o?.id}
                getOptionLabel={o => o?.label}
                searchable={false}
              />
            </div>

            <button 
              className="btn-sec" 
              onClick={caricaProvvisoria} 
              disabled={loadingProvvisoria}
              style={{ height: '36px' }}
            >
              Aggiorna anteprima
            </button>
          </div>
        </div>

        {loadingProvvisoria ? (
          <div className="loading" style={{ padding: '2rem' }}>Caricamento anteprima provvisoria...</div>
        ) : !provvisoriaData ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mu)' }}>
            Nessun dato provvisorio disponibile per il periodo selezionato.
          </div>
        ) : (
          <div>
            {/* Grid riassuntiva */}
            <div className="stats-grid" style={{ padding: '1rem', borderBottom: '1px solid var(--bd)', gap: '1rem' }}>
              <div className="stat-card">
                <div className="stat-val">{fmt(provvisoriaData.ivaVenditeLorda)}</div>
                <div className="stat-lbl">IVA vendite lorda</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--mu)' }}>{fmt(provvisoriaData.ivaSplitPayment)}</div>
                <div className="stat-lbl">IVA split payment esclusa dal debito</div>
              </div>
              <div className="stat-card">
                <div className="stat-val">{fmt(provvisoriaData.ivaDebitoEffettiva)}</div>
                <div className="stat-lbl">IVA a debito effettiva</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--gr, #2ecc71)' }}>{fmt(provvisoriaData.ivaAcquisti)}</div>
                <div className="stat-lbl">IVA acquisti</div>
              </div>
            </div>

            {/* Saldo e Dettagli righe */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', padding: '1rem', background: 'var(--s2)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--mu)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Esito liquidazione provvisoria
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700, color: provvisoriaData.saldoPeriodo > 0 ? 'var(--rd)' : 'var(--gr)' }}>
                    {fmt(provvisoriaData.saldoPeriodo)}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: provvisoriaData.saldoPeriodo > 0 ? 'var(--rd)' : 'var(--gr)' }}>
                    {provvisoriaData.saldoPeriodo > 0 ? 'IVA periodo a debito' : 'IVA periodo a credito'}
                  </span>
                </div>
                {provvisoriaData.saldoADebito > 0 && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--rd)' }}>
                    Da versare: <strong>{fmt(provvisoriaData.saldoADebito)}</strong>
                  </div>
                )}
                {provvisoriaData.saldoACredito > 0 && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--gr)' }}>
                    A credito: <strong>{fmt(provvisoriaData.saldoACredito)}</strong>
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--mu)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Statistiche Registrazioni
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{provvisoriaData.righeIncluseCount}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--mu)' }}>Righe incluse</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: provvisoriaData.righeEscluseCount > 0 ? 'var(--gold)' : 'inherit' }}>
                      {provvisoriaData.righeEscluseCount}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--mu)' }}>Righe escluse</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings list */}
            {provvisoriaData.warnings && provvisoriaData.warnings.length > 0 && (
              <div style={{ padding: '1rem', borderTop: '1px solid var(--bd)', background: 'rgba(200, 164, 94, 0.05)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span>Informazioni e warning:</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: 'var(--mu)' }}>
                  {provvisoriaData.warnings.map((w, idx) => (
                    <li key={idx} style={{ marginBottom: '2px' }}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sezione Liquidazione IVA Definitiva (Fase 2C) */}
      <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid #3498db' }}>
        <div className="card-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bd)', paddingBottom: '0.75rem' }}>
          <div className="card-title-wrap">
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Liquidazione IVA definitiva</span>
              <span className={`bdg ${
                definitivaStatus === 'Consolidata' ? 'bdg-success' : 
                definitivaStatus === 'Errore' ? 'bdg-danger' : 'bdg-warn'
              }`} style={{ fontSize: '0.7rem', padding: '2px 6px', background: definitivaStatus === 'Consolidata' ? 'rgba(46, 204, 113, 0.2)' : definitivaStatus === 'Errore' ? 'rgba(231, 76, 60, 0.2)' : 'rgba(200, 164, 94, 0.2)', color: definitivaStatus === 'Consolidata' ? '#2ecc71' : definitivaStatus === 'Errore' ? '#e74c3c' : '#c8a45e' }}>
                {definitivaStatus}
              </span>
            </div>
            <div className="card-subtitle" style={{ fontSize: '0.75rem', color: 'var(--mu)', marginTop: '2px' }}>
              Consolidamento definitivo e blocco del periodo IVA per finalità di audit studio-grade
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="fg" style={{ marginBottom: 0, minWidth: '200px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Operatore Studio *</label>
              <select 
                value={operatoreSel} 
                onChange={e => setOperatoreSel(e.target.value)} 
                style={{ width: '100%', height: '36px' }}
              >
                <option value="">Seleziona operatore...</option>
                {operatori.map(op => (
                  <option key={op.id} value={op.id}>{op.nome} {op.cognome}</option>
                ))}
              </select>
            </div>

            <div className="fg" style={{ marginBottom: 0, minWidth: '250px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Motivo consolidamento</label>
              <input 
                type="text" 
                value={motivoConsolidamento} 
                onChange={e => setMotivoConsolidamento(e.target.value)} 
                style={{ width: '100%', height: '36px' }}
                placeholder="Motivo della chiusura..."
              />
            </div>

            <button 
              className="btn-sec" 
              onClick={preparaAnteprimaDefinitiva} 
              disabled={loadingDefinitiva || !operatoreSel}
              style={{ height: '36px' }}
            >
              Prepara anteprima definitiva
            </button>
          </div>

          {definitivaError && (
            <div className="alert alert-danger" style={{ marginTop: '1rem', whiteSpace: 'pre-line' }}>
              {definitivaError}
            </div>
          )}
        </div>

        {loadingDefinitiva && (
          <div className="loading" style={{ padding: '2rem' }}>Elaborazione in corso...</div>
        )}

        {definitivaData && !loadingDefinitiva && (
          <div>
            <div className="stats-grid" style={{ padding: '1rem', borderBottom: '1px solid var(--bd)', gap: '1rem' }}>
              <div className="stat-card">
                <div className="stat-val">{fmt(definitivaData.payloadCalcoloRpc.ivaVenditeLorda)}</div>
                <div className="stat-lbl">IVA vendite lorda</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--mu)' }}>{fmt(definitivaData.payloadCalcoloRpc.ivaSplitEsclusa)}</div>
                <div className="stat-lbl">IVA split payment esclusa</div>
              </div>
              <div className="stat-card">
                <div className="stat-val">{fmt(definitivaData.payloadCalcoloRpc.ivaDebitoEffettiva)}</div>
                <div className="stat-lbl">IVA debito effettiva</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: 'var(--gr, #2ecc71)' }}>{fmt(definitivaData.payloadCalcoloRpc.ivaAcquistiDetraibile)}</div>
                <div className="stat-lbl">IVA acquisti detraibile</div>
              </div>
            </div>

            <div style={{ padding: '1rem', borderBottom: '1px solid var(--bd)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
              <div>
                <span style={{ color: 'var(--mu)' }}>IVA indetraibile:</span> <strong>{fmt(definitivaData.payloadCalcoloRpc.ivaAcquistiIndetraibile)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--mu)' }}>IVA per cassa differita (esclusa):</span> <strong>{fmt(definitivaData.payloadCalcoloRpc.ivaPerCassaDifferita)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--mu)' }}>IVA per cassa rilasciata:</span> <strong>{fmt(definitivaData.payloadCalcoloRpc.ivaPerCassaRilasciata)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--mu)' }}>Reverse charge debito:</span> <strong>{fmt(definitivaData.payloadCalcoloRpc.ivaReverseDebito)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--mu)' }}>Reverse charge credito:</span> <strong>{fmt(definitivaData.payloadCalcoloRpc.ivaReverseCredito)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--mu)' }}>Credito prec. / anno prec:</span> <strong>{fmt(definitivaData.payloadCalcoloRpc.creditoPeriodoPrecedente)} / {fmt(definitivaData.payloadCalcoloRpc.creditoAnnoPrecedente)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--mu)' }}>Compensato F24 / Acconto:</span> <strong>{fmt(definitivaData.payloadCalcoloRpc.creditoCompensatoF24)} / {fmt(definitivaData.payloadCalcoloRpc.accontoIvaVersato)}</strong>
              </div>
              {definitivaData.payloadCalcoloRpc.interessiTrimestrali > 0 && (
                <div>
                  <span style={{ color: 'var(--mu)' }}>Interessi trimestrali (1%):</span> <strong>{fmt(definitivaData.payloadCalcoloRpc.interessiTrimestrali)}</strong>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', padding: '1rem', background: 'var(--s2)', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--mu)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Esito liquidazione consolidata
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700, color: definitivaData.payloadCalcoloRpc.saldoPeriodo > 0 ? 'var(--rd)' : 'var(--gr)' }}>
                    {fmt(definitivaData.payloadCalcoloRpc.saldoPeriodo)}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: definitivaData.payloadCalcoloRpc.saldoPeriodo > 0 ? 'var(--rd)' : 'var(--gr)' }}>
                    {definitivaData.payloadCalcoloRpc.saldoPeriodo > 0 ? 'IVA periodo a debito' : 'IVA periodo a credito'}
                  </span>
                </div>
                {definitivaData.payloadCalcoloRpc.debitoDaVersare > 0 && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--rd)' }}>
                    Debito da versare (con interessi/acconti): <strong>{fmt(definitivaData.payloadCalcoloRpc.debitoDaVersare)}</strong>
                  </div>
                )}
                {definitivaData.payloadCalcoloRpc.creditoDaRiportare > 0 && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--gr)' }}>
                    Credito da riportare: <strong>{fmt(definitivaData.payloadCalcoloRpc.creditoDaRiportare)}</strong>
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--mu)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Analisi Righe Snapshot
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {definitivaData.payloadCalcoloRpc.righe.filter(r => r.inclusa_in_liquidazione).length}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--mu)' }}>Righe incluse</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: definitivaData.payloadCalcoloRpc.righe.filter(r => !r.inclusa_in_liquidazione).length > 0 ? 'var(--gold)' : 'inherit' }}>
                      {definitivaData.payloadCalcoloRpc.righe.filter(r => !r.inclusa_in_liquidazione).length}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--mu)' }}>Righe escluse</div>
                  </div>
                </div>
                {definitivaData.payloadCalcoloRpc.righe.some(r => !r.inclusa_in_liquidazione) && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--mu)' }}>
                    Motivi: {Array.from(new Set(definitivaData.payloadCalcoloRpc.righe.filter(r => !r.inclusa_in_liquidazione).map(r => r.motivo_esclusione))).join(', ')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn" 
                  onClick={consolidaDefinitivamente}
                  disabled={loadingDefinitiva}
                  style={{ background: '#3498db', color: '#fff' }}
                >
                  Consolida definitivamente
                </button>
              </div>
            </div>

            {definitivaData.risultatoCalcolo.warnings && definitivaData.risultatoCalcolo.warnings.length > 0 && (
              <div style={{ padding: '1rem', borderTop: '1px solid var(--bd)', background: 'rgba(200, 164, 94, 0.05)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '0.25rem' }}>
                  Warning calcolatore:
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: 'var(--mu)' }}>
                  {definitivaData.risultatoCalcolo.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {loading?(
        <div className="loading">Caricamento...</div>
      ):liquidazioni.length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{color:'var(--mu)'}}>Nessuna liquidazione IVA. Clicca "Nuova Liquidazione" per iniziare.</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th style={{textAlign:'right'}}>IVA Vendite</th>
                  <th style={{textAlign:'right'}}>IVA Acquisti</th>
                  <th style={{textAlign:'right'}}>IVA Dovuta</th>
                  <th style={{textAlign:'right'}}>Credito</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {liquidazioni.map(l=>(
                  <tr key={l.id}>
                    <td><strong>{periodoLabel(l)}</strong></td>
                    <td style={{textAlign:'right'}}>{fmt(l.iva_vendite)}</td>
                    <td style={{textAlign:'right'}}>{fmt(l.iva_acquisti)}</td>
                    <td style={{textAlign:'right',color:l.iva_dovuta>0?'var(--rd)':'inherit',fontWeight:l.iva_dovuta>0?700:'normal'}}>{l.iva_dovuta>0?fmt(l.iva_dovuta):EMPTY_CELL}</td>
                    <td style={{textAlign:'right',color:l.credito_da_riportare>0?'var(--gr)':'inherit'}}>{l.credito_da_riportare>0?fmt(l.credito_da_riportare):EMPTY_CELL}</td>
                    <td><span className={'bdg '+getLiquidazioneBadgeClass(l.stato)}>{l.stato}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuova Liquidazione */}
      {modalNuova&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuova(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:550}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">Nuova Liquidazione IVA</div>
              <div className="modal-sub">{societa?.denominazione}</div>
              <button className="modal-close" onClick={()=>setModalNuova(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg">
                  <label>Tipo periodo</label>
                  <BaseCombobox
                    value={formData.tipo_periodo}
                    onChange={(v)=>setFormData(p=>({...p,tipo_periodo:v||'trimestrale'}))}
                    options={[{id:'trimestrale',label:'Trimestrale'},{id:'mensile',label:'Mensile'}]}
                    getOptionId={o=>o?.id}
                    getOptionLabel={o=>o?.label}
                    searchable={false}
                  />
                </div>
                <div className="fg">
                  <label>Anno</label>
                  <input type="number" value={formData.anno} onChange={e=>setFormData(p=>({...p,anno:parseInt(e.target.value)}))}/>
                </div>
                <div className="fg">
                  <label>{formData.tipo_periodo==='trimestrale'?'Trimestre':'Mese'}</label>
                  <BaseCombobox
                    value={String(formData.periodo ?? '')}
                    onChange={(v)=>setFormData(p=>({...p,periodo:parseInt(v || '1')}))}
                    options={(formData.tipo_periodo==='trimestrale'
                      ? [1,2,3,4].map(t=>({id:String(t),label:`${t}° Trimestre`}))
                      : [1,2,3,4,5,6,7,8,9,10,11,12].map(m=>({id:String(m),label:String(m)}))
                    )}
                    getOptionId={o=>o?.id}
                    getOptionLabel={o=>o?.label}
                    searchable={false}
                  />
                </div>
                <div className="fg">
                  <label>&nbsp;</label>
                  <button className="btn-sec" onClick={calcolaDaRegistri} style={{width:'100%'}}>Calcola da Registri IVA</button>
                </div>
                <div className="fg">
                  <label>IVA Vendite (debito)</label>
                  <input type="number" step="0.01" value={formData.iva_vendite} onChange={e=>setFormData(p=>({...p,iva_vendite:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>IVA Acquisti (credito)</label>
                  <input type="number" step="0.01" value={formData.iva_acquisti} onChange={e=>setFormData(p=>({...p,iva_acquisti:e.target.value}))}/>
                </div>
                <div className="fg full">
                  <label>Note</label>
                  <textarea value={formData.note} onChange={e=>setFormData(p=>({...p,note:e.target.value}))} rows={2}/>
                </div>
              </div>
              
              {/* Riepilogo */}
              <div style={{marginTop:'1rem',padding:'1rem',background:'var(--s2)',borderRadius:8}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'.5rem'}}>
                  <span>IVA vendite registrata:</span><span style={{fontWeight:600}}>{fmt(formData.iva_vendite)}</span>
                </div>
                {parseFloat(formData.iva_split_payment || 0) > 0 && (
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'.5rem'}}>
                    <span>IVA split payment:</span><span style={{fontWeight:600}}>- {fmt(formData.iva_split_payment)}</span>
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'.5rem'}}>
                  <span>IVA a credito:</span><span style={{fontWeight:600}}>- {fmt(formData.iva_acquisti)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',paddingTop:'.5rem',borderTop:'1px solid var(--bd)'}}>
                  <span style={{fontWeight:700}}>IVA dovuta:</span>
                  <span style={{fontWeight:700,color:(parseFloat(formData.iva_vendite||0)-parseFloat(formData.iva_split_payment||0)-parseFloat(formData.iva_acquisti||0))>0?'var(--rd)':'var(--gr)'}}>
                    {fmt(parseFloat(formData.iva_vendite||0)-parseFloat(formData.iva_split_payment||0)-parseFloat(formData.iva_acquisti||0))}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuova(false)}>Annulla</button>
              <button className="btn" onClick={salvaLiquidazione}>Salva Liquidazione</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function LIPEView({societa}){
  const [liquidazioni,setLiquidazioni]=useState([]);
  const [loading,setLoading]=useState(true);
  const [generando,setGenerando]=useState(false);
  const [selectedTrimestre,setSelectedTrimestre]=useState(Math.ceil((new Date().getMonth()+1)/3));
  const [selectedAnno,setSelectedAnno]=useState(new Date().getFullYear());

  useEffect(()=>{
    if(societa?.id)caricaDati();
  },[societa]);

  const caricaDati=async()=>{
    setLoading(true);
    const { data } = await contabilitaRepo.getLiquidazioniIvaCanonicheByPeriodicita(societa.id, 'trimestrale');
    const mapped = (data || []).map(mapLiquidazioneForUi).filter(Boolean);
    setLiquidazioni(mapped);
    setLoading(false);
  };

  const generaFileLIPE=()=>{
    setGenerando(true);
    
    // Trova la liquidazione del trimestre selezionato
    const liq=liquidazioni.find(l=>l.anno===selectedAnno&&l.periodo===selectedTrimestre);
    
    if(!liq){
      alert('Nessuna liquidazione trovata per il periodo selezionato. Crea prima la liquidazione IVA.');
      setGenerando(false);
      return;
    }

    // Genera contenuto file LIPE (formato semplificato - in produzione sarebbe XML)
    const contenuto=`<?xml version="1.0" encoding="UTF-8"?>
<Fornitura xmlns="urn:www.agenziaentrate.gov.it:specificheTecniche:sco:ivp">
  <Intestazione>
    <CodiceFornitura>IVP18</CodiceFornitura>
    <CodiceFiscaleDichiarante>${societa?.codice_fiscale||'XXXXXXXXXXXXXXXX'}</CodiceFiscaleDichiarante>
    <PIVAContribuente>${societa?.partita_iva||'00000000000'}</PIVAContribuente>
  </Intestazione>
  <Comunicazione>
    <DatiContabili>
      <Modulo>
        <NumeroModulo>1</NumeroModulo>
        <Trimestre>${selectedTrimestre}</Trimestre>
        <Anno>${selectedAnno}</Anno>
        <TotaleOperazioniAttive>${(liq.iva_vendite/0.22).toFixed(2)}</TotaleOperazioniAttive>
        <TotaleOperazioniPassive>${(liq.iva_acquisti/0.22).toFixed(2)}</TotaleOperazioniPassive>
        <IvaEsigibile>${liq.iva_vendite.toFixed(2)}</IvaEsigibile>
        <IvaDetratta>${liq.iva_acquisti.toFixed(2)}</IvaDetratta>
        <IvaDovuta>${liq.iva_dovuta>0?liq.iva_dovuta.toFixed(2):'0.00'}</IvaDovuta>
        <IvaCredito>${liq.credito_da_riportare>0?liq.credito_da_riportare.toFixed(2):'0.00'}</IvaCredito>
        <DebitoCredPeriodPrec>0.00</DebitoCredPeriodPrec>
        <CreditoAnnoPrec>0.00</CreditoAnnoPrec>
        <Interessi>0.00</Interessi>
        <Acconto>0.00</Acconto>
        <ImportoDaVersare>${liq.iva_dovuta>0?liq.iva_dovuta.toFixed(2):'0.00'}</ImportoDaVersare>
        <CreditoDaRiportare>${liq.credito_da_riportare>0?liq.credito_da_riportare.toFixed(2):'0.00'}</CreditoDaRiportare>
      </Modulo>
    </DatiContabili>
  </Comunicazione>
</Fornitura>`;

    // Download del file
    const blob=new Blob([contenuto],{type:'application/xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`LIPE_${societa?.partita_iva||'000'}_${selectedAnno}_T${selectedTrimestre}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    
    setGenerando(false);
  };

  const fmt = fmtNumber;

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>LIPE - Comunicazione Liquidazioni Periodiche</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Genera file XML per l'invio telematico all'Agenzia delle Entrate</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'1rem',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div className="fg" style={{minWidth:120}}>
            <label>Anno</label>
            <select value={selectedAnno} onChange={e=>setSelectedAnno(parseInt(e.target.value))}>
              {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="fg" style={{minWidth:150}}>
            <label>Trimestre</label>
            <select value={selectedTrimestre} onChange={e=>setSelectedTrimestre(parseInt(e.target.value))}>
              <option value={1}>1° Trimestre (Gen-Mar)</option>
              <option value={2}>2° Trimestre (Apr-Giu)</option>
              <option value={3}>3° Trimestre (Lug-Set)</option>
              <option value={4}>4° Trimestre (Ott-Dic)</option>
            </select>
          </div>
          <button className="btn" onClick={generaFileLIPE} disabled={generando}>
            {generando?'⏳ Generazione...':'📥 Genera File XML'}
          </button>
        </div>
      </div>

      {/* Riepilogo liquidazioni disponibili */}
      {loading?(
        <div className="loading">Caricamento...</div>
      ):liquidazioni.length===0?(
        <div className="alert alert-warn">
          ⚠️ Nessuna liquidazione IVA trimestrale disponibile. Vai su "Liquidazioni IVA" per creare le liquidazioni periodiche.
        </div>
      ):(
        <div className="card">
          <div style={{fontWeight:600,marginBottom:'.75rem'}}>Liquidazioni disponibili per LIPE</div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th style={{textAlign:'right'}}>IVA Dovuta</th>
                  <th style={{textAlign:'right'}}>Credito</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {liquidazioni.map(l=>(
                  <tr key={l.id} style={{background:l.anno===selectedAnno&&l.periodo===selectedTrimestre?'rgba(200,164,94,.1)':''}}>
                    <td><strong>{l.periodo}° Trim {l.anno}</strong></td>
                    <td style={{textAlign:'right',color:'var(--rd)'}}>{l.iva_dovuta>0?fmt(l.iva_dovuta):EMPTY_CELL}</td>
                    <td style={{textAlign:'right',color:'var(--gr)'}}>{l.credito_da_riportare>0?fmt(l.credito_da_riportare):EMPTY_CELL}</td>
                    <td><span className={'bdg '+getLipeBadgeClass(l.stato)}>{l.stato}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="alert alert-info" style={{marginTop:'1rem'}}>
        💡 Il file XML generato può essere caricato sul portale Entratel o Fisconline per l'invio telematico. Scadenze: entro l'ultimo giorno del secondo mese successivo al trimestre.
      </div>
    </div>
  );
}


function CorrispettiviView({societa}){
  const [corrispettivi,setCorrispettivi]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modalNuovo,setModalNuovo]=useState(false);
  const [meseSel,setMeseSel]=useState(new Date().getMonth()+1);
  const [annoSel,setAnnoSel]=useState(new Date().getFullYear());
  const [formData,setFormData]=useState({
    data:new Date().toISOString().split('T')[0],
    incasso_totale:0,
    aliquota_22:0,
    aliquota_10:0,
    aliquota_4:0,
    esente:0,
    non_incassato:0,
    note:''
  });

  useEffect(()=>{
    if(societa?.id)caricaCorrispettivi();
  },[societa,meseSel,annoSel]);

  const caricaCorrispettivi=async()=>{
    setLoading(true);
    const inizioMese=`${annoSel}-${String(meseSel).padStart(2,'0')}-01`;
    const fineMese=new Date(annoSel,meseSel,0).toISOString().split('T')[0];
    
    const{data}=await contabilitaRepo.getCorrispettiviGiornalieri(societa.id, inizioMese, fineMese);
    setCorrispettivi(data||[]);
    setLoading(false);
  };

  const salvaCorrispettivo=async()=>{
    const totale=parseFloat(formData.aliquota_22||0)+parseFloat(formData.aliquota_10||0)+parseFloat(formData.aliquota_4||0)+parseFloat(formData.esente||0);
    const iva22=parseFloat(formData.aliquota_22||0)*0.22/1.22;
    const iva10=parseFloat(formData.aliquota_10||0)*0.10/1.10;
    const iva4=parseFloat(formData.aliquota_4||0)*0.04/1.04;
    
    const record={
      societa_id:societa.id,
      data:formData.data,
      incasso_totale:totale,
      aliquota_22:parseFloat(formData.aliquota_22||0),
      aliquota_10:parseFloat(formData.aliquota_10||0),
      aliquota_4:parseFloat(formData.aliquota_4||0),
      esente:parseFloat(formData.esente||0),
      iva_22:iva22,
      iva_10:iva10,
      iva_4:iva4,
      iva_totale:iva22+iva10+iva4,
      non_incassato:parseFloat(formData.non_incassato||0),
      note:formData.note
    };
    
    const{error}=await contabilitaRepo.insertCorrispettivoGiornaliero(record);
    if(error){
      if(error.code==='42P01'){
        alert('Tabella corrispettivi_giornalieri non trovata. Crea la tabella nel database.');
      }else{
        alert('Errore: '+error.message);
      }
      return;
    }
    setModalNuovo(false);
    setFormData({data:new Date().toISOString().split('T')[0],incasso_totale:0,aliquota_22:0,aliquota_10:0,aliquota_4:0,esente:0,non_incassato:0,note:''});
    caricaCorrispettivi();
  };

  const fmt = fmtNumber;
  const mesi=['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

  const totaleMese=corrispettivi.reduce((s,c)=>s+parseFloat(c.incasso_totale||0),0);
  const ivaMese=corrispettivi.reduce((s,c)=>s+parseFloat(c.iva_totale||0),0);

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>Corrispettivi Giornalieri</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Registrazione incassi giornalieri da registratore di cassa</div>
        </div>
        <button className="btn" onClick={()=>setModalNuovo(true)}>+ Nuovo Corrispettivo</button>
      </div>

      {/* Filtri mese */}
      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'1rem',alignItems:'center',flexWrap:'wrap'}}>
          <div className="fg" style={{minWidth:150}}>
            <label>Mese</label>
            <select value={meseSel} onChange={e=>setMeseSel(parseInt(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m=><option key={m} value={m}>{mesi[m]}</option>)}
            </select>
          </div>
          <div className="fg" style={{minWidth:100}}>
            <label>Anno</label>
            <select value={annoSel} onChange={e=>setAnnoSel(parseInt(e.target.value))}>
              {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{marginLeft:'auto',textAlign:'right'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)'}}>Totale mese</div>
            <div style={{fontSize:'1.2rem',fontWeight:700,color:'var(--gold)'}}>{fmt(totaleMese)}</div>
            <div style={{fontSize:'.7rem',color:'var(--mu)'}}>IVA: {fmt(ivaMese)}</div>
          </div>
        </div>
      </div>

      {/* Tabella */}
      {loading?(
        <div className="loading">Caricamento...</div>
      ):corrispettivi.length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>📋</div>
          <div style={{color:'var(--mu)'}}>Nessun corrispettivo per {mesi[meseSel]} {annoSel}</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th style={{textAlign:'right'}}>22%</th>
                  <th style={{textAlign:'right'}}>10%</th>
                  <th style={{textAlign:'right'}}>4%</th>
                  <th style={{textAlign:'right'}}>Esente</th>
                  <th style={{textAlign:'right'}}>Totale</th>
                  <th style={{textAlign:'right'}}>IVA</th>
                </tr>
              </thead>
              <tbody>
                {corrispettivi.map(c=>(
                  <tr key={c.id}>
                    <td><strong>{new Date(c.data).toLocaleDateString('it-IT',{weekday:'short',day:'2-digit'})}</strong></td>
                    <td style={{textAlign:'right'}}>{fmt(c.aliquota_22)}</td>
                    <td style={{textAlign:'right'}}>{fmt(c.aliquota_10)}</td>
                    <td style={{textAlign:'right'}}>{fmt(c.aliquota_4)}</td>
                    <td style={{textAlign:'right'}}>{fmt(c.esente)}</td>
                    <td style={{textAlign:'right',fontWeight:600}}>{fmt(c.incasso_totale)}</td>
                    <td style={{textAlign:'right',color:'var(--mu)'}}>{fmt(c.iva_totale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuovo */}
      {modalNuovo&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuovo(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">Nuovo Corrispettivo</div>
              <div className="modal-sub">{societa?.denominazione}</div>
              <button className="modal-close" onClick={()=>setModalNuovo(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg full">
                  <label>Data</label>
                  <input type="date" value={formData.data} onChange={e=>setFormData(p=>({...p,data:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Incassi 22%</label>
                  <input type="number" step="0.01" value={formData.aliquota_22} onChange={e=>setFormData(p=>({...p,aliquota_22:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Incassi 10%</label>
                  <input type="number" step="0.01" value={formData.aliquota_10} onChange={e=>setFormData(p=>({...p,aliquota_10:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Incassi 4%</label>
                  <input type="number" step="0.01" value={formData.aliquota_4} onChange={e=>setFormData(p=>({...p,aliquota_4:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Esente IVA</label>
                  <input type="number" step="0.01" value={formData.esente} onChange={e=>setFormData(p=>({...p,esente:e.target.value}))}/>
                </div>
                <div className="fg full">
                  <label>Note</label>
                  <input value={formData.note} onChange={e=>setFormData(p=>({...p,note:e.target.value}))} placeholder="Es. Chiusura giornaliera RT"/>
                </div>
              </div>
              
              <div style={{marginTop:'1rem',padding:'.75rem',background:'var(--s2)',borderRadius:8}}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>Totale incasso:</span>
                  <span style={{fontWeight:700,color:'var(--gold)'}}>
                    {fmt(parseFloat(formData.aliquota_22||0)+parseFloat(formData.aliquota_10||0)+parseFloat(formData.aliquota_4||0)+parseFloat(formData.esente||0))}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuovo(false)}>Annulla</button>
              <button className="btn" onClick={salvaCorrispettivo}>💾 Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function Modello770View({societa}){
  const [loading,setLoading]=useState(true);
  const [annoSel,setAnnoSel]=useState(new Date().getFullYear());
  const [search,setSearch]=useState('');
  const [rows,setRows]=useState([]);
  const [documents,setDocuments]=useState([]);
  const [payments,setPayments]=useState([]);
  const [percipienti,setPercipienti]=useState([]);

  useEffect(()=>{
    if(societa?.id) caricaDati();
  },[societa,annoSel]);

  const caricaDati=async()=>{
    setLoading(true);
    try{
      const [{data:perc},{data:docs},{data:rit}] = await Promise.all([
        contabilitaRepo.getPercipientiBySocieta(societa.id),
        contabilitaRepo.getDocumenti(societa.id),
        contabilitaRepo.getRitenuteByAnnoPerPercipiente(societa.id, annoSel),
      ]);
      setPercipienti(perc||[]);
      setDocuments(docs||[]);
      setPayments(rit||[]);
      setRows(build770RowsFromPayments({
        percipienti: perc || [],
        documenti: docs || [],
        payments: rit || [],
        year: annoSel,
      }));
    }finally{
      setLoading(false);
    }
  };

  const filteredRows = useMemo(()=>{
    const query = search.trim().toLowerCase();
    return rows.filter((row)=>{
      if(!query) return true;
      return [row.percipiente,row.codiceFiscale,row.causaleLabel]
        .filter(Boolean)
        .some((value)=>String(value).toLowerCase().includes(query));
    });
  },[rows,search]);

  const totals = useMemo(()=>({
    percipienti: filteredRows.length,
    compensi: filteredRows.reduce((sum,row)=>sum+Number(row.baseCompensi||0),0),
    ritenute: filteredRows.reduce((sum,row)=>sum+Number(row.ritenuteMaturate||0),0),
    warnings: filteredRows.reduce((sum,row)=>sum+(row.warnings?.length||0),0),
  }),[filteredRows]);

  const export770 = ()=>{
    const lines = [
      `770 ${annoSel} - ${societa?.denominazione || 'Societa'}`,
      '',
      ...filteredRows.map((row)=>[
        row.percipiente,
        row.codiceFiscale || 'CF mancante',
        row.causaleReddituale || 'Causale mancante',
        fmtNumber(row.baseCompensi || 0),
        fmtNumber(row.ritenuteMaturate || 0),
        row.warnings?.length ? `Warning: ${row.warnings.join(', ')}` : 'OK',
      ].join(' | ')),
    ].join('\n')
    const blob = new Blob([lines], { type:'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `770_${societa?.partita_iva || 'societa'}_${annoSel}.txt`
    link.click()
    setTimeout(()=>URL.revokeObjectURL(url), 1500)
  };

  return(
    <div>
      <div className="card" style={{marginBottom:'1rem'}}>
        <div className="card-body">
          <div style={{display:'grid',gridTemplateColumns:'120px 1fr',gap:'.75rem',alignItems:'end'}}>
            <div className="fg" style={{marginBottom:0}}>
              <label>Anno</label>
              <select value={annoSel} onChange={e=>setAnnoSel(parseInt(e.target.value))}>
                {[2024,2025,2026].map((anno)=><option key={anno} value={anno}>{anno}</option>)}
              </select>
            </div>
            <div className="fg" style={{marginBottom:0}}>
              <label>Ricerca</label>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca per percipiente, CF o causale..." />
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{marginBottom:'1rem'}}>
        <div className="stat-card"><div className="stat-val">{totals.percipienti}</div><div className="stat-lbl">Percipienti 770</div></div>
        <div className="stat-card"><div className="stat-val">{fmtNumber(totals.compensi)}</div><div className="stat-lbl">Base compensi</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--rd)'}}>{fmtNumber(totals.ritenute)}</div><div className="stat-lbl">Ritenute maturate</div></div>
        <div className="stat-card"><div className="stat-val">{totals.warnings}</div><div className="stat-lbl">Review point</div></div>
      </div>

      {loading ? (
        <div className="loading">Caricamento...</div>
      ) : filteredRows.length === 0 ? (
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{color:'var(--mu)'}}>Nessuna parcella pagata rilevante per il 770 nell'anno {annoSel}.</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)',marginTop:'.5rem'}}>Il 770 viene alimentato solo dai pagamenti maturati e non dai documenti solo registrati.</div>
        </div>
      ) : (
        <>
          <div className="card" style={{marginBottom:'1rem'}}>
            <div className="card-hdr">
              <div className="card-title-wrap">
                <div className="card-title">Quadro 770 da pagamenti maturati</div>
                <div className="card-subtitle">Solo parcelle pagate, con esclusione dei forfettari e warning non bloccanti.</div>
              </div>
              <div className="card-actions">
                <button className="btn-sec" onClick={caricaDati}>Aggiorna dati</button>
                <button className="btn" onClick={export770}>Esporta</button>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Percipiente</th>
                    <th>Codice fiscale</th>
                    <th>Causale</th>
                    <th style={{textAlign:'right'}}>Base compensi</th>
                    <th style={{textAlign:'right'}}>Ritenuta</th>
                    <th>Stato</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row)=>(
                    <tr key={row.key} data-selected={row.stato === 'ok'}>
                      <td>
                        <div style={{fontWeight:600}}>{row.percipiente}</div>
                        <div style={{fontSize:'.7rem',color:'var(--mu)'}}>{row.movimenti.length} pagamenti collegati</div>
                      </td>
                      <td style={{fontFamily:'monospace'}}>{row.codiceFiscale || EMPTY_CELL}</td>
                      <td>{row.causaleReddituale ? `${row.causaleReddituale} - ${row.causaleLabel}` : 'Da definire'}</td>
                      <td style={{textAlign:'right'}}>{fmtNumber(row.baseCompensi || 0)}</td>
                      <td style={{textAlign:'right'}}>{fmtNumber(row.ritenuteMaturate || 0)}</td>
                      <td>
                        <span className={`bdg ${row.stato === 'ok' ? 'bdg-green' : 'bdg-gold'}`}>
                          {row.stato === 'ok' ? 'Allineato' : 'Da rivedere'}
                        </span>
                      </td>
                      <td>
                        {row.warnings?.length ? (
                          <div style={{display:'grid',gap:4}}>
                            {row.warnings.slice(0,2).map((warning)=><span key={warning} className="bdg bdg-red">{warning}</span>)}
                          </div>
                        ) : (
                          <span className="bdg bdg-green">Nessuna anomalia</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="alert alert-info">
            Il 770 legge solo compensi e ritenute maturati sui pagamenti. Le sole registrazioni RP o RPPC preparano i dati, ma non alimentano il quadro fiscale finche il pagamento non viene registrato.
          </div>
        </>
      )}
    </div>
  );
}


function IntrastatView({societa}){
  const [operazioni,setOperazioni]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modalNuova,setModalNuova]=useState(false);
  const [tipoSel,setTipoSel]=useState('cessioni');
  const [periodoSel,setPeriodoSel]=useState({anno:new Date().getFullYear(),mese:new Date().getMonth()+1});
  const [formData,setFormData]=useState({
    tipo:'cessione',
    data:new Date().toISOString().split('T')[0],
    paese_ue:'DE',
    partita_iva_ue:'',
    valore:0,
    natura_transazione:'1',
    nomenclatura:'',
    massa_netta:0,
    unita_supplementari:0,
    valore_statistico:0,
    condizioni_consegna:'EXW',
    modo_trasporto:'3',
    note:''
  });

  const paesiUE=[
    {code:'AT',name:'Austria'},{code:'BE',name:'Belgio'},{code:'BG',name:'Bulgaria'},
    {code:'CY',name:'Cipro'},{code:'HR',name:'Croazia'},{code:'DK',name:'Danimarca'},
    {code:'EE',name:'Estonia'},{code:'FI',name:'Finlandia'},{code:'FR',name:'Francia'},
    {code:'DE',name:'Germania'},{code:'GR',name:'Grecia'},{code:'IE',name:'Irlanda'},
    {code:'LV',name:'Lettonia'},{code:'LT',name:'Lituania'},{code:'LU',name:'Lussemburgo'},
    {code:'MT',name:'Malta'},{code:'NL',name:'Paesi Bassi'},{code:'PL',name:'Polonia'},
    {code:'PT',name:'Portogallo'},{code:'CZ',name:'Rep. Ceca'},{code:'RO',name:'Romania'},
    {code:'SK',name:'Slovacchia'},{code:'SI',name:'Slovenia'},{code:'ES',name:'Spagna'},
    {code:'SE',name:'Svezia'},{code:'HU',name:'Ungheria'}
  ];

  useEffect(()=>{
    if(societa?.id)caricaOperazioni();
  },[societa,tipoSel,periodoSel]);

  const caricaOperazioni=async()=>{
    setLoading(true);
    const inizioMese=`${periodoSel.anno}-${String(periodoSel.mese).padStart(2,'0')}-01`;
    const fineMese=new Date(periodoSel.anno,periodoSel.mese,0).toISOString().split('T')[0];
    
    const{data}=await contabilitaRepo.getIntrastatOperazioni(societa.id, tipoSel==='cessioni'?'cessione':'acquisto', inizioMese, fineMese);
    setOperazioni(data||[]);
    setLoading(false);
  };

  const salvaOperazione=async()=>{
    const record={
      societa_id:societa.id,
      tipo:tipoSel==='cessioni'?'cessione':'acquisto',
      data:formData.data,
      paese_ue:formData.paese_ue,
      partita_iva_ue:formData.partita_iva_ue,
      valore:parseFloat(formData.valore||0),
      natura_transazione:formData.natura_transazione,
      nomenclatura:formData.nomenclatura,
      massa_netta:parseFloat(formData.massa_netta||0),
      unita_supplementari:parseInt(formData.unita_supplementari||0),
      valore_statistico:parseFloat(formData.valore_statistico||0),
      condizioni_consegna:formData.condizioni_consegna,
      modo_trasporto:formData.modo_trasporto,
      note:formData.note
    };
    
    const{error}=await contabilitaRepo.insertIntrastatOperazione(record);
    if(error){
      if(error.code==='42P01'){
        alert('Tabella intrastat_operazioni non trovata. Crea la tabella nel database.');
      }else{
        alert('Errore: '+error.message);
      }
      return;
    }
    setModalNuova(false);
    caricaOperazioni();
  };

  const generaFileIntrastat=()=>{
    if(operazioni.length===0){
      alert('Nessuna operazione da esportare per il periodo selezionato');
      return;
    }

    let contenuto=`INTRASTAT - ${tipoSel.toUpperCase()} - ${String(periodoSel.mese).padStart(2,'0')}/${periodoSel.anno}
SOSTITUTO: ${societa?.denominazione||''} - P.IVA: ${societa?.partita_iva||''}

`;

    const totale=operazioni.reduce((s,o)=>s+parseFloat(o.valore||0),0);

    operazioni.forEach((o,i)=>{
      contenuto+=`${String(i+1).padStart(3,'0')}|${o.paese_ue}|${o.partita_iva_ue||''}|${o.valore.toFixed(2)}|${o.natura_transazione}|${o.nomenclatura||''}|${o.modo_trasporto}
`;
    });

    contenuto+=`
TOTALE OPERAZIONI: ${operazioni.length}
VALORE TOTALE: EUR ${totale.toFixed(2)}
`;

    const blob=new Blob([contenuto],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`INTRASTAT_${tipoSel.toUpperCase()}_${periodoSel.anno}${String(periodoSel.mese).padStart(2,'0')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = fmtNumber;
  const mesi=['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

  const totalePeriodo=operazioni.reduce((s,o)=>s+parseFloat(o.valore||0),0);

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>Intrastat</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Operazioni intracomunitarie cessioni/acquisti</div>
        </div>
        <button className="btn" onClick={()=>setModalNuova(true)}>+ Nuova Operazione</button>
      </div>

      {/* Filtri */}
      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'1rem',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:'.5rem'}}>
            <button className={'pill '+(tipoSel==='cessioni'?'active':'')} onClick={()=>setTipoSel('cessioni')}>📤 Cessioni (Vendite)</button>
            <button className={'pill '+(tipoSel==='acquisti'?'active':'')} onClick={()=>setTipoSel('acquisti')}>📥 Acquisti</button>
          </div>
          <div className="fg" style={{minWidth:100}}>
            <label>Mese</label>
            <select value={periodoSel.mese} onChange={e=>setPeriodoSel(p=>({...p,mese:parseInt(e.target.value)}))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m=><option key={m} value={m}>{mesi[m]}</option>)}
            </select>
          </div>
          <div className="fg" style={{minWidth:100}}>
            <label>Anno</label>
            <select value={periodoSel.anno} onChange={e=>setPeriodoSel(p=>({...p,anno:parseInt(e.target.value)}))}>
              {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <button className="btn-sec" onClick={generaFileIntrastat} disabled={operazioni.length===0}>📥 Esporta File</button>
          <div style={{marginLeft:'auto',textAlign:'right'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)'}}>Totale periodo</div>
            <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--gold)'}}>{fmt(totalePeriodo)}</div>
          </div>
        </div>
      </div>

      {/* Tabella */}
      {loading?(
        <div className="loading">Caricamento...</div>
      ):operazioni.length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{color:'var(--mu)'}}>Nessuna operazione {tipoSel} per {mesi[periodoSel.mese]} {periodoSel.anno}</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Paese</th>
                  <th>P.IVA UE</th>
                  <th style={{textAlign:'right'}}>Valore</th>
                  <th>Natura</th>
                  <th>NC</th>
                </tr>
              </thead>
              <tbody>
                {operazioni.map(o=>(
                  <tr key={o.id}>
                    <td>{new Date(o.data).toLocaleDateString('it-IT')}</td>
                    <td><strong>{o.paese_ue}</strong></td>
                    <td style={{fontFamily:'monospace',fontSize:'.75rem'}}>{o.partita_iva_ue||EMPTY_CELL}</td>
                    <td style={{textAlign:'right',fontWeight:600}}>{fmt(o.valore)}</td>
                    <td>{o.natura_transazione}</td>
                    <td>{o.nomenclatura||EMPTY_CELL}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuova Operazione */}
      {modalNuova&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuova(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">Nuova Operazione Intrastat</div>
              <div className="modal-sub">{tipoSel==='cessioni'?'Cessione (vendita)':'Acquisto'} intracomunitario</div>
              <button className="modal-close" onClick={()=>setModalNuova(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg">
                  <label>Data operazione</label>
                  <input type="date" value={formData.data} onChange={e=>setFormData(p=>({...p,data:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Paese UE</label>
                  <select value={formData.paese_ue} onChange={e=>setFormData(p=>({...p,paese_ue:e.target.value}))}>
                    {paesiUE.map(p=><option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>P.IVA controparte UE</label>
                  <input value={formData.partita_iva_ue} onChange={e=>setFormData(p=>({...p,partita_iva_ue:e.target.value}))} placeholder="DE123456789"/>
                </div>
                <div className="fg">
                  <label>Valore (EUR)</label>
                  <input type="number" step="0.01" value={formData.valore} onChange={e=>setFormData(p=>({...p,valore:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Natura transazione</label>
                  <select value={formData.natura_transazione} onChange={e=>setFormData(p=>({...p,natura_transazione:e.target.value}))}>
                    <option value="1">1 - Compravendita</option>
                    <option value="2">2 - Restituzione</option>
                    <option value="3">3 - Gratuita</option>
                    <option value="4">4 - Lavorazione</option>
                    <option value="9">9 - Altro</option>
                  </select>
                </div>
                <div className="fg">
                  <label>Nomenclatura combinata</label>
                  <input value={formData.nomenclatura} onChange={e=>setFormData(p=>({...p,nomenclatura:e.target.value}))} placeholder="84719000"/>
                </div>
                <div className="fg">
                  <label>Modo trasporto</label>
                  <select value={formData.modo_trasporto} onChange={e=>setFormData(p=>({...p,modo_trasporto:e.target.value}))}>
                    <option value="1">1 - Marittimo</option>
                    <option value="2">2 - Ferroviario</option>
                    <option value="3">3 - Stradale</option>
                    <option value="4">4 - Aereo</option>
                    <option value="5">5 - Postale</option>
                    <option value="7">7 - Condotta</option>
                    <option value="9">9 - Proprio</option>
                  </select>
                </div>
                <div className="fg">
                  <label>Condizioni consegna</label>
                  <select value={formData.condizioni_consegna} onChange={e=>setFormData(p=>({...p,condizioni_consegna:e.target.value}))}>
                    <option value="EXW">EXW - Franco fabbrica</option>
                    <option value="FCA">FCA - Franco vettore</option>
                    <option value="CPT">CPT - Porto pagato</option>
                    <option value="CIP">CIP - Porto e assic. pagati</option>
                    <option value="DAP">DAP - Reso al luogo</option>
                    <option value="DDP">DDP - Reso sdoganato</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuova(false)}>Annulla</button>
              <button className="btn" onClick={salvaOperazione}>💾 Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function IvaAnnualeView({societa,scritture,causaliIva}){
  const [loading,setLoading]=useState(false);
  const [annoSel,setAnnoSel]=useState(new Date().getFullYear()-1);
  const [liquidazioni,setLiquidazioni]=useState([]);
  const [datiIva,setDatiIva]=useState({
    operazioni_attive:0,
    operazioni_passive:0,
    iva_esigibile:0,
    iva_detratta:0,
    iva_dovuta:0,
    credito_anno_prec:0,
    acconti_versati:0,
    totale_dovuto:0,
    credito_risultante:0
  });
  const [generando,setGenerando]=useState(false);

  useEffect(()=>{
    if(societa?.id)caricaDati();
  },[societa,annoSel]);

  const caricaDati=async()=>{
    setLoading(true);
    
    // Carica liquidazioni canoniche dell'anno
    const { data } = await contabilitaRepo.getLiquidazioniIvaCanoniche(societa.id);
    const mapped = (data || []).map(mapLiquidazioneForUi).filter((l) => l && l.anno === annoSel);
    setLiquidazioni(mapped);
    
    if(mapped.length>0){
      const totIvaVendite=mapped.reduce((s,l)=>s+parseFloat(l.iva_vendite||0),0);
      const totIvaAcquisti=mapped.reduce((s,l)=>s+parseFloat(l.iva_acquisti||0),0);
      const totSaldo=mapped.reduce((s,l)=>s+parseFloat(l.saldo||0),0);
      const creditoFinale=mapped.length>0?parseFloat(mapped[mapped.length-1]?.credito_da_riportare||0):0;
      
      setDatiIva({
        operazioni_attive:totIvaVendite/0.22, // stima imponibile
        operazioni_passive:totIvaAcquisti/0.22,
        iva_esigibile:totIvaVendite,
        iva_detratta:totIvaAcquisti,
        iva_dovuta:Math.max(0,totSaldo),
        credito_anno_prec:0,
        acconti_versati:0,
        totale_dovuto:Math.max(0,totSaldo),
        credito_risultante:creditoFinale
      });
    }else{
      setDatiIva({
        operazioni_attive:0,
        operazioni_passive:0,
        iva_esigibile:0,
        iva_detratta:0,
        iva_dovuta:0,
        credito_anno_prec:0,
        acconti_versati:0,
        totale_dovuto:0,
        credito_risultante:0
      });
    }

    setLoading(false);
  };

  const fmt = fmtNumber;

  const generaDichiarazione=()=>{
    setGenerando(true);
    
    const contenuto=`
+-----------------------------------------------------------------------------+
|                    DICHIARAZIONE IVA ANNUALE ${annoSel}                    |
+-----------------------------------------------------------------------------+
| CONTRIBUENTE                                                                |
| Denominazione: ${(societa?.denominazione||'').padEnd(55)}|
| P.IVA: ${(societa?.partita_iva||'').padEnd(63)}|
| C.F.: ${(societa?.codice_fiscale||'').padEnd(64)}|
+-----------------------------------------------------------------------------+
| QUADRO VE - OPERAZIONI ATTIVE                                               |
+-----------------------------------------------------------------------------+
| VE50 - Totale imponibile operazioni attive     €  ${fmt(datiIva.operazioni_attive).padStart(18)}  |
| VE26 - Totale IVA operazioni attive            €  ${fmt(datiIva.iva_esigibile).padStart(18)}  |
+-----------------------------------------------------------------------------+
| QUADRO VF - OPERAZIONI PASSIVE                                              |
+-----------------------------------------------------------------------------+
| VF27 - Totale imponibile operazioni passive    €  ${fmt(datiIva.operazioni_passive).padStart(18)}  |
| VF27 - Totale IVA detraibile                   €  ${fmt(datiIva.iva_detratta).padStart(18)}  |
+-----------------------------------------------------------------------------+
| QUADRO VL - LIQUIDAZIONE ANNUALE                                            |
+-----------------------------------------------------------------------------+
| VL1  - IVA a debito (VE26)                     €  ${fmt(datiIva.iva_esigibile).padStart(18)}  |
| VL2  - IVA detraibile (VF27)                   €  ${fmt(datiIva.iva_detratta).padStart(18)}  |
| VL3  - Differenza (VL1 - VL2)                  €  ${fmt(datiIva.iva_esigibile-datiIva.iva_detratta).padStart(18)}  |
| VL30 - Credito anno precedente                 €  ${fmt(datiIva.credito_anno_prec).padStart(18)}  |
| VL32 - IVA versata (acconti + liquidazioni)    €  ${fmt(datiIva.acconti_versati).padStart(18)}  |
+-----------------------------------------------------------------------------+
| ${datiIva.totale_dovuto>0?'VL38 - IVA DA VERSARE':'VL33 - CREDITO IVA'}                          €  ${fmt(datiIva.totale_dovuto>0?datiIva.totale_dovuto:datiIva.credito_risultante).padStart(18)}  |
+-----------------------------------------------------------------------------+

=============================================================================
                    DETTAGLIO LIQUIDAZIONI PERIODICHE ${annoSel}
=============================================================================
Periodo      IVA Vendite    IVA Acquisti   IVA Dovuta      Credito
-----------------------------------------------------------------------------
${liquidazioni.length>0?liquidazioni.map(l=>`${(l.tipo_periodo==='trimestrale'?`${l.periodo}° Trim`:l.periodo.toString().padStart(2,'0')+'/'+l.anno).padEnd(12)} ${fmt(l.iva_vendite).padStart(14)} ${fmt(l.iva_acquisti).padStart(14)} ${fmt(l.iva_dovuta).padStart(14)} ${fmt(l.credito_da_riportare).padStart(14)}`).join('\n'):'Nessuna liquidazione periodica registrata'}
-----------------------------------------------------------------------------
TOTALE       ${fmt(datiIva.iva_esigibile).padStart(14)} ${fmt(datiIva.iva_detratta).padStart(14)} ${fmt(datiIva.iva_dovuta).padStart(14)} ${fmt(datiIva.credito_risultante).padStart(14)}

Documento generato da FiscoSim - ${new Date().toLocaleDateString('it-IT')} ${new Date().toLocaleTimeString('it-IT')}
`;

    const blob=new Blob([contenuto],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`IVA_Annuale_${societa?.partita_iva||'000'}_${annoSel}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    setGenerando(false);
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>Dichiarazione IVA Annuale</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Riepilogo e generazione dichiarazione IVA</div>
        </div>
        <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
          <select value={annoSel} onChange={e=>setAnnoSel(parseInt(e.target.value))} style={{width:100}}>
            {[2023,2024,2025].map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn" onClick={generaDichiarazione} disabled={generando}>
            {generando?'⏳...':'📥 Genera Report'}
          </button>
        </div>
      </div>

      {loading?(
        <div className="loading">Caricamento...</div>
      ):(
        <>
          {/* Riepilogo */}
          <div className="stats-grid" style={{marginBottom:'1rem'}}>
            <div className="stat-card">
              <div className="stat-ico">📤</div>
              <div className="stat-val">{fmt(datiIva.operazioni_attive)}</div>
              <div className="stat-lbl">Operazioni attive</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">📥</div>
              <div className="stat-val">{fmt(datiIva.operazioni_passive)}</div>
              <div className="stat-lbl">Operazioni passive</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">💰</div>
              <div className="stat-val" style={{color:'var(--rd)'}}>{fmt(datiIva.iva_esigibile)}</div>
              <div className="stat-lbl">IVA esigibile</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico" aria-hidden="true">CR</div>
              <div className="stat-val" style={{color:'var(--gr)'}}>{fmt(datiIva.iva_detratta)}</div>
              <div className="stat-lbl">IVA detratta</div>
            </div>
          </div>

          {/* Quadro riepilogativo */}
          <div className="card" style={{marginBottom:'1rem'}}>
            <div style={{fontWeight:600,marginBottom:'1rem',borderBottom:'1px solid var(--bd)',paddingBottom:'.5rem'}}>Quadro Riepilogativo {annoSel}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'.5rem'}}>
              <span>Totale IVA a debito (operazioni attive)</span>
              <span style={{textAlign:'right',fontWeight:600}}>{fmt(datiIva.iva_esigibile)}</span>
              
              <span>Totale IVA a credito (operazioni passive)</span>
              <span style={{textAlign:'right',fontWeight:600,color:'var(--gr)'}}>- {fmt(datiIva.iva_detratta)}</span>
              
              <span>Credito anno precedente</span>
              <span style={{textAlign:'right',fontWeight:600,color:'var(--gr)'}}>- {fmt(datiIva.credito_anno_prec)}</span>
              
              <span>IVA versata (liquidazioni periodiche)</span>
              <span style={{textAlign:'right',fontWeight:600,color:'var(--gr)'}}>- {fmt(datiIva.acconti_versati)}</span>
              
              <div style={{gridColumn:'1/-1',borderTop:'2px solid var(--bd)',paddingTop:'.5rem',marginTop:'.5rem'}}/>
              
              {datiIva.totale_dovuto>0?(
                <>
                  <span style={{fontWeight:700,color:'var(--rd)'}}>IVA DA VERSARE</span>
                  <span style={{textAlign:'right',fontWeight:700,fontSize:'1.1rem',color:'var(--rd)'}}>{fmt(datiIva.totale_dovuto)}</span>
                </>
              ):(
                <>
                  <span style={{fontWeight:700,color:'var(--gr)'}}>CREDITO IVA</span>
                  <span style={{textAlign:'right',fontWeight:700,fontSize:'1.1rem',color:'var(--gr)'}}>{fmt(datiIva.credito_risultante)}</span>
                </>
              )}
            </div>
          </div>

          {/* Dettaglio liquidazioni */}
          <div className="card">
            <div style={{fontWeight:600,marginBottom:'.75rem'}}>Liquidazioni Periodiche {annoSel}</div>
            {liquidazioni.length===0?(
              <div className="alert alert-warn">
                ⚠️ Nessuna liquidazione periodica registrata per il {annoSel}. Vai su "Liquidazioni IVA" per registrare le liquidazioni.
              </div>
            ):(
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Periodo</th>
                      <th style={{textAlign:'right'}}>IVA Vendite</th>
                      <th style={{textAlign:'right'}}>IVA Acquisti</th>
                      <th style={{textAlign:'right'}}>IVA Dovuta</th>
                      <th style={{textAlign:'right'}}>Credito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidazioni.map(l=>(
                      <tr key={l.id}>
                        <td><strong>{l.tipo_periodo==='trimestrale'?`${l.periodo}° Trimestre`:`${l.periodo}/${l.anno}`}</strong></td>
                        <td style={{textAlign:'right'}}>{fmt(l.iva_vendite)}</td>
                        <td style={{textAlign:'right'}}>{fmt(l.iva_acquisti)}</td>
                        <td style={{textAlign:'right',color:l.iva_dovuta>0?'var(--rd)':'inherit',fontWeight:l.iva_dovuta>0?700:'normal'}}>{l.iva_dovuta>0?fmt(l.iva_dovuta):EMPTY_CELL}</td>
                        <td style={{textAlign:'right',color:l.credito_da_riportare>0?'var(--gr)':'inherit'}}>{l.credito_da_riportare>0?fmt(l.credito_da_riportare):EMPTY_CELL}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'var(--s2)',fontWeight:700}}>
                      <td>TOTALE</td>
                      <td style={{textAlign:'right'}}>{fmt(liquidazioni.reduce((s,l)=>s+parseFloat(l.iva_vendite||0),0))}</td>
                      <td style={{textAlign:'right'}}>{fmt(liquidazioni.reduce((s,l)=>s+parseFloat(l.iva_acquisti||0),0))}</td>
                      <td style={{textAlign:'right',color:'var(--rd)'}}>{fmt(liquidazioni.reduce((s,l)=>s+parseFloat(l.iva_dovuta||0),0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="alert alert-info" style={{marginTop:'1rem'}}>
            💡 La dichiarazione IVA annuale deve essere presentata entro il 30 aprile dell'anno successivo. Il report generato è un riepilogo interno, per la presentazione ufficiale usare il software dell'Agenzia delle Entrate.
          </div>
        </>
      )}
    </div>
  );
}


function PercipientiView({societa,onRefresh}){
  const currentYear = new Date().getFullYear()
  const emptyForm={
    tipo_persona:'fisica',
    codice_fiscale:'',
    partita_iva:'',
    ragione_sociale:'',
    nome:'',
    cognome:'',
    data_nascita:'',
    comune_nascita:'',
    provincia_nascita:'',
    sesso:'M',
    indirizzo:'',
    cap:'',
    citta:'',
    provincia:'',
    paese:'',
    residenza_fiscale:'Italia',
    email:'',
    telefono:'',
    iban:'',
    modalita_pagamento:'bonifico',
    tipo_percipiente:'professionista',
    regime_fiscale:'ordinario',
    soggetto_ritenuta:true,
    tipo_ritenuta:'acconto',
    aliquota_ritenuta:20,
    soggetto_cu:true,
    soggetto_770:true,
    cassa_previdenziale:'',
    rivalsa:'',
    payment_schedule_1040:true,
    causale_prevalente:'A',
    note:'',
    attivo:true
  };

  const [percipienti,setPercipienti]=useState([]);
  const [documenti,setDocumenti]=useState([]);
  const [ritenuteRows,setRitenuteRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [syncSummary,setSyncSummary]=useState(null);
  const [modalOpen,setModalOpen]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [viewOnly,setViewOnly]=useState(false);
  const [searchTerm,setSearchTerm]=useState('');
  const [tipoFilter,setTipoFilter]=useState('tutti');
  const [statoFilter,setStatoFilter]=useState('attivo');
  const [scopeFilter,setScopeFilter]=useState('tutti');
  const [availableColumns,setAvailableColumns]=useState(new Set());
  const [formData,setFormData]=useState(emptyForm);

  useEffect(()=>{
    if(societa?.id) caricaPercipienti(true);
  },[societa]);

  const normalize = (value)=>String(value||'').trim().toUpperCase().replace(/\s+/g,' ');
  const normalizeVat = (value)=>String(value||'').trim().toUpperCase().replace(/\s+/g,'');
  const getDisplayName=(p)=>p.ragione_sociale||`${p.cognome||''} ${p.nome||''}`.trim()||'N/D';

  const caricaPercipienti=async(syncRegistry=false)=>{
    setLoading(true);
    try{
      let summary = syncSummary;
      if(syncRegistry){
        setSyncing(true);
        try{
          summary = await syncPercipientiRegistryForSocieta(societa.id);
          setSyncSummary(summary);
        }finally{
          setSyncing(false);
        }
      }
      const [{data,error},{data:docs,error:docsError},{data:rit,error:ritError}] = await Promise.all([
        contabilitaRepo.getPercipientiBySocieta(societa.id),
        contabilitaRepo.getDocumenti(societa.id),
        contabilitaRepo.getRitenuteByAnnoPerPercipiente(societa.id, currentYear)
      ]);
      if(error) throw error;
      if(docsError) throw docsError;
      if(ritError) throw ritError;
      const rows=data||[];
      const keys=new Set();
      rows.forEach((row)=>Object.keys(row||{}).forEach((key)=>keys.add(key)));
      setAvailableColumns(keys);
      setPercipienti(rows);
      setDocumenti(docs||[]);
      setRitenuteRows(rit||[]);
      if(summary) setSyncSummary(summary);
    }catch(err){
      alert('Errore caricamento percipienti: '+(err?.message||err));
    }finally{
      setLoading(false);
    }
  };

  const buildMatchKey=(row)=>{
    const cf = normalize(row?.codice_fiscale);
    const piva = normalizeVat(row?.partita_iva);
    const den = normalize(getDisplayName(row));
    return cf || piva || den;
  };

  const metricsByPercipiente = useMemo(()=>{
    const map = new Map();
    const ensure = (key)=>{
      if(!map.has(key)) map.set(key,{compensiYtd:0,ritenuteYtd:0,lastInvoiceDate:null,linkedDocs:0});
      return map.get(key);
    };

    percipienti.forEach((p)=>ensure(buildMatchKey(p)));

    (documenti||[]).forEach((doc)=>{
      const key = normalize(doc?.soggetto_cf) || normalizeVat(doc?.soggetto_piva) || normalize(doc?.soggetto_denominazione);
      if(!key) return;
      const bucket = ensure(key);
      bucket.linkedDocs += 1;
      const dataDoc = String(doc?.data_documento || '');
      if(dataDoc && (!bucket.lastInvoiceDate || dataDoc > bucket.lastInvoiceDate)) bucket.lastInvoiceDate = dataDoc;
      const amount = Number(doc?.imponibile || doc?.totale || 0);
      if(dataDoc.startsWith(String(currentYear))) bucket.compensiYtd += amount;
    });

    (ritenuteRows||[]).forEach((row)=>{
      const key = normalize(row?.percipiente_cf) || normalizeVat(row?.percipiente_piva) || normalize(row?.percipiente_denominazione);
      if(!key) return;
      const bucket = ensure(key);
      bucket.ritenuteYtd += Number(row?.ritenuta || 0);
    });

    return map;
  },[percipienti,documenti,ritenuteRows,currentYear]);

  const getIssues=(p, metrics)=>{
    const issues=[];
    if(!(p.codice_fiscale||'').trim()) issues.push('Codice fiscale mancante');
    if(getDisplayName(p)==='N/D') issues.push('Anagrafica incompleta');
    if(!(p.tipo_percipiente||'').trim()) issues.push('Tipo percipiente non definito');
    if(!(p.regime_fiscale||'').trim()) issues.push('Regime fiscale da completare');
    if((p.soggetto_ritenuta ?? true) && !p.tipo_ritenuta) issues.push('Tipo ritenuta non definito');
    if((p.soggetto_ritenuta ?? true) && (p.aliquota_ritenuta===null || p.aliquota_ritenuta===undefined || p.aliquota_ritenuta==='')) issues.push('Percentuale ritenuta mancante');
    if((p.soggetto_cu ?? true) && !(p.codice_fiscale||'').trim()) issues.push('Dato obbligatorio CU mancante');
    if(String(p.regime_fiscale||'').toLowerCase()==='forfettario' && (p.soggetto_ritenuta ?? true)) issues.push('Verificare coerenza tra regime e ritenuta');
    if((metrics?.linkedDocs||0)>0 && !(p.soggetto_cu ?? false) && !(p.soggetto_770 ?? false)) issues.push('Classificazione fiscale da validare');
    return issues;
  };

  const getValidationState=(row,issues)=>{
    if(row.attivo===false) return 'inattivo';
    if(issues.some((msg)=>/codice fiscale mancante|anagrafica incompleta|dato obbligatorio cu mancante/i.test(msg))) return 'incomplete';
    if(issues.length>0 || row.validation_state==='da_validare') return 'da_validare';
    return 'complete';
  };

  const resetForm=()=>{
    setFormData({...emptyForm});
    setEditingId(null);
    setViewOnly(false);
  };

  const openCreate=()=>{
    resetForm();
    setModalOpen(true);
  };

  const openEdit=(p,{readOnly=false}={})=>{
    setFormData({
      ...emptyForm,
      ...p,
      residenza_fiscale:p.residenza_fiscale||'Italia',
      modalita_pagamento:p.modalita_pagamento||'bonifico',
      tipo_percipiente:p.tipo_percipiente||(p.tipo_persona==='giuridica'?'altro':'professionista'),
      regime_fiscale:p.regime_fiscale||'ordinario',
      soggetto_ritenuta:p.soggetto_ritenuta ?? true,
      tipo_ritenuta:p.tipo_ritenuta||'acconto',
      soggetto_cu:p.soggetto_cu ?? true,
      soggetto_770:p.soggetto_770 ?? true,
      payment_schedule_1040:p.payment_schedule_1040 ?? true,
      attivo:p.attivo ?? true
    });
    setEditingId(p.id);
    setViewOnly(readOnly);
    setModalOpen(true);
  };

  const salvaPercipiente=async()=>{
    if(!(formData.codice_fiscale||'').trim()){
      alert('Il codice fiscale e obbligatorio.');
      return;
    }

    const baseRecord={
      societa_id:societa.id,
      tipo_persona:formData.tipo_persona,
      codice_fiscale:(formData.codice_fiscale||'').trim().toUpperCase(),
      partita_iva:(formData.partita_iva||'').trim(),
      ragione_sociale:formData.ragione_sociale,
      nome:formData.nome,
      cognome:formData.cognome,
      data_nascita:formData.data_nascita,
      comune_nascita:formData.comune_nascita,
      provincia_nascita:formData.provincia_nascita,
      sesso:formData.sesso,
      indirizzo:formData.indirizzo,
      cap:formData.cap,
      citta:formData.citta,
      provincia:formData.provincia,
      email:formData.email,
      telefono:formData.telefono,
      iban:(formData.iban||'').replace(/\s/g,'').toUpperCase(),
      causale_prevalente:formData.causale_prevalente,
      aliquota_ritenuta:Number(formData.aliquota_ritenuta||0),
      note:formData.note,
      attivo:formData.attivo
    };

    const optionalMap={
      paese:formData.paese,
      residenza_fiscale:formData.residenza_fiscale,
      modalita_pagamento:formData.modalita_pagamento,
      tipo_percipiente:formData.tipo_percipiente,
      regime_fiscale:formData.regime_fiscale,
      soggetto_ritenuta:formData.soggetto_ritenuta,
      tipo_ritenuta:formData.tipo_ritenuta,
      soggetto_cu:formData.soggetto_cu,
      soggetto_770:formData.soggetto_770,
      cassa_previdenziale:formData.cassa_previdenziale,
      rivalsa:formData.rivalsa,
      payment_schedule_1040:formData.payment_schedule_1040
    };

    const record={...baseRecord};
    Object.entries(optionalMap).forEach(([key,value])=>{
      if(availableColumns.has(key) || editingId) record[key]=value;
    });

    let error;
    if(editingId){
      ({error}=await contabilitaRepo.updatePercipiente(editingId, record));
    }else{
      ({error}=await contabilitaRepo.insertPercipiente(record));
    }

    if(error){
      alert('Errore: '+error.message);
      return;
    }
    setModalOpen(false);
    resetForm();
    await caricaPercipienti(false);
    if(onRefresh) onRefresh();
  };

  const eliminaPercipiente=async(p)=>{
    const id = p?.id;
    if(!id) return;
    const metrics = p?.metrics || { linkedDocs: 0, ritenuteYtd: 0, lastInvoiceDate: null };
    const hasLinkedData = (metrics?.linkedDocs || 0) > 0 || (metrics?.ritenuteYtd || 0) > 0 || Boolean(metrics?.lastInvoiceDate);

    if(hasLinkedData){
      const ok = confirm(
        `Il soggetto ha dati collegati (${metrics.linkedDocs||0} documenti${metrics.ritenuteYtd?`, ritenute anno ${fmtNumber(metrics.ritenuteYtd)}`:''}).\n\nVerrà disattivato e rimosso dalla vista Percipienti, senza cancellazione definitiva.\n\nConfermi?`
      );
      if(!ok) return;
      await contabilitaRepo.deactivatePercipiente(id);
    }else{
      const ok = confirm('Percipiente senza dati collegati: confermi eliminazione definitiva?');
      if(!ok) return;
      const { error } = await contabilitaRepo.deletePercipiente(id);
      if(error){
        const fallback = confirm(`Impossibile eliminare definitivamente (${error.message}).\n\nVuoi disattivare il percipiente invece?`);
        if(!fallback) return;
        await contabilitaRepo.deactivatePercipiente(id);
      }
    }

    // After removal, keep default view "attivo" so the row disappears.
    setStatoFilter('attivo');
    await caricaPercipienti(false);
    if(onRefresh) onRefresh();
  };

  const normalized=useMemo(()=>percipienti.map((p)=>{
    const metrics = metricsByPercipiente.get(buildMatchKey(p)) || {compensiYtd:0,ritenuteYtd:0,lastInvoiceDate:null,linkedDocs:0};
    const issues=getIssues(p, metrics);
    const validationState = getValidationState(p, issues);
    return{
      ...p,
      displayName:getDisplayName(p),
      tipoLabel:p.tipo_percipiente||(p.tipo_persona==='giuridica'?'Altro':'Professionista'),
      regimeLabel:p.regime_fiscale||'Da definire',
      ritenutaLabel:(p.soggetto_ritenuta ?? false) ? `${Number(p.aliquota_ritenuta||0)}%` : 'No',
      metrics,
      issues,
      validationState
    };
  }),[percipienti,metricsByPercipiente]);

  const filtered=useMemo(()=>normalized.filter((p)=>{
    const search=searchTerm.trim().toLowerCase();
    const matchesSearch=!search
      || p.displayName.toLowerCase().includes(search)
      || (p.codice_fiscale||'').toLowerCase().includes(search)
      || (p.partita_iva||'').toLowerCase().includes(search);
    const matchesTipo=tipoFilter==='tutti' || (p.tipo_percipiente||'professionista')===tipoFilter;
    const matchesStato=statoFilter==='tutti'
      || (statoFilter==='attivo' && p.attivo!==false)
      || (statoFilter==='inattivo' && p.attivo===false)
      || (statoFilter==='complete' && p.validationState==='complete')
      || (statoFilter==='incomplete' && p.validationState==='incomplete')
      || (statoFilter==='da_validare' && p.validationState==='da_validare');
    const matchesScope=scopeFilter==='tutti'
      || (scopeFilter==='cu' && (p.soggetto_cu ?? false))
      || (scopeFilter==='770' && (p.soggetto_770 ?? false))
      || (scopeFilter==='1040' && (p.payment_schedule_1040 ?? false));
    return matchesSearch && matchesTipo && matchesStato && matchesScope;
  }),[normalized,searchTerm,tipoFilter,statoFilter,scopeFilter]);

  const stats=useMemo(()=>{
    const completi=normalized.filter((p)=>p.validationState==='complete').length;
    const daValidare=normalized.filter((p)=>p.validationState==='da_validare').length;
    const incompleti=normalized.filter((p)=>p.validationState==='incomplete').length;
    return{completi,daValidare,incompleti};
  },[normalized]);

  const renderStatusBadge=(row)=>{
    if(row.attivo===false) return <span className="bdg bdg-gray">Inattivo</span>;
    if(row.validationState==='incomplete') return <span className="bdg bdg-red">Incomplete</span>;
    if(row.validationState==='da_validare') return <span className="bdg bdg-gold">Da validare</span>;
    return <span className="bdg bdg-green">Completo</span>;
  };

  return(
    <div>
      <ModuleHeader
        sectionLabel="Adempimenti"
        title="Percipienti"
        context={`${stats.completi} completi · ${stats.daValidare} da validare · ${stats.incompleti} incompleti`}
        primaryAction={<button className="btn" onClick={openCreate}>Nuovo percipiente</button>}
        secondaryAction={<button className="btn-sec" onClick={()=>caricaPercipienti(true)}>{syncing?'Sincronizzazione...':'Import'}</button>}
      />

      <div className="card">
        <div className="toolbar" style={{flexWrap:'wrap',alignItems:'end'}}>
          <div className="fg" style={{minWidth:280,flex:'1 1 320px'}}>
            <label>Ricerca globale</label>
            <input className="search-bar" placeholder="Cerca per nome, ragione sociale, codice fiscale o partita IVA..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
          </div>
          <div className="fg" style={{minWidth:190}}>
            <label>Tipo percipiente</label>
            <BaseCombobox
              value={tipoFilter}
              onChange={(v)=>setTipoFilter(v||'tutti')}
              options={[
                { id: 'tutti', label: 'Tutti' },
                { id: 'professionista', label: 'Professionista' },
                { id: 'collaboratore', label: 'Collaboratore' },
                { id: 'altro', label: 'Altro' },
              ]}
              getOptionId={(o)=>o?.id}
              getOptionLabel={(o)=>o?.label}
              searchable={false}
              placeholder="Tipo percipiente"
            />
          </div>
          <div className="fg" style={{minWidth:180}}>
            <label>Stato</label>
            <BaseCombobox
              value={statoFilter}
              onChange={(v)=>setStatoFilter(v||'attivo')}
              options={[
                { id: 'tutti', label: 'Tutti' },
                { id: 'attivo', label: 'Attivi' },
                { id: 'complete', label: 'Completi' },
                { id: 'da_validare', label: 'Da validare' },
                { id: 'incomplete', label: 'Incompleti' },
                { id: 'inattivo', label: 'Inattivi' },
              ]}
              getOptionId={(o)=>o?.id}
              getOptionLabel={(o)=>o?.label}
              searchable={false}
              placeholder="Stato"
            />
          </div>
          <div className="fg" style={{minWidth:180}}>
            <label>Ambito</label>
            <BaseCombobox
              value={scopeFilter}
              onChange={(v)=>setScopeFilter(v||'tutti')}
              options={[
                { id: 'tutti', label: 'Tutti' },
                { id: 'cu', label: 'Soggetto CU' },
                { id: '770', label: 'Soggetto 770' },
                { id: '1040', label: 'Rilevanza 1040' },
              ]}
              getOptionId={(o)=>o?.id}
              getOptionLabel={(o)=>o?.label}
              searchable={false}
              placeholder="Ambito"
            />
          </div>
        </div>
        {syncSummary&&(
          <div style={{marginTop:12,fontSize:'.75rem',color:'var(--mu)'}}>
            Sync documenti: {syncSummary.scanned||0} analizzati · {syncSummary.created||0} creati · {syncSummary.updated||0} aggiornati
          </div>
        )}
      </div>

      {loading?(
        <div className="loading">Caricamento...</div>
      ):(
        <div className="card">
          {filtered.length===0?(
            <div style={{padding:'1.25rem 0',color:'var(--mu)'}}>Nessun percipiente disponibile con i filtri selezionati.</div>
          ):(
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nome / Ragione sociale</th>
                    <th>Codice fiscale</th>
                    <th>Partita IVA</th>
                    <th>Tipo percipiente</th>
                    <th>Ritenuta</th>
                    <th>Stato</th>
                    <th style={{textAlign:'right'}}>Compensi anno</th>
                    <th style={{textAlign:'right'}}>Ritenute anno</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p)=>(
                    <tr key={p.id} data-selected={p.validationState==='complete'}>
                      <td>
                        <strong>{p.displayName}</strong>
                        <div style={{fontSize:'.75rem',color:'var(--mu)',marginTop:4}}>
                          {p.metrics.linkedDocs||0} documenti collegati{p.metrics.lastInvoiceDate?` · ultima fattura ${p.metrics.lastInvoiceDate}`:''}
                        </div>
                        {p.issues.length>0&&(
                          <div style={{fontSize:'.75rem',color:'var(--mu)',marginTop:4}}>{p.issues[0]}</div>
                        )}
                      </td>
                      <td style={{fontFamily:'monospace',fontSize:'.75rem'}}>{p.codice_fiscale||EMPTY_CELL}</td>
                      <td style={{fontFamily:'monospace',fontSize:'.75rem'}}>{p.partita_iva||EMPTY_CELL}</td>
                      <td>{p.tipoLabel}</td>
                      <td>{p.ritenutaLabel}</td>
                      <td>{renderStatusBadge(p)}</td>
                      <td style={{textAlign:'right',fontWeight:600}}>{fmtNumber(p.metrics.compensiYtd||0)}</td>
                      <td style={{textAlign:'right',fontWeight:600}}>{fmtNumber(p.metrics.ritenuteYtd||0)}</td>
                      <td>
                        <div className="tbl-actions">
                          <button className="btn-icon" onClick={()=>openEdit(p,{readOnly:true})} title="Visualizza">Visualizza</button>
                          <button className="btn-icon" onClick={()=>openEdit(p)} title="Modifica">Modifica</button>
                          <button className="btn-icon" onClick={()=>eliminaPercipiente(p)} title="Rimuovi (disattiva o elimina se isolato)">Rimuovi</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalOpen&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalOpen(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:860,maxHeight:'90vh'}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">{viewOnly?'Scheda percipiente':editingId?'Modifica percipiente':'Nuovo percipiente'}</div>
              <button className="modal-close" onClick={()=>setModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',gap:'.5rem',marginBottom:'1rem'}}>
                <button className={'pill '+(formData.tipo_persona==='fisica'?'active':'')} disabled={viewOnly} onClick={()=>setFormData(p=>({...p,tipo_persona:'fisica'}))}>Persona fisica</button>
                <button className={'pill '+(formData.tipo_persona==='giuridica'?'active':'')} disabled={viewOnly} onClick={()=>setFormData(p=>({...p,tipo_persona:'giuridica'}))}>Persona giuridica</button>
              </div>

              <div className="form-grid">
                {formData.tipo_persona==='giuridica'?(<div className="fg full"><label>Ragione sociale *</label><input disabled={viewOnly} value={formData.ragione_sociale} onChange={e=>setFormData(p=>({...p,ragione_sociale:e.target.value}))}/></div>):(<><div className="fg"><label>Cognome *</label><input disabled={viewOnly} value={formData.cognome} onChange={e=>setFormData(p=>({...p,cognome:e.target.value.toUpperCase()}))}/></div><div className="fg"><label>Nome *</label><input disabled={viewOnly} value={formData.nome} onChange={e=>setFormData(p=>({...p,nome:e.target.value.toUpperCase()}))}/></div></>)}
                <div className="fg"><label>Codice fiscale *</label><input disabled={viewOnly} value={formData.codice_fiscale} onChange={e=>setFormData(p=>({...p,codice_fiscale:e.target.value.toUpperCase()}))} maxLength={16}/></div>
                <div className="fg"><label>Partita IVA</label><input disabled={viewOnly} value={formData.partita_iva} onChange={e=>setFormData(p=>({...p,partita_iva:e.target.value}))} maxLength={11}/></div>
                <div className="fg"><label>Tipo percipiente</label><BaseCombobox disabled={viewOnly} value={formData.tipo_percipiente} onChange={(v)=>setFormData(p=>({...p,tipo_percipiente:v||'professionista'}))} options={[{id:'professionista',label:'Professionista'},{id:'collaboratore',label:'Collaboratore'},{id:'altro',label:'Altro'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Residenza fiscale</label><input disabled={viewOnly} value={formData.residenza_fiscale} onChange={e=>setFormData(p=>({...p,residenza_fiscale:e.target.value}))}/></div>
                <div className="fg"><label>Regime fiscale</label><BaseCombobox disabled={viewOnly} value={formData.regime_fiscale} onChange={(v)=>setFormData(p=>({...p,regime_fiscale:v||'ordinario'}))} options={[{id:'ordinario',label:'Ordinario'},{id:'forfettario',label:'Forfettario'},{id:'semplificato',label:'Semplificato'},{id:'altro',label:'Altro'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Modalita pagamento</label><BaseCombobox disabled={viewOnly} value={formData.modalita_pagamento} onChange={(v)=>setFormData(p=>({...p,modalita_pagamento:v||'bonifico'}))} options={[{id:'bonifico',label:'Bonifico'},{id:'assegno',label:'Assegno'},{id:'contanti',label:'Contanti'},{id:'altro',label:'Altro'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Soggetto a ritenuta</label><BaseCombobox disabled={viewOnly} value={formData.soggetto_ritenuta?'si':'no'} onChange={(v)=>setFormData(p=>({...p,soggetto_ritenuta:v==='si'}))} options={[{id:'si',label:'Si'},{id:'no',label:'No'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Percentuale ritenuta</label><input disabled={viewOnly} type="number" min="0" max="100" value={formData.aliquota_ritenuta} onChange={e=>setFormData(p=>({...p,aliquota_ritenuta:e.target.value}))}/></div>
                <div className="fg"><label>Tipo ritenuta</label><BaseCombobox disabled={viewOnly} value={formData.tipo_ritenuta} onChange={(v)=>setFormData(p=>({...p,tipo_ritenuta:v||'acconto'}))} options={[{id:'acconto',label:'Acconto'},{id:'imposta',label:'Imposta'},{id:'nessuna',label:'Nessuna'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Cassa previdenziale %</label><input disabled={viewOnly} type="number" min="0" max="100" value={formData.cassa_previdenziale||''} onChange={e=>setFormData(p=>({...p,cassa_previdenziale:e.target.value}))}/></div>
                <div className="fg"><label>Rivalsa %</label><input disabled={viewOnly} type="number" min="0" max="100" value={formData.rivalsa||''} onChange={e=>setFormData(p=>({...p,rivalsa:e.target.value}))}/></div>
                <div className="fg"><label>Causale prevalente</label><BaseCombobox disabled={viewOnly} value={formData.causale_prevalente} onChange={(v)=>setFormData(p=>({...p,causale_prevalente:v||'A'}))} options={CAUSALI_REDDITUALI_OPTIONS.map((item)=>({id:item.value,label:item.label}))} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable maxItems={90} /></div>
                <div className="fg"><label>Soggetto CU</label><BaseCombobox disabled={viewOnly} value={formData.soggetto_cu?'si':'no'} onChange={(v)=>setFormData(p=>({...p,soggetto_cu:v==='si'}))} options={[{id:'si',label:'Si'},{id:'no',label:'No'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Soggetto 770</label><BaseCombobox disabled={viewOnly} value={formData.soggetto_770?'si':'no'} onChange={(v)=>setFormData(p=>({...p,soggetto_770:v==='si'}))} options={[{id:'si',label:'Si'},{id:'no',label:'No'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Rilevanza 1040</label><BaseCombobox disabled={viewOnly} value={formData.payment_schedule_1040?'si':'no'} onChange={(v)=>setFormData(p=>({...p,payment_schedule_1040:v==='si'}))} options={[{id:'si',label:'Si'},{id:'no',label:'No'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Stato</label><BaseCombobox disabled={viewOnly} value={formData.attivo?'attivo':'inattivo'} onChange={(v)=>setFormData(p=>({...p,attivo:v!=='inattivo'}))} options={[{id:'attivo',label:'Attivo'},{id:'inattivo',label:'Inattivo'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>

                <div className="fg full" style={{borderTop:'1px solid var(--bd)',paddingTop:'.75rem',marginTop:'.5rem'}}><label style={{fontSize:'.7rem',color:'var(--gold)'}}>Contatti e riferimenti</label></div>
                <div className="fg full"><label>Indirizzo</label><input disabled={viewOnly} value={formData.indirizzo} onChange={e=>setFormData(p=>({...p,indirizzo:e.target.value}))}/></div>
                <div className="fg"><label>CAP</label><input disabled={viewOnly} value={formData.cap} onChange={e=>setFormData(p=>({...p,cap:e.target.value}))} maxLength={5}/></div>
                <div className="fg"><label>Citta</label><input disabled={viewOnly} value={formData.citta} onChange={e=>setFormData(p=>({...p,citta:e.target.value.toUpperCase()}))}/></div>
                <div className="fg"><label>Provincia</label><input disabled={viewOnly} value={formData.provincia} onChange={e=>setFormData(p=>({...p,provincia:e.target.value.toUpperCase()}))} maxLength={2}/></div>
                <div className="fg"><label>Paese</label><input disabled={viewOnly} value={formData.paese} onChange={e=>setFormData(p=>({...p,paese:e.target.value}))}/></div>
                <div className="fg"><label>Email</label><input disabled={viewOnly} type="email" value={formData.email} onChange={e=>setFormData(p=>({...p,email:e.target.value}))}/></div>
                <div className="fg"><label>Telefono</label><input disabled={viewOnly} value={formData.telefono} onChange={e=>setFormData(p=>({...p,telefono:e.target.value}))}/></div>
                <div className="fg full"><label>IBAN</label><input disabled={viewOnly} value={formData.iban} onChange={e=>setFormData(p=>({...p,iban:e.target.value.toUpperCase().replace(/\s/g,'')}))} maxLength={34}/></div>
                <div className="fg full"><label>Note</label><textarea disabled={viewOnly} value={formData.note} onChange={e=>setFormData(p=>({...p,note:e.target.value}))} rows={2}/></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalOpen(false)}>{viewOnly?'Chiudi':'Annulla'}</button>
              {!viewOnly&&<button className="btn" onClick={salvaPercipiente}>Salva</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function RitenuteView({societa}){
  const EMPTY_FORM = {
    percipiente_id:'',
    linked_document_id:'',
    data_pagamento:new Date().toISOString().split('T')[0],
    data_documento:'',
    numero_documento:'',
    compenso_lordo:0,
    causaleReddituale:'A',
    cassa_flag:false,
    cassa_percent:0,
    inps_flag:false,
    enasarco_flag:false,
    quota_non_soggetta:0,
    codice_somme_non_soggette:'',
    withholding_rate:20,
    ritenuta:0,
    compenso_netto:0,
    payment_causale:'',
    note:''
  };
  const [ritenute,setRitenute]=useState([]);
  const [percipienti,setPercipienti]=useState([]);
  const [documenti,setDocumenti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modalNuova,setModalNuova]=useState(false);
  const [modalAudit,setModalAudit]=useState(null);
  const [annoSel,setAnnoSel]=useState(new Date().getFullYear());
  const [manualOverrides,setManualOverrides]=useState({});
  const [formData,setFormData]=useState(EMPTY_FORM);

  useEffect(()=>{
    if(societa?.id)caricaDati();
  },[societa,annoSel]);

  const caricaDati=async()=>{
    setLoading(true);
    const [{data:rit},{data:perc},{data:docs}] = await Promise.all([
      contabilitaRepo.getRitenuteByAnnoPerData(societa.id, annoSel),
      contabilitaRepo.getPercipientiAttivi(societa.id),
      contabilitaRepo.getDocumenti(societa.id),
    ]);
    setRitenute(rit||[]);
    setPercipienti(perc||[]);
    setDocumenti(docs||[]);
    setLoading(false);
  };

  const fmt = fmtNumber;
  const selectedPercipiente = useMemo(
    () => percipienti.find((p)=>p.id===formData.percipiente_id) || null,
    [percipienti, formData.percipiente_id]
  );

  const relatedDocumenti = useMemo(()=>{
    if(!selectedPercipiente) return [];
    const cf = String(selectedPercipiente.codice_fiscale || '').trim().toUpperCase();
    const piva = String(selectedPercipiente.partita_iva || '').trim().toUpperCase();
    const name = String(selectedPercipiente.ragione_sociale || `${selectedPercipiente.cognome||''} ${selectedPercipiente.nome||''}`.trim()).trim().toUpperCase();
    return documenti.filter((doc)=>{
      const docCf = String(doc.soggetto_cf || '').trim().toUpperCase();
      const docPiva = String(doc.soggetto_piva || '').trim().toUpperCase();
      const docName = String(doc.soggetto_denominazione || '').trim().toUpperCase();
      return (cf && docCf === cf) || (piva && docPiva === piva) || (name && docName === name);
    });
  },[documenti, selectedPercipiente]);

  const selectedDocumento = useMemo(
    () => relatedDocumenti.find((doc)=>doc.id===formData.linked_document_id) || null,
    [relatedDocumenti, formData.linked_document_id]
  );

  const selectedDocumentoWorkflow = useMemo(
    ()=>readParcellaWorkflowState(selectedDocumento),
    [selectedDocumento]
  );

  useEffect(()=>{
    if(!modalNuova || !selectedPercipiente) return;
    if(formData.linked_document_id || relatedDocumenti.length===0) return;
    setFormData((prev)=>({...prev,linked_document_id:relatedDocumenti[0].id}));
  },[modalNuova, selectedPercipiente, relatedDocumenti, formData.linked_document_id]);

  useEffect(()=>{
    if(!modalNuova || !selectedDocumento) return;
    setFormData((prev)=>{
      const next = { ...prev };
      let changed = false;
      if(!manualOverrides.data_documento){
        const value = selectedDocumento.data_documento || '';
        if(next.data_documento !== value){ next.data_documento = value; changed = true; }
      }
      if(!manualOverrides.numero_documento){
        const value = selectedDocumento.numero_documento || '';
        if(next.numero_documento !== value){ next.numero_documento = value; changed = true; }
      }
      if(!manualOverrides.compenso_lordo){
        const value = Number(selectedDocumentoWorkflow?.taxableBaseOpen ?? selectedDocumento.imponibile ?? selectedDocumento.totale ?? 0);
        if(Number(next.compenso_lordo || 0) !== value){ next.compenso_lordo = value; changed = true; }
      }
      if(!manualOverrides.ritenuta){
        const value = Number(selectedDocumentoWorkflow?.withholdingPayableOpen ?? prev.ritenuta ?? 0);
        if(Number(next.ritenuta || 0) !== value){ next.ritenuta = value; changed = true; }
      }
      return changed ? next : prev;
    });
  },[modalNuova, selectedDocumento, selectedDocumentoWorkflow, manualOverrides]);

  const decision = useMemo(
    ()=>buildParcellaDecision({ percipiente:selectedPercipiente, documentRow:selectedDocumento, draft:formData }),
    [selectedPercipiente, selectedDocumento, formData]
  );

  useEffect(()=>{
    if(!modalNuova) return;
    const proposal = decision.proposal;
    setFormData((prev)=>{
      const next = { ...prev };
      let changed = false;
      const syncField = (key, value) => {
        if (manualOverrides[key]) return;
        if ((next[key] ?? '') !== (value ?? '')) {
          next[key] = value;
          changed = true;
        }
      };
      syncField('causaleReddituale', proposal.causaleReddituale);
      syncField('cassa_flag', proposal.cassaFlag);
      syncField('cassa_percent', proposal.cassaPercent);
      syncField('inps_flag', proposal.inpsFlag);
      syncField('enasarco_flag', proposal.enasarcoFlag);
      syncField('quota_non_soggetta', proposal.quotaNonSoggetta);
      syncField('codice_somme_non_soggette', proposal.codiceSommeNonSoggette);
      syncField('withholding_rate', proposal.withholdingRate);
      syncField('ritenuta', proposal.withholdingAmount);
      syncField('compenso_netto', proposal.compensoNetto);
      syncField('payment_causale', proposal.paymentCausale);
      return changed ? next : prev;
    });
  },[modalNuova, decision, manualOverrides]);

  const finalDownstream = useMemo(()=>{
    const isForfettario = String(formData.codice_somme_non_soggette||'') === '24' || decision.signals.isForfettario;
    const hasRitenuta = Number(formData.ritenuta || 0) > 0;
    return {
      updateCu: !isForfettario && Boolean(selectedPercipiente?.soggetto_cu ?? hasRitenuta),
      update770: !isForfettario && Boolean(selectedPercipiente?.soggetto_770 ?? hasRitenuta),
      updateWithholdingSchedule: !isForfettario && hasRitenuta,
      paymentSchedule1040: !isForfettario && Boolean(selectedPercipiente?.payment_schedule_1040 ?? hasRitenuta),
    };
  },[formData.codice_somme_non_soggette, formData.ritenuta, decision.signals.isForfettario, selectedPercipiente]);

  const paymentWorkflow = useMemo(()=>{
    const registrationCausale = String(
      selectedDocumentoWorkflow?.registrationCausale ||
      decision.proposal.registrationCausale ||
      ''
    ).toUpperCase();
    const paymentCausale = registrationCausale === 'FF'
      ? 'PF'
      : registrationCausale === 'RPPC'
        ? 'PPPC'
        : 'PF80';
    const taxableBasePaid = Number(formData.compenso_lordo || 0);
    const withholdingPaid = Number(formData.ritenuta || 0);
    const accountingPaid = Math.max(0, Number(formData.compenso_netto || 0));
    const simulatedState = selectedDocumentoWorkflow
      ? applyPaymentToParcellaWorkflow(selectedDocumentoWorkflow, {
          paymentDate: formData.data_pagamento,
          paymentCausale,
          taxableBasePaid,
          accountingPaid,
          withholdingPaid,
        })
      : null;
    return { registrationCausale, paymentCausale, taxableBasePaid, withholdingPaid, accountingPaid, simulatedState };
  },[decision.proposal.registrationCausale, formData.compenso_lordo, formData.compenso_netto, formData.data_pagamento, formData.ritenuta, selectedDocumentoWorkflow]);

  const updateField = (key, value, manual = true) => {
    if (manual) setManualOverrides((prev)=>({ ...prev, [key]: true }));
    setFormData((prev)=>({ ...prev, [key]: value }));
  };

  const openNuovaRitenuta = () => {
    setManualOverrides({});
    setFormData({ ...EMPTY_FORM, data_pagamento:new Date().toISOString().split('T')[0] });
    setModalNuova(true);
  };

  const onPercipienteChange = (id) => {
    setManualOverrides({});
    setFormData((prev)=>({
      ...EMPTY_FORM,
      data_pagamento: prev.data_pagamento || new Date().toISOString().split('T')[0],
      percipiente_id:id,
    }));
  };

  const salvaRitenuta=async()=>{
    const perc=selectedPercipiente;
    if(!perc){alert('Seleziona un percipiente');return;}

    const proposal = decision.proposal;
    const finalValues = {
      causaleReddituale: formData.causaleReddituale,
      cassaFlag: Boolean(formData.cassa_flag),
      cassaPercent: Number(formData.cassa_percent || 0),
      inpsFlag: Boolean(formData.inps_flag),
      enasarcoFlag: Boolean(formData.enasarco_flag),
      quotaNonSoggetta: Number(formData.quota_non_soggetta || 0),
      codiceSommeNonSoggette: String(formData.codice_somme_non_soggette || ''),
      withholdingRate: Number(formData.withholding_rate || 0),
      withholdingAmount: Number(formData.ritenuta || 0),
      deductionRule: proposal.deductionRule,
      paymentCausale: paymentWorkflow.paymentCausale,
      registrationCausale: paymentWorkflow.registrationCausale,
      downstream: finalDownstream,
    };
    const audit = buildParcellaAudit({
      proposal,
      finalValues,
      userLabel: 'Operatore',
    });

    const record={
      societa_id:societa.id,
      percipiente_cf:perc.codice_fiscale,
      percipiente_denominazione:perc.ragione_sociale||`${perc.cognome||''} ${perc.nome||''}`.trim(),
      data_pagamento:formData.data_pagamento,
      data_documento:formData.data_documento||null,
      numero_documento:formData.numero_documento||null,
      compenso_lordo:parseFloat(formData.compenso_lordo||0),
      ritenuta:parseFloat(formData.ritenuta||0),
      compenso_netto:parseFloat(formData.compenso_netto||0),
      causale:formData.causaleReddituale,
      note:buildParcellaAuditNote(formData.note, {
        proposal,
        finalValues,
        audit,
        warningList: decision.warnings,
        documentId: selectedDocumento?.id || null,
        paymentCausale: paymentWorkflow.paymentCausale,
        registrationCausale: paymentWorkflow.registrationCausale,
        taxableBasePaid: paymentWorkflow.taxableBasePaid,
        nonSubjectPaid: Number(selectedDocumentoWorkflow?.nonSubjectTotal || 0) > 0 && Number(selectedDocumentoWorkflow?.taxableBaseTotal || 0) > 0
          ? Math.round((Number(selectedDocumentoWorkflow.nonSubjectTotal || 0) * (paymentWorkflow.taxableBasePaid / Number(selectedDocumentoWorkflow.taxableBaseTotal || 1))) * 100) / 100
          : 0,
        accountingPaid: paymentWorkflow.accountingPaid,
        withholdingPaid: paymentWorkflow.withholdingPaid,
      })
    };

    const{data:inserted,error}=await contabilitaRepo.insertRitenuta(record);
    if(error){
      alert('Errore: '+error.message);
      return;
    }

    if (selectedDocumento && selectedDocumentoWorkflow) {
      const nextWorkflow = applyPaymentToParcellaWorkflow(selectedDocumentoWorkflow, {
        paymentId: inserted?.id || null,
        paymentDate: formData.data_pagamento,
        paymentCausale: paymentWorkflow.paymentCausale,
        taxableBasePaid: paymentWorkflow.taxableBasePaid,
        accountingPaid: paymentWorkflow.accountingPaid,
        withholdingPaid: paymentWorkflow.withholdingPaid,
      });
      if (nextWorkflow) {
        const datiEstratti = parseUiJson(selectedDocumento.dati_estratti);
        const parcellaConfirmation = datiEstratti.parcella_confirmation || {};
        const nextDatiEstratti = {
          ...datiEstratti,
          parcella_workflow: nextWorkflow,
          parcella_confirmation: {
            ...parcellaConfirmation,
            payment_effects: {
              last_payment_id: inserted?.id || null,
              last_payment_date: formData.data_pagamento,
              payment_causale: paymentWorkflow.paymentCausale,
              last_paid_taxable_base: paymentWorkflow.taxableBasePaid,
              last_paid_non_subject: Number(nextWorkflow?.payments?.[nextWorkflow.payments.length - 1]?.nonSubjectPaid || 0),
              last_paid_withholding: paymentWorkflow.withholdingPaid,
            },
          },
        };
        const { error: docError } = await contabilitaRepo.updateDocumentoContabilita(selectedDocumento.id, {
          dati_estratti: nextDatiEstratti,
        });
        if (docError) {
          alert('Pagamento salvato, ma aggiornamento workflow parcella non riuscito: ' + docError.message);
        }
      }
    }

    setModalNuova(false);
    setManualOverrides({});
    setFormData(EMPTY_FORM);
    caricaDati();
  };

  const eliminaRitenuta=async(id)=>{
    if(!confirm('Eliminare questa ritenuta?'))return;
    await contabilitaRepo.deleteRitenuta(id);
    caricaDati();
  };

  const ritenuteEnriched = useMemo(
    ()=>ritenute.map((row)=>{
      const parsed = parseParcellaAuditNote(row.note);
      return {
        ...row,
        auditBadge: parsed.audit?.audit?.status || 'Confermato',
        auditPayload: parsed.audit,
        paymentCausale: parsed.audit?.paymentCausale || null,
        visibleNote: parsed.note,
      };
    }),
    [ritenute]
  );

  const scheduleRows = useMemo(
    ()=>buildRitenuteScadenzarioRows({
      ritenute,
      year: annoSel,
    }),
    [annoSel, ritenute]
  );

  const totali={
    lordo:scheduleRows.reduce((s,r)=>s+parseFloat(r.compensationAmount||0),0),
    ritenuta:scheduleRows.reduce((s,r)=>s+parseFloat(r.withholdingAmount||0),0),
    netto:ritenute.reduce((s,r)=>s+parseFloat(r.compenso_netto||0),0),
    scadute:scheduleRows.filter((row)=>row.operationalStatus==='scaduta').length,
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>Ritenute d'acconto</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Pagamento parcelle con proposta fiscale, warning e audit leggero</div>
        </div>
        <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
          <select value={annoSel} onChange={e=>setAnnoSel(parseInt(e.target.value))} style={{width:100}}>
            {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn" onClick={openNuovaRitenuta} disabled={percipienti.length===0}>+ Nuovo pagamento</button>
        </div>
      </div>

      <div className="stats-grid" style={{marginBottom:'1rem'}}>
        <div className="stat-card"><div className="stat-val">{scheduleRows.length}</div><div className="stat-lbl">Scadenze generate</div></div>
        <div className="stat-card"><div className="stat-val">{fmt(totali.lordo)}</div><div className="stat-lbl">Compensi pagati</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--rd)'}}>{fmt(totali.ritenuta)}</div><div className="stat-lbl">Ritenute maturate</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--gld2)'}}>{totali.scadute}</div><div className="stat-lbl">Scadenze da rivedere</div></div>
      </div>

      {percipienti.length===0&&(
        <div className="alert alert-warn" style={{marginBottom:'1rem'}}>
          Nessun percipiente registrato. Completa prima l'anagrafica percipienti.
        </div>
      )}

      {loading?(
        <div className="loading">Caricamento...</div>
      ):scheduleRows.length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{color:'var(--mu)'}}>Nessuna scadenza ritenute maturata da parcelle pagate nel {annoSel}</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Percipiente</th>
                  <th>Parcella</th>
                  <th>Data pag.</th>
                  <th>Scadenza</th>
                  <th>Tributo</th>
                  <th style={{textAlign:'right'}}>Ritenuta maturata</th>
                  <th>Stato</th>
                  <th>Riferimenti PN</th>
                  <th>Audit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((row)=>(
                  <tr key={row.key}>
                    <td>
                      <div style={{fontWeight:600}}>{row.percipiente}</div>
                      <div style={{fontSize:'.7rem',color:'var(--mu)'}}>{row.codiceFiscale || 'CF mancante'}</div>
                    </td>
                    <td style={{fontSize:'.75rem'}}>{row.sourceParcella || EMPTY_CELL}</td>
                    <td>{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString('it-IT') : EMPTY_CELL}</td>
                    <td>{row.dueDate ? new Date(row.dueDate).toLocaleDateString('it-IT') : EMPTY_CELL}</td>
                    <td>{row.codiceTributo}</td>
                    <td style={{textAlign:'right',color:'var(--rd)'}}>{fmt(row.withholdingAmount)}</td>
                    <td>
                      <span className={`bdg ${row.operationalStatus==='scaduta'?'bdg-red':'bdg-gold'}`}>
                        {row.operationalStatus==='scaduta' ? 'Da versare - scaduta' : 'Da versare'}
                      </span>
                    </td>
                    <td style={{fontSize:'.7rem'}}>
                      <div>Parcella: {row.primaNotaParcellaId || EMPTY_CELL}</div>
                      <div>Pagamento: {row.primaNotaPagamentoId || EMPTY_CELL}</div>
                    </td>
                    <td>
                      <button className="bdg bdg-green" onClick={()=>setModalAudit(row.sourceRitenuta)} style={{border:'none',cursor:'pointer'}}>
                        {row.cu770.ready ? 'CU/770 pronti' : 'Dati da verificare'}
                      </button>
                    </td>
                    <td style={{display:'flex',gap:'.35rem',justifyContent:'flex-end'}}>
                      <button className="btn-icon" onClick={()=>setModalAudit(row.sourceRitenuta)} title="Diff">i</button>
                      <button className="btn-icon" onClick={()=>eliminaRitenuta(row.id)} title="Elimina">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="alert alert-info" style={{marginTop:'1rem'}}>
        F24 ritenute non automatizzato: l'eventuale pagamento va registrato con una prima nota semplice, Debiti v/Erario ritenute in Dare e Banca/Cassa in Avere.
      </div>

      {modalNuova&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuova(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:920}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">Conferma parcella e ritenuta</div>
              <button className="modal-close" onClick={()=>setModalNuova(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg full">
                  <label>Percipiente *</label>
                  <BaseCombobox
                    value={formData.percipiente_id}
                    onChange={(v)=>onPercipienteChange(v||'')}
                    options={[
                      { id: '', label: '-- Seleziona --' },
                      ...(percipienti || []).map((p) => ({
                        id: p.id,
                        label: `${p.ragione_sociale || `${p.cognome||''} ${p.nome||''}`.trim()} (${p.codice_fiscale||'CF mancante'})`,
                      })),
                    ]}
                    getOptionId={(o)=>o?.id}
                    getOptionLabel={(o)=>o?.label}
                    searchable
                    maxItems={140}
                    placeholder="-- Seleziona --"
                  />
                </div>
                <div className="fg full">
                  <label>Documento collegato</label>
                  <BaseCombobox
                    value={formData.linked_document_id}
                    onChange={(v)=>updateField('linked_document_id', v||'', false)}
                    options={[
                      { id: '', label: '-- Nessun documento collegato --' },
                      ...(relatedDocumenti || []).map((doc) => ({
                        id: doc.id,
                        label: `${doc.numero_documento||'Documento senza numero'} - ${doc.soggetto_denominazione||'Soggetto'} - ${fmt(doc.imponibile||doc.totale||0)}`,
                      })),
                    ]}
                    getOptionId={(o)=>o?.id}
                    getOptionLabel={(o)=>o?.label}
                    searchable
                    maxItems={160}
                    placeholder="-- Nessun documento collegato --"
                  />
                </div>
                <div className="fg"><label>Data pagamento *</label><input type="date" value={formData.data_pagamento} onChange={e=>updateField('data_pagamento', e.target.value)}/></div>
                <div className="fg"><label>Data documento</label><input type="date" value={formData.data_documento} onChange={e=>updateField('data_documento', e.target.value)}/></div>
                <div className="fg"><label>N. documento</label><input value={formData.numero_documento} onChange={e=>updateField('numero_documento', e.target.value)} placeholder="Es. FT-2026/014"/></div>
                <div className="fg"><label>Imponibile compenso</label><input type="number" step="0.01" value={formData.compenso_lordo} onChange={e=>updateField('compenso_lordo', e.target.value)}/></div>
                <div className="fg"><label>Causale reddituale</label><BaseCombobox value={formData.causaleReddituale} onChange={(v)=>updateField('causaleReddituale', v||'')} options={CAUSALI_REDDITUALI_OPTIONS.map((item)=>({id:item.value,label:item.label}))} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable maxItems={90} /></div>
                <div className="fg"><label>Cassa previdenziale</label><BaseCombobox value={formData.cassa_flag?'si':'no'} onChange={(v)=>updateField('cassa_flag', v==='si')} options={[{id:'si',label:'Si'},{id:'no',label:'No'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>% cassa</label><input type="number" min="0" max="100" step="0.01" value={formData.cassa_percent} onChange={e=>updateField('cassa_percent', e.target.value)}/></div>
                <div className="fg"><label>INPS</label><BaseCombobox value={formData.inps_flag?'si':'no'} onChange={(v)=>updateField('inps_flag', v==='si')} options={[{id:'si',label:'Si'},{id:'no',label:'No'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Enasarco</label><BaseCombobox value={formData.enasarco_flag?'si':'no'} onChange={(v)=>updateField('enasarco_flag', v==='si')} options={[{id:'si',label:'Si'},{id:'no',label:'No'}]} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} /></div>
                <div className="fg"><label>Quota non soggetta</label><input type="number" min="0" step="0.01" value={formData.quota_non_soggetta} onChange={e=>updateField('quota_non_soggetta', e.target.value)}/></div>
                <div className="fg"><label>Codice somme non soggette</label><BaseCombobox value={formData.codice_somme_non_soggette} onChange={(v)=>updateField('codice_somme_non_soggette', v||'')} options={SOMME_NON_SOGGETTE_OPTIONS.map((item)=>({id:item.value,label:item.label}))} getOptionId={o=>o?.id} getOptionLabel={o=>o?.label} searchable={false} maxItems={80} /></div>
                <div className="fg"><label>Aliquota ritenuta %</label><input type="number" min="0" max="100" step="0.01" value={formData.withholding_rate} onChange={e=>updateField('withholding_rate', e.target.value)}/></div>
                <div className="fg"><label>Importo ritenuta</label><input type="number" step="0.01" value={formData.ritenuta} onChange={e=>updateField('ritenuta', e.target.value)}/></div>
                <div className="fg"><label>Compenso netto</label><input type="number" step="0.01" value={formData.compenso_netto} onChange={e=>updateField('compenso_netto', e.target.value)}/></div>
                <div className="fg full"><label>Note operatore</label><input value={formData.note} onChange={e=>updateField('note', e.target.value, false)}/></div>
              </div>

              <div className="card" style={{marginTop:'1rem',padding:'1rem'}}>
                <div className="card-title" style={{marginBottom:'.5rem'}}>Proposta FiscoSim</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(220px,1fr))',gap:'.6rem 1rem',fontSize:'.85rem'}}>
                  <div><strong>Causale proposta:</strong> {CAUSALI_REDDITUALI_BY_CODE[decision.proposal.causaleReddituale]?.title || decision.proposal.causaleReddituale}</div>
                  <div><strong>Regola riduzione:</strong> {decision.proposal.deductionRule}</div>
                  <div><strong>Causale registrazione:</strong> {paymentWorkflow.registrationCausale}</div>
                  <div><strong>Causale pagamento:</strong> {paymentWorkflow.paymentCausale}</div>
                  <div><strong>Effetto CU / 770:</strong> {decision.proposal.downstream.updateCu ? 'SI' : 'NO'} / {decision.proposal.downstream.update770 ? 'SI' : 'NO'}</div>
                  <div><strong>Scadenziario ritenute:</strong> {decision.proposal.downstream.updateWithholdingSchedule ? 'SI' : 'NO'}</div>
                </div>
              </div>

              {selectedDocumentoWorkflow && (
                <div className="card" style={{marginTop:'1rem',padding:'1rem'}}>
                  <div className="card-title" style={{marginBottom:'.5rem'}}>Posizioni aperte e pagamento parziale</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(160px,1fr))',gap:'.6rem 1rem',fontSize:'.85rem'}}>
                    <div><strong>Debito professionista aperto:</strong> {fmtNumber(selectedDocumentoWorkflow.accountingPayableOpen||0)}</div>
                    <div><strong>Debito ritenuta aperto:</strong> {fmtNumber(selectedDocumentoWorkflow.withholdingPayableOpen||0)}</div>
                    <div><strong>Base imponibile aperta:</strong> {fmtNumber(selectedDocumentoWorkflow.taxableBaseOpen||0)}</div>
                    <div><strong>Chiusura professionista dopo pagamento:</strong> {fmtNumber(paymentWorkflow.simulatedState?.accountingPayableOpen||0)}</div>
                    <div><strong>Chiusura ritenuta dopo pagamento:</strong> {fmtNumber(paymentWorkflow.simulatedState?.withholdingPayableOpen||0)}</div>
                    <div><strong>Stato risultante:</strong> {paymentWorkflow.simulatedState?.status || 'open'}</div>
                  </div>
                </div>
              )}

              {decision.warnings.length > 0 && (
                <div className="alert alert-warn" style={{marginTop:'1rem'}}>
                  <strong>Warning operatore</strong>
                  <ul style={{margin:'0.5rem 0 0 1rem'}}>
                    {decision.warnings.map((warning)=><li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}

              <div className="card" style={{marginTop:'1rem',padding:'1rem'}}>
                <div className="card-title" style={{marginBottom:'.5rem'}}>Effetti a valle del pagamento</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(120px,1fr))',gap:'.5rem'}}>
                  <div><span className={'bdg '+(finalDownstream.updateCu?'bdg-green':'bdg-gray')}>CU {finalDownstream.updateCu?'attiva':'esclusa'}</span></div>
                  <div><span className={'bdg '+(finalDownstream.update770?'bdg-green':'bdg-gray')}>770 {finalDownstream.update770?'attivo':'escluso'}</span></div>
                  <div><span className={'bdg '+(finalDownstream.updateWithholdingSchedule?'bdg-gold':'bdg-gray')}>Scadenziario {finalDownstream.updateWithholdingSchedule?'attivo':'off'}</span></div>
                  <div><span className={'bdg '+(finalDownstream.paymentSchedule1040?'bdg-gold':'bdg-gray')}>1040 {finalDownstream.paymentSchedule1040?'rilevante':'non rilevante'}</span></div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuova(false)}>Annulla</button>
              <button className="btn" onClick={salvaRitenuta}>Salva pagamento</button>
            </div>
          </div>
        </div>
      )}

      {modalAudit&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalAudit(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:720}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">Audit fiscale parcella</div>
              <button className="modal-close" onClick={()=>setModalAudit(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',gap:'.5rem',alignItems:'center',marginBottom:'1rem'}}>
                <span className={'bdg '+(modalAudit.auditBadge==='Variato'?'bdg-gold':'bdg-green')}>{modalAudit.auditBadge}</span>
                <span style={{fontSize:'.85rem',color:'var(--mu)'}}>{modalAudit.percipiente_denominazione || 'Percipiente'}</span>
              </div>
              {(modalAudit.auditPayload?.warningList || modalAudit.auditPayload?.warnings || []).length > 0 && (
                <div className="alert alert-warn" style={{marginBottom:'1rem'}}>
                  <ul style={{margin:'0 0 0 1rem'}}>
                    {(modalAudit.auditPayload?.warningList || modalAudit.auditPayload?.warnings || []).map((warning)=><li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Proposta</th>
                      <th>Conferma operatore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(modalAudit.auditPayload?.audit?.diffRows || modalAudit.auditPayload?.diffRows || []).length > 0 ? (
                      (modalAudit.auditPayload?.audit?.diffRows || modalAudit.auditPayload?.diffRows || []).map((row)=>(
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td>{String(row.proposta)}</td>
                          <td>{String(row.finale)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} style={{color:'var(--mu)'}}>Nessuna variazione rispetto alla proposta FiscoSim.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalAudit(null)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- MODULO PIANO DEI CONTI ----------------------------------




