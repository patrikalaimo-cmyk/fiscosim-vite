# Riconciliazione bancaria — UI Spec FiscoSim

## 1. Obiettivo UI
La UI della Riconciliazione bancaria deve essere coerente con Import Contabilità:
- dark navy / blu petrolio;
- header operativo;
- KPI;
- card superiori;
- filtri;
- working table centrale;
- pannello dettaglio laterale o working view;
- uso professionale da studio commercialista;
- massima velocita operativa.

## 2. Layout generale
Struttura raccomandata:
1. Header operativo
2. KPI strip
3. Tre card superiori
4. Toolbar filtri
5. Working table
6. Pannello laterale dettaglio movimento
7. Footer tabella / paginazione / totali

La working table deve restare l'elemento dominante.

## 3. Header operativo
Contenuti:
- Titolo: `Riconciliazione bancaria`
- Sottotitolo: `Importa, abbina e contabilizza movimenti bancari`
- Selettore Societa
- Selettore Conto banca
- Selettore Periodo
- Pulsanti:
  - `Carica estratto`
  - `Abbina automaticamente`
  - `Rianalizza selezionati`
  - `Conferma selezionati`
  - `Vai a`

Menu `Vai a`:
- Prima Nota
- Partitario
- Mastrini
- Piano dei Conti
- Import Contabilita
- Scadenziario
- Ritenute

## 4. KPI strip
KPI previsti:
- Movimenti importati
- Da riconciliare
- Proposte forti
- Pronti
- Bloccati
- Differenza saldo

Per ogni KPI:
- valore principale;
- valore secondario eventuale;
- colore / stato;
- click behavior futuro.

## 5. Card superiori
### Card 1 — Import & Stato banca
Campi:
- banca;
- IBAN;
- conto contabile banca collegato;
- periodo estratto;
- saldo iniziale;
- saldo finale estratto;
- saldo calcolato;
- differenza saldo;
- stato saldo: `OK` / `warning` / `blocked`.

Nota:
il controllo saldo deve essere molto visibile perché e il controllo contabile primario.

### Card 2 — Match / Proposte
Campi:
- abbinati;
- proposte forti;
- proposte deboli;
- senza match;
- duplicati sospetti;
- match con PN esistente;
- match con partitario;
- giroconti candidati.

### Card 3 — Azioni contabili
Campi:
- PN pronte;
- partite da chiudere;
- IVA per cassa da sbloccare;
- ritenute da generare;
- F24 rilevati / da dettagliare;
- giroconti da abbinare;
- movimenti sospesi.

Importante:
non usare la dicitura `F24 da generare`.
Usare:
- `F24 rilevati`
- oppure `F24 da dettagliare`

Motivo:
la riconciliazione vede il pagamento F24 e puo collegarlo a debiti, ma non deve generare automaticamente un modello F24 in questa fase.

## 6. Toolbar filtri
Filtri visibili:
- ricerca libera su descrizione / controparte / importo;
- stato;
- entrate / uscite;
- confidence;
- tipo movimento;
- IVA per cassa;
- ritenute;
- F24;
- giroconti;
- solo pronti;
- solo bloccati;
- solo senza match;
- filtri avanzati.

Filtri avanzati:
- data operazione da / a;
- data valuta da / a;
- importo da / a;
- banca / conto;
- causale bancaria;
- conto contabile proposto;
- partita aperta;
- PN collegata;
- documento collegato;
- decisionType;
- cashVatImpact;
- withholdingPaymentProposal.

## 7. Working table
Colonne definitive:
1. selezione
2. Stato
3. Data op.
4. Data valuta
5. Descrizione banca
6. Controparte
7. Entrata
8. Uscita
9. Match proposto
10. Confidence
11. Azione proposta
12. PN proposta / collegata
13. Partitario
14. IVA cassa
15. Ritenuta
16. Esito / blocco
17. Azioni

Note operative:
- tabella virtualizzata;
- righe dense ma leggibili;
- importi allineati a destra;
- stati con badge colorati;
- colonna descrizione ampia;
- click riga aggiorna pannello laterale;
- checkbox selezione massiva;
- footer con totali filtrati entrate / uscite.

## 8. Etichette contabili corrette
### Causali PN
Non usare `FF - FATTURA FORNITORE` per incassi / pagamenti bancari.

Causali corrette, configurabili da impostazioni:
- `IC` / Incasso cliente
- `PF` / Pagamento fornitore
- `PP` / Pagamento professionista / parcella
- `SB` / Spese bancarie
- `GC` / Giroconto
- `F24` / Pagamento F24
- altre causali da tabella impostazioni procedure

Nota:
`FF` e `FC` restano causali di registrazione fattura, non di movimento bancario.

### PN proposta / collegata
La colonna PN deve distinguere:
- PN da creare;
- PN già collegata;
- PN proposta;
- PN assente;
- PN bloccata.

### Partitario
Non mostrare solo ID numerici criptici.
Mostrare, quando possibile:
- numero documento;
- soggetto;
- residuo;
- stato chiusura.

Esempi:
- `FT 255 · saldo 0,00`
- `Parcella 124 · residuo 0,00`
- `Partita 1200`

## 9. Stati riga e badge
- Pronta: verde
- Suggerita: blu
- Da verificare: giallo
- Da dettagliare: ambra
- Da abbinare: ambra / blu
- Bloccata: rosso
- Duplicata: rosso / ambra
- Ignorata: grigio
- Sospesa: viola / arancio
- Registrata: verde scuro

Regola:
- solo `ready` / confermata puo andare a commit;
- `suggested` non confermata non deve committare;
- `blocked` / `duplicate` / `ignored` / `suspended` mai committabili.

## 10. Pannello laterale dettaglio
Il pannello laterale si aggiorna al click sulla riga.

### Movimento bancario
- data operazione;
- data valuta;
- descrizione originale;
- controparte;
- importo;
- direzione;
- causale bancaria;
- IBAN ordinante / beneficiario;
- riferimento / CRO / transactionId.

### Match proposto
- tipo match;
- documento / partita / PN collegata;
- importo;
- residuo;
- confidence;
- motivi del match;
- alternative.

### Prima Nota proposta
- tipo movimento;
- data registrazione;
- causale contabile corretta;
- descrizione;
- righe Dare / Avere;
- quadratura;
- PN esistente o PN da creare.

### Partitario
- soggetto;
- documento;
- partita aperta;
- importo chiusura;
- residuo prima / dopo;
- stato.

### IVA per cassa
Visibile solo se applicabile.

Campi:
- stato: non applicabile / da sbloccare / parziale / sbloccata / bloccata;
- documento collegato;
- tipo: incasso cliente / pagamento fornitore;
- importo incassato / pagato;
- totale documento;
- percentuale incasso / pagamento;
- IVA totale;
- IVA gia rilasciata;
- IVA da rilasciare;
- periodo liquidazione.

### Ritenuta
Visibile se applicabile.

Campi:
- stato: non applicabile / da generare / generata / bloccata;
- percipiente;
- codice fiscale;
- base ritenuta;
- aliquota;
- ritenuta;
- netto pagato;
- causale CU;
- tributo;
- scadenza F24 futura.

### Giroconto
Visibile se applicabile.

Campi:
- banca origine;
- banca destinazione;
- movimento gemello;
- confidence;
- rischio duplicazione;
- PN unica proposta.

### Audit decisione
- regola applicata;
- ID regola;
- confidence;
- operatore;
- ultimo aggiornamento;
- override;
- note.

## 11. Azioni nel pannello
Pulsanti principali:
- Conferma movimento
- Cambia match
- Apri in partitario
- Apri prima nota
- Sospendi
- Ignora
- Segna duplicato
- Rianalizza

Regole:
- Conferma movimento visibile solo se decisione validabile;
- se blocked, mostrare CTA `Risolvi blocco`;
- se F24, CTA `Dettaglia F24`;
- se giroconto, CTA `Abbina movimento gemello`;
- se IVA per cassa bloccata, CTA `Apri documento collegato`.

## 12. Specifiche per IVA per cassa
La UI deve rendere evidente che:
- non si sta registrando IVA ordinaria;
- si sta sbloccando IVA per cassa collegata a documento già registrato.

Badge tabella:
- `No`
- `Da sbloccare`
- `Parziale`
- `Sbloccata`
- `Bloccata`

Nel pannello laterale mostrare sempre:
- documento collegato;
- quota calcolata;
- IVA da rilasciare;
- periodo liquidazione.

## 13. Specifiche per F24
La UI deve usare:
- `F24 rilevato`
- `F24 da dettagliare`
- `F24 collegato`

Non usare:
- `F24 da generare`

Il primo rilascio deve:
- classificare movimento;
- chiedere dettaglio o collegamento a debito;
- non generare automaticamente adempimento F24.

## 14. Specifiche per ritenute
Per pagamento parcelle:
- mostrare ritenuta come effetto da pagamento;
- non confonderla con registrazione documento;
- evidenziare percipiente e CF;
- bloccare se CF mancante;
- predisporre futura scadenza F24 ritenute.

## 15. Specifiche per giroconti
La UI deve:
- mostrare movimento origine e movimento gemello;
- evitare doppia registrazione;
- proporre PN unica;
- bloccare se conto banca origine / destinazione manca;
- bloccare se il movimento gemello è ambiguo.

## 16. Azioni massive
Definire:
- Conferma selezionati pronti
- Abbina automaticamente proposte forti
- Rianalizza selezionati
- Assegna causale contabile
- Assegna conto contabile
- Ignora selezionati
- Sospendi selezionati
- Esporta tabella

Regola:
azioni massive non devono confermare righe blocked, duplicate, ignored o suspended.

## 17. Empty / loading / error states
Definire:
- nessun estratto caricato;
- parsing in corso;
- nessun movimento trovato;
- saldo non coerente;
- errore file;
- errore formato;
- nessun match trovato;
- tabella filtrata vuota.

## 18. Performance
Regole:
- working table virtualizzata;
- nessuna logica pesante nel render;
- filtri memoizzati;
- parsing fuori dal render;
- pannello dettaglio aggiornato solo su riga selezionata;
- supporto a migliaia di movimenti.

## 19. Responsive / spazio
Specifiche:
- layout desktop-first;
- pannello laterale collassabile;
- tabella con priorita massima;
- eventuale sidebar globale da valutare: se riduce troppo la tabella, preferire layout full-width coerente con Import Contabilita.

## 20. Differenze rispetto al mock approvato
Correzioni obbligatorie:
- causale `FF` nel pannello incasso va sostituita con causale corretta di incasso;
- `F24 da generare` va sostituito con `F24 rilevati` / `F24 da dettagliare`;
- colonna PN deve distinguere proposta / collegata / da creare;
- colonna Partitario deve mostrare informazione leggibile, non solo ID;
- IVA per cassa deve mostrare calcolo quota;
- sidebar laterale globale da valutare per non comprimere la tabella.

## 21. Roadmap UI
- R2B UI Spec
- R2C eventuale mock rivisto
- R3 parser / import base
- R4 layout statico modulo
- R5 working table dati mock
- R6 pannello laterale
- R7 matching base
- R8 integrazione canonica futura
