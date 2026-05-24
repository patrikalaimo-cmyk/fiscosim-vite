import { useEffect, useMemo, useState } from 'react'
import { fmtCurrency } from '../../ui/formatters.js'
import { getRiconciliazioneMatchingFixtures } from './riconciliazioneMatchingFixtures.js'
import { runRiconciliazioneMatchForMovement } from './runRiconciliazioneMatchForMovement.js'
import { buildReconciliationDecisionFromProposal } from './buildReconciliationDecisionFromProposal.js'
import { applyReconciliationDecisionAction } from './applyReconciliationDecisionAction.js'
import { validateReconciliationDecision } from './validateReconciliationDecision.js'
import { RECONCILIATION_DECISION_OPERATOR_ACTION, RECONCILIATION_DECISION_STATUS } from './reconciliationDecisionTypes.js'

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

function ValueRow({ label, value, valueColor = '#eef6ff' }) {
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: '.75rem', color: 'rgba(211, 224, 238, 0.75)' }}>{label}</span>
      <strong style={{ fontSize: '.8rem', color: valueColor, textAlign: 'right', whiteSpace: 'pre-wrap' }}>{value ?? '-'}</strong>
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '.68rem', color: '#9fd0ff', marginBottom: '.4rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</div>
      {children}
    </div>
  )
}

function buildFallbackContext(movement) {
  return {
    available: false,
    source: 'fallback',
    message: 'Decisione non disponibile - movimento reale non presente nel dataset mock',
    movement: movement || null,
    decisionProposal: null,
    fixtureCase: null,
    fixtureMovement: null,
  }
}

function formatCandidateLabel(candidate) {
  if (!candidate) return '-'
  return [candidate.partitaId || 'senza partita', candidate.soggettoNome || '', candidate.documentoId || '']
    .filter(Boolean)
    .join(' | ')
}

export default function RiconciliazioneMovementWorkingView({
  movement,
  bankStatement,
  workingContext = null,
}) {
  const fixtures = workingContext?.fixtures || getRiconciliazioneMatchingFixtures()
  const [demoMode, setDemoMode] = useState(false)
  const [demoCaseId, setDemoCaseId] = useState('A')
  const [localDecisionState, setLocalDecisionState] = useState(null)
  const [decisionDraft, setDecisionDraft] = useState(null)

  useEffect(() => {
    setLocalDecisionState(null)
  }, [movement?.id, workingContext?.fixtureCase?.caseId])

  const demoFixtureCase = useMemo(() => {
    if (!demoMode) return null
    return fixtures.expectedCases.find((item) => item.caseId === demoCaseId) || fixtures.expectedCases[0] || null
  }, [demoCaseId, demoMode, fixtures.expectedCases])

  const demoFixtureMovement = useMemo(() => {
    if (!demoFixtureCase) return null
    return fixtures.movements.find((item) => item.movementId === demoFixtureCase.movementId) || null
  }, [demoFixtureCase, fixtures.movements])

  const demoDecisionProposal = useMemo(() => {
    if (!demoFixtureMovement) return null
    return runRiconciliazioneMatchForMovement({ movement: demoFixtureMovement, partiteAperte: fixtures.partiteAperte })
  }, [demoFixtureMovement, fixtures.partiteAperte])

  const activeMovement = demoMode ? demoFixtureMovement : workingContext?.fixtureMovement || movement || null
  const decisionProposal = demoMode ? demoDecisionProposal : workingContext?.decisionProposal || null
  const activeCase = demoMode ? demoFixtureCase : workingContext?.fixtureCase || null
  const isFixtureMatched = Boolean(!demoMode && workingContext?.available && decisionProposal)
  const decisionSourceMessage =
    demoMode
      ? 'Modalita demo R7B attiva - nessun effetto reale'
      : workingContext?.available
        ? 'Contesto R7A/R7B disponibile per il movimento selezionato'
        : workingContext?.message || 'Decisione non disponibile - movimento reale non presente nel dataset mock'

  const builtDecision = useMemo(() => {
    if (!decisionProposal) return null
    return buildReconciliationDecisionFromProposal(decisionProposal, { movementId: activeMovement?.id || activeMovement?.movementId || null })
  }, [activeMovement?.id, activeMovement?.movementId, decisionProposal])

  useEffect(() => {
    setDecisionDraft(builtDecision)
  }, [builtDecision?.decisionId])

  const activeDecision = decisionDraft || builtDecision
  const validation = useMemo(() => validateReconciliationDecision(activeDecision || {}), [activeDecision])
  const actionIsBlocked = Boolean(validation.blockers.length || activeDecision?.status === RECONCILIATION_DECISION_STATUS.BLOCKED)

  const candidateTone =
    decisionProposal?.selectedCandidate?.matchType === 'exact_amount' ? 'green' :
    decisionProposal?.selectedCandidate?.matchType === 'partial_amount' || decisionProposal?.selectedCandidate?.matchType === 'cumulative_candidate' ? 'amber' :
    decisionProposal?.selectedCandidate?.matchType === 'ambiguous' ? 'amber' :
    decisionProposal?.selectedCandidate?.matchType === 'not_required' ? 'blue' : 'red'

  const readinessTone =
    activeDecision?.readiness === 'ready_to_review' || activeDecision?.readiness === 'ready_without_partita' || activeDecision?.readiness === 'ready_to_post' ? 'green' :
    activeDecision?.readiness === 'needs_operator_choice' ? 'amber' :
    activeDecision?.readiness === 'blocked' ? 'red' : 'blue'

  const cashVatImpact = decisionProposal?.cashVatImpact || null
  const withholdingPaymentProposal = decisionProposal?.withholdingPaymentProposal || null
  const accountingProposal = decisionProposal?.accountingProposal || null
  const candidateList = Array.isArray(decisionProposal?.candidates) ? decisionProposal.candidates : []
  const selectedCandidate = decisionProposal?.selectedCandidate || null
  const canAccept = Boolean(activeDecision) && !actionIsBlocked

  const applyAction = (action, payload = {}) => {
    const next = applyReconciliationDecisionAction(activeDecision || {}, action, payload)
    if (!next.ok) return next
    setDecisionDraft(next.decision)
    setLocalDecisionState(next.decision.status)
    return next
  }

  const debitTotal = Array.isArray(accountingProposal?.righe)
    ? accountingProposal.righe.reduce((acc, row) => acc + (String(row.sezione).toLowerCase() === 'dare' ? Math.abs(Number(row.importo || 0)) : 0), 0)
    : 0
  const creditTotal = Array.isArray(accountingProposal?.righe)
    ? accountingProposal.righe.reduce((acc, row) => acc + (String(row.sezione).toLowerCase() === 'avere' ? Math.abs(Number(row.importo || 0)) : 0), 0)
    : 0

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>
      <SectionCard title="Working View operativa">
        <ValueRow label="Sorgente" value={decisionSourceMessage} />
        <ValueRow label="Decisione locale" value={activeDecision?.status || 'n/d'} />
        <ValueRow label="Readiness locale" value={activeDecision?.readiness || 'n/d'} valueColor={readinessTone === 'green' ? '#8ee7b6' : readinessTone === 'amber' ? '#ffd38c' : readinessTone === 'red' ? '#ff9fb0' : '#9fd0ff'} />
        <ValueRow label="Stato staging" value={localDecisionState || activeDecision?.status || 'pending'} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginTop: '.35rem' }}>
          <button className="btn-sec" type="button" onClick={() => setDemoMode((prev) => !prev)} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.63rem' }}>
            {demoMode ? 'Esci da demo R7B' : 'Prova Working View casi R7B'}
          </button>
          <button className="btn-sec" type="button" onClick={() => applyAction(RECONCILIATION_DECISION_OPERATOR_ACTION.ACCEPT_PROPOSAL, { operatorNotes: 'Accettazione locale' })} disabled={!canAccept} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.63rem' }}>
            Accetta decisione proposta
          </button>
          <button className="btn-sec" type="button" onClick={() => applyAction(RECONCILIATION_DECISION_OPERATOR_ACTION.MARK_NEEDS_REVIEW, { operatorNotes: 'Da verificare' })} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.63rem' }}>
            Marca da verificare
          </button>
          <button className="btn-sec" type="button" onClick={() => applyAction(RECONCILIATION_DECISION_OPERATOR_ACTION.IGNORE_MOVEMENT, { operatorNotes: 'Ignorato in staging locale' })} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.63rem' }}>
            Ignora movimento
          </button>
          <button className="btn-sec" type="button" onClick={() => applyAction(RECONCILIATION_DECISION_OPERATOR_ACTION.CANCEL_DECISION, { operatorNotes: 'Decisione annullata' })} style={{ minHeight: 24, padding: '0 .45rem', fontSize: '.63rem' }}>
            Annulla decisione
          </button>
        </div>
        {!canAccept && (validation.blockers || []).length ? (
          <div style={{ marginTop: '.45rem', fontSize: '.72rem', color: '#ff9fb0', lineHeight: 1.45 }}>
            Blocco decisione: {(validation.blockers || []).join(', ')}
          </div>
        ) : null}
        {demoMode ? (
          <div style={{ marginTop: '.55rem', display: 'grid', gap: '.3rem' }}>
            <label style={{ display: 'grid', gap: '.15rem' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(210, 223, 237, 0.78)' }}>Caso demo R7B</span>
              <select
                value={demoCaseId}
                onChange={(event) => setDemoCaseId(event.target.value)}
                style={{ minHeight: 28, borderRadius: 10, border: '1px solid rgba(157, 185, 213, 0.18)', background: 'rgba(10, 20, 34, 0.88)', color: '#eef6ff', padding: '.18rem .4rem' }}
              >
                {fixtures.expectedCases.map((item) => (
                  <option key={item.caseId} value={item.caseId}>
                    {item.caseId} - {item.movementId}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ fontSize: '.68rem', color: 'rgba(215, 227, 239, 0.78)' }}>
              Selezione demo isolata dal flusso reale. Nessun aggiornamento di DB, commit o prima nota.
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Movimento bancario">
        <ValueRow label="Data operazione" value={activeMovement?.operationDate || '-'} />
        <ValueRow label="Data valuta" value={activeMovement?.valueDate || '-'} />
        <ValueRow label="Direction" value={activeMovement?.direction || '-'} />
        <ValueRow label="Importo" value={activeMovement ? fmtCurrency(activeMovement.amount || 0) : '-'} valueColor={String(activeMovement?.direction || '').toLowerCase() === 'in' ? '#8ee7b6' : '#ff9fb0'} />
        <ValueRow label="Descrizione raw" value={activeMovement?.descriptionRaw || '-'} />
        <ValueRow label="Descrizione normalizzata" value={activeMovement?.descriptionNormalized || '-'} />
        <ValueRow label="Conto banca" value={activeMovement?.bankAccountCode || activeMovement?.bankAccountId || '-'} />
        <ValueRow label="Controparte rilevata" value={activeMovement?.counterpartyName || '-'} />
        <ValueRow label="Causale bancaria" value={activeMovement?.bankCausal || '-'} />
        <ValueRow label="Source statement" value={activeMovement?.sourceStatementId || bankStatement?.sourceFileName || '-'} />
      </SectionCard>

      <SectionCard title="Match partitario">
        {!decisionProposal ? (
          <div style={{ fontSize: '.75rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5 }}>{workingContext?.message || 'Decisione non disponibile — movimento reale non presente nel dataset mock'}</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginBottom: '.4rem' }}>
              <Badge label={`decisionType ${decisionProposal.decisionType}`} tone={candidateTone} />
              <Badge label={`movementType ${decisionProposal.movementType}`} tone="blue" />
              <Badge label={`readiness ${decisionProposal.readiness}`} tone={readinessTone} />
            </div>
            <ValueRow label="Selected candidate" value={formatCandidateLabel(selectedCandidate)} />
            <ValueRow label="PartitaId" value={selectedCandidate?.partitaId || 'n/d'} />
            <ValueRow label="Soggetto" value={selectedCandidate?.soggettoNome || '-'} />
            <ValueRow label="Documento" value={selectedCandidate?.documentoId || selectedCandidate?.subsetNumeroDocumenti?.join(', ') || '-'} />
            <ValueRow label="Importo aperto" value={selectedCandidate?.importoOriginario != null ? fmtCurrency(selectedCandidate.importoOriginario) : '-'} />
            <ValueRow label="Importo match" value={selectedCandidate?.amountMatched != null ? fmtCurrency(selectedCandidate.amountMatched) : '-'} />
            <ValueRow label="Delta" value={selectedCandidate?.amountDelta != null ? fmtCurrency(selectedCandidate.amountDelta) : '-'} />
            <ValueRow label="Residual after match" value={selectedCandidate?.residualAfterMatch != null ? fmtCurrency(selectedCandidate.residualAfterMatch) : '-'} />
            <ValueRow label="Confidence" value={Number.isFinite(Number(selectedCandidate?.confidence)) ? String(Math.round(Number(selectedCandidate.confidence) * 100)) + '%' : '-'} />
            <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5, marginTop: '.25rem' }}>
              <div style={{ marginBottom: '.2rem', color: 'rgba(159, 208, 255, 0.8)' }}>Reasons</div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{(selectedCandidate?.reasons || []).length ? selectedCandidate.reasons.join(', ') : '-'}</div>
            </div>
            <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5, marginTop: '.35rem' }}>
              <div style={{ marginBottom: '.2rem', color: 'rgba(159, 208, 255, 0.8)' }}>Warnings / blockers</div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{[...(selectedCandidate?.warnings || []), ...(selectedCandidate?.blockers || [])].length ? [...(selectedCandidate?.warnings || []), ...(selectedCandidate?.blockers || [])].join(', ') : 'Nessuno'}</div>
            </div>
            <div style={{ marginTop: '.45rem', display: 'grid', gap: '.3rem' }}>
              {(candidateList || []).map((candidate) => (
                <div
                  key={candidate.candidateId}
                  style={{
                    border: candidate.candidateId === selectedCandidate?.candidateId ? '1px solid rgba(142, 231, 182, 0.34)' : '1px solid rgba(127, 154, 182, 0.16)',
                    borderRadius: 14,
                    padding: '.45rem .5rem',
                    background: candidate.candidateId === selectedCandidate?.candidateId ? 'rgba(17, 44, 34, 0.86)' : 'rgba(10, 20, 34, 0.9)',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', alignItems: 'center' }}>
                    <Badge label={candidate.matchType} tone={candidate.matchType === 'exact_amount' ? 'green' : candidate.matchType === 'partial_amount' ? 'amber' : candidate.matchType === 'ambiguous' ? 'amber' : candidate.matchType === 'cumulative_candidate' ? 'amber' : 'blue'} />
                    <span style={{ fontSize: '.72rem', color: '#eef6ff' }}>{formatCandidateLabel(candidate)}</span>
                  </div>
                  <div style={{ marginTop: '.25rem', fontSize: '.68rem', color: 'rgba(215, 227, 239, 0.78)' }}>
                    match {candidate.amountMatched != null ? fmtCurrency(candidate.amountMatched) : '-'} | delta {candidate.amountDelta != null ? fmtCurrency(candidate.amountDelta) : '-'} | residuo {candidate.residualAfterMatch != null ? fmtCurrency(candidate.residualAfterMatch) : '-'} | confidence {candidate.confidence != null ? `${Math.round(candidate.confidence * 100)}%` : '-'}
                  </div>
                </div>
              ))}
            </div>
            {!candidateList.length ? <div style={{ fontSize: '.75rem', color: 'rgba(215, 227, 239, 0.84)', marginTop: '.35rem' }}>Nessun candidato disponibile.</div> : null}
          </>
        )}
      </SectionCard>

      <SectionCard title="Proposta Prima Nota">
        {!accountingProposal ? (
          <div style={{ fontSize: '.75rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5 }}>Nessuna proposta prima nota disponibile.</div>
        ) : (
          <>
            <ValueRow label="Causale bancaria" value={accountingProposal.causaleBancaria} />
            <ValueRow label="Descrizione" value={accountingProposal.descrizione} />
            <div style={{ marginTop: '.3rem', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(127, 154, 182, 0.16)' }}>
              {(accountingProposal.righe || []).map((row, index) => (
                <div key={`${row.sezione}-${index}`} style={{ display: 'grid', gridTemplateColumns: '54px 1fr 1fr 92px', gap: '.35rem', padding: '.4rem .45rem', background: index % 2 === 0 ? 'rgba(10, 20, 34, 0.92)' : 'rgba(13, 27, 45, 0.92)', borderBottom: index === (accountingProposal.righe || []).length - 1 ? 'none' : '1px solid rgba(127, 154, 182, 0.14)' }}>
                  <div style={{ color: row.sezione === 'Dare' ? '#8ee7b6' : '#ff9fb0', fontWeight: 800, fontSize: '.72rem' }}>{row.sezione}</div>
                  <div style={{ color: '#eef6ff', fontSize: '.72rem' }}>{row.conto}</div>
                  <div style={{ color: 'rgba(215, 227, 239, 0.76)', fontSize: '.66rem' }}>{row.tipoConto}</div>
                  <div style={{ color: '#9fd0ff', fontSize: '.72rem', textAlign: 'right', fontWeight: 800 }}>{fmtCurrency(row.importo || 0)}</div>
                </div>
              ))}
            </div>
            <ValueRow label="Quadratura proposta" value={fmtCurrency(debitTotal)} />
            <ValueRow label="Quadratura contabile" value={fmtCurrency(creditTotal)} />
            <ValueRow label="Esito" value={Math.abs(debitTotal - creditTotal) < 0.01 ? 'OK' : 'Da verificare'} valueColor={Math.abs(debitTotal - creditTotal) < 0.01 ? '#8ee7b6' : '#ffd38c'} />
            {accountingProposal.partitarioImpact ? (
              <div style={{ marginTop: '.35rem', fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.45 }}>
                Partitario: {accountingProposal.partitarioImpact.action || '-'}
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <SectionCard title="Effetti fiscali collegati">
        {!cashVatImpact?.applies && !withholdingPaymentProposal?.applies ? (
          <div style={{ fontSize: '.75rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5 }}>Nessun effetto fiscale collegato rilevato.</div>
        ) : (
          <>
            {cashVatImpact?.applies ? (
              <div style={{ paddingBottom: '.35rem', marginBottom: '.35rem', borderBottom: '1px solid rgba(127, 154, 182, 0.12)' }}>
                <div style={{ fontSize: '.68rem', color: '#9fd0ff', marginBottom: '.28rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>IVA per cassa</div>
                <ValueRow label="applies" value="true" />
                <ValueRow label="direction" value={cashVatImpact.direction} />
                <ValueRow label="documentId" value={cashVatImpact.documentId || '-'} />
                <ValueRow label="taxableAmountReleased" value={fmtCurrency(cashVatImpact.taxableAmountReleased || 0)} />
                <ValueRow label="vatAmountReleased" value={fmtCurrency(cashVatImpact.vatAmountReleased || 0)} />
                <ValueRow label="proportion" value={String(cashVatImpact.proportion ?? '-')} />
                <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.45 }}>{cashVatImpact.warning || '-'}</div>
              </div>
            ) : null}
            {withholdingPaymentProposal?.applies ? (
              <div>
                <div style={{ fontSize: '.68rem', color: '#9fd0ff', marginBottom: '.28rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Ritenuta</div>
                <ValueRow label="applies" value="true" />
                <ValueRow label="percipienteId" value={withholdingPaymentProposal.percipienteId || '-'} />
                <ValueRow label="ritenutaId" value={withholdingPaymentProposal.ritenutaId || '-'} />
                <ValueRow label="amount" value={fmtCurrency(withholdingPaymentProposal.amount || 0)} />
                <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.45 }}>{withholdingPaymentProposal.warning || '-'}</div>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <SectionCard title="Audit / Decisione">
        <ValueRow label="Confidence complessiva" value={decisionProposal ? `${Math.round((decisionProposal.confidence || 0) * 100)}%` : '-'} />
        <ValueRow label="Warnings" value={(validation.warnings || []).length ? validation.warnings.join(', ') : (decisionProposal?.warnings || []).length ? decisionProposal.warnings.join(', ') : '-'} />
        <ValueRow label="Blockers" value={(validation.blockers || []).length ? validation.blockers.join(', ') : (decisionProposal?.blockers || []).length ? decisionProposal.blockers.join(', ') : '-'} />
        <ValueRow label="Reasons principali" value={(selectedCandidate?.reasons || []).length ? selectedCandidate.reasons.join(', ') : '-'} />
        <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5, marginTop: '.25rem' }}>
          Motivo operatore: {validation.blockers.length ? 'Decisione bloccata da warning/blocker' : activeDecision?.readiness === 'needs_operator_choice' ? 'Serve scelta operatore' : 'Non richiesto'}
        </div>
      </SectionCard>

      <SectionCard title="Readiness">
        <ValueRow label="stato decisione" value={activeDecision?.status || 'n/d'} />
        <ValueRow label="readiness" value={activeDecision?.readiness || 'n/d'} valueColor={readinessTone === 'green' ? '#8ee7b6' : readinessTone === 'amber' ? '#ffd38c' : readinessTone === 'red' ? '#ff9fb0' : '#9fd0ff'} />
        <ValueRow label="Validazione" value={validation.valid ? 'OK' : 'Non valida'} valueColor={validation.valid ? '#8ee7b6' : '#ff9fb0'} />
        <ValueRow label="Next step" value={
          activeDecision?.status === RECONCILIATION_DECISION_STATUS.ACCEPTED
            ? 'Pronta per mapper canonico'
            : activeDecision?.status === RECONCILIATION_DECISION_STATUS.NEEDS_REVIEW
              ? 'Richiede scelta operatore'
              : activeDecision?.status === RECONCILIATION_DECISION_STATUS.BLOCKED
                ? 'Bloccata'
                : activeDecision?.status === RECONCILIATION_DECISION_STATUS.IGNORED
                  ? 'Ignorata'
                  : activeDecision?.status === RECONCILIATION_DECISION_STATUS.CANCELLED
                    ? 'Annullata'
                    : 'Richiede scelta operatore'
        } />
        <ValueRow label="Blockers" value={(validation.blockers || []).length ? validation.blockers.join(', ') : '-'} />
        <ValueRow label="Warnings" value={(validation.warnings || []).length ? validation.warnings.join(', ') : '-'} />
        <div style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.5 }}>
          {activeDecision?.readiness === 'ready_to_review'
            ? 'Pronto per verifica operatore.'
            : activeDecision?.readiness === 'needs_operator_choice'
              ? 'Serve una scelta operatore prima di procedere.'
              : activeDecision?.readiness === 'blocked'
                ? 'Presente un blocco operativo o fiscale.'
                : activeDecision?.readiness === 'ready_without_partita'
                  ? 'Non serve una partita aperta per procedere.'
                  : activeDecision?.readiness === 'ignored'
                    ? 'Movimento ignorato localmente.'
                    : activeDecision?.readiness === 'ready_to_post'
                      ? 'Pronta per mapper canonico.'
                      : 'Stato non disponibile.'}
        </div>
      </SectionCard>
      <SectionCard title="Audit trail decisione">
        {(activeDecision?.auditTrail || []).length ? activeDecision.auditTrail.map((event) => (
          <div key={`${event.eventType}-${event.at}`} style={{ fontSize: '.72rem', color: 'rgba(215, 227, 239, 0.84)', lineHeight: 1.45, padding: '.2rem 0', borderBottom: '1px solid rgba(127, 154, 182, 0.12)' }}>
            <strong style={{ color: '#9fd0ff' }}>{event.eventType}</strong> | {event.at}
          </div>
        )) : <div style={{ fontSize: '.75rem', color: 'rgba(215, 227, 239, 0.84)' }}>Nessun evento audit disponibile.</div>}
      </SectionCard>
    </div>
  )
}