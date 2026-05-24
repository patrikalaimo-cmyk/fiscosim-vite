# Riconciliazione bancaria - Working View UX (ispirata a Import Contabilita)

## Obiettivo

Definire una Working View operativa che trasformi un movimento bancario in una decisione di riconciliazione pronta, senza commit contabile reale in questa fase.

Flusso guida:
movimento bancario
-> classificazione tipo movimento
-> eventuale match partitario
-> proposta prima nota
-> eventuale effetto IVA per cassa
-> eventuale effetto ritenuta/percipiente
-> audit/confidence
-> stato ready_to_post

## 1) Obiettivo della Working View

La Working View e l ambiente operativo per passare da movimento importato a decisione verificata.

In questa fase non esegue:
- commit;
- prima nota reale;
- chiusura partitario reale;
- movimenti IVA reali;
- movimenti ritenute reali.

Produce una decisione staging auditata.

## 2) Relazione con Import Contabilita

### Cosa si riprende
- layout working view a blocchi;
- tab Documento originale;
- tab Audit;
- blocchi di proposta;
- stati readiness;
- UX table-first;
- operatore sempre confermante.

### Cosa NON si copia
- logica fattura XML;
- IVA ordinaria da documento;
- anagrafiche da XML;
- creazione documento_contabilita da fattura;
- causali FF/FC/RP da documento importato.

## 3) Apertura Working View

Modalita previste:
- click riga working table;
- pulsante Apri working view dal dettaglio;
- doppio click riga (opzionale);
- mantenimento selezione movimento corrente;
- ritorno alla tabella senza perdere stato/posizione.

## 4) Header movimento

Header alto sempre visibile con:
- data operazione;
- data valuta;
- importo;
- direction in/out;
- descrizione banca raw;
- descrizione normalizzata;
- conto banca selezionato;
- banca/IBAN documento;
- stato movimento;
- confidence;
- badge stato:
  - da classificare
  - match trovato
  - review
  - pronto
  - bloccato
  - corretto manualmente

## 5) Layout generale

Layout consigliato (ispirato a Import Contabilita):

### Area sorgente (sinistra)
- dati movimento;
- raw row;
- documento originale;
- audit parsing estrazione.

### Area operativa (centrale/destra)
- classificazione;
- match partitario;
- proposta prima nota;
- effetti fiscali collegati;
- readiness;
- azioni.

Alternativa equivalente:
- struttura a tab principali, mantenendo coerenza table-first.

## 6) Tab previste

Tab minime:
- Tab Movimento
- Tab Documento originale
- Tab Match partitario
- Tab Proposta Prima Nota
- Tab Effetti fiscali
- Tab Audit / Decisione

## 7) Tab Movimento

Contenuti:
- dati grezzi movimento;
- dati normalizzati;
- causale bancaria (se presente);
- CRO/TRN/reference (se presenti);
- controparte bancaria;
- IBAN controparte;
- rawText;
- pageNumber;
- source row;
- correction audit (se corretto).

Azioni:
- modifica staging auditata;
- segna verificato;
- marca da classificare;
- apri documento originale.

## 8) Tab Documento originale

Contenuti:
- PDF originale;
- pagina movimento;
- rawText collegato;
- vista ampia;
- warning se file non disponibile dopo refresh.

Regola:
- nessuna rielaborazione sostitutiva del documento originale.

## 9) Tab Match partitario

Cuore riconciliazione: lista candidati partitario.

Colonne/attributi candidati:
- soggetto cliente/fornitore;
- tipo soggetto;
- numero documento;
- data documento;
- scadenza;
- importo originario;
- residuo aperto;
- importo movimento;
- differenza;
- confidence;
- motivi match;
- stato partita.

Azioni:
- accetta match;
- cambia partita;
- nessun match;
- match parziale;
- split pagamento (futuro);
- pagamento cumulativo (futuro);
- classifica senza partitario.

## 10) Motivi match

Motivi esplicabili in UI:
- importo identico;
- importo vicino;
- stesso soggetto;
- IBAN/controparte coerente;
- descrizione contiene numero documento;
- descrizione contiene ragione sociale;
- data/scadenza vicina;
- storico riconciliazioni precedenti;
- causale bancaria ricorrente.

## 11) Tab Proposta Prima Nota

Mostra bozza scrittura (non commit).

Casi minimi:

A. Incasso cliente
- Dare: Banca
- Avere: Cliente

B. Pagamento fornitore
- Dare: Fornitore
- Avere: Banca

C. Spese bancarie
- Dare: Spese bancarie / conto costo
- Avere: Banca

D. Giroconto
- Dare: banca destinazione
- Avere: banca origine

E. F24 rilevato
- Dare: debiti tributari/previdenziali da dettagliare
- Avere: banca

F. Da classificare
- Nessuna PN pronta.

Campi esposti:
- causale contabile bancaria;
- descrizione PN;
- conto dare;
- conto avere;
- importo;
- quadratura;
- readiness.

## 12) Causali riconciliazione

Causali bancarie ammesse:
- IC (incasso cliente)
- PF (pagamento fornitore)
- PP (pagamento parcella/professionista)
- SB (spese bancarie)
- GC (giroconto)
- F24 (pagamento F24)
- ALTRO (da classificare)

Regola:
- vietato usare FF/FC come causali bancarie.

## 13) Tab Effetti fiscali

La riconciliazione non genera IVA ordinaria da documento.

Gestisce effetti connessi all incasso/pagamento:

### A. IVA per cassa
- incasso cliente IVA per cassa -> IVA esigibile;
- pagamento fornitore IVA per cassa -> IVA detraibile;
- collegamento a documento/partita registrata;
- importo IVA liberata;
- periodo liquidazione.

### B. Ritenute/percipiente
- pagamento parcella;
- ritenuta da pagare o gia pagata;
- collegamento percipiente;
- causale CU;
- tributo F24;
- scadenza.

### C. Partitario
- chiusura totale;
- chiusura parziale;
- residuo;
- differenza/abbuono futuro.

## 14) Tab Audit / Decisione

Mostra:
- stato decisione;
- campi mancanti;
- blocchi;
- warning;
- confidence complessiva;
- origine proposta:
  - regola studio
  - storico cliente
  - storico banca
  - match partitario
  - operatore
  - AI futura opzionale

Log decisionale:
- proposta iniziale;
- modifiche operatore;
- scelta finale;
- timestamp;
- utente se disponibile.

## 15) Stati movimento

Stati previsti:
- imported
- needs_review
- verified
- classified
- matched
- ready_to_post
- blocked
- ignored
- posted (futuro)
- deleted (futuro)

Nota:
- posted/deleted non operativi in questa fase.

## 16) Readiness

Condizioni minime per ready_to_post:
- movimento valido;
- conto banca coerente selezionato;
- tipo movimento definito;
- proposta PN quadrata;
- conto dare/avere presenti;
- se match partitario richiesto, match confermato;
- se IVA per cassa, documento collegato;
- se ritenuta, percipiente/partita collegati;
- nessun blocco audit.

## 17) Blocchi

Blocchi obbligatori:
- movimento senza importo/data/direction;
- conto banca non associato;
- mismatch conto documento/selezionato non risolto (se policy bloccante);
- proposta PN non quadrata;
- conto dare/avere mancante;
- IVA per cassa senza documento collegato;
- ritenuta senza percipiente/partita collegata;
- movimento duplicato;
- statement audit bloccante.

## 18) Warning non bloccanti

Esempi warning:
- bassa confidence;
- descrizione bancaria poco chiara;
- partite candidate multiple;
- importo vicino ma non identico;
- documento originale non disponibile dopo refresh;
- movimento corretto manualmente;
- template parsing non certificato pieno.

## 19) Azioni principali

Azioni principali in Working View:
- Accetta proposta
- Modifica classificazione
- Cambia match
- Nessun match
- Classifica come spesa bancaria
- Classifica come giroconto
- Classifica come F24
- Segna pronto
- Rimanda / lascia in review
- Ignora movimento
- Apri documento originale
- Torna alla tabella

## 20) Azioni massive future

Solo concetto (non implementazione in fase corrente):
- applica classificazione a simili;
- applica conto a simili;
- accetta tutti i match alta confidenza;
- marca come review;
- escludi duplicati.

Vincolo:
- ogni azione massiva futura deve avere audit + conferma.

## 21) Relazione con storico/suggerimenti

Origine proposta visualizzata in UI da:
- anagrafica/impostazioni esplicite;
- regole studio;
- storico cliente;
- storico generale studio;
- pattern descrizione bancaria;
- storico banca;
- storico partitario;
- correzioni operatore;
- AI futura opzionale.

Priorita suggerita:
1. anagrafica/impostazioni esplicite
2. regole studio
3. storico cliente
4. storico generale studio
5. pattern documento/banca
6. AI opzionale
7. fallback prudente

## 22) Tipi movimento minimi

Tipi minimi:
- customer_collection
- supplier_payment
- professional_payment
- bank_fee
- f24_payment
- giroconto
- financing_payment
- payroll
- tax_or_social_security
- unknown_to_classify

## 23) Output decisione

La Working View produce una struttura concettuale reconciliationDecision:

{
  movementId,
  decisionType,
  movementType,
  selectedMatch,
  accountingProposal,
  ledgerProposal,
  cashVatImpact,
  withholdingPaymentProposal,
  selectedBankAccount,
  confidence,
  readiness,
  blockers,
  warnings,
  auditTrail,
  operatorDecisions
}

## 24) Nessun commit in questa fase

Vincolo esplicito:
- nessuna scrittura DB;
- nessuna prima nota reale;
- nessuna chiusura partitario reale;
- nessuna IVA per cassa reale;
- nessuna ritenuta reale;
- solo decisione staging.

## 25) UX con molti movimenti

La Working View deve supportare:
- salva e torna alla tabella;
- prossimo movimento;
- movimento precedente;
- filtro solo da lavorare;
- conservazione posizione in working table;
- aggiornamento stato immediato in tabella;
- badge stato immediati.

## 26) Esempi operativi

A. Incasso cliente con match perfetto
- movementType: customer_collection
- match: documento cliente aperto identico
- proposta: Dare banca / Avere cliente
- esito: ready_to_post

B. Pagamento fornitore con match perfetto
- movementType: supplier_payment
- match: partita fornitore aperta
- proposta: Dare fornitore / Avere banca
- esito: ready_to_post

C. Spesa bancaria senza partitario
- movementType: bank_fee
- match: nessuno
- proposta: Dare spese bancarie / Avere banca
- esito: ready_to_post con warning basso

D. F24 rilevato ma da dettagliare
- movementType: f24_payment
- proposta base presente
- blocco: dettaglio tributi insufficiente
- esito: needs_review/blocked

E. Giroconto banca-banca
- movementType: giroconto
- proposta: Dare banca destinazione / Avere banca origine
- esito: ready_to_post se conti coerenti

F. Pagamento parcella con ritenuta
- movementType: professional_payment
- proposta PN + withholdingPaymentProposal
- blocco se percipiente non collegato

G. Incasso IVA per cassa
- movementType: customer_collection
- match documento IVA cassa
- cashVatImpact valorizzato
- ready_to_post solo se collegamento documento valido

## 27) Roadmap implementativa

- R6D-SPEC - Working View UX
- R7A - mock dati partitario/match candidates
- R7B - Match partitario base
- R7C - Prima Nota proposal mock
- R7D - Effetti IVA per cassa/ritenute mock
- R7E - readiness movement
- R8 - mapper riconciliazione canonical
- R9 - commit reale
- R10 - hardening

## Note di perimetro

Documento solo UX/funzionale. Nessun codice operativo, parser, UI reale, DB/API, mapper canonico o commit contabile e stato implementato in questa fase.
