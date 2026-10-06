# Canonical Accounting Payload — FiscoSim

## 1. Scopo

`canonicalAccountingPayload` è il contratto unico e formale tra i moduli di ingresso di FiscoSim e il motore contabile.

Serve a evitare che Import Contabilità, Registrazione manuale, futura Riconciliazione bancaria e futuri Storni/Rettifiche producano formati diversi per la stessa operazione economico-contabile.

Il contratto deve essere il punto di convergenza per tutte le scritture destinate a:
- Prima Nota / Contabilità generale
- Registri IVA
- Partitario
- Ritenute / Percipienti
- Allegati / documenti origine
- Audit trail
- Scadenziario, se applicabile

---

## 2. Moduli sorgente ammessi

Sono ammessi come sorgenti canoniche:
- `import_contabilita`
- `registrazione_manuale`
- `riconciliazione_bancaria`
- `storno`
- `rettifica`
- `migrazione/legacy_bridge` solo se esplicitamente autorizzato e tracciato come eccezione

Ogni sorgente deve dichiarare chiaramente il proprio `source.module` e il proprio identificativo di origine.

---

## 3. Catena target canonica

La catena corretta deve essere sempre:

`Modulo ingresso`
→ `canonicalAccountingPayload`
→ `commit canonico`
→ `documenti_contabilita`
→ `prima_nota`
→ `prima_nota_righe`
→ `registri_iva` se applicabile
→ `partitario` se applicabile
→ `ritenute` / `scadenziario` se applicabile
→ `allegati` / `audit`

Il contratto canonico deve essere il solo punto di passaggio tra il modulo di origine e i target di persistenza.

---

## 4. Divieti legacy

Il nuovo flusso canonico NON deve basarsi su:
- `documenti_import` come archivio contabile finale
- `accounting_entries`
- `import_fatture` come motore contabile
- `import_nuovo`
- `import_unificato` come contratto contabile
- `DISUSO`
- servizi legacy che reinterpretano registrazioni fuori dal payload canonico

`documenti_import` può restare solo come staging/origine o archivio di ingresso, non come archivio contabile finale.

---

## 5. Struttura generale

```js
canonicalAccountingPayload = {
  schemaVersion,
  source,
  company,
  fiscalContext,
  header,
  subject,
  document,
  accounting,
  vat,
  ledger,
  withholding,
  attachments,
  audit,
  validation,
  postCommitTargets
}
```

---

## 6. Sezioni del payload

### 6.1 schemaVersion

**Scopo**  
Versionare il contratto e garantire compatibilità evolutiva.

**Campi principali**
- `schemaVersion`

**Obbligatori minimi**
- stringa versione, ad esempio `1.0.0`

**Opzionali**
- metadata di compatibilità o alias di contratto

**Note operative**
- ogni mapper deve dichiarare la versione che produce
- ogni validator deve verificare la versione supportata

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- futura Riconciliazione

---

### 6.2 source

**Scopo**  
Identificare il modulo di origine e la riga/documento che hanno generato il payload.

**Campi principali**
- `module`
- `sourceRowId`
- `sourceDocumentId`
- `sourceBatchId`
- `sourceMeta`

**Obbligatori minimi**
- `module`

**Opzionali**
- `sourceRowId`
- `sourceDocumentId`
- `sourceBatchId`
- `sourceMeta`

**Note operative**
- il source non deve essere ambiguo
- i bridge legacy devono essere marcati come tali

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- Riconciliazione bancaria futura
- Storni/Rettifiche future

---

### 6.3 company

**Scopo**  
Identificare la società e il contesto aziendale/fiscale di competenza.

**Campi principali**
- `societaId`
- `esercizioId`
- `periodoIva`
- `regime`

**Obbligatori minimi**
- `societaId`

**Opzionali**
- `esercizioId`
- `periodoIva`
- `regime`

**Note operative**
- la società è la chiave primaria del commit contabile
- l’esercizio/periodo IVA possono essere derivati se mancanti, ma devono essere tracciati

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- futura Riconciliazione

---

### 6.4 fiscalContext

**Scopo**  
Raccogliere tutte le informazioni fiscali e temporali necessarie a decidere i target contabili.

**Campi principali**
- `dataRegistrazione`
- `dataDocumento`
- `competenza`
- `periodoIva`
- `tipoOperazione`
- `tipoRegistro`
- `regimeIva`
- `reverseCharge`
- `splitPayment`
- `ivaPerCassa`
- `proRata`
- `ritenutaPresente`

**Obbligatori minimi**
- `dataRegistrazione`
- `dataDocumento` se il documento esiste

**Opzionali**
- tutti gli altri campi fiscali e di regime

**Note operative**
- questo blocco decide la destinazione verso IVA, partitario e ritenute

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- futura Riconciliazione

---

### 6.5 header

**Scopo**  
Contenere l’intestazione contabile generale e lo stato della registrazione.

**Campi principali**
- `causaleContabile`
- `descrizione`
- `protocollo`
- `numeroRegistrazione`
- `stato`
- `currency`
- `totals`

**Obbligatori minimi**
- `causaleContabile`
- `descrizione`
- `stato`

**Opzionali**
- `protocollo`
- `numeroRegistrazione`
- `currency`
- `totals`

**Note operative**
- l’header è il punto di aggancio della Prima Nota

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale

---

### 6.6 subject

**Scopo**  
Rappresentare tutte le anagrafiche contabili rilevanti senza فرضare un solo soggetto.

**Campi principali**
- `subjects`
- oppure `subject` come alias di compatibilità temporanea

**Obbligatori minimi**
- almeno un elemento in `subjects` quando il documento o il movimento coinvolge una o più controparti

**Struttura raccomandata**
```js
subjects: [
  {
    role,
    tipoSoggetto,
    anagraficaId,
    pianoContiIdPatrimoniale,
    denominazione,
    codiceFiscale,
    partitaIva,
    paese
  }
]
```

**Ruoli tipici**
- `primary`
- `counterparty`
- `bank`
- `withholdingRecipient`
- `other`

**Note operative**
- il soggetto documento può non coincidere con il soggetto partitario
- il percipiente può essere un soggetto diverso o un ruolo diverso
- la banca può essere un soggetto/asset contabile nei movimenti di pagamento
- il conto patrimoniale fornitore/cliente resta obbligatorio se si crea partitario

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- futura Riconciliazione

---

### 6.7 document

**Scopo**  
Contenere il documento origine e i suoi importi fiscali.

**Campi principali**
- `numeroDocumento`
- `dataDocumento`
- `tipoDocumento`
- `xmlOrigine`
- `allegato`
- `totals`
- `riferimentoDocumentoOrigine`

**Struttura raccomandata di `document.totals`**
```js
totals: {
  taxable,
  vat,
  gross,
  netPayable,
  withholding,
  socialSecurity,
  stampDuty,
  rounding,
  excluded,
  currency
}
```

**Obbligatori minimi**
- `totals.gross`
- `currency` oppure default operativo `EUR`
- `numeroDocumento` e `dataDocumento` se il documento è fiscale

**Note operative**
- `gross` = totale documento lordo
- `netPayable` = netto da pagare/incassare
- `withholding` = ritenuta
- `socialSecurity` = cassa previdenziale / contributi
- `stampDuty` = bollo
- `excluded` = importi esclusi / fuori campo se gestiti
- il documento non è la prima nota: è l’origine economico-fiscale

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- futura Riconciliazione

---

### 6.8 accounting

**Scopo**  
Contenere le righe contabili della Prima Nota e la quadratura Dare/Avere.

**Campi principali**
- `rows`
- `dare`
- `avere`
- `conto`
- `descrizione`
- `importo`
- `soggettoCollegato`
- `collegamentoRigaIva`
- `collegamentoPartitario`
- `quadratura`

**Obbligatori minimi**
- `rows`
- quadratura Dare/Avere

**Opzionali**
- collegamenti a IVA, partitario e soggetto

**Note operative**
- questo è il cuore contabile per `prima_nota` e `prima_nota_righe`

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- futura Riconciliazione

---

### 6.9 vat

**Scopo**  
Contenere il dettaglio IVA operativo e la sola fonte dati per i registri IVA.

**Campi principali**
- `rows`
- `registerType`
- `sezionale`
- `protocolNumber`
- `competencePeriod`
- `causaleIvaId`
- `causaleIva`
- `aliquota`
- `natura`
- `imponibile`
- `imposta`
- `detraibilitaPercent`
- `indetraibileAmount`
- `esigibilita`
- `splitPayment`
- `reverseCharge`
- `reverseChargeMode`
- `ivaPerCassa`
- `proRata`
- `autofattura`
- `integrazioneEstero`

**Obbligatori minimi**
- `rows` se la fiscalità IVA è applicabile

**Opzionali**
- tutti i campi di regime, protocollo e ripartizione

**Note operative**
- `vat.rows` è la fonte unica per i registri IVA
- ogni riga IVA deve mantenere i dati necessari per imposta, detraibilità e periodo

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale

---

### 6.10 ledger

**Scopo**  
Contenere le informazioni di partitario e gestione partite.

**Campi principali**
- `enabled`
- `mode`
- `accountId`
- `subjectId`
- `rows`

**Struttura raccomandata di `ledger.rows`**
```js
rows: [
  {
    action,
    documentRef,
    openItemId,
    amount,
    dueDate,
    paymentDate,
    residualAmount
  }
]
```

**Modalità ammesse**
- `open`
- `close`
- `mixed`
- `none`

**Obbligatori minimi**
- `mode`
- `accountId` o `subjectId` quando il partitario è richiesto

**Opzionali**
- `rows`
- `documentRef`
- `openItemId`
- `amount`
- `dueDate`
- `paymentDate`
- `residualAmount`

**Note operative**
- il ledger deve distinguere apertura, chiusura totale, chiusura parziale, movimento misto, pagamento/incasso cumulativo
- abbuoni, arrotondamenti e differenze cambio possono essere gestiti come casi futuri

**Moduli che oggi possono alimentarla**
- Registrazione manuale
- futura Riconciliazione
- Import Contabilità in parte

---

### 6.11 withholding

**Scopo**  
Contenere il calcolo e il contesto delle ritenute.

**Campi principali**
- `enabled`
- `eventType`
- `recipient`
- `rows`

**Struttura raccomandata di `withholding.rows`**
```js
rows: [
  {
    baseAmount,
    rate,
    amount,
    netPaid,
    causaleCu,
    paymentDate,
    dueDateF24,
    tributeCode,
    period
  }
]
```

**Obbligatori minimi**
- `enabled`
- `eventType`
- `recipient`
- `rows`

**Regole minime di compilazione**
- il codice fiscale del percipiente è obbligatorio
- la data pagamento è obbligatoria per generazione ritenuta da pagamento e/o F24
- la causale CU è obbligatoria o deve restare come placeholder con policy esplicita di warning/blocking

**Note operative**
- distinguere sempre ritenuta da documento/parcella e ritenuta da pagamento
- CU/770/F24/scadenziario possono essere target futuri, non devono essere generati automaticamente se non abilitati dal target

**Moduli che oggi possono alimentarla**
- Registrazione manuale
- futura Riconciliazione

---

### 6.12 attachments

**Scopo**  
Contenere allegati e riferimenti al documento origine.

**Campi principali**
- `sourceFile`
- `xml`
- `pdf`
- `p7m`
- `hash`
- `storagePath`
- `metadata`

**Obbligatori minimi**
- nessuno assoluto, dipende dal source

**Opzionali**
- tutti i campi

**Note operative**
- se il target richiede allegato, la mancanza deve generare warning o blocking in base alla policy

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- futura Riconciliazione

---

### 6.13 audit

**Scopo**  
Tracciare origine, decisioni operatore e motivazioni del commit.

**Campi principali**
- `createdBy`
- `createdAt`
- `sourceModule`
- `sourceAction`
- `importBatch`
- `operatorDecisions`
- `warnings`
- `overrides`
- `reasons`

**Obbligatori minimi**
- `sourceModule`
- `createdAt`

**Opzionali**
- tutto il resto

**Note operative**
- ogni override manuale deve finire qui
- ogni ragione di proposta automatica deve essere tracciabile

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- futura Riconciliazione

---

### 6.14 validation

**Scopo**  
Raccogliere esito di validazione, blocchi, warning e readiness.

**Campi principali**
- `errors`
- `warnings`
- `blocking`
- `readiness`
- `quadratura`
- `completezzaDati`
- `targetValidabili`

**Obbligatori minimi**
- `blocking`
- `readiness`

**Opzionali**
- `errors`
- `warnings`
- `quadratura`
- `completezzaDati`
- `targetValidabili`

**Note operative**
- il validator canonico deve essere la sorgente di verità per l’idoneità al commit

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale

---

### 6.15 postCommitTargets

**Scopo**  
Indicare quali target devono essere creati o aggiornati dopo il commit canonico.

**Campi principali**
- `shouldCreateDocumentiContabilita`
- `shouldCreatePrimaNota`
- `shouldCreateIva`
- `shouldCreateLedger`
- `shouldCreateWithholding`
- `shouldCreateScadenziario`
- `shouldAttachSourceDocument`
- `shouldUpdateAuditTrail`

**Obbligatori minimi**
- tutti i flag, anche se a `false`

**Opzionali**
- nessuno: la sezione deve essere esplicita

**Note operative**
- ogni target acceso deve superare validazioni specifiche
- i target spenti non devono generare scritture collaterali

**Moduli che oggi possono alimentarla**
- Import Contabilità
- Registrazione manuale
- futura Riconciliazione

---

## 7. Campi minimi per target

### Prima Nota
Campi minimi:
- `company.societaId`
- `fiscalContext.dataRegistrazione`
- `header.causaleContabile`
- `header.descrizione`
- `accounting.rows`
- quadratura Dare/Avere

### Documenti Contabilità
Campi minimi:
- `company.societaId`
- `source`
- `document.numeroDocumento`, se documento fiscale
- `document.dataDocumento`, se documento fiscale
- `subjects` o `subject`, se presente
- `document.totals`

### Registri IVA
Campi minimi:
- `vat.rows`
- `vat.causaleIvaId` o `vat.causaleIva`
- `vat.imponibile`
- `vat.imposta`
- `vat.aliquota` / `vat.natura`
- `vat.registerType`
- `vat.competencePeriod`
- `vat.protocolNumber` se presente
- `vat.sezionale` se presente

### Partitario
Campi minimi:
- `subjects`
- almeno un soggetto con ruolo coerente
- `ledger.mode`
- `ledger.accountId` o `ledger.subjectId`
- `ledger.rows`
- `document` collegato
- `ledger.rows[].amount`
- `ledger.rows[].action`
- `ledger.rows[].dueDate`, se disponibile

### Ritenute
Campi minimi:
- `withholding.enabled`
- `withholding.eventType`
- `withholding.recipient`
- `withholding.recipient.codiceFiscale`
- `withholding.rows[].baseAmount`
- `withholding.rows[].rate`
- `withholding.rows[].amount`
- `withholding.rows[].netPaid`
- `withholding.rows[].causaleCu`, anche placeholder se non disponibile
- `withholding.rows[].paymentDate`, se pagamento
- `withholding.rows[].tributeCode` se previsto dalla policy fiscale

### Allegati / Audit
Campi minimi:
- `source.module`
- `source.sourceRowId` o identificativo equivalente
- file origine, se presente
- `audit.operatorDecisions`
- `audit.createdBy` / `audit.createdAt` se disponibili

---

## 8. Regole di validazione

- Se `postCommitTargets.shouldCreatePrimaNota = true`, `accounting.rows` deve essere presente e quadrata.
- Se `postCommitTargets.shouldCreateIva = true`, `vat.rows` deve essere presente e coerente.
- Se `postCommitTargets.shouldCreateLedger = true`, `subjects` e il conto patrimoniale devono essere presenti.
- Se `postCommitTargets.shouldCreateWithholding = true`, il codice fiscale del percipiente deve essere presente.
- Se `postCommitTargets.shouldAttachSourceDocument = true`, `attachments.source` deve essere presente o deve esistere una motivazione warning.
- Gli errori blocking impediscono il commit.
- I warning permettono il commit solo se non toccano campi obbligatori del target attivo.
- Gli override manuali devono essere registrati in `audit`.
- Il commit deve essere atomico o rollbackabile se un target essenziale fallisce.

---

## 8.1 Ordine di commit canonico

Ordine raccomandato:
1. validazione globale
2. `documenti_contabilita`
3. `prima_nota`
4. `prima_nota_righe`
5. `registri_iva`
6. `partitario`
7. `ritenute`
8. `scadenziario`
9. `attachments`
10. `audit`

Regole:
- evitare commit parziali incoerenti
- ogni target acceso in `postCommitTargets` deve avere validazione dedicata
- i target spenti non devono produrre effetti collaterali

---

## 9. Regole `postCommitTargets`

```js
postCommitTargets = {
  shouldCreateDocumentiContabilita,
  shouldCreatePrimaNota,
  shouldCreateIva,
  shouldCreateLedger,
  shouldCreateWithholding,
  shouldCreateScadenziario,
  shouldAttachSourceDocument,
  shouldUpdateAuditTrail
}
```

Semantica:
- ogni target può essere acceso o spento
- se acceso, deve superare le validazioni specifiche
- se spento, non deve essere prodotto nessun effetto collaterale su quel target
- i target devono essere indipendenti ma coerenti con il medesimo payload canonico

---

## 10. Mapping iniziale moduli esistenti

| Modulo | Stato attuale | Sezioni già coperte | Gap |
|---|---|---|---|
| Import Contabilità | Molto avanzato | source, company, fiscalContext, header, document, accounting, vat, ledger, validation, auditMeta | withholding non pienamente supportato, naming ancora import-specifico, bridge legacy |
| Registrazione manuale | Molto avanzato | header, accounting, vat, ledger, withholding, validation, draft finale | manca formalizzazione unica di `subjects` e contract schema dichiarato |
| Riconciliazione bancaria | Base reale presente | ledger/openItems, subject, movimenti bancari, match | manca payload canonico formale |
| Storni / Rettifiche future | Non ancora implementati come contratto | nessuna copertura canonica piena | serve spec + mapper dedicato |

---

## 11. Strategia implementativa futura

Sequenza raccomandata:
1. consolidare questa specifica
2. creare schema/defaults in file piccolo
3. creare validator base in file piccolo
4. creare mapper Registrazione manuale → canonico
5. creare mapper Import Contabilità → canonico
6. creare placeholder Riconciliazione → canonico
7. creare commit service canonico modulare
8. collegare prima solo Prima Nota
9. poi IVA
10. poi Partitario
11. poi Ritenute / Scadenziario
12. poi Allegati / Audit

---

## 12. Regola file piccoli

Ogni responsabilità futura deve stare in un file dedicato:
- schema
- defaults
- validator
- normalizer
- mapper manuale
- mapper import
- mapper riconciliazione
- commit prima nota
- commit IVA
- commit partitario
- commit ritenute
- commit allegati / audit

Non devono esistere file monolitici per il contratto.
Non deve esserci business logic in JSX.
`index.jsx` non deve essere appesantito da logica di mapping o commit.
Le view devono restare solo orchestrazione.
