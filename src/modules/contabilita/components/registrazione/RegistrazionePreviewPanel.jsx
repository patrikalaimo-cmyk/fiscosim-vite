import { fmtCurrency } from '../../ui/formatters.js'
import { REG_CARD_STYLE, REG_SECTION_TITLE_STYLE, REG_INLINE_BADGE_STYLE, resolveCausaleLabel, formatShortDate } from './registrazioneUi.js'
import { buildCausaleContabilePolicy } from '../../domain/causali/buildCausaleContabilePolicy.js'
import { resolveChiusuraPartiteBehavior } from '../../domain/causali/resolveChiusuraPartiteBehavior.js'


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

const MagicIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const CalcIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <line x1="9" y1="22" x2="9" y2="16" />
    <line x1="15" y1="22" x2="15" y2="16" />
    <line x1="9" y1="16" x2="15" y2="16" />
  </svg>
)

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
  ivaPerCassaPreview = null,
  ritenutaDraft = null,
  checkedPartiteIds = [],
  onToggleCheckedPartita = null,
  onApplyCheckedPartite = null,
  pnRows = []
}) {
  if (mode === 'ivaPerCassaPreview') {
    const items = Array.isArray(ivaPerCassaPreview?.items) ? ivaPerCassaPreview.items : []
    return (
      <div className="erp-flat-panel" style={{ padding: '.85rem', display: 'grid', gap: '.7rem' }}>
        <div>
          <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.92)' }}>Partitario IVA per cassa</div>
          <div style={{ fontSize: '.68rem', color: 'rgba(188,204,226,.7)', marginTop: '.2rem' }}>
            Preview read-only. Le righe di rilascio reali vengono generate esclusivamente durante la persistenza.
          </div>
        </div>
        {!items.length ? (
          <div className="alert alert-info" style={{ margin: 0 }}>
            Seleziona una partita IVA per cassa per calcolare il rilascio proporzionale.
          </div>
        ) : items.map((item) => (
          <div key={item.partitaId} className="erp-flat-panel" style={{ margin: 0, padding: '.7rem', background: 'rgba(245,158,11,.045)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.7rem', marginBottom: '.55rem' }}>
              <div>
                <div style={{ fontSize: '.78rem', fontWeight: 800 }}>{item.partitaNome || item.partitaId}</div>
                <div style={{ fontSize: '.62rem', color: 'rgba(188,204,226,.65)' }}>Partita: {item.partitaId}</div>
              </div>
              <span className={`bdg ${item.coerente ? 'bdg-green' : 'bdg-red'}`}>
                {item.coerente ? 'Coerente al centesimo' : 'Incoerente'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '.55rem' }}>
              <PreviewRow label="Partita ordinaria originaria" value={fmtCurrency(item.importoOriginale)} />
              <PreviewRow label="Chiusura ordinaria ora" value={fmtCurrency(item.importoChiusura)} tone="positive" />
              <PreviewRow label="Residuo ordinario dopo" value={fmtCurrency(item.importoResiduoDopo)} />
              <PreviewRow label="Partita IVA per cassa originaria" value={fmtCurrency(item.importoOriginaleIvaPerCassa)} />
              <PreviewRow label="Chiusura IVA per cassa ora" value={fmtCurrency(item.importoChiusuraIvaPerCassa)} tone="positive" />
              <PreviewRow label="Residuo partita IVA per cassa dopo" value={fmtCurrency(item.residuoIvaPerCassaDopo)} />
              <PreviewRow label="Percentuale chiusura" value={`${Number(item.percentualeChiusura || 0).toFixed(2)}%`} />
              <PreviewRow label="Imponibile originario" value={fmtCurrency(item.imponibileOriginario)} />
              <PreviewRow label="Imponibile rilasciato ora" value={fmtCurrency(item.imponibileDaRilasciare)} tone="positive" />
              <PreviewRow label="IVA originaria" value={fmtCurrency(item.ivaOriginaria)} />
              <PreviewRow label="IVA già rilasciata" value={fmtCurrency(item.ivaGiaRilasciata)} />
              <PreviewRow label="IVA residua prima" value={fmtCurrency(item.ivaResiduaPrima)} />
              <PreviewRow label="IVA da rilasciare ora" value={fmtCurrency(item.ivaDaRilasciareOra)} tone="positive" />
              <PreviewRow label="IVA residua dopo" value={fmtCurrency(item.ivaResiduaDopo)} tone={item.ivaResiduaDopo ? 'negative' : 'positive'} />
              <PreviewRow label="Arrotondamento" value={fmtCurrency(item.arrotondamento)} />
              <PreviewRow label="Stato" value={item.stato} />
              <PreviewRow label="Origin registro IVA" value={item.originRegistroIvaId || 'multi-riga'} />
            </div>
            {item.righeIvaOriginarie?.length > 1 ? (
              <div style={{ marginTop: '.6rem', display: 'grid', gap: '.3rem' }}>
                {item.righeIvaOriginarie.map((row) => (
                  <div key={row.originRegistroIvaId} style={{ fontSize: '.65rem', color: 'rgba(188,204,226,.78)' }}>
                    Aliquota {row.aliquota ?? '—'}%: IVA {fmtCurrency(row.ivaOriginaria)}, rilascio {fmtCurrency(row.ivaDaRilasciareOra)}, residuo {fmtCurrency(row.ivaResiduaDopo)} · origine {row.originRegistroIvaId}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  const isPartitarioMode = Boolean(showPartite)

  if (isPartitarioMode) {
    const isIncasso = String(selectedCausale?.codice || '').trim().toUpperCase().startsWith('I')
    const subTitle = isIncasso ? 'Partitario cliente' : 'Partitario fornitore'
    const soggettoNome = partitarioDraft?.selectedControparteNome || header?.clienteFornitoreNome || header?.soggetto || '—'

    // Compute totals — same logic as RegistrazionePartitarioPanel
    const resolvedCheckedIds = Array.from(new Set([
      ...(checkedPartiteIds || []).map(id => String(id || '').trim()),
      ...(partitarioDraft?.selectedPartitaIds || []).map(id => String(id || '').trim()),
      ...([partitarioDraft?.selectedPartitaId].filter(Boolean).map(id => String(id || '').trim()))
    ])).filter(Boolean)

    const normalizedCheckedIds = new Set(resolvedCheckedIds)
    const importiChiusura = partitarioDraft?.importiChiusura || {}

    // Use draft rows if populated; fall back to raw partite (same as RegistrazionePartitarioPanel)
    const effectiveRows = (Array.isArray(partitarioDraft?.rows) && partitarioDraft.rows.length > 0)
      ? partitarioDraft.rows
      : (Array.isArray(partite) ? partite : [])

    let positive = 0
    let negative = 0
    let net = 0
    effectiveRows.forEach(r => {
      const rowIdStr = String(r.id || '').trim()
      const isSelected = r.selected === true || normalizedCheckedIds.has(rowIdStr)
      if (isSelected) {
        // For raw partite rows, importoChiusura may be in importiChiusura map or residuo
        let val = r.importoChiusura
        if (val === undefined || val === null) {
          const fromMap = importiChiusura[rowIdStr]
          if (fromMap !== undefined && fromMap !== null && fromMap !== '') {
            val = Number.parseFloat(String(fromMap).replace(',', '.')) || 0
          } else {
            val = r.saldo_residuo ?? r.saldoResiduo ?? r.residuo ?? 0
          }
        }
        val = Number(val) || 0
        if (val > 0) positive += val
        else negative += val
        net += val
      }
    })

    const nettoChiusura = net

    const pnSubjectAmount = (() => {
      if (!Array.isArray(pnRows)) return 0
      const policy = buildCausaleContabilePolicy(selectedCausale)
      const chiusuraBehavior = resolveChiusuraPartiteBehavior(policy, header, partitarioDraft?.rows || [], [])
      const isIncassoCliente = chiusuraBehavior.soggettoTipo === 'cliente'
      const isPagamentoFornitore = chiusuraBehavior.soggettoTipo === 'fornitore'

      const subjectRow = pnRows.find(row => {
        const role = String(row.ruolo || '').toLowerCase()
        const desc = String(row.descrizione_riga || '').toLowerCase()
        return role === 'soggetto' || desc.includes('cliente') || desc.includes('fornitore')
      })
      if (!subjectRow) return 0

      if (isIncassoCliente) {
        return Number.parseFloat(String(subjectRow.avere || 0)) || 0
      } else if (isPagamentoFornitore) {
        return Number.parseFloat(String(subjectRow.dare || 0)) || 0
      }

      const d = Number.parseFloat(String(subjectRow.dare || 0)) || 0
      const a = Number.parseFloat(String(subjectRow.avere || 0)) || 0
      return Math.max(d, a)
    })()


    const diffPartitarioPn = Math.abs(Math.abs(nettoChiusura) - Math.abs(pnSubjectAmount))
    const isDiffPartitarioPnQuadrato = diffPartitarioPn < 0.01

    const quadraturaPn = Math.abs(totals?.differenza || 0)
    const isQuadraturaPnQuadrato = quadraturaPn < 0.01

    return (
      <div className="erp-flat-panel" style={{ padding: '.85rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
        {/* SECTION 1: DETTAGLIO CHIUSURA */}
        <div>
          <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.92)', marginBottom: '.4rem' }}>DETTAGLIO CHIUSURA</div>
          <div style={{ display: 'grid', gap: '.1rem' }}>
            <div style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(188,204,226,.72)' }}>Soggetto</div>
            <div style={{ fontWeight: 800, color: 'var(--tx)', fontSize: '.9rem', lineHeight: 1.2 }}>{soggettoNome}</div>
            <div style={{ fontSize: '.68rem', color: 'rgba(188,204,226,.55)' }}>{subTitle}</div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(136,169,204,.08)', margin: '0' }} />

        {/* SECTION 2: RIEPILOGO SELEZIONI */}
        <div>
          <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.92)', marginBottom: '.6rem' }}>RIEPILOGO SELEZIONI</div>
          <div style={{ display: 'grid', gap: '.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.72rem', color: 'rgba(188,204,226,.85)' }}>Positivi selezionati</span>
              <span style={{ fontWeight: 700, color: '#8be28e', fontSize: '.76rem' }}>{fmtCurrency(positive)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.72rem', color: 'rgba(188,204,226,.85)' }}>Negativi selezionati</span>
              <span style={{ fontWeight: 700, color: '#ff8f8f', fontSize: '.76rem' }}>{fmtCurrency(negative)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.72rem', color: 'rgba(188,204,226,.85)', fontWeight: 'bold' }}>Netto chiusura</span>
              <span style={{ fontWeight: 800, color: '#ffd05c', fontSize: '.8rem' }}>{fmtCurrency(nettoChiusura)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.72rem', color: 'rgba(188,204,226,.85)' }}>Differenza partitario/PN</span>
              <span style={{ fontWeight: 700, color: isDiffPartitarioPnQuadrato ? '#8be28e' : '#ff8f8f', fontSize: '.76rem' }}>{fmtCurrency(diffPartitarioPn)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.72rem', color: 'rgba(188,204,226,.85)' }}>Quadratura PN</span>
              <span style={{ fontWeight: 700, color: isQuadraturaPnQuadrato ? '#8be28e' : '#ff8f8f', fontSize: '.76rem' }}>{fmtCurrency(quadraturaPn)}</span>
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(136,169,204,.08)', margin: '0' }} />

        {/* SECTION 3: AZIONI RAPIDE */}
        <div>
          <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.92)', marginBottom: '.6rem' }}>AZIONI RAPIDE</div>
          <div style={{ display: 'grid', gap: '.4rem' }}>
            <button
              type="button"
              className="btn-sec"
              disabled
              style={{
                opacity: 0.5,
                cursor: 'not-allowed',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '.4rem',
                justifyContent: 'flex-start',
                padding: '.35rem .65rem',
                fontSize: '.72rem'
              }}
            >
              <MagicIcon />
              <span>Seleziona suggerite</span>
            </button>
            <button
              type="button"
              className="btn-sec"
              disabled
              style={{
                opacity: 0.5,
                cursor: 'not-allowed',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '.4rem',
                justifyContent: 'flex-start',
                padding: '.35rem .65rem',
                fontSize: '.72rem'
              }}
            >
              <CloseIcon />
              <span>Deseleziona tutte</span>
            </button>
            <button
              type="button"
              className="btn-sec"
              disabled
              style={{
                opacity: 0.5,
                cursor: 'not-allowed',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '.35rem .65rem',
                fontSize: '.72rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                <CalcIcon />
                <span>Ricalcola residui</span>
              </div>
              <span style={{ fontSize: '.58rem', padding: '2px 4px', background: 'rgba(255,255,255,.1)', borderRadius: 3 }}>F8</span>
            </button>
          </div>
        </div>

        {/* SECTION 4: INFO CARD SUGGERITE */}
        <div
          style={{
            marginTop: 'auto',
            background: 'rgba(59, 130, 246, 0.04)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
            borderRadius: 8,
            padding: '.55rem .65rem',
            display: 'flex',
            gap: '.45rem',
            alignItems: 'flex-start'
          }}
        >
          <span style={{ fontSize: '.85rem', lineHeight: 1, color: '#3b82f6', marginTop: '2px' }}>ⓘ</span>
          <div style={{ display: 'grid', gap: '2px' }}>
            <span style={{ fontSize: '.72rem', fontWeight: 'bold', color: 'rgba(188,204,226,.95)' }}>Suggerite</span>
            <span style={{ fontSize: '.64rem', color: 'rgba(188,204,226,.65)', lineHeight: 1.3 }}>
              Le partite suggerite sono proposte in base a data e importo. Verifica e modifica se necessario.
            </span>
          </div>
        </div>
      </div>
    )
  }

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
          <>
            <DraftBlock
              title="Partitario"
              note="Partitario predisposto, chiusura reale non eseguita in questa fase"
              rows={[
                { label: 'Soggetto', value: partitarioDraft?.selectedControparteNome || '—' },
                { label: 'Partite aperte', value: String(partitarioDraft?.rows?.filter(r => r.selected)?.length || 0) },
                { label: 'Saldo residuo netto', value: fmtCurrency(partitarioDraft?.totals?.saldoResiduo || 0), tone: 'negative' },
                { label: 'Chiusura netta', value: fmtCurrency(partitarioDraft?.totals?.importoChiusura || 0), tone: 'positive' },
              ]}
            />
            {partitarioDraft?.rows?.some(r => r.selected && r.iva_per_cassa) ? (
              <div className="erp-flat-panel" style={{ margin: '0.45rem 0 0 0', padding: '.55rem .6rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12 }}>
                <div style={{ display: 'grid', gap: '.08rem' }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#f59e0b', display: 'flex', alignItems: 'center' }}>
                    <MagicIcon /> RILASCIO IVA PER CASSA (READ-ONLY)
                  </div>
                  <div style={{ fontSize: '.63rem', color: 'rgba(188,204,226,.8)', marginTop: '4px', lineHeight: '1.3' }}>
                    Rilevato pagamento di partita IVA per cassa.
                    Il motore di persistenza genererà automaticamente in DB le righe di rilascio IVA proporzionali all'importo chiuso ({fmtCurrency(partitarioDraft?.totals?.importoChiusura || 0)}).
                  </div>
                </div>
              </div>
            ) : null}
          </>
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
                <span>Imp. chiusura Proposed</span>
                <span>Segno</span>
              </div>
              {demoPartite.length ? (
                demoPartite.map((row, idx) => {
                  const rowId = String(row.id || '').trim()
                  const isChecked = checkedPartiteIds.includes(rowId)
                  return (
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
                        border: isChecked ? '1px solid rgba(255,208,92,.35)' : '1px solid rgba(136,169,204,.1)',
                        background: isChecked ? 'rgba(255,208,92,.08)' : 'rgba(255,255,255,.012)',
                        cursor: 'pointer',
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        onChange={() => onToggleCheckedPartita?.(rowId)}
                      />
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.numero_documento || row.numeroFattura || '—'}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>{formatShortDate(row.data_documento || row.data)}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>{row.tipo_documento || row.tipo || '—'}</span>
                      <span style={{ color: (row.saldo_residuo ?? row.saldoResiduo ?? 0) < 0 ? '#ff8f8f' : '#d7f5e3', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {(row.saldo_residuo ?? row.saldoResiduo) !== undefined && (row.saldo_residuo ?? row.saldoResiduo) !== null ? fmtCurrency(row.saldo_residuo ?? row.saldoResiduo) : '—'}
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {(row.saldo_residuo ?? row.saldoResiduo) !== undefined && (row.saldo_residuo ?? row.saldoResiduo) !== null ? fmtCurrency(row.saldo_residuo ?? row.saldoResiduo) : '—'}
                      </span>
                      <span style={{ color: row.segno === 'D' ? '#ff8f8f' : '#8be28e', fontWeight: 800, whiteSpace: 'nowrap' }}>{row.segno || 'A'}</span>
                    </label>
                  )
                })
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
              onClick={() => onApplyCheckedPartite?.()}
            >
              Applica selezionata (F9)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
