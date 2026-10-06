import { useMemo, useState } from 'react'
import { fmtCurrency } from '../../ui/formatters.js'
import RiconciliazioneGuidedImportAuditSummary from './RiconciliazioneGuidedImportAuditSummary.jsx'

const bannerStyles = {
  base: {
    borderRadius: 14,
    border: '1px solid rgba(255, 211, 140, 0.24)',
    background: 'linear-gradient(180deg, rgba(47, 36, 11, 0.94) 0%, rgba(18, 14, 6, 0.96) 100%)',
    boxShadow: '0 10px 26px rgba(4, 10, 18, 0.24)',
    color: '#ffe7bb',
    overflow: 'hidden',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '.45rem',
    padding: '.22rem .5rem',
    minHeight: 74,
  },
  stat: {
    borderRadius: 10,
    padding: '.18rem .38rem',
    background: 'rgba(11, 20, 31, 0.42)',
    border: '1px solid rgba(255, 211, 140, 0.12)',
    minHeight: 28,
  },
  section: {
    borderRadius: 12,
    border: '1px solid rgba(255, 211, 140, 0.14)',
    background: 'rgba(9, 16, 25, 0.42)',
    padding: '.45rem .55rem',
  },
}

function Chip({ label, tone = '#ffd38c' }) {
  return (
    <span
      className="bdg"
      style={{ background: 'rgba(14, 32, 54, 0.96)', color: tone, whiteSpace: 'nowrap', fontSize: '.62rem', padding: '.14rem .4rem', minHeight: 18 }}
    >
      {label}
    </span>
  )
}

function Stat({ label, value, tone = '#fff2cf', subLabel = '' }) {
  return (
    <div style={bannerStyles.stat}>
      <div style={{ fontSize: '.56rem', color: 'rgba(255, 232, 194, 0.75)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontWeight: 800, color: tone, fontSize: '.74rem', lineHeight: 1.12, marginTop: '.03rem' }}>{value}</div>
      {subLabel ? <div style={{ fontSize: '.56rem', color: 'rgba(255, 232, 194, 0.82)', marginTop: '.02rem' }}>{subLabel}</div> : null}
    </div>
  )
}

function ShortList({ title, items, emptyLabel = '-' }) {
  return (
    <div style={bannerStyles.section}>
      <div style={{ fontSize: '.68rem', color: '#ffd38c', fontWeight: 800, marginBottom: '.25rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {title}
      </div>
      {items.length ? (
        <div style={{ display: 'grid', gap: '.2rem', fontSize: '.7rem', color: 'rgba(255, 236, 201, 0.92)', lineHeight: 1.35 }}>
          {items}
        </div>
      ) : (
        <div style={{ fontSize: '.72rem', color: 'rgba(255, 236, 201, 0.78)' }}>{emptyLabel}</div>
      )}
    </div>
  )
}

export default function RiconciliazioneAuditBanner({
  bankStatement,
  statementAudit,
  movementAmountAudit,
  guidedImportAudit,
  guidedImportAuditSummary,
  guidedImportAuditEvents,
  deltaDiagnostics,
  selectedAccountMeta,
  auditReviewPreview = [],
  auditTopSuspects = [],
  ignoredSummaryLabel = '',
  reviewStats = { total: 0, pending: 0, verified: 0, corrected: 0, ignored: 0, manual: 0 },
  formatDeltaItem,
  formatRawSnippet,
  pipelineTrace = [],
  onOpenGuidedImportDemo,
}) {
  const [open, setOpen] = useState(false)
  const buildListKey = (section, index, item = {}) => [
    section,
    index,
    item.rawRowId ?? item.movementId ?? item.pageNumber ?? 'row',
    item.currentAmount ?? item.amount ?? item.candidateAmount ?? item.reason ?? 'item',
  ].join('-')

  const isCertified = bankStatement?.parseReliabilityLevel === 'certified_balanced'
  const hasMismatch = Boolean(bankStatement?.accountMismatchWarning)
  const blockingReviewCount = Number(deltaDiagnostics?.reviewRowsBlocking ?? reviewStats?.pending ?? bankStatement?.needsReviewRows ?? 0)
  const infoReviewCount = Number(deltaDiagnostics?.reviewRowsInfo || 0)
  const reviewCount = blockingReviewCount
  const balanceDiff = statementAudit?.differences?.balance ?? null
  const hasZeroDelta = Number.isFinite(Number(balanceDiff)) ? Math.abs(Number(balanceDiff)) <= 0.01 : false
  const showDelta910Diagnostics = Boolean(deltaDiagnostics?.hasDelta910Case || deltaDiagnostics?.delta910?.enabled)
  const statusTone = isCertified && !hasMismatch && !reviewCount ? '#8ee7b6' : '#ffd38c'
  const title = isCertified && !hasMismatch && !reviewCount ? 'Import certificato' : 'PDF letto, review operativa'
  const subtitle = isCertified && !hasMismatch && !reviewCount
    ? 'Tutto torna al centesimo e il conto coincide con il documento.'
    : 'Movimenti leggibili ma non ancora confermabili.'

  const deltaBalance = statementAudit?.differences?.balance == null ? null : fmtCurrency(Math.abs(statementAudit.differences.balance))
  const topSuspects = useMemo(
    () => (showDelta910Diagnostics ? auditTopSuspects.slice(0, 10) : []),
    [auditTopSuspects, showDelta910Diagnostics]
  )
  const reviewPreview = useMemo(
    () => (reviewCount > 0 ? auditReviewPreview.slice(0, 10) : []),
    [auditReviewPreview, reviewCount]
  )

  return (
    <div style={bannerStyles.base}>
      <div style={bannerStyles.head}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ fontSize: '.76rem', fontWeight: 900, color: statusTone, lineHeight: 1.08 }}>{title}</div>
          <div style={{ fontSize: '.6rem', color: 'rgba(255, 236, 201, 0.84)', marginTop: '.04rem' }}>{subtitle}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.22rem', maxWidth: '66%' }}>
          <Chip label={`Validi ${bankStatement?.parsedMovements || bankStatement?.movements?.length || 0}`} tone={statusTone} />
          <Chip label={`Entrate ${fmtCurrency(statementAudit?.totalEntrate || 0)}`} />
          <Chip label={`Uscite ${fmtCurrency(statementAudit?.totalUscite || 0)}`} />
          <Chip label={`Saldo ${statementAudit?.calculatedClosingBalance == null ? '-' : fmtCurrency(statementAudit.calculatedClosingBalance)}`} />
          <Chip label={`PDF ${bankStatement?.pdfSummary?.closingBalance == null ? '-' : fmtCurrency(bankStatement.pdfSummary.closingBalance)}`} tone={hasZeroDelta ? '#8ee7b6' : '#ffd38c'} />
          <Chip label={`Diff ${deltaBalance || '-'}`} tone={hasMismatch || reviewCount ? '#ffd38c' : '#8ee7b6'} />
          <Chip label={`Quadratura ${hasZeroDelta ? 'OK' : 'KO'}`} tone={hasZeroDelta ? '#8ee7b6' : '#ffd38c'} />
          <Chip label={`Mismatch ${hasMismatch ? 'si' : 'no'}`} tone={hasMismatch ? '#ffd38c' : '#8ee7b6'} />
          <Chip label={`Review ${reviewCount}`} tone={reviewCount ? '#ffd38c' : '#8ee7b6'} />
          <Chip label={`Corrette ${reviewStats?.corrected || 0}`} tone={reviewStats?.corrected ? '#8ee7b6' : '#ffd38c'} />
          <Chip label={`Profilo ${bankStatement?.profileLabel || bankStatement?.profile || '-'}`} tone={bankStatement?.profile ? '#9fd0ff' : '#ffd38c'} />
          <Chip label={`Affidabilita ${bankStatement?.parseReliabilityLevel || '-'}`} tone={isCertified ? '#8ee7b6' : '#ffd38c'} />
          <button className="btn-sec" type="button" onClick={() => setOpen((prev) => !prev)} style={{ padding: '.18rem .5rem', minHeight: 24, fontSize: '.65rem' }}>
            {open ? 'Nascondi dettagli audit' : 'Apri dettagli audit'}
          </button>
          <button className="btn-sec" type="button" onClick={onOpenGuidedImportDemo} style={{ padding: '.18rem .5rem', minHeight: 24, fontSize: '.65rem' }}>
            Apri demo Guida FiscoSim
          </button>
        </div>
      </div>

      {open ? (
        <div style={{ padding: '0 .55rem .55rem' }}>
          <div style={{ marginBottom: '.35rem' }}>
            <RiconciliazioneGuidedImportAuditSummary
              audit={guidedImportAudit}
              summary={guidedImportAuditSummary}
              events={guidedImportAuditEvents}
              compact
              defaultCollapsed
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.35rem', maxHeight: 300, overflowY: 'auto', paddingRight: '.25rem' }}>
            <ShortList
              title="Quadratura"
              items={[
                <div key="q-1">Entrate estratte {fmtCurrency(statementAudit?.totalEntrate || 0)}</div>,
                <div key="q-2">Uscite estratte {fmtCurrency(statementAudit?.totalUscite || 0)}</div>,
                <div key="q-3">Saldo calcolato {statementAudit?.calculatedClosingBalance == null ? '-' : fmtCurrency(statementAudit.calculatedClosingBalance)}</div>,
                <div key="q-4">Saldo PDF {bankStatement?.pdfSummary?.closingBalance == null ? '-' : fmtCurrency(bankStatement.pdfSummary.closingBalance)}</div>,
                <div key="q-5">Differenza {deltaBalance || '-'}</div>,
              ]}
            />
            <ShortList
              title="Problemi"
              items={[
                <div key="p-1">Quadratura documento {hasZeroDelta ? 'OK' : 'KO'}</div>,
                <div key="p-2">Conto selezionato {hasMismatch ? 'non coincide' : 'coincide'} con documento</div>,
                reviewCount > 0 ? <div key="p-3">Righe da verificare {reviewCount}</div> : <div key="p-3">Righe da verificare 0</div>,
                <div key="p-3b">Righe informative multilinea {infoReviewCount}</div>,
                ...(showDelta910Diagnostics
                  ? [
                      <div key="p-4">Movimenti con audit dare/avere {movementAmountAudit?.topSuspects910?.length || 0}</div>,
                      <div key="p-5">Match esatti 910 {deltaDiagnostics?.exactAmountMatches910?.length || 0}</div>,
                      <div key="p-6">Combinazioni 910 {deltaDiagnostics?.combinationMatches910?.length || 0}</div>,
                    ]
                  : []),
              ]}
            />
            <ShortList
              title="Dati documento"
              items={[
                <div key="doc-profile">Profilo {bankStatement?.profileLabel || bankStatement?.profile || '-'}</div>,
                <div key="doc-bank">Banca {bankStatement?.documentAccount?.bankName || bankStatement?.documentMeta?.bankName || bankStatement?.bankName || '-'}</div>,
                <div key="doc-iban">IBAN {bankStatement?.documentAccount?.iban || bankStatement?.documentMeta?.iban || bankStatement?.iban || '-'}</div>,
                <div key="doc-bic">BIC {bankStatement?.documentAccount?.bic || bankStatement?.documentMeta?.bic || '-'}</div>,
                <div key="doc-account">Conto {bankStatement?.documentAccount?.accountNumber || bankStatement?.documentMeta?.accountCode || bankStatement?.accountCode || '-'}</div>,
                <div key="doc-holder">Intestatario {bankStatement?.documentAccount?.holder || bankStatement?.documentMeta?.holder || '-'}</div>,
              ]}
            />
            <ShortList
              title="Conto selezionato"
              items={[
                <div key="sel-bank">Banca {selectedAccountMeta?.bankName || bankStatement?.selectedBankAccount?.bankName || bankStatement?.bankName || '-'}</div>,
                <div key="sel-iban">IBAN {selectedAccountMeta?.iban || bankStatement?.selectedBankAccount?.iban || bankStatement?.iban || '-'}</div>,
                <div key="sel-account">Conto {selectedAccountMeta?.accountCode || selectedAccountMeta?.accountNumber || bankStatement?.selectedBankAccount?.accountNumber || bankStatement?.accountCode || '-'}</div>,
              ]}
            />
            <ShortList
              title="Sospetti principali"
              items={topSuspects.length ? topSuspects.map((item, index) => <div key={buildListKey('suspects', index, item)}>{formatDeltaItem(item)}</div>) : [<div key="empty-top">-</div>]}
            />
            <ShortList
              title="Prime righe da verificare"
              items={reviewPreview.length ? reviewPreview.map((item, index) => <div key={buildListKey('review', index, item)}>{formatRawSnippet(item.rawText, 60)} | {item.amount != null ? fmtCurrency(item.amount) : '-'} | p.{item.pageNumber || '-'} | {item.reason || '-'}</div>) : [<div key="empty-review">-</div>]}
            />
            <ShortList
              title="Righe ignorate per tipo"
              items={ignoredSummaryLabel ? [<div key="ignored-summary">{ignoredSummaryLabel}</div>] : [<div key="ignored-empty">-</div>]}
            />
            <ShortList
              title="Diagnostica tecnica"
              items={[
                <div key="tech-1">Divergenza running balance: {movementAmountAudit?.runningBalanceAudit?.available ? 'disponibile' : 'non disponibile nel layout PDF'}</div>,
                ...(showDelta910Diagnostics ? [<div key="tech-2">Nessuna combinazione raw spiega ancora esattamente il delta 910,00 EUR</div>] : []),
              ]}
            />
            <ShortList
              title="Pipeline UI"
              items={pipelineTrace.length ? pipelineTrace.slice(-6).map((item, index) => (
                <div key={`${item.step}-${index}`}>
                  {item.step}
                  {item.profile ? ` | ${item.profile}` : ''}
                  {item.movements != null ? ` | movimenti ${item.movements}` : ''}
                  {item.fileName ? ` | ${item.fileName}` : ''}
                </div>
              )) : [<div key="pipeline-empty">-</div>]}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
