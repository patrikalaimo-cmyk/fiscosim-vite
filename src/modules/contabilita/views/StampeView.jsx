import { useState, Fragment } from 'react'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { buildRegistroIvaRowsModel } from '../application/stampe/buildRegistroIvaRowsModel.js'
import { buildLibroGiornaleModel } from '../application/stampe/buildLibroGiornaleModel.js'
import {
  ContPageHeader,
  ContFilterBar,
  ContKpiGrid,
  ContKpiCard,
  ContPreviewCard,
  ContInfoPanel,
  ContGridFooter,
  ContActionButton
} from '../components/ContabilitaSharedUX.jsx'

const fmt = (n) => n != null ? Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('it-IT') : '—';

// SVGs & high fidelity helpers for Stampe UX
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--mu)', verticalAlign: 'middle' }}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const SearchDocIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <circle cx="11.5" cy="13.5" r="2.5" />
    <line x1="16" y1="18" x2="13.5" y2="15.5" />
  </svg>
);

const PdfIcon = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#ef4444', fontSize: '9px', fontWeight: '800', width: '22px', height: '14px', borderRadius: '3px', marginRight: '4px' }}>PDF</span>
);

const ExcelIcon = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#e6fffa', color: '#006644', fontSize: '9px', fontWeight: '800', width: '22px', height: '14px', borderRadius: '3px', marginRight: '4px' }}>XLS</span>
);

const PrinterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const ThreeDotsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

const SortArrow = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px', opacity: 0.5, verticalAlign: 'middle' }}>
    <polyline points="7 15 12 20 17 15" />
    <polyline points="7 9 12 4 17 9" />
  </svg>
);

const KpiCard = ({ title, value, subtitle, iconType }) => {
  let iconBg = '';
  let iconColor = '';
  let iconSvg = null;

  if (iconType === 'imponibile') {
    iconBg = 'rgba(26, 168, 191, 0.1)';
    iconColor = 'var(--petrolio-light)';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <path d="M9 15h6" />
      </svg>
    );
  } else if (iconType === 'iva') {
    iconBg = 'rgba(232, 146, 42, 0.1)';
    iconColor = 'var(--gold)';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </svg>
    );
  } else if (iconType === 'complessivo') {
    iconBg = 'rgba(16, 185, 129, 0.1)';
    iconColor = '#10b981';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
        <line x1="9" y1="22" x2="9" y2="16" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="16" y1="14" x2="16" y2="18" />
        <path d="M16 10h.01M9 10h.01M9 14h.01M12 10h.01M12 14h.01M12 18h.01" />
      </svg>
    );
  } else if (iconType === 'documenti') {
    iconBg = 'rgba(139, 92, 246, 0.1)';
    iconColor = '#8B5CF6';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <rect x="8" y="13" width="8" height="4" rx="1" />
      </svg>
    );
  } else if (iconType === 'dare') {
    iconBg = 'rgba(26, 168, 191, 0.1)';
    iconColor = 'var(--petrolio-light)';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    );
  } else if (iconType === 'avere') {
    iconBg = 'rgba(232, 146, 42, 0.1)';
    iconColor = 'var(--gold)';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    );
  } else if (iconType === 'sbilancio') {
    iconBg = 'rgba(16, 185, 129, 0.1)';
    iconColor = '#10b981';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1" />
        <path d="M18 8h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4" />
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="5" y1="7" x2="19" y2="7" />
      </svg>
    );
  } else if (iconType === 'sbilancio_danger') {
    iconBg = 'rgba(239, 68, 68, 0.1)';
    iconColor = '#ef4444';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1" />
        <path d="M18 8h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4" />
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="5" y1="7" x2="19" y2="7" />
      </svg>
    );
  } else if (iconType === 'registrazioni') {
    iconBg = 'rgba(139, 92, 246, 0.1)';
    iconColor = '#8B5CF6';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <rect x="8" y="13" width="8" height="4" rx="1" />
      </svg>
    );
  } else if (iconType === 'righe') {
    iconBg = 'rgba(236, 72, 153, 0.1)';
    iconColor = '#EC4899';
    iconSvg = (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    );
  }

  return (
    <div style={{
      flex: '1 1 220px',
      background: 'var(--bg-card)',
      border: '1px solid var(--bd)',
      borderRadius: '12px',
      padding: '1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem'
    }}>
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        background: iconBg,
        color: iconColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        {iconSvg}
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.2rem' }}>{title}</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--tx)' }}>{value}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--mu)' }}>{subtitle}</div>
      </div>
    </div>
  );
};

const EmptyState = ({ periodoInizio, periodoFine }) => (
  <div style={{
    textAlign: 'center',
    padding: '3rem 2rem',
    background: 'var(--bg-card)',
    borderRadius: '12px',
    border: '1px dashed var(--bd)',
    marginTop: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem'
  }}>
    <div style={{
      width: '64px',
      height: '64px',
      borderRadius: '50%',
      background: 'rgba(232, 146, 42, 0.05)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--gold)'
    }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="15" x2="15" y2="15" />
        <line x1="9" y1="19" x2="15" y2="19" />
        <line x1="9" y1="11" x2="11" y2="11" />
      </svg>
    </div>
    <div>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--tx)', marginBottom: '0.5rem' }}>Nessuna riga IVA trovata</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--mu)', maxWidth: '450px', margin: '0 auto', lineHeight: '1.5' }}>
        Non sono presenti registrazioni IVA per il registro selezionato nel periodo dal <strong>{new Date(periodoInizio).toLocaleDateString('it-IT')}</strong> al <strong>{new Date(periodoFine).toLocaleDateString('it-IT')}</strong>.
      </p>
    </div>
    <div style={{
      fontSize: '0.8rem',
      color: 'var(--mu)',
      background: 'var(--bg-surface)',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      border: '1px solid var(--bd)',
      textAlign: 'left',
      maxWidth: '500px'
    }}>
      💡 <strong>Consigli utili:</strong>
      <ul style={{ margin: '0.4rem 0 0 1.2rem', padding: 0 }}>
        <li style={{ marginBottom: '0.2rem' }}>Verifica che le date di inizio e fine dell'anteprima siano corrette.</li>
        <li style={{ marginBottom: '0.2rem' }}>Controlla in Prima Nota che siano presenti fatture (Causali FF / FC / ecc.) nel periodo.</li>
        <li>Assicurati che la causale utilizzata abbia la gestione IVA attiva.</li>
      </ul>
    </div>
  </div>
);

const GiornaleEmptyState = ({ periodoInizio, periodoFine }) => (
  <div style={{
    textAlign: 'center',
    padding: '3rem 2rem',
    background: 'var(--bg-card)',
    borderRadius: '12px',
    border: '1px dashed var(--bd)',
    marginTop: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem'
  }}>
    <div style={{
      width: '64px',
      height: '64px',
      borderRadius: '50%',
      background: 'rgba(232, 146, 42, 0.05)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--gold)'
    }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="15" x2="15" y2="15" />
        <line x1="9" y1="19" x2="15" y2="19" />
        <line x1="9" y1="11" x2="11" y2="11" />
      </svg>
    </div>
    <div>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--tx)', marginBottom: '0.5rem' }}>Nessuna scrittura trovata</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--mu)', maxWidth: '450px', margin: '0 auto', lineHeight: '1.5' }}>
        Non sono presenti scritture contabili per i filtri selezionati nel periodo dal <strong>{new Date(periodoInizio).toLocaleDateString('it-IT')}</strong> al <strong>{new Date(periodoFine).toLocaleDateString('it-IT')}</strong>.
      </p>
    </div>
    <div style={{
      fontSize: '0.8rem',
      color: 'var(--mu)',
      background: 'var(--bg-surface)',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      border: '1px solid var(--bd)',
      textAlign: 'left',
      maxWidth: '500px'
    }}>
      💡 <strong>Consigli utili:</strong>
      <ul style={{ margin: '0.4rem 0 0 1.2rem', padding: 0 }}>
        <li style={{ marginBottom: '0.2rem' }}>Verifica che le date di inizio e fine dell'anteprima siano corrette.</li>
        <li style={{ marginBottom: '0.2rem' }}>Assicurati che vi siano registrazioni di Prima Nota nel periodo specificato.</li>
        <li>Prova a includere altri stati di registrazione (es. Simulate, Stornate/Storni) se presenti.</li>
      </ul>
    </div>
  </div>
);

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

const partitariMockData = [
  { id: '1', subject: 'Alfa S.r.l.', type: 'clienti', doc: 'FATPA 45/2024', date: '2024-04-15', due: '2024-05-15', original: 2440.00, paid: 0.00, residual: 2440.00, state: 'aperta', pn_ap: '1/2024', pn_ch: '—' },
  { id: '2', subject: 'Beta S.p.A.', type: 'clienti', doc: 'FATPA 67/2024', date: '2024-04-30', due: '2024-05-30', original: 5490.00, paid: 2000.00, residual: 3490.00, state: 'parziale', pn_ap: '1/2024', pn_ch: '5/2024' },
  { id: '3', subject: 'Gamma S.r.l.', type: 'clienti', doc: 'FATPA 81/2024', date: '2024-05-10', due: '2024-06-09', original: 1830.00, paid: 0.00, residual: 1830.00, state: 'aperta', pn_ap: '2/2024', pn_ch: '—' },
  { id: '4', subject: 'Delta S.r.l.', type: 'clienti', doc: 'FATPA 102/2024', date: '2024-05-28', due: '2024-06-27', original: 3660.00, paid: 3660.00, residual: 0.00, state: 'chiusa', pn_ap: '2/2024', pn_ch: '6/2024' },
  { id: '5', subject: 'Forniture Italia S.r.l.', type: 'fornitori', doc: 'FATPA 210/2024', date: '2024-04-18', due: '2024-05-18', original: 1220.00, paid: 1220.00, residual: 0.00, state: 'chiusa', pn_ap: '1/2024', pn_ch: '4/2024' },
  { id: '6', subject: 'Office Point S.p.A.', type: 'fornitori', doc: 'FATPA 233/2024', date: '2024-05-02', due: '2024-06-01', original: 732.00, paid: 300.00, residual: 432.00, state: 'parziale', pn_ap: '2/2024', pn_ch: '6/2024' },
  { id: '7', subject: 'Energia & Servizi S.p.A.', type: 'fornitori', doc: 'FATPA 255/2024', date: '2024-05-15', due: '2024-06-14', original: 880.00, paid: 0.00, residual: 880.00, state: 'aperta', pn_ap: '2/2024', pn_ch: '—' },
  { id: '8', subject: 'Tecnologie Avanzate S.r.l.', type: 'fornitori', doc: 'FATPA 289/2024', date: '2024-05-27', due: '2024-06-26', original: 4270.00, paid: 4270.00, residual: 0.00, state: 'chiusa', pn_ap: '2/2024', pn_ch: '7/2024' },
  { id: '9', subject: 'Rossi Mario', type: 'percipienti', doc: 'RIT. ACC. 12/2024', date: '2024-01-31', due: '2024-01-31', original: 250.00, paid: 250.00, residual: 0.00, state: 'chiusa', pn_ap: '1/2024', pn_ch: '1/2024' },
  { id: '10', subject: 'Bianchi Laura', type: 'percipienti', doc: 'RIT. ACC. 15/2024', date: '2024-02-29', due: '2024-02-29', original: 180.00, paid: 0.00, residual: 180.00, state: 'aperta', pn_ap: '2/2024', pn_ch: '—' },
  { id: '11', subject: 'Rossi & Associati', type: 'percipienti', doc: 'RIT. ACC. 18/2024', date: '2024-03-15', due: '2024-03-15', original: 450.00, paid: 450.00, residual: 0.00, state: 'chiusa', pn_ap: '3/2024', pn_ch: '3/2024' },
  { id: '12', subject: 'Consorzio Stabile', type: 'clienti', doc: 'FATPA 110/2024', date: '2024-06-10', due: '2024-07-10', original: 1500.00, paid: 500.00, residual: 1000.00, state: 'parziale', pn_ap: '3/2024', pn_ch: '8/2024' },
  { id: '13', subject: 'Ristorante Da Gianni', type: 'fornitori', doc: 'FATPA 310/2024', date: '2024-06-12', due: '2024-07-12', original: 240.00, paid: 240.00, residual: 0.00, state: 'chiusa', pn_ap: '3/2024', pn_ch: '8/2024' },
  { id: '14', subject: 'Servizi Logistici', type: 'clienti', doc: 'FATPA 115/2024', date: '2024-06-20', due: '2024-07-20', original: 2000.00, paid: 0.00, residual: 2000.00, state: 'aperta', pn_ap: '3/2024', pn_ch: '—' },
  { id: '15', subject: 'Studio Associato', type: 'percipienti', doc: 'RIT. ACC. 20/2024', date: '2024-04-05', due: '2024-04-05', original: 600.00, paid: 600.00, residual: 0.00, state: 'chiusa', pn_ap: '4/2024', pn_ch: '4/2024' },
  { id: '16', subject: 'Consulenze Integrate', type: 'fornitori', doc: 'FATPA 320/2024', date: '2024-07-05', due: '2024-08-04', original: 1200.00, paid: 0.00, residual: 1200.00, state: 'aperta', pn_ap: '4/2024', pn_ch: '—' },
  { id: '17', subject: 'Immobiliare Gialla', type: 'fornitori', doc: 'FATPA 335/2024', date: '2024-07-15', due: '2024-08-14', original: 900.00, paid: 300.00, residual: 600.00, state: 'parziale', pn_ap: '4/2024', pn_ch: '9/2024' },
  { id: '18', subject: 'Verde S.r.l.', type: 'clienti', doc: 'FATPA 122/2024', date: '2024-08-20', due: '2024-09-19', original: 1100.00, paid: 1100.00, residual: 0.00, state: 'chiusa', pn_ap: '4/2024', pn_ch: '9/2024' }
];

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
  const [bilancioViewTab,setBilancioViewTab]=useState('verifica');
  const [bilancioEsercizio,setBilancioEsercizio]=useState('2024');
  const [bilancioDataSituazione,setBilancioDataSituazione]=useState('2024-12-31');
  const [bilancioTipoProspetto,setBilancioTipoProspetto]=useState('verifica');
  const [bilancioSectionsExpanded,setBilancioSectionsExpanded]=useState({attivo:true,passivo:true,costi:true,ricavi:true});
  const [infoAlert,setInfoAlert]=useState('');
  const [sortBy,setSortBy]=useState('data');
  const [sortDir,setSortDir]=useState('asc');
  const [giornaleConfermate, setGiornaleConfermate] = useState(true);
  const [giornaleSimulate, setGiornaleSimulate] = useState(false);
  const [giornaleStornate, setGiornaleStornate] = useState(false);
  const [giornaleUltimoAggiornamento, setGiornaleUltimoAggiornamento] = useState('');
  const [partitariTipoSoggetto, setPartitariTipoSoggetto] = useState('tutti');
  const [partitariSoggettoSearch, setPartitariSoggettoSearch] = useState('');
  const [partitariStato, setPartitariStato] = useState('tutti');
  const [partitariPeriodoDa, setPartitariPeriodoDa] = useState('2024-01-01');
  const [partitariPeriodoA, setPartitariPeriodoA] = useState('2024-12-31');
  const [partitariPage, setPartitariPage] = useState(1);
  const [partitariRowsPerPage, setPartitariRowsPerPage] = useState(10);
  const [partitariSortBy, setPartitariSortBy] = useState('date');
  const [partitariSortDir, setPartitariSortDir] = useState('asc');
  const [partitariActiveFilters, setPartitariActiveFilters] = useState({
    tipoSoggetto: 'tutti',
    soggettoSearch: '',
    stato: 'tutti',
    periodoDa: '2024-01-01',
    periodoA: '2024-12-31'
  });


  const titoli={
    registri_iva:'Registri IVA',
    partitari:'Partitari Clienti/Fornitori',
    giornale:'Giornale Contabile',
    mastrini:'Mastrini',
    bilancio:'Bilancio di Verifica'
  };

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const renderSortableHeader = (label, colKey, align = 'left') => {
    const isSorted = sortBy === colKey;
    const isAsc = sortDir === 'asc';

    return (
      <th 
        onClick={() => handleSort(colKey)}
        style={{ 
          padding: '0.75rem 1rem', 
          textAlign: align, 
          fontSize: '0.8rem', 
          fontWeight: 600,
          color: isSorted ? 'var(--tx)' : 'var(--mu)',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: '2px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          transition: 'color 0.15s'
        }}
        onMouseEnter={e => {
          if (!isSorted) e.currentTarget.style.color = 'var(--tx)';
        }}
        onMouseLeave={e => {
          if (!isSorted) e.currentTarget.style.color = 'var(--mu)';
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', width: '100%' }}>
          <span>{label}</span>
          {isSorted ? (
            isAsc ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '4px' }}>
                <polyline points="18 15 12 9 6 15" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '4px' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )
          ) : (
            <SortArrow />
          )}
        </div>
      </th>
    );
  };

  const handlePartitariSort = (col) => {
    if (partitariSortBy === col) {
      setPartitariSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setPartitariSortBy(col);
      setPartitariSortDir('asc');
    }
  };

  const renderPartitariSortableHeader = (label, colKey, align = 'left') => {
    const isSorted = partitariSortBy === colKey;
    const isAsc = partitariSortDir === 'asc';

    return (
      <th 
        onClick={() => handlePartitariSort(colKey)}
        style={{ 
          padding: '0.75rem 1rem', 
          textAlign: align, 
          fontSize: '0.8rem', 
          fontWeight: 600,
          color: isSorted ? 'var(--tx)' : 'var(--mu)',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: '2px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          transition: 'color 0.15s'
        }}
        onMouseEnter={e => {
          if (!isSorted) e.currentTarget.style.color = 'var(--tx)';
        }}
        onMouseLeave={e => {
          if (!isSorted) e.currentTarget.style.color = 'var(--mu)';
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', width: '100%' }}>
          <span>{label}</span>
          {isSorted ? (
            isAsc ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '4px' }}>
                <polyline points="18 15 12 9 6 15" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '4px' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )
          ) : (
            <SortArrow />
          )}
        </div>
      </th>
    );
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
        setRegistroModel(model);
      }
      else if(tipoStampa==='giornale'){
        const { data: rawEntries, error: fetchError } = await contabilitaRepo.getLibroGiornalePerStampa(societa.id, periodoInizio, periodoFine);
        if(fetchError) throw fetchError;
        
        const model = buildLibroGiornaleModel(rawEntries);
        setGiornaleModel(model);
        const now = new Date();
        const datePart = now.toLocaleDateString('it-IT');
        const timePart = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        setGiornaleUltimoAggiornamento(`Anteprima generata il ${datePart}, ${timePart}`);
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

  const titli = {
    registri_iva: 'Registri IVA',
    giornale: 'Giornale Contabile',
    partitari: 'Partitari',
    mastrini: 'Mastrini',
    bilancio: 'Bilancio'
  };

  const sottotitoli = {
    registri_iva: 'Consulta e genera i registri IVA Acquisti, Vendite e Corrispettivi',
    giornale: 'Consulta e genera il Libro Giornale delle scritture contabili',
    partitari: 'Stampa schede e prospetti partitari per clienti e fornitori',
    mastrini: 'Visualizza le schede di mastro per i singoli conti del piano dei conti',
    bilancio: 'Prospetti di bilancio di verifica, situazione economica e patrimoniale'
  };

  const isOperativo = ['registri_iva', 'giornale'].includes(tipoStampa);
  const badgeText = isOperativo ? 'Anteprima provvisoria' : 'Fac-simile UX';

  return (
    <div>
      {/* Header scheda */}
      <ContPageHeader
        title={titli[tipoStampa] || tipoStampa}
        subtitle={sottotitoli[tipoStampa]}
        badgeText={badgeText}
        isOperativo={isOperativo}
      />

      {/* Barra filtri per schede operative */}
      {isOperativo && (
        <ContFilterBar isOperativo={true}>
          <div className="fg" style={{ minWidth: 140 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Data inizio</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                <CalendarIcon />
              </span>
              <input 
                type="date" 
                value={periodoInizio} 
                onChange={e => setPeriodoInizio(e.target.value)} 
                style={{ 
                  paddingLeft: '2.5rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bd)',
                  borderRadius: '14px',
                  color: 'var(--tx)',
                  height: '42px',
                  width: '100%'
                }}
              />
            </div>
          </div>
          <div className="fg" style={{ minWidth: 140 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Data fine</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                <CalendarIcon />
              </span>
              <input 
                type="date" 
                value={periodoFine} 
                onChange={e => setPeriodoFine(e.target.value)} 
                style={{ 
                  paddingLeft: '2.5rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bd)',
                  borderRadius: '14px',
                  color: 'var(--tx)',
                  height: '42px',
                  width: '100%'
                }}
              />
            </div>
          </div>

          {tipoStampa === 'registri_iva' && (
            <div className="fg" style={{ minWidth: 150 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Tipo registro</label>
              <select 
                value={registroTipo} 
                onChange={e => { setRegistroTipo(e.target.value); setSortBy('data'); setSortDir('asc'); }}
                style={{ 
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bd)',
                  borderRadius: '14px',
                  color: 'var(--tx)',
                  height: '42px',
                  width: '100%',
                  paddingLeft: '1rem',
                  paddingRight: '2.5rem'
                }}
              >
                <option value="vendite">Vendite</option>
                <option value="acquisti">Acquisti</option>
                <option value="corrispettivi">Corrispettivi</option>
              </select>
            </div>
          )}

          {tipoStampa === 'giornale' && (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', height: '42px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setGiornaleConfermate(prev => !prev)}
                style={{
                  height: '42px',
                  borderRadius: '14px',
                  border: giornaleConfermate ? '1px solid var(--gold)' : '1px solid var(--bd)',
                  background: giornaleConfermate ? 'rgba(232, 146, 42, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  color: giornaleConfermate ? 'var(--tx)' : 'var(--mu)',
                  padding: '0 1rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  userSelect: 'none'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={giornaleConfermate ? 'var(--gold)' : 'var(--mu)'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Confermate
              </button>

              <button
                type="button"
                onClick={() => setGiornaleSimulate(prev => !prev)}
                style={{
                  height: '42px',
                  borderRadius: '14px',
                  border: giornaleSimulate ? '1px solid #3b82f6' : '1px solid var(--bd)',
                  background: giornaleSimulate ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  color: giornaleSimulate ? 'var(--tx)' : 'var(--mu)',
                  padding: '0 1rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  userSelect: 'none'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={giornaleSimulate ? '#3b82f6' : 'var(--mu)'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Simulate
              </button>

              <button
                type="button"
                onClick={() => setGiornaleStornate(prev => !prev)}
                style={{
                  height: '42px',
                  borderRadius: '14px',
                  border: giornaleStornate ? '1px solid #9ca3af' : '1px solid var(--bd)',
                  background: giornaleStornate ? 'rgba(156, 163, 175, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  color: giornaleStornate ? 'var(--tx)' : 'var(--mu)',
                  padding: '0 1rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  userSelect: 'none'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={giornaleStornate ? '#9ca3af' : 'var(--mu)'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                Stornate/Storni
              </button>
            </div>
          )}

          <button
            disabled={loading}
            onClick={generaStampa}
            style={{
              background: 'var(--gold)',
              color: '#0C1628',
              border: 'none',
              borderRadius: '14px',
              fontWeight: '600',
              padding: '10px 20px',
              fontSize: '0.85rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: loading ? 0.7 : 1,
              height: '42px',
              transition: 'background 0.2s ease, transform 0.1s ease',
              marginTop: 'auto',
              boxShadow: '0 4px 12px rgba(232, 146, 42, 0.15)'
            }}
            onMouseEnter={e => {
              if (!loading) e.currentTarget.style.background = 'var(--gld2)';
            }}
            onMouseLeave={e => {
              if (!loading) e.currentTarget.style.background = 'var(--gold)';
            }}
          >
            {loading ? (
              <>⏳ Generazione...</>
            ) : (
              <>
                <SearchDocIcon />
                Genera anteprima
              </>
            )}
          </button>
        </ContFilterBar>
      )}

      {/* Barra filtri e placeholder per schede non operative */}
      {tipoStampa === 'partitari' && (() => {
        const filteredList = partitariMockData.filter(item => {
          if (partitariActiveFilters.tipoSoggetto !== 'tutti' && item.type !== partitariActiveFilters.tipoSoggetto) {
            return false;
          }
          if (partitariActiveFilters.soggettoSearch.trim()) {
            const query = partitariActiveFilters.soggettoSearch.toLowerCase();
            if (!item.subject.toLowerCase().includes(query) && !item.doc.toLowerCase().includes(query)) {
              return false;
            }
          }
          if (partitariActiveFilters.stato !== 'tutti' && item.state !== partitariActiveFilters.stato) {
            return false;
          }
          if (partitariActiveFilters.periodoDa) {
            if (item.date < partitariActiveFilters.periodoDa) return false;
          }
          if (partitariActiveFilters.periodoA) {
            if (item.date > partitariActiveFilters.periodoA) return false;
          }
          return true;
        });

        const sortedList = [...filteredList].sort((a, b) => {
          let valA = a[partitariSortBy];
          let valB = b[partitariSortBy];

          if (partitariSortBy === 'date' || partitariSortBy === 'due') {
            valA = a[partitariSortBy] || '';
            valB = b[partitariSortBy] || '';
          }

          if (valA === undefined || valA === null) valA = '';
          if (valB === undefined || valB === null) valB = '';

          if (typeof valA === 'string') {
            return partitariSortDir === 'asc'
              ? valA.localeCompare(valB, undefined, { numeric: true })
              : valB.localeCompare(valA, undefined, { numeric: true });
          } else {
            return partitariSortDir === 'asc' ? valA - valB : valB - valA;
          }
        });

        const totalItems = sortedList.length;
        const totalPages = Math.ceil(totalItems / partitariRowsPerPage) || 1;
        const startIndex = (partitariPage - 1) * partitariRowsPerPage;
        const endIndex = Math.min(startIndex + partitariRowsPerPage, totalItems);
        const paginatedList = sortedList.slice(startIndex, endIndex);

        const openPartiteList = filteredList.filter(item => item.residual > 0);
        const closedPartiteList = filteredList.filter(item => item.residual <= 0.01);

        const totaleAperto = openPartiteList.reduce((acc, curr) => acc + curr.residual, 0);
        const countAperto = openPartiteList.length;

        const totaleChiuso = closedPartiteList.reduce((acc, curr) => acc + curr.paid, 0);
        const countChiuso = closedPartiteList.length;

        const residuoComplessivo = filteredList.reduce((acc, curr) => acc + curr.residual, 0);
        const numeroPartiteTotali = filteredList.length;

        const handleSearchSubmit = () => {
          setPartitariActiveFilters({
            tipoSoggetto: partitariTipoSoggetto,
            soggettoSearch: partitariSoggettoSearch,
            stato: partitariStato,
            periodoDa: partitariPeriodoDa,
            periodoA: partitariPeriodoA
          });
          setPartitariPage(1);
          setInfoAlert('Fac-simile UX — la funzione contabile reale sarà collegata al modulo Partitario/Pagamenti nella fase dedicata.');
        };

        const handleReset = () => {
          setPartitariTipoSoggetto('tutti');
          setPartitariSoggettoSearch('');
          setPartitariStato('tutti');
          setPartitariPeriodoDa('2024-01-01');
          setPartitariPeriodoA('2024-12-31');
          setPartitariActiveFilters({
            tipoSoggetto: 'tutti',
            soggettoSearch: '',
            stato: 'tutti',
            periodoDa: '2024-01-01',
            periodoA: '2024-12-31'
          });
          setPartitariPage(1);
        };

        const renderSubjectBadge = (type, name) => {
          let letter = 'C';
          let bg = 'rgba(59, 130, 246, 0.08)';
          let color = '#3b82f6';
          let border = '1px solid rgba(59, 130, 246, 0.25)';

          if (type === 'fornitori') {
            letter = 'F';
            bg = 'rgba(139, 92, 246, 0.08)';
            color = '#8b5cf6';
            border = '1px solid rgba(139, 92, 246, 0.25)';
          } else if (type === 'percipienti') {
            letter = 'P';
            bg = 'rgba(16, 185, 129, 0.08)';
            color = '#10b981';
            border = '1px solid rgba(16, 185, 129, 0.25)';
          }

          return (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{
                background: bg,
                color: color,
                border: border,
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                marginRight: '10px',
                fontSize: '11px',
                flexShrink: 0
              }}>
                {letter}
              </span>
              <span>{name}</span>
            </div>
          );
        };

        const renderPartitariStatoBadge = (state) => {
          let bg = 'rgba(16, 185, 129, 0.08)';
          let color = '#10b981';
          let border = '1px solid rgba(16, 185, 129, 0.25)';
          let label = 'Chiusa';

          if (state === 'aperta') {
            bg = 'rgba(232, 146, 42, 0.08)';
            color = 'var(--gold)';
            border = '1px solid rgba(232, 146, 42, 0.25)';
            label = 'Aperta';
          } else if (state === 'parziale') {
            bg = 'rgba(59, 130, 246, 0.08)';
            color = '#3b82f6';
            border = '1px solid rgba(59, 130, 246, 0.25)';
            label = 'Parziale';
          }

          return (
            <span style={{
              background: bg,
              color: color,
              border: border,
              fontSize: '0.72rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '6px',
              fontWeight: 600,
              display: 'inline-block',
              textAlign: 'center',
              minWidth: '60px'
            }}>
              {label}
            </span>
          );
        };

        return (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
              {/* Left Column (Filters & Grid) */}
              <div style={{ flex: '3 1 650px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <ContFilterBar isOperativo={true}>
                  <div className="fg" style={{ minWidth: 120 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Tipo soggetto</label>
                    <select 
                      value={partitariTipoSoggetto} 
                      onChange={e => setPartitariTipoSoggetto(e.target.value)}
                      style={{ 
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--bd)',
                        borderRadius: '14px',
                        color: 'var(--tx)',
                        height: '42px',
                        width: '100%',
                        paddingLeft: '1rem'
                      }}
                    >
                      <option value="tutti">Tutti</option>
                      <option value="clienti">Clienti</option>
                      <option value="fornitori">Fornitori</option>
                      <option value="percipienti">Percipienti</option>
                    </select>
                  </div>

                  <div className="fg" style={{ minWidth: 150 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Soggetto</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        placeholder="Seleziona o cerca..."
                        value={partitariSoggettoSearch}
                        onChange={e => setPartitariSoggettoSearch(e.target.value)}
                        style={{ 
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--bd)',
                          borderRadius: '14px',
                          color: 'var(--tx)',
                          height: '42px',
                          width: '100%',
                          paddingLeft: '1rem',
                          paddingRight: '2rem'
                        }}
                      />
                      <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}>🔍</span>
                    </div>
                  </div>

                  <div className="fg" style={{ minWidth: 120 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Stato partita</label>
                    <select 
                      value={partitariStato} 
                      onChange={e => setPartitariStato(e.target.value)}
                      style={{ 
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--bd)',
                        borderRadius: '14px',
                        color: 'var(--tx)',
                        height: '42px',
                        width: '100%',
                        paddingLeft: '1rem'
                      }}
                    >
                      <option value="tutti">Tutti</option>
                      <option value="aperta">Aperte</option>
                      <option value="parziale">Parziali</option>
                      <option value="chiusa">Chiuse</option>
                    </select>
                  </div>

                  <div className="fg" style={{ minWidth: 130 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Periodo da</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                        <CalendarIcon />
                      </span>
                      <input 
                        type="date" 
                        value={partitariPeriodoDa}
                        onChange={e => setPartitariPeriodoDa(e.target.value)}
                        style={{ 
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--bd)',
                          borderRadius: '14px',
                          color: 'var(--tx)',
                          height: '42px',
                          width: '100%',
                          paddingLeft: '2.3rem'
                        }}
                      />
                    </div>
                  </div>

                  <div className="fg" style={{ minWidth: 130 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Periodo a</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                        <CalendarIcon />
                      </span>
                      <input 
                        type="date" 
                        value={partitariPeriodoA}
                        onChange={e => setPartitariPeriodoA(e.target.value)}
                        style={{ 
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--bd)',
                          borderRadius: '14px',
                          color: 'var(--tx)',
                          height: '42px',
                          width: '100%',
                          paddingLeft: '2.3rem'
                        }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSearchSubmit}
                    style={{
                      background: 'var(--gold)',
                      color: '#0C1628',
                      border: 'none',
                      borderRadius: '14px',
                      fontWeight: '600',
                      padding: '10px 20px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      height: '42px',
                      transition: 'background 0.2s ease',
                      marginTop: 'auto',
                      boxShadow: '0 4px 12px rgba(232, 146, 42, 0.15)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--gld2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--gold)'}
                  >
                    <SearchDocIcon />
                    Mostra anteprima
                  </button>
                </ContFilterBar>

                <ContPreviewCard 
                  title="📋 Elenco Partite" 
                  badgeText="Fac-simile UX"
                  actions={
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        onClick={handleReset}
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--bd)',
                          borderRadius: '8px',
                          color: 'var(--tx)',
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                      >
                        🧹 Pulisci filtri
                      </button>

                      <button
                        onClick={() => setInfoAlert("Esportazione disattivata nell'anteprima fac-simile.")}
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--bd)',
                          borderRadius: '8px',
                          color: 'var(--tx)',
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                      >
                        📥 Esporta
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginLeft: '4px' }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>
                  }
                >
                  <style>{`
                    .hover-row:hover {
                      background-color: var(--bg-row-hover) !important;
                    }
                  `}</style>

                  <div style={{ fontSize: '0.8rem', color: 'var(--mu)', marginBottom: '0.5rem' }}>
                    Risultati trovati: <strong style={{ color: 'var(--tx)' }}>{totalItems}</strong> {totalItems === 1 ? 'partita' : 'partite'}
                  </div>

                  {paginatedList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--mu)', border: '1px dashed var(--bd)', borderRadius: '8px' }}>
                      Nessuna partita corrisponde ai criteri di ricerca selezionati.
                    </div>
                  ) : (
                    <>
                      <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                              {renderPartitariSortableHeader('Soggetto', 'subject', 'left')}
                              {renderPartitariSortableHeader('Documento', 'doc', 'left')}
                              {renderPartitariSortableHeader('Data doc.', 'date', 'center')}
                              {renderPartitariSortableHeader('Scadenza', 'due', 'center')}
                              {renderPartitariSortableHeader('Importo originario', 'original', 'right')}
                              {renderPartitariSortableHeader('Incassato/Pagato', 'paid', 'right')}
                              {renderPartitariSortableHeader('Residuo', 'residual', 'right')}
                              {renderPartitariSortableHeader('Stato', 'state', 'center')}
                              {renderPartitariSortableHeader('PN apertura', 'pn_ap', 'center')}
                              {renderPartitariSortableHeader('PN chiusura', 'pn_ch', 'center')}
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedList.map((item, idx) => (
                              <tr 
                                key={item.id || idx}
                                className="hover-row"
                                style={{ 
                                  borderBottom: '1px solid var(--border-subtle)',
                                  transition: 'background 0.15s ease'
                                }}
                              >
                                <td style={{ padding: '0.75rem 1rem' }}>{renderSubjectBadge(item.type, item.subject)}</td>
                                <td style={{ padding: '0.75rem 1rem' }}><code>{item.doc}</code></td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{fmtDate(item.date)}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{fmtDate(item.due)}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(item.original)} €</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(item.paid)} €</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(item.residual)} €</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{renderPartitariStatoBadge(item.state)}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><code>{item.pn_ap}</code></td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><code>{item.pn_ch}</code></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '1.25rem',
                        fontSize: '0.8rem',
                        color: 'var(--mu)',
                        borderTop: '1px solid var(--bd)',
                        paddingTop: '0.75rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>Righe per pagina:</span>
                          <select
                            value={partitariRowsPerPage}
                            onChange={e => {
                              setPartitariRowsPerPage(Number(e.target.value));
                              setPartitariPage(1);
                            }}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--bd)',
                              borderRadius: '6px',
                              color: 'var(--tx)',
                              padding: '2px 4px',
                              cursor: 'pointer'
                            }}
                          >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <button
                            disabled={partitariPage === 1}
                            onClick={() => setPartitariPage(prev => Math.max(1, prev - 1))}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--bd)',
                              color: partitariPage === 1 ? 'var(--bd)' : 'var(--tx)',
                              borderRadius: '6px',
                              width: '28px',
                              height: '28px',
                              cursor: partitariPage === 1 ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold'
                            }}
                          >
                            &lt;
                          </button>
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                            <button
                              key={pageNum}
                              onClick={() => setPartitariPage(pageNum)}
                              style={{
                                background: partitariPage === pageNum ? 'var(--gold)' : 'var(--bg-surface)',
                                border: '1px solid var(--bd)',
                                color: partitariPage === pageNum ? '#0C1628' : 'var(--tx)',
                                borderRadius: '6px',
                                width: '28px',
                                height: '28px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold'
                              }}
                            >
                              {pageNum}
                            </button>
                          ))}
                          <button
                            disabled={partitariPage === totalPages}
                            onClick={() => setPartitariPage(prev => Math.min(totalPages, prev + 1))}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--bd)',
                              color: partitariPage === totalPages ? 'var(--bd)' : 'var(--tx)',
                              borderRadius: '6px',
                              width: '28px',
                              height: '28px',
                              cursor: partitariPage === totalPages ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold'
                            }}
                          >
                            &gt;
                          </button>
                        </div>

                      </div>
                    </>
                  )}

                  <ContGridFooter text="Questa scheda è fornita in modalità consultazione. Le operazioni di chiusura ed incasso sono gestite nei moduli contabili." />
                </ContPreviewCard>


                  </div>

                  {/* Right Column (Sidebar KPIs) */}
                  <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '280px' }}>
                    <div style={{
                      background: 'rgba(232, 146, 42, 0.05)',
                      border: '1px solid rgba(232, 146, 42, 0.2)',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '1rem',
                      color: 'var(--tx)'
                    }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'rgba(232, 146, 42, 0.1)',
                        color: 'var(--gold)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        flexShrink: 0
                      }}>
                        ℹ
                      </div>
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--gold)', marginBottom: '0.2rem' }}>Fac-simile UX</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--mu)', lineHeight: '1.4' }}>
                          La chiusura partite resterà nei moduli operativi dedicati.
                        </div>
                      </div>
                    </div>

                    <div style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--bd)',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem'
                    }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: 'rgba(232, 146, 42, 0.1)',
                        color: 'var(--gold)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}>
                        €
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.2rem' }}>Totale aperto</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--tx)' }}>{fmt(totaleAperto)} €</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--mu)' }}>{countAperto} {countAperto === 1 ? 'partita' : 'partite'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          );
        })()}



      {tipoStampa === 'mastrini' && (() => {
        // ── Costante condivisa del conto fac-simile (usata da filtro, card e KPI) ─────
        const MOCK_CONTO = { codice: '2.03.08.001', descrizione: 'Fornitore Demo S.r.l.' };
        const MOCK_CONTO_LABEL = `${MOCK_CONTO.codice} — ${MOCK_CONTO.descrizione}`;
        const mastriniMockData = [
          { id: 'INI', date: '2023-12-31', pn: '—', causale: 'SALDO INIZIALE', descrizione: 'Saldo iniziale al 31/12/2023', dare: 0, avere: 12350.00, stato: 'Iniziale' },
          { id: '1', date: '2024-01-15', pn: '12', causale: 'FATT. ACQ.', descrizione: 'Fattura n. 15 del 15/01/2024', dare: 2800.00, avere: 0, stato: 'Registrata' },
          { id: '2', date: '2024-01-28', pn: '24', causale: 'PAGAMENTO', descrizione: 'Bonifico n. 125 del 28/01/2024', dare: 0, avere: 2800.00, stato: 'Registrata' },
          { id: '3', date: '2024-02-10', pn: '27', causale: 'FATT. ACQ.', descrizione: 'Fattura n. 27 del 10/02/2024', dare: 4350.00, avere: 0, stato: 'Registrata' },
          { id: '4', date: '2024-03-05', pn: '35', causale: 'FATT. ACQ.', descrizione: 'Fattura n. 35 del 05/03/2024', dare: 6200.00, avere: 0, stato: 'Registrata' },
          { id: '5', date: '2024-03-20', pn: '48', causale: 'NOTA DI CREDITO', descrizione: 'N. 4 del 20/03/2024', dare: 0, avere: 1200.00, stato: 'Registrata' },
          { id: '6', date: '2024-03-31', pn: '56', causale: 'PAGAMENTO', descrizione: 'Bonifico n. 256 del 31/03/2024', dare: 0, avere: 5000.00, stato: 'Registrata' },
          { id: '7', date: '2024-04-15', pn: '67', causale: 'FATT. ACQ.', descrizione: 'Fattura n. 67 del 15/04/2024', dare: 3150.00, avere: 0, stato: 'Simulata' },
          { id: '8', date: '2024-04-30', pn: '74', causale: 'STORNO FATTURA', descrizione: 'Storno fattura n. 67 del 15/04/2024', dare: 0, avere: 3150.00, stato: 'Stornata' },
          { id: '9', date: '2024-05-15', pn: '82', causale: 'FATT. ACQ.', descrizione: 'Fattura n. 82 del 15/05/2024', dare: 7500.00, avere: 0, stato: 'Registrata' },
          { id: '10', date: '2024-05-31', pn: '95', causale: 'PAGAMENTO', descrizione: 'Bonifico n. 387 del 31/05/2024', dare: 0, avere: 6000.00, stato: 'Registrata' },
          { id: '11', date: '2024-06-15', pn: '106', causale: 'FATT. ACQ.', descrizione: 'Fattura n. 106 del 15/06/2024', dare: 4900.00, avere: 0, stato: 'Registrata' },
          { id: '12', date: '2024-06-30', pn: '118', causale: 'PAGAMENTO', descrizione: 'Bonifico n. 458 del 30/06/2024', dare: 0, avere: 4500.00, stato: 'Registrata' },
          { id: '13', date: '2024-07-15', pn: '131', causale: 'FATT. ACQ.', descrizione: 'Fattura n. 131 del 15/07/2024', dare: 6000.00, avere: 0, stato: 'Registrata' },
          { id: '14', date: '2024-07-31', pn: '142', causale: 'PAGAMENTO', descrizione: 'Bonifico n. 512 del 31/07/2024', dare: 0, avere: 7250.00, stato: 'Registrata' },
          { id: 'FIN', date: '2024-12-31', pn: '—', causale: 'SALDO FINALE', descrizione: 'Saldo finale al 31/12/2024', dare: 0, avere: 0, stato: 'Finale' },
        ];

        const saldoIniziale = 12350.00;
        const movimentiDare = mastriniMockData.filter(r => r.stato !== 'Iniziale' && r.stato !== 'Finale').reduce((s, r) => s + r.dare, 0);
        const movimentiAvere = mastriniMockData.filter(r => r.stato !== 'Iniziale' && r.stato !== 'Finale').reduce((s, r) => s + r.avere, 0);

        let saldoRunning = saldoIniziale;
        const rowsWithSaldo = mastriniMockData.map(r => {
          if (r.stato === 'Iniziale') return { ...r, saldo: saldoIniziale };
          if (r.stato === 'Finale') return { ...r, saldo: saldoRunning };
          saldoRunning = saldoRunning + r.avere - r.dare;
          return { ...r, saldo: saldoRunning };
        });
        const saldoFinale = saldoRunning;
        const totalItems = rowsWithSaldo.length;

        const renderMastriniStatoBadge = (stato) => {
          const map = {
            'Iniziale': { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' },
            'Registrata': { bg: 'rgba(16,185,129,0.08)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' },
            'Simulata': { bg: 'rgba(232,146,42,0.08)', color: 'var(--gold)', border: '1px solid rgba(232,146,42,0.25)' },
            'Stornata': { bg: 'rgba(156,163,175,0.08)', color: '#9ca3af', border: '1px solid rgba(156,163,175,0.25)' },
            'Finale': { bg: 'rgba(139,92,246,0.08)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.25)' },
          };
          const s = map[stato] || map['Registrata'];
          return (
            <span style={{ ...s, fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: '6px', fontWeight: 600, display: 'inline-block', minWidth: '70px', textAlign: 'center' }}>
              {stato}
            </span>
          );
        };

        return (
          <div style={{ marginTop: '1rem' }}>
            {/* Filter bar */}
            <ContFilterBar isOperativo={true}>
              <div className="fg" style={{ minWidth: 280 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Conto</label>
                <select
                  value={MOCK_CONTO.codice}
                  onChange={() => {}}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd)', borderRadius: '14px', color: 'var(--tx)', height: '42px', width: '100%', paddingLeft: '1rem' }}
                >
                  {(Array.isArray(pianoConti) && pianoConti.length > 0
                    ? pianoConti.filter(c => Number(c.livello || 0) >= 3).slice(0, 50).map(c => (
                        <option key={c.id} value={c.codice}>{c.codice} — {c.descrizione}</option>
                      ))
                    : [<option key="demo" value={MOCK_CONTO.codice}>{MOCK_CONTO_LABEL}</option>]
                  )}
                </select>
              </div>

              <div className="fg" style={{ minWidth: 135 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Data inizio</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}><CalendarIcon /></span>
                  <input type="date" defaultValue="2024-01-01" style={{ paddingLeft: '2.3rem', background: 'var(--bg-surface)', border: '1px solid var(--bd)', borderRadius: '14px', color: 'var(--tx)', height: '42px', width: '100%' }} />
                </div>
              </div>

              <div className="fg" style={{ minWidth: 135 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Data fine</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}><CalendarIcon /></span>
                  <input type="date" defaultValue="2024-12-31" style={{ paddingLeft: '2.3rem', background: 'var(--bg-surface)', border: '1px solid var(--bd)', borderRadius: '14px', color: 'var(--tx)', height: '42px', width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: 'auto', alignItems: 'center' }}>
                {[
                  { label: 'Simulate', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.4)', bg: 'rgba(59,130,246,0.08)' },
                  { label: 'Stornate/Storni', color: '#9ca3af', border: '1px solid rgba(156,163,175,0.4)', bg: 'rgba(156,163,175,0.08)' },
                ].map(t => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setInfoAlert(`Filtro "${t.label}" attivo nell'anteprima fac-simile.`)}
                    style={{ height: '42px', borderRadius: '14px', border: t.border, background: t.bg, color: 'var(--tx)', padding: '0 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.2s ease', userSelect: 'none' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setInfoAlert('Fac-simile UX — la funzione reale sarà collegata ai saldi progressivi dei conti nella fase dedicata.')}
                style={{ background: 'var(--gold)', color: '#0C1628', border: 'none', borderRadius: '14px', fontWeight: '600', padding: '10px 20px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', height: '42px', marginTop: 'auto', boxShadow: '0 4px 12px rgba(232,146,42,0.15)', transition: 'background 0.2s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--gld2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--gold)'}
              >
                <SearchDocIcon />
                Mostra anteprima
              </button>
            </ContFilterBar>

            {/* Two-column layout */}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '1rem' }}>
              {/* Left column */}
              <div style={{ flex: '3 1 650px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Conto riepilogo card */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '14px', padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(232,146,42,0.1)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--mu)', marginBottom: '0.1rem' }}>Conto selezionato</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tx)' }}>Conto {MOCK_CONTO_LABEL}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1.25rem', borderTop: '1px solid var(--bd)', paddingTop: '1rem' }}>
                    {[
                      { label: 'Saldo iniziale', value: `${fmt(saldoIniziale)} A`, sub: 'al 31/12/2023', color: 'var(--tx)' },
                      { label: 'Movimenti Dare', value: fmt(movimentiDare), sub: 'nel periodo', color: 'var(--petrolio-light)', arrow: 'up' },
                      { label: 'Movimenti Avere', value: fmt(movimentiAvere), sub: 'nel periodo', color: 'var(--gold)', arrow: 'down' },
                      { label: 'Saldo finale', value: `${fmt(saldoFinale)} A`, sub: 'al 31/12/2024', color: 'var(--gold)', large: true },
                      { label: 'Valuta', valueNode: (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>€</div>
                          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--tx)' }}>EUR</span>
                        </div>
                      ) },
                    ].map((kpi, i) => (
                      <div key={i}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--mu)', marginBottom: '0.2rem' }}>{kpi.label}</div>
                        {kpi.valueNode ? kpi.valueNode : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {kpi.arrow === 'up' && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--petrolio-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                            )}
                            {kpi.arrow === 'down' && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                            )}
                            <div style={{ fontSize: kpi.large ? '1.2rem' : '1.05rem', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                          </div>
                        )}
                        {kpi.sub && <div style={{ fontSize: '0.7rem', color: 'var(--mu)' }}>{kpi.sub}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Movimenti table */}
                <ContPreviewCard
                  title="Movimenti conto"
                  badgeText="Fac-simile UX"
                  actions={
                    <button
                      onClick={() => setInfoAlert("Esportazione Excel disponibile nella versione operativa del mastrino.")}
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd)', borderRadius: '8px', color: 'var(--tx)', padding: '6px 14px', fontSize: '0.8rem', fontWeight: '500', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Esporta in Excel
                    </button>
                  }
                >
                  <style>{`.mastrini-row:hover { background-color: var(--bg-row-hover) !important; }`}</style>

                  <div style={{ fontSize: '0.8rem', color: 'var(--mu)', marginBottom: '0.5rem' }}>
                    <strong style={{ color: 'var(--tx)' }}>{totalItems}</strong> movimenti trovati
                  </div>

                  <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-surface)' }}>
                          {[['Data','left'],['N. PN','center'],['Causale','left'],['Descrizione','left'],['Dare','right'],['Avere','right'],['Saldo progressivo','right'],['Stato','center']].map(([lbl, al]) => (
                            <th key={lbl} style={{ padding: '0.75rem 1rem', textAlign: al, fontSize: '0.78rem', fontWeight: 600, color: 'var(--mu)', borderBottom: '2px solid var(--border-subtle)', background: 'var(--bg-surface)', whiteSpace: 'nowrap' }}>{lbl}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rowsWithSaldo.map((r, idx) => {
                          const isSpecial = r.stato === 'Iniziale' || r.stato === 'Finale';
                          return (
                            <tr key={r.id || idx} className="mastrini-row" style={{ borderBottom: '1px solid var(--border-subtle)', background: isSpecial ? 'rgba(232,146,42,0.03)' : 'transparent', transition: 'background 0.15s ease', fontWeight: isSpecial ? 600 : 400 }}>
                              <td style={{ padding: '0.65rem 1rem', whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                              <td style={{ padding: '0.65rem 1rem', textAlign: 'center', fontFamily: 'monospace' }}>{r.pn}</td>
                              <td style={{ padding: '0.65rem 1rem' }}>
                                <code style={{ fontSize: '0.79rem', background: isSpecial ? 'transparent' : 'var(--bg-surface)', padding: isSpecial ? 0 : '2px 6px', borderRadius: '4px' }}>{r.causale}</code>
                              </td>
                              <td style={{ padding: '0.65rem 1rem', color: isSpecial ? 'var(--mu)' : 'var(--tx)' }}>{r.descrizione}</td>
                              <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: r.dare > 0 ? 'var(--petrolio-light)' : 'var(--mu)' }}>
                                {r.dare > 0 ? fmt(r.dare) : '—'}
                              </td>
                              <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: r.avere > 0 && r.stato !== 'Iniziale' ? 'var(--gold)' : 'var(--mu)' }}>
                                {r.avere > 0 && r.stato !== 'Finale' ? fmt(r.avere) : '—'}
                              </td>
                              <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: isSpecial ? 'var(--gold)' : 'var(--tx)' }}>
                                {fmt(r.saldo)} A
                              </td>
                              <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                {renderMastriniStatoBadge(r.stato)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination footer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--bd)', paddingTop: '0.75rem', fontSize: '0.8rem', color: 'var(--mu)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>Visualizza</span>
                      <select disabled style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd)', borderRadius: '6px', color: 'var(--tx)', padding: '2px 6px', cursor: 'not-allowed' }}>
                        <option value={25}>25</option>
                      </select>
                      <span>per pagina</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <button disabled style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd)', color: 'var(--bd)', borderRadius: '6px', width: '28px', height: '28px', cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>&lt;</button>
                      <button style={{ background: 'var(--gold)', border: '1px solid var(--bd)', color: '#0C1628', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</button>
                      <button disabled style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd)', color: 'var(--bd)', borderRadius: '6px', width: '28px', height: '28px', cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>&gt;</button>
                    </div>
                    <div>1–{totalItems} di {totalItems}</div>
                  </div>

                  <ContGridFooter text="Mastrino in modalità Fac-simile UX. Il saldo progressivo e i movimenti sono dati dimostrativi coerenti con il piano dei conti. Il mastrino definitivo sarà connesso alle query reali della prima nota." />
                </ContPreviewCard>
              </div>

              {/* Right sidebar */}
              <div style={{ flex: '1 1 280px', minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: 'rgba(232,146,42,0.05)', border: '1px solid rgba(232,146,42,0.2)', borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(232,146,42,0.1)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem', flexShrink: 0 }}>ℹ</div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--gold)', marginBottom: '0.3rem' }}>Fac-simile UX</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--mu)', lineHeight: '1.5' }}>
                      Questa schermata è un prototipo di interfaccia utente. I dati mostrati sono a puro scopo illustrativo e non rappresentano informazioni reali.
                    </div>
                  </div>
                </div>

                {[
                  { label: 'Saldo iniziale', value: `${fmt(saldoIniziale)} €`, sub: 'al 31/12/2023', iconBg: 'rgba(59,130,246,0.1)', iconColor: '#3b82f6', iconSvg: (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>) },
                  { label: 'Movimenti Dare', value: `${fmt(movimentiDare)} €`, sub: 'nel periodo', iconBg: 'rgba(26,168,191,0.1)', iconColor: 'var(--petrolio-light)', iconSvg: (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>) },
                  { label: 'Movimenti Avere', value: `${fmt(movimentiAvere)} €`, sub: 'nel periodo', iconBg: 'rgba(232,146,42,0.1)', iconColor: 'var(--gold)', iconSvg: (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>) },
                  { label: 'Saldo finale', value: `${fmt(saldoFinale)} €`, sub: 'al 31/12/2024', iconBg: 'rgba(232,146,42,0.1)', iconColor: 'var(--gold)', iconContent: '€' },
                ].map((kpi, i) => (
                  <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: kpi.iconBg, color: kpi.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: kpi.iconContent ? '1.2rem' : undefined, fontWeight: kpi.iconContent ? 'bold' : undefined }}>
                      {kpi.iconContent || kpi.iconSvg}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--mu)', marginBottom: '0.15rem' }}>{kpi.label}</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: kpi.iconColor }}>{kpi.value}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--mu)' }}>{kpi.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {tipoStampa === 'bilancio' && (() => {
        // ── Mock data from approved mockup ──────────────────────────────
        const bilancioData = {
          attivo: [
            { codice: '10.10.01', descrizione: 'Cassa contanti',             dare: 12540.00,  avere: 0 },
            { codice: '10.10.02', descrizione: 'Banca c/c',                  dare: 235870.00, avere: 0 },
            { codice: '10.20.01', descrizione: 'Crediti verso clienti',      dare: 412350.00, avere: 0 },
            { codice: '10.20.02', descrizione: 'Crediti tributari',          dare: 28640.00,  avere: 0 },
            { codice: '10.30.01', descrizione: 'Magazzino merci',            dare: 156780.00, avere: 0 },
            { codice: '10.40.01', descrizione: 'Immobilizzazioni materiali', dare: 398500.00, avere: 0 },
          ],
          passivo: [
            { codice: '20.10.01', descrizione: 'Debiti verso fornitori',             dare: 0, avere: 210430.00 },
            { codice: '20.10.02', descrizione: 'Debiti tributari',                   dare: 0, avere: 32150.00  },
            { codice: '20.20.01', descrizione: 'Debiti verso istituti di credito',  dare: 0, avere: 140000.00 },
            { codice: '20.30.01', descrizione: 'Fondo TFR',                          dare: 0, avere: 48600.00  },
            { codice: '20.40.01', descrizione: 'Capitale sociale',                   dare: 0, avere: 500000.00 },
          ],
          costi: [
            { codice: '30.10.01', descrizione: 'Acquisti di merci',       dare: 232650.00, avere: 0 },
            { codice: '30.20.01', descrizione: 'Costi per servizi',       dare: 186420.00, avere: 0 },
            { codice: '30.30.01', descrizione: 'Costi per il personale', dare: 167300.00, avere: 0 },
          ],
          ricavi: [
            { codice: '40.10.01', descrizione: 'Ricavi delle vendite',    dare: 0, avere: 857170.00 },
            { codice: '40.10.02', descrizione: 'Altri ricavi e proventi', dare: 0, avere: 42700.00  },
          ],
        };

        const allRows = [...bilancioData.attivo, ...bilancioData.passivo, ...bilancioData.costi, ...bilancioData.ricavi];
        const totDare    = allRows.reduce((s, r) => s + r.dare,  0);
        const totAvere   = allRows.reduce((s, r) => s + r.avere, 0);
        const quadratura = Math.abs(totDare - totAvere);
        const totCosti   = bilancioData.costi.reduce((s, r) => s + r.dare, 0);
        const totRicavi  = bilancioData.ricavi.reduce((s, r) => s + r.avere, 0);
        const utilePerditaVal = totRicavi - totCosti;
        const isUtile = utilePerditaVal >= 0;

        const toggleSection = (key) =>
          setBilancioSectionsExpanded(prev => ({ ...prev, [key]: !prev[key] }));

        const renderBilancioRows = (rows, tipo) => rows.map((r, i) => {
          const saldoVal  = r.dare > 0 ? r.dare : r.avere;
          const saldoSuff = r.dare > 0 ? 'D' : 'A';
          const saldoColor = r.dare > 0 ? 'var(--petrolio-light)' : 'var(--gold)';
          return (
            <tr key={r.codice} className="bil-row" style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }}>
              <td style={{ padding: '0.6rem 1rem' }}><code style={{ fontSize: '0.79rem', background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: '4px' }}>{r.codice}</code></td>
              <td style={{ padding: '0.6rem 1rem', color: 'var(--tx)' }}>{r.descrizione}</td>
              <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: r.dare > 0 ? 'var(--petrolio-light)' : 'var(--mu)' }}>{r.dare > 0 ? fmt(r.dare) : '—'}</td>
              <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: r.avere > 0 ? 'var(--gold)' : 'var(--mu)' }}>{r.avere > 0 ? fmt(r.avere) : '—'}</td>
              <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: saldoColor }}>{fmt(saldoVal)} {saldoSuff}</td>
            </tr>
          );
        });

        const sectionMeta = [
          { key: 'attivo',  label: 'ATTIVO',  icon: '↑', iconColor: 'var(--petrolio-light)', totale: bilancioData.attivo.reduce((s,r)=>s+r.dare,0) },
          { key: 'passivo', label: 'PASSIVO', icon: '↓', iconColor: 'var(--gold)',            totale: bilancioData.passivo.reduce((s,r)=>s+r.avere,0) },
          { key: 'costi',   label: 'COSTI',   icon: '−', iconColor: '#e57373',                totale: totCosti },
          { key: 'ricavi',  label: 'RICAVI',  icon: '+', iconColor: '#66bb6a',                totale: totRicavi },
        ];

        const SidebarSectionIcon = ({ label, color }) => {
          const icons = { 'ATTIVO': (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>), 'PASSIVO': (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>), 'COSTI': (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>), 'RICAVI': (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>) };
          return icons[label] || null;
        };

        return (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <style>{`.bil-row:hover{background:var(--bg-surface)!important;}.bil-tab{transition:all 0.15s;}.bil-tab:hover{background:var(--bg-surface)!important;}`}</style>

            {/* ── Filter Bar ─────────────────────────────────────────── */}
            <ContFilterBar isOperativo={true}>
              <div className="fg" style={{ minWidth: 130 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Esercizio</label>
                <select
                  value={bilancioEsercizio}
                  onChange={e => setBilancioEsercizio(e.target.value)}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd)', borderRadius: '14px', color: 'var(--tx)', height: '42px', width: '100%', paddingLeft: '1rem' }}
                >
                  {['2024','2023','2022','2021'].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="fg" style={{ minWidth: 160 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Data situazione</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="date"
                    value={bilancioDataSituazione}
                    onChange={e => setBilancioDataSituazione(e.target.value)}
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd)', borderRadius: '14px', color: 'var(--tx)', height: '42px', width: '100%', paddingLeft: '1rem', paddingRight: '2.5rem' }}
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--mu)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
              </div>

              <div className="fg" style={{ minWidth: 220 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--mu)', marginBottom: '0.3rem', fontWeight: '500' }}>Tipo prospetto</label>
                <select
                  value={bilancioTipoProspetto}
                  onChange={e => { setBilancioTipoProspetto(e.target.value); setBilancioViewTab(e.target.value); }}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd)', borderRadius: '14px', color: 'var(--tx)', height: '42px', width: '100%', paddingLeft: '1rem' }}
                >
                  <option value="verifica">Bilancio di verifica</option>
                  <option value="patrimoniale">Situazione patrimoniale</option>
                  <option value="economica">Situazione economica</option>
                </select>
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', paddingBottom: '0' }}>
                <button
                  onClick={() => setInfoAlert('Fac-simile UX — il bilancio reale sarà collegato a mastrini, saldi e chiusure esercizio nella fase dedicata.')}
                  style={{ background: 'var(--gold)', color: '#0C1628', border: 'none', borderRadius: '14px', height: '42px', padding: '0 1.4rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'filter 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.filter='brightness(1.12)'}
                  onMouseLeave={e => e.currentTarget.style.filter=''}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Mostra anteprima
                </button>
              </div>
            </ContFilterBar>

            {/* ── Main two-panel layout ───────────────────────────────── */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>

              {/* LEFT SIDEBAR (260px) */}
              <div style={{ width: '248px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* Tab navigation */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '12px', overflow: 'hidden' }}>
                  {[
                    { key: 'verifica',     label: 'Bilancio di verifica',      icon: (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>) },
                    { key: 'patrimoniale', label: 'Situazione patrimoniale',    icon: (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>) },
                    { key: 'economica',    label: 'Situazione economica',       icon: (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>) },
                  ].map(tab => {
                    const isActive = bilancioViewTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        className="bil-tab"
                        onClick={() => { setBilancioViewTab(tab.key); setBilancioTipoProspetto(tab.key); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                          width: '100%', padding: '0.75rem 1rem', border: 'none',
                          borderLeft: isActive ? '3px solid var(--gold)' : '3px solid transparent',
                          background: isActive ? 'rgba(232,146,42,0.08)' : 'transparent',
                          color: isActive ? 'var(--gold)' : 'var(--mu)',
                          fontWeight: isActive ? 700 : 400,
                          fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.15s'
                        }}
                      >
                        <span style={{ color: isActive ? 'var(--gold)' : 'var(--mu)', flexShrink: 0 }}>{tab.icon}</span>
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Sezioni anteprima */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mu)', letterSpacing: '0.08em', marginBottom: '0.65rem', textTransform: 'uppercase' }}>Sezioni (anteprima)</div>
                  {sectionMeta.map(s => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: `${s.iconColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <SidebarSectionIcon label={s.label} color={s.iconColor} />
                        </div>
                        <span style={{ fontSize: '0.79rem', color: 'var(--tx)', fontWeight: 500 }}>{s.label.charAt(0) + s.label.slice(1).toLowerCase()}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--mu)', fontFamily: 'monospace' }}>{fmt(s.totale)}</span>
                    </div>
                  ))}
                </div>

                {/* Informazioni */}
                <div style={{ background: 'rgba(232,146,42,0.04)', border: '1px solid rgba(232,146,42,0.18)', borderRadius: '12px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '0.3rem', textTransform: 'uppercase' }}>Informazioni</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--mu)', lineHeight: 1.5 }}>
                      I dati mostrati sono estratti dalla contabilità alla data di situazione selezionata.
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT MAIN CONTENT */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* ── 4 KPI Cards ─────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>

                  {/* Totale Dare */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '12px', padding: '1rem 1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(100,181,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64b5f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--mu)', fontWeight: 600, letterSpacing: '0.04em' }}>Totale Dare</span>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--petrolio-light)', fontFamily: 'monospace', lineHeight: 1.1 }}>{fmt(totDare)} €</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--mu)', marginTop: '0.2rem' }}>100,00%</div>
                  </div>

                  {/* Totale Avere */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '12px', padding: '1rem 1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(232,146,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--mu)', fontWeight: 600, letterSpacing: '0.04em' }}>Totale Avere</span>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--gold)', fontFamily: 'monospace', lineHeight: 1.1 }}>{fmt(totAvere)} €</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--mu)', marginTop: '0.2rem' }}>100,00%</div>
                  </div>

                  {/* Quadratura */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '12px', padding: '1rem 1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: quadratura === 0 ? 'rgba(102,187,106,0.12)' : 'rgba(229,115,115,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={quadratura === 0 ? '#66bb6a' : '#e57373'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{quadratura === 0 ? <><polyline points="20 6 9 17 4 12"/></> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}</svg>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--mu)', fontWeight: 600, letterSpacing: '0.04em' }}>Quadratura</span>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: quadratura === 0 ? '#66bb6a' : '#e57373', fontFamily: 'monospace', lineHeight: 1.1 }}>{fmt(quadratura)} €</div>
                    <div style={{ fontSize: '0.7rem', color: quadratura === 0 ? '#66bb6a' : '#e57373', marginTop: '0.2rem' }}>{quadratura === 0 ? 'Perfetta' : 'Sbilanciato'}</div>
                  </div>

                  {/* Utile/Perdita provvisoria */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '12px', padding: '1rem 1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isUtile ? 'rgba(102,187,106,0.12)' : 'rgba(229,115,115,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isUtile ? '#66bb6a' : '#e57373'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--mu)', fontWeight: 600, letterSpacing: '0.04em' }}>Utile/Perdita provvisoria</span>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: isUtile ? '#66bb6a' : '#e57373', fontFamily: 'monospace', lineHeight: 1.1 }}>{fmt(Math.abs(utilePerditaVal))} €</div>
                    <div style={{ fontSize: '0.7rem', color: isUtile ? '#66bb6a' : '#e57373', marginTop: '0.2rem', fontWeight: 600 }}>{isUtile ? 'Utile provvisorio' : 'Perdita provvisoria'}</div>
                  </div>
                </div>

                {/* ── Table panel ───────────────────────────────────── */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '14px', overflow: 'hidden' }}>

                  {/* ── Bilancio di verifica tab ─────────────────────── */}
                  {bilancioViewTab === 'verifica' && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-surface)', borderBottom: '2px solid var(--border-subtle)' }}>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--mu)', fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.04em' }}>Codice conto</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--mu)', fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.04em' }}>Descrizione conto</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--mu)', fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.04em' }}>Saldo Dare</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--mu)', fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.04em' }}>Saldo Avere</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--mu)', fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.04em' }}>Saldo finale</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionMeta.map(section => (
                            <>
                              {/* Section header row */}
                              <tr
                                key={`hdr-${section.key}`}
                                onClick={() => toggleSection(section.key)}
                                style={{ background: 'var(--bg-surface)', cursor: 'pointer', userSelect: 'none' }}
                              >
                                <td colSpan={5} style={{ padding: '0.55rem 1rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--mu)', transition: 'transform 0.2s', display: 'inline-block', transform: bilancioSectionsExpanded[section.key] ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: section.iconColor, letterSpacing: '0.1em' }}>{section.label}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--mu)', fontWeight: 600 }}>{fmt(section.totale)} {section.key === 'passivo' || section.key === 'ricavi' ? 'A' : 'D'}</span>
                                  </div>
                                </td>
                              </tr>
                              {/* Detail rows */}
                              {bilancioSectionsExpanded[section.key] && renderBilancioRows(bilancioData[section.key], section.key)}
                            </>
                          ))}

                          {/* Grand total row */}
                          <tr style={{ background: 'var(--bg-surface)', borderTop: '2px solid var(--border-subtle)' }}>
                            <td colSpan={2} style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--tx)', fontSize: '0.82rem', textAlign: 'right' }}>TOTALI</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--petrolio-light)', fontSize: '0.82rem' }}>{fmt(totDare)}</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--gold)', fontSize: '0.82rem' }}>{fmt(totAvere)}</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: quadratura === 0 ? '#66bb6a' : '#e57373', fontSize: '0.82rem' }}>Sbilancio: {fmt(quadratura)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* ── Situazione Patrimoniale tab ───────────────────── */}
                  {bilancioViewTab === 'patrimoniale' && (
                    <div style={{ padding: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      {/* Attivo */}
                      <div style={{ flex: '1 1 300px', border: '1px solid var(--bd)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ background: 'rgba(100,181,246,0.08)', borderBottom: '2px solid var(--petrolio-light)', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'var(--petrolio-light)', fontSize: '0.85rem' }}>ATTIVO</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--petrolio-light)', fontWeight: 700 }}>{fmt(bilancioData.attivo.reduce((s,r)=>s+r.dare,0))} €</span>
                        </div>
                        {bilancioData.attivo.map(r => (
                          <div key={r.codice} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.55rem 1rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--tx)' }}>{r.descrizione}</span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--petrolio-light)', fontWeight: 600 }}>{fmt(r.dare)}</span>
                          </div>
                        ))}
                      </div>
                      {/* Passivo + PN */}
                      <div style={{ flex: '1 1 300px', border: '1px solid var(--bd)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ background: 'rgba(232,146,42,0.08)', borderBottom: '2px solid var(--gold)', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'var(--gold)', fontSize: '0.85rem' }}>PASSIVO & PATRIMONIO NETTO</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--gold)', fontWeight: 700 }}>{fmt(bilancioData.passivo.reduce((s,r)=>s+r.avere,0) + (isUtile ? utilePerditaVal : 0))} €</span>
                        </div>
                        {bilancioData.passivo.map(r => (
                          <div key={r.codice} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.55rem 1rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--tx)' }}>{r.descrizione}</span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--gold)', fontWeight: 600 }}>{fmt(r.avere)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.55rem 1rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem', background: 'rgba(102,187,106,0.05)' }}>
                          <span style={{ color: '#66bb6a', fontStyle: 'italic' }}>{isUtile ? 'Utile' : 'Perdita'} d'esercizio provvisorio</span>
                          <span style={{ fontFamily: 'monospace', color: '#66bb6a', fontWeight: 600 }}>{fmt(Math.abs(utilePerditaVal))}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Situazione Economica tab ──────────────────────── */}
                  {bilancioViewTab === 'economica' && (
                    <div style={{ padding: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      {/* Costi */}
                      <div style={{ flex: '1 1 300px', border: '1px solid var(--bd)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ background: 'rgba(229,115,115,0.07)', borderBottom: '2px solid #e57373', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#e57373', fontSize: '0.85rem' }}>COSTI</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#e57373', fontWeight: 700 }}>{fmt(totCosti)} €</span>
                        </div>
                        {bilancioData.costi.map(r => (
                          <div key={r.codice} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.55rem 1rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--tx)' }}>{r.descrizione}</span>
                            <span style={{ fontFamily: 'monospace', color: '#e57373', fontWeight: 600 }}>{fmt(r.dare)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 1rem', background: 'var(--bg-surface)', fontSize: '0.82rem', fontWeight: 700 }}>
                          <span style={{ color: 'var(--tx)' }}>TOTALE COSTI</span>
                          <span style={{ fontFamily: 'monospace', color: '#e57373' }}>{fmt(totCosti)} €</span>
                        </div>
                      </div>
                      {/* Ricavi */}
                      <div style={{ flex: '1 1 300px', border: '1px solid var(--bd)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ background: 'rgba(102,187,106,0.07)', borderBottom: '2px solid #66bb6a', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#66bb6a', fontSize: '0.85rem' }}>RICAVI</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#66bb6a', fontWeight: 700 }}>{fmt(totRicavi)} €</span>
                        </div>
                        {bilancioData.ricavi.map(r => (
                          <div key={r.codice} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.55rem 1rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--tx)' }}>{r.descrizione}</span>
                            <span style={{ fontFamily: 'monospace', color: '#66bb6a', fontWeight: 600 }}>{fmt(r.avere)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 1rem', background: 'var(--bg-surface)', fontSize: '0.82rem', fontWeight: 700 }}>
                          <span style={{ color: 'var(--tx)' }}>TOTALE RICAVI</span>
                          <span style={{ fontFamily: 'monospace', color: '#66bb6a' }}>{fmt(totRicavi)} €</span>
                        </div>
                      </div>
                      {/* Risultato */}
                      <div style={{ flex: '1 1 100%', border: `1px solid ${isUtile ? '#66bb6a40' : '#e5737340'}`, borderRadius: '10px', padding: '1rem 1.25rem', background: isUtile ? 'rgba(102,187,106,0.04)' : 'rgba(229,115,115,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Risultato d'esercizio provvisorio</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--mu)' }}>{isUtile ? 'Ricavi > Costi' : 'Costi > Ricavi'} — chiusura definitiva dipende dalla fase di chiusura esercizio</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isUtile ? '#66bb6a' : '#e57373', fontFamily: 'monospace' }}>{isUtile ? '+' : '-'}{fmt(Math.abs(utilePerditaVal))} €</div>
                          <div style={{ fontSize: '0.72rem', color: isUtile ? '#66bb6a' : '#e57373', fontWeight: 600 }}>{isUtile ? 'UTILE PROVVISORIO' : 'PERDITA PROVVISORIA'}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ borderTop: '1px solid var(--border-subtle)', background: 'rgba(232,146,42,0.04)', padding: '0.8rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span style={{ fontSize: '0.76rem', color: 'var(--mu)' }}>
                      <strong style={{ color: 'var(--gold)' }}>Fac-simile UX</strong> — il bilancio definitivo sarà disponibile dopo il completamento di saldi, mastrini e chiusure esercizio.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}



      {/* Area alert/stato */}
      {error && <div className="alert alert-err" style={{ marginBottom: '1rem' }}>{error}</div>}

      {infoAlert && (
        <div style={{ position: 'relative' }}>
          <ContInfoPanel text={infoAlert} type="info" />
          <button 
            onClick={() => setInfoAlert('')}
            style={{ 
              position: 'absolute', 
              right: '16px', 
              top: '50%', 
              transform: 'translateY(-50%)', 
              background: 'none', 
              border: 'none', 
              color: 'var(--mu)', 
              cursor: 'pointer', 
              fontSize: '1.1rem',
              fontWeight: 'bold',
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Anteprima Registri IVA */}
      {registroModel && tipoStampa === 'registri_iva' && (
        <ContPreviewCard
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--tx)' }}>
                {`Registro IVA ${registroTipo === 'vendite' ? 'Vendite' : registroTipo === 'acquisti' ? 'Acquisti' : 'Corrispettivi'}`}
              </span>
              <span style={{
                background: 'rgba(16, 185, 129, 0.08)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                fontSize: '0.72rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                ✓ Anteprima generata
              </span>
            </div>
          }
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => setInfoAlert("Esportazione PDF disattivata nell'anteprima provvisoria. La stampa ufficiale sarà generata con protocollo definitivo.")}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bd)',
                  borderRadius: '8px',
                  color: 'var(--tx)',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
              >
                <PdfIcon />
                PDF
              </button>
              <button
                onClick={() => setInfoAlert("Esportazione Excel disattivata nell'anteprima provvisoria. I prospetti finali saranno disponibili in configurazione registri.")}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bd)',
                  borderRadius: '8px',
                  color: 'var(--tx)',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
              >
                <ExcelIcon />
                Excel
              </button>
              <button
                onClick={() => window.print()}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bd)',
                  borderRadius: '8px',
                  color: 'var(--tx)',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
              >
                <PrinterIcon />
                Stampa
              </button>
              <button
                onClick={() => setInfoAlert("Opzioni aggiuntive disponibili per registri IVA consolidati.")}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bd)',
                  borderRadius: '8px',
                  color: 'var(--tx)',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
              >
                <ThreeDotsIcon />
              </button>
            </div>
          }
        >
          <style>{`
            .hover-row:hover {
              background-color: var(--bg-row-hover) !important;
            }
          `}</style>

          {registroModel.rows.length === 0 ? (
            <EmptyState periodoInizio={periodoInizio} periodoFine={periodoFine} />
          ) : (
            <>
              {/* KPI strip compatta — visibile subito sopra la tabella */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <KpiCard title="Totale imponibile" value={`${fmt(registroModel.totaleImponibile)} €`} subtitle="Somma imponibili" iconType="imponibile" />
                <KpiCard title="Totale IVA" value={`${fmt(registroModel.totaleIva)} €`} subtitle="Somma IVA" iconType="iva" />
                <KpiCard title="Totale complessivo" value={`${fmt(registroModel.totaleImponibile + registroModel.totaleIva)} €`} subtitle="Imponibile + IVA" iconType="complessivo" />
                <KpiCard title="N° documenti" value={new Set(registroModel.rows.map(r => r.numero_documento + '_' + r.soggetto_denominazione)).size} subtitle="Documenti contabilizzati" iconType="documenti" />
                {registroModel.rows.some(r => r.split_payment) && (
                  <KpiCard title="Split payment" value={registroModel.rows.filter(r => r.split_payment).length} subtitle="Righe split payment" iconType="iva" />
                )}
              </div>
              <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: 'var(--mu)', borderBottom: '2px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>Data</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: 'var(--mu)', borderBottom: '2px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>Protocollo provvisorio</th>
                      {renderSortableHeader('Numero documento', 'numero_documento', 'left')}
                      {renderSortableHeader('Cliente/Controparte', 'soggetto_denominazione', 'left')}
                      {renderSortableHeader('Imponibile', 'imponibile', 'right')}
                      {renderSortableHeader('IVA', 'iva', 'right')}
                      {renderSortableHeader('Aliquota', 'aliquota', 'center')}
                      {renderSortableHeader('Totale', 'totale', 'right')}
                      <th style={{ padding: '0.75rem 1rem', width: '50px', borderBottom: '2px solid var(--border-subtle)', background: 'var(--bg-surface)' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(registroModel.rows)].sort((a, b) => {
                      let valA = a[sortBy];
                      let valB = b[sortBy];
                      if (sortBy === 'data') {
                        valA = a.data_documento || '';
                        valB = b.data_documento || '';
                      } else if (sortBy === 'totale') {
                        valA = (a.imponibile || 0) + (a.iva || 0);
                        valB = (b.imponibile || 0) + (b.iva || 0);
                      }
                      if (valA === undefined || valA === null) valA = '';
                      if (valB === undefined || valB === null) valB = '';
                      if (typeof valA === 'string') {
                        return sortDir === 'asc' 
                          ? valA.localeCompare(valB, undefined, { numeric: true }) 
                          : valB.localeCompare(valA, undefined, { numeric: true });
                      } else {
                        return sortDir === 'asc' ? valA - valB : valB - valA;
                      }
                    }).map((r, index) => {
                      const prefix = registroTipo === 'vendite' ? 'V' : registroTipo === 'acquisti' ? 'A' : 'C';
                      const anno = r.data_registrazione ? new Date(r.data_registrazione).getFullYear() : new Date().getFullYear();
                      const protocollo = `${prefix}/${anno}/${String(r.progressivoProvvisorio).padStart(6, '0')}`;
                      const totaleRiga = (r.imponibile || 0) + (r.iva || 0);

                      return (
                        <tr 
                          key={r.id || index} 
                          className="hover-row"
                          style={{ 
                            borderBottom: '1px solid var(--border-subtle)',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <td style={{ padding: '0.75rem 1rem' }}>{fmtDate(r.data_documento)}</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: 'var(--mu)' }}>{protocollo}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>{r.numero_documento}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>{r.soggetto_denominazione}</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.imponibile)} €</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.iva)} €</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontFamily: 'monospace' }}>{r.aliquota != null ? `${r.aliquota}%` : '—'}</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(totaleRiga)} €</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <button 
                              style={{ background: 'none', border: 'none', color: 'var(--mu)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                              title="Opzioni riga"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInfoAlert(`Documento ${r.numero_documento} — causale: ${r.causale_iva_codice} (${r.causale_iva_descrizione})`);
                              }}
                            >
                              <ThreeDotsIcon />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* KPI totali riepilogo in 4 colonne */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginTop: '1.5rem',
                marginBottom: '1rem'
              }}>
                <KpiCard 
                  title="Totale imponibile" 
                  value={`${fmt(registroModel.totaleImponibile)} €`} 
                  subtitle="Somma degli imponibili" 
                  iconType="imponibile" 
                />
                <KpiCard 
                  title="Totale IVA" 
                  value={`${fmt(registroModel.totaleIva)} €`} 
                  subtitle="Somma dell'IVA" 
                  iconType="iva" 
                />
                <KpiCard 
                  title="Totale complessivo" 
                  value={`${fmt(registroModel.totaleImponibile + registroModel.totaleIva)} €`} 
                  subtitle="Imponibile + IVA" 
                  iconType="complessivo" 
                />
                <KpiCard 
                  title="Numero documenti" 
                  value={new Set(registroModel.rows.map(r => r.numero_documento + '_' + r.soggetto_denominazione)).size} 
                  subtitle="Documenti contabilizzati" 
                  iconType="documenti" 
                />
              </div>
            </>
          )}

          <ContGridFooter text="Anteprima provvisoria. I progressivi visualizzati non costituiscono protocollo definitivo." type="warning" />
        </ContPreviewCard>
      )}

      {/* Anteprima Giornale */}
      {giornaleModel && tipoStampa === 'giornale' && (() => {
        const filteredEntries = (giornaleModel.entries || []).filter(entry => {
          const stato = entry.stato || 'confermata';
          if (stato === 'confermata' || stato === 'definitiva') return giornaleConfermate;
          if (stato === 'simulata' || stato === 'bozza') return giornaleSimulate;
          if (stato === 'stornata' || stato === 'storno') return giornaleStornate;
          return true;
        });

        const flatRows = [];
        filteredEntries.forEach(entry => {
          const righe = Array.isArray(entry.righe) ? entry.righe : [];
          righe.forEach(r => {
            flatRows.push({
              id: r.id || `${entry.id}_${r.riga_numero}`,
              data: entry.data_registrazione,
              numero_pn: entry.numero_registrazione,
              causale: entry.causale_codice,
              descrizione: entry.descrizione + (entry.cliente_fornitore_nome ? ` — ${entry.cliente_fornitore_nome}` : ''),
              conto: r.conto_codice,
              descrizione_conto: r.conto_descrizione + (r.descrizione_riga ? ` (${r.descrizione_riga})` : ''),
              dare: r.importo_dare || 0,
              avere: r.importo_avere || 0,
              stato: entry.stato || 'confermata'
            });
          });
        });

        const sortedFlatRows = [...flatRows].sort((a, b) => {
          let valA = a[sortBy];
          let valB = b[sortBy];
          
          if (sortBy === 'data') {
            valA = a.data || '';
            valB = b.data || '';
          }
          
          if (valA === undefined || valA === null) valA = '';
          if (valB === undefined || valB === null) valB = '';
          
          if (typeof valA === 'string') {
            return sortDir === 'asc' 
              ? valA.localeCompare(valB, undefined, { numeric: true }) 
              : valB.localeCompare(valA, undefined, { numeric: true });
          } else {
            return sortDir === 'asc' ? valA - valB : valB - valA;
          }
        });

        const filteredDare = flatRows.reduce((acc, r) => acc + (r.dare || 0), 0);
        const filteredAvere = flatRows.reduce((acc, r) => acc + (r.avere || 0), 0);
        const sbilancio = filteredDare - filteredAvere;
        const isQuadrato = Math.abs(sbilancio) < 0.01;
        const numRegistrazioni = new Set(flatRows.map(r => r.numero_pn)).size;
        const numRighe = flatRows.length;

        const renderStatoBadge = (stato) => {
          let bg = 'rgba(16, 185, 129, 0.08)';
          let color = '#10b981';
          let border = '1px solid rgba(16, 185, 129, 0.25)';
          let label = 'Confermata';
          let icon = (
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          );

          if (stato === 'simulata' || stato === 'bozza') {
            bg = 'rgba(59, 130, 246, 0.08)';
            color = '#3b82f6';
            border = '1px solid rgba(59, 130, 246, 0.25)';
            label = 'Simulata';
            icon = (
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            );
          } else if (stato === 'stornata' || stato === 'storno') {
            bg = 'rgba(156, 163, 175, 0.08)';
            color = '#9ca3af';
            border = '1px solid rgba(156, 163, 175, 0.25)';
            label = 'Stornata';
            icon = (
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            );
          }

          return (
            <span style={{
              background: bg,
              color: color,
              border: border,
              fontSize: '0.72rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '6px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap'
            }}>
              {icon}
              {label}
            </span>
          );
        };

        return (
          <ContPreviewCard
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--tx)' }}>
                  Libro giornale
                </span>
                <span style={{
                  background: isQuadrato ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  color: isQuadrato ? '#10b981' : '#ef4444',
                  border: isQuadrato ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                  fontSize: '0.72rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  {isQuadrato ? '✓ Quadratura OK' : '⚠ Sbilanciato'}
                </span>
              </div>
            }
            actions={
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--mu)', fontSize: '0.8rem' }}>
                <span>{giornaleUltimoAggiornamento}</span>
                <button
                  onClick={generaStampa}
                  disabled={loading}
                  title="Ricarica anteprima"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--mu)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px',
                    borderRadius: '8px',
                    transition: 'color 0.2s, background 0.2s',
                    userSelect: 'none'
                  }}
                  onMouseEnter={e => {
                    if (!loading) {
                      e.currentTarget.style.color = 'var(--tx)';
                      e.currentTarget.style.background = 'var(--bg-surface)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!loading) {
                      e.currentTarget.style.color = 'var(--mu)';
                      e.currentTarget.style.background = 'none';
                    }
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
                    <path d="M23 4v6h-6" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              </div>
            }
          >
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
              .hover-row:hover {
                background-color: var(--bg-row-hover) !important;
              }
            `}</style>

            {flatRows.length === 0 ? (
              <GiornaleEmptyState periodoInizio={periodoInizio} periodoFine={periodoFine} />
            ) : (
              <>
                <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                        {renderSortableHeader('Data', 'data', 'left')}
                        {renderSortableHeader('N. PN', 'numero_pn', 'center')}
                        {renderSortableHeader('Causale', 'causale', 'left')}
                        {renderSortableHeader('Descrizione', 'descrizione', 'left')}
                        {renderSortableHeader('Conto', 'conto', 'left')}
                        {renderSortableHeader('Descrizione conto', 'descrizione_conto', 'left')}
                        {renderSortableHeader('Dare', 'dare', 'right')}
                        {renderSortableHeader('Avere', 'avere', 'right')}
                        {renderSortableHeader('Stato', 'stato', 'center')}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFlatRows.map((r, idx) => (
                        <tr 
                          key={r.id || idx}
                          className="hover-row"
                          style={{ 
                            borderBottom: '1px solid var(--border-subtle)',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <td style={{ padding: '0.75rem 1rem' }}>{fmtDate(r.data)}</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontFamily: 'monospace' }}>{r.numero_pn}</td>
                          <td style={{ padding: '0.75rem 1rem' }}><code>{r.causale}</code></td>
                          <td style={{ padding: '0.75rem 1rem' }}>{r.descrizione}</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}><code>{r.conto}</code></td>
                          <td style={{ padding: '0.75rem 1rem' }}>{r.descrizione_conto}</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: r.dare > 0 ? 'var(--petrolio-light)' : 'var(--mu)' }}>
                            {r.dare > 0 ? `${fmt(r.dare)} €` : '—'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: r.avere > 0 ? 'var(--gold)' : 'var(--mu)' }}>
                            {r.avere > 0 ? `${fmt(r.avere)} €` : '—'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            {renderStatoBadge(r.stato)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginTop: '1.5rem',
                  marginBottom: '1rem'
                }}>
                  <KpiCard 
                    title="Totale Dare" 
                    value={`${fmt(filteredDare)} €`} 
                    subtitle="Somma importi Dare" 
                    iconType="dare" 
                  />
                  <KpiCard 
                    title="Totale Avere" 
                    value={`${fmt(filteredAvere)} €`} 
                    subtitle="Somma importi Avere" 
                    iconType="avere" 
                  />
                  <KpiCard 
                    title="Sbilancio" 
                    value={`${fmt(sbilancio)} €`} 
                    subtitle={isQuadrato ? "Giornale in quadratura" : "Differenza Dare/Avere"} 
                    iconType={isQuadrato ? "sbilancio" : "sbilancio_danger"} 
                  />
                  <KpiCard 
                    title="Numero registrazioni" 
                    value={numRegistrazioni} 
                    subtitle="Registrazioni caricate" 
                    iconType="registrazioni" 
                  />
                  <KpiCard 
                    title="Numero righe" 
                    value={numRighe} 
                    subtitle="Righe contabili totali" 
                    iconType="righe" 
                  />
                </div>
              </>
            )}

            <ContGridFooter text="Questa è un'anteprima provvisoria del libro giornale. I dati potrebbero variare in base a successive registrazioni, modifiche o operazioni di storno. Per ottenere il documento ufficiale, utilizzare la funzione di generazione definitiva." type="warning" />
          </ContPreviewCard>
        );
      })()}

      {/* Spazio per card iniziale quando non è ancora stata generata la stampa per le schede operative */}
      {isOperativo && !registroModel && !giornaleModel && !loading && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', marginTop: '1rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>🖨️</div>
          <div style={{ color: 'var(--mu)' }}>Seleziona il periodo e clicca "Genera Anteprima" per visualizzare il documento</div>
        </div>
      )}
    </div>
  );
}
