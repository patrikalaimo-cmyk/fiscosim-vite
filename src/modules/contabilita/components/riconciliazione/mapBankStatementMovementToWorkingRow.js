import { fmtCurrency } from '../../ui/formatters.js'

function formatDate(value) {
  return value || 'Da verificare'
}

function formatAmount(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) && amount > 0 ? fmtCurrency(amount) : 'Da verificare'
}

export function mapBankStatementMovementToWorkingRow(movement, index = 0) {
  const amount = Number(movement?.amount || 0)
  const isIncoming = movement?.direction === 'in'
  const isReviewedGood = movement?.reviewStatus === 'corrected' || movement?.reviewStatus === 'verified'
  const status =
    isReviewedGood
      ? 'Pronta'
      : movement?.status === 'duplicate'
      ? 'Duplicata'
      : movement?.status === 'blocked'
        ? 'Bloccata'
        : movement?.status === 'needs_review'
          ? 'Da dettagliare'
          : 'Da dettagliare'

  const row = {
    id: movement?.movementId || movement?.id || `staging-${index}`,
    status,
    statusTone: status === 'Bloccata' || status === 'Duplicata' ? 'red' : isReviewedGood ? 'green' : 'amber',
    dateOp: formatDate(movement?.operationDate),
    dateVal: formatDate(movement?.valueDate || movement?.operationDate),
    description: movement?.descriptionRaw || movement?.descriptionNormalized || 'Movimento bancario da analizzare',
    counterparty: movement?.counterpartyName || 'Da identificare',
    entrata: isIncoming ? amount : 0,
    uscita: !isIncoming ? amount : 0,
    match: movement?.reference || movement?.bankCausal || 'Da analizzare',
    confidence: Number(movement?.parseConfidence || 0),
    action: isIncoming ? 'Incasso da analizzare' : 'Pagamento da analizzare',
    pn: 'Da creare',
    partitario: 'Da dettagliare',
    ivaCassa: 'No',
    withholding: 'Non applicabile',
    esito: isReviewedGood
      ? 'Corretto'
      : movement?.status === 'duplicate'
        ? 'Blocco'
        : movement?.status === 'blocked'
          ? 'Blocco'
          : movement?.status === 'needs_review'
            ? 'Da verificare'
            : 'Da analizzare',
    operatorConfirmed: false,
    ready: false,
    amount,
    direction: movement?.direction || (isIncoming ? 'in' : 'out'),
    reviewStatus: movement?.reviewStatus || '',
    reviewLabel: movement?.reviewLabel || '',
    reviewTone: movement?.reviewTone || '',
    reviewReason: movement?.reviewReason || '',
    correctionBaseline: movement?.correctionBaseline || null,
    lastCorrection: movement?.lastCorrection || null,
    correctionAuditTrail: Array.isArray(movement?.correctionAuditTrail) ? movement.correctionAuditTrail : [],
    detail: {
      movement: {
        operationDate: formatDate(movement?.operationDate),
        valueDate: formatDate(movement?.valueDate || movement?.operationDate),
        descriptionRaw: movement?.descriptionRaw || movement?.descriptionNormalized || 'Movimento bancario da analizzare',
        counterparty: movement?.counterpartyName || 'Da identificare',
        amount: formatAmount(amount),
        direction: isIncoming ? 'Entrata' : 'Uscita',
        bankCausal: movement?.bankCausal || 'Da verificare',
        iban: movement?.counterpartyIban || 'Da verificare',
        reference: movement?.reference || movement?.cro || movement?.transactionId || 'Da verificare',
      },
      match: {
        title: 'Staging PDF',
        confidence: `${Number(movement?.parseConfidence || 0)}%`,
        reasons: ['Riga estratta localmente', 'Nessun match contabile reale'],
      },
      pn: {
        title: 'Da creare',
        causale: 'Da definire',
        registrationDate: formatDate(movement?.operationDate),
        rows: [
          { label: isIncoming ? 'Banca Dare' : 'Banca Avere', value: formatAmount(amount) },
          { label: isIncoming ? 'Contropartita Avere' : 'Contropartita Dare', value: formatAmount(amount) },
        ],
        balance: 'Da verificare',
      },
      ledger: {
        subject: movement?.counterpartyName || 'Da identificare',
        document: movement?.reference || 'Da verificare',
        amountClose: formatAmount(amount),
        residualBefore: 'Da verificare',
        residualAfter: 'Da verificare',
      },
      cashVat: { status: 'Non applicabile' },
      withholding: { status: 'Non applicabile' },
      giroconto: null,
      audit: {
        rule: 'Parsing staging locale',
        confidence: `${Number(movement?.parseConfidence || 0)}%`,
        operator: 'Non confermato',
        updatedAt: 'Staging locale',
        notes: 'Movimento importato senza proposta contabile reale',
        rawText: movement?.sourceMeta?.rawText || movement?.descriptionRaw || '',
        pageNumber: movement?.sourceMeta?.pageNumber || 0,
        detectedColumn: movement?.sourceMeta?.detectedColumn || 'unknown',
        directionSource: movement?.sourceMeta?.directionSource || 'unknown',
        amountAudit: movement?.sourceMeta?.amountAudit || null,
        deltaReason:
          ['semantic_fallback', 'keyword_fallback', 'signed_amount'].includes(movement?.sourceMeta?.directionSource)
            ? 'direction_fallback'
            : movement?.parseConfidence < 70
              ? 'low_confidence'
              : '',
      },
    },
  }

  return row
}
