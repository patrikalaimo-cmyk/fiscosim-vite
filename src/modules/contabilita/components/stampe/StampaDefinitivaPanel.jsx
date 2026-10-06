import { useState, useEffect } from 'react';
import { sb } from '../../../../lib/supabase.js';
import {
  precheckStampaDefinitiva,
  consolidazioneStampaDefinitiva
} from '../../application/stampe/motoreStampaDefinitiva.js';
import {
  mapUiTypeToCanonical,
  generateStampaChecksum
} from '../../application/stampe/stampaDefinitivaUiHelpers.js';
import { resolveStampaDefinitivaOperatore } from '../../application/stampe/resolveStampaDefinitivaOperatore.js';

export default function StampaDefinitivaPanel({
  societa,
  tipoStampa,
  registroTipo,
  periodoInizio,
  periodoFine
}) {
  const [canonicalType, setCanonicalType] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Non verificata'); // 'Non verificata' | 'Verifica superata' | 'Bloccata' | 'Consolidata'
  const [precheckResult, setPrecheckResult] = useState(null);
  const [consolidationResult, setConsolidationResult] = useState(null);
  const [blockers, setBlockers] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Sync with active tab/dropdown selections but allow selection of liquidazione_iva_periodica
  useEffect(() => {
    const canonical = mapUiTypeToCanonical(tipoStampa, registroTipo);
    setCanonicalType(canonical);
    setStatus('Non verificata');
    setPrecheckResult(null);
    setConsolidationResult(null);
    setBlockers([]);
    setWarnings([]);
    setErrorMsg('');
  }, [tipoStampa, registroTipo, periodoInizio, periodoFine]);

  const handleTypeChange = (e) => {
    setCanonicalType(e.target.value);
    setStatus('Non verificata');
    setPrecheckResult(null);
    setConsolidationResult(null);
    setBlockers([]);
    setWarnings([]);
    setErrorMsg('');
  };

  const executePrecheck = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMsg('');
    setBlockers([]);
    setWarnings([]);
    setPrecheckResult(null);
    setConsolidationResult(null);

    try {
      const year = new Date(periodoInizio).getFullYear();
      
      const { data, error } = await precheckStampaDefinitiva(sb, {
        societaId: societa.id,
        tipoStampa: canonicalType,
        annoFiscale: year,
        periodoInizio,
        periodoFine
      });

      if (error) {
        throw error;
      }

      setPrecheckResult(data);

      if (data) {
        if (data.success) {
          setStatus('Verifica superata');
          setWarnings(data.warnings || []);
        } else {
          setStatus('Bloccata');
          setBlockers(data.blocking_reasons || []);
          setWarnings(data.warnings || []);
        }
      } else {
        throw new Error('Risposta precheck vuota o non valida.');
      }
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setStatus('Non verificata');
    } finally {
      setBusy(false);
    }
  };

  const executeConsolidation = async () => {
    if (busy || status !== 'Verifica superata') return;

    const confirmMsg = 'La stampa definitiva blocca il periodo e numera progressivamente le righe. Procedere?';
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setBusy(true);
    setErrorMsg('');
    setConsolidationResult(null);

    try {
      // 1. Get logged-in operator from utenti_studio
      const operatorId = await resolveStampaDefinitivaOperatore();

      const year = new Date(periodoInizio).getFullYear();
      const timestamp = new Date().toISOString();

      // 2. Generate deterministic checksum
      const checksum = await generateStampaChecksum({
        societaId: societa.id,
        tipoStampa: canonicalType,
        annoFiscale: year,
        periodoInizio,
        periodoFine,
        timestamp,
        rowsCount: precheckResult?.rows_count || 0
      });

      // 3. Call the consolidation RPC wrapper
      const { data, error } = await consolidazioneStampaDefinitiva(sb, {
        societaId: societa.id,
        tipoStampa: canonicalType,
        annoFiscale: year,
        periodoInizio,
        periodoFine,
        creatoBy: operatorId,
        checksum,
        motivo: `Consolidamento definitivo per ${canonicalType} - Periodo: ${periodoInizio} / ${periodoFine}`
      });

      if (error) {
        throw error;
      }

      if (data && data.success) {
        setStatus('Consolidata');
        setConsolidationResult(data);
      } else {
        throw new Error(data?.blocking_reasons?.join('; ') || 'Salvataggio fallito.');
      }
    } catch (err) {
      setErrorMsg(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const getStatusBadgeStyle = () => {
    const styles = {
      'Non verificata': { bg: 'rgba(156, 163, 175, 0.08)', color: '#9ca3af', border: '1px solid rgba(156, 163, 175, 0.25)' },
      'Verifica superata': { bg: 'rgba(16, 185, 129, 0.08)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)' },
      'Bloccata': { bg: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)' },
      'Consolidata': { bg: 'rgba(232, 146, 42, 0.08)', color: 'var(--gold)', border: '1px solid rgba(232, 146, 42, 0.25)' }
    };
    return styles[status] || styles['Non verificata'];
  };

  const displayTypes = {
    'libro_giornale': 'Libro Giornale',
    'registro_iva_acquisti': 'Registro IVA Acquisti',
    'registro_iva_vendite': 'Registro IVA Vendite',
    'registro_iva_corrispettivi': 'Registro IVA Corrispettivi',
    'liquidazione_iva_periodica': 'Liquidazione IVA Periodica'
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--bd)',
      borderRadius: '12px',
      padding: '1.5rem',
      marginTop: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      {/* Title & Status */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🔒</span>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tx)', margin: 0 }}>Stampa Definitiva</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>Consolida e blocca formalmente i dati del periodo</span>
          </div>
        </div>

        <span style={{
          ...getStatusBadgeStyle(),
          fontSize: '0.75rem',
          padding: '0.25rem 0.6rem',
          borderRadius: '8px',
          fontWeight: 600,
          display: 'inline-block'
        }}>
          {status}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        alignItems: 'end'
      }}>
        {/* Document Selector */}
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Documento da consolidare</label>
          <select
            value={canonicalType}
            onChange={handleTypeChange}
            disabled={busy || status === 'Consolidata'}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--bd)',
              borderRadius: '14px',
              color: 'var(--tx)',
              height: '42px',
              width: '100%',
              paddingLeft: '0.75rem'
            }}
          >
            {Object.entries(displayTypes).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Selected Period Info */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--bd)',
          borderRadius: '14px',
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          fontSize: '0.85rem',
          color: 'var(--tx)',
          gap: '0.5rem'
        }}>
          <span style={{ color: 'var(--mu)' }}>Periodo:</span>
          <strong>{new Date(periodoInizio).toLocaleDateString('it-IT')}</strong>
          <span style={{ color: 'var(--mu)' }}>➔</span>
          <strong>{new Date(periodoFine).toLocaleDateString('it-IT')}</strong>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={executePrecheck}
            disabled={busy || status === 'Consolidata'}
            style={{
              flex: 1,
              height: '42px',
              borderRadius: '14px',
              border: '1px solid var(--bd)',
              background: busy ? 'rgba(255,255,255,0.02)' : 'var(--bg-surface)',
              color: 'var(--tx)',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: (busy || status === 'Consolidata') ? 'not-allowed' : 'pointer',
              opacity: (busy || status === 'Consolidata') ? 0.5 : 1,
              transition: 'background 0.2s'
            }}
          >
            {busy && status === 'Non verificata' ? 'Verifica...' : 'Verifica definitiva'}
          </button>

          <button
            onClick={executeConsolidation}
            disabled={busy || status !== 'Verifica superata'}
            style={{
              flex: 1.5,
              height: '42px',
              borderRadius: '14px',
              border: 'none',
              background: status === 'Verifica superata' ? 'var(--gold)' : 'rgba(232, 146, 42, 0.1)',
              color: status === 'Verifica superata' ? '#0c1628' : 'var(--mu)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: (busy || status !== 'Verifica superata') ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              boxShadow: status === 'Verifica superata' ? '0 4px 12px rgba(232, 146, 42, 0.15)' : 'none'
            }}
          >
            {busy && status === 'Verifica superata' ? 'Consolidamento...' : 'Consolida definitivo'}
          </button>
        </div>
      </div>

      {/* Error Message Box */}
      {errorMsg && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          fontSize: '0.85rem'
        }}>
          ⚠ Errore: {errorMsg}
        </div>
      )}

      {/* Blockers Info Box */}
      {blockers.length > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem'
        }}>
          <strong style={{ color: '#ef4444', fontSize: '0.85rem' }}>Blocker Rilevati ({blockers.length}):</strong>
          <ul style={{ margin: '0.25rem 0 0 1.2rem', padding: 0, fontSize: '0.82rem', color: 'var(--tx)' }}>
            {blockers.map((b, idx) => (
              <li key={idx} style={{ marginBottom: '0.15rem' }}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings Info Box */}
      {warnings.length > 0 && (
        <div style={{
          background: 'rgba(232, 146, 42, 0.05)',
          border: '1px solid rgba(232, 146, 42, 0.25)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem'
        }}>
          <strong style={{ color: 'var(--gold)', fontSize: '0.85rem' }}>Warning/Segnalazioni ({warnings.length}):</strong>
          <ul style={{ margin: '0.25rem 0 0 1.2rem', padding: 0, fontSize: '0.82rem', color: 'var(--tx)' }}>
            {warnings.map((w, idx) => (
              <li key={idx} style={{ marginBottom: '0.15rem' }}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Success Consolidation Esito */}
      {status === 'Consolidata' && consolidationResult && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.05)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '8px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontWeight: 'bold' }}>
            <span>✓</span> Stampa Definitiva Consolidata Con Successo
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, min-width(180px))',
            gap: '0.75rem',
            background: 'rgba(0,0,0,0.15)',
            padding: '0.75rem',
            borderRadius: '6px',
            color: 'var(--tx)'
          }}>
            <div>ID Stampa: <code style={{ color: 'var(--gold)', fontFamily: 'monospace' }}>{consolidationResult.stampa_id}</code></div>
            <div>Pagine: <strong>{consolidationResult.pagina_iniziale}</strong> ➔ <strong>{consolidationResult.pagina_finale}</strong></div>
            <div>Righe Elaborate: <strong>{consolidationResult.righe_elaborate}</strong></div>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>
            Il periodo e le righe contabili risultano marcati come definitivi secondo la RPC validata.
          </span>
        </div>
      )}
    </div>
  );
}
