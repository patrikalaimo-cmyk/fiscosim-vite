import React from 'react';

/**
 * Shared page header with title, subtitle, and badge status.
 */
export function ContPageHeader({ title, subtitle, badgeText, isOperativo }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--tx)' }}>{title}</span>
          <span style={{ 
            background: isOperativo ? 'var(--accent-gold-soft)' : 'var(--petrolio-soft)', 
            color: isOperativo ? 'var(--gold)' : 'var(--petrolio-light)', 
            border: `1px solid ${isOperativo ? 'var(--accent-gold-border)' : 'var(--petrolio-border)'}`,
            fontSize: '0.75rem', 
            padding: '0.2rem 0.6rem', 
            borderRadius: '6px',
            fontWeight: 600
          }}>
            {badgeText}
          </span>
        </div>
        {subtitle && <div style={{ fontSize: '.8rem', color: 'var(--mu)', marginTop: '0.25rem' }}>{subtitle}</div>}
      </div>
    </div>
  );
}

/**
 * Standardized card filter bar wrapper.
 */
export function ContFilterBar({ children, isOperativo }) {
  return (
    <div className="card" style={{ marginBottom: '1rem', border: '1px solid var(--bd)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', opacity: isOperativo ? 1 : 0.65 }}>
        {children}
      </div>
    </div>
  );
}

/**
 * KPI container grid.
 */
export function ContKpiGrid({ children }) {
  return (
    <div style={{ 
      display: 'flex', 
      flexWrap: 'wrap', 
      gap: '1.5rem', 
      marginBottom: '1.5rem', 
      background: 'var(--bg-surface)', 
      padding: '1.25rem', 
      borderRadius: '12px', 
      border: '1px solid var(--bd)' 
    }}>
      {children}
    </div>
  );
}

/**
 * Individual KPI card.
 */
export function ContKpiCard({ label, value, color }) {
  let valColor = 'var(--tx)';
  if (color === 'success') valColor = '#10b981';
  else if (color === 'danger') valColor = '#ef4444';
  else if (color === 'warning') valColor = 'var(--gold)';

  return (
    <div style={{ flex: '1 1 150px' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: valColor }}>{value}</div>
    </div>
  );
}

/**
 * Preview card wrapper displaying the tables/details.
 */
export function ContPreviewCard({ title, badgeText, actions, children }) {
  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem', border: '1px solid var(--bd)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--tx)' }}>{title}</span>
          {badgeText && (
            <span style={{ 
              background: 'var(--petrolio-soft)', 
              color: 'var(--petrolio-light)', 
              border: '1px solid var(--petrolio-border)',
              fontSize: '0.72rem', 
              padding: '0.15rem 0.5rem', 
              borderRadius: '4px', 
              fontWeight: 600 
            }}>
              {badgeText}
            </span>
          )}
        </div>
        {actions && <div style={{ display: 'flex', gap: '0.5rem' }}>{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * Info / warning / success panel.
 */
export function ContInfoPanel({ text, type = 'info' }) {
  let bg = 'var(--petrolio-soft)';
  let border = 'var(--petrolio-border)';
  let color = 'var(--petrolio-light)';
  let icon = 'ℹ️';

  if (type === 'success') {
    bg = 'rgba(16, 185, 129, 0.08)';
    border = 'rgba(16, 185, 129, 0.25)';
    color = '#10b981';
    icon = '✅';
  } else if (type === 'warning') {
    bg = 'var(--status-warning-bg)';
    border = 'var(--status-warning-border)';
    color = 'var(--status-warning-text)';
    icon = '⚠️';
  } else if (type === 'error') {
    bg = 'rgba(239, 68, 68, 0.08)';
    border = 'rgba(239, 68, 68, 0.25)';
    color = '#ef4444';
    icon = '🛑';
  }

  return (
    <div style={{
      background: bg,
      color: color,
      borderLeft: `4px solid ${color}`,
      borderTop: `1px solid ${border}`,
      borderBottom: `1px solid ${border}`,
      borderRight: `1px solid ${border}`,
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      marginBottom: '1rem',
      fontWeight: 500,
      fontSize: '0.82rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem'
    }}>
      <span>{icon}</span>
      <div>{text}</div>
    </div>
  );
}

/**
 * Grid/table footer message block.
 */
export function ContGridFooter({ text, type = 'info' }) {
  let borderLeftColor = 'var(--petrolio-light)';
  if (type === 'warning') borderLeftColor = 'var(--gold)';
  
  return (
    <div style={{ 
      fontSize: '0.8rem', 
      background: 'var(--bg-surface)', 
      padding: '0.75rem', 
      borderRadius: '6px', 
      borderLeft: `4px solid ${borderLeftColor}`,
      color: 'var(--mu)',
      marginTop: '1rem'
    }}>
      💡 {text}
    </div>
  );
}

/**
 * Standardized action button inside cards.
 */
export function ContActionButton({ label, disabled, title, onClick, variant = 'primary' }) {
  return (
    <button 
      className={variant === 'primary' ? 'btn' : 'btn-sec'} 
      disabled={disabled} 
      title={title} 
      onClick={onClick}
      style={{
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >
      {label}
    </button>
  );
}
