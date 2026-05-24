import { fmtCurrency } from '../../ui/formatters.js'

function formatMaybeCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '-'
  return fmtCurrency(amount)
}

function AutoLearnStatusBadge({ autoLearnStatus }) {
  if (!autoLearnStatus) return null
  if (autoLearnStatus.saved && autoLearnStatus.certifying) {
    return (
      <div style={{ fontSize: '.65rem', color: '#8ee7b6', padding: '.18rem .5rem', borderRadius: 8, border: '1px solid rgba(142, 231, 182, 0.35)', background: 'rgba(142, 231, 182, 0.07)', whiteSpace: 'nowrap' }}>
        ✓ Regola appresa automaticamente
      </div>
    )
  }
  if (autoLearnStatus.saved && !autoLearnStatus.certifying) {
    return (
      <div style={{ fontSize: '.65rem', color: '#ffd38c', padding: '.18rem .5rem', borderRadius: 8, border: '1px solid rgba(255, 211, 140, 0.35)', background: 'rgba(255, 211, 140, 0.07)', whiteSpace: 'nowrap' }}>
        ⚠ Regola non certificante appresa
      </div>
    )
  }
  return (
    <div style={{ fontSize: '.65rem', color: '#ff9fb0', padding: '.18rem .5rem', borderRadius: 8, border: '1px solid rgba(255, 159, 176, 0.28)', background: 'rgba(255, 159, 176, 0.06)', whiteSpace: 'nowrap' }}>
      Regola non appresa
    </div>
  )
}

export default function GuidedImportDryRunResult({
  dryRunResult,
  onUseImportOnly,
  onSaveDemoRule,
  onBackToMapping,
  onClose,
  isDemo = true,
  autoLearnStatus = null,
}) {
  if (!dryRunResult) {
    return (
      <div style={{ border: '1px solid rgba(157, 185, 213, 0.2)', borderRadius: 12, padding: '.55rem .6rem', color: 'rgba(211, 224, 238, 0.84)', fontSize: '.72rem' }}>
        Nessuna prova parsing ancora eseguita.
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid rgba(157, 185, 213, 0.22)', borderRadius: 12, padding: '.6rem', display: 'grid', gap: '.35rem' }}>
      <div style={{ fontSize: '.72rem', color: '#9fd0ff', textTransform: 'uppercase', letterSpacing: '.06em' }}>{isDemo ? 'Riepilogo finale demo' : 'Riepilogo finale guida'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.25rem .7rem' }}>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Movimenti estratti: <strong>{dryRunResult.movementsExtracted ?? '-'}</strong></div>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Entrate: <strong>{formatMaybeCurrency(dryRunResult.totalIn)}</strong></div>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Uscite: <strong>{formatMaybeCurrency(dryRunResult.totalOut)}</strong></div>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Saldo iniziale: <strong>{formatMaybeCurrency(dryRunResult.openingBalance)}</strong></div>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Saldo finale: <strong>{formatMaybeCurrency(dryRunResult.closingBalanceOfficial)}</strong></div>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Differenza: <strong>{formatMaybeCurrency(dryRunResult.difference)}</strong></div>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Decisione import: <strong>{dryRunResult.finalDecision || '-'}</strong></div>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Decisione template: <strong>{dryRunResult.templateDecision || '-'}</strong></div>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Warning: <strong>{(dryRunResult.warnings || []).length}</strong></div>
        <div style={{ fontSize: '.7rem', color: '#eef6ff' }}>Blocchi: <strong>{(dryRunResult.blockers || []).length}</strong></div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginTop: '.12rem' }}>
        <button type="button" className="btn-sec" style={{ minHeight: 24, fontSize: '.62rem' }} onClick={onUseImportOnly}>{isDemo ? 'Usa solo per questo import demo' : 'Usa solo per questo import'}</button>
        {isDemo
          ? <button type="button" className="btn-sec" style={{ minHeight: 24, fontSize: '.62rem' }} onClick={onSaveDemoRule}>Salva regola demo</button>
          : <AutoLearnStatusBadge autoLearnStatus={autoLearnStatus} />}
        <button type="button" className="btn-sec" style={{ minHeight: 24, fontSize: '.62rem' }} onClick={onBackToMapping}>Torna al mapping</button>
        <button type="button" className="btn-sec" style={{ minHeight: 24, fontSize: '.62rem' }} onClick={onClose}>{isDemo ? 'Chiudi demo' : 'Chiudi guida'}</button>
      </div>
    </div>
  )
}
