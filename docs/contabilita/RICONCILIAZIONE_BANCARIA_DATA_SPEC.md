# Riconciliazione bancaria — Data Spec FiscoSim

## 1. Scopo
Questa specifica definisce le strutture dati operative del modulo Riconciliazione bancaria prima dello sviluppo della UI e del codice applicativo.

Il modulo dovrà produrre dati compatibili, in futuro, con:

`bankMovement + reconciliationDecision`
→ `mapBankReconciliationToCanonical()`
→ `validateCanonicalAccountingPayload()`
→ commit canonico

## 2. Principi dati
- `bankMovement` è il dato estratto dalla banca;
- `reconciliationDecision` è la decisione contabile;
- `accountingProposal` è la proposta di Prima Nota;
- `ledgerProposal` è la proposta partitario;
- `cashVatImpact` è l'effetto IVA per cassa;
- `withholdingPaymentProposal` è l'effetto ritenuta da pagamento;
- nessuna struttura deve implicare commit automatico;
- solo decisioni confermate possono arrivare al mapper canonico.

## 3. bankStatement
```js
bankStatement = {
  statementId,
  companyId,
  bankAccountId,
  bankName,
  iban,
  accountCode,
  sourceFile,
  sourceFileHash,
  importedAt,
  importedBy,
  periodStart,
  periodEnd,
  openingBalance,
  closingBalance,
  calculatedClosingBalance,
  balanceDifference,
  currency,
  parseConfidence,
  status,
  warnings,
  errors,
  movements,
}
```

Campi minimi:
- `statementId`
- `companyId`
- `bankAccountId`
- `periodStart`
- `periodEnd`
- `openingBalance`
- `closingBalance`
- `currency`
- `status`
- `movements`

## 4. bankMovement
```js
bankMovement = {
  movementId,
  statementId,
  rowIndex,
  bankAccountId,
  operationDate,
  valueDate,
  descriptionRaw,
  descriptionNormalized,
  amount,
  direction,
  currency,
  bankCausal,
  reference,
  cro,
  transactionId,
  counterpartyName,
  counterpartyIban,
  dedupKey,
  duplicateStatus,
  parseConfidence,
  status,
  sourceMeta,
}
```

Regola importi:
- `amount` sempre positivo;
- `direction` = `in` | `out`;
- `signedAmount` eventualmente derivabile, ma non primario.

Campi minimi:
- `movementId`
- `statementId`
- `operationDate`
- `amount`
- `direction`
- `currency`
- `status`

## 5. movementStatus
- `imported`: movimento importato e non ancora analizzato; selezionabile no; committabile no; richiede decisione operatore sì.
- `duplicate`: duplicato certo o probabile; selezionabile no; committabile no; richiede decisione operatore sì.
- `unmatched`: nessun match proposto; selezionabile sì; committabile no finché non c'è proposta.
- `suggested`: esiste una proposta automatica; selezionabile sì; committabile solo dopo conferma.
- `ready`: pronto per conferma o commit controllato; selezionabile sì; committabile sì.
- `blocked`: blocco contabile/fiscale reale; selezionabile sì per revisione; committabile no.
- `ignored`: escluso volutamente; selezionabile sì per ripristino; committabile no.
- `suspended`: sospeso in attesa di dati o verifica; selezionabile sì; committabile no.
- `registered`: già registrato o confermato; selezionabile no; committabile no.

## 6. reconciliationDecision
```js
reconciliationDecision = {
  decisionId,
  movementId,
  decisionType,
  targetType,
  status,
  confidence,
  operatorConfirmed,
  confirmedAt,
  confirmedBy,
  matchedPrimaNota,
  matchedOpenItems,
  matchedDocumentiContabilita,
  matchCandidates,
  accountingProposal,
  ledgerProposal,
  withholdingPaymentProposal,
  cashVatImpact,
  attachments,
  blockingReasons,
  warnings,
  audit,
}
```

Regole:
- una sola decisione attiva confermata per movimento;
- decisioni duplicate/sospese/ignorate non vanno a commit;
- decisione non confermata non va a commit.

## 7. decisionType
- `link_existing_prima_nota`: collega una PN esistente; crea PN no; chiude partitario no; attiva ritenute no; attiva IVA per cassa no; committabile sì se confermata.
- `create_prima_nota`: crea PN; chiude partitario no; ritenute no; IVA per cassa no; committabile sì se valida.
- `create_prima_nota_and_close_open_item`: crea PN e chiude partita; ritenute no; IVA per cassa no; committabile sì.
- `create_prima_nota_close_item_and_cash_vat`: crea PN, chiude partita, attiva IVA per cassa; committabile sì solo se documento collegato e quota coerente.
- `create_prima_nota_and_withholding_payment`: crea PN e ritenuta da pagamento; committabile sì se dati percipiente e ritenuta sono completi.
- `create_prima_nota_withholding_and_cash_vat`: crea PN, ritenuta da pagamento e IVA per cassa; committabile sì solo se entrambe le sezioni sono valide.
- `create_prima_nota_giroconto`: crea PN per giroconto; chiude partitario no salvo regola specifica; committabile sì se pair coerente.
- `create_prima_nota_f24_detail`: crea PN per F24/dettaglio debiti; committabile sì se debito coerente.
- `ignore`: crea PN no; chiude partitario no; ritenute no; IVA per cassa no; committabile no.
- `suspend`: crea PN no; chiude partitario no; ritenute no; IVA per cassa no; committabile no.
- `duplicate`: crea PN no; chiude partitario no; ritenute no; IVA per cassa no; committabile no.

## 8. matchCandidate
```js
matchCandidate = {
  candidateId,
  candidateType,
  targetId,
  score,
  confidence,
  reasons,
  amountMatched,
  amountDifference,
  dateDifferenceDays,
  counterpartyMatch,
  invoiceNumberMatch,
  ibanMatch,
  alreadyUsed,
  blockingReasons,
}
```

`candidateType`:
- `open_item`
- `prima_nota`
- `documento_contabilita`
- `bank_movement_giroconto`
- `rule_based_account`
- `f24_debt`
- `withholding_debt`

## 9. accountingProposal
```js
accountingProposal = {
  enabled,
  causaleContabileId,
  causaleContabileCode,
  description,
  registrationDate,
  rows,
  totals,
  isBalanced,
  blockingReasons,
  warnings,
}
```

`rows`:
- `accountId`
- `accountCode`
- `accountName`
- `debit`
- `credit`
- `description`
- `subjectId`
- `sourceRole`

Regola:
- ogni movimento committabile deve avere `accountingProposal` valido oppure `matchedPrimaNota` esistente;
- nessun movimento può modificare conti senza PN.

## 10. ledgerProposal
```js
ledgerProposal = {
  enabled,
  mode,
  subjectId,
  patrimonialAccountId,
  rows,
  blockingReasons,
  warnings,
}
```

`mode`:
- `none`
- `close`
- `open`
- `mixed`

`rows`:
- `action`
- `openItemId`
- `documentId`
- `documentNumber`
- `amount`
- `residualBefore`
- `residualAfter`
- `dueDate`
- `paymentDate`

Regole:
- pagamento/incasso fatture deve chiudere partita coerente;
- chiusura parziale deve lasciare residuo;
- importo chiusura non può superare residuo salvo gestione differenza;
- non chiudere due volte la stessa partita.

## 11. withholdingPaymentProposal
```js
withholdingPaymentProposal = {
  enabled,
  recipientId,
  recipientFiscalCode,
  documentId,
  paymentDate,
  rows,
  f24DueDate,
  blockingReasons,
  warnings,
}
```

`rows`:
- `baseAmount`
- `rate`
- `withholdingAmount`
- `netPaid`
- `causaleCu`
- `tributeCode`
- `period`

Regole:
- codice fiscale percipiente obbligatorio;
- pagamento parcella può attivare ritenuta da pagamento;
- non generare F24 definitivo in prima fase, ma predisporre dati e scadenziario futuro.

## 12. cashVatImpact
```js
cashVatImpact = {
  enabled,
  documentId,
  vatRegisterRowId,
  type,
  paymentAmount,
  documentGross,
  ratio,
  vatTotal,
  vatAlreadyReleased,
  vatToRelease,
  liquidationPeriod,
  isPartial,
  blockingReasons,
  warnings,
}
```

`type`:
- `sale_collection`
- `purchase_payment`

Regole:
- attivo solo per documenti IVA per cassa;
- non registra IVA ordinaria;
- non duplica registri IVA documento;
- calcola quota IVA da rilasciare su incasso/pagamento;
- pagamento/incasso parziale deve generare quota proporzionale;
- se IVA già interamente rilasciata, blocco;
- se manca documento collegato, blocco.

## 13. girocontoPair
```js
girocontoPair = {
  sourceMovementId,
  targetMovementId,
  sourceBankAccountId,
  targetBankAccountId,
  amount,
  dates,
  confidence,
  status,
  blockingReasons,
}
```

Regole:
- evitare doppia registrazione;
- preferire PN unica;
- se manca movimento gemello, warning o blocco secondo policy.

## 14. postCommitTargets per riconciliazione
```js
postCommitTargets = {
  shouldCreateDocumentiContabilita: false,
  shouldCreatePrimaNota: true,
  shouldCreateIva: Boolean(cashVatImpact.enabled),
  shouldCreateLedger: Boolean(ledgerProposal.enabled),
  shouldCreateWithholding: Boolean(withholdingPaymentProposal.enabled),
  shouldCreateScadenziario: Boolean(withholdingPaymentProposal.enabled),
  shouldAttachSourceDocument: Boolean(statement/source attachment),
  shouldUpdateAuditTrail: true,
}
```

`shouldCreateIva` significa solo IVA per cassa, mai IVA ordinaria da documento.

## 15. Mapping futuro verso `canonicalAccountingPayload`
- `source` da `bankMovement`, `bankStatement`, `reconciliationDecision`;
- `company` da `bankStatement` e contesto societario;
- `fiscalContext` da `operationDate`, `decisionType`, `cashVatImpact`;
- `subjects` da controparte, partita, percipiente, banca;
- `document` da documenti collegati, non da nuova fattura;
- `accounting` da `accountingProposal`;
- `ledger` da `ledgerProposal`;
- `withholding` da `withholdingPaymentProposal`;
- `vat` da `cashVatImpact` solo per IVA per cassa;
- `attachments` da estratto conto e file sorgente;
- `audit` da decisione operatore;
- `postCommitTargets` da decisione.

## 16. Regole minime di validazione
Blocchi:
- movement senza conto banca collegato;
- decision non confermata;
- accountingProposal mancante se non c'è matchedPrimaNota;
- PN non quadrata;
- ledger close senza openItem;
- withholding senza CF percipiente;
- cashVatImpact senza documento IVA per cassa;
- cashVatImpact con quota incoerente;
- duplicato certo;
- giroconto senza pair coerente;
- F24 senza conti/debiti minimi;
- payload canonico non validabile.

## 17. Campi per working table
- `status`
- `operationDate`
- `valueDate`
- `descriptionRaw`
- `descriptionNormalized`
- `amount`
- `direction`
- `counterpartyName`
- `decisionType`
- `matchConfidence`
- `proposedAction`
- `accountingAccount`
- `openItem`
- `cashVatFlag`
- `withholdingFlag`
- `blockingReason`
- `readyForCommit`

## 18. Campi per working view
- movimento originale;
- match candidates;
- accounting proposal;
- ledger proposal;
- withholding proposal;
- cash VAT impact;
- giroconto pair;
- audit decision.

## 19. Rischi e scelte prudenziali
- non sovra-automatizzare F24;
- non forzare pagamenti cumulativi in prima release;
- `cashVatImpact` obbligatoriamente tracciato;
- nessun commit senza decisione confermata;
- performance su molti movimenti prioritaria;
- deduplica robusta.
