import { fmtCurrency } from '../../ui/formatters.js'
import { REG_CARD_STYLE, REG_SECTION_TITLE_STYLE, REG_INLINE_BADGE_STYLE, resolveCausaleLabel, formatShortDate } from './registrazioneUi.js'

function PreviewRow({ label, value, tone = 'neutral' }) {
  const color = tone === 'positive' ? '#8be28e' : tone === 'negative' ? '#ff8f8f' : 'var(--tx)'
  return (
    <div style={{ display: 'grid', gap: '.1rem' }}>
      <div style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(188,204,226,.72)' }}>{label}</div>
      <div style={{ fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

function DraftBlock({ title, note, rows = [] }) {
  return (
    <div className="erp-flat-panel" style={{ margin: 0, padding: '.55rem .6rem', background: 'rgba(255,255,255,.018)' }}>
      <div style={{ display: 'grid', gap: '.08rem', marginBottom: '.35rem' }}>
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'rgba(188,204,226,.94)' }}>{title}</div>
        <div style={{ fontSize: '.63rem', color: 'rgba(188,204,226,.68)' }}>{note}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.35rem' }}>
        {rows.map((row) => (
          <PreviewRow key={`${title}-${row.label}`} label={row.label} value={row.value} tone={row.tone || 'neutral'} />
        ))}
      </div>
    </div>
  )
}

export function RegistrazionePreviewPanel({
  header,
  selectedCausale,
  totals,
  validation,
  dryRunReady = false,
  dryRunBlockedReason = '',
  onControlRegistration = null,
  showPartite = false,
  partite = [],
  onSelectPartita,
  mode = 'overview',
  documentDraft = null,
  ivaDraft = null,
  partitarioDraft = null,
  ritenutaDraft = null,
}) {
  const balanced = Boolean(totals?.isBalanced)
  const causaleLabel = resolveCausaleLabel(selectedCausale)
  const partiteColumns = '20px minmax(160px, 1.55fr) 100px 62px 110px 104px 46px'
  const hasPartiteProp = Array.isArray(partite)
  const demoPartite = hasPartiteProp ? partite : []
  const validationText = validation?.status === 'ok'
    ? 'Validazione: scrittura pronta al controllo.'
    : validation?.blockers?.length
      ? `Validazione: ${validation.blockers[0]}`
      : validation?.warnings?.length
        ? `Validazione: ${validation.warnings[0]}`
        : 'Validazione: da completare.'

  return (
    <div className="erp-flat-panel" style={{ padding: '.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.65rem', marginBottom: '.65rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '.12rem' }}>
          <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.92)' }}>Anteprima / pannello contestuale</div>
          <div style={{ fontSize: '.85rem', color: 'rgba(188,204,226,.78)' }}>Anteprima scrittura</div>
        </div>
        <span className={`bdg ${balanced ? 'bdg-green' : 'bdg-gold'}`} style={{ ...REG_INLINE_BADGE_STYLE, minHeight: 26 }}>
          {balanced ? 'Quadrata' : 'Non quadrata'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.6rem', marginBottom: '.65rem' }}>
        <PreviewRow label="Data registrazione" value={header?.dataRegistrazione || '—'} />
        <PreviewRow label="Causale" value={causaleLabel} />
        <PreviewRow label="Numero documento" value={header?.numeroDocumento || '—'} />
        <PreviewRow label="Totale dare" value={fmtCurrency(totals?.totaleDare || 0)} tone="positive" />
        <PreviewRow label="Totale avere" value={fmtCurrency(totals?.totaleAvere || 0)} tone="negative" />
        <PreviewRow label="Differenza" value={fmtCurrency(totals?.differenza || 0)} tone={balanced ? 'positive' : 'negative'} />
      </div>

      <div style={{ fontSize: '.66rem', color: 'rgba(188,204,226,.7)', lineHeight: 1.35, marginBottom: '.6rem' }}>
        {validationText}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
        <button
          type="button"
          className="btn"
          onClick={onControlRegistration}
          disabled={!dryRunReady}
          style={{ minHeight: 38, padding: '.42rem .78rem' }}
        >
          Controlla registrazione
        </button>
        <span className={`bdg ${dryRunReady ? 'bdg-green' : 'bdg-gold'}`} style={{ minHeight: 26 }}>
          {dryRunReady ? 'Controllabile' : 'Da completare'}
        </span>
        {!dryRunReady && dryRunBlockedReason ? (
          <span style={{ fontSize: '.66rem', color: 'rgba(188,204,226,.74)', lineHeight: 1.3 }}>
            {dryRunBlockedReason}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: '.45rem', marginBottom: '.6rem' }}>
        <DraftBlock
          title="Documento"
          note="Predisposto, non registrato fiscalmente in questa fase"
          rows={[
            { label: 'Divisa', value: documentDraft?.divisa || 'EUR' },
            { label: 'Cambio', value: documentDraft?.cambio || '1,000000' },
            { label: 'Pagamento', value: documentDraft?.modalitaPagamento || '—' },
            { label: 'Totale documento', value: fmtCurrency(documentDraft?.totaleDocumento || 0), tone: 'positive' },
          ]}
        />
        {ivaDraft?.active ? (
          <DraftBlock
            title="IVA"
            note="IVA predisposta, registri IVA non generati in questa fase"
            rows={[
              { label: 'Causale IVA', value: ivaDraft?.rows?.[0]?.causaleIvaLabel || ivaDraft?.causaleIvaLabel || ivaDraft?.causaleIva || '—' },
              { label: 'Righe', value: String(Array.isArray(ivaDraft?.rows) ? ivaDraft.rows.length : 0) },
              { label: 'Competenza', value: formatShortDate(ivaDraft?.dataCompetenza) },
              { label: 'Operazione', value: formatShortDate(ivaDraft?.dataOperazione) },
              { label: 'Imponibile', value: fmtCurrency(ivaDraft?.imponibile ?? ivaDraft?.totaleImponibile ?? 0), tone: 'positive' },
              { label: 'IVA detratta', value: fmtCurrency(ivaDraft?.ivaDetratta ?? ivaDraft?.ivaDetraibile ?? 0), tone: 'positive' },
              { label: 'IVA indetr.', value: fmtCurrency(ivaDraft?.ivaIndetraibile ?? 0), tone: 'negative' },
              { label: 'Totale', value: fmtCurrency(ivaDraft?.totaleDocumento || 0), tone: 'positive' },
              { label: 'Residuo', value: fmtCurrency(ivaDraft?.residuoDocumento || 0), tone: ivaDraft?.residuoDocumento ? 'negative' : 'positive' },
              { label: 'Registro', value: ivaDraft?.registroIva || 'da assegnare' },
              { label: 'Segno', value: ivaDraft?.segnoRegistro || '+' },
            ]}
          />
        ) : null}
        {partitarioDraft?.active ? (
          <DraftBlock
            title="Partitario"
            note="Partitario predisposto, chiusura reale non eseguita in questa fase"
            rows={[
              { label: 'Soggetto', value: partitarioDraft?.selectedControparteNome || '—' },
              { label: 'Partita', value: partitarioDraft?.selectedPartitaNumeroDocumento || '—' },
              { label: 'Saldo residuo', value: fmtCurrency(partitarioDraft?.selectedPartitaSaldoResiduo || 0), tone: 'negative' },
              { label: 'Chiusura', value: fmtCurrency(partitarioDraft?.importoChiusura || 0), tone: 'positive' },
            ]}
          />
        ) : null}
        {ritenutaDraft?.active ? (
          <DraftBlock
            title="Ritenute"
            note="Ritenute predisposte, CU/770 non generati in questa fase"
            rows={[
              { label: 'Percipiente', value: ritenutaDraft?.percipiente || '—' },
              { label: 'Base', value: fmtCurrency(ritenutaDraft?.imponibileSoggettoRitenuta || 0), tone: 'positive' },
              { label: 'Ritenuta', value: fmtCurrency(ritenutaDraft?.ritenuta || 0), tone: 'negative' },
              { label: 'Netto', value: fmtCurrency(ritenutaDraft?.netto || 0), tone: 'positive' },
            ]}
          />
        ) : null}
      </div>

      {showPartite ? (
        <div
          className="erp-flat-panel"
          style={{
            margin: 0,
            padding: '.65rem',
            background: 'rgba(255,255,255,.018)',
            borderColor: mode === 'partite' ? 'rgba(255,208,92,.35)' : 'rgba(96,165,250,.08)',
            boxShadow: mode === 'partite' ? '0 0 0 1px rgba(255,208,92,.12) inset' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.45rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'rgba(188,204,226,.9)' }}>Partite aperte (F9)</div>
            <input placeholder="Cerca per n. documento..." style={{ fontSize: '.74rem', minHeight: 31, padding: '.28rem .46rem' }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gap: '.34rem', minWidth: 620 }}>
              <div style={{ display: 'grid', gridTemplateColumns: partiteColumns, gap: '.35rem', fontSize: '.6rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                <span />
                <span>N. documento</span>
                <span>Data</span>
                <span>Tipo</span>
                <span>Saldo residuo</span>
                <span>Imp. chiusura</span>
                <span>Segno</span>
              </div>
              {demoPartite.length ? (
                demoPartite.map((row, idx) => (
                  <label
                    key={row.id || idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: partiteColumns,
                      gap: '.35rem',
                      alignItems: 'center',
                      fontSize: '.74rem',
                      padding: '.28rem .25rem',
                      borderRadius: 12,
                      border: '1px solid rgba(136,169,204,.1)',
                      background: idx === 0 ? 'rgba(61,211,110,.08)' : 'rgba(255,255,255,.012)',
                    }}
                  >
                    <input type="radio" name="registrazione-partita" defaultChecked={idx === 0} />
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.numeroFattura || row.numero_documento}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{formatShortDate(row.data || row.data_documento)}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{row.tipo || row.tipo_documento}</span>
                    <span style={{ color: row.saldoResiduo < 0 ? '#ff8f8f' : '#d7f5e3', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtCurrency(row.saldoResiduo || row.importo_residuo || 0)}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{fmtCurrency(row.importoChiusura || 0)}</span>
                    <span style={{ color: row.segno === 'D' ? '#ff8f8f' : '#8be28e', fontWeight: 800, whiteSpace: 'nowrap' }}>{row.segno || 'A'}</span>
                  </label>
                ))
              ) : (
                <div style={{ padding: '.7rem .4rem', color: 'rgba(188,204,226,.76)', fontSize: '.68rem' }}>
                  Partite aperte non ancora collegate al read model reale.
                </div>
              )}
            </div>
          </div>
          {demoPartite.length ? (
            <button
              type="button"
              className="btn-sec"
              style={{ width: '100%', marginTop: '.55rem', padding: '.42rem .7rem' }}
              onClick={() => onSelectPartita?.(demoPartite[0] || null)}
            >
              Applica selezionata (F9)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
