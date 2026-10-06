# Riconciliazione bancaria — UX funzionale FiscoSim

## 1. Obiettivo del modulo
Il modulo di riconciliazione bancaria serve a:
- importare estratti conto bancari;
- leggere e normalizzare i movimenti;
- deduplicare le righe importate;
- proporre match con partite aperte;
- proporre prima nota automatica o guidata;
- chiudere il partitario;
- gestire movimenti senza documento o senza match;
- produrre in futuro output canonico verso `canonicalAccountingPayload`.

## 2. Principi UX
- working table centrale e sempre dominante;
- operatore sempre in controllo;
- suggerimenti automatici ma conferma umana;
- blocchi solo per errori contabili reali;
- azioni massive sempre disponibili sui movimenti selezionati;
- filtri potenti ma leggibili;
- stati chiari e coerenti;
- nessuna scrittura contabile automatica non confermata;
- niente commit parziali incoerenti.

## 3. Flusso operativo
1. selezione societa e conto banca;
2. import estratto conto;
3. parsing movimenti;
4. deduplica;
5. controllo saldi;
6. auto-match con partitario;
7. classificazione movimenti senza match;
8. revisione working table;
9. apertura working view per casi dubbi;
10. conferma movimenti selezionati;
11. generazione futura payload canonico;
12. commit controllato verso prima nota e partitario.

## 3B. Regola contabile fondamentale
Ogni movimento bancario confermato deve:
- creare una nuova Prima Nota;
- oppure collegarsi a una Prima Nota gia esistente;
- oppure proporre una Prima Nota da confermare.

La riconciliazione non crea registri IVA da documento e non registra IVA ordinaria.
Può però aggiornare l'effetto IVA per cassa quando l'incasso o il pagamento rende esigibile o detraibile l'IVA collegata a un documento già registrato.

## 3C. Ambito contabile del modulo
Il modulo può alimentare:
- Prima Nota;
- Partitario clienti / fornitori / professionisti;
- Percipienti / Ritenute in caso di pagamento parcelle;
- Scadenziario ritenute / F24 ritenute, in fase futura;
- IVA per cassa, solo come rilascio o sblocco della quota collegata a incasso o pagamento;
- Liquidazione IVA, solo per la quota IVA per cassa resa esigibile o detraibile;
- Audit;
- Allegati del movimento / estratto conto.

Il modulo NON deve:
- creare fatture;
- registrare IVA ordinaria da documento;
- duplicare righe registri IVA già generate da Import o Manuale;
- modificare liquidazioni IVA fuori dal caso IVA per cassa;
- generare LIPE o IVA annuale direttamente.

## 4. Formati importabili
### XLS/XLSX
- Affidabilita attesa: alta.
- Rischi: colonne variabili, formati data/numero.
- Dati minimi estraibili: date, importi, descrizioni, saldo, IBAN o conto.

### CSV
- Affidabilita attesa: medio-alta.
- Rischi: separatori diversi, encoding, intestazioni incoerenti.
- Dati minimi estraibili: date, importi, descrizioni, saldo, conto.

### PDF
- Affidabilita attesa: media.
- Rischi: OCR imperfetto, tabelle spezzate, righe mancanti.
- Dati minimi estraibili: date, importi, descrizioni, saldo, riferimenti.

### Immagini / scansioni
- Affidabilita attesa: media-bassa.
- Rischi: OCR, tagli, rumore, orientamento.
- Dati minimi estraibili: date, importi, descrizioni, saldo se leggibile.

### CAMT / XML
- Affidabilita attesa: molto alta.
- Rischi: mapping tecnico, varianti bancarie.
- Dati minimi estraibili: tutte le coordinate bancarie e i movimenti strutturati.

## 5. Dati minimi movimento bancario
`bankMovement` concettuale:

```js
bankMovement = {
  bankAccountId,
  bankName,
  iban,
  statementId,
  statementPeriod,
  rowId,
  operationDate,
  valueDate,
  descriptionRaw,
  descriptionNormalized,
  amount,
  direction,
  currency,
  bankCausal,
  reference,
  counterpartyName,
  counterpartyIban,
  dedupKey,
  sourceFile,
  parseConfidence,
  status,
}
```

## 6. Card superiori
### Card 1 — Import & Stato banca
- banca / conto;
- periodo estratto;
- file caricato;
- saldo iniziale;
- saldo finale;
- saldo calcolato;
- differenza saldo;
- stato import.

### Card 2 — Match / Proposte
- movimenti totali;
- abbinati automaticamente;
- proposte forti;
- proposte deboli;
- senza proposta;
- duplicati sospetti;
- bloccati.

### Card 3 — Azioni contabili
- prime note pronte;
- partite da chiudere;
- movimenti da classificare;
- F24 rilevati;
- commissioni bancarie;
- giroconti rilevati;
- movimenti ignorati o sospesi.

## 7. KPI principali
- movimenti importati;
- da riconciliare;
- abbinati;
- proposte forti;
- bloccati;
- registrati;
- differenza saldo.

## 8. Working table
Colonne previste:
- selezione;
- stato;
- data operazione;
- data valuta;
- conto banca;
- descrizione banca;
- controparte rilevata;
- entrata;
- uscita;
- causale bancaria;
- match proposto;
- affidabilita match;
- conto contabile proposto;
- azione proposta;
- esito;
- anteprima / dettaglio.

La tabella deve essere virtualizzata e performante su volumi elevati.

## 9. Stati riga
### imported
- Significato: movimento importato e non ancora analizzato.
- Visual: neutro.
- Azioni: analizza, ignora, sospendi.
- Selezionabile per commit: no.

### duplicate
- Significato: duplicato certo o altamente probabile.
- Visual: rosso / ambra.
- Azioni: conferma duplicato, rianalizza.
- Selezionabile per commit: no.

### unmatched
- Significato: nessun match proposto.
- Visual: giallo.
- Azioni: classifica, abbina manualmente.
- Selezionabile per commit: no.

### suggested
- Significato: esiste una proposta automatica.
- Visual: blu.
- Azioni: conferma, cambia proposta.
- Selezionabile per commit: si, se confermata.

### ready
- Significato: pronto per conferma o commit controllato.
- Visual: verde.
- Azioni: conferma, escludi, modifica.
- Selezionabile per commit: si.

### blocked
- Significato: blocco contabile/fiscale reale.
- Visual: rosso forte.
- Azioni: correggi dati, rianalizza.
- Selezionabile per commit: no.

### ignored
- Significato: escluso volutamente dall'operatore.
- Visual: grigio.
- Azioni: ripristina.
- Selezionabile per commit: no.

### suspended
- Significato: sospeso in attesa di dati o verifica.
- Visual: viola / arancio tenue.
- Azioni: riprendi, modifica, rianalizza.
- Selezionabile per commit: no.

### registered
- Significato: già registrato o confermato.
- Visual: verde scuro.
- Azioni: apri dettaglio, annulla eventuale bozza futura.
- Selezionabile per commit: no.

## 10. Filtri
### Filtri rapidi
- tutti;
- da riconciliare;
- pronti;
- da verificare;
- bloccati;
- senza match;
- duplicati;
- registrati;
- entrate;
- uscite.

### Filtri avanzati
- periodo;
- banca / conto;
- importo da / a;
- descrizione contiene;
- controparte;
- causale bancaria;
- conto contabile;
- tipo movimento;
- affidabilita proposta;
- stato;
- solo movimenti con partite aperte;
- solo movimenti senza match.

## 11. Tipologie movimento
- incasso cliente;
- pagamento fornitore;
- commissione bancaria;
- imposta di bollo;
- F24;
- giroconto;
- POS / carte;
- stipendio;
- affitto / canone;
- mutuo / finanziamento;
- interessi attivi / passivi;
- movimento da sospendere;
- movimento da ignorare.

## 12. Matching partitario
Regole di proposta:
- importo esatto;
- importo vicino;
- data scadenza;
- data documento;
- numero fattura in descrizione;
- denominazione controparte;
- IBAN controparte;
- storico scelte operatore;
- direzione movimento;
- tipo soggetto cliente / fornitore.

Confidence:
- alta;
- media;
- bassa.

Nessun match deve essere confermato senza controllo quando la confidence non e alta o quando le regole non sono certe.

## 12B. Tipi di effetto contabile
Un movimento può produrre:
- Prima Nota semplice;
- Prima Nota + chiusura partitario;
- Prima Nota + chiusura partitario + rilascio IVA per cassa;
- Prima Nota + chiusura partitario + ritenuta da pagamento;
- Prima Nota + chiusura partitario + ritenuta da pagamento + eventuale IVA per cassa se applicabile;
- Prima Nota per giroconto;
- Prima Nota per F24 / debiti tributari / previdenziali;
- collegamento a Prima Nota esistente;
- sospensione / ignorato / duplicato senza commit.

## 13. Prima nota proposta
### Incasso cliente
- Banca Dare / Cliente Avere

### Pagamento fornitore
- Fornitore Dare / Banca Avere

### Commissione bancaria
- Spese bancarie Dare / Banca Avere

### Bollo / interessi / spese
- Conto costo Dare / Banca Avere

### Giroconto
- Banca destinataria Dare / Banca origine Avere

### F24
- trattare con prudenza;
- non automatizzare fiscalmente in prima fase;
- classificare come movimento da dettagliare;
- in futuro collegare a debiti tributari / previdenziali.

## 14. Working view movimento
### Sinistra
- dettaglio movimento bancario;
- anteprima estratto / file origine;
- testo originale;
- storico import.

### Destra
- proposta match;
- partite aperte candidate;
- scrittura PN proposta;
- chiusura partitario proposta;
- alternative;
- motivazione suggerimento;
- audit decisione operatore.

### Azioni
- conferma match;
- cambia partita;
- abbina a più partite;
- crea prima nota manuale guidata;
- classifica movimento;
- ignora;
- sospendi;
- segna duplicato;
- apri partita / documento collegato.

## 15. Azioni massive
- conferma selezionati pronti;
- abbina automaticamente proposte forti;
- ignora selezionati;
- sospendi selezionati;
- assegna conto contabile;
- assegna causale contabile;
- rianalizza selezionati;
- esporta tabella.

## 16. Deduplica
Dedup key:
- bankAccountId;
- operationDate;
- valueDate;
- amount;
- direction;
- descriptionNormalized;
- reference se presente;
- source hash se disponibile.

Gestione:
- duplicato certo;
- duplicato sospetto;
- non duplicato.

## 17. Controllo saldi
- saldo iniziale estratto;
- saldo finale estratto;
- saldo calcolato dai movimenti;
- differenza;
- blocco se differenza significativa;
- warning se differenza minima o arrotondamento.

## 18. Output canonico futuro
La riconciliazione non deve scrivere direttamente su Prima Nota.

Flusso futuro:

`bankMovement / reconciliationDecision`
→ `mapBankReconciliationToCanonical()`
→ `validateCanonicalAccountingPayload()`
→ commit canonico

`bankMovement` e `reconciliationDecision` sono distinti:
- `bankMovement` è il dato estratto dalla banca;
- `reconciliationDecision` è la decisione contabile;
- `cashVatImpact` esiste solo per documenti con IVA per cassa;
- solo decisioni confermate possono generare payload canonico.

Sezioni canoniche alimentabili:
- source;
- company;
- fiscalContext;
- subjects;
- document;
- accounting;
- ledger;
- attachments;
- audit;
- postCommitTargets.

### reconciliationDecision

```js
reconciliationDecision = {
  movementId,
  decisionType,
  targetType,
  matchedPrimaNota,
  matchedOpenItems,
  matchedDocumentiContabilita,
  accountingProposal,
  ledgerProposal,
  withholdingPaymentProposal,
  cashVatImpact,
  confidence,
  operatorConfirmed,
  blockingReasons,
  warnings,
  audit,
}
```

### cashVatImpact

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
}
```

`cashVatImpact` esiste solo per documenti con IVA per cassa.

## 19. Regole di blocco
Bloccare se:
- banca / conto non collegato al piano conti;
- movimento duplicato certo;
- saldo estratto non torna oltre soglia;
- match con partitario incoerente;
- importo chiusura superiore al residuo senza gestione differenza;
- manca conto contabile per movimento senza partita;
- manca causale contabile per PN proposta;
- movimento confermato senza PN proposta o PN esistente collegata;
- decisione non confermata;
- pagamento fattura senza partita o documento coerente;
- pagamento parcella senza dati per ritenuta se richiesta;
- IVA per cassa indicata ma documento non collegato;
- IVA per cassa indicata ma importo già interamente rilasciato;
- IVA per cassa con pagamento parziale senza calcolo quota;
- tentativo di registrare IVA ordinaria da Riconciliazione;
- giroconto senza movimento gemello o conto banca destinatario / origine;
- F24 senza dettaglio minimo o conto debito coerente;
- payload canonico non validabile.

## 20. Roadmap sviluppo
- R0 UX funzionale;
- R0B hardening operativo contabile;
- R1 specifica dati `bankMovement` + `reconciliationDecision` + `cashVatImpact`;
- R2 mock UI;
- R3 import / parser base;
- R4 working table;
- R5 matching partitario + PN esistente;
- R6 working view;
- R7 mapper riconciliazione → canonico;
- R8 commit controllato;
- R9 automazioni avanzate / storico / AI.

## 21. Rischi e scelte prudenziali
- F24 non automatizzare subito;
- pagamenti cumulativi supportare ma non forzare in prima release;
- differenze / abbuoni / cambio in fase successiva;
- nessun commit automatico senza conferma;
- partitario come fonte essenziale per match;
- performance della tabella prioritaria.
