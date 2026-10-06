import { useEffect, useMemo, useState } from 'react'
import RiconciliazioneDocumentPreview from './RiconciliazioneDocumentPreview.jsx'
import RiconciliazioneReviewList from './RiconciliazioneReviewList.jsx'
import RiconciliazioneMovementWorkingView from './RiconciliazioneMovementWorkingView.jsx'
import { fmtCurrency } from '../../ui/formatters.js'

const sectionStyle = {
  padding: '.8rem .85rem',
  borderRadius: 16,
  border: '1px solid rgba(127, 154, 182, 0.16)',
  background: 'linear-gradient(180deg, rgba(9, 20, 35, 0.96) 0%, rgba(6, 14, 25, 0.98) 100%)',
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '.7rem',
  padding: '.3rem 0',
  borderBottom: '1px solid rgba(108, 136, 166, 0.12)',
}

const tabButtonStyle = (active) => ({
  minHeight: 24,
  padding: '0 .5rem',
  fontSize: '.64rem',
  borderRadius: 10,
  border: active ? '1px solid rgba(142, 231, 182, 0.32)' : '1px solid rgba(157, 185, 213, 0.16)',
  background: active ? 'rgba(20, 44, 36, 0.88)' : 'rgba(15, 29, 49, 0.72)',
  color: active ? '#8ee7b6' : '#dfe9f4',
})

function DetailPair({ label, value, valueColor = '#eef6ff' }) {
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: '.75rem', color: 'rgba(211, 224, 238, 0.75)' }}>{label}</span>
      <strong style={{ fontSize: '.8rem', color: valueColor, textAlign: 'right' }}>{value ?? '-'}</strong>
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '.68rem', color: '#9fd0ff', marginBottom: '.4rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function EmptySection({ title, note }) {
  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '.68rem', color: '#9fd0ff', marginBottom: '.4rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {title}
      </div>
      <div style={{ fontSize: '.75rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5 }}>{note}</div>
    </div>
  )
}

function Badge({ label, tone = 'blue' }) {
  const tones = {
    green: { color: '#8ee7b6', border: 'rgba(88, 182, 132, 0.23)' },
    amber: { color: '#ffd38c', border: 'rgba(219, 170, 80, 0.25)' },
    red: { color: '#ff9fb0', border: 'rgba(231, 99, 121, 0.22)' },
    blue: { color: '#9fd0ff', border: 'rgba(98, 154, 214, 0.24)' },
  }
  const selectedTone = tones[tone] || tones.blue
  return (
    <span
      className="bdg"
      style={{
        background: 'rgba(14, 32, 54, 0.96)',
        color: selectedTone.color,
        border: `1px solid ${selectedTone.border}`,
        fontSize: '.62rem',
        padding: '.14rem .38rem',
      }}
    >
      {label}
    </span>
  )
}

export default function RiconciliazioneDetailPanel({
  movement,
  collapsed,
  onToggleCollapsed,
  bankStatement,
  workingContext,
  preview,
  reviewItems = [],
  reviewStats = { total: 0, pending: 0, verified: 0, corrected: 0, ignored: 0, manual: 0 },
  onPreviewPageChange,
  onPreviewZoomChange,
  onMarkVerified,
  onMarkIgnored,
  onMarkManualMapping,
  onOpenDocument,
  onSelectMovement,
  onOpenDocumentModal,
  onApplyCorrection,
  onRestoreOriginalMovement,
}) {
  const [activeTab, setActiveTab] = useState('movement')
  const [isEditingCorrection, setIsEditingCorrection] = useState(false)
  const [correctionForm, setCorrectionForm] = useState({
    amount: '',
    direction: 'out',
    operationDate: '',
    valueDate: '',
    descriptionRaw: '',
    counterpartyName: '',
    reason: '',
  })
  const [correctionError, setCorrectionError] = useState('')

  useEffect(() => {
    setActiveTab('movement')
  }, [movement?.id])

  useEffect(() => {
    if (!movement) return
    const currentAmount = Number(movement.entrata || movement.uscita || 0)
    const currentDirection = movement?.detail?.movement?.direction === 'Entrata' ? 'in' : 'out'
    setIsEditingCorrection(false)
    setCorrectionError('')
    setCorrectionForm({
      amount: Number.isFinite(currentAmount) && currentAmount > 0 ? String(currentAmount.toFixed(2)) : '',
      direction: currentDirection,
      operationDate: movement?.detail?.movement?.operationDate || movement.operationDate || '',
      valueDate: movement?.detail?.movement?.valueDate || movement.valueDate || movement?.detail?.movement?.operationDate || movement.operationDate || '',
      descriptionRaw: movement?.detail?.movement?.descriptionRaw || movement.description || '',
      counterpartyName: movement?.detail?.movement?.counterparty || movement.counterparty || '',
      reason: '',
    })
  }, [movement])

  const movementDetail = movement?.detail?.movement || {}
  const matchDetail = movement?.detail?.match || {}
  const pnDetail = movement?.detail?.pn || {}
  const ledgerDetail = movement?.detail?.ledger || {}
  const cashVatDetail = movement?.detail?.cashVat || {}
  const withholdingDetail = movement?.detail?.withholding || {}
  const girocontoDetail = movement?.detail?.giroconto || null
  const auditDetail = movement?.detail?.audit || {}
  const amountAudit = auditDetail.amountAudit || {}
  const hasDetail = Boolean(movement?.detail)
  const reviewSummaryLabel =
    reviewStats.total > 0
      ? reviewStats.pending > 0
        ? `${reviewStats.pending} da verificare`
        : 'Review completata'
      : 'Nessuna review attiva'

  const handleOpenDocument = (item) => {
    if (item?.pageNumber && onPreviewPageChange) {
      onPreviewPageChange(Number(item.pageNumber) || 1)
    }
    setActiveTab('document')
    onOpenDocument?.(item)
  }

  const handleSelectMovement = (item) => {
    setActiveTab('movement')
    onSelectMovement?.(item)
  }

  const handleApplyCorrection = () => {
    setCorrectionError('')
    const amount = Number(String(correctionForm.amount || '').replace(',', '.'))
    const direction = String(correctionForm.direction || '').toLowerCase()
    const operationDate = String(correctionForm.operationDate || '').trim()
    const valueDate = String(correctionForm.valueDate || '').trim()
    const descriptionRaw = String(correctionForm.descriptionRaw || '').trim()
    const counterpartyName = String(correctionForm.counterpartyName || '').trim()
    const reason = String(correctionForm.reason || '').trim()

    if (!movement?.id) {
      setCorrectionError('Nessun movimento selezionato')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setCorrectionError('Importo non valido')
      return
    }
    if (direction !== 'in' && direction !== 'out') {
      setCorrectionError('Direction non valida')
      return
    }
    const isValidDateLike = (value) =>
      /^\d{2}[\/.-]\d{2}[\/.-]\d{4}$/.test(value) ||
      /^\d{4}-\d{2}-\d{2}$/.test(value)
    if (!operationDate || !isValidDateLike(operationDate)) {
      setCorrectionError('Data operazione obbligatoria')
      return
    }
    if (valueDate && !isValidDateLike(valueDate)) {
      setCorrectionError('Data valuta non valida')
      return
    }
    if (!reason) {
      setCorrectionError('Inserire il motivo della correzione')
      return
    }

    const currentMovement = movement?.detail?.movement || {}
    const currentAmount = Number(movement.entrata || movement.uscita || 0)
    const currentDirection = currentMovement.direction === 'Entrata' ? 'in' : 'out'
    const changes = {
      amount,
      direction,
      operationDate,
      valueDate: valueDate || operationDate,
      descriptionRaw: descriptionRaw || currentMovement.descriptionRaw || movement.description,
      counterpartyName: counterpartyName || currentMovement.counterparty || movement.counterparty,
    }
    const hasChanges = Object.keys(changes).some((field) => {
      const currentValue =
        field === 'amount'
          ? currentAmount
          : field === 'direction'
            ? currentDirection
            : String(currentMovement[field === 'counterpartyName' ? 'counterparty' : field] || movement[field] || '').trim()
      const nextValue = field === 'amount' ? amount : field === 'direction' ? direction : String(changes[field] || '').trim()
      return String(currentValue) !== String(nextValue)
    })
    if (!hasChanges) {
      setCorrectionError('Nessuna modifica effettiva')
      return
    }

    const result = onApplyCorrection?.({
      movementId: movement.id,
      changes,
      reason,
      reviewStatus: 'corrected',
    })
    if (!result?.ok) {
      setCorrectionError(result?.error === 'no_effective_change' ? 'Nessuna modifica effettiva' : 'Correzione non applicata')
      return
    }
    setIsEditingCorrection(false)
    setCorrectionError('')
  }

  const handleRestoreOriginalMovement = () => {
    if (!movement?.correctionBaseline) return
    const result = onRestoreOriginalMovement?.(movement)
    if (!result?.ok) {
      setCorrectionError(result?.error === 'no_effective_change' ? 'Movimento già al valore originale' : 'Ripristino non applicato')
    }
  }

  const zoomValue = preview?.zoom === 'fit' ? 1 : Number(preview?.zoom || 1) || 1

  const movementTab = (
    <div style={{ display: 'grid', gap: '.8rem' }}>
      {!hasDetail ? (
        <EmptySection
          title="Staging movimento"
          note="Il file importato ha generato una riga locale, ma il dettaglio contabile non e ancora disponibile. Da elaborare con OCR/AI o mapping manuale."
        />
      ) : null}

      <SectionCard title="Movimento bancario">
        <DetailPair label="Data operazione" value={movementDetail.operationDate} />
        <DetailPair label="Data valuta" value={movementDetail.valueDate} />
        <DetailPair label="Descrizione originale" value={movementDetail.descriptionRaw} />
        <DetailPair label="Controparte" value={movementDetail.counterparty} />
        <DetailPair label="Importo" value={movementDetail.amount} valueColor={movement?.entrata ? '#8ee7b6' : '#ff9fb0'} />
        <DetailPair label="Causale bancaria" value={movementDetail.bankCausal} />
        <DetailPair label="IBAN ordinante" value={movementDetail.iban || '-'} />
        <DetailPair label="Riferimento/CRO" value={movementDetail.reference || '-'} />
        <DetailPair label="Review" value={movement?.reviewLabel || 'Da verificare'} valueColor={movement?.reviewTone === 'green' ? '#8ee7b6' : movement?.reviewTone === 'red' ? '#ff9fb0' : '#ffd38c'} />
      </SectionCard>

      <SectionCard title="Match proposto">
        <DetailPair label="Documento" value={matchDetail.title} />
        <DetailPair label="Confidence" value={matchDetail.confidence} valueColor="#8ee7b6" />
        <div style={{ fontSize: '.75rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5 }}>
          Motivi: {(matchDetail.reasons || []).length ? matchDetail.reasons.join(', ') : '-'}
        </div>
      </SectionCard>

      <SectionCard title="Prima Nota proposta">
        <DetailPair label="Tipo movimento" value={movement?.action} />
        <DetailPair label="Causale contabile" value={pnDetail.causale} />
        <DetailPair label="Data registrazione" value={pnDetail.registrationDate} />
        {(pnDetail.rows || []).map((row) => (
          <DetailPair key={row.label} label={row.label} value={row.value} />
        ))}
        <DetailPair label="Quadratura" value={pnDetail.balance || (hasDetail ? 'OK' : 'Da elaborare')} valueColor="#8ee7b6" />
      </SectionCard>

      <SectionCard title="Partitario">
        <DetailPair label="Soggetto" value={ledgerDetail.subject} />
        <DetailPair label="Documento" value={ledgerDetail.document} />
        <DetailPair label="Importo chiusura" value={ledgerDetail.amountClose} />
        <DetailPair label="Residuo prima" value={ledgerDetail.residualBefore} />
        <DetailPair label="Residuo dopo" value={ledgerDetail.residualAfter} />
      </SectionCard>

      <SectionCard title="IVA per cassa">
        {cashVatDetail.status === 'Non applicabile' || !cashVatDetail.status ? (
          <DetailPair label="Stato" value="Non applicabile" />
        ) : (
          <>
            <DetailPair label="Stato" value={cashVatDetail.status} valueColor="#ffd38c" />
            <DetailPair label="Documento collegato" value={cashVatDetail.document} />
            <DetailPair label="Tipo" value={cashVatDetail.type} />
            <DetailPair label="Importo incassato" value={cashVatDetail.paymentAmount} />
            <DetailPair label="Totale documento" value={cashVatDetail.documentGross} />
            <DetailPair label="Percentuale incasso" value={cashVatDetail.percentage} />
            <DetailPair label="IVA totale" value={cashVatDetail.vatTotal} />
            <DetailPair label="IVA gia rilasciata" value={cashVatDetail.vatReleased} />
            <DetailPair label="IVA da rilasciare" value={cashVatDetail.vatToRelease} valueColor="#8ee7b6" />
            <DetailPair label="Periodo liquidazione" value={cashVatDetail.liquidationPeriod} />
          </>
        )}
      </SectionCard>

      <SectionCard title="Ritenuta">
        {withholdingDetail.status === 'Non applicabile' || !withholdingDetail.status ? (
          <DetailPair label="Stato" value="Non applicabile" />
        ) : (
          <>
            <DetailPair label="Stato" value={withholdingDetail.status} valueColor="#ffd38c" />
            <DetailPair label="Percipiente" value={withholdingDetail.recipient} />
            <DetailPair label="Codice fiscale" value={withholdingDetail.fiscalCode} />
            <DetailPair label="Base ritenuta" value={withholdingDetail.base} />
            <DetailPair label="Aliquota" value={withholdingDetail.rate} />
            <DetailPair label="Ritenuta" value={withholdingDetail.amount} />
            <DetailPair label="Netto pagato" value={withholdingDetail.net} />
            <DetailPair label="Causale CU" value={withholdingDetail.causaleCu} />
            <DetailPair label="Tributo" value={withholdingDetail.tribute} />
            <DetailPair label="Scadenza F24 futura" value={withholdingDetail.futureDueDate} />
          </>
        )}
      </SectionCard>

      <SectionCard title="Giroconto">
        {girocontoDetail ? (
          <>
            <DetailPair label="Banca origine" value={girocontoDetail.sourceBank} />
            <DetailPair label="Banca destinazione" value={girocontoDetail.targetBank} />
            <DetailPair label="Movimento gemello" value={girocontoDetail.twinMovement} />
            <DetailPair label="Confidence" value={girocontoDetail.confidence} />
            <DetailPair label="Rischio duplicazione" value={girocontoDetail.duplicationRisk} />
            <DetailPair label="PN unica proposta" value={girocontoDetail.pnUnique} />
          </>
        ) : (
          <DetailPair label="Stato" value="Non applicabile" />
        )}
      </SectionCard>

      <SectionCard title="Correzione staging">
        <DetailPair label="Stato review" value={movement?.reviewLabel || 'Da verificare'} valueColor={movement?.reviewTone === 'green' ? '#8ee7b6' : movement?.reviewTone === 'red' ? '#ff9fb0' : '#ffd38c'} />
        <DetailPair label="Correzioni precedenti" value={(movement?.correctionAuditTrail || []).length || 0} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginTop: '.15rem' }}>
          <button className="btn-sec" type="button" onClick={() => setIsEditingCorrection((prev) => !prev)} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.63rem' }}>
            {isEditingCorrection ? 'Chiudi modifica' : 'Modifica movimento'}
          </button>
          <button className="btn-sec" type="button" onClick={handleRestoreOriginalMovement} disabled={!movement?.correctionBaseline} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.63rem' }}>
            Ripristina valore originale
          </button>
        </div>
        {movement?.lastCorrection ? (
          <div style={{ marginTop: '.45rem', fontSize: '.68rem', color: 'rgba(215, 227, 239, 0.82)', lineHeight: 1.45 }}>
            Ultima correzione: {movement.lastCorrection.reason || '-'} | {movement.lastCorrection.createdAt || '-'}
            <div style={{ marginTop: '.2rem', display: 'grid', gap: '.15rem' }}>
              {(movement.lastCorrection.changedFields || []).map((field) => (
                <div key={field.field} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {field.field}: {String(field.previousValue ?? '-')} {'->'} {String(field.newValue ?? '-')}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isEditingCorrection ? (
          <div style={{ display: 'grid', gap: '.4rem', marginTop: '.55rem' }}>
            <label style={{ display: 'grid', gap: '.15rem' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(210, 223, 237, 0.78)' }}>Importo</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={correctionForm.amount}
                onChange={(event) => setCorrectionForm((prev) => ({ ...prev, amount: event.target.value }))}
                disabled={!isEditingCorrection}
                style={{ minHeight: 28, borderRadius: 10, border: '1px solid rgba(157, 185, 213, 0.18)', background: 'rgba(10, 20, 34, 0.88)', color: '#eef6ff', padding: '.18rem .4rem' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '.15rem' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(210, 223, 237, 0.78)' }}>Direction</span>
              <select
                value={correctionForm.direction}
                onChange={(event) => setCorrectionForm((prev) => ({ ...prev, direction: event.target.value }))}
                disabled={!isEditingCorrection}
                style={{ minHeight: 28, borderRadius: 10, border: '1px solid rgba(157, 185, 213, 0.18)', background: 'rgba(10, 20, 34, 0.88)', color: '#eef6ff', padding: '.18rem .4rem' }}
              >
                <option value="in">in</option>
                <option value="out">out</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '.15rem' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(210, 223, 237, 0.78)' }}>Data operazione</span>
              <input
                type="text"
                value={correctionForm.operationDate}
                onChange={(event) => setCorrectionForm((prev) => ({ ...prev, operationDate: event.target.value }))}
                disabled={!isEditingCorrection}
                placeholder="DD/MM/YYYY"
                style={{ minHeight: 28, borderRadius: 10, border: '1px solid rgba(157, 185, 213, 0.18)', background: 'rgba(10, 20, 34, 0.88)', color: '#eef6ff', padding: '.18rem .4rem' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '.15rem' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(210, 223, 237, 0.78)' }}>Data valuta</span>
              <input
                type="text"
                value={correctionForm.valueDate}
                onChange={(event) => setCorrectionForm((prev) => ({ ...prev, valueDate: event.target.value }))}
                disabled={!isEditingCorrection}
                placeholder="DD/MM/YYYY"
                style={{ minHeight: 28, borderRadius: 10, border: '1px solid rgba(157, 185, 213, 0.18)', background: 'rgba(10, 20, 34, 0.88)', color: '#eef6ff', padding: '.18rem .4rem' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '.15rem' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(210, 223, 237, 0.78)' }}>Descrizione</span>
              <textarea
                value={correctionForm.descriptionRaw}
                onChange={(event) => setCorrectionForm((prev) => ({ ...prev, descriptionRaw: event.target.value }))}
                disabled={!isEditingCorrection}
                rows={3}
                style={{ resize: 'vertical', minHeight: 60, borderRadius: 10, border: '1px solid rgba(157, 185, 213, 0.18)', background: 'rgba(10, 20, 34, 0.88)', color: '#eef6ff', padding: '.3rem .45rem' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '.15rem' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(210, 223, 237, 0.78)' }}>Controparte</span>
              <input
                type="text"
                value={correctionForm.counterpartyName}
                onChange={(event) => setCorrectionForm((prev) => ({ ...prev, counterpartyName: event.target.value }))}
                disabled={!isEditingCorrection}
                style={{ minHeight: 28, borderRadius: 10, border: '1px solid rgba(157, 185, 213, 0.18)', background: 'rgba(10, 20, 34, 0.88)', color: '#eef6ff', padding: '.18rem .4rem' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '.15rem' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(210, 223, 237, 0.78)' }}>Motivo correzione</span>
              <textarea
                value={correctionForm.reason}
                onChange={(event) => setCorrectionForm((prev) => ({ ...prev, reason: event.target.value }))}
                disabled={!isEditingCorrection}
                rows={2}
                placeholder="Importo letto male dal PDF"
                style={{ resize: 'vertical', minHeight: 46, borderRadius: 10, border: '1px solid rgba(157, 185, 213, 0.18)', background: 'rgba(10, 20, 34, 0.88)', color: '#eef6ff', padding: '.3rem .45rem' }}
              />
            </label>
            {correctionError ? <div style={{ fontSize: '.68rem', color: '#ff9fb0', lineHeight: 1.35 }}>{correctionError}</div> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
              <button className="btn" type="button" onClick={handleApplyCorrection} disabled={!isEditingCorrection} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.63rem' }}>
                Applica correzione
              </button>
              <button
                className="btn-sec"
                type="button"
                onClick={() => {
                  setIsEditingCorrection(false)
                  setCorrectionError('')
                  const currentAmount = Number(movement.entrata || movement.uscita || 0)
                  setCorrectionForm({
                    amount: Number.isFinite(currentAmount) && currentAmount > 0 ? String(currentAmount.toFixed(2)) : '',
                    direction: movement?.detail?.movement?.direction === 'Entrata' ? 'in' : 'out',
                    operationDate: movement?.detail?.movement?.operationDate || movement.operationDate || '',
                    valueDate: movement?.detail?.movement?.valueDate || movement.valueDate || movement?.detail?.movement?.operationDate || movement.operationDate || '',
                    descriptionRaw: movement?.detail?.movement?.descriptionRaw || movement.description || '',
                    counterpartyName: movement?.detail?.movement?.counterparty || movement.counterparty || '',
                    reason: '',
                  })
                }}
                disabled={!isEditingCorrection}
                style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.63rem' }}
              >
                Annulla
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Audit importo">
        <DetailPair
          label="Candidato selezionato"
          value={amountAudit?.selectedAmountCandidate?.raw ? `${amountAudit.selectedAmountCandidate.raw} -> ${amountAudit.selectedAmountCandidate.amount}` : '-'}
        />
        <DetailPair
          label="Candidati scartati"
          value={Array.isArray(amountAudit?.rejectedAmountCandidates) ? amountAudit.rejectedAmountCandidates.length : 0}
        />
        <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5, marginTop: '.2rem' }}>
          <div style={{ marginBottom: '.2rem', color: 'rgba(159, 208, 255, 0.8)' }}>Note</div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {amountAudit?.selectedAmountCandidate?.reason || '-'}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Audit decisione">
        <DetailPair label="Regola applicata" value={auditDetail.rule} />
        <DetailPair label="Confidence" value={auditDetail.confidence} />
        <DetailPair label="Operatore" value={auditDetail.operator} />
        <DetailPair label="Ultimo aggiornamento" value={auditDetail.updatedAt} />
        <div style={{ fontSize: '.75rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5 }}>
          Note: {auditDetail.notes || '-'}
        </div>
      </SectionCard>

      {(auditDetail.deltaReason || auditDetail.directionSource === 'keyword_fallback' || auditDetail.directionSource === 'ambiguous' || auditDetail.detectedColumn === 'unknown') ? (
        <SectionCard title="Diagnostica delta">
          <DetailPair label="Pagina" value={auditDetail.pageNumber || '-'} />
          <DetailPair label="Colonna rilevata" value={auditDetail.detectedColumn || '-'} />
          <DetailPair label="Origine direction" value={auditDetail.directionSource || '-'} />
          <DetailPair label="Motivo" value={auditDetail.deltaReason || '-'} />
          <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5, marginTop: '.2rem' }}>
            <div style={{ marginBottom: '.2rem', color: 'rgba(159, 208, 255, 0.8)' }}>Raw text</div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {auditDetail.rawText || '-'}
            </div>
          </div>
        </SectionCard>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
        <button className="btn">Conferma movimento</button>
        <button className="btn-sec">Cambia match</button>
        <button className="btn-sec">Apri in partitario</button>
        <button className="btn-sec">Apri prima nota</button>
        <button className="btn-sec">Sospendi</button>
      </div>
    </div>
  )

  const documentTab = (
    <div style={{ display: 'grid', gap: '.55rem' }}>
      <RiconciliazioneDocumentPreview
        preview={preview}
        onPrevPage={() => onPreviewPageChange?.(Math.max(1, Number(preview?.page || 1) - 1))}
        onNextPage={() => onPreviewPageChange?.(Number(preview?.page || 1) + 1)}
        onZoomOut={() => onPreviewZoomChange?.(Math.max(0.75, zoomValue - 0.1))}
        onZoomIn={() => onPreviewZoomChange?.(Math.min(2, zoomValue + 0.1))}
        onFitWidth={() => onPreviewZoomChange?.('fit')}
        onResetZoom={() => onPreviewZoomChange?.(1)}
        onOpenMovement={() => setActiveTab('movement')}
        onOpenDocumentModal={onOpenDocumentModal}
      />

      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
        <button className="btn-sec" type="button" onClick={onOpenDocumentModal} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.64rem' }}>
          Vista documento ampia
        </button>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: '.68rem', color: '#9fd0ff', marginBottom: '.4rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Collegamento logico
        </div>
        <div style={{ fontSize: '.74rem', color: '#eef6ff' }}>
          Pagina: <strong>{preview?.page || '-'}</strong> | Raw row: <strong>{preview?.rawRowId || '-'}</strong> | Movimento: <strong>{preview?.movementId || '-'}</strong>
        </div>
        <div style={{ fontSize: '.7rem', color: 'rgba(215, 227, 239, 0.82)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '.25rem' }}>
          {preview?.rawText || 'Nessun raw text disponibile per il movimento selezionato.'}
        </div>
      </div>
    </div>
  )

  const reviewTab = (
    <div style={{ display: 'grid', gap: '.55rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', alignItems: 'center' }}>
        <Badge label={`Totale ${reviewStats.total}`} tone={reviewStats.total ? 'amber' : 'blue'} />
        <Badge label={`Da verificare ${reviewStats.pending}`} tone={reviewStats.pending ? 'red' : 'green'} />
        <Badge label={`Verificate ${reviewStats.verified}`} tone="green" />
        <Badge label={`Corrette ${reviewStats.corrected}`} tone="green" />
        <Badge label={`Non movimento ${reviewStats.ignored}`} tone="blue" />
        <Badge label={`Mapping manuale ${reviewStats.manual}`} tone="amber" />
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: '.68rem', color: '#9fd0ff', marginBottom: '.35rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Stato review
        </div>
        <div style={{ fontSize: '.75rem', color: '#eef6ff', lineHeight: 1.45 }}>
          {reviewSummaryLabel}
        </div>
        <div style={{ fontSize: '.68rem', color: 'rgba(215, 227, 239, 0.76)', marginTop: '.2rem', lineHeight: 1.4 }}>
          Le azioni qui sotto restano locali allo staging e non generano effetti contabili.
        </div>
      </div>

      <div style={{ display: 'grid', gap: '.35rem', maxHeight: 320, overflowY: 'auto', paddingRight: '.25rem' }}>
        <RiconciliazioneReviewList
          items={reviewItems}
          selectedMovementId={movement?.id}
          onMarkVerified={onMarkVerified}
          onMarkIgnored={onMarkIgnored}
          onMarkManualMapping={onMarkManualMapping}
          onOpenDocument={handleOpenDocument}
          onSelectMovement={handleSelectMovement}
        />
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: '.68rem', color: '#9fd0ff', marginBottom: '.35rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Correzione staging
        </div>
        <div style={{ fontSize: '.74rem', color: 'rgba(215, 227, 239, 0.82)', lineHeight: 1.45 }}>
          La correzione locale del movimento selezionato e predisposta per la fase successiva. Per ora restano attive solo le azioni di verifica.
        </div>
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.45rem' }}>
          <button className="btn-sec" type="button" disabled>
            Correggi movimento
          </button>
          <button className="btn-sec" type="button" disabled>
            Applica staging
          </button>
        </div>
      </div>
    </div>
  )

  const tabs = [
    { key: 'working', label: 'Working View' },
    { key: 'movement', label: 'Dettaglio movimento' },
    { key: 'document', label: 'Documento originale' },
    { key: 'review', label: 'Review audit' },
  ]

  const panelWidth = collapsed ? 60 : activeTab === 'working' ? 520 : 332

  return (
    <aside
      style={{
        width: panelWidth,
        minWidth: panelWidth,
        transition: 'width .18s ease, min-width .18s ease',
        position: 'sticky',
        top: 12,
        alignSelf: 'start',
      }}
    >
      <div className="card" style={{ ...sectionStyle, padding: collapsed ? '.8rem .55rem' : '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', marginBottom: collapsed ? 0 : '.65rem' }}>
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f0f7ff' }}>Dettaglio movimento</div>
              <div style={{ fontSize: '.74rem', color: 'rgba(210, 223, 237, 0.8)' }}>Working view operativa</div>
            </div>
          )}
          <button className="btn-sec" onClick={onToggleCollapsed} style={{ padding: '.4rem .7rem' }}>
            {collapsed ? '<' : '>'}
          </button>
        </div>

        {!collapsed && (
          <div style={{ display: 'grid', gap: '.55rem' }}>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              {tabs.map((tab) => (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} style={tabButtonStyle(activeTab === tab.key)}>
                  {tab.label}
                </button>
              ))}
              <span className="bdg bdg-cy" style={{ background: 'rgba(10, 35, 52, 0.92)', color: '#bde8ff', fontSize: '.64rem' }}>
                Review {reviewStats.pending}/{reviewStats.total}
              </span>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: '.2rem' }}>
              {activeTab === 'working' ? <RiconciliazioneMovementWorkingView movement={movement} bankStatement={bankStatement} workingContext={workingContext} /> : activeTab === 'document' ? documentTab : activeTab === 'review' ? reviewTab : movementTab}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
