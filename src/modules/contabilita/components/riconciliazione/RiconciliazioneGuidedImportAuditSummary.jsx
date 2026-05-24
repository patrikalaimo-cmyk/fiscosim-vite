import { useMemo, useState } from 'react'
import { fmtCurrency } from '../../ui/formatters.js'
import { reduceGuidedImportAuditSummary } from './reduceGuidedImportAuditSummary.js'
import { GUIDED_IMPORT_AUDIT_FIELD_IDS } from './guidedImportAuditEventTypes.js'

const wrapStyle = {
  borderRadius: 12,
  border: '1px solid rgba(157, 185, 213, 0.2)',
  background: 'rgba(7, 16, 28, 0.75)',
  overflow: 'hidden',
}

const toneMap = {
  good: '#8ee7b6',
  warn: '#ffd38c',
  bad: '#ff9fb0',
  muted: '#9fb1c5',
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asText(value, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function asNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMaybeCurrency(value) {
  const amount = asNumber(value)
  return amount == null ? '-' : fmtCurrency(amount)
}

function toToneByStatus(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('certified') || normalized.includes('confirmed') || normalized.includes('savable')) return 'good'
  if (normalized.includes('warning') || normalized.includes('review') || normalized.includes('non_certifying') || normalized.includes('proposed')) return 'warn'
  if (normalized.includes('block') || normalized.includes('not_savable') || normalized.includes('unusable') || normalized.includes('failed')) return 'bad'
  return 'muted'
}

function statusLabel(status) {
  const value = String(status || '').trim()
  return value ? value.replace(/_/g, ' ') : 'non disponibile'
}

function firstIssueText(warnings, blockers) {
  const block = asArray(blockers)[0]
  if (block) return typeof block === 'string' ? block : asText(block.reason || block.code || block.message, 'blocker')
  const warn = asArray(warnings)[0]
  if (warn) return typeof warn === 'string' ? warn : asText(warn.reason || warn.code || warn.message, 'warning')
  return '-'
}

function summaryFromInputs(summary, events) {
  if (summary && typeof summary === 'object') return summary
  if (!Array.isArray(events) || !events.length) return null
  return reduceGuidedImportAuditSummary(events)
}

function FieldRow({ label, status, value, source, warnings, blockers }) {
  const tone = toToneByStatus(status)
  return (
    <div style={{ borderBottom: '1px solid rgba(157, 185, 213, 0.14)', padding: '.28rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem' }}>
        <div style={{ fontSize: '.69rem', color: 'rgba(220, 233, 247, 0.86)' }}>{label}</div>
        <div style={{ fontSize: '.67rem', color: toneMap[tone], textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {statusLabel(status)}
        </div>
      </div>
      <div style={{ fontSize: '.72rem', color: '#eef6ff', marginTop: '.06rem', wordBreak: 'break-word' }}>valore: {asText(value)}</div>
      <div style={{ fontSize: '.66rem', color: 'rgba(191, 209, 229, 0.86)', marginTop: '.03rem' }}>source: {asText(source)}</div>
      <div style={{ fontSize: '.66rem', color: 'rgba(191, 209, 229, 0.86)', marginTop: '.03rem' }}>
        issue: {firstIssueText(warnings, blockers)}
      </div>
    </div>
  )
}

function MetricRow({ label, value, tone = 'muted' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', borderBottom: '1px solid rgba(157, 185, 213, 0.12)', padding: '.2rem 0' }}>
      <span style={{ fontSize: '.68rem', color: 'rgba(211, 224, 238, 0.8)' }}>{label}</span>
      <strong style={{ fontSize: '.72rem', color: toneMap[tone], textAlign: 'right' }}>{value}</strong>
    </div>
  )
}

export default function RiconciliazioneGuidedImportAuditSummary({
  audit,
  summary,
  events,
  compact = true,
  defaultCollapsed = true,
}) {
  const [open, setOpen] = useState(!defaultCollapsed)

  const resolvedSummary = useMemo(
    () => summaryFromInputs(summary, events),
    [summary, events]
  )

  const resolvedEvents = Array.isArray(events)
    ? events
    : Array.isArray(audit?.events)
      ? audit.events
      : []
  const eventCount = resolvedSummary?.eventCount ?? resolvedEvents.length
  const globalWarnings = asArray(resolvedSummary?.warnings)
  const globalBlockers = asArray(resolvedSummary?.blockers)
  const hasData = Boolean(resolvedSummary)

  const fields = resolvedSummary?.fieldsStatus || {}
  const periodStart = fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.PERIOD_START]
  const periodEnd = fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.PERIOD_END]
  const periodValue = [periodStart?.value, periodEnd?.value].filter(Boolean).join(' - ') || '-'
  const periodStatus = periodEnd?.status || periodStart?.status || 'missing'
  const periodSource = periodEnd?.source || periodStart?.source || ''
  const periodWarnings = [...asArray(periodStart?.warnings), ...asArray(periodEnd?.warnings)]
  const periodBlockers = [...asArray(periodStart?.blockers), ...asArray(periodEnd?.blockers)]

  const headerDryRun = asText(resolvedSummary?.dryRunStatus?.parseStatus || resolvedSummary?.dryRunStatus?.parseReliabilityLevel, '-')
  const headerTemplateDecision = asText(resolvedSummary?.templateDecision, '-')
  const headerIssues = `${globalWarnings.length}/${globalBlockers.length}`

  return (
    <section style={wrapStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.45rem', padding: '.35rem .52rem' }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ fontSize: '.72rem', color: '#bde8ff', fontWeight: 800 }}>Audit import guidato</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.2rem', marginTop: '.1rem' }}>
            <span className="bdg" style={{ fontSize: '.6rem', padding: '.1rem .34rem' }}>eventi {eventCount || 0}</span>
            <span className="bdg" style={{ fontSize: '.6rem', padding: '.1rem .34rem', color: toneMap[toToneByStatus(headerDryRun)] }}>dry run {headerDryRun}</span>
            <span className="bdg" style={{ fontSize: '.6rem', padding: '.1rem .34rem', color: toneMap[toToneByStatus(headerTemplateDecision)] }}>template {headerTemplateDecision}</span>
            <span className="bdg" style={{ fontSize: '.6rem', padding: '.1rem .34rem', color: globalBlockers.length ? toneMap.bad : globalWarnings.length ? toneMap.warn : toneMap.good }}>warn/block {headerIssues}</span>
          </div>
        </div>
        <button className="btn-sec" type="button" onClick={() => setOpen((prev) => !prev)} style={{ minHeight: 22, fontSize: '.62rem', padding: '0 .45rem' }}>
          {open ? 'Chiudi' : 'Apri'}
        </button>
      </div>

      {open ? (
        <div style={{ borderTop: '1px solid rgba(157, 185, 213, 0.16)', padding: compact ? '.35rem .52rem' : '.5rem .62rem' }}>
          {!hasData ? (
            <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.45 }}>
              Audit import guidato non ancora disponibile per questo staging.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '.4rem' }}>
              <div style={{ border: '1px solid rgba(157, 185, 213, 0.16)', borderRadius: 10, padding: '.35rem .45rem' }}>
                <div style={{ fontSize: '.66rem', color: '#9fd0ff', marginBottom: '.2rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Campi documento</div>
                <FieldRow label="banca" {...(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.BANK_NAME] || {})} />
                <FieldRow label="IBAN" {...(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.IBAN] || {})} />
                <FieldRow label="BIC" {...(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.BIC] || {})} />
                <FieldRow label="conto" {...(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.ACCOUNT_NUMBER] || {})} />
                <FieldRow label="periodo" status={periodStatus} value={periodValue} source={periodSource} warnings={periodWarnings} blockers={periodBlockers} />
                <FieldRow label="saldo iniziale" {...(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.OPENING_BALANCE] || {})} value={formatMaybeCurrency(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.OPENING_BALANCE]?.value)} />
                <FieldRow label="totale entrate" {...(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_IN] || {})} value={formatMaybeCurrency(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_IN]?.value)} />
                <FieldRow label="totale uscite" {...(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_OUT] || {})} value={formatMaybeCurrency(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.TOTAL_OUT]?.value)} />
                <FieldRow label="saldo finale" {...(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.CLOSING_BALANCE] || {})} value={formatMaybeCurrency(fields[GUIDED_IMPORT_AUDIT_FIELD_IDS.CLOSING_BALANCE]?.value)} />
              </div>

              <div style={{ border: '1px solid rgba(157, 185, 213, 0.16)', borderRadius: 10, padding: '.35rem .45rem' }}>
                <div style={{ fontSize: '.66rem', color: '#9fd0ff', marginBottom: '.2rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Sezione movimenti</div>
                <MetricRow label="headerRowId" value={asText(resolvedSummary?.movementSectionStatus?.headerRowId)} />
                <MetricRow label="firstMovementRowId" value={asText(resolvedSummary?.movementSectionStatus?.firstMovementRowId)} />
                <MetricRow label="lastMovementRowId" value={asText(resolvedSummary?.movementSectionStatus?.lastMovementRowId)} />
                <MetricRow label="selectedColumnPreset" value={asText(resolvedSummary?.movementSectionStatus?.selectedColumnPreset)} tone={toToneByStatus(resolvedSummary?.movementSectionStatus?.selectedColumnPreset)} />
              </div>

              <div style={{ border: '1px solid rgba(157, 185, 213, 0.16)', borderRadius: 10, padding: '.35rem .45rem' }}>
                <div style={{ fontSize: '.66rem', color: '#9fd0ff', marginBottom: '.2rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Dry run</div>
                <MetricRow label="movementsExtracted" value={asText(resolvedSummary?.dryRunStatus?.movementsExtracted)} />
                <MetricRow label="totalIn" value={formatMaybeCurrency(resolvedSummary?.dryRunStatus?.totals?.totalIn)} />
                <MetricRow label="totalOut" value={formatMaybeCurrency(resolvedSummary?.dryRunStatus?.totals?.totalOut)} />
                <MetricRow label="openingBalance" value={formatMaybeCurrency(resolvedSummary?.dryRunStatus?.totals?.openingBalance)} />
                <MetricRow label="closingBalanceOfficial" value={formatMaybeCurrency(resolvedSummary?.dryRunStatus?.totals?.closingBalanceOfficial)} />
                <MetricRow label="calculatedClosingBalance" value={formatMaybeCurrency(resolvedSummary?.dryRunStatus?.totals?.calculatedClosingBalance)} />
                <MetricRow
                  label="difference"
                  value={formatMaybeCurrency(resolvedSummary?.dryRunStatus?.difference)}
                  tone={Math.abs(asNumber(resolvedSummary?.dryRunStatus?.difference) || 0) <= 0.01 ? 'good' : 'warn'}
                />
                <MetricRow label="parseReliabilityLevel" value={asText(resolvedSummary?.dryRunStatus?.parseReliabilityLevel)} tone={toToneByStatus(resolvedSummary?.dryRunStatus?.parseReliabilityLevel)} />
                <MetricRow label="parseStatus" value={asText(resolvedSummary?.dryRunStatus?.parseStatus)} tone={toToneByStatus(resolvedSummary?.dryRunStatus?.parseStatus)} />
              </div>

              <div style={{ border: '1px solid rgba(157, 185, 213, 0.16)', borderRadius: 10, padding: '.35rem .45rem' }}>
                <div style={{ fontSize: '.66rem', color: '#9fd0ff', marginBottom: '.2rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Decisioni</div>
                <MetricRow label="finalDecision" value={asText(resolvedSummary?.finalDecision)} tone={toToneByStatus(resolvedSummary?.finalDecision)} />
                <MetricRow label="templateDecision" value={asText(resolvedSummary?.templateDecision)} tone={toToneByStatus(resolvedSummary?.templateDecision)} />
              </div>

              <div style={{ border: '1px solid rgba(157, 185, 213, 0.16)', borderRadius: 10, padding: '.35rem .45rem' }}>
                <div style={{ fontSize: '.66rem', color: '#9fd0ff', marginBottom: '.2rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Warning e blocchi</div>
                {globalBlockers.length === 0 && globalWarnings.length === 0 ? (
                  <div style={{ fontSize: '.7rem', color: 'rgba(211, 224, 238, 0.78)' }}>nessuno</div>
                ) : (
                  <div style={{ display: 'grid', gap: '.2rem', maxHeight: 120, overflowY: 'auto', paddingRight: '.2rem' }}>
                    {globalBlockers.map((item, index) => (
                      <div key={`b-${index}-${typeof item === 'string' ? item : item?.code || 'item'}`} style={{ fontSize: '.68rem', color: toneMap.bad }}>
                        blocker: {typeof item === 'string' ? item : asText(item?.reason || item?.code || item?.message, 'n/a')}
                      </div>
                    ))}
                    {globalWarnings.map((item, index) => (
                      <div key={`w-${index}-${typeof item === 'string' ? item : item?.code || 'item'}`} style={{ fontSize: '.68rem', color: toneMap.warn }}>
                        warning: {typeof item === 'string' ? item : asText(item?.reason || item?.code || item?.message, 'n/a')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
